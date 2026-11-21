// utils.js — funções prontas para listas e campos calculados (agentes.md §8.11).
// Puro (só usa fetch em loadJson); forms.js o reexporta:
//   import { Form, utils } from './forms.js';
//   parte.list('estados', utils.loadJson('./estados.json'));
//   parte.calcField('idade', ['nascimento'], utils.dateDiffYears);
//
// Datas: o valor de um campo de data ('aaaa-mm-dd'), 'dd/mm/aaaa' ou Date. Com uma
// data, a diferença é até hoje; com duas, fim − início (negativa se o fim vier
// antes). Faltando uma das datas (null, vazia ou inválida), o resultado é null.
// Ano e mês contam como na Lei 810/1949: o prazo vence no dia de mesmo número e,
// se ele não existir no mês (29/02, dia 31), no primeiro dia seguinte.
//
// Números: sum, avg, min e max consideram só os números (arrays são abertos);
// null, vazio e texto são ignorados. Sem nenhum número, o resultado é null.

// Provedor de lista que lê um JSON. url: texto (relativo à página, como no fetch)
// ou função ({ form, field, data }) => texto, para listas que dependem de outro campo.
function loadJson(url) {
  return async (ctx = {}) => {
    const target = typeof url === 'function' ? url(ctx) : url;
    const resp = await fetch(target);
    if (!resp.ok) throw new Error(`utils.loadJson: ${target} respondeu ${resp.status}`);
    return resp.json();
  };
}

// ---------------------------------------------------------------- datas

const dateDiffYears = (start, end) => diff(start, end, (s, e) => Math.floor(months(s, e) / 12));
const dateDiffYearsFrac = (start, end) => diff(start, end, (s, e) => {
  const k = Math.floor(months(s, e) / 12) * 12;
  return k / 12 + fraction(s, e, k, 12);
});
const dateDiffMonths = (start, end) => diff(start, end, months);
const dateDiffMonthsFrac = (start, end) => diff(start, end, (s, e) => {
  const n = months(s, e);
  return n + fraction(s, e, n, 1);
});
const dateDiffDays = (start, end) => diff(start, end, (s, e) => day(e) - day(s));

// end === undefined: hoje (calcField com uma dependência só passa um argumento).
function diff(start, end, fn) {
  const s = ymd(start);
  const e = end === undefined ? today() : ymd(end);
  if (!s || !e) return null;
  return day(s) <= day(e) ? fn(s, e) : 0 - fn(e, s); // 0 - 0 = 0, não -0
}

// Meses completos de s até e (s <= e): o maior n cujo "aniversário" não passa de e.
function months(s, e) {
  const n = (e[0] - s[0]) * 12 + (e[1] - s[1]);
  return day(anniversary(s, n)) > day(e) ? n - 1 : n;
}

// Parte do período [aniversário n, aniversário n + step) já decorrida em e.
function fraction(s, e, n, step) {
  const from = day(anniversary(s, n));
  return (day(e) - from) / (day(anniversary(s, n + step)) - from);
}

// A data n meses depois de [a, m, d]; sem o dia d no mês, o dia 1 do seguinte.
function anniversary([a, m, d], n) {
  const total = a * 12 + (m - 1) + n;
  const y = Math.floor(total / 12);
  const mo = total - y * 12 + 1;
  if (d <= daysIn(y, mo)) return [y, mo, d];
  return mo === 12 ? [y + 1, 1, 1] : [y, mo + 1, 1];
}

function ymd(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : [v.getFullYear(), v.getMonth() + 1, v.getDate()];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!iso && !br) return null;
  const [a, m, d] = (iso ? [iso[1], iso[2], iso[3]] : [br[3], br[2], br[1]]).map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(a, m) ? [a, m, d] : null;
}

function today() {
  return ymd(new Date());
}

function daysIn(a, m) {
  return m === 2 ? (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Dias desde 01/01/1970 (UTC: sem horário de verão no meio).
function day([a, m, d]) {
  const t = new Date(0);
  t.setUTCFullYear(a, m - 1, d);
  return Math.round(t.getTime() / 86400000);
}

// ---------------------------------------------------------------- números

const sum = (...values) => {
  const ns = numbers(values);
  return ns.length ? clean(ns.reduce((acc, n) => acc + n, 0)) : null;
};
const avg = (...values) => {
  const ns = numbers(values);
  return ns.length ? clean(ns.reduce((acc, n) => acc + n, 0) / ns.length) : null;
};
const min = (...values) => {
  const ns = numbers(values);
  return ns.length ? Math.min(...ns) : null;
};
const max = (...values) => {
  const ns = numbers(values);
  return ns.length ? Math.max(...ns) : null;
};

function numbers(values) {
  return values.flat(Infinity).filter((v) => typeof v === 'number' && Number.isFinite(v));
}

// 0.1 + 0.2 -> 0.3: tira o resíduo do ponto flutuante (15 algarismos significativos).
function clean(n) {
  return Number(n.toPrecision(15));
}

export const utils = Object.freeze({
  loadJson,
  dateDiffYears, dateDiffYearsFrac, dateDiffMonths, dateDiffMonthsFrac, dateDiffDays,
  sum, avg, min, max,
});
