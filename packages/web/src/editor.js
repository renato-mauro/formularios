// Editores de código: CodeMirror 6 (do CDN, pelo import map do index.html) com
// destaque de sintaxe, autocompletar e snippets. O <textarea> original funciona
// desde o início e é trocado pelo CodeMirror quando ele carrega; sem rede, fica.
import { completeForm, completeJs, completeJson } from './api.js';

let loading = null;

function loadCodeMirror() {
  loading ??= Promise.all([
    import('@codemirror/state'), import('@codemirror/view'), import('@codemirror/language'),
    import('@codemirror/commands'), import('@codemirror/autocomplete'), import('@codemirror/search'),
    import('@codemirror/lint'), import('@codemirror/lang-javascript'), import('@codemirror/lang-json'),
    import('@lezer/highlight'),
  ]).then(([state, view, language, commands, autocomplete, search, lint, javascript, json, highlight]) => ({
    state, view, language, commands, autocomplete, search, lint, javascript, json, highlight,
  }));
  return loading;
}

const DEFAULT_FONT_SIZE = 13; // px; o mesmo do .editor-texto (app.css)

// textarea: o elemento que o editor substitui; language: 'form' | 'js' | 'json' | 'html';
// onChange(texto): só para edições do usuário; context(): o que o autocompletar
// precisa saber (outline do .form aberto, ver api.js); readOnly: só para ler
// (dá para selecionar, copiar e buscar, não para editar).
export function codeEditor(textarea, { language, onChange = () => {}, context = () => undefined, readOnly = false }) {
  let cm = null;
  let view = null;
  let hidden = textarea.hidden;
  let dark = false;
  let darkSlot = null;
  let fontSize = DEFAULT_FONT_SIZE;
  let fontSlot = null;

  const extensions = () => setup(cm, {
    language, onChange: (text) => onChange(text), context, darkSlot, dark, fontSlot, fontSize, readOnly,
  });
  textarea.readOnly = readOnly;

  const api = {
    get value() {
      return view ? view.state.doc.toString() : textarea.value;
    },
    // Troca o documento inteiro (outro formulário, JS inicial regenerado): sem
    // onChange e sem histórico de desfazer misturado com o documento anterior.
    setValue(text) {
      if (api.value === text) return;
      if (view) view.setState(cm.state.EditorState.create({ doc: text, extensions: extensions() }));
      else textarea.value = text;
    },
    // Troca só o trecho que mudou, sem mexer na rolagem nem na seleção (para
    // um documento que acompanha outro, como o HTML gerado).
    update(text) {
      if (!view) {
        textarea.value = text;
        return;
      }
      const old = view.state.doc.toString();
      if (old === text) return;
      let from = 0;
      while (from < old.length && from < text.length && old[from] === text[from]) from++;
      let end = 0;
      while (end < old.length - from && end < text.length - from && old[old.length - 1 - end] === text[text.length - 1 - end]) end++;
      view.dispatch({
        changes: { from, to: old.length - end, insert: text.slice(from, text.length - end) },
        annotations: cm.state.Transaction.addToHistory.of(false),
      });
    },
    // Troca o documento por `text` como uma edição do usuário (entra no desfazer e
    // chama onChange), mexendo só no trecho que mudou; depois seleciona as linhas
    // `from` a `to` (1 = a primeira).
    edit(text, from, to = from) {
      if (!view) {
        textarea.value = text;
        onChange(text);
        return selectTextareaLine(textarea, from);
      }
      const old = view.state.doc.toString();
      let a = 0;
      while (a < old.length && a < text.length && old[a] === text[a]) a++;
      let b = 0;
      while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
      view.dispatch({ changes: { from: a, to: old.length - b, insert: text.slice(a, text.length - b) }, userEvent: 'input' });
      const doc = view.state.doc;
      const first = doc.line(Math.max(1, Math.min(from, doc.lines)));
      const last = doc.line(Math.max(1, Math.min(to, doc.lines)));
      view.dispatch({ selection: { anchor: first.from, head: last.to }, scrollIntoView: true });
      view.focus();
    },
    // Linha do cursor (1 = a primeira).
    get cursorLine() {
      if (view) return view.state.doc.lineAt(view.state.selection.main.head).number;
      return textarea.value.slice(0, textarea.selectionStart).split('\n').length;
    },
    focus() {
      (view ?? textarea).focus();
    },
    selectLine(n) {
      if (!view) return selectTextareaLine(textarea, n);
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
      view.focus();
    },
    get hidden() {
      return hidden;
    },
    set hidden(flag) {
      hidden = Boolean(flag);
      if (view) view.dom.hidden = hidden;
      else textarea.hidden = hidden;
    },
    setDark(flag) {
      dark = Boolean(flag);
      if (view) view.dispatch({ effects: darkSlot.reconfigure(cm.view.EditorView.darkTheme.of(dark)) });
    },
    // Tamanho da letra em px. Vai como tema: é a mudança de tema que faz o
    // CodeMirror medir de novo a altura das linhas (e os números da margem).
    setFontSize(px) {
      fontSize = px;
      textarea.style.fontSize = `${px}px`;
      if (view) view.dispatch({ effects: fontSlot.reconfigure(fontTheme(cm, fontSize)) });
    },
  };

  textarea.addEventListener('input', () => {
    if (!view) onChange(textarea.value);
  });

  loadCodeMirror().then((loaded) => {
    cm = loaded;
    darkSlot = new cm.state.Compartment();
    fontSlot = new cm.state.Compartment();
    const focused = document.activeElement === textarea;
    view = new cm.view.EditorView({
      state: cm.state.EditorState.create({ doc: textarea.value, extensions: extensions() }),
    });
    view.dom.hidden = hidden;
    textarea.after(view.dom);
    textarea.hidden = true;
    if (focused) view.focus();
  }).catch((error) => {
    console.warn('Editor: CodeMirror indisponível; usando o campo de texto simples.', error);
  });

  return api;
}

function setup(cm, { language, onChange, context, darkSlot, dark, fontSlot, fontSize, readOnly }) {
  const { EditorState } = cm.state;
  const { EditorView, keymap } = cm.view;
  const { autocomplete, commands, search, lint } = cm;
  return [
    cm.view.lineNumbers(),
    cm.view.highlightActiveLineGutter(),
    cm.view.highlightSpecialChars(),
    commands.history(),
    cm.view.drawSelection(),
    cm.view.dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    cm.language.indentOnInput(),
    cm.language.bracketMatching(),
    cm.language.indentUnit.of('  '),
    EditorState.tabSize.of(2),
    autocomplete.closeBrackets(),
    autocomplete.autocompletion(),
    cm.view.highlightActiveLine(),
    search.highlightSelectionMatches(),
    keymap.of([
      ...autocomplete.closeBracketsKeymap, ...commands.defaultKeymap, ...search.searchKeymap,
      ...commands.historyKeymap, ...autocomplete.completionKeymap, ...lint.lintKeymap,
      // Só leitura: Tab sai do editor em vez de ficar preso nele.
      ...(readOnly ? [] : [commands.indentWithTab]),
    ]),
    EditorState.readOnly.of(readOnly),
    cm.language.syntaxHighlighting(highlightStyle(cm)),
    theme(cm),
    darkSlot.of(EditorView.darkTheme.of(dark)),
    fontSlot.of(fontTheme(cm, fontSize)),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
    ...languageSupport(cm, language, context),
  ];
}

function languageSupport(cm, language, context) {
  const source = (complete) => (ctx) => {
    const r = complete(ctx.state.doc.toString(), ctx.pos, context(), ctx.explicit);
    if (!r || !r.options.length) return null;
    return {
      from: r.from,
      validFor: r.validFor,
      options: r.options.map((o) => (o.snippet
        ? cm.autocomplete.snippetCompletion(o.snippet, { label: o.label, type: o.type, detail: o.detail, info: o.info })
        : { label: o.label, type: o.type, detail: o.detail, info: o.info })),
    };
  };
  if (language === 'js') {
    return [cm.javascript.javascript(), cm.javascript.javascriptLanguage.data.of({ autocomplete: source(completeJs) })];
  }
  if (language === 'json') {
    return [
      cm.json.json(), cm.json.jsonLanguage.data.of({ autocomplete: source(completeJson) }),
      cm.lint.linter(cm.json.jsonParseLinter()), cm.lint.lintGutter(),
    ];
  }
  if (language === 'html') return [cm.language.StreamLanguage.define(HTML_MODE)];
  const form = cm.language.StreamLanguage.define(FORM_MODE);
  return [form, form.data.of({ autocomplete: source(completeForm) })];
}

// Destaque do .form: títulos, inclusões (+componente), máscaras/especificadores,
// @listas, {nomes}, *, opções.
const FORM_MODE = {
  name: 'form',
  startState: () => ({ spec: false, include: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.spec = false;
      state.include = false;
      if (stream.match(/^\s*-+.*/)) return 'heading';
      if (stream.match(/^\s*\+/)) {
        state.include = true;
        return 'keyword';
      }
      if (stream.match(/^\s*(\([^)]*\)|\[[^\]]*\])(?=\s)/)) return 'atom';
    }
    if (state.include) {
      if (stream.eatSpace()) return null;
      if (stream.match(/^[\w-]+\s*$/)) return 'typeName';
      if (stream.match(/^\{[^}]*\}/)) return 'labelName';
      if (stream.match(':')) return 'punctuation';
      if (stream.match(/^[^{:]+/)) return 'heading';
      stream.next();
      return null;
    }
    if (state.spec) {
      if (stream.eatSpace()) return null;
      state.spec = false;
      if (stream.match(/^@[\w-]+(\{\d+\})?/)) return 'typeName';
      if (stream.match(/^(R\$\s*_*|email_*|dd\/mm\/aaaa|hh:mm|\(\d\d\) \d{4,5}-\d{4}|[09A*().\/\-,+#]+)(\{\d+\})?/)) return 'string';
      if (stream.match(/^_+(\{\d+\})?/)) return 'meta';
    }
    if (stream.match(/^\{[^}]*\}/)) return 'labelName';
    if (stream.match('*')) return 'operator';
    if (stream.match(':')) {
      state.spec = true;
      return 'punctuation';
    }
    if (stream.match(/^_+/)) return 'meta';
    stream.next();
    return null;
  },
};

// Destaque do HTML gerado (só leitura): basta para o que o gerador escreve —
// doctype, comentários, tags, atributos, valores e entidades.
const HTML_MODE = {
  name: 'html',
  startState: () => ({ tag: null, comment: false }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo('-->')) {
        stream.match('-->');
        state.comment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (state.tag === 'name') {
      state.tag = 'attrs';
      if (stream.match(/^[\w-]+/)) return 'tagName';
    }
    if (state.tag === 'attrs') {
      if (stream.eatSpace()) return null;
      if (stream.match('/>') || stream.eat('>')) {
        state.tag = null;
        return 'angleBracket';
      }
      if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return 'attributeValue';
      if (stream.eat('=')) return 'operator';
      if (stream.match(/^[^\s=>/"']+/)) return 'attributeName';
      stream.next();
      return null;
    }
    if (stream.match('<!--')) {
      state.comment = true;
      return 'comment';
    }
    if (stream.match(/^<![^>]*>/)) return 'meta';
    if (stream.match(/^<\/?(?=[A-Za-z])/)) {
      state.tag = 'name';
      return 'angleBracket';
    }
    if (stream.match(/^&#?\w+;/)) return 'character';
    if (!stream.eatWhile(/[^<&]/)) stream.next();
    return null;
  },
};

// Cores vêm de variáveis CSS (app.css), então seguem o tema claro/escuro sozinhas.
function highlightStyle(cm) {
  const t = cm.highlight.tags;
  return cm.language.HighlightStyle.define([
    { tag: t.keyword, color: 'var(--cm-keyword)' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--cm-string)' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
    { tag: t.comment, color: 'var(--cm-comment)', fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
    { tag: [t.propertyName, t.labelName], color: 'var(--cm-property)' },
    { tag: [t.typeName, t.className, t.definition(t.typeName)], color: 'var(--cm-type)' },
    { tag: t.heading, color: 'var(--cm-heading)', fontWeight: 'bold' },
    { tag: t.tagName, color: 'var(--cm-tag)' },
    { tag: t.attributeName, color: 'var(--cm-attribute)' },
    { tag: t.attributeValue, color: 'var(--cm-string)' },
    { tag: t.character, color: 'var(--cm-number)' },
    { tag: t.angleBracket, color: 'var(--cm-meta)' },
    { tag: t.operator, color: 'var(--cm-operator)' },
    { tag: [t.meta, t.punctuation], color: 'var(--cm-meta)' },
    { tag: t.invalid, color: 'var(--bs-danger)' },
  ]);
}

function theme(cm) {
  return cm.view.EditorView.theme({
    '&': { flex: '1', minHeight: '0', color: 'var(--bs-body-color)', backgroundColor: 'var(--bs-body-bg)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--bs-font-monospace)', lineHeight: '1.5' },
    '.cm-content': { caretColor: 'var(--bs-body-color)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--bs-body-color)' },
    '.cm-gutters': { color: 'var(--bs-secondary-color)', backgroundColor: 'var(--bs-tertiary-bg)', borderRight: '1px solid var(--bs-border-color)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'var(--cm-selection) !important' },
    '.cm-selectionMatch': { backgroundColor: 'var(--cm-match)' },
    '.cm-tooltip': { color: 'var(--bs-body-color)', backgroundColor: 'var(--bs-body-bg)', border: '1px solid var(--bs-border-color)', borderRadius: 'var(--bs-border-radius)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { color: '#fff', backgroundColor: 'var(--bs-primary)' },
    '.cm-completionDetail': { marginLeft: '.75em', fontStyle: 'normal', opacity: '.7' },
    '.cm-completionInfo': { padding: '.4em .6em', maxWidth: '22em' },
    '.cm-panels': { color: 'var(--bs-body-color)', backgroundColor: 'var(--bs-tertiary-bg)' },
    '.cm-panels-bottom': { borderTop: '1px solid var(--bs-border-color)' },
    '.cm-searchMatch': { backgroundColor: 'var(--cm-match)', outline: '1px solid var(--cm-match-border)' },
    '.cm-snippetField': { backgroundColor: 'var(--cm-match)' },
  });
}

function fontTheme(cm, px) {
  return cm.view.EditorView.theme({ '&': { fontSize: `${px}px` } });
}

function selectTextareaLine(area, n) {
  const lines = area.value.split('\n');
  let pos = 0;
  for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  area.focus();
  area.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
  const height = parseFloat(getComputedStyle(area).lineHeight) || 20;
  area.scrollTop = Math.max(0, (n - 5) * height);
}
