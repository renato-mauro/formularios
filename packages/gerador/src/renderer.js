// AST -> HTML (agentes.md §5). Saída determinística, Bootstrap 5.3, sem classes próprias.
import { inputHints, parseMask } from '@formularios/runtime/masks';

export const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';

const REQUIRED_MARK = ' <span class="text-danger">*</span>';

// Por padrão devolve só o <form>; com { page: true }, a página completa.
// script: o JS da página, com o nome do formulário (o do arquivo: clientes.js).
// buttons: a barra de botões no fim do <form> (padrão true). Ela nasce com
// "Enviar"; o runtime a refaz com um botão por ação registrada (agentes.md §3.11).
export function render(ast, options = {}) {
  const { page = false, script = `${ast.name}.js`, stylesheet = BOOTSTRAP_CSS, lang = 'pt-BR', buttons = true } = options;
  const out = [];
  const w = (depth, line) => out.push(line ? '  '.repeat(depth) + line : '');

  if (!page) {
    renderForm(ast, 0, w, buttons);
    return out.join('\n') + '\n';
  }
  w(0, '<!DOCTYPE html>');
  w(0, `<html lang="${esc(lang)}">`);
  w(0, '<head>');
  w(1, '<meta charset="utf-8">');
  w(1, '<meta name="viewport" content="width=device-width, initial-scale=1">');
  w(1, `<title>${esc(ast.title ?? ast.name)}</title>`);
  w(1, `<link rel="stylesheet" href="${esc(stylesheet)}">`);
  if (script) w(1, `<script type="module" src="${esc(script)}"></script>`);
  w(0, '</head>');
  w(0, '<body class="bg-body-tertiary">');
  w(1, '<main class="container py-4">');
  renderForm(ast, 2, w, buttons);
  w(1, '</main>');
  w(0, '</body>');
  w(0, '</html>');
  return out.join('\n') + '\n';
}

function renderForm(ast, depth, w, buttons) {
  w(depth, `<form${attrs([['class', 'bg-body border rounded-3 p-4'], ['id', ast.name], ['novalidate', true]])}>`);
  if (ast.title) w(depth + 1, `<h1 class="h3 mb-4">${esc(ast.title)}</h1>`); // componente: sem título
  renderChildren(ast.children, depth + 1, w);
  if (buttons) renderButtons(depth + 1, w);
  w(depth, '</form>');
}

function renderChildren(children, depth, w) {
  for (const node of children) {
    switch (node.type) {
      case 'group': renderGroup(node, depth, w); break;
      case 'row': renderRow(node, depth, w); break;
      case 'options': renderOptions(node, depth, w); break;
      case 'longtext': renderLongtext(node, depth, w); break;
      default: break;
    }
  }
}

const headingClass = (level) => (level <= 2 ? 'h5 pb-2 border-bottom' : 'h6 pb-1 border-bottom');

function renderGroup(node, depth, w) {
  w(depth, '');
  w(depth, node.component
    ? `<!-- Componente ${node.component}: ${comment(node.title)} -->`
    : `<!-- Seção: ${comment(node.title)} -->`);
  // data-component: o runtime carrega components/<nome>.js e o chama com a parte desta seção.
  w(depth, `<fieldset${attrs([['class', node.level <= 2 ? 'mb-4' : 'mt-4 mb-3'], ['name', node.name], ['data-component', node.component]])}>`);
  w(depth + 1, `<legend class="${headingClass(node.level)}">${esc(node.title)}</legend>`);
  renderChildren(node.children, depth + 1, w);
  w(depth, '</fieldset>');
}

function renderRow(row, depth, w) {
  w(depth, '<div class="row g-3 mb-3">');
  for (const f of row.fields) {
    const col = f.cols === 12 ? 'col-12' : `col-12 col-md-${f.cols}`;
    if (f.type === 'check') {
      w(depth + 1, `<div class="${col} d-flex align-items-end">`);
      w(depth + 2, '<div class="form-check">');
      w(depth + 3, `<input${attrs([['type', 'checkbox'], ['class', 'form-check-input'], ['id', f.id], ['name', f.path], ['required', f.required]])}>`);
      w(depth + 3, `<label${attrs([['class', 'form-check-label'], ['for', f.id]])}>${esc(f.label)}${f.required ? REQUIRED_MARK : ''}</label>`);
      w(depth + 2, '</div>');
      w(depth + 1, '</div>');
      continue;
    }
    w(depth + 1, `<div class="${col}">`);
    w(depth + 2, `<label${attrs([['class', 'form-label'], ['for', f.id]])}>${esc(f.label)}${f.required ? REQUIRED_MARK : ''}</label>`);
    renderControl(f, depth + 2, w);
    w(depth + 1, '</div>');
  }
  w(depth, '</div>');
}

function renderControl(f, depth, w) {
  const base = [['id', f.id], ['name', f.path]];
  if (f.type === 'list') {
    w(depth, `<select${attrs([['class', 'form-select'], ...base, ['data-list', f.list], ['required', f.required]])}>`);
    w(depth + 1, '<option value="">Selecione…</option>');
    w(depth, '</select>');
    return;
  }
  if (f.type === 'text' || f.type === 'email') {
    w(depth, `<input${attrs([['type', f.type], ['class', 'form-control'], ...base, ['required', f.required]])}>`);
    return;
  }
  const hints = inputHints(parseMask(f.mask));
  const cls = hints.align === 'end' ? 'form-control text-end' : 'form-control';
  const input = `<input${attrs([
    ['type', 'text'], ['class', cls], ...base, ['data-mask', f.mask],
    ['placeholder', hints.placeholder], ['inputmode', hints.inputmode], ['maxlength', hints.maxlength],
    ['required', f.required],
  ])}>`;
  if (f.type === 'money') {
    w(depth, '<div class="input-group">');
    w(depth + 1, '<span class="input-group-text">R$</span>');
    w(depth + 1, input);
    w(depth, '</div>');
  } else {
    w(depth, input);
  }
}

function renderOptions(node, depth, w) {
  const type = node.multiple ? 'checkbox' : 'radio';
  w(depth, '');
  w(depth, `<!-- ${node.multiple ? 'Seleção múltipla' : 'Opções'}: ${comment(node.title)} -->`);
  w(depth, `<fieldset class="${node.level <= 2 ? 'mb-4' : 'mt-4 mb-3'}">`);
  w(depth + 1, `<legend class="${headingClass(node.level)}">${esc(node.title)}${node.required ? REQUIRED_MARK : ''}</legend>`);
  node.options.forEach((opt, i) => {
    const id = `${node.id}-${i + 1}`;
    w(depth + 1, '<div class="form-check">');
    w(depth + 2, `<input${attrs([['type', type], ['class', 'form-check-input'], ['id', id], ['name', node.path], ['value', opt.value], ['required', node.required]])}>`);
    w(depth + 2, `<label${attrs([['class', 'form-check-label'], ['for', id]])}>${esc(opt.label)}</label>`);
    w(depth + 1, '</div>');
  });
  w(depth, '</fieldset>');
}

function renderLongtext(node, depth, w) {
  w(depth, '');
  w(depth, `<!-- Texto longo: ${comment(node.title)} -->`);
  w(depth, `<div class="${node.level <= 2 ? 'mb-4' : 'mt-4 mb-3'}">`);
  w(depth + 1, `<label${attrs([['class', `form-label d-block ${headingClass(node.level)}`], ['for', node.id]])}>${esc(node.title)}${node.required ? REQUIRED_MARK : ''}</label>`);
  w(depth + 1, `<textarea${attrs([['class', 'form-control'], ['id', node.id], ['name', node.path], ['rows', node.rows], ['required', node.required]])}></textarea>`);
  w(depth, '</div>');
}

// Os botões não vêm do .form: a barra nasce com "Enviar" e o runtime a refaz com as
// ações registradas no JS da página.
function renderButtons(depth, w) {
  w(depth, '');
  w(depth, '<div class="d-flex gap-2 mt-2" data-buttons>');
  w(depth + 1, '<button type="button" class="btn btn-primary" data-action="enviar">Enviar</button>');
  w(depth, '</div>');
}

function attrs(list) {
  return list
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(String(v))}"`))
    .join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function comment(s) {
  return String(s).replace(/--/g, '- -').replace(/>/g, '&gt;');
}
