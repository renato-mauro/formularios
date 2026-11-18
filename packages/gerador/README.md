# @formularios/gerador

Transforma uma string `.form` no HTML do formulário. Não usa DOM nem APIs do Node:
roda igual no navegador e no Node. Depende só da tabela de máscaras do runtime.

```js
import { componentsOf, generate, stub } from '@formularios/gerador';

// name: o nome do arquivo (clientes.form -> 'clientes'): id do <form> e nome do .js.
// components: o texto de cada componente que "+nome" pode incluir.
const opcoes = { name: 'clientes', components: { endereco: textoDoEndereco } };
const { html, ast, errors, warnings } = generate(texto, opcoes);             // só o <form>…</form>
const pagina = generate(texto, { ...opcoes, page: true }).html;              // página completa
const semTag = generate(texto, { ...opcoes, page: true, script: false }).html;
const js = stub(ast);                                                        // JS inicial da página
componentsOf(ast);                                                           // ['endereco']

// Um componente: component: true; o stub vira export default function (parte).
const end = generate(textoDoEndereco, { name: 'endereco', component: true });
```

Erros e avisos: `{ message, line, column, excerpt }` (um erro de inclusão traz
`cause: { component, line, column }`); `formatIssue(issue, arquivo)` monta
`arquivo:linha:coluna: mensagem`. `includesOf(texto)` e `renameInclude(texto, de,
para)` leem e trocam as linhas `+nome`. Linguagem: §3 a §5 do `agentes.md`.
