import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generate, parse } from '@formularios/gerador';
import { contexto, inserir, posicao, textoDoCampo, TIPOS } from '../src/campo.js';
import { comoOpcoes, rotulos } from '../src/colecao.js';
import { estrutura } from '../src/estrutura.js';

const COLECAO = new URL('../src/colecao/', import.meta.url);
const EXEMPLO = new URL('../../../examples/clientes/', import.meta.url);
const ler = (url) => readFileSync(url, 'utf8');

test('assistente: o texto do .form de cada tipo, que o gerador aceita', () => {
  const t = (o) => textoDoCampo(o);
  assert.deepEqual(t({ tipo: 'texto', rotulo: 'Nome completo', obrigatorio: true, tamanho: 5 }), { texto: 'Nome completo*: _____', erro: null });
  assert.equal(t({ tipo: 'email', rotulo: 'E-mail', nome: 'email', tamanho: 10 }).texto, 'E-mail{email}: email_____');
  assert.equal(t({ tipo: 'email', rotulo: 'E-mail', nome: 'e_mail' }).texto, 'E-mail: email_______________', 'nome igual ao padrão: sem chaves');
  assert.equal(t({ tipo: 'decimal', rotulo: 'Peso', inteiros: 3, decimais: 1, largura: 2 }).texto, 'Peso: 999.9{2}');
  assert.equal(t({ tipo: 'moeda', rotulo: 'Valor', tamanho: 4 }).texto, 'Valor: R$ ____');
  assert.equal(t({ tipo: 'codigo', rotulo: 'Agência', digitos: 4 }).texto, 'Agência: 0000');
  assert.equal(t({ tipo: 'celular', rotulo: 'Celular', largura: 4 }).texto, 'Celular: (99) 99999-9999{4}');
  assert.equal(t({ tipo: 'lista', rotulo: 'Estado', lista: 'estados' }).texto, 'Estado: @estados');
  assert.equal(t({ tipo: 'lista', rotulo: 'País de origem' }).texto, 'País de origem: @pais_de_origem', 'sem nome, a lista é o do rótulo');
  assert.equal(t({ tipo: 'caixa', rotulo: 'Aceito os termos', nome: 'aceite', obrigatorio: true }).texto, '[ ] Aceito os termos{aceite}*');
  assert.equal(t({ tipo: 'radio', rotulo: 'Sexo', obrigatorio: true, opcoes: 'M = Masculino\n\nPrefiro não informar', nivel: 2 }).texto,
    '--Sexo*\n(M) Masculino\n( ) Prefiro não informar');
  assert.equal(t({ tipo: 'multipla', rotulo: 'Interesses', opcoes: 'ESP=Esportes', nivel: 3 }).texto, '---Interesses\n[ESP] Esportes');
  assert.equal(t({ tipo: 'longo', rotulo: 'Observações', nome: 'obs', linhas: 2 }).texto.split('\n').length, 3);
  for (const tp of TIPOS) {
    const { texto, erro } = t({ tipo: tp.id, rotulo: 'Campo', mascara: 'AAA-9999', opcoes: 'a = A' });
    assert.equal(erro, null, tp.id);
    assert.deepEqual(parse(`-T\n${texto}`, { name: 'x' }).errors, [], tp.id);
  }
});

test('assistente: erros antes de inserir', () => {
  const erro = (o) => textoDoCampo(o).erro;
  assert.match(erro({ tipo: 'texto', rotulo: '' }), /rótulo/);
  assert.match(erro({ tipo: 'texto', rotulo: 'Hora: x' }), /não pode ter/);
  assert.match(erro({ tipo: 'cpf', rotulo: 'CPF', largura: 13 }), /1 a 12/);
  assert.match(erro({ tipo: 'mascara', rotulo: 'X', mascara: '99x' }), /especificador não reconhecido/);
  assert.match(erro({ tipo: 'radio', rotulo: 'Sexo', opcoes: '  ' }), /opções/);
  assert.match(erro({ tipo: 'radio', rotulo: 'Sexo', opcoes: 'a) = A' }), /não pode ter "\)"/);
  assert.match(erro({ tipo: 'inteiro', rotulo: 'N', digitos: 40 }), /dígitos: de 1 a 15/);
  assert.match(erro({ tipo: 'texto', rotulo: 'Nome', nome: 'meu nome' }), /nome no JSON/);
});

test('assistente: onde o campo entra e em que nível', () => {
  const f = '-T\nNome: ___\n--Sexo*\n(M) M\n(F) F\n--End{e}\nRua: ___\n\n---Sub\nX: ___';
  assert.deepEqual(posicao(f, 2), { depois: 2, troca: false });
  assert.deepEqual(posicao(f, 3), { depois: 5, troca: false }, 'no título das opções: entra depois delas');
  assert.deepEqual(posicao(f, 4), { depois: 5, troca: false });
  assert.deepEqual(posicao(f, 8), { depois: 7, troca: true }, 'linha vazia: o campo fica nela');
  assert.deepEqual(contexto(f, 2), { nivel: 2, mesmaLinha: true });
  assert.deepEqual(contexto(f, 7), { nivel: 3, mesmaLinha: true }, 'dentro de --End, a seção nova é ---');
  assert.equal(contexto(f, 10).nivel, 3, 'no máximo 3 níveis');
  assert.equal(contexto(f, 3).mesmaLinha, false);
  assert.equal(inserir(f, 3, 'Novo: ___').fonte.split('\n')[5], 'Novo: ___');
  assert.deepEqual(inserir(f, 8, 'A: _\nB: _'), { fonte: f.replace('Rua: ___\n\n', 'Rua: ___\nA: _\nB: _\n'), linha: 8 });
  assert.equal(inserir(f, 2, 'Novo: ___', { mesmaLinha: true }).fonte.split('\n')[1], 'Nome: ___   Novo: ___');
  const comp = 'Rua: ___\n--Casa{casa}\n+endereco\nCEP: 99999-999';
  assert.deepEqual(contexto(comp, 4, { component: true }), { nivel: 2, mesmaLinha: true }, 'componente: a inclusão é fechada');
  assert.deepEqual(posicao(comp, 2), { depois: 3, troca: false });
});

test('estrutura: caminho, tipo, valor no JSON, nulo e exemplo', () => {
  const comps = { pessoa: ler(new URL('components/pessoa.form', EXEMPLO)), endereco: ler(new URL('components/endereco.form', EXEMPLO)) };
  const { ast } = generate(ler(new URL('pages/clientes.form', EXEMPLO)), { name: 'clientes', components: comps });
  const { linhas, exemplo } = estrutura(ast, { dados: { 'estados.json': ler(new URL('estados.json', EXEMPLO)) } });
  const campo = (caminho) => linhas.find((l) => l.caminho === caminho && l.tipo === 'campo');
  assert.deepEqual(linhas[0], { tipo: 'secao', caminho: 'pessoais', rotulo: 'Dados Pessoais', componente: 'pessoa' });
  assert.deepEqual(
    [campo('pessoais.nascimento').tipoCampo, campo('pessoais.nascimento').json, campo('pessoais.nascimento').nulo],
    ['Data', 'string aaaa-mm-dd', false],
  );
  assert.equal(campo('pessoais.salario').json, 'number');
  assert.equal(campo('pessoais.salario').nulo, true);
  assert.equal(campo('residencial.estado').detalhes, '@estados — estados.json, 27 item(ns)');
  assert.equal(campo('residencial.estado').componente, 'endereco');
  assert.equal(campo('interesses').json, 'string[]');
  assert.equal(campo('aceite').nulo, false, 'caixa de marcação: true/false, nunca null');
  assert.equal(campo('contato.agencia').detalhes, '4 dígito(s), com zeros à esquerda');
  assert.deepEqual(exemplo.contato, { agencia: '0001', ramal: 1234, horario: '14:30' });
  assert.equal(exemplo.residencial.estado, 'AC');
  assert.equal(exemplo.sexo, 'M');
  assert.deepEqual(exemplo.interesses, ['ESP']);
  assert.equal(linhas.filter((l) => l.tipo === 'campo').length, 28);
});

test('coleção: o índice cita todos os arquivos, e cada um é uma lista válida', () => {
  const indice = JSON.parse(ler(new URL('index.json', COLECAO)));
  const arquivos = readdirSync(COLECAO).filter((f) => f !== 'index.json').sort();
  assert.deepEqual(indice.map((i) => i.file).sort(), arquivos);
  for (const item of indice) {
    assert.ok(item.title && item.description, item.file);
    const dados = JSON.parse(ler(new URL(item.file, COLECAO)));
    assert.ok(Array.isArray(dados) && dados.length, item.file);
    const valores = dados.map((x) => (typeof x === 'string' ? x : x.value));
    assert.ok(dados.every((x) => typeof x === 'string' || (typeof x.value === 'string' && typeof x.label === 'string')), item.file);
    assert.equal(new Set(valores).size, valores.length, `${item.file}: valores repetidos`);
  }
  const estados = ler(new URL('estados.json', COLECAO));
  assert.equal(estados, ler(new URL('estados.json', EXEMPLO)), 'a mesma do exemplo');
  assert.equal(rotulos(estados).length, 27);
  assert.equal(JSON.parse(ler(new URL('paises.json', COLECAO))).length, 249);
  assert.equal(comoOpcoes('[{ "value": "S", "label": "Sim" }, "Talvez"]'), 'S = Sim\nTalvez');
});
