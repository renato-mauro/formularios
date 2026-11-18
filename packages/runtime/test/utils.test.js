import assert from 'node:assert/strict';
import { test } from 'node:test';
import { utils } from '../src/utils.js';

const {
  avg, dateDiffDays, dateDiffMonths, dateDiffMonthsFrac, dateDiffYears, dateDiffYearsFrac, loadJson, max, min, sum,
} = utils;

test('anos e meses completos: truncam, e fim − início', () => {
  assert.equal(dateDiffYears('1980-05-17', '2026-05-16'), 45);
  assert.equal(dateDiffYears('1980-05-17', '2026-05-17'), 46);
  assert.equal(dateDiffYears('2026-05-17', '1980-05-17'), -46, 'fim antes do início: negativa');
  assert.equal(dateDiffYears('2026-05-17', '2025-05-18'), 0);
  assert.equal(dateDiffMonths('2026-01-15', '2026-03-14'), 1);
  assert.equal(dateDiffMonths('2026-01-15', '2026-03-15'), 2);
  assert.equal(dateDiffMonths('2026-03-15', '2026-01-15'), -2);
  assert.equal(dateDiffDays('2026-01-01', '2026-03-01'), 59);
  assert.equal(dateDiffDays('2024-01-01', '2024-03-01'), 60, 'ano bissexto');
  assert.equal(dateDiffDays('2026-03-01', '2026-01-01'), -59);
  assert.equal(dateDiffDays('2026-03-08', '2026-03-08'), 0);
});

test('dia que não existe no mês: vence no primeiro dia seguinte (Lei 810/1949)', () => {
  assert.equal(dateDiffYears('2000-02-29', '2001-02-28'), 0);
  assert.equal(dateDiffYears('2000-02-29', '2001-03-01'), 1);
  assert.equal(dateDiffYears('2000-02-29', '2004-02-29'), 4);
  assert.equal(dateDiffMonths('2026-01-31', '2026-02-28'), 0);
  assert.equal(dateDiffMonths('2026-01-31', '2026-03-01'), 1);
  assert.equal(dateDiffMonths('2026-01-31', '2026-03-31'), 2);
  assert.equal(dateDiffMonths('2026-01-31', '2026-04-30'), 2);
});

test('com fração: a parte decorrida do ano ou do mês em curso', () => {
  assert.equal(dateDiffYearsFrac('2025-01-01', '2026-01-01'), 1);
  assert.equal(dateDiffYearsFrac('2025-01-01', '2025-07-02'), 182 / 365);
  assert.equal(dateDiffYearsFrac('2024-01-01', '2024-07-02'), 183 / 366);
  assert.equal(dateDiffYearsFrac('2025-07-02', '2025-01-01'), -182 / 365);
  assert.equal(dateDiffMonthsFrac('2026-02-01', '2026-02-15'), 14 / 28);
  assert.equal(dateDiffMonthsFrac('2026-01-10', '2026-03-25'), 2 + 15 / 31);
  for (const [a, b] of [['1980-05-17', '2026-10-22'], ['2000-02-29', '2023-02-28'], ['2026-01-31', '2026-04-30']]) {
    assert.equal(Math.trunc(dateDiffYearsFrac(a, b)), dateDiffYears(a, b), `${a} ${b}`);
    assert.equal(Math.trunc(dateDiffMonthsFrac(a, b)), dateDiffMonths(a, b), `${a} ${b}`);
  }
});

test('uma data só: a diferença é até hoje', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 22, 15, 30) });
  assert.equal(dateDiffYears('1980-10-23'), 45);
  assert.equal(dateDiffYears('1980-10-22'), 46);
  assert.equal(dateDiffMonths('2026-08-22'), 2);
  assert.equal(dateDiffDays('2026-10-01'), 21);
  assert.equal(dateDiffDays('2026-10-25'), -3);
  assert.equal(dateDiffYearsFrac('2025-10-22'), 1);
  assert.equal(dateDiffMonthsFrac('2026-10-22'), 0);
});

test('datas: faltando uma, null; aceita dd/mm/aaaa e Date', () => {
  assert.equal(dateDiffYears(null), null);
  assert.equal(dateDiffYears(''), null);
  assert.equal(dateDiffYears('1980-05-17', null), null, 'segunda dependência vazia não vira hoje');
  assert.equal(dateDiffDays(null, '2026-01-01'), null);
  assert.equal(dateDiffMonthsFrac('2026-02-31', '2026-05-01'), null, 'data inválida');
  assert.equal(dateDiffYearsFrac('31/12', '2026-05-01'), null);
  assert.equal(dateDiffYears('17/05/1980', '2026-05-17'), 46);
  assert.equal(dateDiffDays(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1)), 1, 'Date conta pelo dia');
});

test('sum, avg, min e max: basta um número; null sem nenhum', () => {
  assert.equal(sum(1, 2, 3), 6);
  assert.equal(sum(0.1, 0.2), 0.3);
  assert.equal(sum(10, null, undefined, '', 'x', 5), 15);
  assert.equal(sum(null, 0), 0);
  assert.equal(sum(null, null), null);
  assert.equal(sum(), null);
  assert.equal(sum([1, 2], [3, [4]]), 10, 'arrays são abertos');
  assert.equal(avg(10.1, 10.2), 10.15);
  assert.equal(avg(4, null, 8), 6, 'a média é só dos números');
  assert.equal(avg(null), null);
  assert.equal(min(3, null, -2, 7), -2);
  assert.equal(max(3, null, -2, 7), 7);
  assert.equal(min(null, 5), 5);
  assert.equal(max(), null);
  assert.equal(max(Number.NaN, Infinity), null);
});

test('loadJson: provedor de lista que lê o arquivo', async (t) => {
  const pedidos = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    pedidos.push(url);
    return url.includes('nada') ? new Response('', { status: 404 }) : Response.json([{ value: 'SP', label: 'São Paulo' }]);
  });
  assert.deepEqual(await loadJson('./estados.json')({}), [{ value: 'SP', label: 'São Paulo' }]);
  const cidades = loadJson(({ data }) => `./cidades-${data.estado}.json`);
  await cidades({ data: { estado: 'SP' } });
  assert.deepEqual(pedidos, ['./estados.json', './cidades-SP.json']);
  await assert.rejects(loadJson('./nada.json')(), /utils\.loadJson: \.\/nada\.json respondeu 404/);
});

test('forms.js reexporta utils', async () => {
  const runtime = await import('../src/forms.js');
  assert.equal(runtime.utils, utils);
});
