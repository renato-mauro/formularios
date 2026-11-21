# CLAUDE.md

A especificação completa do projeto está em `agentes.md`; leia antes de mudar
qualquer comportamento. Decisões das rodadas de perguntas já estão incorporadas lá.

- Monorepo (npm workspaces) com quatro pacotes em `packages/`: `gerador` (P1),
  `web` (P2), `runtime` (P3) e `cli` (P4). As dependências permitidas estão na §2
  do `agentes.md`; não crie outras (P2 e P4 só se falam pelo zip de projeto, §10.3).
- JavaScript puro, ES modules, sem dependências de terceiros e sem bundler. Única
  exceção: os editores do P2 usam CodeMirror 6 do CDN (versões fixas no import map
  de `packages/web/index.html`); sem rede, voltam a ser `<textarea>`.
- `packages/runtime/src/masks.js` é compartilhado: o gerador importa
  `@formularios/runtime/masks`. A máscara define o tipo do campo nos dois lados.
- O gerador (`packages/gerador/src/`) não pode usar DOM nem APIs do Node; recebe
  os componentes como texto (`components: { nome: texto }`).
- Projetos têm duas pastas fixas, na web e na CLI: `pages/` (viram páginas) e
  `components/` (entram com `+nome`). O nome do formulário é o do arquivo. Botões
  não ficam no `.form`: vêm das ações do JS da página (§3.11, §3.12, §8.10).
- `npm install` uma vez (só liga os pacotes). Testes: `npm test`. Servidor local: `npm start`.
- Depois de mudar o gerador ou o runtime, regenere o exemplo com `npm run exemplo`.
- `docs/` é o site do GitHub Pages, gerado por `npm run build` e versionado: depois
  de mudar a web, o gerador ou o runtime, rode o build antes do commit.
- Ao mudar a linguagem `.form` ou a API do runtime, atualize também a ajuda da
  interface web (`packages/web/src/ajuda.html`).
