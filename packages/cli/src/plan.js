// O que gerar a partir do projeto, sem tocar no disco (agentes.md §10.1).
// Cada pages/x.form vira x.html e x.js na raiz da saída; o JS de cada componente
// usado pelas páginas vai para components/; os arquivos de dados e o runtime vão
// para a raiz, ao lado das páginas.
import path from 'node:path';
import { componentsOf, generate, stub } from '@formularios/gerador';
import { COMPONENTS, PAGES } from './input.js';

const { posix } = path;

// files: Map<caminho, () => Promise<string>> (ver input.js)
// runtime: [{ name, content }] ou [] para não copiar
// reserved: nomes dos arquivos do runtime, que nenhuma página pode usar
// -> { outputs: [{ path, content, kind: 'html' | 'script' | 'stub' | 'data' | 'runtime' }],
//      issues: [{ file, level, issue }], pages, components, built }
export async function plan(files, { runtime = [], reserved = runtime.map((f) => f.name), script = true, stubs = true } = {}) {
  const outputs = [];
  const issues = [];
  const report = (file, level, issue) => issues.push({ file, level, issue });
  const read = (file) => files.get(file)();
  const forms = (dir) => [...files.keys()].filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.form')).sort();
  const nameOf = (file) => posix.basename(file, '.form');
  const pageFiles = forms(PAGES);
  const componentFiles = forms(COMPONENTS);

  let project = null;
  if (files.has('project.json')) {
    try {
      project = JSON.parse(await read('project.json'));
    } catch {
      report('project.json', 'aviso', { message: 'project.json inválido; ignorado', line: 1, column: 1 });
    }
  }

  // Componentes: o texto de todos (para as inclusões) e a verificação de cada um.
  const sources = {};
  for (const file of componentFiles) sources[nameOf(file)] = await read(file);
  const components = new Map();
  for (const file of componentFiles) {
    const name = nameOf(file);
    const r = generate(sources[name], { name, components: sources, component: true });
    for (const w of r.warnings) report(file, 'aviso', w);
    for (const e of r.errors) report(file, 'erro', e);
    if (!r.errors.length) components.set(name, r.ast);
  }

  // Páginas.
  const pages = [];
  for (const file of pageFiles) {
    const name = nameOf(file);
    const r = generate(await read(file), { name, components: sources, page: true, script: script && `${name}.js` });
    for (const w of r.warnings) report(file, 'aviso', w);
    for (const e of r.errors) report(file, 'erro', e);
    if (r.errors.length) continue;
    if (script && reserved.includes(`${name}.js`)) {
      const message = `o JS da página (${name}.js) coincidiria com um arquivo do runtime; renomeie o .form`;
      report(file, 'erro', { ...r.ast.source, message });
      continue;
    }
    pages.push({ file, name, ast: r.ast, html: r.html });
  }

  const data = dataFiles(pages, project, files, report);
  const dataNames = data.map((d) => d.name);
  // JS de uma página ou componente: o escrito no projeto ou, se não houver, o inicial.
  const integrator = async (source, target, ast) => {
    if (files.has(source)) outputs.push({ path: target, content: await read(source), kind: 'script' });
    else if (stubs) outputs.push({ path: target, content: stub(ast, { script: posix.basename(target), data: dataNames }), kind: 'stub' });
  };
  for (const page of pages) {
    outputs.push({ path: `${page.name}.html`, content: page.html, kind: 'html' });
    if (script) await integrator(`${PAGES}/${page.name}.js`, `${page.name}.js`, page.ast);
  }
  if (script) {
    const used = [...new Set(pages.flatMap((p) => componentsOf(p.ast)))].sort();
    for (const name of used) await integrator(`${COMPONENTS}/${name}.js`, `${COMPONENTS}/${name}.js`, components.get(name));
  }
  if (pages.length) {
    for (const d of data) outputs.push({ path: d.name, content: await read(d.name), kind: 'data' });
    for (const f of runtime) outputs.push({ path: f.name, content: f.content, kind: 'runtime' });
  }
  return { outputs, issues, pages: pageFiles, components: componentFiles, built: pages.length };
}

// Arquivos de dados: os que o project.json listar em "data" ou, sem essa lista, o
// <lista>.json de cada @lista usada pelas páginas (inclusive dentro dos componentes).
function dataFiles(pages, project, files, report) {
  const listed = Array.isArray(project?.data);
  const wanted = listed
    ? project.data.filter((n) => typeof n === 'string')
    : [...new Set(pages.flatMap(({ ast }) => lists(ast)))].map((l) => `${l}.json`);
  const found = [];
  const warn = (message) => report('project.json', 'aviso', { message, line: 1, column: 1 });
  for (const name of wanted) {
    if (!/^[^/\\]+\.json$/.test(name) || name === 'project.json') warn(`nome de arquivo de dados inválido "${name}"; ignorado`);
    else if (files.has(name)) found.push({ name });
    else if (listed) warn(`project.json cita "${name}", que não está no projeto; ignorado`);
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function lists(ast) {
  const out = [];
  const walk = (children) => {
    for (const node of children) {
      if (node.type === 'group') walk(node.children);
      if (node.type === 'row') node.fields.forEach((f) => f.type === 'list' && out.push(f.list));
    }
  };
  walk(ast.children);
  return out;
}
