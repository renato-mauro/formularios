# agentes.md — Gerador de Formulários a partir de Texto Simples

> Instruções para o agente de código (Claude Code) construir a ferramenta.
> **Versão 0.8** — incorpora as respostas das rodadas de perguntas 1 a 4, a divisão em quatro
> pacotes num monorepo (2026-10-20) e os **componentes** (2026-10-21: páginas e
> componentes em pastas fixas, inclusão `+nome`, botões vindos das ações do JS) e
> as funções prontas `utils` do runtime (2026-10-22, §8.11).
> **Implementada**; este arquivo é a especificação que o código segue. Não há
> compatibilidade com o formato anterior (botões no `.form`, `{nome}` no título,
> zip de projeto formato 1).
> Itens marcados **[PENDENTE En]** são decisões ainda em aberto (questão n da
> rodada 5); até lá, vale o que está descrito aqui (e implementado).
> Itens marcados **[RODADA FUTURA]** não devem ser implementados agora, mas o
> desenho não pode impedi-los.

---

## 1. Objetivo e filosofia

Construir a **base** de um ecossistema de formulários: uma linguagem de texto
mínima e "visual" (o texto parece o formulário) que gera **formulários HTML5
limpos, elegantes e fáceis de manter à mão**, e uma pequena biblioteca JavaScript
que dá comportamento a esses formulários.

Não é um sistema de cadastro completo. É um **catalisador**: o mesmo formulário
deve poder ser usado num CRUD, num sistema de workflow ou em qualquer outro
contexto. Por isso:

1. **A estrutura (HTML) é independente da implementação (JS).** O `.form` e o HTML
   só *declaram*: estrutura, tipo de cada campo, máscara, obrigatoriedade.
   **Não há regras, validadores, limites, ações nem dados de listas no `.form`.**
2. **Todo comportamento específico é registrado por programação**, via callbacks,
   apontando para campos pelo **nome** ou por **seletor CSS** (sempre de forma
   explícita): provedores de
   listas, ações (que viram os botões), validadores (vários por campo), campos calculados.
   O que é de um componente (listas, validações, cálculos) fica no JS do
   componente; as ações são da página (§8.10).
3. **O HTML gerado é artefato de primeira classe.** Depois de gerado, pode ser
   editado à mão (trocar rótulo, `data-mask`, largura, classe) sem regerar.
4. **Uma saída de dados única e previsível:** o formulário produz um **JSON
   normalizado e aninhado** conforme a estrutura de seções (§7).

Escopo desta fase: o **gerador** (texto → HTML), a **biblioteca de runtime**
(máscaras, validação embutida pela máscara, registro de callbacks, coleta e
preenchimento de JSON), uma **interface web** para gerenciar projetos de
formulários (páginas e componentes) e uma **CLI em lote**. Sem back-end.

---

## 2. Arquitetura

Tudo em **JavaScript puro** (ES modules, sem dependências de terceiros, sem
bundler). **API pública, nomes de arquivos e atributos em inglês**; o conteúdo
do formulário (rótulos, nomes de campos no JSON) segue o que o autor escrever.

**Exceção, só no P2:** os editores de código da interface web usam o
**CodeMirror 6**, carregado do CDN (esm.sh) pelo import map, com versão fixa de
cada pacote. Sem rede, cada editor continua sendo um `<textarea>` e a interface
funciona igual. Nenhum outro pacote usa dependências de terceiros.

Um repositório, **quatro pacotes** (npm workspaces, escopo `@formularios/`):

| Pacote | Pasta | Roda em | Responsabilidade |
|---|---|---|---|
| **P1 — gerador** `@formularios/gerador` | `packages/gerador` | qualquer ambiente (navegador, Node) | transformar **uma string** `.form` no HTML do formulário: `parse(text, { name, components, component }) → ast`, `render(ast, options) → html`, `generate(text, options) → { html, ast, errors, warnings }`, mais `stub(ast)` (JS inicial da página ou do componente), `componentsOf(ast)`, `includesOf(text)`, `renameInclude()` e `formatIssue()`. Os componentes chegam como texto (`components: { endereco: '…' }`): o gerador não lê arquivos |
| **P2 — interface web** `@formularios/web` | `packages/web` | navegador (site estático) | gerenciar projetos (páginas, componentes e dados), guardados no armazenamento local do navegador; testar cada página e cada componente com o runtime; baixar/enviar o zip de projeto; baixar o zip de HTMLs (§10.2) |
| **P3 — runtime** `@formularios/runtime` | `packages/runtime` | navegador | comportamento dos formulários gerados (`forms.js`, `forms.d.ts`), as funções prontas `utils` (`utils.js`, §8.11) e a **tabela de máscaras** (`masks.js`); **só ES module** |
| **P4 — CLI** `@formularios/cli` | `packages/cli` | Node | lê um projeto (pasta com `pages/` e `components/`, ou o zip de projeto do P2) e grava as páginas em outra pasta (§10.1) |

Dependências (só entre os pacotes; nenhum ciclo):

```text
gerador → runtime (só @formularios/runtime/masks)
web     → gerador, runtime
cli     → gerador, runtime        (web só como devDependency, nos testes)
runtime → nada
```

Regras:

- **A máscara define o tipo nos dois lados.** A tabela de máscaras mora no runtime
  (`@formularios/runtime/masks`) e o gerador a importa de lá, para que gerador e
  runtime nunca discordem (§3.6). `masks.js` é puro: sem DOM e sem Node. `utils.js`
  também (só `loadJson` usa `fetch`, na hora de carregar a lista).
- O gerador **não** usa DOM, `fs`, `window` nem `process`: recebe string, devolve
  string/objetos. É o mesmo módulo na interface web e na CLI.
- O runtime não conhece o gerador: funciona em qualquer HTML que siga o contrato
  da §6, inclusive HTML escrito à mão.
- P2 e P4 não dependem um do outro. O **zip de projeto** (§10.3) é o contrato entre
  eles: o P2 lê e grava; o P4 tem o seu próprio leitor (`node:zlib`). Um teste da
  CLI gera o zip com o código do P2 para garantir que continuam compatíveis.
- A AST é interna nesta fase (não é exportada em arquivo), mas deve ser um objeto
  JSON simples e documentado (§9), pois será a base do CRUD/workflow futuro.
- No navegador, os pacotes são resolvidos por **import map** (`packages/web/index.html`);
  no Node, pelos links do npm workspaces (`npm install` uma vez, sem rede).

---

## 3. A linguagem (`.form`)

Arquivos UTF-8 com extensão **`.form`**. Uma linha do arquivo = uma linha visual
do formulário. **Sem comentários, sem diretivas, sem regras, sem botões.**

Todo `.form` é um formulário, e um formulário pode incluir outros (`+nome`, sozinho
numa seção). O projeto tem duas pastas fixas (§3.12): **`pages/`**, com os
formulários que viram páginas, e **`components/`**, com os que só entram nas
páginas. O **nome do formulário é o nome do arquivo** (`clientes.form` →
`clientes`): é o `id` do `<form>` e o nome do `.html` e do `.js`. A página começa
pelo título (`-Título`); o componente **não tem título**: o título é o da seção
que o inclui.

### 3.1 Exemplo completo

`pages/clientes.form` — a página:

```text
-Cadastro de Clientes
--Dados Pessoais{pessoais}
+pessoa
--Endereço Residencial{residencial}
+endereco
--Endereço Comercial{comercial}
+endereco
--Contato no trabalho{contato}
Agência: 0000   Ramal: 9999   Horário: hh:mm
--Sexo*
(M) Masculino
(F) Feminino
( ) Prefiro não informar
--Interesses
[ESP] Esportes
[MUS] Música
--Observações{obs}
______________________________________________________________
______________________________________________________________
______________________________________________________________
[ ] Aceito os termos de uso{aceite}*
```

`components/pessoa.form`:

```text
Nome*: ______________________________________________________________
CPF*: 999.999.999-99   Nascimento*: dd/mm/aaaa   Salário: R$ __________
E-mail: email____________________   Telefone: (99) 99999-9999   Idade: 999
```

`components/endereco.form` (incluído duas vezes):

```text
Endereço{logradouro}*: ________________________ Nº*:________ Complemento: ________
Bairro: _____________ Cidade: _________ Estado:  @estados   CEP: 99999-999
```

### 3.2 Tipos de linha

| Forma | Tipo |
|---|---|
| `-Texto` | Título da página (um por arquivo, primeira linha não vazia; sem `{nome}`). Componente não tem título |
| `--Texto` | Seção (nível 2) |
| `---Texto` | Subseção (nível 3), **fieldset aninhado** na seção anterior |
| `----…` | **erro**: no máximo 3 níveis |
| `Rótulo: especificador ...` | Linha de campos (grade de 12 colunas) |
| `(V) Texto` / `( ) Texto` | Opção de rádio (só em seção de opções, §3.8) |
| `[V] Texto` / `[ ] Texto` dentro de seção de opções | Opção de seleção múltipla (§3.8) |
| linha só com `_` | Linha de texto longo (só em seção de texto longo, §3.9) |
| `[ ] Texto` fora de seção de opções | Caixa de marcação isolada (§3.10) |
| `+componente` | Inclusão de um componente: sozinha numa seção, logo abaixo do `--Título{nome}` (§3.12) |
| `[[ Texto ]]` | **erro**: os botões vêm das ações do JS da página (§3.11) |
| linha vazia | ignorada |

Espaços após os hífens são opcionais (`--Dados` = `-- Dados`).

### 3.3 Nomes explícitos com chaves `{nome}`

| Onde | Exemplo | Efeito |
|---|---|---|
| Título | — | **erro**: o nome do formulário é o do arquivo (`id` do `<form>`, `.html` e `.js`) |
| Seção / subseção (também a de um componente) | `--Endereço Residencial{residencial}` | `name` do `<fieldset>` = chave no JSON |
| Campo | `Endereço{logradouro}*:` | nome do campo |
| Seção de opções / texto longo | `--Sexo{sexo}*` | nome do campo |
| Caixa de marcação | `[ ] Aceito os termos{aceite}` | nome do campo |

O `*` de obrigatório pode vir antes ou depois das chaves; a forma canônica é
**`Texto{nome}*`**.

Sem chaves, o nome é o **slug** do texto, para **todos** os elementos (inclusive
rádio e texto longo): minúsculas, sem acentos, não alfanuméricos → `_`, sem `_`
nas pontas. Caso especial: `Nº`/`N°` → `numero`.

Nomes repetidos **no mesmo nível** recebem sufixo `_2`, `_3` e geram um aviso.
Nomes iguais em níveis diferentes são normais (`cep` em `residencial` e em
`comercial`).

### 3.4 Hierarquia e escopo

- Uma seção de nível *n* é filha da última seção de nível *n−1* (título = nível 1).
- Linhas de campos pertencem à seção aberta mais recente.
- Pular nível (de `-` direto para `---`) é erro.
- **Uma vez aberto um subnível, não se volta ao nível pai**; para pôr campos num
  nível acima, abre-se uma nova seção nesse nível.
- **Seções-campo** (opções e texto longo, §3.8–3.9) aparecem como seção, mas são
  **um único campo** e **não criam nível no JSON**: o valor vai para o objeto da
  seção-pai. Terminam na primeira linha que não é do seu tipo; o que vem depois
  volta à seção-pai.
- **Seções de componente** (a seção cujo conteúdo é só `+componente`, §3.12) são
  **fechadas** como as seções-campo: terminam na linha do `+`, não recebem
  subseções, e o que vem depois volta à seção-pai. Ao contrário das seções-campo,
  **criam nível no JSON** (`residencial.cep`).
- O limite de 3 níveis vale para os hífens de cada arquivo. As seções de um
  componente descem tantos níveis quanto a seção que o inclui (`--` de um
  componente incluído numa `---` vira o nível 4); no HTML, do nível 3 em diante o
  título é `h6`.

### 3.5 Linha de campos

```text
Rótulo[{nome}][*]: especificador[{N}]   Rótulo[{nome}][*]: especificador[{N}] ...
```

- O rótulo termina em `:` e fica **sempre acima** do campo.
- Espaços entre `:` e o especificador são opcionais (`Nº*:________`).
- **Largura fixa:** qualquer especificador aceita `{N}` colado no fim (N de 1 a
  12): `Nome: ______{6}`, `CPF: 999.999.999-99{3}`, `Nascimento: dd/mm/aaaa{2}`,
  `Salário: R$ ____{3}`, `Telefone: (99) 99999-9999{4}`, `Estado: @estados{2}`.
  O campo fica com N colunas e sai da divisão por peso (§4). O `{N}` não faz
  parte da máscara. Fora de 1 a 12 é erro; `{` sem número fechado logo depois
  deixa o especificador não reconhecido.

Análise:

1. Proteger tokens reservados que contêm `:` (`hh:mm`) antes de procurar rótulos.
2. Rótulo = texto que começa no início da linha (ou após um especificador) e
   termina em `:`. Todo rótulo contém ao menos uma letra.
3. Especificador = tudo entre o `:` e o próximo rótulo ou fim da linha, sem
   espaços nas pontas.
4. Classificar pela tabela da §3.6, **na ordem**.
5. Sem correspondência → **erro** com linha, coluna e trecho.

### 3.6 Especificadores (ordem de reconhecimento)

A **máscara define o tipo e a validação embutida**. Não existe outra forma de
declarar validação no `.form`.

| # | Forma no `.form` | Tipo | `data-mask` no HTML | Validação embutida | Peso |
|---|---|---|---|---|---|
| 1 | `@nome` | lista | — (usa `data-list`) | obrigatório | 8 |
| 2 | `R$ ____` | moeda (sempre 2 casas) | `R$` | número | nº de `_` |
| 3 | `email___` | e-mail | — (`type="email"`) | formato de e-mail | nº total de caracteres |
| 4 | `dd/mm/aaaa` | data | `dd/mm/aaaa` | data existente | 10 |
| 5 | `hh:mm` | hora | `hh:mm` | 00:00–23:59 | 5 |
| 6 | `999.999.999-99` | CPF | idem | dígitos verificadores | 14 |
| 7 | `99.999.999/9999-99` | CNPJ numérico **e** alfanumérico | idem | dígitos verificadores (regra da Receita, 2026) | 18 |
| 8 | `99999-999` | CEP | idem | completo | 9 |
| 9 | `(99) 99999-9999` / `(99) 9999-9999` | telefone | idem | completo | 15 / 14 |
| 10 | `____` | texto livre | — | — | nº de `_` |
| 11 | `999` | inteiro de até N dígitos | idem | nº de dígitos | nº de caracteres |
| 12 | `0000` | código de **exatamente** N dígitos; ao sair do campo, completa com zeros à esquerda (`12` → `0012`) | idem | N dígitos | nº de caracteres |
| 13 | `99999.99` | decimal: dígitos inteiros e casas decimais pelo nº de `9` de cada lado | idem | nº de dígitos | nº de caracteres |
| 14 | combinação de `9`/`0`, `A`, `*` e literais | máscara posicional | idem | completa | nº de caracteres |

Com `{N}` no fim (§3.5), qualquer linha da tabela fica com largura fixa de N
colunas, no lugar do peso.

- Máscara posicional: `9` (ou `0`) dígito, `A` letra, `*` letra ou dígito, demais
  caracteres são literais inseridos automaticamente. Sem conversão para
  maiúsculas (exceto CNPJ, que exige maiúsculas).
- **Zeros à esquerda: escreva a máscara com `0`.** Em máscaras só de dígitos,
  `999` = número de até 3 dígitos e `000` = código de exatamente 3 dígitos,
  completado com zeros à esquerda e guardado como texto. Misturar `0` e `9` numa
  máscara só de dígitos (`0099`) é erro.
- Em máscaras com literais, `0` equivale a `9`: `00000-000` também é CEP,
  `000.000.000-00` também é CPF.
- Formatos 6–9 são reconhecidos pelo texto exato (depois de trocar `0` por `9`).
- **Números (inteiro, decimal, moeda) sempre aceitam negativo**; a máscara não tem
  `-`. Limites ficam em `data-min` / `data-max` no HTML (ou `field.min` / `field.max`
  por programação): `data-min="0"` recusa negativos.
- Decimal é exibido no formato brasileiro, **sem separador de milhar**, **sempre
  com as casas da máscara** (`99999.99` com `12,5` → `12,50`).
  Moeda **com** separador de milhar e 2 casas (`-1.234,56`).

### 3.7 Listas `@nome`

- Geram `<select class="form-select" data-list="nome">` com **apenas** a
  opção vazia "Selecione…".
- As opções vêm do **provedor de lista registrado** com esse nome (§8). Sem
  provedor registrado, o runtime não mexe no `<select>`: o gerado fica vazio, e
  opções escritas à mão no HTML são mantidas **[PENDENTE E3]**. **A ferramenta não
  traz listas prontas.**
- **Arquivo de dados `<nome>.json`:** se o projeto tiver um `estados.json` para a
  lista `@estados`, o JS inicial do formulário onde a lista está (página ou
  componente) já nasce com
  `form.list('estados', utils.loadJson('./estados.json'))` (no componente,
  `parte.list(…)`; §8.11), e o arquivo vai ao lado da página (§10). O conteúdo segue o formato do provedor:
  `[{ "value": "SP", "label": "São Paulo" }]` ou `["SP", "RJ"]`.
- Sem `{N}`, a lista **não tem largura fixa**: entra na divisão proporcional da
  linha com peso 8 (§4), então sozinha ocupa as 12 colunas. `@nome{N}` fixa N
  colunas (1–12).
- O nome do campo é o slug do rótulo (`Estado:` → `estado`), não o nome da lista.

### 3.8 Seção de opções (rádio e seleção múltipla)

```text
--Sexo*                     --Interesses
(M) Masculino               [ESP] Esportes
(F) Feminino                [MUS] Música
( ) Prefiro não informar
```

- Sempre em **seção própria**, nunca dentro de uma linha da grade.
- O título da seção é a **pergunta**; `*` no título = obrigatório.
- Uma opção por linha, sempre **empilhadas na vertical**.
- `(valor)` = rádio (valor único). `[valor]` = seleção múltipla (valor no JSON é
  uma lista). Não se misturam na mesma seção.
- Opção sem valor (`( )` ou `[ ]`) usa **o próprio texto** como valor
  (`"Prefiro não informar"`, texto exato).
- Uma seção cuja primeira linha é `[ ] Texto` vira seleção múltipla. Uma linha
  `[ ] Texto{nome}` ou `[ ] Texto*` encerra a seleção múltipla e vira caixa de
  marcação isolada **[PENDENTE E2]**.
- Gera um `<fieldset>` com `<legend>` e um `form-check` por opção; todas as opções
  têm o mesmo `name`. `required` em todas as opções = pelo menos uma marcada.

### 3.9 Seção de texto longo

```text
--Observações{obs}
______________________________________________
______________________________________________
```

- Seção cujo conteúdo são linhas só de `_`. O número de linhas é o `rows` do
  `<textarea class="form-control">`. Sempre 12 colunas; o título é o rótulo.

### 3.10 Caixa de marcação isolada

```text
[ ] Aceito os termos de uso{aceite}*
```

- `[ ]` seguido do texto, fora de seção de opções. Texto **ao lado** da caixa
  (única exceção à regra "rótulo acima"). Pode dividir a linha com outros campos;
  peso = nº de caracteres do texto + 4. Valor `true`/`false`.

### 3.11 Botões

- **O `.form` não declara botões** (`[[ Texto ]]` é erro). Botão é comando, e
  comando é comportamento: vem do JS da página.
- O gerador põe no fim do `<form>` uma barra `<div class="d-flex gap-2 mt-2"
  data-buttons>` com um único botão, **Enviar** (`data-action="enviar"`, `btn-primary`).
- No `ready()`, se o JS da página registrou ações (`form.action(nome, fn, { label })`,
  §8.3), o runtime **refaz a barra**: um `<button type="button" data-action="nome">`
  por ação, na ordem do registro; o primeiro `btn-primary`, os demais
  `btn-outline-secondary`. Texto: `label` ou o nome (`gravar_rascunho` →
  "Gravar rascunho"). Sem nenhuma ação, fica o "Enviar" do HTML.
- **Nada decide o que o botão faz**, nem se valida: isso é do callback da ação.
- Componentes não têm botões nem ações (§8.10).

### 3.12 Componentes

Um **componente** é um `.form` da pasta `components/`: campos, seções, opções,
tudo como uma página, **sem título** (`-Texto` é erro; componente vazio também),
e não vira página — entra nas páginas (e em outros componentes) **sozinho numa
seção**, como o texto longo de "Observações":

```text
--Endereço Residencial{residencial}
+endereco
--Endereço Comercial{comercial}
+endereco
```

- A seção dá o **título** (o `<legend>`) e o **nome** (a chave no JSON: o
  `{nome}` ou o slug do título); os campos do componente entram **direto nela**,
  sem outro título: `residencial.cep`, `comercial.cep`. Chaves repetidas no mesmo
  nível ganham `_2` (aviso), como qualquer nome.
- A linha `+componente` é o **único** conteúdo da seção: `+` em outro lugar (sem a
  seção logo acima, ou depois de campos) é erro, e a forma é só `+nome` (título e
  nome ficam na seção). A seção termina no `+`: o que vem depois volta à
  seção-pai, e uma subseção logo abaixo é erro.
- O conteúdo é o do componente **tal como ele é**: os obrigatórios valem como lá
  estão (`*` no título da seção é ignorado, com aviso). Regras como "pelo menos
  um dos endereços" são do JS.
- Um componente pode incluir outros componentes. O nome depois do `+` é o nome do
  arquivo em `components/` (letras, números, `_` e `-`).
- Erros: componente que não existe, inclusão circular (`a → b → a`) e erro dentro
  do componente são erros **na linha da inclusão**; o do componente vem na
  mensagem (`componente "endereco" com erro — endereco.form:3:6: …`) e no campo
  `cause: { component, line, column }` do erro, para levar até ele.
- O JS do componente fica ao lado dele (`components/endereco.js`) e recebe a
  parte do formulário onde foi incluído. Ninguém precisa chamá-lo: o
  `form.ready()` o carrega e o chama uma vez por seção (§8.10).
- Uma página pode não ter campos próprios: só o título e as seções dos componentes.

---

## 4. Layout: grade de 12 colunas (Bootstrap)

Cada linha de campos vira uma `div.row`. Toda linha **preenche as 12 colunas**.

1. Campos de largura fixa (especificador com `{N}`, §3.5) reservam suas colunas primeiro.
2. As colunas restantes `R = 12 − fixas` são divididas proporcionalmente ao peso:
   `ideal_i = R × peso_i / soma_pesos`.
3. `col_i = max(1, floor(ideal_i))`; as que faltarem vão para os maiores restos;
   empate → mais à esquerda.
4. Soma > 12 → retirar das maiores. Só fixos com soma < 12 → fica como pedido.
   Fixos > 12 → erro. Mais de 12 campos → erro.

Responsivo: `col-12 col-md-N`.

A largura mínima é 1 coluna, então um campo curto ao lado de campos longos fica
estreito (ex.: `Idade: 999` ao lado de e-mail e telefone) **[PENDENTE E1]**.

Resultados esperados (teste unitário obrigatório):

| Linha | Pesos | Colunas |
|---|---|---|
| Nome | 62 | 12 |
| Endereço / Nº / Complemento | 24 / 8 / 8 | 7 / 3 / 2 |
| Bairro / Cidade / Estado / CEP | 13 / 9 / 8 (`@estados`) / 9 | 4 / 3 / 2 / 3 |
| Bairro / Cidade / Estado / CEP | 13 / 9 / *fixo 2* (`@estados{2}`) / 9 | 4 / 3 / 2 / 3 |
| Nome / CPF | *fixo 6* (`______{6}`) / 14 | 6 / 6 |
| Nome / CPF | 16 / *fixo 3* (`999.999.999-99{3}`) | 9 / 3 |
| Estado sozinho | 8 (`@estados`) | 12 |
| CPF / Nascimento / Salário | 14 / 10 / 10 | 5 / 4 / 3 |

---

## 5. HTML gerado

### 5.1 Regras

- Página: HTML5 válido (W3C), `lang="pt-BR"`, `meta charset`, viewport.
- **Bootstrap 5.3** (CDN, versão fixa); **nenhum CSS próprio** e **nenhuma classe
  própria**: só classes do Bootstrap e atributos padrão do HTML.
- **Fragmento ou página.** Por padrão o gerador devolve só o `<form>…</form>`
  (para embutir em outro sistema); com `{ page: true }` devolve a página completa
  descrita aqui, que é o que a interface web e a CLI gravam.
- Na página, o gerador **não** inclui o `forms.js` diretamente. Inclui
  `<script type="module" src="<nome>.js"></script>`, o **JS da página**, com o
  nome do formulário, que é o do arquivo (`pages/clientes.form` → `clientes.html`
  e `clientes.js`, e `<form id="clientes">`). A interface web e a CLI passam esse
  nome em `name`; sem ele (o gerador sozinho), vale o slug do título. `script:
  false` tira a tag. Renomear o `.form` renomeia tudo. O JS da página importa
  `./forms.js` (o `Form` e as `utils`), cria o `Form` e registra as ações (§8); o JS dos componentes é
  chamado pelo `form.ready()` (§8.10). A CLI e a interface web criam uma versão inicial dele e do JS de
  cada componente (`stub(ast)`); a CLI **sempre pergunta antes de sobrescrever**
  um que já exista.
- Os componentes saem **expandidos** no HTML da página: o HTML não é montado
  enquanto a página roda. Um comentário marca cada inclusão (`<!-- Componente
  endereco: Endereço Residencial -->`) e o `<fieldset>` da seção leva
  `data-component="endereco"`.
- A barra de botões (§3.11) fecha o `<form>`; `buttons: false` a tira (a
  interface web usa isso para mostrar um componente sozinho). Sem título (um
  componente gerado sozinho), não há `<h1>` e o `<title>` é o nome.
- 2 espaços de indentação, um elemento por linha, ordem de atributos estável:
  `type, class, id, name, data-*, placeholder, inputmode, maxlength, value, required`.
- Sem estilos inline, sem `<script>` inline, sem IDs aleatórios; saída
  determinística.
- Comentários HTML curtos marcando cada seção.
- `<form id="clientes" novalidate>` sem `action`/`method`.
- A mensagem de erro (`div.invalid-feedback`) não vai no HTML: o runtime cria quando
  precisa.
- `name` = **caminho completo com pontos** (`residencial.cep`); `id` = caminho com
  hífen (`residencial-cep`).

### 5.2 Saída esperada (trecho real do exemplo)

```html
<!-- Componente endereco: Endereço Residencial -->
<fieldset class="mb-4" name="residencial">
  <legend class="h5 pb-2 border-bottom">Endereço Residencial</legend>
  <div class="row g-3 mb-3">
    <div class="col-12 col-md-4">
      <label class="form-label" for="residencial-bairro">Bairro</label>
      <input type="text" class="form-control" id="residencial-bairro" name="residencial.bairro">
    </div>
    <!-- ... Cidade ... -->
    <div class="col-12 col-md-2">
      <label class="form-label" for="residencial-estado">Estado</label>
      <select class="form-select" id="residencial-estado" name="residencial.estado" data-list="estados">
        <option value="">Selecione…</option>
      </select>
    </div>
    <div class="col-12 col-md-3">
      <label class="form-label" for="residencial-cep">CEP</label>
      <input type="text" class="form-control" id="residencial-cep" name="residencial.cep" data-mask="99999-999" inputmode="numeric" maxlength="9">
    </div>
  </div>
</fieldset>

<!-- Opções: Sexo -->
<fieldset class="mb-4">
  <legend class="h5 pb-2 border-bottom">Sexo <span class="text-danger">*</span></legend>
  <div class="form-check">
    <input type="radio" class="form-check-input" id="sexo-1" name="sexo" value="M" required>
    <label class="form-check-label" for="sexo-1">Masculino</label>
  </div>
  <!-- ... -->
</fieldset>

<div class="d-flex gap-2 mt-2" data-buttons>
  <button type="button" class="btn btn-primary" data-action="enviar">Enviar</button>
</div>
```

No `<head>` (de `clientes.form`):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<script type="module" src="clientes.js"></script>
```

---

## 6. Contrato HTML ↔ runtime

O runtime depende **só** disto. Qualquer HTML que siga o contrato funciona.

### 6.1 Atributos

| Atributo | Uso |
|---|---|
| `data-mask` | máscara do campo; o runtime usa a **mesma tabela** da §3.6 para saber tipo, formatação, validação embutida e normalização |
| `data-list` | nome do provedor de lista |
| `data-action` | nome da ação do botão |
| `data-buttons` | a barra de botões: o runtime a refaz com um botão por ação registrada (§3.11) |
| `data-component` | no `<fieldset>` da seção de um componente: `ready()` carrega `components/<nome>.js` e o chama com a parte da seção, cujo caminho são os `name` dos `<fieldset>` dela e dos de fora (§8.10) |
| `data-min` / `data-max` | limites de números (inteiro, decimal, moeda) |
| `required` | obrigatório; num grupo de opções, em todas as opções = pelo menos uma marcada |
| `type="email"` | validação de e-mail |
| `name` com pontos | caminho no JSON (`residencial.cep`); é o `name` que define o aninhamento, não o `<fieldset>` |
| `type="checkbox"` com `value` | opção de seleção múltipla (valor no JSON = lista); sem `value` = caixa isolada (`true`/`false`) |

Trocar `data-mask` à mão troca tipo, máscara e validação embutida, sem regerar.

### 6.2 Sem classes próprias

**A máscara define o tipo** e **os atributos padrão definem a estrutura**: não há
classes `fm-*`. Para apontar campos por seletor, use atributos, por exemplo
`[data-mask="dd/mm/aaaa"]` (todas as datas), `[data-list="estados"]`,
`[name^="comercial."]` (todos os campos da seção comercial). O `name` do
`<fieldset>` de uma seção é só descritivo.

### 6.3 Comportamento embutido

- Máscara aplicada ao digitar e ao colar, cursor posicionado corretamente,
  caracteres inválidos descartados, `inputmode="numeric"` quando só há dígitos.
- Moeda: digitação da direita para a esquerda (`123456` → `1.234,56`); `R$` num
  `input-group-text`.
- Código `0000`: ao sair do campo, completa com zeros à esquerda (`12` → `0012`).
- Números aceitam `-` digitado no início.
- Validação de campo ao sair dele; depois do primeiro erro, a cada digitação.
  O **obrigatório só é cobrado por `form.validate()`** (no envio): durante a
  edição, campo vazio (inclusive caixa desmarcada) não ganha erro, e o
  "Campo obrigatório." mostrado no envio fica até o campo ser preenchido.
  Texto incompleto (ex.: data `12/05`) não conta como vazio: mostra o erro da máscara.
- Erro: `is-invalid`, mensagem em `.invalid-feedback` (`aria-describedby`),
  `aria-invalid="true"`.
- Validação embutida = obrigatório + a da máscara (§3.6). Validadores extras são
  registrados por programação (§8), **vários por campo**; aparece **só o primeiro
  erro** de cada campo.
- Mensagens em pt-BR, substituíveis por programação.

---

## 7. JSON de saída

```json
{
  "pessoais": {
    "nome": "Maria Silva",
    "cpf": "529.982.247-25",
    "nascimento": "1980-05-17",
    "salario": 1234.56,
    "email": "maria@exemplo.com",
    "telefone": "(11) 98765-4321",
    "idade": 45
  },
  "residencial": {
    "logradouro": "Rua A", "numero": "10", "complemento": null,
    "bairro": "Centro", "cidade": "São Paulo", "estado": "SP", "cep": "01310-100"
  },
  "comercial": {
    "logradouro": null, "numero": null, "complemento": null,
    "bairro": null, "cidade": null, "estado": null, "cep": null
  },
  "contato": { "agencia": "0012", "ramal": 1234, "horario": "14:30" },
  "sexo": "Prefiro não informar",
  "interesses": ["ESP", "MUS"],
  "obs": "Cliente desde 2010.",
  "aceite": true
}
```

| Tipo | Valor no JSON |
|---|---|
| campo vazio (qualquer tipo) | `null` |
| texto, texto longo, e-mail | string sem espaços nas pontas |
| máscaras (CPF, CNPJ, CEP, telefone, posicional) | string **com os literais**, como exibida (padrão; configurável **por tipo de máscara** com a opção `literals` do `Form`, §8.1) |
| data | `aaaa-mm-dd` |
| hora | `hh:mm` |
| inteiro, decimal, moeda | número JSON |
| código `0000` | string com zeros (`"0012"`) |
| lista, rádio | valor da opção (string) |
| seleção múltipla | lista de valores (vazia → `null`) |
| caixa de marcação | `true` / `false` |

Campos desabilitados, ocultos ou somente leitura **entram** no JSON (a forma do
JSON é sempre a mesma). Preencher a partir do JSON faz o caminho inverso.

---

## 8. Runtime JavaScript (interface)

ES module sem dependências (`packages/runtime/src/forms.js`), API em inglês, acompanhada de
`forms.d.ts`. Não há versão com variável global.

### 8.1 Criação e ciclo de vida

```js
import { Form } from './forms.js';

const form = new Form('#clientes', { literals: { cpf: false } });  // seletor ou HTMLFormElement
// ... registros (8.2 a 8.5) e os componentes (8.10) ...
await form.ready();   // aplica máscaras, carrega as listas, refaz os botões, dispara 'fm:ready'
```

- **Tudo é registrado por instância.** Não há registro global. O reaproveitamento
  entre formulários é o JS dos componentes (§8.10): uma função que recebe a parte
  e que a página chama explicitamente; o integrador pode escrever outras do mesmo
  jeito (ex.: `registrarPadroes(form)`).
- Registros devem ser feitos **antes** de `ready()`.
- Opções do construtor:

| Opção | Padrão | Efeito |
|---|---|---|
| `components` | `'components/'` | de onde `ready()` carrega o JS dos componentes (`<fieldset data-component>`): a pasta, relativa à página; uma função `nome -> módulo` (ou a própria função do componente), para carregar de outro jeito; ou `false` (ninguém é chamado; a página chama com `form.scope()`). |
| `literals` | `true` | **por tipo de máscara**: `{ cpf, cnpj, cep, phone, mask }` (`mask` = máscaras posicionais genéricas). `{ cpf: false }` faz o CPF sair `"52998224725"`; `false` vale para todos. `setData()` aceita os dois formatos. Uma máscara registrada com `form.maskType(mask, { literals })` tem a própria regra. A data é sempre exibida `dd/mm/aaaa` e guardada `aaaa-mm-dd`. |

### 8.2 Alvos explícitos

Funções que apontam para campos recebem um **alvo** sempre explícito:

```js
{ name: 'pessoais.cpf' }                        // um campo, pelo nome completo
{ name: ['residencial.cep', 'comercial.cep'] }  // vários nomes
{ selector: '[data-mask="dd/mm/aaaa"]' }        // seletor CSS (dentro do formulário)
```

- Nomes são sempre o **caminho completo**, sem curingas.
- Nome inexistente num alvo `{ name }` (`validator`, `on`, `validate`,
  `reloadList`, `fields`) gera um **aviso no console** que sugere o nome completo
  quando há um campo com a mesma última parte (`"cpf"` → `"dados.cpf"`) ou, senão,
  lista os campos do formulário. O alvo continua sem efeito para esse nome.
- Seletores são avaliados no momento do uso (validação, evento), então mudanças
  feitas à mão no HTML são respeitadas.

### 8.3 Listas e ações

```js
// Nome da lista -> callback async. Sem registro = lista vazia. Sem cache.
form.list('estados', async ({ form, field, data }) => {
  const r = await fetch('/api/ufs');
  return r.json();   // [{ value: 'SP', label: 'São Paulo' }, ...] ou ['SP', 'RJ']
});
form.list('bancos', utils.loadJson('./bancos.json'));   // pronto (§8.11)

// Nome da ação -> callback. Cada ação vira um botão, na ordem do registro (§3.11).
// Nenhuma validação automática: o callback decide.
form.action('enviar', async ({ form, data, button }) => {
  if (!form.validate({ focus: true }).valid) return;
  const r = await fetch('/api/clientes', { method: 'POST', body: JSON.stringify(data) });
  if (r.status === 422) return { errors: await r.json() };  // [{ field, message }]
});
form.action('cancelar', () => history.back(), { label: 'Voltar' });  // texto do botão
```

As ações são **da página**: o JS de um componente não registra ações (§8.10).

O provedor devolve um **array** (ou `null`/`undefined` = lista vazia). Qualquer
outra coisa é um erro daquela lista (`fm:error`, `source: 'list'`), com mensagem
que diz o que veio — por exemplo `recebeu Response; faltou .json()?` — e não
impede o resto do `ready()`.

Ao clicar num botão:
1. Dispara `fm:action` (cancelável com `preventDefault()`).
2. Desabilita os botões enquanto o callback não termina.
3. Se o callback devolver `{ errors: [{ field: 'pessoais.cpf', message: '...' }] }`,
   mostra esses erros nos campos.
4. Se lançar exceção → `fm:error` e reabilita os botões.
5. Ação sem callback → aviso no console e `fm:error`.

`form.reloadList(alvo)` chama de novo o provedor das listas do alvo (útil para
listas dependentes).

### 8.4 Validadores

```js
form.validator({ name: 'pessoais.nascimento' }, (value, { form, field, data }) =>
  value <= hoje() || 'A data não pode ser futura.');
form.validator({ selector: '[data-mask="R$"]' }, (value) =>
  value >= 0 || 'Informe um valor positivo.');
```

- **Síncronos** apenas (nesta versão).
- Retorno: `true` = válido; texto = mensagem de erro.
- Vários por campo. Ordem: obrigatório → validação da máscara → registrados, na
  ordem de registro. **Para no primeiro erro** e mostra só ele.
- Validadores registrados não são chamados com valor vazio (`null`); vazio é
  assunto do obrigatório.
- `value` é o valor normalizado (o mesmo do JSON).
- Novo tipo de máscara, também por instância:

```js
form.maskType('999.99999.99-9', { validate: (value) => pisValido(value) || 'PIS inválido.' });
// todo campo com data-mask="999.99999.99-9" ganha essa validação embutida.
```

### 8.5 Campos calculados

```js
form.calcField('pessoais.idade', ['pessoais.nascimento'],
  (nascimento) => nascimento ? idadeEm(nascimento) : null);
form.calcField('pessoais.idade', ['pessoais.nascimento'], utils.dateDiffYears); // pronto (§8.11)
```

- 1º parâmetro: nome completo do campo calculado. 2º: nomes completos das
  dependências (sem curingas). 3º: função que recebe os valores normalizados das
  dependências, na mesma ordem, e devolve o valor do campo.
- O campo calculado fica `readonly`.
- Recalcula quando qualquer dependência muda e depois de `setData()`.
- Pode depender de outro campo calculado; ciclo → exceção no registro.
- Campo ou dependência inexistente → exceção no registro, com a mesma sugestão
  da §8.2: `Form.calcField: campo "idade" não existe. Use o nome completo, com as
  seções: "dados.idade".`

### 8.6 Dados e estado

```js
form.getData()                        // → JSON (§7)
form.setData(json, { clear: true })   // JSON → tela; recalcula campos calculados
form.validate({ target, focus })      // → { valid, errors: [{ field, message }] } (síncrono)
form.showErrors([{ field, message }]) // mostra erros vindos de fora (ex.: servidor)
form.clear()
form.readOnly(true)                   // formulário inteiro somente leitura
form.reloadList(alvo)                 // → Promise
form.messages({ required: 'Obrigatório.', cpf: 'CPF inválido.' })
form.destroy()                        // remove ouvintes
```

### 8.7 Campos

```js
const cep = form.field('residencial.cep');               // por nome completo
const datas = form.fields({ selector: '[data-mask="dd/mm/aaaa"]' });

cep.name           // 'residencial.cep'
cep.value          // '01310-100' (normalizado); atribuir formata e dispara fm:change
cep.text           // texto exibido
cep.mask           // lê/escreve data-mask
cep.required = true
cep.enabled = false
cep.readOnly = true
cep.visible = false
cep.error = 'CEP não encontrado'   // erro manual; '' limpa
cep.min = 0        // lê/escreve data-min (data-max em cep.max)
cep.element        // o elemento (input, select, textarea ou fieldset)
```

### 8.8 Eventos

`CustomEvent` disparados no `<form>`:

| Evento | `detail` |
|---|---|
| `fm:ready` | `{ form }` |
| `fm:change` | `{ field, value, old }` |
| `fm:action` | `{ action, data }` — cancelável |
| `fm:invalid` | `{ errors }` |
| `fm:error` | `{ error, source: 'list' \| 'action' \| 'validator' \| 'calc' }` |

Atalho: `form.on('change', { name: 'residencial.estado' }, fn)` (o alvo é opcional).

Exemplo de lista dependente:

```js
form.list('cidades', async ({ data }) =>
  data.residencial.estado ? buscarCidades(data.residencial.estado) : []);
form.on('change', { name: 'residencial.estado' },
  () => form.reloadList({ name: 'residencial.cidade' }));
```

### 8.9 Ficam para a versão 2

Validadores assíncronos; regras por seletor além de validação (mostrar/ocultar,
habilitar, tornar obrigatório); controle de alterações (`dirty`, desfazer,
comparar com os dados originais); validações entre partes mais sofisticadas
(ex.: "pelo menos um dos endereços"), que serão programadas no JS.

### 8.10 Componentes: a parte do formulário

O JS de um componente (`components/endereco.js`) exporta uma função que recebe a
**parte** do formulário onde ele foi incluído. **Ninguém a chama à mão**: no
`ready()`, antes de máscaras, botões e listas, o runtime acha cada `<fieldset
data-component="endereco">`, importa `components/endereco.js` (relativo à página;
opção `components`, §8.1) e chama o `export default` com `form.scope(caminho da
seção)` — uma vez por seção, na ordem do documento, inclusive as seções de
componentes dentro de componentes. A página não importa nada:

```js
// components/endereco.js
import { utils } from '../forms.js';

export default function endereco(parte) {
  parte.list('estados', utils.loadJson('./estados.json'));
  parte.validator({ name: 'cep' }, (value) => value !== '00000-000' || 'CEP inválido.');
}

// clientes.js (página): só as ações e o que for da página
import { Form } from './forms.js';

const form = new Form('#clientes');
form.action('enviar', async ({ form, data }) => { /* ... */ });
await form.ready();   // chama endereco(residencial) e endereco(comercial)
```

- JS que não carrega, que não exporta uma função ou que lança exceção: `console.error`
  e `fm:error` com `source: 'component'`; o `ready()` segue com o resto.
- Com `components: false`, o runtime não chama ninguém e a página faz isso:
  `import endereco from './components/endereco.js'` e
  `endereco(form.scope('residencial'))`.

`form.scope(caminho)` devolve um `Part`:

- **Nomes relativos**: `{ name: 'cep' }`, `field('cep')`, `calcField('idade',
  ['nascimento'], fn)` valem `residencial.cep` etc. `{ selector }` só pega campos
  da parte. `list(nome, fn)` vale só para as listas da parte e vence o provedor
  do formulário com o mesmo nome (vale o da parte mais específica).
- Métodos: `list`, `validator`, `calcField`, `maskType`, `on` (sem alvo, só os
  campos da parte), `field`, `fields`, `reloadList`, `validate` (sem alvo, a parte),
  `getData()` (o objeto da parte no JSON), `setData(json, { clear })` (nomes
  relativos), `clear()`, `readOnly(flag)`, `scope(caminho)` (uma parte dentro
  desta) e `prefix`.
- **Sem `action`, `ready`, `messages`**: comandos e ciclo de vida são da página.
- `form.scope('nada')` sem nenhum campo avisa no console e lista as partes do
  formulário. `form.scope('')` é o formulário inteiro (a interface web usa para
  testar um componente sozinho).

### 8.11 Funções prontas: `utils`

`utils.js`, reexportado por `forms.js`: funções que servem **direto** como provedor
de lista ou como função de `calcField`. A página importa `{ Form, utils }` de
`./forms.js`; o componente, `{ utils }` de `../forms.js` (os JS iniciais já vêm
com o import).

```js
parte.list('estados', utils.loadJson('./estados.json'));
parte.list('cidades', utils.loadJson(({ data }) => `./cidades-${data.residencial.estado}.json`));
parte.calcField('idade', ['nascimento'], utils.dateDiffYears);        // até hoje
form.calcField('prazo', ['inicio', 'fim'], utils.dateDiffDays);       // fim − início
form.calcField('total', ['valor1', 'valor2', 'valor3'], utils.sum);
```

| Função | Devolve |
|---|---|
| `loadJson(url)` | um provedor de lista que lê o JSON (`fetch`; URL relativa à página, como no `fetch`). `url` pode ser uma função `({ form, field, data }) => url`, para listas que dependem de outro campo. Resposta não `ok` → erro da lista (`fm:error`, `source: 'list'`), com a URL e o status. |
| `dateDiffYears(início, fim?)` | anos completos (trunca) |
| `dateDiffYearsFrac(início, fim?)` | anos com a fração do ano em curso |
| `dateDiffMonths(início, fim?)` | meses completos (trunca) |
| `dateDiffMonthsFrac(início, fim?)` | meses com a fração do mês em curso |
| `dateDiffDays(início, fim?)` | dias |
| `sum(...valores)` | soma |
| `avg(...valores)` | média |
| `min(...valores)` / `max(...valores)` | menor / maior |

**Datas.**

- Cada data é o valor de um campo de data (`'aaaa-mm-dd'`), `'dd/mm/aaaa'` ou um
  `Date`.
- Com **uma** data (um `calcField` com uma dependência só), a diferença é até
  **hoje** (data local). Com **duas**, é **fim − início**, negativa se o fim vier
  antes.
- Faltando uma das datas (`null`, vazia, inválida), o resultado é `null`. A segunda
  dependência vazia **não** vira hoje.
- Ano e mês contam como na Lei 810/1949: o prazo vence no dia de mesmo número; se
  ele não existe no mês (29/02, dia 31), no primeiro dia seguinte. Quem nasceu em
  29/02/2000 faz 1 ano em 01/03/2001, e de 31/01 a 28/02 é 0 mês.
- A fração é a parte já decorrida do período em curso, medida em dias. De
  01/01/2025 a 02/07/2025 dá 182/365. Truncar a versão com fração dá sempre a
  versão sem fração.

**Números.**

- `sum`, `avg`, `min` e `max` consideram só os números; arrays são abertos.
  `null`, vazio e texto são ignorados.
- Basta um número para haver resultado: `sum(10, null)` é 10, `avg(4, null, 8)`
  é 6. É `null` só quando não há nenhum.
- `sum` e `avg` tiram o resíduo do ponto flutuante: `sum(0.1, 0.2)` é 0.3.

---

## 9. AST (interna)

```json
{
  "type": "form", "kind": "page", "title": "Cadastro de Clientes", "name": "clientes",
  "children": [
    { "type": "group", "level": 2, "title": "Endereço Residencial", "name": "residencial",
      "path": "residencial", "component": "endereco",
      "children": [
        { "type": "row", "fields": [
          { "type": "text", "label": "Endereço", "name": "logradouro", "path": "residencial.logradouro",
            "required": true, "weight": 24, "cols": 7, "source": { "line": 2, "column": 1 } }
        ]}
      ]},
    { "type": "options", "multiple": false, "title": "Sexo", "name": "sexo", "required": true,
      "options": [ { "value": "M", "label": "Masculino" } ] }
  ]
}
```

- `kind`: `page` ou `component`. Uma inclusão é um `group` com `component`
  (o nome do componente) e os filhos já expandidos, com caminhos e níveis da
  página; o `source` dos nós de dentro é o do arquivo do componente. Num
  componente, `title` é `null`.
- Não há nó de botões.

Erros/avisos: `{ message, line, column, excerpt }` (e `cause: { component, line,
column }` num erro de inclusão). A CLI exibe
`pages/clientes.form:7:28: especificador não reconhecido "99x99"` e sai com código ≠ 0.

---

## 10. CLI, interface web e servidor

```bash
npm install                                             # uma vez: liga os pacotes (sem rede)
npx formularios build projeto/ saida/                    # gera as páginas de projeto/pages em saida/
npx formularios build projeto.zip saida/                 # o mesmo, a partir do zip de projeto do P2
npx formularios check projeto/                           # só valida (páginas e componentes)
npm start                                               # servidor local (interface web e exemplo)
npm run build                                           # site estático do P2 em packages/web/dist
npm run exemplo                                         # recria examples/saida a partir de examples/clientes
npm test                                                # testes de todos os pacotes (node --test)
```

### 10.1 CLI (P4)

- `build <projeto> <saída>`; `<projeto>` é a **pasta do projeto** ou o **zip de
  projeto** do P2 (o mesmo formato, §10.3): `pages/*.form`, `components/*.form`,
  o `.js` de mesmo nome ao lado de cada um quando foi escrito, e na raiz o
  `project.json` (opcional) e os arquivos de dados. Subpastas de `pages/` e
  `components/` e outros arquivos são ignorados. Sem `pages/*.form`, é erro.
- Saída (pronta para publicar): para cada `pages/x.form`, `x.html` e `x.js` na
  raiz; `components/y.js` de cada componente usado pelas páginas; os arquivos de
  dados e uma cópia do runtime (`forms.js`, `masks.js`, `utils.js`, `forms.d.ts`) na raiz.
- JS da página e de cada componente: o do projeto (`pages/x.js`,
  `components/y.js`), se existir; senão, o JS inicial (`stub`), que **só é criado
  se ainda não existir** na saída.
- Arquivos de dados: os que o `project.json` listar em `data`; sem essa lista, o
  `<lista>.json` de cada `@lista` usada pelas páginas (inclusive dentro dos
  componentes). Outros `.json` não são copiados. O JS inicial das listas com
  arquivo já o lê (§3.7).
- Erros: todo componente é verificado, mesmo sem uso. Uma página com erro (dela
  ou de um componente que inclui) não é gravada; as outras são, e a CLI sai com
  código ≠ 0. Uma página `forms.form` ou `masks.form` é erro (o JS coincidiria com
  o runtime); um componente pode ter esses nomes (o JS dele vai para `components/`).
- Opções: `--no-runtime` (não copia o runtime), `--no-stub` (não cria o JS
  inicial), `--no-script` (nem a tag nem o JS), `--force`. Arquivo existente com
  conteúdo diferente **só é sobrescrito depois de perguntar** (em terminal não
  interativo, é mantido). `--force` dispensa a pergunta para o HTML, os dados e o
  runtime, nunca para o JS **[PENDENTE E4]**.
- `check <projeto>`: mesma leitura, só mostra erros e avisos
  (`projeto/pages/x.form:7:28: mensagem`) e um "ok" por página e componente sem
  erro; nada é gravado.

### 10.2 Interface web (P2)

- **Projetos** guardados no `localStorage` (uma chave, JSON): criar, renomear,
  excluir, trocar. Projeto novo nasce com uma página (`formulario.form`) que inclui
  um componente (`endereco.form`). Estados guardados antes dos componentes viram
  páginas.
- **Páginas e componentes**: duas listas na lateral, as pastas fixas `pages/` e
  `components/`. Criar, renomear, excluir. A barra do editor mostra o caminho
  (`pages/clientes.form`, `components/endereco.js`).
  - Renomear uma página renomeia o `.html` e o `.js`. Páginas `forms` e `masks`
    ficam reservadas (viram `forms-2`…), porque o JS coincidiria com o runtime.
  - Renomear um componente atualiza as linhas `+nome` de todas as páginas e
    componentes e os imports (`'./components/nome.js'`, `'./nome.js'`) dos JS
    escritos. Excluir um componente em uso avisa quem o inclui.
  - Duas abas de edição: a especificação `.form` e o **JS da página** ou **do
    componente**. Enquanto o usuário não escreve o JS, ele é o inicial (`stub`) e
    acompanha o `.form` e os arquivos de dados; ao editar, passa a ser do usuário
    ("Voltar ao JS inicial" descarta).
- **Arquivos de dados (`.json`)** do projeto: criar (sugere o nome da primeira
  `@lista` sem arquivo), enviar do disco, renomear, excluir; editor de JSON com
  aviso de JSON inválido. Na pré-visualização, `fetch('./x.json')` recebe o
  arquivo do projeto.
- **Editores** (CodeMirror, ver §2): destaque de sintaxe no `.form`, no JS e no
  JSON; desfazer, busca, parênteses. **Autocompletar e snippets da biblioteca**
  no JS: membros de `Form` (`form.`), da parte (`parte.`, o parâmetro do
  `export default function` do componente, variáveis de `.scope(`) e de `Field`
  (`form.field('x').`, `{ field }`); dentro das strings, os nomes que o `.form`
  aberto declara (listas em `.list('`, inclusões em `form.scope('`, campos em
  `field('`, `{ name: '` e `calcField` — relativos, no JS do componente —,
  máscaras/listas/seções em `{ selector: '`, eventos em `.on('`, arquivos de
  dados em `fetch('` e `loadJson('`); as funções de `utils.` (§8.11); snippets de
  instrução: na página, `import { Form, utils }`, `new Form`, `form.list`,
  `form.action` (com ou sem `label`), `validator`, `calcField` (também com
  `utils`), `on`, `messages`, `maskType`, `await form.ready()`; no componente,
  `import { utils }`, `export default function`, `parte.list`, `parte.validator`
  etc. No `.form`, depois de `Rótulo: `, os especificadores
  (§3.6) e as `@listas`; depois de `+`, os componentes do projeto; Ctrl+Espaço
  numa linha vazia sugere seção, seção com componente, opções e caixa.
- **Tema** claro, escuro ou automático (segue o sistema), guardado no navegador.
  A pré-visualização é **sempre clara**: mostra a página como será publicada.
- **Tamanho da letra dos editores**: botões A− / A+ na barra do editor (10 a 24 px,
  padrão 13; o número do meio volta ao padrão), guardado no navegador. Só muda os
  editores de código, não o resto da interface nem a pré-visualização; a vista HTML
  tem os seus próprios A− / A+, independentes.
- **Ajuda**: botão no cabeçalho que abre, no lugar da pré-visualização (que segue
  rodando por baixo), a documentação para quem escreve formulários, com índice em
  duas partes: a linguagem `.form` (§3, §4 e §7, com páginas, componentes e
  botões) e o JS (§8: página e componente, a parte, alvos, listas, ações,
  validadores, calculados, dados, campos, mensagens com os textos padrão, eventos
  e o que a pré-visualização faz). Fica em `src/ajuda.html`,
  buscado na primeira abertura; Esc ou ✕ fecha. Os blocos de código quebram a
  linha em vez de rolar para o lado.
- **Painéis ajustáveis**, como no VS Code: as divisórias entre a lista de
  arquivos, o editor e a pré-visualização se arrastam com o mouse (ou com as
  setas do teclado, Shift = passo maior); duplo clique volta ao padrão. Limites:
  lista de 180 a 480 px, editor a partir de 280 px, pré-visualização com pelo
  menos 300 px. As larguras ficam guardadas no navegador. Em telas estreitas
  (< 900 px) os painéis empilham e as divisórias somem.
- **Página / HTML** na barra da pré-visualização: alterna entre a página rodando e
  o **código-fonte do HTML**, exatamente o `<nome>.html` do zip de HTMLs
  (`render(ast, { page: true })`; num componente, o trecho `<form>` dele, sem
  botões), com destaque de sintaxe e **só leitura** (dá
  para selecionar, copiar e buscar). Acompanha o `.form` sem perder a rolagem e
  usa o tema. Nessa vista, a barra troca Validar / Coletar JSON / Recarregar por
  botões A− / A+ próprios (mesmos limites dos editores, tamanho guardado à parte).
  A escolha entre Página e HTML fica guardada no navegador.
- **Pré-visualização** em `<iframe>` (~300 ms após parar de digitar): a página
  gerada mais o JS da página e dos componentes, rodando com o runtime de verdade.
  O JS de cada componente vira um módulo `blob:`, e um import map leva
  `components/x.js` (onde o `ready()` o procura) até ele; num componente, os
  imports `'./x.js'` e `'../forms.js'` são religados. Um
  **componente aberto** aparece sozinho, sem botões, com o JS dele recebendo
  `form.scope('')`. Erros do `.form` e do JS e avisos do runtime (`Form.…` no
  console) aparecem na lista de problemas com o arquivo e a linha
  (`components/endereco.js 3: …`) — a da chamada no JS da página ou do
  componente, mesmo quando o erro nasce dentro do runtime; o clique abre o
  arquivo na linha. Erro num componente incluído leva ao componente. Erro antes
  de `form.ready()` avisa que a pré-visualização ficou sem máscaras, botões e
  listas. Botões Validar, Coletar JSON e Recarregar; ao clicar num botão do
  formulário, mostra o JSON da ação.
- **Baixar projeto (.zip)** e **Enviar projeto (.zip)** no formato da §10.3; o
  projeto enviado entra como um projeto novo.
- **Baixar HTMLs (.zip)**: o mesmo que a CLI grava (§10.1): `x.html` e `x.js` de
  cada página, `components/y.js` de cada componente usado (escrito ou inicial), os
  arquivos de dados e o runtime. Não baixa se alguma página tiver erro ou se não
  houver página.
- Publicação: `npm run build` monta `packages/web/dist` com cópias do gerador e do
  runtime em `vendor/` e o import map apontando para elas; a pasta vai para
  qualquer hospedagem estática.

### 10.3 Zip de projeto

```text
project.json              { "format": 2, "name": "Loja", "data": [ "estados.json" ] }
pages/clientes.form       as páginas
pages/clientes.js         só quando o JS foi escrito (sem ele, vale o inicial)
pages/pedido.form
components/pessoa.form    os componentes
components/endereco.form
components/endereco.js    idem
estados.json              arquivos de dados
```

O projeto pode estar numa pasta dentro do zip (vale a do `project.json` mais raso
ou, sem ele, a que tem `pages/`). Sem `project.json`, o nome do projeto vem do
arquivo; na interface, todo `.json` da raiz vira arquivo de dados; na CLI, só o
`<lista>.json` das `@listas`. A interface só aceita o formato 2.

### Estrutura

```text
package.json                      # workspaces; scripts start, test, build, exemplo
packages/runtime/                 # P3 @formularios/runtime
  src/masks.js                    #   tabela de máscaras (também usada pelo gerador)
  src/forms.js                    #   runtime (Form, Part, Field)
  src/utils.js                    #   funções prontas (listas, datas, somas)
  src/forms.d.ts                  #   tipos
packages/gerador/                 # P1 @formularios/gerador
  src/parser.js                   #   texto -> AST (com as inclusões expandidas)
  src/layout.js                   #   pesos -> colunas
  src/renderer.js                 #   AST -> HTML (fragmento ou página)
  src/stub.js                     #   JS inicial da página e do componente
  src/slug.js
  src/index.js                    #   generate(), componentsOf(), formatIssue()
packages/web/                     # P2 @formularios/web
  index.html                      #   interface (import map)
  src/app.js, src/app.css         #   telas e tema
  src/ajuda.html                  #   ajuda: linguagem .form, componentes e JS
  src/editor.js                   #   editores e visualizador do HTML (CodeMirror do CDN; sem rede, <textarea>)
  src/api.js                      #   autocompletar: API do runtime, snippets, nomes do .form
  src/project.js                  #   projeto (páginas, componentes, dados), zips
  src/store.js                    #   localStorage
  src/preview.js                  #   documento da pré-visualização e módulos dos componentes
  src/zip.js                      #   zip (CompressionStream)
  scripts/build.js                #   -> dist/ (fora do git)
packages/cli/                     # P4 @formularios/cli
  bin/formularios.js              #   comando
  src/input.js                    #   pasta ou zip do projeto -> arquivos
  src/plan.js                     #   o que gravar
  src/zip.js                      #   leitor de zip (node:zlib)
packages/*/test/                  # node --test
scripts/serve.js                  # servidor local
examples/clientes/                # exemplo da §3.1: pages/clientes.form e .js, components/ (pessoa,
                                  #   endereco, com o JS de cada um), estados.json
examples/saida/                   # gerado (npm run exemplo; fora do git)
.github/workflows/pages.yml       # publica packages/web/dist no GitHub Pages a cada push na main
```

---

## 11. Critérios de aceite

1. O exemplo da §3.1 gera HTML válido no W3C e sem violações do axe.
2. Larguras da §4 conferem (teste unitário).
3. `getData()` no exemplo preenchido devolve exatamente a estrutura da §7;
   `setData(json)` seguido de `getData()` devolve o mesmo JSON. Com
   `literals: { cpf: false }`, CPF sai `"52998224725"`. `data-min="0"` recusa
   negativos.
4. CPF `529.982.247-25` válido; `111.111.111-11` e `123.456.789-00` inválidos.
5. CNPJ `11.222.333/0001-81` válido; um CNPJ alfanumérico de exemplo da Receita
   válido; dígito trocado inválido.
6. Data `29/02/2024` válida; `29/02/2023` e `31/04/2025` inválidas; `24:00` inválida.
7. Moeda: `123456` → `1.234,56` → JSON `1234.56`; `-50` aceito. Decimal `999.99`:
   `12,5` → exibido `12,50` → JSON `12.5`.
8. Inteiro `999` aceita `-12`, rejeita 4 dígitos. Código `0000`: `12` → `0012`
   (string no JSON).
9. CEP: colar `01310100` → `01310-100`; `data-mask="00000-000"` se comporta igual a
   `99999-999`.
10. Lista sem provedor registrado fica como está, sem erro; com provedor, cada
    `ready()`/`reloadList()` chama o callback (sem cache).
11. Trocar à mão `data-mask="99999-999"` por `data-mask="999.999.999-99"` faz o
    campo validar CPF, sem regerar.
12. Dois validadores no mesmo campo, ambos falhando: aparece só a mensagem do
    primeiro registrado.
13. Clicar num botão não valida nada por conta própria; um callback que devolve
    `{ errors: [...] }` faz os erros aparecerem nos campos. Sem ações registradas,
    a página tem só "Enviar"; com `form.action('salvar')` e
    `form.action('cancelar', fn, { label: 'Voltar' })`, os botões são "Salvar" e "Voltar".
14. `calcField` com idade: muda a data → idade recalculada; o campo fica somente
    leitura; registrar um ciclo lança exceção.
15. `----Texto` gera erro.
16. O mesmo módulo do gerador roda na interface web (navegador) e na CLI (Node).
17. Um projeto baixado da interface web e enviado de volta volta igual; a CLI gera
    a partir desse zip o mesmo que a interface põe no zip de HTMLs.
18. `packages/web/dist` funciona sozinho numa hospedagem estática.
19. Com `estados.json` no projeto, a lista `@estados` de um componente aparece
    preenchida na pré-visualização, no zip de HTMLs e na saída da CLI, sem editar
    o JS inicial.
20. Sem acesso ao CDN do CodeMirror, a interface web continua funcionando com
    editores de texto simples.
21. O componente `endereco` incluído duas vezes (`residencial` e `comercial`) gera
    os campos `residencial.cep` e `comercial.cep`; o JS dele, chamado com
    `form.scope('residencial')`, valida `{ name: 'cep' }` só no residencial.
22. Erro dentro de um componente aparece na página, na linha da inclusão, com o
    arquivo e a linha do componente; inclusão circular é erro.
23. `calcField('idade', ['nascimento'], utils.dateDiffYears)` mostra a idade em
    anos completos até hoje e fica vazio sem a data; `calcField('total', [a, b, c],
    utils.sum)` soma o que estiver preenchido e fica vazio só sem nenhum valor.

---

## 12. Rodadas futuras (não implementar agora)

- Abas / etapas para formulários longos.
- Subformulários condicionais.
- Versão para impressão.
- Exportar a AST/esquema para a aplicação CRUD e para workflow.
