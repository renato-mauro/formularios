// Persistência no armazenamento local do navegador: um JSON numa só chave.
// estado: { current: id do projeto, projects: [projeto (ver project.js)] }
import { addForm, createProject, pages } from './project.js';

export const KEY = 'formularios.web.v1';
const OLD_EDITOR_KEY = 'formularios-editor'; // editor de teste anterior (um formulário só)

// Projeto novo: uma página que inclui um componente numa seção.
export const INITIAL_PAGE = `-Meu formulário
Nome*: ______________________   Nascimento: dd/mm/aaaa
CPF: 999.999.999-99   E-mail: email______________
--Endereço{endereco}
+endereco
[ ] Aceito os termos de uso{aceite}*
`;

// Componente não tem título: o título é o da seção que o inclui.
export const INITIAL_COMPONENT = `Logradouro*: ______________________________   Nº: ________
Cidade: ________________   Estado: @estados   CEP: 99999-999
`;

export const NEW_PAGE = `-Nova página
Nome*: ______________________
`;

export const NEW_COMPONENT = `Campo: ______________________
`;

export function starterProject(name, source = INITIAL_PAGE) {
  const project = createProject(name);
  addForm(project, 'endereco', INITIAL_COMPONENT, 'component');
  addForm(project, 'formulario', source, 'page');
  return project;
}

// storage: localStorage ou equivalente (getItem/setItem); null = sem persistência.
export function load(storage) {
  const raw = read(storage, KEY);
  if (raw) {
    try {
      const state = JSON.parse(raw);
      if (Array.isArray(state?.projects) && state.projects.length) {
        for (const p of state.projects) {
          p.data ??= []; // estados de antes dos arquivos de dados
          for (const f of p.forms) f.kind ??= 'page'; // de antes dos componentes
          if (!p.forms.some((f) => f.id === p.current)) p.current = (pages(p)[0] ?? p.forms[0])?.id ?? null;
        }
        return state;
      }
    } catch { /* estado corrompido: recomeça */ }
  }
  const project = starterProject('Meu projeto', read(storage, OLD_EDITOR_KEY) || INITIAL_PAGE);
  return { current: project.id, projects: [project] };
}

// Lança se o armazenamento recusar (cota cheia, modo privado...).
export function save(storage, state) {
  if (storage) storage.setItem(KEY, JSON.stringify(state));
}

function read(storage, key) {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}
