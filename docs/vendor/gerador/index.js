// @formularios/gerador: texto .form -> HTML. Roda igual no navegador e no Node
// (sem DOM, sem fs); a única dependência é a tabela de máscaras do runtime.
import { parse } from './parser.js';
import { render } from './renderer.js';

export { FILE_NAME, includesOf, parse, renameInclude } from './parser.js';
export { render, BOOTSTRAP_CSS } from './renderer.js';
export { distribute } from './layout.js';
export { slug } from './slug.js';
export { ident, stub } from './stub.js';

// generate(texto, opções) -> { html, ast, errors, warnings }
// opções do parse: { name, components, component } (ver parser.js);
// do render: { page, buttons } e, com page: true, { script: 'clientes.js' | false, stylesheet, lang }.
// Sem page, html é só o <form>…</form>.
export function generate(text, options = {}) {
  const { ast, errors, warnings } = parse(text, options);
  if (errors.length) return { html: null, ast, errors, warnings };
  return { html: render(ast, options), ast, errors, warnings };
}

// Componentes que o formulário usa, inclusive os incluídos por outros componentes.
export function componentsOf(ast) {
  const out = new Set();
  const walk = (children) => {
    for (const node of children) {
      if (node.type !== 'group') continue;
      if (node.component) out.add(node.component);
      walk(node.children);
    }
  };
  walk(ast.children);
  return [...out];
}

// "clientes.form:7:28: mensagem "trecho""
export function formatIssue(issue, file = '') {
  const where = `${file ? `${file}:` : ''}${issue.line}:${issue.column}`;
  const extra = issue.excerpt && !issue.message.includes(issue.excerpt) ? ` — "${issue.excerpt}"` : '';
  return `${where}: ${issue.message}${extra}`;
}
