import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generate, parse } from '@formularios/gerador';
import { contexto, inserir, linhaDaLista, posicao, textoDoCampo, TIPOS } from '../src/campo.js';
import { campoNaLinha, camposDaAst, codigoDoCalculo, inserirNoJs, lerFormula, objetoDoJs } from '../src/calculado.js';
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
  assert.deepEqual(t({ tipo: 'lista', rotulo: 'Estado civil', lista: 'estado-civil' }), { texto: 'Estado civil: @estado-civil', erro: null });
  assert.match(t({ tipo: 'lista', rotulo: 'X', lista: 'estado civil' }).erro, /nome da lista/);
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

test('arquivo de dados -> a linha do .form que o usa como lista', () => {
  assert.equal(linhaDaLista('estado-civil.json'), 'Estado civil: @estado-civil');
  assert.equal(linhaDaLista('tipo_sanguineo.json'), 'Tipo sanguineo: @tipo_sanguineo');
  assert.equal(linhaDaLista('estados.json'), 'Estados: @estados');
  for (const f of ['estado-civil.json', 'dias-semana.json', 'paises.json']) {
    assert.deepEqual(parse(`-T\n${linhaDaLista(f)}`, { name: 'x' }).errors, [], f);
  }
});

test('campo calculado: fórmula -> calcField, com os campos como variáveis', () => {
  const caminhos = ['pedido.quantidade', 'pedido.preco', 'pessoais.nascimento', 'residencial.cep', 'comercial.cep', 'nome', 'pedido.total'];
  const calc = (formula, extra = {}) => codigoDoCalculo({ alvo: 'pedido.total', formula, caminhos, ...extra });
  assert.equal(calc('quantidade * preco').codigo.split('\n').slice(1).join('\n'),
    "form.calcField('pedido.total', ['pedido.quantidade', 'pedido.preco'],\n  (quantidade, preco) => (quantidade == null || preco == null ? null : quantidade * preco));",
    'nome curto único vale o caminho completo; vazio vira null; linha longa quebra');
  assert.equal(calc('utils.dateDiffYears(pessoais.nascimento)', { nulo: false, obj: 'f' }).codigo.split('\n').slice(1).join(' '),
    "f.calcField('pedido.total', ['pessoais.nascimento'],   (nascimento) => utils.dateDiffYears(nascimento));");
  assert.equal(codigoDoCalculo({ alvo: 'total', formula: 'a + b', caminhos: ['a', 'b'] }).codigo.split('\n')[1],
    "form.calcField('total', ['a', 'b'], (a, b) => (a == null || b == null ? null : a + b));", 'curta: numa linha só');
  assert.deepEqual(lerFormula('"preco" + preco // preco', caminhos).deps.map((d) => d.path), ['pedido.preco'], 'strings e comentários ficam');
  assert.equal(lerFormula('nome.length + Math.max(1, 2)', caminhos).expressao, 'nome.length + Math.max(1, 2)');
  assert.equal(lerFormula('residencial.cep + comercial.cep', caminhos).expressao, 'residencial_cep + comercial_cep', 'mesmo nome curto: parâmetro com o caminho');
  assert.match(calc('cep').erro, /"cep" é de mais de um campo: use residencial\.cep ou comercial\.cep/);
  assert.match(calc('total + 1').erro, /próprio campo/);
  assert.match(calc('preco *').erro, /JavaScript inválido/);
  assert.match(calc('').erro, /escreva a fórmula/);
  assert.match(calc('42').aviso, /não usa nenhum campo/);
  assert.equal(calc('if (preco > 10) return 1;\nreturn 2;').codigo.split('\n').slice(1).join('\n'),
    "form.calcField('pedido.total', ['pedido.preco'], (preco) => {\n  if (preco == null) return null;\n  if (preco > 10) return 1;\n  return 2;\n});");
});

test('campo calculado: onde o código entra no JS', () => {
  const ast = parse('-T\nNome: ___\n--Pedido{pedido}\nQuantidade: 999   Total: R$ ___', { name: 'x' }).ast;
  assert.deepEqual(camposDaAst(ast).map((c) => c.path), ['nome', 'pedido.quantidade', 'pedido.total']);
  assert.equal(campoNaLinha(ast, 4), 'pedido.total', 'o último campo da linha');
  const pagina = "import { Form } from './forms.js';\n\nconst f = new Form('#x');\nf.action('enviar', () => {});\n\nawait f.ready();\n";
  assert.equal(objetoDoJs(pagina), 'f');
  assert.equal(inserirNoJs(pagina, "f.calcField('a', ['b'], (b) => utils.sum(b));"),
    "import { Form, utils } from './forms.js';\n\nconst f = new Form('#x');\nf.action('enviar', () => {});\n\nf.calcField('a', ['b'], (b) => utils.sum(b));\n\nawait f.ready();\n",
    'antes do ready(), com utils no import');
  const comp = "export default function endereco(p) {\n  p.list('estados', () => []);\n}\n";
  assert.equal(objetoDoJs(comp, { component: true }), 'p');
  assert.equal(inserirNoJs(comp, "p.calcField('a', [], () => utils.sum(1));", { component: true }),
    "import { utils } from '../forms.js';\n\nexport default function endereco(p) {\n  p.list('estados', () => []);\n\n  p.calcField('a', [], () => utils.sum(1));\n}\n",
    'dentro da função, com o import de utils');
  assert.equal(inserirNoJs('// nada\n', 'x;'), '// nada\n\nx;\n', 'sem ready nem função: no fim');
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
