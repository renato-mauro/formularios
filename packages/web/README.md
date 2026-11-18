# @formularios/web

Interface web para gerenciar projetos de formulários (páginas, componentes e
arquivos de dados `.json` por projeto), guardados no `localStorage`. Testa cada
página e cada componente com o runtime, baixa/envia o zip de projeto e baixa o
zip de HTMLs. Tema claro/escuro.
Detalhes: §10.2 e §10.3 do `agentes.md`.

- Editores: CodeMirror 6 do esm.sh, uma versão fixa por pacote no import map (com
  `*`, as dependências ficam como imports nomeados e resolvem pelo mesmo import
  map: uma só cópia de `@codemirror/state`). Para atualizar, troque as versões lá.
  Sem rede, `src/editor.js` mantém os `<textarea>`. O destaque do `.form` e do
  HTML gerado (vista HTML da pré-visualização, só leitura) são modos próprios
  (`StreamLanguage`), sem pacote extra.
- Autocompletar: `src/api.js` (puro, testado no Node) sabe a API do runtime e lê
  o `.form` aberto; `src/editor.js` só traduz para o CodeMirror.
- Pré-visualização: `src/preview.js` monta o documento do `<iframe>`; o JS de cada
  componente vira um módulo `blob:` (`linkComponents`), com os imports relativos
  religados.
- Ajuda: `src/ajuda.html` é um fragmento HTML com a linguagem `.form`, os
  componentes e o JS (resumo do `agentes.md` §3, §4, §7 e §8). Ao mudar a
  linguagem ou a API do runtime, atualize os dois.

- Desenvolvimento: `npm start` na raiz do repositório e abra <http://localhost:8080/>.
  O `index.html` resolve `@formularios/gerador` e `@formularios/runtime` por import
  map, com caminhos do monorepo.
- Publicação: `npm run build` gera `dist/`, com cópias do gerador e do runtime em
  `dist/vendor/` e o import map apontando para elas. Copie a pasta inteira.

Exporta, para quem precisar ler ou gravar o formato do projeto em JS:
`@formularios/web/project` e `@formularios/web/zip` (os testes da CLI usam).
