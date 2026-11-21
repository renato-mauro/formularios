# Formulários

Gera formulários HTML5 (Bootstrap 5.3) a partir de uma especificação em texto
simples (`.form`), e traz uma biblioteca JavaScript que dá máscaras, validação e
coleta em JSON a esses formulários.

Um projeto tem duas pastas fixas: `pages/`, com os formulários que viram
páginas, e `components/`, com formulários reaproveitáveis (um endereço, por
exemplo) que entram nas páginas sozinhos numa seção, com uma linha `+endereco`
logo abaixo do título da seção. Os botões não ficam no
`.form`: cada ação registrada no JS da página vira um botão (sem nenhuma, a
página tem só "Enviar").

A especificação completa está em [`agentes.md`](agentes.md).

## Os quatro pacotes

Um repositório só (npm workspaces), quatro projetos independentes em `packages/`:

| Pacote | O que faz | Depende de |
|---|---|---|
| [`gerador`](packages/gerador) — `@formularios/gerador` | transforma uma string `.form` no HTML do formulário (fragmento `<form>` ou página completa). Roda em qualquer ambiente. | runtime (só a tabela de máscaras) |
| [`web`](packages/web) — `@formularios/web` | interface web: projetos com páginas, componentes e dados, guardados no navegador; testa cada página e componente com o runtime; baixa/envia o projeto e baixa os HTMLs em zip | gerador, runtime |
| [`runtime`](packages/runtime) — `@formularios/runtime` | comportamento dos formulários no navegador: máscaras, validação, callbacks, JSON | — |
| [`cli`](packages/cli) — `@formularios/cli` | linha de comando em lote: gera as páginas de um projeto (pasta ou zip da interface) em outra pasta | gerador, runtime |

## Requisitos

- [Node.js](https://nodejs.org) 22 ou mais novo.
- Internet no navegador (o Bootstrap vem de um CDN).

Não há dependências de terceiros. Rode `npm install` **uma vez**: ele só liga os
quatro pacotes entre si (não baixa nada).

## Interface web

```bash
npm install
npm start
```

Abra <http://localhost:8080/> (vai para a interface web). Lá você:

- cria projetos e, em cada um, **páginas**, **componentes** e **arquivos de
  dados** (`.json`). Uma lista `@estados` com um `estados.json` no projeto já
  aparece preenchida: o JS inicial lê o arquivo;
- edita a especificação `.form` e o **JS** de cada página (ações, que viram os
  botões) e de cada componente (listas, validações, cálculos da parte dele, que o
  `form.ready()` da página chama sozinho) com
  destaque de sintaxe, **autocompletar e snippets da biblioteca** (`form.`,
  `parte.`, `form.field('…').`, nomes de campos, listas e componentes dentro das
  strings e depois do `+`; Ctrl+Espaço mostra as sugestões) e vê o formulário
  funcionando ao lado, com o runtime de verdade — a página inteira ou o
  componente sozinho;
- inclui campos pelo **assistente** (*+ Campo*): escolhe o tipo, o rótulo, o nome
  no JSON, se é obrigatório e os parâmetros (tamanho, dígitos, máscara, lista,
  opções, largura), vê a linha do `.form` e insere na posição do cursor;
- importa listas prontas da **Coleção** (estados, países, meses, estado civil,
  escolaridade...) como arquivos de dados do projeto;
- vê a **Estrutura** de dados do formulário: cada campo com o caminho no JSON, o
  tipo, nulo ou não nulo e os detalhes, e um exemplo do JSON;
- renomeia um componente e as linhas `+nome` das páginas acompanham;
- escolhe o **tema** (automático, claro ou escuro) no canto da barra; a
  pré-visualização fica sempre clara, como a página publicada;
- aumenta ou diminui a **letra dos editores** (A− / A+ na barra do editor) e
  ajusta a **largura dos painéis** arrastando as divisórias, como no VS Code
  (duplo clique volta ao padrão);
- alterna a pré-visualização entre a **página** e o **HTML** gerado (colorido, só
  leitura: o mesmo arquivo que vai no zip), com A− / A+ próprios;
- abre a **Ajuda** ao lado do editor: a linguagem `.form` inteira (tipos de
  linha, componentes, máscaras, listas, opções, nomes, JSON, larguras) e o JS
  (página e componente, funções do `form`, da parte e dos campos, mensagens e eventos);
- usa **Baixar projeto (.zip)** / **Enviar projeto (.zip)** para guardar ou levar
  o projeto para outro navegador;
- usa **Baixar HTMLs (.zip)** para receber os `.html` e `.js` das páginas, o
  `components/` com o JS dos componentes, os arquivos de dados e o runtime,
  prontos para publicar.

Os projetos ficam no armazenamento local do navegador: limpar os dados do site
apaga tudo. Baixe o projeto para ter uma cópia.

Os editores usam o [CodeMirror](https://codemirror.net), carregado de um CDN
(versões fixas). Sem internet, viram campos de texto simples e o resto funciona
igual.

Para publicar a interface num site estático:

```bash
npm run build      # gera docs/ (copie a pasta inteira)
```

A pasta `docs/` vai no git e é o site do GitHub Pages (Settings → Pages → Deploy
from a branch → `main` / `/docs`). Depois de mudar a interface, o gerador ou o
runtime, rode o build e faça o commit junto:

```bash
npm run pages      # testa, monta docs/ e serve só ela em http://localhost:8080/formularios/
git add -A && git commit -m "…" && git push
```

## CLI em lote

```bash
npx formularios build <projeto> <saída>   # gera as páginas do projeto
npx formularios check <projeto>           # só verifica (páginas e componentes)
```

`<projeto>` é a pasta do projeto ou o `.zip` baixado da interface web, com:

```text
pages/clientes.form        páginas (e, se escrito, o pages/clientes.js)
components/endereco.form   componentes (e, se escrito, o components/endereco.js)
estados.json               arquivos de dados
```

A saída fica pronta para publicar: `clientes.html` e `clientes.js` de cada página,
`components/endereco.js` de cada componente usado, o `<lista>.json` de cada
`@lista` que tiver arquivo e uma cópia do runtime (`forms.js`, `masks.js`,
`utils.js`, `forms.d.ts`).

- O JS vem do projeto, se existir; senão é criado um inicial, só quando ainda
  não existe na saída.
- Arquivos que já existem com outro conteúdo só são sobrescritos depois de
  perguntar. `--force` dispensa a pergunta para o HTML, os dados e o runtime
  (nunca para o JS).
- Outras opções: `--no-runtime`, `--no-stub`, `--no-script`. Veja
  `npx formularios --help`.

Exemplo completo:

```bash
npm run exemplo    # recria examples/saida a partir de examples/clientes
npm start          # e abra http://localhost:8080/examples/saida/clientes.html
```

O exemplo é uma página (`pages/clientes.form`) com dois componentes: `pessoa` e
`endereco`, este incluído duas vezes (residencial e comercial). Use **Preencher
com dados de exemplo**, **Enviar** (valida e mostra o JSON), **Limpar tudo** e
**Somente leitura**.

Por que um servidor? Os arquivos usam módulos ES (`import`), que o navegador não
carrega abrindo o `.html` direto do disco (`file://`). Se a porta 8080 estiver
ocupada: `PORT=3000 npm start` (no Windows PowerShell: `$env:PORT=3000; npm start`).

## Testes

```bash
npm test                         # todos os pacotes
npm test -w @formularios/cli     # um pacote só
```

## Usar o Claude Code nesta pasta

Abra o terminal na pasta e rode `claude`. O arquivo `CLAUDE.md` aponta para o
`agentes.md`, que tem a especificação inteira.
