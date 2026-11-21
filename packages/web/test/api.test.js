import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@formularios/gerador';
import { completeForm, completeJs, completeJson, outline } from '../src/api.js';

const ler = (arquivo) => readFileSync(new URL(`../../../examples/clientes/${arquivo}`, import.meta.url), 'utf8');
const components = { pessoa: ler('components/pessoa.form'), endereco: ler('components/endereco.form') };
const info = outline(parse(ler('pages/clientes.form'), { name: 'clientes', components }).ast, ['estados.json'], ['endereco', 'pessoa']);
const infoEndereco = outline(parse(components.endereco, { name: 'endereco', component: true }).ast, ['estados.json']);

// Completa no ponto marcado com | e devolve { typed, labels }.
function at(source, complete = completeJs, explicit = false, i = info) {
  const pos = source.indexOf('|');
  const doc = source.replace('|', '');
  const r = complete(doc, pos, i, explicit);
  return r && { typed: doc.slice(r.from, pos), labels: r.options.map((o) => o.label), options: r.options };
}

test('outline: campos, listas, inclusões, máscaras e seções do .form', () => {
  assert.equal(info.name, 'clientes');
  assert.equal(info.kind, 'page');
  assert.deepEqual(info.lists, ['estados']);
  assert.deepEqual(info.actions, ['enviar']);
  assert.deepEqual(info.parts, [
    { path: 'pessoais', component: 'pessoa' }, { path: 'residencial', component: 'endereco' }, { path: 'comercial', component: 'endereco' },
  ]);
  assert.ok(info.fields.some((f) => f.path === 'residencial.cep' && f.type === 'cep'));
  assert.ok(info.fields.some((f) => f.path === 'sexo' && f.type === 'radio'));
  assert.ok(info.masks.includes('dd/mm/aaaa'));
  assert.ok(info.sections.includes('contato'));
  assert.equal(infoEndereco.kind, 'component');
  assert.ok(infoEndereco.fields.some((f) => f.path === 'cep'), 'no componente, nomes relativos');
});

test('JS: nomes do .form dentro das strings certas', () => {
  assert.deepEqual(at("form.list('est|").labels, ['estados']);
  assert.equal(at("form.list('est|").typed, 'est');
  assert.deepEqual(at("form.action(\"|").labels, ['enviar']);
  assert.deepEqual(at("form.scope('|").labels, ['pessoais', 'residencial', 'comercial']);
  assert.ok(at("form.field('|").labels.includes('pessoais.cpf'));
  assert.ok(at("form.validator({ name: 'pes|").labels.includes('pessoais.nascimento'));
  assert.ok(at("form.calcField('pessoais.idade', ['pessoais.nascimento', '|").labels.includes('pessoais.salario'));
  assert.deepEqual(at("form.reloadList({ name: '|").labels, ['residencial.estado', 'comercial.estado']);
  assert.ok(at("form.validator({ selector: '|").labels.includes('[data-mask="R$"]'));
  assert.deepEqual(at("const r = await fetch('|").labels, ['./estados.json']);
  assert.deepEqual(at("form.list('estados', utils.loadJson('|").labels, ['./estados.json']);
  assert.deepEqual(at("new Form('|").labels, ['#clientes']);
  assert.ok(at("form.on('|").labels.includes('change'));
  assert.deepEqual(at("parte.field('ce|", completeJs, false, infoEndereco).labels.filter((l) => l.startsWith('ce')), ['cep']);
});

test('JS: string fechada não é contexto de string', () => {
  const r = at("form.list('estados', |", completeJs, true);
  assert.ok(r.labels.includes("form.action('enviar')"), 'volta aos snippets de instrução');
});

test('JS: membros de Form, da parte e de Field', () => {
  assert.ok(at('form.va|').labels.includes('validate'));
  assert.ok(at('form.sc|').labels.includes('scope'));
  assert.ok(at('const f = new Form("#x");\nf.|').labels.includes('calcField'));
  const parte = at('export default function endereco(p) {\n  p.|', completeJs, false, infoEndereco).labels;
  assert.ok(parte.includes('validator') && parte.includes('getData') && parte.includes('prefix'));
  assert.ok(!parte.includes('action') && !parte.includes('ready'), 'a parte não tem ações');
  assert.ok(at('const casa = form.scope("casa");\ncasa.|').labels.includes('setData'));
  assert.ok(at("form.field('residencial.cep').|").labels.includes('value'));
  assert.ok(at("const cep = form.field('residencial.cep');\ncep.vi|").labels.includes('visible'));
  assert.ok(at('validator(x, (value, { field }) => field.|').labels.includes('error'));
  const utils = at("parte.calcField('idade', ['nascimento'], utils.da|");
  assert.equal(utils.typed, 'da');
  assert.ok(['dateDiffYears', 'dateDiffYearsFrac', 'dateDiffMonths', 'dateDiffMonthsFrac', 'dateDiffDays'].every((l) => utils.labels.includes(l)));
  assert.ok(['loadJson', 'sum', 'avg', 'min', 'max'].every((l) => utils.labels.includes(l)));
  assert.equal(at('console.lo|'), null, 'objetos desconhecidos ficam com o JS padrão');
});

test('JS: snippets de instrução da página e do componente', () => {
  const r = at('form|');
  assert.ok(r.labels.includes("form.list('estados')"));
  const lista = r.options.find((o) => o.label === "form.list('estados')");
  assert.equal(lista.snippet, "form.list('estados', utils.loadJson('./estados.json'));\n");
  assert.ok(r.labels.includes("form.action('enviar')"));
  assert.ok(r.labels.includes('import { Form, utils }'));
  assert.ok(r.labels.includes('form.calcField (utils)'));
  assert.ok(!r.labels.some((l) => l.startsWith('import endereco')), 'o JS dos componentes é chamado por form.ready()');
  const comp = at('par|', completeJs, false, infoEndereco);
  assert.ok(comp.labels.includes('export default function'));
  assert.ok(comp.labels.includes('import { utils }'));
  assert.ok(comp.labels.includes("parte.list('estados')"));
  assert.ok(!comp.labels.some((l) => l.includes('action') || l.includes('new Form')));
  assert.equal(at('\n|'), null, 'sem digitar nada, só com Ctrl+Espaço');
  assert.ok(at('\n|', completeJs, true).labels.length);
  assert.ok(at("form.messages({ required: 'x', |", completeJs, true).labels.includes('cpf'));
});

test('.form: especificadores, componentes depois de "+" e linhas com Ctrl+Espaço', () => {
  const r = at('-T\nNascimento: dd|', completeForm);
  assert.equal(r.typed, 'dd');
  assert.ok(r.labels.includes('dd/mm/aaaa'));
  assert.ok(r.labels.includes('@estados'));
  const comDados = { ...info, data: ['estados.json', 'estado-civil.json'] };
  const listas = at('-T\nEstado civil: @es|', completeForm, false, comDados).options.filter((o) => o.label.startsWith('@es'));
  assert.deepEqual(listas.map((o) => [o.label, o.detail]), [['@estados', 'lista'], ['@estado-civil', 'lista (estado-civil.json)']],
    'os arquivos de dados do projeto viram sugestões de @lista');
  assert.equal(at('-T\nHora: hh:|', completeForm), null, 'o ":" de hh:mm não abre outra sugestão');
  assert.deepEqual(at('-T\n+end|', completeForm).labels, ['endereco', 'pessoa']);
  assert.equal(at('-T\n+end|', completeForm).typed, 'end');
  const linhas = at('-T\n|', completeForm, true).labels;
  assert.ok(linhas.includes('--Seção{nome} +componente') && !linhas.some((l) => l.includes('[[')));
  assert.ok(completeJson('', 0, null, true).options.length);
});
