// Projeto da interface web (agentes.md §10.2): um nome, os formulários em duas
// pastas fixas — pages/ (viram páginas) e components/ (entram nas páginas com
// "+nome") —, cada um com o texto .form e, se o usuário escreveu, o próprio JS
// (script null = o inicial), e os arquivos de dados (.json), que vão ao lado das páginas.
//
// Zip de projeto (baixar/enviar; a CLI também lê; agentes.md §10.3):
//   project.json        { "format": 2, "name": "...", "data": ["estados.json"] }
//   pages/x.form        cada página; pages/x.js só quando o JS foi escrito
//   components/y.form   cada componente; components/y.js idem
//   estados.json        arquivos de dados
//
// Zip de HTMLs: x.html e x.js de cada página, components/y.js de cada componente
// usado, os arquivos de dados e o runtime.
import { componentsOf, generate, includesOf, renameInclude, slug, stub } from '@formularios/gerador';
import { unzip, zip } from './zip.js';

export const FORMAT = 2;
export const RUNTIME_FILES = ['forms.js', 'masks.js', 'utils.js', 'forms.d.ts'];
export const FOLDERS = { page: 'pages', component: 'components' };

export function createProject(name) {
  return { id: newId(), name, forms: [], data: [], current: null };
}

// kind: 'page' | 'component'
export function addForm(project, name, source, kind = 'page') {
  const form = { id: newId(), kind, file: uniqueFile(project, name, null, kind), source, script: null };
  project.forms.push(form);
  project.current = form.id;
  return form;
}

export const formName = (form) => form.file.replace(/\.form$/, '');
export const formPath = (form) => `${FOLDERS[form.kind]}/${form.file}`;
// O JS e o HTML têm o nome do .form: pages/x.form -> x.html e x.js na saída.
export const scriptFile = (form) => `${formName(form)}.js`;
export const scriptPath = (form) => `${FOLDERS[form.kind]}/${scriptFile(form)}`;
export const pageFile = (form) => `${formName(form)}.html`;
export const pages = (project) => project.forms.filter((f) => f.kind === 'page');
export const components = (project) => project.forms.filter((f) => f.kind === 'component');

// O texto de cada componente, para as inclusões: { endereco: '-Endereço\n…' }.
export function componentSources(project) {
  return Object.fromEntries(components(project).map((f) => [formName(f), f.source]));
}

// Gera um formulário do projeto (página ou componente) com os componentes do projeto.
export function generateForm(project, form, options = {}) {
  return generate(form.source, {
    name: formName(form), components: componentSources(project), component: form.kind === 'component', ...options,
  });
}

// Quem inclui o componente diretamente.
export function usersOf(project, component) {
  const name = formName(component);
  return project.forms.filter((f) => includesOf(f.source).includes(name));
}

// Renomear um componente atualiza as inclusões ("+nome") e os imports dos JS escritos.
export function renameForm(project, form, name) {
  const old = formName(form);
  form.file = uniqueFile(project, name, form, form.kind);
  const now = formName(form);
  if (form.kind !== 'component' || old === now) return;
  for (const f of project.forms) {
    f.source = renameInclude(f.source, old, now);
    if (f.script === null) continue;
    const dir = f.kind === 'page' ? './components/' : './';
    for (const q of ['\'', '"']) f.script = f.script.split(`${q}${dir}${old}.js${q}`).join(`${q}${dir}${now}.js${q}`);
  }
}

export function removeForm(project, form) {
  project.forms = project.forms.filter((f) => f !== form);
  if (project.current === form.id) project.current = (pages(project)[0] ?? project.forms[0])?.id ?? null;
}

// "Cadastro de Clientes" -> "cadastro_de_clientes.form"; repetido na mesma pasta
// ganha -2, -3... Páginas "forms" e "masks" ficam reservadas: o JS coincidiria com o runtime.
export function uniqueFile(project, name, except = null, kind = 'page') {
  const raw = String(name).trim().replace(/\.form$/i, '');
  const base = /^[\w-]+$/.test(raw) ? raw : slug(raw) || (kind === 'component' ? 'componente' : 'formulario');
  const taken = (file) => (kind === 'page' && RUNTIME_FILES.includes(file.replace(/\.form$/, '.js')))
    || project.forms.some((f) => f !== except && f.kind === kind && f.file === file);
  let file = `${base}.form`;
  for (let n = 2; taken(file); n++) file = `${base}-${n}.form`;
  return file;
}

export const NEW_DATA = '[\n  { "value": "", "label": "" }\n]\n';

export function addData(project, name, content = NEW_DATA) {
  const item = { id: newId(), file: uniqueDataFile(project, name), content };
  project.data.push(item);
  return item;
}

export function renameData(project, item, name) {
  item.file = uniqueDataFile(project, name, item);
}

export function removeData(project, item) {
  project.data = project.data.filter((d) => d !== item);
}

// "estados" -> "estados.json"; "project.json" é do zip de projeto e fica reservado.
export function uniqueDataFile(project, name, except = null) {
  const raw = String(name).trim().replace(/\.json$/i, '');
  const base = /^[\w-]+$/.test(raw) ? raw : slug(raw) || 'dados';
  const taken = (file) => file === 'project.json' || project.data.some((d) => d !== except && d.file === file);
  let file = `${base}.json`;
  for (let n = 2; taken(file); n++) file = `${base}-${n}.json`;
  return file;
}

export function dataFiles(project) {
  return (project.data ?? []).map((d) => d.file);
}

// Nome livre entre os já usados: "Projeto" -> "Projeto (2)".
export function uniqueName(names, name) {
  let out = name;
  for (let n = 2; names.includes(out); n++) out = `${name} (${n})`;
  return out;
}

export async function exportProject(project) {
  const files = [];
  for (const f of [...pages(project), ...components(project)]) {
    files.push({ name: formPath(f), data: f.source });
    if (f.script !== null) files.push({ name: scriptPath(f), data: f.script });
  }
  for (const d of project.data ?? []) files.push({ name: d.file, data: d.content });
  const manifest = { format: FORMAT, name: project.name, data: dataFiles(project) };
  return zip([{ name: 'project.json', data: `${JSON.stringify(manifest, null, 2)}\n` }, ...files]);
}

// Lê o zip de projeto (o projeto pode estar numa pasta dentro do zip). Sem
// project.json, vale qualquer zip com pages/ e components/: o nome vem do arquivo
// e todo .json da raiz é dado.
export async function importProject(bytes, fallbackName = 'Projeto') {
  const decoder = new TextDecoder();
  const entries = new Map();
  for (const { name, data } of await unzip(bytes)) {
    if (!name.startsWith('__MACOSX/')) entries.set(name, decoder.decode(data));
  }
  const root = projectRoot([...entries.keys()]);
  const project = createProject(fallbackName);
  let manifest = null;
  if (entries.has(`${root}project.json`)) {
    try {
      manifest = JSON.parse(entries.get(`${root}project.json`));
    } catch {
      throw new Error('project.json inválido');
    }
    if (manifest.format !== FORMAT) throw new Error(`project.json: formato ${manifest.format} não suportado (use o ${FORMAT})`);
    if (manifest.name) project.name = String(manifest.name);
  }
  const direct = (dir, ext) => [...entries.keys()]
    .filter((k) => k.startsWith(`${root}${dir}`) && k.endsWith(ext) && !k.slice(root.length + dir.length).includes('/'))
    .sort();
  for (const [kind, folder] of Object.entries(FOLDERS)) {
    for (const key of direct(`${folder}/`, '.form')) {
      const form = addForm(project, key.slice(key.lastIndexOf('/') + 1), entries.get(key), kind);
      form.script = entries.get(key.replace(/\.form$/, '.js')) ?? null;
    }
  }
  if (manifest && Array.isArray(manifest.data)) {
    for (const name of manifest.data) {
      const content = entries.get(`${root}${name}`);
      if (content === undefined) throw new Error(`project.json cita ${name}, que não está no zip`);
      addData(project, name, content);
    }
  } else {
    for (const key of direct('', '.json')) if (key !== `${root}project.json`) addData(project, key.slice(root.length), entries.get(key));
  }
  if (!project.forms.length) throw new Error(`nenhum .form em ${FOLDERS.page}/ ou ${FOLDERS.component}/ no zip`);
  project.current = (pages(project)[0] ?? project.forms[0]).id;
  return project;
}

// Pasta do zip onde está o projeto: a do project.json mais raso ou, sem ele, a que tem pages/.
export function projectRoot(names) {
  const roots = names
    .map((n) => /^((?:[^/]+\/)*?)(?:project\.json|(?:pages|components)\/[^/]+\.form)$/.exec(n)?.[1])
    .filter((r) => r !== undefined);
  return roots.sort((a, b) => a.length - b.length)[0] ?? '';
}

// JS da página ou do componente: o escrito ou o inicial, gerado a partir da AST (o
// de uma @lista com <lista>.json no projeto já lê o arquivo).
export function scriptOf(form, ast, project = null) {
  return form.script ?? stub(ast, { script: scriptFile(form), data: project ? dataFiles(project) : [] });
}

// runtime: [{ name, data }] -> { files, problems }; com problemas, nada deve ser baixado.
export function buildFiles(project, runtime) {
  const files = [];
  const problems = [];
  const reserved = new Set(runtime.map((f) => f.name));
  const used = new Set();
  for (const page of pages(project)) {
    const script = scriptFile(page);
    if (reserved.has(script)) {
      problems.push(`${formPath(page)}: o JS da página (${script}) coincidiria com um arquivo do runtime; renomeie a página`);
      continue;
    }
    const r = generateForm(project, page, { page: true, script });
    if (r.errors.length) {
      problems.push(`${formPath(page)}: ${r.errors.length} erro(s) na especificação`);
      continue;
    }
    files.push({ name: pageFile(page), data: r.html });
    files.push({ name: script, data: scriptOf(page, r.ast, project) });
    componentsOf(r.ast).forEach((c) => used.add(c));
  }
  const usados = components(project).filter((c) => used.has(formName(c))).sort((a, b) => a.file.localeCompare(b.file));
  for (const c of usados) files.push({ name: scriptPath(c), data: scriptOf(c, generateForm(project, c).ast, project) });
  if (!pages(project).length) problems.push('o projeto não tem páginas');
  const data = (project.data ?? []).map((d) => ({ name: d.file, data: d.content }));
  return { files: [...files, ...data, ...runtime], problems };
}

export async function buildZip(project, runtime) {
  const { files, problems } = buildFiles(project, runtime);
  return { bytes: problems.length ? null : await zip(files), problems };
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
