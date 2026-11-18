// endereco.js — componente endereco: a lista de estados.
// A página inclui o endereço duas vezes (residencial e comercial): form.ready()
// chama esta função uma vez para cada uma, com a sua parte.
import { utils } from '../forms.js';

export default function endereco(parte) {
  // Listas: sempre por callback. utils.loadJson('./estados.json') é o provedor que
  // lê o arquivo ao lado da página (a CLI copia o <lista>.json de cada @lista);
  // poderia ser uma API: async ({ data }) => (await fetch(...)).json().
  parte.list('estados', utils.loadJson('./estados.json'));
}
