// Campo calculado pelo assistente: da fórmula em JavaScript que o usuário escreve,
// usando os nomes dos campos como variáveis ("quantidade * preco",
// "utils.dateDiffYears(pessoais.nascimento)"), ao form.calcField(...) e ao JS da
// página ou do componente com ele. Puro: sem DOM (testado no Node).
import { ident } from '@formularios/gerador';

// Os campos de uma AST, na ordem: [{ path, label }] (no componente, caminhos
// relativos a ele; na página, completos, com os dos componentes incluídos).
export function camposDaAst(ast) {
  const out = [];
  const andar = (filhos) => {
    for (const no of filhos ?? []) {
      if (no.type === 'group') andar(no.children);
      else if (no.type === 'row') no.fields.forEach((f) => out.push({ path: f.path, label: f.label, source: f.source }));
      else if (no.type === 'options' || no.type === 'longtext') out.push({ path: no.path, label: no.title, source: no.source });
    }
  };
  andar(ast?.children);
  return out;
}

// O caminho do último campo da linha `linha` deste arquivo (os de dentro dos
// componentes incluídos têm as linhas do arquivo deles e ficam de fora).
export function campoNaLinha(ast, linha) {
  let achado = null;
  const andar = (filhos) => {
    for (const no of filhos ?? []) {
      if (no.type === 'group' && !no.component) andar(no.children);
      if (no.type === 'row') for (const f of no.fields) if (f.source?.line === linha) achado = f.path;
    }
  };
  andar(ast?.children);
  return achado;
}

// Troca, fora de strings e comentários, cada campo usado na fórmula pelo nome do
// parâmetro: o caminho completo mais longo que casar ("pessoais.nascimento") ou o
// nome curto, se só um campo tem esse nome ("nascimento").
// -> { expressao, deps: [{ path, param }] na ordem em que aparecem, ambiguos: nomes
//   curtos usados que são de mais de um campo ("cep": residencial.cep e comercial.cep) }
export function lerFormula(formula, caminhos) {
  const conhecidos = new Set(caminhos);
  const curtos = new Map(); // último pedaço -> caminhos
  for (const c of caminhos) curtos.set(c.split('.').at(-1), [...(curtos.get(c.split('.').at(-1)) ?? []), c]);
  const ambiguos = new Set();
  const deps = [];
  const params = new Map();
  const paramDe = (path) => {
    if (!params.has(path)) {
      const curto = ident(path.split('.').at(-1));
      const usado = [...params.values()].includes(curto) || caminhos.some((c) => c !== path && c.split('.').at(-1) === path.split('.').at(-1));
      params.set(path, usado ? ident(path.replace(/\./g, '_')) : curto);
      deps.push({ path, param: params.get(path) });
    }
    return params.get(path);
  };
  let out = '';
  let i = 0;
  const s = String(formula);
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j + 1;
    } else if (s.startsWith('//', i)) {
      const j = s.indexOf('\n', i);
      out += s.slice(i, j < 0 ? s.length : j);
      i = j < 0 ? s.length : j;
    } else if (s.startsWith('/*', i)) {
      const j = s.indexOf('*/', i + 2);
      out += s.slice(i, j < 0 ? s.length : j + 2);
      i = j < 0 ? s.length : j + 2;
    } else if (/[A-Za-z_$]/.test(c) && !/[\w$.]/.test(s[i - 1] ?? '')) {
      const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(s.slice(i));
      const partes = m[0].split('.');
      let n = partes.length;
      while (n > 0 && !conhecidos.has(partes.slice(0, n).join('.'))) n--;
      const curto = n ? null : curtos.get(partes[0]);
      if (n) out += [paramDe(partes.slice(0, n).join('.')), ...partes.slice(n)].join('.');
      else if (curto?.length === 1) out += [paramDe(curto[0]), ...partes.slice(1)].join('.');
      else {
        if (curto) ambiguos.add(partes[0]);
        out += m[0];
      }
      i += m[0].length;
    } else {
      out += c;
      i++;
    }
  }
  return { expressao: out, deps, ambiguos: [...ambiguos] };
}

// alvo: caminho do campo calculado; formula: expressão (ou corpo com return);
// caminhos: os campos que a fórmula pode usar; nulo: devolve null se faltar um valor;
// obj: o objeto do JS ('form' na página, 'parte' no componente).
// -> { codigo, deps, erro }
export function codigoDoCalculo({ alvo, formula, caminhos, nulo = true, obj = 'form' }) {
  const texto = String(formula ?? '').trim();
  if (!texto) return { codigo: '', deps: [], erro: 'escreva a fórmula' };
  const { expressao, deps, ambiguos } = lerFormula(texto, caminhos.filter((c) => c !== alvo));
  if (lerFormula(texto, [alvo]).deps.length) return { codigo: '', deps, erro: 'a fórmula não pode usar o próprio campo' };
  if (ambiguos.length) {
    const opcoes = (nome) => caminhos.filter((c) => c.split('.').at(-1) === nome).join(' ou ');
    return { codigo: '', deps, erro: ambiguos.map((a) => `"${a}" é de mais de um campo: use ${opcoes(a)}`).join('; ') };
  }
  const params = deps.map((d) => d.param);
  const bloco = /\breturn\b/.test(expressao);
  const guarda = nulo && deps.length ? params.map((p) => `${p} == null`).join(' || ') : null;
  try {
    // eslint-disable-next-line no-new-func -- só confere a sintaxe; não roda nada
    new Function(...params, bloco ? expressao : `return (${expressao});`);
  } catch (error) {
    return { codigo: '', deps, erro: `JavaScript inválido: ${error.message}` };
  }
  let corpo;
  if (bloco) {
    const linhas = [...(guarda ? [`if (${guarda}) return null;`] : []), ...expressao.split('\n').map((l) => l.trim()).filter(Boolean)];
    corpo = `{\n${linhas.map((l) => `  ${l}`).join('\n')}\n}`;
  } else {
    corpo = guarda ? `(${guarda} ? null : ${expressao})` : expressao.includes('\n') ? `(${expressao})` : expressao;
  }
  const inicio = `${obj}.calcField('${alvo}', [${deps.map((d) => `'${d.path}'`).join(', ')}],`;
  const funcao = `(${params.join(', ')}) => ${corpo});`;
  // Linha longa: a função vai para a linha de baixo.
  const chamada = `${inicio} ${funcao}`.split('\n')[0].length > 100 ? `${inicio}\n  ${funcao.replace(/\n/g, '\n  ')}` : `${inicio} ${funcao}`;
  const codigo = [
    `// Campo calculado: ${alvo}${deps.length ? ` (depende de ${deps.map((d) => d.path).join(', ')})` : ''}.`,
    chamada,
  ].join('\n');
  return { codigo, deps, erro: null, aviso: deps.length ? null : 'a fórmula não usa nenhum campo: o valor só é calculado no início' };
}

// O objeto a usar no JS: a variável do new Form(...) da página ou o parâmetro do
// export default function do componente.
export function objetoDoJs(script, { component = false } = {}) {
  if (component) return /export\s+default\s+function\s*[\w$]*\s*\(\s*([A-Za-z_$][\w$]*)/.exec(script)?.[1] ?? 'parte';
  return /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Form\(/.exec(script)?.[1] ?? 'form';
}

// O JS com o código do calcField: na página, antes do último "await x.ready()";
// no componente, antes do "}" que fecha a função; senão, no fim. Garante o import
// de utils quando o código usa utils.
export function inserirNoJs(script, codigo, { component = false } = {}) {
  let js = String(script);
  if (/\butils\./.test(codigo) && !/import\s*\{[^}]*\butils\b[^}]*\}\s*from/.test(js)) {
    const comForm = /import\s*\{([^}]*\bForm\b[^}]*)\}\s*from\s*(['"][^'"]+['"])/;
    if (!component && comForm.test(js)) js = js.replace(comForm, (m, nomes, de) => `import {${nomes.replace(/\s*$/, '')}, utils } from ${de}`);
    else {
      const linhaImport = `import { utils } from '${component ? '../forms.js' : './forms.js'}';`;
      const linhas = js.split('\n');
      const i = linhas.findIndex((l) => /^\s*(import|export|const|let|var|function)\b/.test(l));
      linhas.splice(i < 0 ? 0 : i, 0, linhaImport, ...(i >= 0 && /^\s*import\b/.test(linhas[i]) ? [] : ['']));
      js = linhas.join('\n');
    }
  }
  const linhas = js.split('\n');
  if (component) {
    const fim = linhas.findLastIndex((l) => /^\}\s*;?\s*$/.test(l));
    if (fim >= 0) {
      const antes = linhas[fim - 1]?.trim() ? [''] : [];
      linhas.splice(fim, 0, ...antes, ...codigo.split('\n').map((l) => `  ${l}`));
      return linhas.join('\n');
    }
  } else {
    const ready = linhas.findLastIndex((l) => /^\s*await\s+[\w$]+\.ready\(\)/.test(l));
    if (ready >= 0) {
      linhas.splice(ready, 0, ...codigo.split('\n'), '');
      return linhas.join('\n');
    }
  }
  return `${js.replace(/\s*$/, '')}\n\n${codigo}\n`;
}
