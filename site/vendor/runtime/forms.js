// forms.js — runtime dos formulários gerados (agentes.md §6 e §8).
// ES module, sem dependências. Funciona com qualquer HTML que siga o contrato:
// name com caminho ("residencial.cep"), data-mask, data-list, data-action,
// data-buttons, data-min/data-max e os atributos padrão (required, type, disabled...).
import {
  caretAfter, countTyped, finishInput, formatInput, fromValue, literalsKey, parseMask, toValue, validateText,
} from './masks.js';

export { utils } from './utils.js';

const MESSAGES = {
  required: 'Campo obrigatório.',
  incomplete: 'Preencha no formato {mask}.',
  date: 'Data inválida.',
  time: 'Hora inválida.',
  cpf: 'CPF inválido.',
  cnpj: 'CNPJ inválido.',
  email: 'E-mail inválido.',
  number: 'Número inválido.',
  digits: 'Use no máximo {digits} dígitos.',
  min: 'O valor mínimo é {min}.',
  max: 'O valor máximo é {max}.',
  invalid: 'Valor inválido.',
};

const TEXT = { type: 'text' };
const EMAIL = { type: 'email' };

export class Form {
  constructor(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(el instanceof HTMLFormElement)) throw new Error(`Form: formulário não encontrado (${target})`);
    this.element = el;
    this._options = { literals: options.literals ?? true, components: options.components ?? 'components/' };
    this._lists = new Map(); // nome -> [{ prefix, fn }]: o da parte mais específica vence
    this._actions = new Map(); // nome -> { fn, label }, na ordem do registro
    this._validators = [];
    this._calcs = new Map();
    this._maskTypes = new Map();
    this._messages = { ...MESSAGES };
    this._unbind = [];
    this._byElement = new WeakMap();
    this._fields = this._collect();
    this._isReady = false;
  }

  // ------------------------------------------------------------ registros

  list(name, fn) {
    this._addList(name, '', fn);
    return this;
  }

  // Cada ação vira um botão da barra [data-buttons], na ordem do registro.
  action(name, fn, { label } = {}) {
    this._actions.set(name, { fn, label: label ?? labelOf(name) });
    if (this._isReady) this._renderButtons();
    return this;
  }

  // A parte do formulário que um componente incluiu (agentes.md §8.10): nomes
  // relativos ao prefixo e sem ações. '' = o formulário inteiro.
  scope(prefix = '') {
    const p = String(prefix);
    if (p && ![...this._fields.keys()].some((n) => n.startsWith(`${p}.`))) {
      const parts = [...new Set([...this._fields.keys()].filter((n) => n.includes('.')).map((n) => n.split('.')[0]))];
      console.warn(`Form.scope: nenhum campo em "${p}". Partes deste formulário: ${parts.join(', ') || '(nenhuma)'}.`);
    }
    return new Part(this, p);
  }

  validator(target, fn) {
    checkTarget(target);
    this._warnUnknown(target, 'validator');
    this._validators.push({ target, fn });
    return this;
  }

  calcField(name, deps, fn) {
    const field = this._require(name, 'calcField');
    deps.forEach((d) => this._require(d, 'calcField'));
    const graph = new Map(this._calcs);
    graph.set(name, { deps, fn });
    const visit = (n, seen) => {
      const calc = graph.get(n);
      if (!calc) return;
      for (const d of calc.deps) {
        if (d === name) throw new Error(`Form: ciclo em campos calculados envolvendo "${name}"`);
        if (!seen.has(d)) { seen.add(d); visit(d, seen); }
      }
    };
    visit(name, new Set());
    this._calcs.set(name, { deps, fn });
    field.readOnly = true;
    return this;
  }

  maskType(mask, def) {
    const desc = parseMask(mask);
    if (!desc) throw new Error(`Form: máscara não reconhecida "${mask}"`);
    this._maskTypes.set(maskKey(desc), def);
    return this;
  }

  messages(map) {
    Object.assign(this._messages, map);
    return this;
  }

  on(event, target, fn) {
    if (typeof target === 'function') { fn = target; target = null; }
    if (target) {
      checkTarget(target);
      this._warnUnknown(target, 'on');
    }
    const handler = (e) => {
      if (target && e.detail && e.detail.field !== undefined) {
        const f = this.field(e.detail.field);
        if (!f || !this._matches(target, f)) return;
      }
      fn(e.detail, e);
    };
    return this._listen(this.element, `fm:${event}`, handler);
  }

  // ------------------------------------------------------------ ciclo de vida

  async ready() {
    if (this._isReady) return this;
    await this._loadComponents();
    this._listen(this.element, 'input', (e) => this._onInput(e));
    this._listen(this.element, 'focusout', (e) => this._onLeave(e));
    this._listen(this.element, 'change', (e) => this._onChange(e));
    this._listen(this.element, 'click', (e) => this._onClick(e));
    this._renderButtons();
    for (const f of this._fields.values()) f._last = f.value;
    this._recalcAll();
    await this.reloadList();
    this._isReady = true;
    this._emit('ready', { form: this });
    return this;
  }

  destroy() {
    this._unbind.forEach((off) => off());
    this._unbind = [];
    this._isReady = false;
  }

  // ------------------------------------------------------------ dados

  getData() {
    const data = {};
    for (const f of this._fields.values()) setPath(data, f.name, f.value);
    return data;
  }

  setData(data, { clear = true } = {}) {
    if (clear) this._clearValues();
    for (const f of this._fields.values()) {
      const v = getPath(data, f.name);
      if (v !== undefined) f._set(v);
    }
    this._settle();
    return this;
  }

  clear() {
    this._clearValues();
    this._settle();
    return this;
  }

  validate({ target = null, focus = false } = {}) {
    const fields = target ? this._match(target, 'validate') : [...this._fields.values()];
    const errors = [];
    for (const f of fields) {
      const message = this._check(f);
      f._showError(message, Boolean(message) && this._isEmpty(f));
      if (message) {
        f._touched = true;
        errors.push({ field: f.name, message });
      }
    }
    if (errors.length) {
      this._emit('invalid', { errors });
      if (focus) this.field(errors[0].field).elements[0].focus();
    }
    return { valid: errors.length === 0, errors };
  }

  showErrors(errors) {
    for (const { field, message } of errors) {
      const f = this.field(field);
      if (f) { f.error = message; f._touched = true; } else console.warn(`Form.showErrors: ${this._unknown(field)}`);
    }
    if (errors.length) this._emit('invalid', { errors });
    return this;
  }

  readOnly(flag = true) {
    this._readOnlyFields([...this._fields.values()], flag);
    return this;
  }

  async reloadList(target = null) {
    const fields = (target ? this._match(target, 'reloadList') : [...this._fields.values()])
      .filter((f) => f.kind === 'select' && f.elements[0].dataset.list);
    await Promise.all(fields.map((f) => this._loadList(f)));
  }

  field(name) {
    return this._fields.get(name) || null;
  }

  fields(target = null) {
    return target ? this._match(target, 'fields') : [...this._fields.values()];
  }

  // ------------------------------------------------------------ interno

  // JS dos componentes (agentes.md §8.10): cada <fieldset data-component="nome"> é a
  // seção de um componente. Importa <components>/<nome>.js (relativo à página) e chama
  // o export default com a parte da seção, na ordem do documento (de fora para dentro).
  // Opção components: outra pasta, uma função nome -> módulo, ou false (ninguém é chamado).
  async _loadComponents() {
    const opt = this._options.components;
    const sections = opt === false ? [] : [...this.element.querySelectorAll('fieldset[data-component]')];
    if (!sections.length) return;
    const load = typeof opt === 'function' ? opt : (name) => import(new URL(`${opt}${name}.js`, document.baseURI).href);
    const fail = (error) => {
      console.error(error);
      this._emit('error', { error, source: 'component' });
    };
    const names = [...new Set(sections.map((s) => s.dataset.component))];
    const modules = new Map(await Promise.all(names.map(async (name) => {
      try {
        return [name, await load(name)];
      } catch (error) {
        fail(new Error(`Form: não foi possível carregar o JS do componente "${name}": ${error?.message ?? error}`, { cause: error }));
        return [name, null];
      }
    })));
    for (const section of sections) {
      const name = section.dataset.component;
      const mod = modules.get(name);
      const fn = typeof mod === 'function' ? mod : mod?.default;
      if (!mod) continue;
      if (typeof fn !== 'function') {
        fail(new Error(`Form: o JS do componente "${name}" deve exportar a função: export default function (parte) { … }`));
        continue;
      }
      try {
        fn(this.scope(sectionPath(section, this.element)));
      } catch (error) {
        fail(error);
      }
    }
  }

  _addList(name, prefix, fn) {
    const providers = (this._lists.get(name) ?? []).filter((p) => p.prefix !== prefix);
    this._lists.set(name, [...providers, { prefix, fn }]);
  }

  // A barra [data-buttons] é do runtime: com ações registradas, um botão por ação
  // (a primeira é a principal); sem nenhuma, fica como veio no HTML ("Enviar").
  _renderButtons() {
    const bar = this.element.querySelector('[data-buttons]');
    if (!bar || !this._actions.size) return;
    bar.replaceChildren(...[...this._actions].map(([name, { label }], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === 0 ? 'btn btn-primary' : 'btn btn-outline-secondary';
      b.dataset.action = name;
      b.textContent = label;
      return b;
    }));
  }

  _readOnlyFields(fields, flag) {
    for (const f of fields) {
      if (!flag && this._calcs.has(f.name)) continue;
      f.readOnly = flag;
    }
  }

  _collect() {
    const groups = new Map();
    for (const el of this.element.elements) {
      if (!el.name || el.tagName === 'FIELDSET' || el.tagName === 'BUTTON' || el.tagName === 'OUTPUT') continue;
      if (['button', 'submit', 'reset', 'image'].includes(el.type)) continue;
      if (!groups.has(el.name)) groups.set(el.name, []);
      groups.get(el.name).push(el);
    }
    const fields = new Map();
    for (const [name, els] of groups) {
      const f = new Field(this, name, els);
      fields.set(name, f);
      els.forEach((el) => this._byElement.set(el, f));
    }
    return fields;
  }

  _require(name, where) {
    const f = this.field(name);
    if (!f) throw new Error(`Form.${where}: ${this._unknown(name)}`);
    return f;
  }

  // 'campo "idade" não existe. Use o nome completo, com as seções: "dados.idade".'
  // Sem nome parecido, lista os campos do formulário.
  _unknown(name) {
    const names = [...this._fields.keys()];
    const last = String(name).split('.').pop();
    const close = names.filter((n) => n.split('.').pop() === last);
    if (close.length) {
      return `campo "${name}" não existe. Use o nome completo, com as seções: ${close.map((n) => `"${n}"`).join(' ou ')}.`;
    }
    const shown = names.length > 12 ? `${names.slice(0, 12).join(', ')}, …` : names.join(', ');
    return `campo "${name}" não existe. Os nomes são o caminho completo; campos deste formulário: ${shown || '(nenhum)'}.`;
  }

  // Alvo { name } com nome inexistente não falha (não acharia nada): avisa.
  _warnUnknown(target, where) {
    if (target.name === undefined) return;
    for (const n of [].concat(target.name)) if (!this.field(n)) console.warn(`Form.${where}: ${this._unknown(n)}`);
  }

  _listen(target, type, fn) {
    target.addEventListener(type, fn);
    const off = () => target.removeEventListener(type, fn);
    this._unbind.push(off);
    return off;
  }

  _emit(name, detail, cancelable = false) {
    const ev = new CustomEvent(`fm:${name}`, { detail, cancelable, bubbles: true });
    this.element.dispatchEvent(ev);
    return ev;
  }

  _match(target, where) {
    checkTarget(target);
    this._warnUnknown(target, where);
    if (target.name !== undefined) {
      return [].concat(target.name).map((n) => this.field(n)).filter(Boolean);
    }
    return [...this._fields.values()].filter((f) => this._matches(target, f));
  }

  // Alvos internos de uma parte: { within } (todos os campos dela) e { selector, within }.
  _matches(target, f) {
    if (target.name !== undefined) return [].concat(target.name).includes(f.name);
    if (target.within && !f.name.startsWith(`${target.within}.`)) return false;
    if (target.selector === undefined) return true;
    return f.elements.some((el) => el.matches(target.selector)) || f.element.matches(target.selector);
  }

  _literalsFor(desc) {
    const custom = this._maskTypes.get(maskKey(desc));
    if (custom && custom.literals !== undefined) return custom.literals;
    const opt = this._options.literals;
    if (typeof opt === 'boolean') return opt;
    return opt[literalsKey(desc)] ?? true;
  }

  _msg(key, params = {}) {
    return (this._messages[key] || this._messages.invalid).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
  }

  // Campo de texto vale pelo que está digitado: data incompleta não é vazio.
  _isEmpty(f) {
    if (f.kind === 'input') return !f.elements[0].value.trim();
    const value = f.value;
    return value === null || value === false;
  }

  // Mensagem do primeiro erro do campo, ou null.
  _check(f) {
    const value = f.value;
    if (this._isEmpty(f)) return f.required ? this._msg('required') : null;

    let data;
    const ctx = { form: this, field: f, get data() { return data || (data = this.form.getData()); } };
    const run = (fn) => {
      try {
        const r = fn(value, ctx);
        return r === true || r === undefined ? null : (typeof r === 'string' ? r : this._msg('invalid'));
      } catch (error) {
        this._emit('error', { error, source: 'validator' });
        return this._msg('invalid');
      }
    };

    if (f.kind === 'input') {
      const desc = f.desc;
      const builtin = validateText(desc, f.elements[0].value, { min: f.min, max: f.max });
      if (builtin) return this._msg(builtin.key, builtin.params);
      const custom = desc.mask && this._maskTypes.get(maskKey(desc));
      if (custom && custom.validate) {
        const m = run(custom.validate);
        if (m) return m;
      }
    }
    for (const v of this._validators) {
      if (!this._matches(v.target, f)) continue;
      const m = run(v.fn);
      if (m) return m;
    }
    return null;
  }

  // Validação durante a edição. O obrigatório só é cobrado por validate():
  // campo vazio não ganha erro, mas mantém o "obrigatório" que validate() mostrou.
  _live(f) {
    if (!this._isEmpty(f)) f._showError(this._check(f));
    else if (!f._missing) f._showError(null);
  }

  _changed(f) {
    const value = f.value;
    const old = f._last;
    if (JSON.stringify(value) === JSON.stringify(old)) return;
    f._last = value;
    this._emit('change', { field: f.name, value, old });
    for (const [name, calc] of this._calcs) if (calc.deps.includes(f.name)) this._recalc(name);
  }

  _recalc(name) {
    const calc = this._calcs.get(name);
    const f = this.field(name);
    let v;
    try {
      v = calc.fn(...calc.deps.map((d) => this.field(d).value));
    } catch (error) {
      this._emit('error', { error, source: 'calc' });
      return;
    }
    f._set(v ?? null);
    this._changed(f);
  }

  _recalcAll() {
    const done = new Set();
    const visit = (name) => {
      if (done.has(name)) return;
      done.add(name);
      this._calcs.get(name).deps.forEach((d) => this._calcs.has(d) && visit(d));
      this._recalc(name);
    };
    [...this._calcs.keys()].forEach(visit);
  }

  _clearValues(fields = [...this._fields.values()]) {
    for (const f of fields) {
      f._set(null);
      f._touched = false;
    }
  }

  // Depois de setData/clear: limpa erros, avisa mudanças e recalcula.
  _settle(fields = [...this._fields.values()]) {
    for (const f of fields) f._showError(null);
    for (const f of fields) this._changed(f);
    this._recalcAll();
  }

  async _loadList(f) {
    const name = f.elements[0].dataset.list;
    const fn = (this._lists.get(name) ?? [])
      .filter((p) => !p.prefix || f.name.startsWith(`${p.prefix}.`))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.fn;
    if (!fn) return;
    let items;
    try {
      items = await fn({ form: this, field: f, data: this.getData() });
    } catch (error) {
      this._emit('error', { error, source: 'list' });
      return;
    }
    if (items != null && !Array.isArray(items)) {
      const got = items?.constructor?.name ?? typeof items;
      const hint = typeof Response !== 'undefined' && items instanceof Response ? '; faltou .json()?' : '';
      const error = new Error(`Form.list: o provedor da lista "${name}" deve devolver um array (recebeu ${got}${hint})`);
      this._emit('error', { error, source: 'list' });
      return;
    }
    const select = f.elements[0];
    const want = f._pending ?? select.value;
    for (const opt of [...select.options]) if (opt.value !== '') opt.remove();
    for (const item of items || []) {
      const o = typeof item === 'object' && item !== null ? item : { value: item, label: item };
      select.add(new Option(String(o.label ?? o.value), String(o.value)));
    }
    if ([...select.options].some((o) => o.value === want && want !== '')) {
      select.value = want;
      f._pending = null;
    } else {
      select.value = '';
    }
    if (this._isReady) this._changed(f);
    else f._last = f.value;
  }

  _onInput(e) {
    const f = this._byElement.get(e.target);
    if (!f) return;
    if (f.kind === 'input') {
      const desc = f.desc;
      if (desc.type !== 'text' && desc.type !== 'email') {
        const el = e.target;
        const old = el.value;
        const caret = el.selectionStart ?? old.length;
        const next = formatInput(desc, old);
        if (next !== old) {
          el.value = next;
          const pos = desc.type === 'money' ? next.length : caretAfter(desc, next, countTyped(old.slice(0, caret)));
          if (document.activeElement === el) el.setSelectionRange(pos, pos);
        }
      }
    }
    if (f._touched) this._live(f);
  }

  _onLeave(e) {
    const f = this._byElement.get(e.target);
    if (!f || f.kind !== 'input') return;
    const el = e.target;
    const desc = f.desc;
    if (desc.type !== 'text' && desc.type !== 'email') {
      const done = finishInput(desc, el.value);
      if (done !== el.value) el.value = done;
    }
    if (el.value.trim() || f._touched) {
      f._touched = true;
      this._live(f);
    }
    this._changed(f);
  }

  _onChange(e) {
    const f = this._byElement.get(e.target);
    if (!f) return;
    if (f.kind === 'select') f._pending = null;
    if (f.kind !== 'input') {
      f._touched = true;
      this._live(f);
    }
    this._changed(f);
  }

  async _onClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button || !this.element.contains(button)) return;
    const action = button.dataset.action;
    const data = this.getData();
    if (this._emit('action', { action, data }, true).defaultPrevented) return;
    const fn = this._actions.get(action)?.fn;
    if (!fn) {
      const error = new Error(`Form: ação "${action}" sem callback registrado`);
      console.warn(error.message);
      this._emit('error', { error, source: 'action' });
      return;
    }
    const buttons = [...this.element.querySelectorAll('button[data-action]')];
    const was = buttons.map((b) => b.disabled);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const result = await fn({ form: this, data, button });
      if (result && Array.isArray(result.errors)) this.showErrors(result.errors);
    } catch (error) {
      this._emit('error', { error, source: 'action' });
    } finally {
      buttons.forEach((b, i) => { b.disabled = was[i]; });
    }
  }
}

// ---------------------------------------------------------------- Part

// O que o JS de um componente recebe: form.scope('residencial'). Os nomes dos alvos,
// field(), calcField() e setData() são relativos à parte ({ name: 'cep' } é
// "residencial.cep"); { selector } e as listas valem só dentro dela. Não registra
// ações: os botões são da página.
export class Part {
  constructor(form, prefix) {
    this._form = form;
    this.prefix = prefix;
  }

  list(name, fn) {
    this._form._addList(name, this.prefix, fn);
    return this;
  }

  validator(target, fn) {
    this._form.validator(this._target(target), fn);
    return this;
  }

  calcField(name, deps, fn) {
    this._form.calcField(this._full(name), deps.map((d) => this._full(d)), fn);
    return this;
  }

  maskType(mask, def) {
    this._form.maskType(mask, def);
    return this;
  }

  on(event, target, fn) {
    if (typeof target === 'function') { fn = target; target = null; }
    return this._form.on(event, this._target(target), fn);
  }

  field(name) { return this._form.field(this._full(name)); }
  fields(target = null) { return this._form.fields(this._target(target)); }
  reloadList(target = null) { return this._form.reloadList(this._target(target)); }

  validate({ target = null, focus = false } = {}) {
    return this._form.validate({ target: this._target(target), focus });
  }

  // O objeto da parte no JSON (o que estaria em data.residencial).
  getData() {
    const data = this._form.getData();
    return this.prefix ? getPath(data, this.prefix) ?? {} : data;
  }

  setData(data, { clear = true } = {}) {
    const fields = this.fields();
    if (clear) this._form._clearValues(fields);
    for (const f of fields) {
      const v = getPath(data, this._relative(f.name));
      if (v !== undefined) f._set(v);
    }
    this._form._settle(fields);
    return this;
  }

  clear() {
    const fields = this.fields();
    this._form._clearValues(fields);
    this._form._settle(fields);
    return this;
  }

  readOnly(flag = true) {
    this._form._readOnlyFields(this.fields(), flag);
    return this;
  }

  scope(name) { return this._form.scope(this._full(name)); }

  _full(name) { return this.prefix ? `${this.prefix}.${name}` : name; }
  _relative(name) { return this.prefix ? name.slice(this.prefix.length + 1) : name; }

  // Alvo do usuário -> alvo do Form; sem alvo, todos os campos da parte.
  _target(target) {
    if (!target) return { within: this.prefix };
    checkTarget(target);
    if (target.name !== undefined) {
      return { name: Array.isArray(target.name) ? target.name.map((n) => this._full(n)) : this._full(target.name) };
    }
    return { selector: target.selector, within: this.prefix };
  }
}

// ---------------------------------------------------------------- Field

export class Field {
  constructor(form, name, elements) {
    this.form = form;
    this.name = name;
    this.elements = elements;
    const first = elements[0];
    if (first.type === 'radio') this.kind = 'radio';
    else if (first.type === 'checkbox') this.kind = elements.some((el) => el.hasAttribute('value')) ? 'checks' : 'check';
    else if (first.tagName === 'SELECT') this.kind = 'select';
    else this.kind = 'input';
    this._enabled = !first.disabled;
    this._readOnly = this.kind === 'input' ? first.readOnly : false;
    this._pending = null;
    this._touched = false;
    this._missing = false; // erro atual é o "obrigatório" de validate()
    this._last = undefined;
  }

  // Elemento que representa o campo: o próprio controle ou o fieldset do grupo.
  get element() {
    const first = this.elements[0];
    if (this.kind === 'radio' || this.kind === 'checks') return first.closest('fieldset') || first;
    return first;
  }

  get desc() {
    const el = this.elements[0];
    const desc = parseMask(el.dataset.mask);
    if (desc) return desc;
    return el.type === 'email' ? EMAIL : TEXT;
  }

  get mask() { return this.elements[0].dataset.mask ?? null; }
  set mask(m) {
    if (m) this.elements[0].dataset.mask = m;
    else delete this.elements[0].dataset.mask;
    this._set(this.value);
  }

  get value() {
    const el = this.elements[0];
    switch (this.kind) {
      case 'radio': {
        const on = this.elements.find((e) => e.checked);
        return on ? on.value : null;
      }
      case 'checks': {
        const on = this.elements.filter((e) => e.checked).map((e) => e.value);
        return on.length ? on : null;
      }
      case 'check':
        return el.checked;
      case 'select':
        if (this._pending !== null) return this._pending;
        if (el.multiple) {
          const on = [...el.selectedOptions].map((o) => o.value);
          return on.length ? on : null;
        }
        return el.value || null;
      default: {
        const desc = this.desc;
        return toValue(desc, el.value, this.form._literalsFor(desc));
      }
    }
  }

  set value(v) {
    this._set(v);
    if (this._touched) this.form._live(this);
    this.form._changed(this);
  }

  // Define o valor sem disparar eventos.
  _set(v) {
    const el = this.elements[0];
    switch (this.kind) {
      case 'radio':
        this.elements.forEach((e) => { e.checked = v !== null && v !== undefined && e.value === String(v); });
        break;
      case 'checks': {
        const on = new Set([].concat(v ?? []).map(String));
        this.elements.forEach((e) => { e.checked = on.has(e.value); });
        break;
      }
      case 'check':
        el.checked = Boolean(v);
        break;
      case 'select': {
        if (el.multiple) {
          const on = new Set([].concat(v ?? []).map(String));
          [...el.options].forEach((o) => { o.selected = on.has(o.value); });
          break;
        }
        const s = v === null || v === undefined ? '' : String(v);
        if (!s || [...el.options].some((o) => o.value === s)) {
          el.value = s;
          this._pending = null;
        } else {
          el.value = '';
          this._pending = s;
        }
        break;
      }
      default:
        el.value = fromValue(this.desc, v);
    }
  }

  get text() {
    if (this.kind === 'input') return this.elements[0].value;
    if (this.kind === 'select') return this.elements[0].selectedOptions[0]?.text ?? '';
    const v = this.value;
    return v === null ? '' : [].concat(v).join(', ');
  }

  get required() { return this.elements.some((e) => e.required); }
  set required(flag) { this.elements.forEach((e) => { e.required = Boolean(flag); }); }

  get enabled() { return this._enabled; }
  set enabled(flag) { this._enabled = Boolean(flag); this._apply(); }

  get readOnly() { return this._readOnly; }
  set readOnly(flag) { this._readOnly = Boolean(flag); this._apply(); }

  _apply() {
    for (const el of this.elements) {
      if (this.kind === 'input') {
        el.disabled = !this._enabled;
        el.readOnly = this._readOnly;
      } else {
        el.disabled = !this._enabled || this._readOnly;
      }
    }
  }

  get visible() { return !this._wrapper().hidden; }
  set visible(flag) { this._wrapper().hidden = !flag; }

  _wrapper() {
    if (this.kind === 'radio' || this.kind === 'checks') return this.element;
    const el = this.elements[0];
    return el.closest('[class*="col-"]') || el.closest('.form-check') || el.parentElement;
  }

  get min() { return numberAttr(this.elements[0], 'min'); }
  set min(v) { setNumberAttr(this.elements[0], 'min', v); }
  get max() { return numberAttr(this.elements[0], 'max'); }
  set max(v) { setNumberAttr(this.elements[0], 'max', v); }

  get error() { return this._feedback(false)?.textContent || ''; }
  set error(message) { this._showError(message || null); }

  _showError(message, missing = false) {
    this._missing = missing;
    for (const el of this.elements) {
      el.classList.toggle('is-invalid', Boolean(message));
      if (message) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    const fb = this._feedback(Boolean(message));
    if (fb) {
      fb.textContent = message || '';
      fb.classList.toggle('d-block', Boolean(message));
    }
  }

  // Elemento da mensagem de erro (div.invalid-feedback), criado quando preciso.
  _feedback(create) {
    const id = `${this.name.replace(/\./g, '-')}-error`;
    let fb = this.form.element.querySelector(`#${CSS.escape(id)}`);
    if (fb || !create) return fb;
    fb = document.createElement('div');
    fb.className = 'invalid-feedback';
    fb.id = id;
    const first = this.elements[0];
    if (this.kind === 'radio' || this.kind === 'checks') {
      this.element.append(fb);
    } else if (this.kind === 'check') {
      (first.closest('.form-check') || first.parentElement).append(fb);
    } else if (first.parentElement.classList.contains('input-group')) {
      first.parentElement.classList.add('has-validation');
      first.parentElement.append(fb);
    } else {
      first.after(fb);
    }
    for (const el of this.elements) {
      const ids = new Set((el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(id);
      el.setAttribute('aria-describedby', [...ids].join(' '));
    }
    return fb;
  }
}

// ---------------------------------------------------------------- utilitários

function checkTarget(target) {
  const ok = target && typeof target === 'object'
    && ((target.name !== undefined && target.selector === undefined && target.within === undefined)
      || (target.name === undefined && (typeof target.selector === 'string' || typeof target.within === 'string')));
  if (!ok) throw new TypeError('Form: o alvo deve ser { name } ou { selector }');
}

// Caminho de uma seção: os name dos <fieldset> dela e dos de fora, até o <form>.
function sectionPath(section, form) {
  const names = [];
  for (let el = section; el && form.contains(el); el = el.parentElement?.closest('fieldset')) {
    if (el.getAttribute('name')) names.unshift(el.getAttribute('name'));
  }
  return names.join('.');
}

// "enviar" -> "Enviar"; "gravar_rascunho" / "gravarRascunho" -> "Gravar rascunho".
function labelOf(name) {
  const words = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function maskKey(desc) {
  return desc.pattern || desc.mask;
}

function numberAttr(el, key) {
  const raw = el.dataset[key];
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setNumberAttr(el, key, v) {
  if (v === null || v === undefined) delete el.dataset[key];
  else el.dataset[key] = String(v);
}

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getPath(obj, path) {
  let cur = obj;
  for (const p of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}
