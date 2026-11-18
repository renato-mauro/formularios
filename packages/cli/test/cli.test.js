import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse, stub } from '@formularios/gerador';
import { addData, addForm, buildFiles, createProject, exportProject } from '@formularios/web/project';

const BIN = fileURLToPath(new URL('../bin/formularios.js', import.meta.url));
const ler = (arquivo) => readFileSync(new URL(`../../../examples/clientes/${arquivo}`, import.meta.url), 'utf8');
const exemplo = ler('pages/clientes.form');
const PESSOA = ler('components/pessoa.form');
const ENDERECO = ler('components/endereco.form');
const SIMPLES = '-Pedido\nNome*: ______   CEP: 99999-999\n';
const RUNTIME_FILES = ['forms.d.ts', 'forms.js', 'masks.js', 'utils.js'];

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'formularios-cli-'));
  dirs.push(dir);
  return dir;
}

function write(root, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
}

// stdin fechado: terminal não interativo, como num script de CI.
function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const read = (root, name) => readFileSync(path.join(root, name), 'utf8');
const ls = (root, name) => readdirSync(path.join(root, name)).sort();
const astOf = (src, name, component = false) => parse(src, { name, component, components: { pessoa: PESSOA, endereco: ENDERECO } }).ast;

test('projeto em pasta: páginas na raiz da saída, JS escrito ou inicial, components/ só dos usados', () => {
  const dir = tmp();
  write(dir, {
    'e/pages/clientes.form': exemplo,
    'e/pages/clientes.js': '// página de clientes\n',
    'e/pages/pedido.form': SIMPLES,
    'e/components/pessoa.form': PESSOA,
    'e/components/pessoa.js': '// pessoa\n',
    'e/components/endereco.form': ENDERECO,
    'e/components/sobra.form': 'X: ___\n',
    'e/components/velho/x.form': 'ignorado',
    'e/leia.txt': 'ignorado',
  });
  const r = run(dir, 'build', 'e', 's');
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(ls(dir, 's'), ['clientes.html', 'clientes.js', 'components', ...RUNTIME_FILES, 'pedido.html', 'pedido.js'].sort());
  assert.deepEqual(ls(dir, 's/components'), ['endereco.js', 'pessoa.js']);
  assert.match(read(dir, 's/clientes.html'), /^<!DOCTYPE html>[\s\S]*<script type="module" src="clientes.js">[\s\S]*name="residencial\.cep"[\s\S]*data-buttons/);
  assert.equal(read(dir, 's/clientes.js'), '// página de clientes\n');
  assert.equal(read(dir, 's/components/pessoa.js'), '// pessoa\n');
  assert.equal(read(dir, 's/components/endereco.js'), stub(astOf(ENDERECO, 'endereco', true), { script: 'endereco.js' }));
  assert.equal(read(dir, 's/pedido.js'), stub(astOf(SIMPLES, 'pedido'), { script: 'pedido.js' }));
  assert.match(r.out, /2 de 2 página\(s\) gerada\(s\)/);
});

test('@lista com <lista>.json na raiz: o arquivo vai junto e o JS inicial do componente o lê', () => {
  const dir = tmp();
  const ufs = '[{ "value": "SP", "label": "São Paulo" }]\n';
  write(dir, {
    'e/pages/clientes.form': exemplo,
    'e/components/pessoa.form': PESSOA,
    'e/components/endereco.form': ENDERECO,
    'e/estados.json': ufs,
    'e/outro.json': '{}',
  });
  const r = run(dir, 'build', 'e', 's');
  assert.equal(r.code, 0, r.err);
  assert.equal(read(dir, 's/estados.json'), ufs);
  assert.ok(!existsSync(path.join(dir, 's/outro.json')), 'só o JSON de uma @lista usada');
  assert.equal(read(dir, 's/components/endereco.js'), stub(astOf(ENDERECO, 'endereco', true), { script: 'endereco.js', data: ['estados.json'] }));
  assert.match(read(dir, 's/components/endereco.js'), /parte\.list\('estados', utils\.loadJson\('\.\/estados\.json'\)\);/);
});

test('zip de projeto da interface web (compatibilidade com @formularios/web)', async () => {
  const dir = tmp();
  const p = createProject('Loja');
  addForm(p, 'pessoa', PESSOA, 'component');
  addForm(p, 'endereco', ENDERECO, 'component').script = '// endereço escrito na web\n';
  addForm(p, 'clientes', exemplo).script = '// editado na web\n';
  addForm(p, 'pedido', SIMPLES);
  addData(p, 'estados', '["SP", "RJ"]');
  addData(p, 'extra', '{}');
  writeFileSync(path.join(dir, 'loja.zip'), await exportProject(p));

  const r = run(dir, 'build', 'loja.zip', 'saida');
  assert.equal(r.code, 0, r.err);
  assert.equal(read(dir, 'saida/clientes.js'), '// editado na web\n');
  assert.equal(read(dir, 'saida/components/endereco.js'), '// endereço escrito na web\n');
  assert.equal(read(dir, 'saida/pedido.js'), stub(astOf(SIMPLES, 'pedido'), { script: 'pedido.js', data: ['estados.json', 'extra.json'] }));
  assert.equal(read(dir, 'saida/extra.json'), '{}', 'com project.json, vão todos os dados listados');

  // A CLI grava exatamente o que a interface põe no zip de HTMLs.
  const runtimeDir = path.dirname(fileURLToPath(import.meta.resolve('@formularios/runtime')));
  const runtime = readdirSync(runtimeDir).map((name) => ({ name, data: read(runtimeDir, name) }));
  const { files, problems } = buildFiles(p, runtime);
  assert.deepEqual(problems, []);
  const saida = [...ls(dir, 'saida').filter((n) => n !== 'components'), ...ls(dir, 'saida/components').map((n) => `components/${n}`)];
  assert.deepEqual(saida.sort(), files.map((f) => f.name).sort());
  for (const f of files) assert.equal(read(dir, `saida/${f.name}`), f.data, f.name);
});

test('regravar: HTML igual não muda; diferente só com --force; JS escrito nunca sem perguntar', () => {
  const dir = tmp();
  write(dir, { 'e/pages/pedido.form': SIMPLES, 'e/pages/pedido.js': '// v1\n' });
  assert.equal(run(dir, 'build', 'e', 's').code, 0);
  assert.match(run(dir, 'build', 'e', 's').out, /igual: s\/pedido\.html/);

  write(dir, { 'e/pages/pedido.form': SIMPLES.replace('Nome', 'Cliente'), 'e/pages/pedido.js': '// v2\n' });
  const sem = run(dir, 'build', 'e', 's');
  assert.match(sem.out, /mantido: s\/pedido\.html/);
  assert.doesNotMatch(read(dir, 's/pedido.html'), /Cliente/);

  const com = run(dir, 'build', 'e', 's', '--force');
  assert.match(com.out, /gravado: s\/pedido\.html/);
  assert.match(read(dir, 's/pedido.html'), /Cliente/);
  assert.match(com.out, /mantido: s\/pedido\.js/);
  assert.equal(read(dir, 's/pedido.js'), '// v1\n');
});

test('JS inicial não substitui um JS que já está na saída', () => {
  const dir = tmp();
  write(dir, { 'e/pages/pedido.form': SIMPLES, 's/pedido.js': '// meu\n' });
  const r = run(dir, 'build', 'e', 's');
  assert.match(r.out, /mantido: s\/pedido\.js/);
  assert.equal(read(dir, 's/pedido.js'), '// meu\n');
});

test('check: erros com arquivo:linha:coluna (também dos componentes) e código de saída; nada é gravado', () => {
  const dir = tmp();
  write(dir, {
    'e/pages/bom.form': SIMPLES,
    'e/pages/usa.form': '-Usa\n--Casa{casa}\n+ruim\n',
    'e/components/ruim.form': 'Campo: 99x99\n',
    'e/components/ok.form': 'X: ___\n',
  });
  const r = run(dir, 'check', 'e');
  assert.equal(r.code, 1);
  assert.match(r.err, /erro: e\/components\/ruim\.form:1:8: especificador não reconhecido/);
  assert.match(r.err, /erro: e\/pages\/usa\.form:3:1: componente "ruim" com erro — ruim\.form:1:8/);
  assert.match(r.out, /e\/pages\/bom\.form: ok/);
  assert.match(r.out, /e\/components\/ok\.form: ok/);
  assert.deepEqual(ls(dir, 'e'), ['components', 'pages']);
});

test('nomes: página com o nome de um arquivo do runtime é erro; o resto é gerado', () => {
  const dir = tmp();
  write(dir, { 'e/pages/a.form': SIMPLES, 'e/pages/forms.form': SIMPLES, 'e/components/forms.form': 'X: ___\n' });
  const r = run(dir, 'build', 'e', 's');
  assert.equal(r.code, 1);
  assert.match(r.err, /e\/pages\/forms\.form:1:1: o JS da página \(forms\.js\) coincidiria com um arquivo do runtime/);
  assert.doesNotMatch(r.err, /components\/forms/, 'componente pode se chamar forms: o JS dele vai para components/');
  assert.deepEqual(ls(dir, 's'), ['a.html', 'a.js', ...RUNTIME_FILES]);
  assert.equal(read(dir, 's/forms.js'), read(path.dirname(BIN), '../../runtime/src/forms.js'));
});

test('uso e entrada inválida', () => {
  const dir = tmp();
  write(dir, { 'sem/pedido.form': SIMPLES, 'so.form': SIMPLES });
  assert.equal(run(dir, 'build', 'x').code, 1);
  assert.match(run(dir, 'build', 'nao-existe', 's').err, /entrada não encontrada/);
  assert.match(run(dir, 'build', 'sem', 's').err, /nenhuma página em sem: o projeto precisa de pages\/\*\.form/);
  assert.match(run(dir, 'build', 'so.form', 's').err, /entrada deve ser a pasta do projeto/);
  assert.match(run(dir, 'build', 'nao-existe', 's', '--xyz').err, /opção desconhecida: --xyz/);
  assert.equal(run(dir, '--help').code, 0);
});
