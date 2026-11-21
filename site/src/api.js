// O que o autocompletar sabe: a API do runtime (Form, Part, Field, utils), snippets e o
// que o .form aberto declara (campos, listas, componentes, máscaras, seções). Puro:
// sem DOM e sem CodeMirror; editor.js converte as sugestões (os testes rodam no Node).
//
// Cada função completeX(doc, pos, ...) devolve null ou
//   { from, options: [{ label, type, detail?, info?, snippet? }], validFor? }
// onde snippet usa a sintaxe do CodeMirror: ${nome} é um campo, ${} o cursor final.
import { ident } from '@formularios/gerador';

// ---------------------------------------------------------------- o .form aberto

// ast (de generate) + nomes dos arquivos de dados + componentes do projeto -> o que
// o JS pode referenciar. Num componente, os nomes são relativos a ele (os da parte).
// parts: as inclusões deste arquivo (não as de dentro dos componentes).
export function outline(ast, data = [], components = []) {
  const out = {
    name: ast?.name ?? null, kind: ast?.kind ?? 'page', fields: [], lists: [], actions: ['enviar'], masks: [],
    sections: [], parts: [], components, data,
  };
  const walk = (children, inside) => {
    for (const node of children) {
      if (node.type === 'group') {
        out.sections.push(node.path);
        if (node.component && !inside) out.parts.push({ path: node.path, component: node.component });
        walk(node.children, inside || Boolean(node.component));
      } else if (node.type === 'row') {
        for (const f of node.fields) {
          out.fields.push({ path: f.path, type: f.type, label: f.label });
          if (f.type === 'list') out.lists.push(f.list);
          if (f.mask) out.masks.push(f.mask);
        }
      } else if (node.type === 'options') {
        out.fields.push({ path: node.path, type: node.multiple ? 'checks' : 'radio', label: node.title });
      } else if (node.type === 'longtext') {
        out.fields.push({ path: node.path, type: 'longtext', label: node.title });
      }
    }
  };
  if (ast) walk(ast.children, false);
  out.lists = [...new Set(out.lists)];
  out.masks = [...new Set(out.masks)];
  return out;
}

// ---------------------------------------------------------------- API do runtime

const FORM_MEMBERS = [
  ['list', 'list(nome, fn)', 'Provedor da lista @nome (data-list). Devolva [{ value, label }] ou [\'valor\']. Sem cache: roda a cada ready()/reloadList().',
    'list(\'${lista}\', async ({ form, field, data }) => {\n\t${}\n\treturn [];\n})'],
  ['action', 'action(nome, fn, { label })', 'Ação da página: vira um botão, na ordem do registro (a primeira é a principal; sem nenhuma, só "Enviar"). label = texto do botão (padrão: o nome). Nada é validado sozinho; devolva { errors } para mostrar erros nos campos.',
    'action(\'${acao}\', async ({ form, data, button }) => {\n\tif (!form.validate({ focus: true }).valid) return;\n\t${}\n})'],
  ['scope', 'scope(caminho): Part', 'A parte de uma seção (ex.: \'residencial\'), com nomes relativos e sem ações. O JS dos componentes já a recebe de form.ready().', 'scope(\'${parte}\')'],
  ['validator', 'validator(alvo, fn)', 'Validador síncrono: true = válido; texto = mensagem. Vários por campo; aparece só o primeiro erro. Não é chamado com valor vazio.',
    'validator({ name: \'${campo}\' }, (value, { form, field, data }) => ${true} || \'${Mensagem de erro.}\')'],
  ['calcField', 'calcField(nome, deps, fn)', 'Campo calculado a partir de outros (fica somente leitura). Recalcula quando uma dependência muda.',
    'calcField(\'${campo}\', [\'${dependencia}\'], (${valor}) => ${null})'],
  ['maskType', 'maskType(mascara, { validate, literals })', 'Validação (e literais) para todos os campos com esta data-mask.',
    'maskType(\'${999.99999.99-9}\', { validate: (value) => ${true} || \'${Valor inválido.}\' })'],
  ['messages', 'messages({ chave: texto })', 'Troca as mensagens embutidas (required, cpf, date, min...).',
    'messages({ ${required}: \'${Obrigatório.}\' })'],
  ['on', 'on(evento, [alvo], fn)', 'Escuta fm:ready, fm:change, fm:action, fm:invalid ou fm:error. Devolve a função que cancela.',
    'on(\'${change}\', { name: \'${campo}\' }, ({ field, value, old }) => {\n\t${}\n})'],
  ['ready', 'ready(): Promise', 'Liga máscaras e botões e carrega as listas. Registre tudo antes e use await form.ready().', 'ready()'],
  ['destroy', 'destroy()', 'Desliga os eventos do formulário.', 'destroy()'],
  ['getData', 'getData(): object', 'JSON normalizado e aninhado do formulário.', 'getData()'],
  ['setData', 'setData(json, { clear })', 'Preenche o formulário (limpa antes, salvo { clear: false }).', 'setData(${dados})'],
  ['clear', 'clear()', 'Limpa todos os campos e erros.', 'clear()'],
  ['validate', 'validate({ target, focus }): { valid, errors }', 'Valida (inclusive obrigatórios) e mostra os erros. focus: true leva ao primeiro erro.', 'validate({ focus: true })'],
  ['showErrors', 'showErrors([{ field, message }])', 'Mostra erros vindos de fora (ex.: servidor).', 'showErrors([{ field: \'${campo}\', message: \'${mensagem}\' }])'],
  ['readOnly', 'readOnly(flag = true)', 'Deixa o formulário inteiro somente leitura (ou libera).', 'readOnly(${true})'],
  ['reloadList', 'reloadList(alvo): Promise', 'Chama de novo o provedor das listas do alvo (listas dependentes).', 'reloadList({ name: \'${campo}\' })'],
  ['field', 'field(nome): Field', 'O campo pelo nome completo (ex.: \'residencial.cep\').', 'field(\'${campo}\')'],
  ['fields', 'fields(alvo): Field[]', 'Campos do alvo ({ name } ou { selector }), ou todos.', 'fields(${})'],
  ['element', 'element: HTMLFormElement', 'O <form>.', null],
];

// O que o JS de um componente recebe (form.scope): nomes relativos à parte, sem ações.
const PART_INFO = {
  list: 'Provedor da lista @nome só para os campos desta parte (vence o do formulário).',
  getData: 'O objeto desta parte no JSON.',
  setData: 'Preenche só esta parte (nomes relativos; limpa antes, salvo { clear: false }).',
  clear: 'Limpa os campos desta parte.',
  readOnly: 'Deixa esta parte somente leitura (ou libera).',
  scope: 'Uma parte dentro desta (o componente incluído por este).',
};
const PART_MEMBERS = [
  ...['list', 'validator', 'calcField', 'maskType', 'on', 'field', 'fields', 'reloadList', 'validate', 'getData', 'setData', 'clear', 'readOnly', 'scope']
    .map((name) => {
      const [, detail, info, snippet] = FORM_MEMBERS.find((m) => m[0] === name);
      return [name, detail, PART_INFO[name] ?? `${info} Nomes relativos à parte.`, snippet];
    }),
  ['prefix', 'prefix: string', 'Onde a parte está no formulário (ex.: \'residencial\').', null],
];

const FIELD_MEMBERS = [
  ['value', 'value', 'Valor normalizado (o mesmo do JSON). Atribuir formata e dispara fm:change.'],
  ['text', 'text: string', 'Texto exibido (somente leitura).'],
  ['required', 'required: boolean', 'Obrigatório.'],
  ['enabled', 'enabled: boolean', 'Habilitado.'],
  ['readOnly', 'readOnly: boolean', 'Somente leitura.'],
  ['visible', 'visible: boolean', 'Visível (esconde a coluna inteira).'],
  ['min', 'min: number | null', 'data-min (números).'],
  ['max', 'max: number | null', 'data-max (números).'],
  ['error', 'error: string', 'Mensagem de erro exibida; \'\' limpa.'],
  ['mask', 'mask: string | null', 'data-mask; trocar muda tipo e validação.'],
  ['name', 'name: string', 'Nome completo (caminho com pontos).'],
  ['kind', 'kind', '\'input\' | \'select\' | \'radio\' | \'checks\' | \'check\''],
  ['element', 'element: HTMLElement', 'O controle, ou o fieldset de um grupo de opções.'],
  ['elements', 'elements: HTMLElement[]', 'Todos os controles do campo.'],
  ['form', 'form: Form', 'O formulário do campo.'],
];

// utils (utils.js): o que serve direto como provedor de lista ou função de calcField.
const DATE_INFO = 'Com uma data, até hoje; com duas, fim − início. Faltando uma: null.';
const NUMBER_INFO = 'Só os números contam; null apenas se não houver nenhum.';
const UTILS_MEMBERS = [
  ['loadJson', 'loadJson(url): provedor', 'Provedor de lista que lê um JSON (url relativa à página, ou função ({ data }) => url).', 'loadJson(\'./${lista}.json\')'],
  ['dateDiffYears', 'dateDiffYears(início, [fim])', `Anos completos (trunca). ${DATE_INFO}`, 'dateDiffYears'],
  ['dateDiffYearsFrac', 'dateDiffYearsFrac(início, [fim])', `Anos com a fração do ano em curso. ${DATE_INFO}`, 'dateDiffYearsFrac'],
  ['dateDiffMonths', 'dateDiffMonths(início, [fim])', `Meses completos (trunca). ${DATE_INFO}`, 'dateDiffMonths'],
  ['dateDiffMonthsFrac', 'dateDiffMonthsFrac(início, [fim])', `Meses com a fração do mês em curso. ${DATE_INFO}`, 'dateDiffMonthsFrac'],
  ['dateDiffDays', 'dateDiffDays(início, [fim])', `Dias. ${DATE_INFO}`, 'dateDiffDays'],
  ['sum', 'sum(...valores)', `Soma. ${NUMBER_INFO}`, 'sum'],
  ['avg', 'avg(...valores)', `Média dos números presentes. ${NUMBER_INFO}`, 'avg'],
  ['min', 'min(...valores)', `Menor valor. ${NUMBER_INFO}`, 'min'],
  ['max', 'max(...valores)', `Maior valor. ${NUMBER_INFO}`, 'max'],
];

const EVENTS = [
  ['change', '{ field, value, old }', 'Um campo mudou de valor.'],
  ['action', '{ action, data }', 'Um botão foi clicado (cancelável com preventDefault()).'],
  ['invalid', '{ errors }', 'validate() ou showErrors() encontrou erros.'],
  ['error', '{ error, source }', 'Erro num provedor de lista, ação, validador ou campo calculado.'],
  ['ready', '{ form }', 'ready() terminou.'],
];

const MESSAGES = [
  ['required', 'Campo obrigatório.'], ['incomplete', 'Preencha no formato {mask}.'], ['date', 'Data inválida.'],
  ['time', 'Hora inválida.'], ['cpf', 'CPF inválido.'], ['cnpj', 'CNPJ inválido.'], ['email', 'E-mail inválido.'],
  ['number', 'Número inválido.'], ['digits', 'Use no máximo {digits} dígitos.'], ['min', 'O valor mínimo é {min}.'],
  ['max', 'O valor máximo é {max}.'], ['invalid', 'Valor inválido.'],
];

// ---------------------------------------------------------------- JS do integrador

// Se a linha termina dentro de uma string aberta, o texto digitado nela.
function openString(line) {
  let quote = null;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '/' && line[i + 1] === '/') {
      return null;
    } else if (c === '\'' || c === '"' || c === '`') {
      quote = c;
      start = i + 1;
    }
  }
  return quote ? line.slice(start) : null;
}

export function completeJs(doc, pos, info = outline(null), explicit = false) {
  const before = doc.slice(Math.max(0, pos - 2000), pos);
  const at = (typed) => pos - typed.length;
  const words = (list, type, detail) => list.map((label) => ({ label, type, detail }));

  // Dentro de uma string: o que faz sentido para aquele argumento.
  const typed = openString(before.slice(before.lastIndexOf('\n') + 1));
  if (typed !== null) {
    const head = before.slice(0, before.length - typed.length - 1);
    const field = (f) => ({ label: f.path, type: 'variable', detail: f.type, info: f.label });
    let options = null;
    if (/\.list\(\s*$/.test(head)) options = words(info.lists, 'enum', '@lista');
    else if (/\.action\(\s*$/.test(head)) options = words(info.actions, 'enum', 'botão');
    else if (/\.scope\(\s*$/.test(head)) options = info.parts.map((p) => ({ label: p.path, type: 'variable', detail: `+${p.component}` }));
    else if (/\.on\(\s*$/.test(head)) options = EVENTS.map(([label, detail, i]) => ({ label, type: 'enum', detail, info: i }));
    else if (/\bnew\s+Form\(\s*$/.test(head)) options = info.name ? [{ label: `#${info.name}`, type: 'constant', detail: '<form>' }] : [];
    else if (/\b(?:fetch|loadJson)\(\s*$/.test(head)) options = info.data.map((d) => ({ label: `./${d}`, type: 'text', detail: 'arquivo de dados' }));
    else if (/\bselector:\s*$/.test(head)) options = selectors(info);
    else if (/\.(field|calcField)\(\s*$/.test(head) || /\bname:\s*(\[[^\]]*)?$/.test(head)
      || /\.calcField\([^)]*\[[^\]]*$/.test(head) || /\bfield:\s*$/.test(head)) {
      options = /\.reloadList\(\s*\{\s*name:\s*$/.test(head)
        ? info.fields.filter((f) => f.type === 'list').map(field)
        : info.fields.map(field);
    }
    if (options) return { from: at(typed), options, validFor: /^[^'"`\n]*$/ };
    return null;
  }

  // Membro de um Form ou de um Field.
  const member = /(\b[A-Za-z_$][\w$]*|\))\.([\w$]*)$/.exec(before);
  if (member) {
    const [, obj, typed] = member;
    const owner = memberOwner(doc, before.slice(0, before.length - typed.length - 1), obj);
    if (owner === 'form' || owner === 'part') {
      return {
        from: at(typed),
        options: (owner === 'form' ? FORM_MEMBERS : PART_MEMBERS)
          .map(([label, detail, i, snippet]) => ({ label, type: snippet ? 'method' : 'property', detail, info: i, snippet })),
        validFor: /^[\w$]*$/,
      };
    }
    if (owner === 'utils') {
      return { from: at(typed), options: UTILS_MEMBERS.map(([label, detail, i, snippet]) => ({ label, type: 'function', detail, info: i, snippet })), validFor: /^[\w$]*$/ };
    }
    if (owner === 'field') {
      return { from: at(typed), options: FIELD_MEMBERS.map(([label, detail, i]) => ({ label, type: 'property', detail, info: i })), validFor: /^[\w$]*$/ };
    }
    return null;
  }

  // Chaves de form.messages({ ... }).
  const msg = /\.messages\(\s*\{(?:[^{}]*,)?\s*(\w*)$/.exec(before);
  if (msg) {
    return { from: at(msg[1]), options: MESSAGES.map(([label, i]) => ({ label, type: 'property', detail: 'mensagem', info: i })), validFor: /^\w*$/ };
  }

  // Começo de uma instrução: snippets da biblioteca.
  const word = /[\w$]*$/.exec(before)[0];
  if (!word && !explicit) return null;
  return { from: at(word), options: statements(info), validFor: /^[\w$]*$/ };
}

// A que tipo pertence "obj." — form (variável com new Form, parâmetro { form }),
// part (parte, variável com .scope(...), parâmetro do export default function),
// field (variável com .field(...), parâmetro { field }, ou form.field('x') direto)
// ou utils.
// prefix: o texto antes do ponto.
function memberOwner(doc, prefix, obj) {
  if (obj === ')') return /\.field\(\s*(['"`])[^'"`]*\1\s*\)$/.test(prefix) ? 'field' : null;
  const names = (re) => [...doc.matchAll(re)].map((m) => m[1]);
  const forms = new Set(['form', ...names(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?new\s+Form\(/g)]);
  const parts = new Set(['parte', ...names(/\b([A-Za-z_$][\w$]*)\s*=\s*[\w$]+\.scope\(/g),
    ...names(/export\s+default\s+function\s*[\w$]*\s*\(\s*([A-Za-z_$][\w$]*)/g)]);
  const fields = new Set(['field', ...names(/\b([A-Za-z_$][\w$]*)\s*=\s*[\w$]+\.field\(/g)]);
  if (forms.has(obj)) return 'form';
  if (parts.has(obj)) return 'part';
  if (fields.has(obj)) return 'field';
  if (obj === 'utils') return 'utils';
  return null;
}

function selectors(info) {
  return [
    ...info.masks.map((m) => ({ label: `[data-mask="${m}"]`, type: 'constant', detail: 'máscara' })),
    ...info.lists.map((l) => ({ label: `[data-list="${l}"]`, type: 'constant', detail: 'lista' })),
    ...info.sections.map((s) => ({ label: `[name^="${s}."]`, type: 'constant', detail: 'seção' })),
    { label: '[required]', type: 'constant', detail: 'obrigatórios' },
  ];
}

// Na página, o objeto é form; no JS de um componente, parte (sem ações nem ready).
function statements(info) {
  // O JS dos componentes não aparece aqui: form.ready() o chama sozinho.
  const component = info.kind === 'component';
  const obj = component ? 'parte' : 'form';
  const out = component
    ? [
      { label: 'import { utils }', type: 'keyword', detail: 'runtime', snippet: 'import { utils } from \'../forms.js\';\n' },
      { label: 'export default function', type: 'keyword', detail: 'o JS do componente',
        snippet: `export default function ${ident(info.name || 'componente')}(parte) {\n\t\${}\n}\n` },
    ]
    : [
      { label: 'import { Form, utils }', type: 'keyword', detail: 'runtime', snippet: 'import { Form, utils } from \'./forms.js\';\n' },
      { label: 'new Form', type: 'class', detail: 'cria o formulário', snippet: `const form = new Form('#\${${info.name || 'formulario'}}');\n` },
      { label: 'await form.ready()', type: 'method', detail: 'por último', snippet: 'await form.ready();\n' },
    ];
  for (const l of info.lists) {
    const json = info.data.includes(`${l}.json`);
    out.push({
      label: `${obj}.list('${l}')`,
      type: 'method',
      detail: json ? `lê ${l}.json` : 'provedor da lista',
      snippet: json
        ? `${obj}.list('${l}', utils.loadJson('./${l}.json'));\n`
        : `${obj}.list('${l}', async ({ form, field, data }) => {\n\t\${}\n\treturn [];\n});\n`,
    });
  }
  if (!component) {
    for (const a of info.actions) {
      out.push({
        label: `form.action('${a}')`,
        type: 'method',
        detail: 'botão',
        snippet: `form.action('${a}', async ({ form, data, button }) => {\n\tif (!form.validate({ focus: true }).valid) return;\n\t\${}\n});\n`,
      });
    }
    out.push({ label: 'form.action (com rótulo)', type: 'method', detail: 'botão com outro texto',
      snippet: 'form.action(\'${acao}\', async ({ form, data }) => {\n\t${}\n}, { label: \'${Texto do botão}\' });\n' });
  }
  out.push(
    { label: `${obj}.list (arquivo JSON)`, type: 'method', detail: 'utils.loadJson', snippet: `${obj}.list('\${lista}', utils.loadJson('./\${lista}.json'));\n` },
    ...['validator', 'calcField', 'on', ...(component ? [] : ['messages']), 'maskType'].map((name) => {
      const [, detail, i, snippet] = FORM_MEMBERS.find((m) => m[0] === name);
      return { label: `${obj}.${name}`, type: 'method', detail, info: i, snippet: `${obj}.${snippet};\n` };
    }),
    { label: `${obj}.calcField (utils)`, type: 'method', detail: 'idade, soma...',
      snippet: `${obj}.calcField('\${idade}', ['\${nascimento}'], utils.\${dateDiffYears});\n` },
    { label: `${obj}.validator (seletor)`, type: 'method', detail: 'validator({ selector }, fn)',
      snippet: `${obj}.validator({ selector: '\${[data-mask="R$"]}' }, (value) => \${value >= 0} || '\${Mensagem de erro.}');\n` },
  );
  return out;
}

// ---------------------------------------------------------------- .form

const SPECIFIERS = [
  ['______________', 'texto'], ['email______________', 'e-mail'], ['R$ __________', 'moeda'],
  ['dd/mm/aaaa', 'data'], ['hh:mm', 'hora'], ['999.999.999-99', 'CPF'], ['99.999.999/9999-99', 'CNPJ'],
  ['99999-999', 'CEP'], ['(99) 99999-9999', 'celular'], ['(99) 9999-9999', 'telefone'],
  ['999', 'inteiro (até 3 dígitos)'], ['0000', 'código (zeros à esquerda)'], ['999.99', 'decimal'],
];

const LINES = [
  ['--Seção{nome}', 'seção', '--${Seção}{${nome}}\n'],
  ['---Subseção', 'subseção', '---${Subseção}\n'],
  ['--Seção{nome} +componente', 'seção com um componente', '--${Seção}{${nome}}\n+${componente}\n'],
  ['(valor) Opção', 'rádio', '(${valor}) ${Opção}\n'],
  ['[valor] Opção', 'seleção múltipla', '[${valor}] ${Opção}\n'],
  ['[ ] Caixa{nome}', 'caixa de marcação', '[ ] ${Aceito os termos}{${nome}}\n'],
  ['Rótulo: ____', 'campo', '${Rótulo}: ${______________}\n'],
];

export function completeForm(doc, pos, info = outline(null), explicit = false) {
  const line = doc.slice(doc.lastIndexOf('\n', pos - 1) + 1, pos);
  // Inclusão: "+comp" -> os componentes do projeto.
  const include = /^\s*\+([\w-]*)$/.exec(line);
  if (include) {
    return { from: pos - include[1].length, options: info.components.map((c) => ({ label: c, type: 'class', detail: 'componente' })), validFor: /^[\w-]*$/ };
  }
  const spec = /:\s*([^\s:]*)$/.exec(line);
  if (spec && /[^\s]/.test(line.slice(0, spec.index))) {
    const typed = spec[1];
    if (!typed && !explicit && !/:\s+$/.test(line)) return null;
    return {
      from: pos - typed.length,
      options: [
        ...SPECIFIERS.map(([label, detail]) => ({ label, type: 'constant', detail })),
        ...info.lists.map((l) => ({ label: `@${l}`, type: 'enum', detail: 'lista' })),
        { label: '@lista', type: 'enum', detail: 'lista (nome novo)', snippet: '@${lista}' },
      ],
    };
  }
  if (/^\s*$/.test(line) && explicit) return { from: pos, options: LINES.map(([label, detail, snippet]) => ({ label, type: 'keyword', detail, snippet })) };
  return null;
}

// ---------------------------------------------------------------- arquivos de dados

export function completeJson(doc, pos, _info, explicit = false) {
  const word = /[\w"]*$/.exec(doc.slice(0, pos))[0];
  if (!word && !explicit) return null;
  return {
    from: pos - word.length,
    options: [
      { label: 'lista de opções', type: 'keyword', detail: '[{ value, label }]', snippet: '[\n\t{ "value": "${valor}", "label": "${Rótulo}" }\n]' },
      { label: 'item', type: 'keyword', detail: '{ value, label }', snippet: '{ "value": "${valor}", "label": "${Rótulo}" }' },
    ],
  };
}
