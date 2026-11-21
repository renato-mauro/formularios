// Janela do assistente de campo (o <dialog id="campo"> do index.html): o usuário
// escolhe o tipo, o rótulo, o nome e os parâmetros, vê a linha do .form que vai
// entrar e insere. A regra fica em campo.js; aqui só a janela.
import { campoNaLinha, camposDaAst, codigoDoCalculo, objetoDoJs } from './calculado.js';
import { carregarColecao, comoOpcoes } from './colecao.js';
import { contexto, inserir, nomePadrao, posicao, textoDoCampo, TIPOS, tipo } from './campo.js';

let ligada = null; // os elementos da janela, depois da primeira vez
let sessao = null; // o que vale para a janela aberta agora

// fonte: texto do .form; linha: a do cursor; component: o arquivo é um componente;
// dados: nomes dos arquivos de dados do projeto ('estados.json'...); script: o JS
// do formulário (o escrito ou o inicial); analisar: fonte -> AST, com os
// componentes do projeto (para os campos que uma fórmula pode usar).
// -> Promise de null (cancelou) ou { fonte, de, ate, importar, calculo }: o novo
// texto, as linhas do campo, o arquivo a criar { file, content } se a lista veio
// da coleção, e o código do calcField, se o campo é calculado.
export async function assistenteDeCampo(dialog, { fonte, linha, component = false, dados = [], script = '', analisar }) {
  const el = ligar(dialog);
  const ctx = contexto(fonte, linha, { component });
  let colecao = [];
  try {
    colecao = await carregarColecao();
  } catch { /* sem a coleção: só os arquivos do projeto */ }
  sessao = { fonte, linha, ctx, colecao, dados, script, component, analisar, obj: objetoDoJs(script, { component }) };
  el.formulaCampo.replaceChildren(
    new Option('Pôr um campo na fórmula…', ''),
    ...camposDaAst(analisar(fonte)).map((c) => new Option(`${c.path}${c.label ? ` — ${c.label}` : ''}`, c.path)),
  );
  el.previaJsTexto.textContent = `Vai entrar no ${component ? 'JS do componente' : 'JS da página'}:`;

  // Cada campo começa do zero (o tipo fica o último usado).
  for (const k of ['rotulo', 'nome', 'mascara', 'lista', 'opcoes', 'largura']) el[k].value = '';
  el.nome.placeholder = 'nome';
  el.lista.placeholder = 'lista';
  el.lista.dataset.editado = '';
  el.obrigatorio.checked = false;
  el.calculado.checked = false;
  el.formula.value = '';
  el.formulaNulo.checked = true;
  el.linhas.value = '3';
  el.nivel.value = String(ctx.nivel);
  el.ondeMesma.disabled = !ctx.mesmaLinha;
  el.ondeNova.checked = true;
  const { depois, troca } = posicao(fonte, linha);
  el.ondeNovaTexto.textContent = troca ? `Na linha ${depois + 1} (vazia)` : `Numa linha nova, depois da linha ${depois}`;
  el.listaDados.replaceChildren(
    new Option('Sem arquivo: o JS da página fornece os itens', ''),
    ...dados.map((d) => new Option(`Arquivo do projeto: ${d}`, `projeto:${d}`)),
    ...colecao.map((c) => new Option(`Coleção: ${c.title} (${c.itens.length})`, `colecao:${c.file}`)),
  );
  el.opcoesColecao.replaceChildren(
    new Option('Preencher com uma lista da coleção…', ''),
    ...colecao.map((c) => new Option(`${c.title} (${c.itens.length})`, c.file)),
  );
  mudouTipo(el);
  dialog.returnValue = '';
  dialog.showModal();
  el.rotulo.focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'inserir' ? resultado(el) : null), { once: true });
  });
}

function ligar(dialog) {
  if (ligada) return ligada;
  const q = (id) => dialog.querySelector(`#campo-${id}`);
  const el = {
    tipo: q('tipo'), rotulo: q('rotulo'), rotuloTexto: q('rotulo-texto'), nome: q('nome'), obrigatorio: q('obrigatorio'),
    tamanho: q('tamanho'), digitos: q('digitos'), inteiros: q('inteiros'), decimais: q('decimais'), mascara: q('mascara'),
    lista: q('lista'), listaDados: q('lista-dados'), largura: q('largura'), linhas: q('linhas'), opcoes: q('opcoes'),
    opcoesColecao: q('opcoes-colecao'), nivel: q('nivel'), ondeNova: q('onde-nova'), ondeMesma: q('onde-mesma'),
    ondeNovaTexto: q('onde-nova-texto'), previa: q('previa'), erro: q('erro'), inserir: q('inserir'),
    calculado: q('calculado'), formula: q('formula'), formulaCampo: q('formula-campo'), formulaNulo: q('formula-nulo'),
    previaJs: q('previa-js'), previaJsTexto: q('previa-js-texto'),
  };
  for (const [grupo, nome] of [['linha', 'Na linha de campos'], ['secao', 'Em seção própria']]) {
    const g = document.createElement('optgroup');
    g.label = nome;
    g.append(...TIPOS.filter((t) => t.grupo === grupo).map((t) => new Option(t.label, t.id)));
    el.tipo.append(g);
  }
  for (let n = 1; n <= 12; n++) el.largura.add(new Option(`${n} coluna${n > 1 ? 's' : ''}`, String(n)));

  el.tipo.addEventListener('change', () => mudouTipo(el));
  el.rotulo.addEventListener('input', () => {
    el.nome.placeholder = nomePadrao(el.rotulo.value) || 'nome';
    if (el.tipo.value === 'lista' && !el.lista.dataset.editado) el.lista.placeholder = nomePadrao(el.rotulo.value) || 'lista';
  });
  el.lista.addEventListener('input', () => { el.lista.dataset.editado = el.lista.value ? '1' : ''; });
  // Itens de um arquivo: a lista leva o nome dele (é assim que @nome acha nome.json).
  el.listaDados.addEventListener('change', () => {
    const [, file] = el.listaDados.value.split(':');
    if (file) {
      el.lista.value = file.replace(/\.json$/, '');
      el.lista.dataset.editado = '1';
    }
    atualizar(el);
  });
  el.opcoesColecao.addEventListener('change', () => {
    const c = sessao.colecao.find((x) => x.file === el.opcoesColecao.value);
    if (c) el.opcoes.value = comoOpcoes(c.content);
    el.opcoesColecao.value = '';
    atualizar(el);
  });
  el.calculado.addEventListener('change', () => mudouTipo(el));
  // Campo escolhido entra na posição do cursor da fórmula.
  el.formulaCampo.addEventListener('change', () => {
    const nome = el.formulaCampo.value;
    el.formulaCampo.value = '';
    if (!nome) return;
    const { selectionStart: a, selectionEnd: b, value } = el.formula;
    el.formula.value = `${value.slice(0, a)}${nome}${value.slice(b)}`;
    el.formula.focus();
    el.formula.setSelectionRange(a + nome.length, a + nome.length);
    atualizar(el);
  });
  dialog.addEventListener('input', () => atualizar(el));
  dialog.addEventListener('change', () => atualizar(el));
  for (const b of dialog.querySelectorAll('[data-fechar]')) b.addEventListener('click', () => dialog.close('cancelar'));
  ligada = el;
  return el;
}

function mudouTipo(el) {
  const t = tipo(el.tipo.value) ?? TIPOS[0];
  for (const div of el.tipo.form.querySelectorAll('[data-param]')) {
    const p = div.dataset.param;
    const calcula = t.grupo === 'linha' && t.id !== 'lista';
    div.hidden = p === 'secao' ? t.grupo !== 'secao'
      : p === 'onde' ? t.grupo !== 'linha'
        : p === 'calculo' ? !calcula
          : p === 'formula' ? !(calcula && el.calculado.checked)
            : !t.params.includes(p);
  }
  el.rotuloTexto.textContent = t.id === 'caixa' ? 'Texto ao lado da caixa' : t.grupo === 'secao' ? 'Pergunta (título da seção)' : 'Rótulo';
  if (t.tamanho) el.tamanho.value = String(t.tamanho);
  if (t.digitos) el.digitos.value = String(t.digitos);
  if (t.grupo === 'secao') el.ondeNova.checked = true;
  atualizar(el);
}

function opcoes(el) {
  return {
    tipo: el.tipo.value, rotulo: el.rotulo.value, nome: el.nome.value, obrigatorio: el.obrigatorio.checked,
    tamanho: el.tamanho.value, digitos: el.digitos.value, inteiros: el.inteiros.value, decimais: el.decimais.value,
    mascara: el.mascara.value, lista: el.lista.value, largura: el.largura.value, linhas: el.linhas.value,
    opcoes: el.opcoes.value, nivel: el.nivel.value,
  };
}

function atualizar(el) {
  const { texto, erro } = textoDoCampo(opcoes(el));
  el.previa.textContent = texto;
  const calc = !erro && calculo(el, texto);
  el.previaJs.textContent = calc?.codigo ?? '';
  const problema = erro ?? calc?.erro ?? null;
  el.erro.textContent = problema && el.rotulo.value.trim() ? problema : calc?.aviso ?? '';
  el.erro.classList.toggle('text-danger', Boolean(problema));
  el.erro.classList.toggle('text-secondary', !problema);
  el.inserir.disabled = Boolean(problema);
}

function onde(el, o) {
  return el.ondeMesma.checked && !el.ondeMesma.disabled && tipo(o.tipo).grupo === 'linha';
}

// O calcField do campo, se ele é calculado: o caminho dele sai do .form já com o
// campo inserido (seções, componente, sufixo _2 de nome repetido). null = não é.
function calculo(el, texto) {
  const o = opcoes(el);
  const t = tipo(o.tipo);
  if (!el.calculado.checked || t.grupo !== 'linha' || t.id === 'lista') return null;
  const r = inserir(sessao.fonte, sessao.linha, texto, { mesmaLinha: onde(el, o) });
  const ast = sessao.analisar(r.fonte);
  const alvo = campoNaLinha(ast, r.linha);
  if (!alvo) return { codigo: '', erro: 'não foi possível achar o campo no .form' };
  return codigoDoCalculo({
    alvo, formula: el.formula.value, nulo: el.formulaNulo.checked, obj: sessao.obj,
    caminhos: camposDaAst(ast).map((c) => c.path),
  });
}

function resultado(el) {
  const o = opcoes(el);
  const { texto, erro } = textoDoCampo(o);
  if (erro) return null;
  const calc = calculo(el, texto);
  if (calc?.erro) return null;
  const r = inserir(sessao.fonte, sessao.linha, texto, { mesmaLinha: onde(el, o) });
  let importar = null;
  const [origem, file] = el.listaDados.value.split(':');
  if (o.tipo === 'lista' && origem === 'colecao') {
    const destino = `${(o.lista.trim() || nomePadrao(o.rotulo))}.json`;
    const c = sessao.colecao.find((x) => x.file === file);
    if (c && !sessao.dados.includes(destino)) importar = { file: destino, content: c.content };
  }
  return { fonte: r.fonte, de: r.linha, ate: r.linha + texto.split('\n').length - 1, importar, calculo: calc?.codigo ?? null };
}
