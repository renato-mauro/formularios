// Interface web: projetos de formulários guardados no navegador — páginas,
// componentes e arquivos de dados —, edição do .form e do JS de cada um (com o
// assistente de campo), pré-visualização com o runtime, resumo da estrutura de
// dados, coleção de listas prontas e zips de projeto e de HTMLs.
import { componentsOf, formatIssue, render, slug } from '@formularios/gerador';
import { outline } from './api.js';
import { assistenteDeCampo } from './assistente.js';
import { inserirNoJs } from './calculado.js';
import { linhaDaLista } from './campo.js';
import { escolherDaColecao } from './colecao.js';
import { codeEditor } from './editor.js';
import { estrutura } from './estrutura.js';
import {
  addData, addForm, buildZip, components, dataFiles, exportProject, formName, formPath, generateForm, importProject,
  pageFile, pages, removeData, removeForm, renameData, renameForm, RUNTIME_FILES, scriptFile, scriptOf, scriptPath,
  uniqueName, usersOf,
} from './project.js';
import { linkComponents, previewDocument } from './preview.js';
import { load, NEW_COMPONENT, NEW_PAGE, save, starterProject } from './store.js';

const RUNTIME_DIR = new URL('./', import.meta.resolve('@formularios/runtime')).href;
const THEME_KEY = 'formularios.web.tema';
const LETRA_KEY = 'formularios.web.letra'; // editores de código
const LETRA_HTML_KEY = 'formularios.web.letra-html'; // vista HTML da pré-visualização
const LETRA = { min: 10, max: 24, padrao: 13 }; // px
const VISTA_KEY = 'formularios.web.previa'; // 'pagina' | 'html' | 'estrutura'
const LARGURAS_KEY = 'formularios.web.larguras';

const $ = (id) => document.getElementById(id);
const ui = {
  app: document.querySelector('.app'),
  lista: document.querySelector('.app-lista'),
  editor: document.querySelector('.app-editor'),
  projeto: $('projeto'),
  tema: $('tema'),
  ajuda: $('ajuda'),
  ajudaAbrir: $('ajuda-abrir'),
  ajudaConteudo: $('ajuda-conteudo'),
  paginas: $('paginas'),
  componentes: $('componentes'),
  dados: $('dados'),
  arquivo: $('arquivo'),
  abas: $('abas'),
  abaForm: $('aba-form'),
  abaScript: $('aba-script'),
  scriptBarra: $('script-barra'),
  scriptEstado: $('script-estado'),
  scriptRecriar: $('script-recriar'),
  vazio: $('vazio'),
  problemas: $('problemas'),
  previa: $('previa'),
  previaTitulo: $('previa-titulo'),
  previaBotoes: $('previa-botoes'),
  htmlLetra: $('html-letra'),
  verPagina: $('ver-pagina'),
  verHtml: $('ver-html'),
  verEstrutura: $('ver-estrutura'),
  estrutura: $('estrutura'),
  campoAbrir: $('campo-abrir'),
  json: $('json'),
  jsonTitulo: $('json-titulo'),
  aviso: $('aviso'),
  avisoTexto: $('aviso-texto'),
};

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const state = load(storage);

let tab = 'form';
let vista = 'pagina'; // pré-visualização: a página rodando, o HTML gerado ou a estrutura
const larguras = {}; // { lista, editor } em px, das divisórias
let ajudaCarregada = false;
let selectedData = null; // id do arquivo de dados aberto no editor, ou null (formulário)
let parsed = null; // último generate() do formulário aberto
let info = outline(null); // o que o autocompletar sabe do formulário aberto
let previewOf = null; // id do formulário que está na pré-visualização
let previewKind = 'page';
let scriptLine = 0;
let modules = new Map(); // url blob: do JS de um componente na pré-visualização -> o componente
let runtimeIssues = [];
let refreshTimer;
let saveTimer;
let avisoTimer;

const project = () => state.projects.find((p) => p.id === state.current) ?? state.projects[0];
const form = () => {
  const p = project();
  return p.forms.find((f) => f.id === p.current) ?? null;
};
const dataItem = () => (selectedData ? project().data.find((d) => d.id === selectedData) ?? null : null);

const editors = {
  form: codeEditor($('fonte'), {
    language: 'form',
    context: () => info,
    onChange: (text) => {
      form().source = text;
      edited();
    },
  }),
  script: codeEditor($('script'), {
    language: 'js',
    context: () => info,
    onChange: (text) => {
      form().script = text;
      renderScript(null);
      edited();
    },
  }),
  data: codeEditor($('dado'), {
    language: 'json',
    onChange: (text) => {
      dataItem().content = text;
      edited();
    },
  }),
  // O HTML como vai no zip; só leitura.
  html: codeEditor($('html-gerado'), { language: 'html', readOnly: true }),
};

// ---------------------------------------------------------------- tema

const darkMedia = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const pref = ui.tema.value;
  const dark = pref === 'dark' || (pref === 'auto' && darkMedia.matches);
  document.documentElement.dataset.bsTheme = dark ? 'dark' : 'light';
  for (const e of Object.values(editors)) e.setDark(dark);
}

// ---------------------------------------------------------------- tamanho da letra

// Botões A− / A+ (o número do meio volta ao padrão) de `prefixo`-menor,
// -tamanho e -maior. Os editores de código e a vista HTML têm cada um o seu
// tamanho, guardado em `chave`. Devolve aplicar(px), para a inicialização.
function controleLetra(prefixo, chave, alvos) {
  const [menor, tamanho, maior] = ['menor', 'tamanho', 'maior'].map((s) => $(`${prefixo}-${s}`));
  let atual = LETRA.padrao;
  const aplicar = (px) => {
    atual = Math.min(LETRA.max, Math.max(LETRA.min, Math.round(px) || LETRA.padrao));
    tamanho.textContent = `${atual}px`;
    tamanho.title = `Voltar ao tamanho padrão (${LETRA.padrao}px)`;
    menor.disabled = atual <= LETRA.min;
    maior.disabled = atual >= LETRA.max;
    for (const e of alvos) e.setFontSize(atual);
  };
  const mudar = (px) => {
    aplicar(px);
    try {
      storage?.setItem(chave, String(atual));
    } catch { /* sem armazenamento: vale só nesta aba */ }
  };
  menor.addEventListener('click', () => mudar(atual - 1));
  maior.addEventListener('click', () => mudar(atual + 1));
  tamanho.addEventListener('click', () => mudar(LETRA.padrao));
  return aplicar;
}

// ---------------------------------------------------------------- divisórias

// Divisória entre dois painéis, como no VS Code: arrastar, setas do teclado
// (Shift = passo maior) e duplo clique para voltar ao padrão. Devolve
// aplicar(px | null). As larguras ficam no navegador.
function ligarDivisor(divisor, nome, painel, limites) {
  const aplicar = (px) => {
    if (px === null) {
      delete larguras[nome];
      ui.app.style.removeProperty(`--largura-${nome}`);
    } else {
      const [min, max] = limites();
      larguras[nome] = Math.round(Math.max(min, Math.min(max, px)));
      ui.app.style.setProperty(`--largura-${nome}`, `${larguras[nome]}px`);
    }
    divisor.setAttribute('aria-valuenow', String(Math.round(painel.getBoundingClientRect().width)));
  };
  const guardar = () => {
    try {
      storage?.setItem(LARGURAS_KEY, JSON.stringify(larguras));
    } catch { /* sem armazenamento: vale só nesta aba */ }
  };

  divisor.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    divisor.setPointerCapture(e.pointerId);
    divisor.classList.add('ativo');
    document.body.classList.add('redimensionando');
    const x0 = e.clientX;
    const w0 = painel.getBoundingClientRect().width;
    const mover = (ev) => aplicar(w0 + ev.clientX - x0);
    divisor.addEventListener('pointermove', mover);
    // Vem no pointerup e no cancelamento.
    divisor.addEventListener('lostpointercapture', () => {
      divisor.removeEventListener('pointermove', mover);
      divisor.classList.remove('ativo');
      document.body.classList.remove('redimensionando');
      guardar();
    }, { once: true });
  });
  divisor.addEventListener('keydown', (e) => {
    const passo = e.shiftKey ? 80 : 16;
    const delta = { ArrowLeft: -passo, ArrowRight: passo }[e.key];
    if (!delta) return;
    e.preventDefault();
    aplicar(painel.getBoundingClientRect().width + delta);
    guardar();
  });
  divisor.addEventListener('dblclick', () => {
    aplicar(null);
    guardar();
  });
  return aplicar;
}

// Lista: 180 a 480 px; editor: de 280 px até deixar 300 px para a pré-visualização.
const larguraLista = ligarDivisor($('divisor-lista'), 'lista', ui.lista,
  () => [180, Math.max(180, Math.min(480, ui.app.clientWidth - 584))]);
const larguraEditor = ligarDivisor($('divisor-editor'), 'editor', ui.editor,
  () => [280, Math.max(280, ui.app.clientWidth - ui.lista.getBoundingClientRect().width - 304)]);

// ---------------------------------------------------------------- ajuda

// A ajuda (src/ajuda.html) só é buscada na primeira vez que é aberta.
async function toggleAjuda(open) {
  ui.ajuda.hidden = !open;
  ui.ajudaAbrir.classList.toggle('active', open);
  ui.ajudaAbrir.setAttribute('aria-pressed', String(open));
  if (!open || ajudaCarregada) return;
  ajudaCarregada = true;
  try {
    const resp = await fetch(new URL('./ajuda.html', import.meta.url));
    if (!resp.ok) throw new Error(`ajuda.html: ${resp.status}`);
    ui.ajudaConteudo.innerHTML = await resp.text();
  } catch (error) {
    ajudaCarregada = false;
    ui.ajudaConteudo.textContent = `Não foi possível carregar a ajuda: ${error.message}`;
  }
}

// ---------------------------------------------------------------- desenho

function renderAll() {
  renderProjects();
  renderLists();
  renderEditor();
  refresh();
}

function renderProjects() {
  const current = project();
  ui.projeto.replaceChildren(...state.projects.map((p) => new Option(p.name, p.id, false, p === current)));
}

function renderLists() {
  const p = project();
  const open = dataItem();
  const item = (label, active, onClick) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'list-group-item list-group-item-action font-monospace text-truncate';
    el.textContent = label;
    if (active) {
      el.classList.add('active');
      el.setAttribute('aria-current', 'true');
    }
    el.addEventListener('click', onClick);
    return el;
  };
  const formItem = (f) => item(f.file, !open && f.id === p.current, () => {
    if (p.current !== f.id) mostrar('JSON');
    p.current = f.id;
    selectedData = null;
    persist();
    renderAll();
  });
  ui.paginas.replaceChildren(...pages(p).map(formItem));
  ui.componentes.replaceChildren(...components(p).map(formItem));
  $('componentes-vazio').hidden = components(p).length > 0;
  $('dados-vazio').hidden = p.data.length > 0;
  // Cada arquivo de dados: abrir no editor e, ao lado, copiar a linha do .form
  // que o usa como lista ("Estado civil: @estado-civil").
  ui.dados.replaceChildren(...p.data.map((d) => {
    const abrir = item(d.file, open === d, () => {
      selectedData = d.id;
      renderLists();
      renderEditor();
      listProblems();
    });
    abrir.classList.replace('list-group-item', 'dado-abrir');
    abrir.classList.remove('list-group-item-action', 'active'); // o destaque fica na linha inteira
    const linha = linhaDaLista(d.file);
    const copiar = document.createElement('button');
    copiar.type = 'button';
    copiar.className = 'dado-copiar btn btn-sm btn-link';
    copiar.textContent = '⧉';
    copiar.title = `Copiar a linha do .form: ${linha}`;
    copiar.setAttribute('aria-label', `Copiar a linha do .form que usa ${d.file}: ${linha}`);
    copiar.addEventListener('click', () => copiarTexto(linha));
    const el = document.createElement('div');
    el.className = `list-group-item list-group-item-action dado${open === d ? ' active' : ''}`;
    el.append(abrir, copiar);
    return el;
  }));
}

function renderEditor() {
  const f = form();
  const d = dataItem();
  const open = d ?? f;
  ui.vazio.hidden = Boolean(open);
  $('arquivo-renomear').disabled = !open;
  $('arquivo-excluir').disabled = !open;
  // Na aba do JS, o nome do arquivo dele (o do .form, que renomear muda junto).
  ui.arquivo.textContent = d ? d.file : f ? (tab === 'script' ? scriptPath(f) : formPath(f)) : '';
  ui.abaScript.textContent = f?.kind === 'component' ? 'JS do componente' : 'JS da página';
  ui.abas.hidden = !f || Boolean(d);
  if (f) editors.form.setValue(f.source);
  if (d) editors.data.setValue(d.content);
  editors.form.hidden = !f || Boolean(d) || tab !== 'form';
  editors.script.hidden = !f || Boolean(d) || tab !== 'script';
  ui.scriptBarra.hidden = editors.script.hidden;
  ui.campoAbrir.hidden = editors.form.hidden;
  editors.data.hidden = !d;
  for (const [aba, nome] of [[ui.abaForm, 'form'], [ui.abaScript, 'script']]) {
    aba.classList.toggle('active', tab === nome);
    aba.setAttribute('aria-selected', String(tab === nome));
  }
}

// Gera o formulário aberto: problemas, JS inicial e pré-visualização. Um componente
// aparece sozinho, sem botões, com o JS dele recebendo o formulário inteiro (scope('')).
function refresh() {
  clearTimeout(refreshTimer);
  const p = project();
  const f = form();
  const comp = f?.kind === 'component';
  runtimeIssues = [];
  parsed = f ? generateForm(p, f, { page: true, script: false, buttons: !comp }) : null;
  const ok = parsed && !parsed.errors.length;
  if (ok) info = outline(parsed.ast, dataFiles(p), components(p).filter((c) => c !== f).map(formName));
  listProblems();
  renderScript(ok ? parsed.ast : null);
  renderVista();
  renderEstrutura();
  if (!ok) {
    // Com erro, mantém a última pré-visualização boa do mesmo formulário.
    if (previewOf !== f?.id) {
      ui.previa.srcdoc = '';
      editors.html.update('');
      previewOf = null;
    }
    return;
  }
  editors.html.update(comp ? render(parsed.ast, { buttons: false }) : render(parsed.ast, { page: true, script: scriptFile(f) }));
  const files = Object.fromEntries(p.data.map((d) => [d.file, d.content]));

  // O JS de cada componente usado vira um módulo blob:, com os imports religados.
  const byName = new Map(components(p).map((c) => [formName(c), c]));
  const scripts = {};
  for (const name of componentsOf(parsed.ast)) {
    const c = byName.get(name);
    scripts[name] = scriptOf(c, generateForm(p, c).ast, p);
  }
  if (comp) scripts[formName(f)] = scriptOf(f, parsed.ast, p);
  const blobs = [];
  const linked = linkComponents(scripts, RUNTIME_DIR, (code) => {
    blobs.push(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    return blobs.at(-1);
  });
  // Um componente aberto: chamado com o formulário inteiro (os de dentro, pelo ready()).
  const script = comp
    ? [
      "import { Form } from './forms.js';",
      `import componente from './components/${formName(f)}.js';`,
      '',
      `const form = new Form('#${parsed.ast.name}');`,
      "if (typeof componente !== 'function') throw new Error('o JS do componente deve exportar a função: export default function (parte) { … }');",
      "componente(form.scope(''));",
      'await form.ready();',
    ].join('\n')
    : scriptOf(f, parsed.ast, p);
  const doc = previewDocument(parsed.html, script, RUNTIME_DIR, files, linked.imports);
  for (const url of modules.keys()) URL.revokeObjectURL(url);
  modules = new Map([...linked.urls].map(([name, url]) => [url, byName.get(name)]));
  scriptLine = doc.scriptLine;
  previewOf = f.id;
  previewKind = f.kind;
  ui.previa.srcdoc = doc.html;
}

// Pré-visualização: a página rodando, o HTML que vai no zip (só leitura) ou a
// estrutura de dados (os campos, para quem vai receber o JSON).
function renderVista() {
  const f = form();
  const html = vista === 'html';
  ui.previa.hidden = vista !== 'pagina';
  editors.html.hidden = !html;
  ui.estrutura.hidden = vista !== 'estrutura';
  ui.previaBotoes.hidden = vista !== 'pagina';
  ui.htmlLetra.hidden = !html;
  for (const [botao, nome] of [[ui.verPagina, 'pagina'], [ui.verHtml, 'html'], [ui.verEstrutura, 'estrutura']]) {
    botao.classList.toggle('active', vista === nome);
    botao.setAttribute('aria-pressed', String(vista === nome));
  }
  const comp = f?.kind === 'component';
  if (!f) ui.previaTitulo.textContent = 'Pré-visualização';
  else if (vista === 'estrutura') ui.previaTitulo.textContent = `${formPath(f)} — estrutura de dados${comp ? ' (caminhos relativos ao componente)' : ''}`;
  else if (html && comp) ui.previaTitulo.textContent = `${f.file} — o trecho que entra nas páginas (só leitura)`;
  else if (html) ui.previaTitulo.textContent = `${pageFile(f)} — como vai no zip (só leitura)`;
  else ui.previaTitulo.textContent = `Pré-visualização — ${formPath(f)}${comp ? ' (o componente sozinho)' : ''}`;
}

// Tabela dos campos (estrutura.js) e um exemplo do JSON. Com erro no .form, fica a
// última estrutura boa, com um aviso.
function renderEstrutura() {
  if (vista !== 'estrutura') return;
  const ok = parsed && !parsed.errors.length;
  if (!ok) {
    if (!ui.estrutura.childElementCount || previewOf !== form()?.id) ui.estrutura.textContent = 'Corrija os erros do .form para ver a estrutura.';
    return;
  }
  const p = project();
  const { linhas, exemplo } = estrutura(parsed.ast, { dados: Object.fromEntries(p.data.map((d) => [d.file, d.content])) });
  const campos = linhas.filter((l) => l.tipo === 'campo');
  const comComponente = linhas.some((l) => l.componente);
  const cel = (tag, texto, cls) => {
    const c = document.createElement(tag);
    if (cls) c.className = cls;
    c.textContent = texto;
    return c;
  };
  const resumo = cel('p', `${campos.length} campo(s), ${campos.filter((c) => c.obrigatorio).length} obrigatório(s). `
    + 'Campo vazio vira null no JSON; "não nulo" = obrigatório (validate() recusa vazio). '
    + 'A caixa de marcação é sempre true/false.', 'text-secondary mb-2');
  const tabela = document.createElement('table');
  tabela.className = 'table table-sm table-hover align-middle';
  const cab = ['Campo (caminho no JSON)', 'Rótulo', 'Tipo', 'No JSON', 'Nulo', 'Detalhes', 'Col.', ...(comComponente ? ['Componente'] : [])];
  tabela.createTHead().insertRow().append(...cab.map((t) => cel('th', t)));
  const corpo = tabela.createTBody();
  for (const l of linhas) {
    const tr = corpo.insertRow();
    if (l.tipo === 'secao') {
      tr.className = 'secao';
      const td = cel('td', `${l.caminho} — ${l.rotulo ?? ''}${l.componente ? ` (+${l.componente})` : ''}`);
      td.colSpan = cab.length;
      tr.append(td);
      continue;
    }
    tr.append(
      cel('td', l.caminho, 'caminho'), cel('td', l.rotulo ?? ''), cel('td', l.tipoCampo), cel('td', l.json, 'font-monospace text-nowrap'),
      cel('td', l.nulo ? 'nulo' : 'não nulo', `text-nowrap${l.nulo ? '' : ' nulo-nao'}`), cel('td', l.detalhes), cel('td', l.colunas ?? ''),
      ...(comComponente ? [cel('td', l.componente ? `+${l.componente}` : '')] : []),
    );
  }
  ui.estrutura.replaceChildren(
    resumo, tabela, cel('h3', 'Exemplo do JSON', 'h6 mt-3'), cel('pre', JSON.stringify(exemplo, null, 2)),
  );
}

function setVista(nome) {
  vista = nome;
  try {
    storage?.setItem(VISTA_KEY, vista);
  } catch { /* sem armazenamento: vale só nesta aba */ }
  renderVista();
  renderEstrutura();
}

function renderScript(ast) {
  const f = form();
  if (!f) return;
  if (f.script !== null) {
    editors.script.setValue(f.script);
    ui.scriptEstado.textContent = 'JS escrito por você: é este que vai no zip.';
    ui.scriptRecriar.hidden = false;
  } else {
    if (ast) editors.script.setValue(scriptOf(f, ast, project()));
    ui.scriptEstado.textContent = 'JS inicial, gerado a partir do .form. Ao editar, ele passa a ser seu.';
    ui.scriptRecriar.hidden = true;
  }
}

function listProblems() {
  const items = [];
  // Erro dentro de um componente incluído: o clique abre o componente na linha do erro.
  const goError = (e) => {
    const c = e.cause && components(project()).find((x) => formName(x) === e.cause.component);
    return c ? () => abrir(c, 'form', e.cause.line) : () => goTo('form', e.line);
  };
  for (const e of parsed?.errors ?? []) items.push(['erro', `Erro ${formatIssue(e)}`, goError(e)]);
  for (const w of parsed?.warnings ?? []) items.push(['aviso', `Aviso ${formatIssue(w)}`, () => goTo('form', w.line)]);
  for (const r of runtimeIssues) {
    const at = locate(r.frames);
    const where = at ? `${scriptPath(at.form)} ${at.line}` : 'JS';
    const stopped = r.stopped ? ' — o JS parou antes de form.ready(): a pré-visualização está sem máscaras, botões e listas.' : '';
    const text = r.level === 'warning' ? `Aviso ${where}: ${r.message}` : `${where}: ${r.message}${stopped}`;
    items.push([r.level === 'warning' ? 'aviso' : 'erro', text, at ? () => abrir(at.form, 'script', at.line) : null]);
  }
  for (const d of project().data) {
    const problem = jsonProblem(d.content);
    if (problem) items.push(['erro', `${d.file}:${problem.line}: JSON inválido — ${problem.message}`, () => goToData(d, problem.line)]);
  }
  ui.problemas.replaceChildren(...items.map(([cls, text, go]) => {
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = text;
    if (go) li.addEventListener('click', go);
    return li;
  }));
}

function jsonProblem(text) {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    const lc = /line (\d+) column \d+/.exec(error.message);
    const at = /position (\d+)/.exec(error.message);
    const line = lc ? Number(lc[1]) : at ? text.slice(0, Number(at[1])).split('\n').length : 1;
    return { line, message: error.message.replace(/\s*\(line \d+ column \d+\)/, '') };
  }
}

// Do stack de um erro da pré-visualização, o primeiro ponto no JS da página
// (documento, depois da linha onde o JS começa) ou no JS de um componente (blob:).
function locate(frames = []) {
  const shown = project().forms.find((f) => f.id === previewOf);
  for (const { url, line } of frames) {
    if (url === 'about:srcdoc' && previewKind === 'page' && shown && line >= scriptLine) return { form: shown, line: line - scriptLine + 1 };
    if (modules.has(url)) return { form: modules.get(url), line };
  }
  return null;
}

// Abre um formulário do projeto (página ou componente) numa aba e numa linha.
function abrir(f, aba, n) {
  const p = project();
  tab = aba;
  if (p.current !== f.id || selectedData) {
    p.current = f.id;
    selectedData = null;
    persist();
    mostrar('JSON');
    renderAll();
  } else {
    renderEditor();
  }
  (aba === 'form' ? editors.form : editors.script).selectLine(n);
}

function goTo(aba, n) {
  abrir(form(), aba, n);
}

function goToData(d, n) {
  selectedData = d.id;
  renderLists();
  renderEditor();
  editors.data.selectLine(n);
}

function mostrar(titulo, valor) {
  ui.jsonTitulo.textContent = titulo;
  ui.json.textContent = valor === undefined ? '' : JSON.stringify(valor, null, 2);
}

// Área de transferência: a API do navegador ou, se ela recusar (página fora de
// https, sem foco), o execCommand('copy') antigo; sem os dois, o texto aparece no
// aviso para copiar à mão.
async function copiarTexto(texto) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(texto);
    ok = true;
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: texto, readOnly: true });
    area.style.cssText = 'position: fixed; opacity: 0;';
    document.body.append(area);
    area.select();
    try {
      ok = document.execCommand('copy');
    } catch { /* sem cópia */ }
    area.remove();
  }
  if (ok) aviso(`Copiado: ${texto} — cole numa linha do .form (o rótulo pode ser trocado).`);
  else aviso(`Não foi possível copiar; selecione e copie: ${texto}`, 'warning');
}

function aviso(texto, tipo = 'success') {
  clearTimeout(avisoTimer);
  ui.aviso.className = `alert alert-${tipo} alert-dismissible m-0 rounded-0 py-2 small`;
  ui.avisoTexto.textContent = texto;
  ui.aviso.hidden = false;
  if (tipo === 'success') avisoTimer = setTimeout(() => { ui.aviso.hidden = true; }, 5000);
}

// ---------------------------------------------------------------- persistência

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

function saveNow() {
  clearTimeout(saveTimer);
  try {
    save(storage, state);
  } catch (error) {
    aviso(`Não foi possível salvar no navegador: ${error.message}. Baixe o projeto para não perder o trabalho.`, 'danger');
  }
}

function edited() {
  persist();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 300);
}

// ---------------------------------------------------------------- arquivos

function baixar(nome, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function runtimeFiles() {
  return Promise.all(RUNTIME_FILES.map(async (name) => {
    const resp = await fetch(new URL(name, RUNTIME_DIR));
    if (!resp.ok) throw new Error(`runtime: ${name} não encontrado (${resp.status})`);
    return { name, data: await resp.text() };
  }));
}

const fileName = (name) => slug(name) || 'projeto';
const projectNames = (except = null) => state.projects.filter((p) => p !== except).map((p) => p.name);

const newProject = (name) => starterProject(name);

// ---------------------------------------------------------------- eventos

ui.tema.addEventListener('change', () => {
  try {
    storage?.setItem(THEME_KEY, ui.tema.value);
  } catch { /* sem armazenamento: vale só nesta aba */ }
  applyTheme();
});
darkMedia.addEventListener('change', applyTheme);

const letraEditor = controleLetra('letra', LETRA_KEY, [editors.form, editors.script, editors.data]);
const letraHtml = controleLetra('html-letra', LETRA_HTML_KEY, [editors.html]);

ui.verPagina.addEventListener('click', () => setVista('pagina'));
ui.verHtml.addEventListener('click', () => setVista('html'));
ui.verEstrutura.addEventListener('click', () => setVista('estrutura'));

ui.ajudaAbrir.addEventListener('click', () => toggleAjuda(ui.ajuda.hidden));
$('ajuda-fechar').addEventListener('click', () => toggleAjuda(false));
ui.ajuda.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  toggleAjuda(false);
  ui.ajudaAbrir.focus();
});
// Índice da ajuda: rola o painel sem mexer no endereço da página.
ui.ajudaConteudo.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  e.preventDefault();
  ui.ajudaConteudo.querySelector(link.getAttribute('href'))?.scrollIntoView({ block: 'start' });
});

ui.projeto.addEventListener('change', () => {
  state.current = ui.projeto.value;
  selectedData = null;
  persist();
  mostrar('JSON');
  renderAll();
});

$('projeto-novo').addEventListener('click', () => {
  const nome = prompt('Nome do novo projeto:', 'Novo projeto')?.trim();
  if (!nome) return;
  const p = newProject(uniqueName(projectNames(), nome));
  state.projects.push(p);
  state.current = p.id;
  selectedData = null;
  tab = 'form';
  saveNow();
  renderAll();
});

$('projeto-renomear').addEventListener('click', () => {
  const p = project();
  const nome = prompt('Novo nome do projeto:', p.name)?.trim();
  if (!nome || nome === p.name) return;
  p.name = uniqueName(projectNames(p), nome);
  saveNow();
  renderProjects();
});

$('projeto-excluir').addEventListener('click', () => {
  const p = project();
  if (!confirm(`Excluir o projeto "${p.name}" e todos os arquivos dele?\nSe quiser guardar uma cópia, use antes "Baixar projeto".`)) return;
  state.projects = state.projects.filter((x) => x !== p);
  if (!state.projects.length) state.projects.push(newProject('Meu projeto'));
  state.current = state.projects[0].id;
  selectedData = null;
  saveNow();
  renderAll();
});

$('projeto-enviar').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const p = await importProject(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.zip$/i, ''));
    p.name = uniqueName(projectNames(), p.name);
    state.projects.push(p);
    state.current = p.id;
    selectedData = null;
    tab = 'form';
    saveNow();
    renderAll();
    const dados = p.data.length ? ` e ${p.data.length} arquivo(s) de dados` : '';
    aviso(`Projeto "${p.name}" importado com ${pages(p).length} página(s), ${components(p).length} componente(s)${dados}.`);
  } catch (error) {
    aviso(`Não foi possível importar ${file.name}: ${error.message}`, 'danger');
  }
});

$('projeto-baixar').addEventListener('click', async () => {
  const p = project();
  baixar(`${fileName(p.name)}.zip`, await exportProject(p));
});

$('html-baixar').addEventListener('click', async () => {
  const p = project();
  try {
    const { bytes, problems } = await buildZip(p, await runtimeFiles());
    if (problems.length) return aviso(`Corrija antes de baixar: ${problems.join('; ')}.`, 'danger');
    baixar(`${fileName(p.name)}-html.zip`, bytes);
  } catch (error) {
    aviso(`Não foi possível gerar o zip: ${error.message}`, 'danger');
  }
});

function novoForm(kind) {
  const comp = kind === 'component';
  const nome = prompt(comp ? 'Nome do componente (sem .form; é o que vai depois do + nas páginas):'
    : 'Nome da página (sem .form; também é o do .html e do .js):', comp ? 'componente' : 'pagina')?.trim();
  if (!nome) return;
  addForm(project(), nome, comp ? NEW_COMPONENT : NEW_PAGE, kind);
  selectedData = null;
  tab = 'form';
  saveNow();
  renderAll();
  editors.form.focus();
}
$('pagina-nova').addEventListener('click', () => novoForm('page'));
$('componente-novo').addEventListener('click', () => novoForm('component'));

$('dados-novo').addEventListener('click', () => {
  const p = project();
  // Sugere a primeira @lista do formulário aberto que ainda não tem arquivo.
  const sugestao = info.lists.find((l) => !dataFiles(p).includes(`${l}.json`)) ?? 'dados';
  const nome = prompt('Nome do arquivo de dados (sem .json). Para a lista @estados, use "estados":', sugestao)?.trim();
  if (!nome) return;
  selectedData = addData(p, nome).id;
  saveNow();
  renderAll();
  editors.data.focus();
});

// Coleção: listas prontas viram arquivos de dados do projeto (as @listas do
// formulário aberto que ainda não têm arquivo já vêm marcadas).
$('colecao-abrir').addEventListener('click', async () => {
  const p = project();
  const escolhidas = await escolherDaColecao($('colecao'), { noProjeto: dataFiles(p), sugeridas: info.lists });
  if (!escolhidas.length) return;
  let last = null;
  for (const c of escolhidas) last = addData(p, c.file, c.content);
  selectedData = last.id;
  saveNow();
  renderAll();
  aviso(`Importado(s) da coleção: ${escolhidas.map((c) => c.file).join(', ')}.`);
});

// Assistente de campo: insere a linha do .form na posição do cursor (entra no
// desfazer). Uma lista com itens da coleção traz o arquivo junto; um campo
// calculado põe o calcField no JS (o inicial passa a ser do usuário).
ui.campoAbrir.addEventListener('click', async () => {
  const f = form();
  if (!f) return;
  const p = project();
  const component = f.kind === 'component';
  const script = f.script ?? scriptOf(f, generateForm(p, f).ast, p);
  const r = await assistenteDeCampo($('campo'), {
    fonte: editors.form.value, linha: editors.form.cursorLine, component, dados: dataFiles(p), script,
    analisar: (fonte) => generateForm(p, { ...f, source: fonte }).ast,
  });
  if (!r) return editors.form.focus();
  if (r.importar) {
    addData(p, r.importar.file, r.importar.content);
    renderLists();
    aviso(`${r.importar.file} importado da coleção para a lista.`);
  }
  editors.form.edit(r.fonte, r.de, r.ate);
  if (r.calculo) {
    const inicial = f.script === null;
    f.script = inserirNoJs(f.script ?? scriptOf(f, generateForm(p, f).ast, p), r.calculo, { component });
    renderScript(null);
    refresh();
    aviso(`Campo calculado: o calcField foi para ${component ? 'o JS do componente' : 'o JS da página'} (aba ao lado)${
      inicial ? '. O JS inicial passou a ser seu: listas novas no .form não entram mais nele sozinhas' : ''}.`);
  }
  saveNow();
});

$('dados-enviar').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const p = project();
  let last = null;
  for (const file of files) last = addData(p, file.name, await file.text());
  if (!last) return;
  selectedData = last.id;
  saveNow();
  renderAll();
  aviso(`${files.length} arquivo(s) de dados adicionado(s).`);
});

$('arquivo-renomear').addEventListener('click', () => {
  const d = dataItem();
  const f = form();
  const ext = d ? '.json' : '.form';
  const atual = (d ?? f).file.slice(0, -ext.length);
  const pergunta = d ? `Novo nome do arquivo (sem ${ext}):`
    : f.kind === 'component' ? `Novo nome do componente (sem ${ext}; as linhas +${atual} e os imports do JS acompanham):`
      : `Novo nome da página (sem ${ext}; o .html e o .js acompanham):`;
  const nome = prompt(pergunta, atual)?.trim();
  if (!nome || nome === atual) return;
  if (d) renameData(project(), d, nome);
  else renameForm(project(), f, nome);
  saveNow();
  renderAll();
});

$('arquivo-excluir').addEventListener('click', () => {
  const p = project();
  const d = dataItem();
  if (d) {
    if (!confirm(`Excluir ${d.file}?`)) return;
    removeData(p, d);
    selectedData = null;
  } else {
    const f = form();
    const users = f.kind === 'component' ? usersOf(p, f).filter((u) => u !== f).map(formPath) : [];
    const uso = users.length ? `\nEle é incluído em ${users.join(', ')}: essas inclusões vão dar erro.` : '';
    if (!confirm(`Excluir ${formPath(f)}${f.script !== null ? ' e o JS escrito dele' : ''}?${uso}`)) return;
    removeForm(p, f);
  }
  saveNow();
  renderAll();
});

ui.abaForm.addEventListener('click', () => { tab = 'form'; renderEditor(); editors.form.focus(); });
ui.abaScript.addEventListener('click', () => { tab = 'script'; renderEditor(); editors.script.focus(); });

ui.scriptRecriar.addEventListener('click', () => {
  if (!confirm('Descartar o JS editado e voltar ao JS inicial, gerado a partir do .form?')) return;
  form().script = null;
  saveNow();
  refresh();
});

const previewForm = () => ui.previa.contentWindow?.__preview?.form ?? null;

$('validar').addEventListener('click', () => {
  const f = previewForm();
  if (!f) return mostrar('O JS não chamou form.ready()');
  const r = f.validate({ focus: true });
  mostrar(r.valid ? 'Validação: nenhum erro' : `Validação: ${r.errors.length} erro(s)`, r.errors);
});

$('coletar').addEventListener('click', () => {
  const f = previewForm();
  if (!f) return mostrar('O JS não chamou form.ready()');
  mostrar('JSON coletado', f.getData());
});

$('recarregar').addEventListener('click', refresh);
$('aviso-fechar').addEventListener('click', () => { ui.aviso.hidden = true; });

window.addEventListener('message', (e) => {
  if (e.source !== ui.previa.contentWindow || !e.data?.preview) return;
  const { type, payload } = e.data;
  if (type === 'action') mostrar(`Ação "${payload.action}" — JSON coletado`, payload.data);
  if (type === 'error' || type === 'warning') {
    runtimeIssues.push({ ...payload, level: type });
    listProblems();
  }
});

window.addEventListener('pagehide', saveNow);

let salvas = {};
const letras = {};
try {
  ui.tema.value = storage?.getItem(THEME_KEY) || 'auto';
  letras.editor = Number(storage?.getItem(LETRA_KEY));
  letras.html = Number(storage?.getItem(LETRA_HTML_KEY));
  vista = ['html', 'estrutura'].includes(storage?.getItem(VISTA_KEY)) ? storage.getItem(VISTA_KEY) : 'pagina';
  salvas = JSON.parse(storage?.getItem(LARGURAS_KEY) || '{}') ?? {};
} catch { /* sem armazenamento ou valor estragado */ }
applyTheme();
letraEditor(letras.editor);
letraHtml(letras.html);
if (Number.isFinite(salvas.lista)) larguraLista(salvas.lista);
if (Number.isFinite(salvas.editor)) larguraEditor(salvas.editor);
if (!storage) aviso('O armazenamento do navegador está indisponível: nada será guardado. Use "Baixar projeto".', 'warning');
saveNow();
renderAll();
