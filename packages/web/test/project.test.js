import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, stub } from '@formularios/gerador';
import {
  addData, addForm, buildFiles, components, createProject, exportProject, generateForm, importProject, pages,
  removeForm, renameData, renameForm, uniqueFile, uniqueName, usersOf,
} from '../src/project.js';
import { linkComponents, previewDocument } from '../src/preview.js';
import { INITIAL_PAGE, KEY, load, save } from '../src/store.js';
import { unzip, zip } from '../src/zip.js';

const ler = (arquivo) => readFileSync(new URL(`../../../examples/clientes/${arquivo}`, import.meta.url), 'utf8');
const exemplo = ler('pages/clientes.form');
const pessoa = ler('components/pessoa.form');
const endereco = ler('components/endereco.form');
const text = (bytes) => new TextDecoder().decode(bytes);
const RUNTIME = [{ name: 'forms.js', data: '// forms' }, { name: 'masks.js', data: '// masks' }, { name: 'utils.js', data: '// utils' }];

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

// O projeto do exemplo: a página de clientes e os componentes pessoa e endereco.
function clientes() {
  const p = createProject('Clientes');
  addForm(p, 'pessoa', pessoa, 'component');
  addForm(p, 'endereco', endereco, 'component');
  addForm(p, 'clientes', exemplo);
  return p;
}

test('zip: ida e volta, com e sem compressão, nomes UTF-8', async () => {
  const bytes = await zip([
    { name: 'grande.txt', data: 'abc '.repeat(500) },
    { name: 'pasta/ação.bin', data: new Uint8Array([1, 2, 3]) },
  ]);
  const back = await unzip(bytes);
  assert.deepEqual(back.map((e) => e.name), ['grande.txt', 'pasta/ação.bin']);
  assert.equal(text(back[0].data), 'abc '.repeat(500));
  assert.deepEqual([...back[1].data], [1, 2, 3]);
  assert.ok(bytes.length < 500, 'o texto repetido foi comprimido');
});

test('nomes de arquivo únicos por pasta; forms e masks reservados só para páginas', () => {
  const p = createProject('P');
  assert.equal(addForm(p, 'Cadastro de Clientes', '').file, 'cadastro_de_clientes.form');
  assert.equal(addForm(p, 'cadastro_de_clientes.form', '').file, 'cadastro_de_clientes-2.form');
  assert.equal(addForm(p, 'cadastro_de_clientes', '', 'component').file, 'cadastro_de_clientes.form', 'outra pasta');
  assert.equal(addForm(p, 'meu-form', '').file, 'meu-form.form');
  assert.equal(uniqueFile(p, 'meu-form', p.forms[3]), 'meu-form.form', 'renomear para o próprio nome');
  assert.equal(uniqueFile(p, 'forms'), 'forms-2.form', 'forms.js e masks.js são do runtime');
  assert.equal(uniqueFile(p, 'masks', null, 'component'), 'masks.form', 'o JS do componente vai para components/');
  assert.equal(uniqueName(['Projeto', 'Projeto (2)'], 'Projeto'), 'Projeto (3)');
  removeForm(p, p.forms[3]);
  assert.equal(p.current, pages(p)[0].id);
});

test('componentes: a página inclui com +nome; renomear atualiza inclusões e imports', () => {
  const p = clientes();
  const r = generateForm(p, pages(p)[0]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ast.name, 'clientes');
  const end = components(p).find((c) => c.file === 'endereco.form');
  assert.deepEqual(usersOf(p, end).map((f) => f.file), ['clientes.form']);
  const pag = pages(p)[0];
  pag.script = "import endereco from './components/endereco.js';\nimport x from \"./components/endereco.js\";\n";
  const pes = components(p)[0];
  pes.source += '--Casa\n+endereco\n';
  pes.script = "import endereco from './endereco.js';\n";
  renameForm(p, end, 'end');
  assert.equal(end.file, 'end.form');
  assert.match(pag.source, /^--Endereço Residencial\{residencial\}\n\+end$/m);
  assert.match(pes.source, /^\+end$/m);
  assert.equal(pag.script, "import endereco from './components/end.js';\nimport x from \"./components/end.js\";\n");
  assert.equal(pes.script, "import endereco from './end.js';\n");
  assert.deepEqual(generateForm(p, pag).errors, []);
});

test('zip de projeto: project.json, pages/, components/, só os JS escritos e os dados; volta igual', async () => {
  const p = clientes();
  pages(p)[0].script = '// meu JS\n';
  addData(p, 'estados', '["SP"]');

  const entries = await unzip(await exportProject(p));
  assert.deepEqual(entries.map((e) => e.name), [
    'project.json', 'pages/clientes.form', 'pages/clientes.js', 'components/pessoa.form', 'components/endereco.form', 'estados.json',
  ]);
  assert.deepEqual(JSON.parse(text(entries[0].data)), { format: 2, name: 'Clientes', data: ['estados.json'] });

  const back = await importProject(await exportProject(p));
  assert.equal(back.name, 'Clientes');
  const resumo = (proj) => proj.forms.map((f) => [f.kind, f.file, f.source, f.script]).sort((a, b) => a[1].localeCompare(b[1]));
  assert.deepEqual(resumo(back), resumo(p));
  assert.deepEqual(back.data.map((d) => [d.file, d.content]), [['estados.json', '["SP"]']]);
  assert.equal(back.current, pages(back)[0].id, 'abre a primeira página');

  await assert.rejects(importProject(await zip([{ name: 'project.json', data: '{"format":1}' }])), /formato 1 não suportado/);
});

test('zip sem project.json, numa pasta: pages/ e components/; .js de mesmo nome; .json da raiz', async () => {
  const bytes = await zip([
    { name: 'loja/pages/clientes.form', data: exemplo },
    { name: 'loja/pages/clientes.js', data: '// página' },
    { name: 'loja/components/endereco.form', data: endereco },
    { name: 'loja/components/pessoa.form', data: pessoa },
    { name: 'loja/components/velho/x.form', data: '-X' },
    { name: 'loja/leia.txt', data: 'ignorado' },
    { name: 'loja/estados.json', data: '[]' },
  ]);
  const p = await importProject(bytes, 'Enviado');
  assert.equal(p.name, 'Enviado');
  assert.deepEqual(p.forms.map((f) => [f.kind, f.file, f.script]), [
    ['page', 'clientes.form', '// página'], ['component', 'endereco.form', null], ['component', 'pessoa.form', null],
  ]);
  assert.deepEqual(p.data.map((d) => d.file), ['estados.json']);
  await assert.rejects(importProject(await zip([{ name: 'a.txt', data: '' }])), /nenhum \.form/);
});

test('zip de HTMLs: páginas, components/ dos usados, dados e runtime; recusa erros', () => {
  const p = clientes();
  addForm(p, 'sobra', 'X: ___', 'component');
  const { files, problems } = buildFiles(p, RUNTIME);
  assert.deepEqual(problems, []);
  assert.deepEqual(files.map((f) => f.name), [
    'clientes.html', 'clientes.js', 'components/endereco.js', 'components/pessoa.js', 'forms.js', 'masks.js', 'utils.js',
  ]);
  assert.match(files[0].data, /^<!DOCTYPE html>/);
  assert.match(files[0].data, /<script type="module" src="clientes.js"><\/script>/);
  assert.match(files[0].data, /data-buttons/);
  assert.match(files[1].data, /\/\/ {3}components\/endereco\.js: residencial, comercial/);
  assert.match(files[0].data, /name="residencial" data-component="endereco"/);
  assert.equal(files[2].data, stub(parse(endereco, { name: 'endereco', component: true }).ast, { script: 'endereco.js' }));

  addData(p, 'estados', '["SP"]');
  const comDados = buildFiles(p, RUNTIME).files;
  assert.deepEqual(comDados.map((f) => f.name).slice(-4), ['estados.json', 'forms.js', 'masks.js', 'utils.js']);
  assert.match(comDados.find((f) => f.name === 'components/endereco.js').data, /utils\.loadJson\('\.\/estados\.json'\)/,
    'o JS inicial do componente lê o arquivo da lista');
  p.data = [];

  addForm(p, 'quebrado', 'sem título');
  addForm(p, 'velho', '-Velho').file = 'forms.form'; // estado antigo: uniqueFile já evita
  components(p).find((c) => c.file === 'endereco.form').source = 'CEP: 99x99';
  assert.deepEqual(buildFiles(p, RUNTIME).problems, [
    'pages/clientes.form: 2 erro(s) na especificação',
    'pages/quebrado.form: 1 erro(s) na especificação',
    'pages/forms.form: o JS da página (forms.js) coincidiria com um arquivo do runtime; renomeie a página',
  ]);
  assert.deepEqual(buildFiles(createProject('Vazio'), RUNTIME).problems, ['o projeto não tem páginas']);
});

test('armazenamento: começa com uma página e um componente, migra o antigo e guarda', () => {
  const vazio = load(memoryStorage());
  assert.equal(vazio.projects.length, 1);
  const [inicial] = vazio.projects;
  assert.deepEqual(inicial.forms.map((f) => [f.kind, f.file]), [['component', 'endereco.form'], ['page', 'formulario.form']]);
  assert.equal(pages(inicial)[0].source, INITIAL_PAGE);
  assert.equal(inicial.current, pages(inicial)[0].id);
  assert.deepEqual(generateForm(inicial, pages(inicial)[0]).errors, [], 'o projeto inicial gera sem erros');

  const antigo = load(memoryStorage({ 'formularios-editor': '-Antigo\nNome: ___' }));
  assert.equal(pages(antigo.projects[0])[0].source, '-Antigo\nNome: ___');

  const storage = memoryStorage();
  save(storage, antigo);
  assert.deepEqual(load(storage), antigo);

  const semKind = memoryStorage({ [KEY]: JSON.stringify({ current: 'x', projects: [{ id: 'x', name: 'P', forms: [{ id: 'f', file: 'a.form', source: '-A', script: null }], current: 'f' }] }) });
  const migrado = load(semKind).projects[0];
  assert.deepEqual(migrado.data, [], 'estado anterior aos arquivos de dados');
  assert.equal(migrado.forms[0].kind, 'page', 'estado anterior aos componentes');
  assert.equal(load(memoryStorage({ [KEY]: '{quebrado' })).projects.length, 1);
  assert.ok(load(null).projects.length, 'sem armazenamento também funciona');
});

test('pré-visualização: <base> do runtime, JS inline e linha de início do JS', () => {
  const page = '<!DOCTYPE html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>\n<form></form>\n</body>\n</html>\n';
  const { html, scriptLine } = previewDocument(page, 'linha1\nconst s = "</script>";', 'http://h/runtime/');
  assert.match(html, /<head>\n<base href="http:\/\/h\/runtime\/">\n<script>/);
  assert.equal(html.split('\n')[scriptLine - 1], 'linha1');
  assert.match(html, /const s = "<\\\/script>";\n<\/script>\n<\/body>/);
});

test('pré-visualização: JS dos componentes como módulos, com os imports religados e um import map', () => {
  const made = [];
  const { urls, imports } = linkComponents({
    pessoa: "import endereco from './endereco.js';\nimport { Form } from '../forms.js';\nexport default (p) => endereco(p);",
    endereco: 'export default function endereco(parte) {}',
    ciclo: "import ciclo from './ciclo.js';",
  }, 'http://h/runtime/', (code, name) => {
    made.push([name, code]);
    return `blob:${name}`;
  });
  assert.deepEqual(made.map(([n]) => n), ['endereco', 'pessoa', 'ciclo'], 'dependências primeiro');
  assert.equal(made[1][1], "import endereco from 'blob:endereco';\nimport { Form } from 'http://h/runtime/forms.js';\nexport default (p) => endereco(p);");
  assert.equal(made[2][1], "import ciclo from './ciclo.js';", 'ciclo: fica o import original');
  assert.equal(urls.get('pessoa'), 'blob:pessoa');
  assert.equal(imports['http://h/runtime/components/pessoa.js'], 'blob:pessoa');
  const { html } = previewDocument('<!DOCTYPE html>\n<html>\n<head>\n</head>\n<body>\n</body>\n</html>\n', '', 'http://h/runtime/', {}, imports);
  assert.match(html, /<base href="http:\/\/h\/runtime\/">\n<script type="importmap">\{"imports":\{"http:\/\/h\/runtime\/components\/endereco\.js":"blob:endereco"/);
});
