// JS inicial, criado pela CLI e pela interface web (agentes.md §8.10):
// - da página (clientes.js): cria o Form e registra as ações, que viram os botões;
// - do componente (components/endereco.js): uma função que recebe a parte do
//   formulário onde foi incluído e registra listas, validações e cálculos dela.
// O JS dos componentes não é chamado aqui: form.ready() o carrega e chama sozinho,
// uma vez por seção. Cada um só cuida do que está nele: as listas dos componentes
// ficam no JS do componente. data: arquivos de dados ao lado da página; a lista
// @estados com "estados.json" disponível já nasce lendo o arquivo (utils.loadJson).
// runtime: o forms.js visto da página; o componente, em components/, sobe uma pasta.

export function stub(ast, { runtime = './forms.js', data = [], script = `${ast.name}.js` } = {}) {
  const lists = new Set();
  const parts = [];
  const walk = (children) => {
    for (const node of children) {
      if (node.type === 'group' && node.component) parts.push(node);
      else if (node.type === 'group') walk(node.children);
      if (node.type === 'row') node.fields.forEach((f) => f.type === 'list' && lists.add(f.list));
    }
  };
  walk(ast.children);

  const component = ast.kind === 'component';
  const target = component ? 'parte' : 'form';
  const pad = component ? '  ' : '';
  const body = [];
  if (parts.length) {
    // Quem form.ready() chama, e com que parte (no componente, relativa a ele).
    const byComponent = new Map();
    for (const p of parts) byComponent.set(p.component, [...(byComponent.get(p.component) ?? []), p.path]);
    body.push('', `${pad}// Componentes: form.ready() carrega o JS de cada um e o chama com a sua parte.`);
    for (const [c, paths] of byComponent) body.push(`${pad}//   components/${c}.js: ${paths.join(', ')}`);
  }
  if (lists.size) {
    body.push('', `${pad}// Listas: devolva [{ value, label }] ou ['valor', ...].`);
    for (const l of lists) {
      if (data.includes(`${l}.json`)) body.push(`${pad}${target}.list('${l}', utils.loadJson('./${l}.json'));`);
      else body.push(`${pad}${target}.list('${l}', async ({ data }) => []);`);
    }
  }

  if (component) {
    return [
      `// ${script} — componente ${ast.name}: listas, validações e campos calculados.`,
      '// Recebe a parte do formulário onde foi incluído, com nomes relativos a ela',
      "// ({ name: 'cep' } é o cep desta inclusão). As ações ficam no JS da página.",
      `import { utils } from '${runtime.replace(/^\.\//, '../')}';`,
      '',
      `export default function ${ident(ast.name)}(parte) {`,
      ...(body.length ? body.slice(body[0] === '' ? 1 : 0)
        : ["  // Ex.: parte.calcField('idade', ['nascimento'], utils.dateDiffYears);"]),
      '}',
      '',
    ].join('\n');
  }
  return [
    `// ${script} — integração do formulário "${ast.title}".`,
    '// Criado pelo gerador; edite à vontade (não é sobrescrito sem perguntar).',
    `import { Form, utils } from '${runtime}';`,
    '',
    `const form = new Form('#${ast.name}');`,
    ...body,
    '',
    '// Ações: cada uma vira um botão, na ordem em que são registradas (a primeira é a',
    '// principal). Nenhuma valida sozinha: chame form.validate() quando quiser.',
    "form.action('enviar', async ({ form, data }) => {",
    '  if (!form.validate({ focus: true }).valid) return;',
    "  console.log('enviar', data);",
    '});',
    '',
    'await form.ready();',
    '',
  ].join('\n');
}

const RESERVED = new Set(`break case catch class const continue debugger default delete do else enum export
  extends false finally for function if import in instanceof new null return super switch this throw true try
  typeof var void while with yield let static implements interface package private protected public await
  arguments eval form Form parte`.split(/\s+/));

// Nome do componente -> identificador JS: "meu-endereco" -> "meuEndereco".
export function ident(name) {
  let id = String(name).replace(/-+([A-Za-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^\w$]/g, '_');
  if (/^\d/.test(id)) id = `_${id}`;
  return RESERVED.has(id) ? `${id}_` : id;
}
