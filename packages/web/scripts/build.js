// Monta docs/ na raiz do repositório: a interface mais cópias do gerador e do
// runtime em vendor/ (cópia simples, sem bundler), com o import map apontando
// para elas. É o site do GitHub Pages (main, pasta /docs) e pode ir para
// qualquer hospedagem estática.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(WEB, '../../docs');
const VENDOR = { gerador: '@formularios/gerador', runtime: '@formularios/runtime' };

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(path.join(WEB, 'src'), path.join(DIST, 'src'), { recursive: true });

const dirs = Object.entries(VENDOR).map(([name, pkg]) => [name, path.dirname(fileURLToPath(import.meta.resolve(pkg)))]);
for (const [name, dir] of dirs) await cp(dir, path.join(DIST, 'vendor', name), { recursive: true });

// "../gerador/src/index.js" -> "./vendor/gerador/index.js"; endereços de CDN ficam.
const vendored = (target) => {
  if (/^https?:/.test(target)) return target;
  const file = path.resolve(WEB, target);
  const found = dirs.find(([, dir]) => file.startsWith(dir + path.sep));
  if (!found) throw new Error(`import map: ${target} não pertence a ${Object.values(VENDOR).join(' nem ')}`);
  return `./vendor/${found[0]}/${path.relative(found[1], file).split(path.sep).join('/')}`;
};

const html = (await readFile(path.join(WEB, 'index.html'), 'utf8'))
  .replace(/\n\s*<!-- Pacotes do monorepo[\s\S]*?-->/, '\n  <!-- CodeMirror do esm.sh (dependências externas, versões fixas); o resto em ./vendor. -->')
  .replace(/(<script type="importmap">)([\s\S]*?)(\s*<\/script>)/, (_, open, json, close) => {
    const map = JSON.parse(json);
    for (const key of Object.keys(map.imports)) map.imports[key] = vendored(map.imports[key]);
    return `${open}\n  ${JSON.stringify(map, null, 2).replace(/\n/g, '\n  ')}${close}`;
  });
await writeFile(path.join(DIST, 'index.html'), html);
await writeFile(path.join(DIST, '.nojekyll'), ''); // o GitHub Pages serve os arquivos como estão
console.log(`gravado: ${path.relative(path.resolve(WEB, '../..'), DIST)}${path.sep}`);
