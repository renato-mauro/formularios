# @formularios/runtime

Comportamento dos formulários no navegador: máscaras, validação embutida pela
máscara, validadores e ações registrados por programação, campos calculados e
coleta/preenchimento de JSON. ES module, sem dependências.

- `@formularios/runtime` → `src/forms.js` (`Form`, `Part`, `Field`; tipos em
  `src/forms.d.ts`). `form.action()` faz os botões (barra `[data-buttons]`);
  `form.ready()` carrega `components/<nome>.js` de cada `<fieldset
  data-component>` e o chama com a parte da seção (`form.scope('residencial')`:
  nomes relativos, sem ações). Reexporta `utils`.
- `src/utils.js` → `utils`: funções prontas para listas e campos calculados
  (`loadJson`, `dateDiffYears`, `dateDiffYearsFrac`, `dateDiffMonths`,
  `dateDiffMonthsFrac`, `dateDiffDays`, `sum`, `avg`, `min`, `max`). Pura; a
  página usa `import { Form, utils } from './forms.js'`.
- `@formularios/runtime/masks` → `src/masks.js`: a tabela de máscaras, pura (sem
  DOM, sem Node). O gerador usa este módulo para decidir o tipo de cada campo.

Funciona com qualquer HTML que siga o contrato da §6 do `agentes.md`, gerado ou
escrito à mão. Interface completa: §8.
