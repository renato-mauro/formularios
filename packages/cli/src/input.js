// Entrada da CLI: um projeto, como pasta ou como o zip de projeto da interface web
// (agentes.md §10.3). Pastas fixas: pages/ (formulários que viram páginas) e
// components/ (formulários incluídos com "+nome"), cada .form com o seu .js ao lado
// quando o JS foi escrito; na raiz, o project.json e os arquivos de dados (.json).
// Devolve Map<caminho relativo à raiz do projeto, () => Promise<string>>.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { unzip } from './zip.js';

export const PAGES = 'pages';
export const COMPONENTS = 'components';

// O que interessa no projeto: "pages/x.form", "components/y.js", "estados.json"...
export function inProject(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => !p || p.startsWith('.'))) return false;
  if (parts.length === 1) return rel.endsWith('.json');
  return parts.length === 2 && [PAGES, COMPONENTS].includes(parts[0]) && /\.(form|js)$/.test(parts[1]);
}

export async function readInput(entry) {
  const info = await stat(entry);
  if (info.isDirectory()) return fromDir(entry);
  if (entry.endsWith('.zip')) return fromZip(await readFile(entry));
  throw new Error(`entrada deve ser a pasta do projeto (com ${PAGES}/ e ${COMPONENTS}/) ou o .zip de projeto: ${entry}`);
}

async function fromDir(root) {
  const files = new Map();
  for (const dir of ['', PAGES, COMPONENTS]) {
    let items;
    try {
      items = await readdir(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue; // pasta que não existe
    }
    for (const item of items) {
      const rel = dir ? `${dir}/${item.name}` : item.name;
      if (item.isFile() && inProject(rel)) files.set(rel, () => readFile(path.join(root, rel), 'utf8'));
    }
  }
  return files;
}

function fromZip(buf) {
  const entries = new Map();
  for (const { name, data } of unzip(buf)) {
    const rel = path.posix.normalize(name.replace(/\\/g, '/'));
    if (rel.startsWith('../') || rel.startsWith('/') || rel.startsWith('__MACOSX/')) continue;
    entries.set(rel, data);
  }
  const root = projectRoot([...entries.keys()]);
  const files = new Map();
  for (const [name, data] of entries) {
    const rel = name.slice(root.length);
    if (!name.startsWith(root) || !inProject(rel)) continue;
    const text = data.toString('utf8');
    files.set(rel, async () => text);
  }
  return files;
}

// Pasta do zip onde está o projeto: a do project.json mais raso ou, sem ele, a que tem pages/.
export function projectRoot(names) {
  const roots = names.map((n) => /^((?:[^/]+\/)*?)(?:project\.json|pages\/[^/]+\.form)$/.exec(n)?.[1]).filter((r) => r !== undefined);
  return roots.sort((a, b) => a.length - b.length)[0] ?? '';
}
