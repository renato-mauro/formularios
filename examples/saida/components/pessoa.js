// pessoa.js — componente pessoa: validações e campo calculado.
// Recebe a parte do formulário onde foi incluído; os nomes são relativos a ela
// ({ name: 'nascimento' } é "pessoais.nascimento" na página de clientes).
import { utils } from '../forms.js';

export default function pessoa(parte) {
  // Validadores registrados por programação (síncronos; vale o primeiro erro).
  parte.validator({ name: 'nascimento' }, (value) =>
    value <= new Date().toISOString().slice(0, 10) || 'A data não pode ser futura.');
  parte.field('salario').min = 0; // equivale a data-min="0" no HTML

  // Campo calculado: idade em anos completos até hoje (fica somente leitura).
  // Com uma dependência, utils.dateDiffYears compara com a data de hoje.
  parte.calcField('idade', ['nascimento'], utils.dateDiffYears);
}
