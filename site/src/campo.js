// Assistente de campo: das escolhas do usuário (tipo, rótulo, nome, obrigatório e
// os parâmetros do tipo) ao texto .form do campo, e onde ele pode entrar no
// arquivo aberto. Puro: sem DOM (assistente.js cuida da janela; testado no Node).
import { parse, slug } from '@formularios/gerador';

// grupo 'linha': entra numa linha de campos (pode dividir a linha com outros);
// 'secao': é uma seção própria (opções, texto longo).
// params: os parâmetros que o tipo usa, além de rótulo, nome e obrigatório.
export const TIPOS = [
  { id: 'texto', label: 'Texto', grupo: 'linha', params: ['tamanho', 'largura'], tamanho: 20 },
  { id: 'email', label: 'E-mail', grupo: 'linha', params: ['tamanho', 'largura'], tamanho: 20 },
  { id: 'inteiro', label: 'Número inteiro', grupo: 'linha', params: ['digitos', 'largura'], digitos: 5 },
  { id: 'decimal', label: 'Número decimal', grupo: 'linha', params: ['inteiros', 'decimais', 'largura'] },
  { id: 'moeda', label: 'Moeda (R$)', grupo: 'linha', params: ['tamanho', 'largura'], tamanho: 10 },
  { id: 'data', label: 'Data', grupo: 'linha', params: ['largura'] },
  { id: 'hora', label: 'Hora', grupo: 'linha', params: ['largura'] },
  { id: 'cpf', label: 'CPF', grupo: 'linha', params: ['largura'] },
  { id: 'cnpj', label: 'CNPJ', grupo: 'linha', params: ['largura'] },
  { id: 'cep', label: 'CEP', grupo: 'linha', params: ['largura'] },
  { id: 'celular', label: 'Celular', grupo: 'linha', params: ['largura'] },
  { id: 'telefone', label: 'Telefone fixo', grupo: 'linha', params: ['largura'] },
  { id: 'codigo', label: 'Código (zeros à esquerda)', grupo: 'linha', params: ['digitos', 'largura'], digitos: 4 },
  { id: 'mascara', label: 'Máscara personalizada', grupo: 'linha', params: ['mascara', 'largura'] },
  { id: 'lista', label: 'Lista (caixa de seleção)', grupo: 'linha', params: ['lista', 'largura'] },
  { id: 'caixa', label: 'Caixa de marcação', grupo: 'linha', params: [] },
  { id: 'radio', label: 'Escolha única (rádio)', grupo: 'secao', params: ['opcoes'] },
  { id: 'multipla', label: 'Múltipla escolha', grupo: 'secao', params: ['opcoes'] },
  { id: 'longo', label: 'Texto longo', grupo: 'secao', params: ['linhas'] },
];

const FIXOS = {
  data: 'dd/mm/aaaa', hora: 'hh:mm', cpf: '999.999.999-99', cnpj: '99.999.999/9999-99',
  cep: '99999-999', celular: '(99) 99999-9999', telefone: '(99) 9999-9999',
};

export const tipo = (id) => TIPOS.find((t) => t.id === id);

// Nome que o gerador daria sem chaves (o slug do rótulo).
export const nomePadrao = (rotulo) => slug(String(rotulo ?? '').trim());

// opcoes: { tipo, rotulo, nome, obrigatorio, tamanho, digitos, inteiros, decimais,
//   mascara, lista, largura (1–12 ou vazio), opcoes (texto: uma por linha,
//   "valor = Rótulo" ou só "Rótulo"), linhas, nivel (hífens da seção) }
// -> { texto, erro }: texto são as linhas do .form (sem \n no fim).
export function textoDoCampo(o) {
  const t = tipo(o.tipo);
  if (!t) return { texto: '', erro: 'escolha o tipo do campo' };
  const rotulo = String(o.rotulo ?? '').trim();
  const nome = String(o.nome ?? '').trim();
  if (!rotulo) return { texto: '', erro: t.id === 'caixa' ? 'escreva o texto da caixa' : t.grupo === 'secao' ? 'escreva o título (a pergunta)' : 'escreva o rótulo' };
  if (!/\p{L}/u.test(rotulo)) return { texto: '', erro: 'o rótulo precisa de ao menos uma letra' };
  if (/[{}*]/.test(rotulo) || (t.grupo === 'linha' && t.id !== 'caixa' && rotulo.includes(':'))) {
    return { texto: '', erro: `o rótulo não pode ter ${t.id === 'caixa' || t.grupo === 'secao' ? '{ } ou *' : ': { } ou *'}` };
  }
  if (nome && !/^[\p{L}\w-]+$/u.test(nome)) return { texto: '', erro: 'o nome no JSON só pode ter letras, números, _ e -' };
  // {nome} só quando difere do que o gerador já daria.
  const marca = `${nome && nome !== nomePadrao(rotulo) ? `{${nome}}` : ''}${o.obrigatorio ? '*' : ''}`;
  const largura = o.largura ? Number(o.largura) : null;
  if (largura !== null && !(Number.isInteger(largura) && largura >= 1 && largura <= 12)) {
    return { texto: '', erro: 'a largura vai de 1 a 12 colunas' };
  }
  const n = (v, padrao, min, max, oque) => {
    const x = v === undefined || v === null || v === '' ? padrao : Number(v);
    if (!Number.isInteger(x) || x < min || x > max) throw new Error(`${oque}: de ${min} a ${max}`);
    return x;
  };

  try {
    if (t.id === 'caixa') return { texto: `[ ] ${rotulo}${marca}`, erro: null };
    if (t.grupo === 'secao') {
      const nivel = n(o.nivel, 2, 2, 3, 'nível da seção');
      const titulo = `${'-'.repeat(nivel)}${rotulo}${marca}`;
      if (t.id === 'longo') {
        const linhas = n(o.linhas, 3, 1, 20, 'linhas');
        return { texto: [titulo, ...Array(linhas).fill('_'.repeat(60))].join('\n'), erro: null };
      }
      const itens = String(o.opcoes ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (!itens.length) return { texto: '', erro: 'escreva as opções, uma por linha' };
      const [abre, fecha] = t.id === 'radio' ? ['(', ')'] : ['[', ']'];
      const linhas = [];
      for (const item of itens) {
        const m = /^(.*?)\s*=\s*(.+)$/.exec(item);
        const [valor, texto] = m ? [m[1].trim(), m[2].trim()] : ['', item];
        if (valor.includes(fecha)) return { texto: '', erro: `o valor "${valor}" não pode ter "${fecha}"` };
        linhas.push(`${abre}${valor || ' '}${fecha} ${texto}`);
      }
      return { texto: [titulo, ...linhas].join('\n'), erro: null };
    }
    let spec;
    if (FIXOS[t.id]) spec = FIXOS[t.id];
    else if (t.id === 'texto') spec = '_'.repeat(n(o.tamanho, t.tamanho, 1, 200, 'tamanho'));
    else if (t.id === 'email') spec = `email${'_'.repeat(Math.max(1, n(o.tamanho, t.tamanho, 6, 200, 'tamanho') - 5))}`;
    else if (t.id === 'moeda') spec = `R$ ${'_'.repeat(n(o.tamanho, t.tamanho, 1, 30, 'tamanho'))}`;
    else if (t.id === 'inteiro') spec = '9'.repeat(n(o.digitos, t.digitos, 1, 15, 'dígitos'));
    else if (t.id === 'codigo') spec = '0'.repeat(n(o.digitos, t.digitos, 1, 30, 'dígitos'));
    else if (t.id === 'decimal') spec = `${'9'.repeat(n(o.inteiros, 7, 1, 15, 'dígitos inteiros'))}.${'9'.repeat(n(o.decimais, 2, 1, 6, 'casas decimais'))}`;
    else if (t.id === 'lista') {
      const lista = String(o.lista ?? '').trim() || nomePadrao(rotulo);
      if (!/^\w+$/.test(lista)) return { texto: '', erro: 'o nome da lista só pode ter letras sem acento, números e _' };
      spec = `@${lista}`;
    } else if (t.id === 'mascara') {
      spec = String(o.mascara ?? '').trim();
      if (!spec) return { texto: '', erro: 'escreva a máscara (9 = dígito, A = letra, * = letra ou dígito)' };
      if (/\s/.test(spec)) return { texto: '', erro: 'a máscara não pode ter espaços' };
    }
    const texto = `${rotulo}${marca}: ${spec}${largura ? `{${largura}}` : ''}`;
    // O gerador tem a palavra final (máscara personalizada, larguras).
    const erro = parse(`-T\n${texto}`, { name: 'x' }).errors[0]?.message ?? null;
    return { texto, erro };
  } catch (error) {
    return { texto: '', erro: error.message };
  }
}

// Onde entra um campo numa linha nova, com o cursor na linha `linha` (1 = a
// primeira): -> { depois, troca }. depois = a linha após a qual ele entra; troca =
// a linha do cursor está vazia e é substituída. Com o cursor numa seção fechada
// (opções, texto longo, componente), o campo entra depois dela, não no meio.
export function posicao(fonte, linha) {
  const linhas = fonte.split('\n');
  const i = Math.max(1, Math.min(linha, linhas.length));
  if (!linhas[i - 1].trim()) return { depois: i - 1, troca: true };
  const fechada = /^\s*(\(|\[|_+\s*$|\+)/;
  let fim = i;
  if (/^\s*-/.test(linhas[i - 1]) || fechada.test(linhas[i - 1])) {
    while (fim < linhas.length && fechada.test(linhas[fim])) fim++;
  }
  return { depois: fim, troca: false };
}

// O que vale no ponto de inserção (ver posicao):
// - nivel: hífens de uma seção nova ali (filha da seção aberta; no máximo 3);
// - mesmaLinha: a linha do cursor é uma linha de campos deste arquivo (o campo
//   pode ir ao lado dos que já estão nela).
export function contexto(fonte, linha, { component = false } = {}) {
  const { depois } = posicao(fonte, linha);
  let no = parse(fonte.split('\n').slice(0, depois).join('\n'), { name: 'x', component }).ast;
  for (;;) {
    const ultimo = no.children?.at(-1);
    if (ultimo?.type !== 'group' || ultimo.component) break;
    no = ultimo;
  }
  const nivel = Math.min(3, (no.level ?? 1) + 1);
  let mesmaLinha = false;
  const andar = (filhos) => {
    for (const n of filhos ?? []) {
      if (n.type === 'group' && !n.component) andar(n.children);
      if (n.type === 'row' && n.fields.some((f) => f.source?.line === linha)) mesmaLinha = true;
    }
  };
  andar(parse(fonte, { name: 'x', component }).ast.children);
  return { nivel, mesmaLinha };
}

// O texto do arquivo com o campo inserido: numa linha nova (ver posicao) ou no
// fim da linha do cursor, ao lado dos campos.
// -> { fonte, linha }: o novo texto e a linha onde o campo começa.
export function inserir(fonte, linha, texto, { mesmaLinha = false } = {}) {
  const linhas = fonte.split('\n');
  if (mesmaLinha) {
    const i = Math.max(1, Math.min(linha, linhas.length)) - 1;
    linhas[i] = `${linhas[i].replace(/\s+$/, '')}   ${texto}`;
    return { fonte: linhas.join('\n'), linha: i + 1 };
  }
  const { depois, troca } = posicao(fonte, linha);
  linhas.splice(depois, troca ? 1 : 0, ...texto.split('\n'));
  return { fonte: linhas.join('\n'), linha: depois + 1 };
}
