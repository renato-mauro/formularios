// Resumo da estrutura de dados de um formulário (vista "Estrutura" da
// pré-visualização): cada seção e cada campo, com o caminho no JSON, o tipo, o
// valor no JSON (agentes.md §7), se pode ficar nulo e os detalhes do tipo; e um
// exemplo do JSON. Puro: recebe a AST do gerador (testado no Node).

const DESCRICAO = {
  text: 'Texto', email: 'E-mail', money: 'Moeda', date: 'Data', time: 'Hora', cpf: 'CPF', cnpj: 'CNPJ',
  cep: 'CEP', phone: 'Telefone', integer: 'Inteiro', code: 'Código', decimal: 'Decimal', mask: 'Máscara',
  list: 'Lista', check: 'Caixa de marcação', radio: 'Escolha única', checks: 'Múltipla escolha', longtext: 'Texto longo',
};

const AMOSTRA = {
  cpf: '529.982.247-25', cnpj: '11.222.333/0001-81', cep: '01310-100', date: '2026-01-31', time: '14:30',
  email: 'nome@exemplo.com', money: 1234.56,
};

// ast: de generate/parse; dados: { 'estados.json': '[…]' } (os arquivos do projeto,
// para mostrar quantos itens tem a lista e um valor de exemplo).
// -> { linhas: [{ tipo: 'secao' | 'campo', ... }], exemplo: objeto JSON }
export function estrutura(ast, { dados = {} } = {}) {
  const linhas = [];
  const exemplo = {};
  const andar = (filhos, componente) => {
    for (const no of filhos ?? []) {
      if (no.type === 'group') {
        const comp = no.component ?? componente;
        linhas.push({ tipo: 'secao', caminho: no.path, rotulo: no.title, componente: no.component ?? componente ?? null });
        andar(no.children, comp);
      } else if (no.type === 'row') {
        for (const f of no.fields) campo(f, f.type, f.label, componente);
      } else if (no.type === 'options') {
        campo(no, no.multiple ? 'checks' : 'radio', no.title, componente);
      } else if (no.type === 'longtext') {
        campo(no, 'longtext', no.title, componente);
      }
    }
  };
  const campo = (no, tipo, rotulo, componente) => {
    const { json, amostra, detalhes } = descrever(no, tipo, dados);
    const nulo = tipo === 'check' ? false : !no.required;
    linhas.push({
      tipo: 'campo', caminho: no.path, rotulo, tipoCampo: DESCRICAO[tipo] ?? tipo, json, nulo,
      obrigatorio: Boolean(no.required), detalhes, colunas: tipo === 'radio' || tipo === 'checks' || tipo === 'longtext' ? 12 : no.cols ?? null,
      componente: componente ?? null,
    });
    colocar(exemplo, no.path, amostra);
  };
  andar(ast?.children, null);
  return { linhas, exemplo };
}

function descrever(no, tipo, dados) {
  const m = no.mask;
  switch (tipo) {
    case 'text': return { json: 'string', amostra: 'texto', detalhes: '' };
    case 'longtext': return { json: 'string', amostra: 'texto', detalhes: `${no.rows} linha(s)` };
    case 'email': return { json: 'string', amostra: AMOSTRA.email, detalhes: 'formato de e-mail' };
    case 'money': return { json: 'number', amostra: AMOSTRA.money, detalhes: 'R$, 2 casas decimais' };
    case 'date': return { json: 'string aaaa-mm-dd', amostra: AMOSTRA.date, detalhes: 'exibida dd/mm/aaaa' };
    case 'time': return { json: 'string hh:mm', amostra: AMOSTRA.time, detalhes: '00:00 a 23:59' };
    case 'integer': return { json: 'number', amostra: Number('1234567890'.slice(0, Math.min(m.length, 9))), detalhes: `até ${m.length} dígito(s)` };
    case 'code': return { json: 'string', amostra: '1'.padStart(m.length, '0'), detalhes: `${m.length} dígito(s), com zeros à esquerda` };
    case 'decimal': {
      const [i, d] = m.split('.');
      return { json: 'number', amostra: Number(`${'1234567'.slice(0, Math.min(i.length, 7))}.${'5'.repeat(d.length)}`), detalhes: `${i.length} dígito(s) inteiros, ${d.length} casa(s) decimais` };
    }
    case 'cpf': case 'cnpj': case 'cep':
      return { json: 'string', amostra: AMOSTRA[tipo], detalhes: `${m} (com os literais)` };
    case 'phone': return { json: 'string', amostra: m.length === 15 ? '(11) 98765-4321' : '(11) 3456-7890', detalhes: `${m} (com os literais)` };
    case 'mask': return { json: 'string', amostra: amostraDaMascara(m), detalhes: `${m} (com os literais)` };
    case 'list': {
      const itens = lerLista(dados[`${no.list}.json`]);
      const detalhes = itens ? `@${no.list} — ${no.list}.json, ${itens.length} item(ns)` : `@${no.list} — sem arquivo (o JS fornece)`;
      return { json: 'string', amostra: itens?.[0] ?? 'valor', detalhes };
    }
    case 'radio': case 'checks': {
      const valores = no.options.map((o) => o.value);
      const detalhes = `valores: ${valores.map((v) => JSON.stringify(v)).join(', ')}`;
      return tipo === 'radio'
        ? { json: 'string', amostra: valores[0] ?? null, detalhes }
        : { json: 'string[]', amostra: valores.slice(0, 1), detalhes: `${detalhes}; nenhum marcado = null` };
    }
    case 'check': return { json: 'boolean', amostra: true, detalhes: no.required ? 'precisa estar marcada' : 'desmarcada = false' };
    default: return { json: 'string', amostra: null, detalhes: m ?? '' };
  }
}

// Valores de um arquivo de lista ([{ value, label }] ou ['valor']); null se não der.
function lerLista(texto) {
  if (texto === undefined) return null;
  try {
    const dados = JSON.parse(texto);
    return Array.isArray(dados) ? dados.map((x) => String(x !== null && typeof x === 'object' ? x.value : x)) : null;
  } catch {
    return null;
  }
}

function amostraDaMascara(mascara) {
  let d = 0;
  return mascara.replace(/[90A*]/g, (c) => (c === 'A' || c === '*' ? 'A' : String((d++ % 9) + 1)));
}

function colocar(obj, caminho, valor) {
  const partes = caminho.split('.');
  let atual = obj;
  for (const p of partes.slice(0, -1)) atual = atual[p] ??= {};
  atual[partes.at(-1)] = valor;
}
