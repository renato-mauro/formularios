#!/usr/bin/env node
// CLI em lote: formularios build <entrada> <saída> | formularios check <entrada>
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { formatIssue } from '@formularios/gerador';
import { COMPONENTS, PAGES, readInput } from '../src/input.js';
import { plan } from '../src/plan.js';

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.resolve('@formularios/runtime')));

const USAGE = `Uso:
  formularios build <projeto> <saída> [opções]   gera as páginas do projeto na pasta de saída
  formularios check <projeto>                     só verifica as especificações

<projeto>: a pasta do projeto ou o .zip de projeto da interface web, com as pastas
  ${PAGES}/       formulários que viram páginas (x.form e, se escrito, o x.js)
  ${COMPONENTS}/  formulários incluídos com "+nome" (y.form e, se escrito, o y.js)
e, na raiz, os arquivos de dados (.json) e o project.json (opcional).
A saída recebe x.html e x.js de cada página, ${COMPONENTS}/y.js de cada componente
usado, os arquivos de dados das @listas (<lista>.json) e o runtime.

Opções do build:
  --no-runtime   não copia o runtime (forms.js, masks.js, utils.js, forms.d.ts)
  --no-stub      não cria o JS inicial (a tag continua no HTML)
  --no-script    não inclui a tag nem o JS
  --force        sobrescreve o HTML, os dados e o runtime sem perguntar
                 (o JS sempre pergunta)`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help') return print(USAGE, 0);
  if (!['build', 'check'].includes(command)) return print(USAGE, 1);

  const opts = { runtime: true, script: true, stub: true, force: false };
  const args = [];
  for (const a of rest) {
    if (a === '--no-runtime') opts.runtime = false;
    else if (a === '--no-script') opts.script = false;
    else if (a === '--no-stub') opts.stub = false;
    else if (a === '--force') opts.force = true;
    else if (a.startsWith('-')) return print(`opção desconhecida: ${a}\n\n${USAGE}`, 1);
    else args.push(a);
  }
  if (args.length !== (command === 'build' ? 2 : 1)) return print(USAGE, 1);
  const [input, out] = args;

  let info;
  let files;
  try {
    info = await stat(input);
    files = await readInput(input);
  } catch (error) {
    return print(error.code === 'ENOENT' ? `entrada não encontrada: ${input}` : error.message, 1);
  }
  if (![...files.keys()].some((f) => f.startsWith(`${PAGES}/`) && f.endsWith('.form'))) {
    return print(`nenhuma página em ${input}: o projeto precisa de ${PAGES}/*.form`, 1);
  }

  const where = (file) => (info.isDirectory() ? path.relative(process.cwd(), path.join(input, file)) : `${input}:${file}`);

  const all = await runtimeFiles();
  const runtime = command === 'build' && opts.runtime ? all : [];
  const result = await plan(files, { runtime, reserved: all.map((f) => f.name), script: opts.script, stubs: opts.stub });
  for (const { file, level, issue } of result.issues) {
    (level === 'erro' ? console.error : console.warn)(`${level}: ${formatIssue(issue, where(file))}`);
  }
  const failed = new Set(result.issues.filter((i) => i.level === 'erro').map((i) => i.file));

  if (command === 'check') {
    for (const f of [...result.pages, ...result.components]) if (!failed.has(f)) console.log(`${where(f)}: ok`);
    return failed.size ? 1 : 0;
  }

  const ask = asker();
  try {
    for (const o of result.outputs) await save(path.join(out, o.path), o, opts.force, ask);
  } finally {
    ask.close();
  }
  console.log(`${result.built} de ${result.pages.length} página(s) gerada(s) em ${out}`);
  return failed.size ? 1 : 0;
}

async function runtimeFiles() {
  const names = (await readdir(RUNTIME_DIR, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name).sort();
  return Promise.all(names.map(async (name) => ({ name, content: await readFile(path.join(RUNTIME_DIR, name), 'utf8') })));
}

// Grava o arquivo. Se já existir com outro conteúdo: HTML, dados e runtime perguntam
// (ou --force); o JS escrito sempre pergunta; o JS inicial nunca substitui nada.
async function save(file, { content, kind }, force, ask) {
  const rel = path.relative(process.cwd(), file);
  if (await exists(file)) {
    if (kind === 'stub') return console.log(`mantido: ${rel}`);
    const current = await readFile(file, 'utf8');
    if (current === content) return console.log(`igual: ${rel}`);
    const forced = force && kind !== 'script';
    if (!forced && !(await ask(`${rel} já existe e é diferente. Sobrescrever? (s/N) `))) {
      return console.log(`mantido: ${rel}`);
    }
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  console.log(`gravado: ${rel}`);
}

function asker() {
  if (!process.stdin.isTTY) {
    const ask = async (question) => {
      console.log(`${question}não (terminal não interativo; use --force para o HTML e o runtime)`);
      return false;
    };
    ask.close = () => {};
    return ask;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question) => /^s(im)?$/i.test((await rl.question(question)).trim());
  ask.close = () => rl.close();
  return ask;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function print(message, code) {
  (code ? console.error : console.log)(message);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
