import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { componentsOf, generate, ident, includesOf, parse, renameInclude, slug, stub } from '../src/index.js';

const ler = (arquivo) => readFileSync(new URL(`../../../examples/clientes/${arquivo}`, import.meta.url), 'utf8');
const exemplo = ler('pages/clientes.form');
const components = { pessoa: ler('components/pessoa.form'), endereco: ler('components/endereco.form') };
const opcoes = { name: 'clientes', components };

function campos(ast) {
  const out = {};
  const walk = (children) => {
    for (const n of children) {
      if (n.type === 'group') walk(n.children);
      if (n.type === 'row') n.fields.forEach((f) => { out[f.path] = f; });
      if (n.type === 'options' || n.type === 'longtext') out[n.path] = n;
    }
  };
  walk(ast.children);
  return out;
}

test('o exemplo completo (página com componentes) gera sem erros', () => {
  const r = generate(exemplo, opcoes);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ast.name, 'clientes');
  assert.equal(r.ast.kind, 'page');
  const c = campos(r.ast);
  assert.equal(c['pessoais.nome'].required, true);
  assert.equal(c['pessoais.cpf'].type, 'cpf');
  assert.equal(c['pessoais.salario'].type, 'money');
  assert.equal(c['residencial.logradouro'].cols, 7);
  assert.equal(c['residencial.estado'].type, 'list');
  assert.equal(c['residencial.estado'].cols, 2);
  assert.equal(c['comercial.logradouro'].required, true, 'os obrigatórios vêm do componente');
  assert.equal(c['contato.agencia'].type, 'code');
  assert.equal(c.sexo.type, 'options');
  assert.equal(c.sexo.options[2].value, 'Prefiro não informar');
  assert.equal(c.interesses.multiple, true);
  assert.equal(c.obs.rows, 3);
  assert.equal(c.aceite.type, 'check');
  assert.deepEqual(componentsOf(r.ast), ['pessoa', 'endereco']);
});

test('HTML: data-mask, nomes com caminho, componente marcado, barra de botões, sem classes fm-*', () => {
  const { html } = generate(exemplo, opcoes);
  assert.match(html, /name="contato\.agencia" data-mask="0000"/);
  assert.match(html, /id="residencial-cep" name="residencial\.cep" data-mask="99999-999"/);
  assert.match(html, /<!-- Componente endereco: Endereço Comercial -->\n\s*<fieldset class="mb-4" name="comercial" data-component="endereco">/);
  assert.match(html, /data-list="estados"/);
  assert.match(html, /<div class="d-flex gap-2 mt-2" data-buttons>\n\s*<button type="button" class="btn btn-primary" data-action="enviar">Enviar<\/button>\n\s*<\/div>\n<\/form>/);
  assert.doesNotMatch(html, /class="[^"]*\bfm-/);
  assert.doesNotMatch(generate(exemplo, { ...opcoes, buttons: false }).html, /data-buttons|<button/);
  assert.equal(generate(exemplo, opcoes).html, html, 'saída determinística');
});

test('HTML: fragmento por padrão, página completa com page', () => {
  const fragmento = generate(exemplo, opcoes).html;
  assert.match(fragmento, /^<form class="bg-body border rounded-3 p-4" id="clientes" novalidate>\n/);
  assert.match(fragmento, /<\/form>\n$/);
  assert.doesNotMatch(fragmento, /<html|<head|<script/);

  const pagina = generate(exemplo, { ...opcoes, page: true }).html;
  assert.match(pagina, /^<!DOCTYPE html>\n<html lang="pt-BR">/);
  assert.match(pagina, /<script type="module" src="clientes.js"><\/script>/, 'o JS tem o nome do formulário');
  assert.ok(pagina.includes(fragmento.trimEnd().split('\n').map((l) => (l ? `    ${l}` : l)).join('\n')),
    'a página embrulha o mesmo fragmento');
  assert.doesNotMatch(generate(exemplo, { ...opcoes, page: true, script: false }).html, /<script/);
  assert.equal(parse('-Cadastro de Clientes').ast.name, 'cadastro_de_clientes', 'sem arquivo: o slug do título');
});

test('nomes: slug, {nome}, Nº e repetidos', () => {
  assert.equal(slug('Endereço Residencial'), 'endereco_residencial');
  assert.equal(slug('Nº'), 'numero');
  const r = parse('-Teste\nNome: ____ Nome: ____\nEndereço{logradouro}*: ____');
  assert.deepEqual(r.errors, []);
  const c = campos(r.ast);
  assert.ok(c.nome && c.nome_2 && c.logradouro.required);
  assert.equal(r.warnings.length, 1);
});

test('erros com linha e coluna', () => {
  const quatro = parse('-T\n--A\n---B\n----C\nX: ____');
  assert.equal(quatro.errors[0].line, 4);
  const pulo = parse('-T\n---B\nX: ____');
  assert.match(pulo.errors[0].message, /nível pulado/);
  const spec = parse('-T\nCEP: 99x99');
  assert.equal(spec.errors[0].line, 2);
  assert.equal(spec.errors[0].column, 6);
  assert.match(parse('Nome: ___').errors[0].message, /título/);
  assert.match(parse('-T\nCódigo: 0099').errors[0].message, /mistura 0 e 9/);
});

test('o .form não tem botões nem nome no título; o componente não tem título', () => {
  const r = parse('-Cadastro{cad}\nNome: ___\n[[ Enviar ]] [[ Cancelar ]]');
  assert.deepEqual(r.errors.map((e) => [e.line, e.message.split(':')[0]]), [
    [1, 'o nome do formulário é o do arquivo; tire o "{cad}" do título'],
    [3, 'botões não ficam no .form'],
  ]);
  const comp = parse('-Endereço\nRua: ___', { component: true });
  assert.match(comp.errors[0].message, /componente não tem título: o título é o da seção que o inclui/);
  assert.match(parse('\n', { component: true }).errors[0].message, /componente vazio/);
  const ok = parse('Rua: ___\n--Tipo\n(R) Residencial', { name: 'endereco', component: true });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.ast.title, null);
  assert.equal(ok.ast.name, 'endereco');
  assert.doesNotMatch(generate('Rua: ___', { name: 'endereco', component: true }).html, /<h1/);
});

test('máscaras com espaço e rótulos depois delas', () => {
  const r = parse('-T\nTel: (99) 99999-9999 Apto: 999   Hora: hh:mm Fim: ____');
  assert.deepEqual(r.errors, []);
  const c = campos(r.ast);
  assert.equal(c.tel.mask, '(99) 99999-9999');
  assert.equal(c.apto.type, 'integer');
  assert.equal(c.hora.type, 'time');
  assert.equal(c.fim.type, 'text');
});

test('seções-campo não criam nível; o que vem depois volta ao pai', () => {
  const r = parse('-T\n--G{g}\n---Sexo\n(M) Masc\n(F) Fem\nIdade: 999\n--Obs\n____\n[ ] Aceito{ok}*');
  assert.deepEqual(r.errors, []);
  const c = campos(r.ast);
  assert.ok(c['g.sexo']);
  assert.ok(c['g.idade']);
  assert.ok(c.obs);
  assert.equal(c.ok.required, true);
});

test('inclusão: sozinha numa seção, que dá título e nome; fechada como a de opções; níveis relativos', () => {
  const comps = {
    endereco: 'Rua*: ____   CEP: 99999-999\n--Tipo\n(R) Residencial\n(C) Comercial',
    pessoa: 'Nome: ____\n--Endereço\n+endereco\nIdade: 999',
  };
  const r = parse('-Cadastro\n--Titular{titular}\n+pessoa\nX: ____\n--Outros\n---Entrega\n+endereco\nY: ____', { components: comps });
  assert.deepEqual(r.errors, []);
  const c = campos(r.ast);
  assert.deepEqual(Object.keys(c), [
    'titular.nome', 'titular.endereco.rua', 'titular.endereco.cep', 'titular.endereco.tipo', 'titular.idade',
    'x', 'outros.entrega.rua', 'outros.entrega.cep', 'outros.entrega.tipo', 'outros.y',
  ]);
  const [titular] = r.ast.children;
  assert.deepEqual([titular.title, titular.level, titular.component], ['Titular', 2, 'pessoa']);
  const endereco = titular.children.find((n) => n.component);
  assert.deepEqual([endereco.title, endereco.level, endereco.path], ['Endereço', 3, 'titular.endereco']);
  assert.equal(endereco.children[0].fields[0].path, 'titular.endereco.rua', 'os campos entram direto na seção');
  assert.equal(c['titular.endereco.tipo'].level, 4, 'o --Tipo do componente desce dois níveis');
  assert.equal(c['outros.entrega.rua'].id, 'outros-entrega-rua');
  assert.equal(c['outros.entrega.tipo'].level, 4);
  assert.ok(!('includeSource' in titular));
});

test('inclusão: fora de seção, com mais linhas na seção, componente inexistente, circular ou com erro', () => {
  const comps = { a: '--B\n+b', b: '--A\n+a', ruim: 'CEP: 99x99', end: 'Rua: ___' };
  const err = (src, opts = {}) => parse(src, { components: comps, ...opts }).errors.map((e) => `${e.line}: ${e.message}`);
  assert.match(err('-T\n+end')[0], /^2: o componente fica sozinho numa seção/);
  assert.match(err('-T\n--A\nX: ___\n+end')[0], /^4: o componente fica sozinho numa seção/);
  assert.match(err('-T\n--A\n+end\n---B\nY: ___')[0], /^4: a seção "A" é de um componente: não recebe subseções/);
  assert.match(err('-T\n--A\n+Casa{casa}: end')[0], /a inclusão é só "\+componente"/);
  assert.match(err('-T\n--A\n+um dois')[0], /nome de componente inválido/);
  assert.match(err('-T\n--A\n+nada')[0], /componente "nada" não existe/);
  assert.match(err('--B\n+b', { name: 'a', component: true })[0], /inclusão circular: a → b → a/);
  const ruim = parse('-T\nX: ___\n--R\n+ruim', { components: comps }).errors[0];
  assert.equal(ruim.line, 4, 'na linha do +');
  assert.match(ruim.message, /componente "ruim" com erro — ruim\.form:1:6: especificador não reconhecido/);
  assert.deepEqual(ruim.cause, { component: 'ruim', line: 1, column: 6 });
  const dois = parse('-T\n--Casa{e}\n+end\n--Trabalho{e}\n+end', { components: comps });
  assert.deepEqual(Object.keys(campos(dois.ast)), ['e.rua', 'e_2.rua']);
  assert.equal(dois.warnings.length, 1);
  assert.match(parse('-T\n--Casa*\n+end', { components: comps }).warnings[0].message, /valem os obrigatórios do componente/);
});

test('renomear componente atualiza as inclusões', () => {
  const src = '-T\n--A\n+endereco\n--B\n  +endereco  \n--C\n+enderecos\nX: ___\n';
  assert.deepEqual(includesOf(src), ['endereco', 'enderecos']);
  assert.equal(renameInclude(src, 'endereco', 'end'), '-T\n--A\n+end\n--B\n  +end  \n--C\n+enderecos\nX: ___\n');
});

test('JS inicial da página: os componentes (chamados por ready) num comentário, listas, ação enviar', () => {
  const { ast } = parse(exemplo, opcoes);
  const js = stub(ast, { data: ['estados.json'] });
  assert.match(js, /^\/\/ clientes\.js — integração do formulário "Cadastro de Clientes"\./);
  assert.match(js, /import \{ Form, utils \} from '\.\/forms\.js';\n\nconst form = new Form\('#clientes'\);/);
  assert.match(js, /\/\/ Componentes: form\.ready\(\) carrega o JS de cada um e o chama com a sua parte\.\n\/\/ {3}components\/pessoa\.js: pessoais\n\/\/ {3}components\/endereco\.js: residencial, comercial\n/);
  assert.doesNotMatch(js, /import pessoa|scope\(/);
  assert.doesNotMatch(js, /form\.list/, 'a lista de estados é do componente');
  assert.match(js, /form\.action\('enviar'/);
  assert.match(js, /await form\.ready\(\);/);
});

test('JS inicial do componente: função que recebe a parte; listas e inclusões dele', () => {
  const comps = { ...components, 'meu-end': 'A: ___' };
  const end = parse(components.endereco, { name: 'endereco', component: true }).ast;
  assert.equal(end.kind, 'component');
  assert.match(stub(end), /parte\.list\('estados', async \(\{ data \}\) => \[\]\);/);
  const js = stub(end, { data: ['estados.json'] });
  assert.match(js, /^\/\/ endereco\.js — componente endereco:/);
  assert.match(js, /import \{ utils \} from '\.\.\/forms\.js';\n\nexport default function endereco\(parte\) \{\n {2}\/\/ Listas[^\n]*\n {2}parte\.list\('estados', utils\.loadJson\('\.\/estados\.json'\)\);\n\}/);
  assert.doesNotMatch(js.replace("import { utils } from '../forms.js';", ''), /import|action|ready/);
  const pessoa = parse('Nome: ___\n--Casa{casa}\n+endereco\n--Outro\n+meu-end', { name: 'pessoa', components: comps, component: true }).ast;
  assert.match(stub(pessoa), /\n\nexport default function pessoa\(parte\) \{\n {2}\/\/ Componentes: [^\n]*\n {2}\/\/ {3}components\/endereco\.js: casa\n {2}\/\/ {3}components\/meu-end\.js: outro\n\}/);
  assert.deepEqual(stub(pessoa).match(/^import .*$/gm), ["import { utils } from '../forms.js';"], 'o JS dos componentes de dentro não é importado');
  assert.deepEqual(['meu-end', '2x', 'form', 'class'].map(ident), ['meuEnd', '_2x', 'form_', 'class_']);
});

test('lista: sem {N} divide a linha pelo peso; com {N} é fixa', () => {
  const cols = (src) => Object.values(campos(parse(`-T\n${src}`).ast)).map((f) => f.cols);
  assert.deepEqual(cols('Estado: @estados'), [12]);
  assert.deepEqual(cols('Estado: @estados{3}'), [3]);
  assert.deepEqual(cols('Nome: ____________________   Estado: @estados'), [9, 3]);
  assert.deepEqual(cols('Nome: ____________________   Estado: @estados{2}'), [10, 2]);
});

test('lista: o nome aceita hífen, como os arquivos (@estado-civil)', () => {
  const lista = (src) => {
    const r = parse(`-T\n${src}`);
    return r.errors.length ? r.errors[0].message : Object.values(campos(r.ast)).map((f) => [f.list, f.cols]);
  };
  assert.deepEqual(lista('Estado civil: @estado-civil'), [['estado-civil', 12]]);
  assert.deepEqual(lista('Estado civil: @estado-civil{4}   Nome: ___'), [['estado-civil', 4], [undefined, 8]]);
  assert.deepEqual(lista('Tipo: @tipo_sanguineo-2'), [['tipo_sanguineo-2', 12]]);
  assert.match(lista('Estado civil: @estado-'), /especificador não reconhecido/, 'sem hífen no fim');
  assert.match(lista('Estado civil: @-x'), /especificador não reconhecido/);
  assert.match(generate('-T\nEstado civil: @estado-civil').html, /data-list="estado-civil"/);
});

test('largura {N} em qualquer especificador: fixa, fora da divisão por peso', () => {
  const r = (src) => parse(`-T\n${src}`);
  const cols = (src) => Object.values(campos(r(src).ast)).map((f) => [f.type, f.cols]);
  assert.deepEqual(cols('Nome: ______{6}   CPF: 999.999.999-99'), [['text', 6], ['cpf', 6]]);
  assert.deepEqual(cols('Nome: ________________   CPF: 999.999.999-99{3}'), [['text', 9], ['cpf', 3]]);
  assert.deepEqual(cols('Tel: (99) 99999-9999{4}   Nome: ____'), [['phone', 4], ['text', 8]]);
  assert.deepEqual(cols('Data: dd/mm/aaaa{2} Hora: hh:mm{2} Salário: R$ ____{3} E-mail: email___{5}'),
    [['date', 2], ['time', 2], ['money', 3], ['email', 5]]);
  assert.deepEqual(cols('Placa: AAA-9999{3}   Código: 0000{2}   Idade: 999{1}'), [['mask', 3], ['code', 2], ['integer', 1]]);
  assert.equal(campos(r('CPF: 999.999.999-99{4}').ast).cpf.mask, '999.999.999-99', 'o {N} não entra na máscara');
  assert.match(r('X: 999{0}').errors[0].message, /largura inválida \{0\}: use de 1 a 12 colunas/);
  assert.match(r('X: ____{13}').errors[0].message, /largura inválida \{13\}/);
  assert.match(r('X: ____{a}').errors[0].message, /especificador não reconhecido "____\{a\}"/);
  assert.match(r('X: ____{6}x').errors[0].message, /especificador não reconhecido/);
  assert.match(r('A: ___{8}   B: ___{8}').errors[0].message, /larguras fixas somam 16 colunas/);
  assert.match(generate('-T\nNome: ____{6}').html, /<div class="col-12 col-md-6">/);
});
