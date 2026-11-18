// Tabela de máscaras compartilhada entre o gerador e o runtime.
// Sem DOM, sem Node: só funções puras sobre strings.
//
// A máscara define o tipo do campo. Formatos reconhecidos (na ordem):
//   R$                 moeda (2 casas, separador de milhar)
//   dd/mm/aaaa         data (exibida dd/mm/aaaa, valor aaaa-mm-dd)
//   hh:mm              hora
//   999                inteiro de até N dígitos
//   000                código de exatamente N dígitos, com zeros à esquerda
//   999.99             decimal (dígitos inteiros . casas decimais)
//   999.999.999-99     CPF
//   99.999.999/9999-99 CNPJ (numérico e alfanumérico)
//   99999-999          CEP
//   (99) 99999-9999    telefone (também (99) 9999-9999)
//   outros             máscara posicional: 9 dígito, A letra, * letra ou dígito
// Em máscaras com literais, 0 equivale a 9 (00000-000 é CEP).

const EXACT = {
  '999.999.999-99': 'cpf',
  '99.999.999/9999-99': 'cnpj',
  '99999-999': 'cep',
  '(99) 99999-9999': 'phone',
  '(99) 9999-9999': 'phone',
};

const MAX_MONEY_DIGITS = 15;

export function parseMask(mask) {
  if (typeof mask !== 'string') return null;
  const m = mask.trim();
  if (!m) return null;
  if (m === 'R$') return { type: 'money', mask: m, decimals: 2 };
  if (m === 'dd/mm/aaaa') return { type: 'date', mask: m, pattern: '99/99/9999' };
  if (m === 'hh:mm') return { type: 'time', mask: m, pattern: '99:99' };
  if (/^9+$/.test(m)) return { type: 'integer', mask: m, digits: m.length };
  if (/^0+$/.test(m)) return { type: 'code', mask: m, digits: m.length };
  if (/^[09]+$/.test(m)) return null; // 0 e 9 misturados sem literais
  const n = m.replace(/0/g, '9');
  const dec = /^(9+)\.(9+)$/.exec(n);
  if (dec) return { type: 'decimal', mask: m, intDigits: dec[1].length, decimals: dec[2].length };
  const exact = EXACT[n];
  if (exact === 'cnpj') return { type: 'cnpj', mask: m, pattern: '**.***.***/****-99', upper: true };
  if (exact) return { type: exact, mask: m, pattern: n };
  if (/[9A*]/.test(n)) return { type: 'mask', mask: m, pattern: n };
  return null;
}

// Atributos de apresentação usados pelo gerador.
export function inputHints(desc) {
  switch (desc.type) {
    case 'money': return { inputmode: 'decimal', align: 'end' };
    case 'integer': return { inputmode: 'numeric', maxlength: desc.digits + 1, align: 'end' };
    case 'code': return { inputmode: 'numeric', maxlength: desc.digits };
    case 'decimal': return { inputmode: 'decimal', maxlength: desc.intDigits + desc.decimals + 2, align: 'end' };
    case 'date': return { inputmode: 'numeric', maxlength: 10, placeholder: 'dd/mm/aaaa' };
    case 'time': return { inputmode: 'numeric', maxlength: 5, placeholder: 'hh:mm' };
    default: {
      const onlyDigits = !/[A*]/.test(desc.pattern);
      return { inputmode: onlyDigits ? 'numeric' : undefined, maxlength: desc.pattern.length };
    }
  }
}

// Chave usada pela opção `literals` do Form (por tipo de máscara).
export function literalsKey(desc) {
  return ['cpf', 'cnpj', 'cep', 'phone'].includes(desc.type) ? desc.type : 'mask';
}

export function hasPattern(desc) {
  return Boolean(desc && desc.pattern);
}

// ---------------------------------------------------------------- padrões

export const isSlot = (p) => p === '9' || p === 'A' || p === '*';

function accepts(p, ch) {
  if (p === '9') return ch >= '0' && ch <= '9';
  if (p === 'A') return /\p{L}/u.test(ch);
  if (p === '*') return /[\p{L}0-9]/u.test(ch);
  return false;
}

export function applyPattern(pattern, input, upper = false) {
  let out = '';
  let i = 0;
  for (let p = 0; p < pattern.length; p++) {
    const pc = pattern[p];
    if (isSlot(pc)) {
      while (i < input.length && !accepts(pc, input[i])) i++;
      if (i >= input.length) break;
      out += upper ? input[i].toUpperCase() : input[i];
      i++;
    } else {
      if (i >= input.length) break;
      out += pc;
      if (input[i] === pc) i++;
    }
  }
  while (out.length && !isSlot(pattern[out.length - 1])) out = out.slice(0, -1);
  return out;
}

function stripLiterals(pattern, text) {
  let out = '';
  for (let i = 0; i < text.length; i++) if (isSlot(pattern[i])) out += text[i];
  return out;
}

// Posição no texto formatado logo depois do k-ésimo caractere digitado.
export function caretAfter(desc, formatted, k) {
  const typed = hasPattern(desc)
    ? (i) => isSlot(desc.pattern[i])
    : (i) => /[\p{L}0-9]/u.test(formatted[i]);
  if (k <= 0) {
    let i = 0;
    while (i < formatted.length && !typed(i)) i++;
    return i;
  }
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (typed(i) && ++count === k) return i + 1;
  }
  return formatted.length;
}

export function countTyped(text) {
  return (text.match(/[\p{L}0-9]/gu) || []).length;
}

// ---------------------------------------------------------------- números

function groupThousands(int) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${sign}${groupThousands(int)},${dec}`;
}

export function formatDecimal(n, decimals) {
  return n.toFixed(decimals).replace('.', ',');
}

function parseBrNumber(text) {
  const t = text.trim();
  if (!t || t === '-') return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// ---------------------------------------------------------------- formatação

// Formata enquanto o usuário digita.
export function formatInput(desc, text) {
  switch (desc.type) {
    case 'money': {
      const neg = text.includes('-');
      const raw = text.replace(/\D/g, '');
      if (!raw) return neg ? '-' : '';
      const digits = (raw.replace(/^0+/, '') || '0').slice(0, MAX_MONEY_DIGITS).padStart(3, '0');
      const int = digits.slice(0, -2).replace(/^0+(?=\d)/, '');
      return `${neg ? '-' : ''}${groupThousands(int)},${digits.slice(-2)}`;
    }
    case 'integer': {
      const neg = text.trim().startsWith('-');
      return (neg ? '-' : '') + text.replace(/\D/g, '').slice(0, desc.digits);
    }
    case 'code':
      return text.replace(/\D/g, '').slice(0, desc.digits);
    case 'decimal': {
      let s = text.includes(',') ? text.replace(/\./g, '') : text.replace(/\./g, ',');
      const neg = s.trim().startsWith('-');
      const idx = s.indexOf(',');
      const ip = (idx < 0 ? s : s.slice(0, idx)).replace(/\D/g, '').slice(0, desc.intDigits);
      const dp = idx < 0 ? null : s.slice(idx + 1).replace(/\D/g, '').slice(0, desc.decimals);
      return (neg ? '-' : '') + ip + (dp === null ? '' : ',' + dp);
    }
    default:
      return hasPattern(desc) ? applyPattern(desc.pattern, text, desc.upper) : text;
  }
}

// Ajustes ao sair do campo.
export function finishInput(desc, text) {
  const t = text.trim();
  if (t === '-') return '';
  switch (desc.type) {
    case 'code':
      return t ? t.padStart(desc.digits, '0') : '';
    case 'decimal': {
      const n = parseBrNumber(t);
      return n === null || Number.isNaN(n) ? t : formatDecimal(n, desc.decimals);
    }
    default:
      return t;
  }
}

// Texto exibido -> valor do JSON.
export function toValue(desc, text, literals = true) {
  const t = (text ?? '').trim();
  if (!t) return null;
  switch (desc.type) {
    case 'money':
    case 'decimal': {
      const n = parseBrNumber(t);
      return n === null || Number.isNaN(n) ? null : n;
    }
    case 'integer': {
      if (!/^-?\d+$/.test(t)) return null;
      return Number.parseInt(t, 10);
    }
    case 'code':
      return t.padStart(desc.digits, '0');
    case 'date': {
      if (t.length !== 10) return null;
      const [d, m, a] = t.split('/');
      return `${a}-${m}-${d}`;
    }
    case 'time':
      return t.length === 5 ? t : null;
    default:
      if (!hasPattern(desc)) return t;
      return literals ? t : stripLiterals(desc.pattern, t);
  }
}

// Valor do JSON -> texto exibido.
export function fromValue(desc, value) {
  if (value === null || value === undefined || value === '') return '';
  switch (desc.type) {
    case 'money': {
      const n = typeof value === 'number' ? value : parseBrNumber(String(value));
      return n === null || Number.isNaN(n) ? '' : formatMoney(n);
    }
    case 'decimal': {
      const n = typeof value === 'number' ? value : parseBrNumber(String(value));
      return n === null || Number.isNaN(n) ? '' : formatDecimal(n, desc.decimals);
    }
    case 'integer': {
      const n = Number(value);
      return Number.isFinite(n) ? String(Math.trunc(n)) : '';
    }
    case 'code':
      return String(value).replace(/\D/g, '').padStart(desc.digits, '0');
    case 'date': {
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
      if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
      return applyPattern(desc.pattern, String(value));
    }
    default:
      return hasPattern(desc) ? applyPattern(desc.pattern, String(value), desc.upper) : String(value);
  }
}

// ---------------------------------------------------------------- validação

export function isCpf(text) {
  const d = text.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

// CNPJ numérico e alfanumérico (regra da Receita Federal, 2026):
// cada caractere vale o código ASCII menos 48; pesos de 2 a 9 da direita para a esquerda.
export function isCnpj(text) {
  const c = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const dv = (s) => {
    let sum = 0;
    let w = 2;
    for (let i = s.length - 1; i >= 0; i--) {
      sum += (s.charCodeAt(i) - 48) * w;
      w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

export function isDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return false;
  const [d, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(0);
  dt.setUTCFullYear(a, mo - 1, d);
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isTime(text) {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  return Boolean(m) && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validação embutida pela máscara. Recebe o texto exibido (não vazio).
// Devolve null (válido) ou { key, params } para montar a mensagem.
export function validateText(desc, text, { min = null, max = null } = {}) {
  const t = text.trim();
  if (desc.type === 'email') return EMAIL.test(t) ? null : { key: 'email' };
  if (desc.type === 'text') return null;

  if (['money', 'decimal', 'integer'].includes(desc.type)) {
    if (desc.type === 'integer' && !/^-?\d+$/.test(t)) return { key: 'number' };
    const n = desc.type === 'integer' ? Number.parseInt(t, 10) : parseBrNumber(t);
    if (n === null || Number.isNaN(n)) return { key: 'number' };
    const digits = t.replace(/^-/, '').split(',')[0].replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const maxDigits = desc.type === 'integer' ? desc.digits : desc.intDigits;
    if (maxDigits && digits.length > maxDigits) return { key: 'digits', params: { digits: maxDigits } };
    if (min !== null && n < min) return { key: 'min', params: { min: fromValue(desc, min) } };
    if (max !== null && n > max) return { key: 'max', params: { max: fromValue(desc, max) } };
    return null;
  }
  if (desc.type === 'code') {
    return /^\d+$/.test(t) && t.length <= desc.digits ? null : { key: 'digits', params: { digits: desc.digits } };
  }

  if (t.length !== desc.pattern.length) return { key: 'incomplete', params: { mask: desc.mask } };
  if (desc.type === 'date' && !isDate(t)) return { key: 'date' };
  if (desc.type === 'time' && !isTime(t)) return { key: 'time' };
  if (desc.type === 'cpf' && !isCpf(t)) return { key: 'cpf' };
  if (desc.type === 'cnpj' && !isCnpj(t)) return { key: 'cnpj' };
  return null;
}
