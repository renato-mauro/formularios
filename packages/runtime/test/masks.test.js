import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  finishInput, formatInput, fromValue, isCnpj, isCpf, isDate, isTime, parseMask, toValue, validateText,
} from '../src/masks.js';

test('a máscara define o tipo', () => {
  const tipo = (m) => parseMask(m)?.type ?? null;
  assert.equal(tipo('R$'), 'money');
  assert.equal(tipo('dd/mm/aaaa'), 'date');
  assert.equal(tipo('hh:mm'), 'time');
  assert.equal(tipo('999'), 'integer');
  assert.equal(tipo('0000'), 'code');
  assert.equal(tipo('99999.99'), 'decimal');
  assert.equal(tipo('999.999.999-99'), 'cpf');
  assert.equal(tipo('000.000.000-00'), 'cpf');
  assert.equal(tipo('99.999.999/9999-99'), 'cnpj');
  assert.equal(tipo('99999-999'), 'cep');
  assert.equal(tipo('00000-000'), 'cep');
  assert.equal(tipo('(99) 99999-9999'), 'phone');
  assert.equal(tipo('(99) 9999-9999'), 'phone');
  assert.equal(tipo('AAA-9999'), 'mask');
  assert.equal(tipo('0099'), null);
  assert.equal(tipo('xyz'), null);
});

test('CPF', () => {
  assert.ok(isCpf('529.982.247-25'));
  assert.ok(!isCpf('111.111.111-11'));
  assert.ok(!isCpf('123.456.789-00'));
});

test('CNPJ numérico e alfanumérico', () => {
  assert.ok(isCnpj('11.222.333/0001-81'));
  assert.ok(!isCnpj('11.222.333/0001-82'));
  assert.ok(isCnpj('12.ABC.345/01DE-35'));
  assert.ok(!isCnpj('12.ABC.345/01DE-36'));
  assert.equal(formatInput(parseMask('99.999.999/9999-99'), '12abc34501de35'), '12.ABC.345/01DE-35');
});

test('data e hora', () => {
  assert.ok(isDate('29/02/2024'));
  assert.ok(!isDate('29/02/2023'));
  assert.ok(!isDate('31/04/2025'));
  assert.ok(!isTime('24:00'));
  assert.ok(isTime('23:59'));
  const data = parseMask('dd/mm/aaaa');
  assert.equal(formatInput(data, '17051980'), '17/05/1980');
  assert.equal(toValue(data, '17/05/1980'), '1980-05-17');
  assert.equal(fromValue(data, '1980-05-17'), '17/05/1980');
});

test('moeda: digitação da direita para a esquerda, negativos', () => {
  const m = parseMask('R$');
  assert.equal(formatInput(m, '123456'), '1.234,56');
  assert.equal(toValue(m, '1.234,56'), 1234.56);
  assert.equal(formatInput(m, '-5000'), '-50,00');
  assert.equal(toValue(m, '-50,00'), -50);
  assert.equal(fromValue(m, 1234567.8), '1.234.567,80');
});

test('decimal com casas fixas e sem milhar', () => {
  const d = parseMask('999.99');
  assert.equal(formatInput(d, '12,5'), '12,5');
  assert.equal(finishInput(d, '12,5'), '12,50');
  assert.equal(toValue(d, '12,50'), 12.5);
  assert.equal(fromValue(d, 1234.5), '1234,50');
  assert.equal(formatInput(d, '-7.25'), '-7,25');
});

test('inteiro aceita negativo e limita dígitos', () => {
  const i = parseMask('999');
  assert.equal(formatInput(i, '-12'), '-12');
  assert.equal(validateText(i, '-12'), null);
  assert.deepEqual(validateText(i, '1234'), { key: 'digits', params: { digits: 3 } });
  assert.equal(validateText(i, '-5', { min: 0 }).key, 'min');
  assert.equal(validateText(i, '500', { max: 100 }).key, 'max');
  assert.equal(toValue(i, '-12'), -12);
});

test('código com zeros à esquerda é texto', () => {
  const c = parseMask('0000');
  assert.equal(finishInput(c, '12'), '0012');
  assert.equal(toValue(c, '12'), '0012');
  assert.equal(fromValue(c, '12'), '0012');
});

test('máscaras posicionais com e sem literais', () => {
  const cep = parseMask('99999-999');
  assert.equal(formatInput(cep, '01310100'), '01310-100');
  assert.equal(formatInput(cep, '01310-'), '01310');
  assert.equal(toValue(cep, '01310-100'), '01310-100');
  assert.equal(toValue(cep, '01310-100', false), '01310100');
  assert.equal(fromValue(cep, '01310100'), '01310-100');
  const fone = parseMask('(99) 99999-9999');
  assert.equal(formatInput(fone, '11987654321'), '(11) 98765-4321');
  assert.deepEqual(validateText(fone, '(11) 9876'), { key: 'incomplete', params: { mask: '(99) 99999-9999' } });
});
