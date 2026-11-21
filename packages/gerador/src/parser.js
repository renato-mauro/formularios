// Texto .form -> AST (agentes.md §3 e §9).
import { parseMask } from '@formularios/runtime/masks';
import { distribute } from './layout.js';
import { slug } from './slug.js';

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Nome de arquivo de formulário (sem .form): o de um componente em "+componente".
export const FILE_NAME = /^[\w-]+$/;
// Lista sem {N}: entra na divisão proporcional com este peso (como 8 `_`). Qualquer
// especificador com {N} logo depois (____{6}, 999.999.999-99{4}) fica com N colunas.
const LIST_WEIGHT = 8;
const MAX_LEVEL = 3;

const RADIO_LINE = /^\((.*?)\)\s+(.+)$/;
const MULTI_LINE = /^\[(?!\[)([^\]]*)\]\s+(.+)$/;
const LONGTEXT_LINE = /^_+$/;
const MASK_CHUNK = /^[09A*().\/\-:,+#]+/;

// opções:
//   name        nome do formulário: o do arquivo (clientes.form -> "clientes"); é o id
//               do <form> e o nome do JS. Sem ele, o slug do título.
//   components  os componentes que "+nome" pode incluir: { nome: texto .form },
//               um Map ou uma função nome -> texto (undefined = não existe).
//   component   true quando o texto é um componente (agentes.md §3.12): não tem
//               título; o título e o nome vêm da seção que o inclui.
export function parse(text, options = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const errors = [];
  const warnings = [];
  const fail = (message, line, column = 1, excerpt = '') => errors.push({ message, line, column, excerpt });

  const form = {
    type: 'form', kind: options.component ? 'component' : 'page', level: 1, title: null, name: null, children: [],
  };
  const stack = [form];
  let section = null; // seção-campo aberta: opções ou texto longo
  let including = null; // seção de componente esperando a linha "+componente"

  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1;
    const raw = lines[n].replace(/\s+$/, '');
    const line = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    if (!line) continue;

    if (form.title === null && !options.component) {
      const m = /^-(?!-)\s*(.*)$/.exec(line);
      if (!m || !m[1].trim()) {
        fail('o formulário deve começar com o título: "-Título"', lineNo, indent + 1, line);
        return { ast: form, errors, warnings };
      }
      const named = parseNamed(m[1]);
      if (named.error) fail(named.error, lineNo, indent + 1, line);
      if (named.name !== null) {
        fail(`o nome do formulário é o do arquivo; tire o "{${named.name}}" do título`, lineNo, indent + 1, line);
      }
      form.title = named.text;
      form.source = { line: lineNo, column: indent + 1 };
      continue;
    }

    // Conteúdo de uma seção-campo aberta.
    if (section && addToSection(section, line, lineNo)) continue;
    section = null;

    const header = /^(-+)\s*(.*)$/.exec(line);
    if (header) {
      const level = header[1].length;
      const named = parseNamed(header[2]);
      if (named.error) fail(named.error, lineNo, indent + 1, line);
      if (!named.text) { fail('título de seção vazio', lineNo, indent + 1, line); continue; }
      if (level === 1) {
        fail(options.component
          ? 'componente não tem título: o título é o da seção que o inclui ("--Título{nome}" e, embaixo, "+componente")'
          : 'só pode haver um título de formulário ("-")', lineNo, indent + 1, line);
        continue;
      }
      if (level > MAX_LEVEL) { fail(`no máximo ${MAX_LEVEL} níveis ("---")`, lineNo, indent + 1, line); continue; }
      while (stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent.level !== level - 1) {
        const last = parent.children.at(-1);
        fail(last?.component && last.level === level - 1
          ? `a seção "${last.title}" é de um componente: não recebe subseções nem outras linhas`
          : `nível pulado: "${header[1]}" sem uma seção de nível ${level - 1} aberta`, lineNo, indent + 1, line);
        continue;
      }
      const kind = sectionKind(lines, n + 1);
      const base = {
        level, title: named.text, explicitName: named.name, required: named.required,
        source: { line: lineNo, column: indent + 1 },
      };
      if (kind === 'group' || kind === 'include') {
        if (named.required) {
          const message = kind === 'group' ? '"*" em seção comum é ignorado' : '"*" na seção de um componente é ignorado: valem os obrigatórios do componente';
          warnings.push({ message, line: lineNo, column: indent + 1, excerpt: line });
        }
        const group = { type: 'group', ...base, children: [] };
        parent.children.push(group);
        // A seção de um componente é fechada, como a de opções: o que vem depois volta ao pai.
        if (kind === 'group') stack.push(group);
        else including = group;
      } else {
        section = kind === 'longtext'
          ? { type: 'longtext', ...base, rows: 0 }
          : { type: 'options', multiple: kind === 'multiple', ...base, options: [] };
        parent.children.push(section);
      }
      continue;
    }

    const container = stack[stack.length - 1];

    // Inclusão de componente: sozinha na seção logo acima, que dá o título e o nome.
    if (line.startsWith('+')) {
      const target = including;
      including = null;
      const inc = parseInclude(line.slice(1));
      if (inc.error) fail(inc.error, lineNo, indent + 1, line);
      else if (!target) fail('o componente fica sozinho numa seção: "--Título{nome}" na linha de cima e "+componente" embaixo', lineNo, indent + 1, line);
      else Object.assign(target, { component: inc.component, includeSource: { line: lineNo, column: indent + 1 } });
      continue;
    }

    if (line.startsWith('[[')) {
      fail('botões não ficam no .form: cada form.action() do JS da página vira um botão (sem nenhuma, a página tem só "Enviar")', lineNo, indent + 1, line);
      continue;
    }

    if (RADIO_LINE.test(line) && !line.includes(':')) {
      fail('opção "( )" fora de uma seção de opções', lineNo, indent + 1, line);
      continue;
    }
    const multi = MULTI_LINE.exec(line);
    if (multi && multi[1].trim()) {
      fail('opção "[valor]" fora de uma seção de opções', lineNo, indent + 1, line);
      continue;
    }
    if (LONGTEXT_LINE.test(line)) {
      fail('linha de texto longo fora de uma seção de texto longo', lineNo, indent + 1, line);
      continue;
    }

    const row = parseFieldLine(raw, lineNo, fail);
    if (row.fields.length) container.children.push(row);
  }

  if (form.title === null && !options.component) {
    fail('arquivo vazio: o formulário deve começar com o título "-Título"', 1);
    return { ast: form, errors, warnings };
  }
  if (options.component && !form.children.length && !errors.length) fail('componente vazio: escreva os campos dele', 1);

  form.name = options.name || (form.title && slug(form.title)) || (options.component ? 'componente' : 'formulario');
  includeComponents(form, options, errors);
  assignNames(form, fail, warnings);
  return { ast: form, errors, warnings };
}

// "+endereco" -> { component }
function parseInclude(raw) {
  const component = raw.trim();
  if (FILE_NAME.test(component)) return { component };
  if (!component) return { error: 'falta o componente: "+componente"' };
  if (/[:{*]/.test(component)) return { error: 'a inclusão é só "+componente": o título e o nome ficam na seção de cima ("--Título{nome}")' };
  return { error: `nome de componente inválido "${component}": use letras, números, "_" e "-"` };
}

const INCLUDE_LINE = /^([ \t]*\+[ \t]*)([\w-]+)([ \t]*)$/gm;

// Componentes que o texto inclui diretamente ("+endereco").
export function includesOf(text) {
  return [...new Set([...String(text).matchAll(INCLUDE_LINE)].map((m) => m[2]))];
}

// Troca o componente das linhas "+de" por "para" (ao renomear o componente).
export function renameInclude(text, from, to) {
  return String(text).replace(INCLUDE_LINE, (line, head, name, tail) => (name === from ? `${head}${to}${tail}` : line));
}

// Expande cada "+componente": lê e gera o componente (com os componentes dele) e
// pendura uma cópia dos filhos na seção. Erro no componente vira um erro na linha
// da inclusão, com a causa (o primeiro erro, no arquivo do componente).
function includeComponents(form, options, errors) {
  const lookup = componentLookup(options.components);
  const stack = options.stack ?? (options.component ? [form.name] : []);
  const cache = options.cache ?? new Map();
  const visit = (children) => {
    for (const node of children) {
      if (node.type !== 'group') continue;
      if (!node.component) { visit(node.children); continue; }
      const { component } = node;
      const source = node.includeSource;
      delete node.includeSource;
      const at = (message, cause = null) => errors.push({ message, line: source.line, column: source.column, excerpt: '', cause });
      if (stack.includes(component)) { at(`inclusão circular: ${[...stack, component].join(' → ')}`); continue; }
      const text = lookup(component);
      if (text === undefined || text === null) { at(`componente "${component}" não existe`); continue; }
      if (!cache.has(component)) {
        cache.set(component, parse(text, { ...options, name: component, component: true, stack: [...stack, component], cache }));
      }
      const sub = cache.get(component);
      if (sub.errors.length) {
        const e = sub.errors[0];
        at(`componente "${component}" com erro — ${component}.form:${e.line}:${e.column}: ${e.message}`,
          e.cause ?? { component, line: e.line, column: e.column });
        continue;
      }
      node.children = structuredClone(sub.ast.children);
    }
  };
  visit(form.children);
}

function componentLookup(components) {
  if (!components) return () => undefined;
  if (typeof components === 'function') return components;
  if (components instanceof Map) return (name) => components.get(name);
  return (name) => (Object.hasOwn(components, name) ? components[name] : undefined);
}

// "Texto{nome}*" ou "Texto*{nome}" -> { text, name, required }
export function parseNamed(raw) {
  let s = raw.trim();
  let name = null;
  let required = false;
  let error = null;
  for (;;) {
    const m = /\{([^{}]*)\}$/.exec(s);
    if (m) {
      name = m[1].trim();
      if (!NAME.test(name)) error = `nome inválido "{${m[1]}}": use letras, números e "_"`;
      s = s.slice(0, m.index).trimEnd();
      continue;
    }
    if (s.endsWith('*')) { required = true; s = s.slice(0, -1).trimEnd(); continue; }
    break;
  }
  return { text: s, name, required, error };
}

function sectionKind(lines, from) {
  for (let i = from; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith('+')) return 'include';
    if (RADIO_LINE.test(l) && !l.includes(':')) return 'radio';
    if (MULTI_LINE.test(l)) return 'multiple';
    if (LONGTEXT_LINE.test(l)) return 'longtext';
    return 'group';
  }
  return 'group';
}

function addToSection(section, line, lineNo) {
  if (section.type === 'longtext') {
    if (!LONGTEXT_LINE.test(line)) return false;
    section.rows++;
    return true;
  }
  const m = (section.multiple ? MULTI_LINE : RADIO_LINE).exec(line);
  if (!m || (!section.multiple && line.includes(':'))) return false;
  const label = m[2].trim();
  // "[ ] Texto{nome}" ou "[ ] Texto*" é uma caixa de marcação isolada, não uma opção.
  if (section.multiple && !m[1].trim() && /(\{[^{}]*\}|\*)$/.test(label)) return false;
  section.options.push({ value: m[1].trim() || label, label, source: { line: lineNo } });
  return true;
}

function parseFieldLine(raw, lineNo, fail) {
  const fields = [];
  let pos = 0;
  const skip = () => { while (pos < raw.length && /\s/.test(raw[pos])) pos++; };

  for (skip(); pos < raw.length; skip()) {
    const column = pos + 1;
    const check = /^\[\s?\]\s+/.exec(raw.slice(pos));
    if (check) {
      const start = pos + check[0].length;
      const gap = /\s{2,}/.exec(raw.slice(start));
      const end = gap ? start + gap.index : raw.length;
      const named = parseNamed(raw.slice(start, end));
      if (named.error) fail(named.error, lineNo, column, raw.slice(pos, end));
      if (!named.text) fail('caixa de marcação sem texto', lineNo, column, raw.slice(pos, end));
      fields.push({
        type: 'check', label: named.text, explicitName: named.name, required: named.required,
        weight: named.text.length + 4, source: { line: lineNo, column },
      });
      pos = end;
      continue;
    }

    const colon = raw.indexOf(':', pos);
    if (colon < 0) {
      fail('esperado "Rótulo: especificador"', lineNo, column, raw.slice(pos).trim());
      break;
    }
    const named = parseNamed(raw.slice(pos, colon));
    if (named.error) fail(named.error, lineNo, column, raw.slice(pos, colon + 1));
    if (!/\p{L}/u.test(named.text)) {
      fail('rótulo deve conter ao menos uma letra', lineNo, column, raw.slice(pos, colon + 1));
      break;
    }
    pos = colon + 1;
    skip();
    const specColumn = pos + 1;
    const spec = matchSpec(raw, pos);
    if (spec.error) {
      fail(spec.error, lineNo, specColumn, raw.slice(pos).split(/\s+/)[0]);
      break;
    }
    fields.push({
      ...spec.field, label: named.text, explicitName: named.name, required: named.required,
      source: { line: lineNo, column },
    });
    pos = spec.end;
  }

  const row = { type: 'row', fields, source: { line: lineNo, column: 1 } };
  if (fields.length) {
    const result = distribute(fields.map((f) => ({ weight: f.weight, fixed: f.fixedCols || null })));
    if (result.error) fail(result.error, lineNo, 1, raw.trim());
    else fields.forEach((f, i) => { f.cols = result.cols[i]; });
  }
  return row;
}

// Reconhece o especificador que começa em `pos` (agentes.md §3.6).
function matchSpec(raw, pos) {
  const rest = raw.slice(pos);
  // Fim do especificador: espaço, fim da linha ou a largura {N}.
  const atBoundary = (len) => len === rest.length || /[\s{]/.test(rest[len]);
  const unknown = () => ({ error: `especificador não reconhecido "${rest.split(/\s+/)[0]}"` });
  // {N} logo depois do especificador: largura fixa de N colunas (fora da divisão por peso).
  const ok = (len, field) => {
    const width = /^\{(\d+)\}/.exec(rest.slice(len));
    if (width) {
      const cols = Number(width[1]);
      if (cols < 1 || cols > 12) return { error: `largura inválida {${width[1]}}: use de 1 a 12 colunas` };
      field = { ...field, fixedCols: cols, weight: 0 };
      len += width[0].length;
    }
    return len === rest.length || /\s/.test(rest[len]) ? { end: pos + len, field } : unknown();
  };

  if (!rest) return { error: 'falta o especificador depois de ":"' };

  // Nome da lista: letras, números, _ e - (como os arquivos: @estado-civil -> estado-civil.json).
  let m = /^@([A-Za-z_](?:[\w-]*\w)?)/.exec(rest);
  if (m) return ok(m[0].length, { type: 'list', list: m[1], weight: LIST_WEIGHT });
  if ((m = /^R\$\s*(_+)/.exec(rest))) {
    return ok(m[0].length, { type: 'money', mask: 'R$', weight: m[1].length });
  }
  if ((m = /^email_*/i.exec(rest))) {
    return ok(m[0].length, { type: 'email', weight: m[0].length });
  }
  for (const token of ['dd/mm/aaaa', 'hh:mm']) {
    if (rest.startsWith(token)) {
      const desc = parseMask(token);
      return ok(token.length, { type: desc.type, mask: token, weight: token.length });
    }
  }
  if ((m = /^_+/.exec(rest))) {
    return ok(m[0].length, { type: 'text', weight: m[0].length });
  }

  // Máscara: blocos de caracteres de máscara separados por um espaço.
  const chunks = [];
  let at = 0;
  for (;;) {
    const c = MASK_CHUNK.exec(rest.slice(at));
    if (!c) break;
    chunks.push(at + c[0].length);
    at += c[0].length;
    if (rest[at] === ' ' && MASK_CHUNK.test(rest.slice(at + 1))) at++;
    else break;
  }
  for (let k = chunks.length - 1; k >= 0; k--) {
    const len = chunks[k];
    if (!atBoundary(len)) continue;
    const text = rest.slice(0, len);
    const desc = parseMask(text);
    if (desc) return ok(len, { type: desc.type, mask: text, weight: text.length });
    if (/^[09]+$/.test(text)) return { error: `máscara "${text}" mistura 0 e 9` };
  }
  return unknown();
}

// Nomes, caminhos e ids (agentes.md §3.3 e §5.1). Os filhos de uma inclusão já têm
// nomes (do componente): ganham o caminho da inclusão na frente e descem de nível.
function assignNames(form, fail, warnings) {
  const adopt = (group) => {
    const shift = group.level - 1;
    const walk = (children) => {
      for (const node of children) {
        const nodes = node.type === 'row' ? node.fields : [node];
        for (const n of nodes) {
          n.path = `${group.path}.${n.path}`;
          n.id = n.path.replace(/\./g, '-');
          if (n.level) n.level += shift;
        }
        if (node.type === 'group') walk(node.children);
      }
    };
    walk(group.children);
  };

  const visit = (container, prefix) => {
    const used = new Map();
    const claim = (node, base) => {
      let name = node.explicitName || slug(base);
      delete node.explicitName;
      if (!name) {
        fail(`não foi possível gerar um nome para "${base}"; use {nome}`, node.source.line, node.source.column, base);
        name = 'campo';
      }
      const count = (used.get(name) || 0) + 1;
      used.set(name, count);
      if (count > 1) {
        warnings.push({
          message: `nome "${name}" repetido no mesmo nível; renomeado para "${name}_${count}"`,
          line: node.source.line, column: node.source.column, excerpt: base,
        });
        name = `${name}_${count}`;
      }
      node.name = name;
      node.path = prefix ? `${prefix}.${name}` : name;
      node.id = node.path.replace(/\./g, '-');
    };

    for (const child of container.children) {
      if (child.type === 'row') child.fields.forEach((f) => claim(f, f.label));
      else if (child.type === 'group' && child.component) {
        claim(child, child.title);
        adopt(child);
      } else if (child.type === 'group') { claim(child, child.title); visit(child, child.path); }
      else if (child.type === 'options' || child.type === 'longtext') claim(child, child.title);
    }
  };
  visit(form, '');
}
