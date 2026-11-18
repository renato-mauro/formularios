// Publica a interface web no GitHub Pages sem GitHub Actions: testa, monta
// packages/web/dist e grava o conteúdo dele como um novo commit do branch
// gh-pages (só o site, sem o código), depois envia o branch para o origin.
// O branch de trabalho não muda: o commit é montado com um índice temporário.
// Uso: npm run publicar   (--sem-push: só grava o branch local)
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(REPO, 'packages/web/dist');
const BRANCH = 'gh-pages';
const INDEX = path.join(REPO, '.git', 'publicar-index');
const push = !process.argv.includes('--sem-push');

const git = (args, { env = {}, cwd = REPO } = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const npm = (script) => execFileSync('npm', ['run', script], { cwd: REPO, stdio: 'inherit' });
const tryGit = (args) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};
const fail = (message) => {
  console.error(`publicar: ${message}`);
  process.exit(1);
};

// O site publicado corresponde a um commit: nada pendente no código.
if (git(['status', '--porcelain'])) fail('há mudanças não commitadas; faça o commit antes de publicar');
const origin = tryGit(['remote', 'get-url', 'origin']);
if (push && !origin) fail('sem remote "origin"; use git remote add origin <url> (ou --sem-push)');

npm('test');
npm('build');
writeFileSync(path.join(DIST, '.nojekyll'), ''); // o Pages serve os arquivos como estão, sem Jekyll

const source = git(['rev-parse', '--short', 'HEAD']);
const parent = previous();

let tree;
try {
  const env = { GIT_INDEX_FILE: INDEX };
  git(['--git-dir', path.join(REPO, '.git'), '--work-tree', DIST, 'add', '--all', '--force', '.'], { env, cwd: DIST });
  tree = git(['write-tree'], { env });
} finally {
  rmSync(INDEX, { force: true });
}

if (parent && git(['rev-parse', `${parent}^{tree}`]) === tree) {
  console.log(`publicar: o site não mudou desde a última publicação (${BRANCH}).`);
} else {
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Site gerado de ${source}`]);
  git(['update-ref', `refs/heads/${BRANCH}`, commit]);
  console.log(`publicar: ${BRANCH} = ${commit.slice(0, 7)} (site gerado de ${source})`);
}

if (push) {
  execFileSync('git', ['push', 'origin', `${BRANCH}:${BRANCH}`], { cwd: REPO, stdio: 'inherit' });
  console.log('publicar: enviado. O GitHub Pages atualiza em cerca de um minuto.');
} else {
  console.log(`publicar: branch ${BRANCH} gravado localmente (sem push).`);
}

// O último site publicado: o gh-pages local ou, num clone novo, o do origin.
function previous() {
  const local = tryGit(['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`]);
  if (local || !origin) return local;
  return tryGit(['fetch', '--quiet', 'origin', BRANCH]) === null ? null : tryGit(['rev-parse', '--verify', '--quiet', 'FETCH_HEAD']);
}
