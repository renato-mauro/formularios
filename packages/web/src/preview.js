// Documento da pré-visualização: a página gerada (sem a tag do integrador) com o JS
// do integrador inline. A <base> aponta para a pasta do runtime, então o
// import './forms.js' do integrador funciona como no zip de HTMLs; os arquivos de
// dados do projeto (fetch('./estados.json')) são servidos da memória.

// Roda dentro do iframe antes de tudo: serve os arquivos de dados, guarda o Form
// (fm:ready) e avisa a janela de cima sobre ações, erros e avisos do runtime
// ("Form..." no console). Manda os pontos do stack que são do documento
// (about:srcdoc) ou do JS de um componente (blob:); a janela de cima escolhe o
// primeiro que é do JS da página ou de um componente, mesmo quando o erro é
// lançado dentro do runtime.
const BRIDGE = `(() => {
  const send = (type, payload) => parent.postMessage({ preview: true, type, payload }, '*');
  window.__preview = { form: null };
  const files = new Map(Object.entries(__FILES__).map(([name, text]) => [new URL(name, document.baseURI).href, text]));
  const fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI).href;
    if (!files.has(url)) return fetch(input, init);
    return Promise.resolve(new Response(files.get(url), { headers: { 'Content-Type': 'application/json' } }));
  };
  const framesOf = (error) => [...((error && error.stack) || '').matchAll(/(about:srcdoc|blob:[^\\s)]+?):(\\d+):\\d+/g)]
    .map((m) => ({ url: m[1], line: Number(m[2]) }));
  const warn = console.warn.bind(console);
  console.warn = (...args) => {
    warn(...args);
    const message = args.map(String).join(' ');
    if (message.startsWith('Form')) send('warning', { message, frames: framesOf(new Error()) });
  };
  document.addEventListener('fm:ready', (e) => { window.__preview.form = e.detail.form; });
  document.addEventListener('fm:action', (e) => send('action', { action: e.detail.action, data: e.detail.data }));
  document.addEventListener('fm:error', (e) => {
    const error = e.detail.error;
    const message = '[' + e.detail.source + '] ' + (error && error.message ? error.message : String(error));
    send('error', { message, frames: framesOf(error) });
  });
  // Erro antes do fm:ready: o JS parou e a página ficou sem máscaras, botões e listas.
  window.addEventListener('error', (e) => {
    const frames = [...framesOf(e.error), ...(e.filename ? [{ url: e.filename, line: e.lineno }] : [])];
    send('error', { message: e.message, frames, stopped: !window.__preview.form });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const message = String(e.reason && e.reason.message ? e.reason.message : e.reason);
    send('error', { message, frames: framesOf(e.reason), stopped: !window.__preview.form });
  });
})();`;

// page: HTML de generate(text, { page: true, script: false })
// files: { 'estados.json': '[...]' } — arquivos de dados do projeto
// imports: import map { url: url } — o JS dos componentes (ver linkComponents)
// -> { html, scriptLine }: scriptLine é a linha do documento onde começa o JS da
// página, para converter a linha de um erro em linha do editor.
export function previewDocument(page, script, runtimeDir, files = {}, imports = {}) {
  const bridge = BRIDGE.replace('__FILES__', () => JSON.stringify(files).replace(/</g, '\\u003c'));
  const map = Object.keys(imports).length
    ? `\n<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script>`
    : '';
  const head = `<head>\n<base href="${escapeAttr(runtimeDir)}">${map}\n<script>${bridge}</script>`;
  const withHead = page.replace('<head>', head);
  const at = withHead.lastIndexOf('</body>');
  const before = `${withHead.slice(0, at)}<script type="module">\n`;
  const scriptLine = before.split('\n').length;
  const html = `${before}${script.replace(/<\/(script)/gi, '<\\/$1')}\n</script>\n${withHead.slice(at)}`;
  return { html, scriptLine };
}

// JS dos componentes na pré-visualização: cada um vira um módulo (makeUrl(código,
// nome) -> url, um blob: no navegador), com os imports relativos de um componente
// ('./x.js', '../forms.js') religados. imports é o import map que leva
// <runtimeDir>components/x.js — onde form.ready() e a página o procuram, já que a
// <base> do documento é a pasta do runtime — ao blob.
// scripts: { nome: código } -> { urls: Map<nome, url>, imports }.
export function linkComponents(scripts, runtimeDir, makeUrl) {
  const urls = new Map();
  const busy = new Set();
  const url = (name) => {
    if (!Object.hasOwn(scripts, name)) return null;
    if (urls.has(name)) return urls.get(name);
    if (busy.has(name)) return null; // imports em ciclo: fica o original, que falha ao rodar
    busy.add(name);
    const code = scripts[name]
      .replace(/(['"])\.\/([\w-]+)\.js\1/g, (m, q, dep) => (url(dep) ? `${q}${url(dep)}${q}` : m))
      .replace(/(['"])\.\.\/((?:forms|masks|utils)\.js)\1/g, (m, q, file) => `${q}${new URL(file, runtimeDir).href}${q}`);
    urls.set(name, makeUrl(code, name));
    return urls.get(name);
  };
  for (const name of Object.keys(scripts)) url(name);
  const imports = Object.fromEntries([...urls].map(([name, u]) => [new URL(`components/${name}.js`, runtimeDir).href, u]));
  return { urls, imports };
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
