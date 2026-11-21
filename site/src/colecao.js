// Coleção de listas prontas (src/colecao/: index.json e um .json por lista), que o
// usuário importa como arquivos de dados do projeto. Vai junto com a interface
// (docs/src/colecao no site); é buscada só na primeira vez que alguém a usa.

const BASE = new URL('./colecao/', import.meta.url);
let carregada = null;

// -> [{ file, title, description, content, itens: ['label', ...] }]
export function carregarColecao() {
  carregada ??= (async () => {
    const resp = await fetch(new URL('index.json', BASE));
    if (!resp.ok) throw new Error(`coleção: index.json respondeu ${resp.status}`);
    const indice = await resp.json();
    return Promise.all(indice.map(async (item) => {
      const r = await fetch(new URL(item.file, BASE));
      if (!r.ok) throw new Error(`coleção: ${item.file} respondeu ${r.status}`);
      const content = await r.text();
      return { ...item, content, itens: rotulos(content) };
    }));
  })();
  carregada.catch(() => { carregada = null; }); // falhou: tenta de novo na próxima vez
  return carregada;
}

// Os textos de uma lista ([{ value, label }] ou ['valor']), na ordem.
export function rotulos(content) {
  try {
    const dados = JSON.parse(content);
    return Array.isArray(dados) ? dados.map((x) => String(x !== null && typeof x === 'object' ? x.label ?? x.value : x)) : [];
  } catch {
    return [];
  }
}

// Linhas "valor = Texto" de uma lista, para as opções de rádio/múltipla escolha.
export function comoOpcoes(content) {
  const dados = JSON.parse(content);
  return dados.map((x) => (x !== null && typeof x === 'object' ? `${x.value} = ${x.label ?? x.value}` : String(x))).join('\n');
}

// A janela da coleção. noProjeto: nomes dos arquivos de dados que o projeto já
// tem; sugeridas: @listas do formulário aberto (já vêm marcadas, se faltar o
// arquivo). -> Promise das entradas escolhidas ([] = cancelou).
export async function escolherDaColecao(dialog, { noProjeto = [], sugeridas = [] }) {
  const lista = dialog.querySelector('#colecao-itens');
  if (!dialog.dataset.ligado) {
    dialog.dataset.ligado = '1';
    for (const b of dialog.querySelectorAll('[data-fechar]')) b.addEventListener('click', () => dialog.close('cancelar'));
  }
  let colecao = [];
  const fechou = new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'importar'
      ? [...lista.querySelectorAll('input:checked')].map((c) => colecao[Number(c.value)])
      : []), { once: true });
  });
  lista.textContent = 'Carregando…';
  dialog.returnValue = '';
  dialog.showModal();
  try {
    colecao = await carregarColecao();
  } catch (error) {
    lista.textContent = `Não foi possível carregar a coleção: ${error.message}`;
    return fechou;
  }
  lista.replaceChildren(...colecao.map((c, i) => {
    const nome = c.file.replace(/\.json$/, '');
    const tem = noProjeto.includes(c.file);
    const label = document.createElement('label');
    label.className = 'list-group-item colecao-item';
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.className = 'form-check-input mt-1 flex-shrink-0';
    caixa.value = String(i);
    caixa.disabled = tem;
    caixa.checked = !tem && sugeridas.includes(nome);
    const texto = document.createElement('span');
    texto.innerHTML = '<strong></strong> <code></code> <span class="text-secondary"></span>'
      + '<br><span class="descricao"></span><br><span class="amostra"></span>';
    texto.querySelector('strong').textContent = c.title;
    texto.querySelector('code').textContent = c.file;
    texto.querySelector('.text-secondary').textContent = `${c.itens.length} itens${tem ? ' — já está no projeto'
      : sugeridas.includes(nome) ? ` — para a lista @${nome} deste formulário` : ''}`;
    texto.querySelector('.descricao').textContent = c.description;
    texto.querySelector('.amostra').textContent = c.itens.slice(0, 4).join(', ') + (c.itens.length > 4 ? '…' : '');
    label.append(caixa, texto);
    return label;
  }));
  return fechou;
}
