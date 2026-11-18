// clientes.js — exemplo de integração do formulário "Cadastro de Clientes".
// A página cria o Form e registra as ações (cada uma vira um botão). Listas,
// validações e o campo calculado ficam no JS dos componentes, que form.ready()
// carrega e chama sozinho, cada um com a sua parte:
//   components/pessoa.js: pessoais
//   components/endereco.js: residencial, comercial
import { Form } from './forms.js';

const EXEMPLO = {
  pessoais: {
    nome: 'Maria Silva', cpf: '529.982.247-25', nascimento: '1980-05-17', salario: 1234.56,
    e_mail: 'maria@exemplo.com', telefone: '(11) 98765-4321',
  },
  residencial: {
    logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP', cep: '01310-100',
  },
  contato: { agencia: '0012', ramal: 1234, horario: '14:30' },
  sexo: 'F',
  interesses: ['ESP', 'MUS'],
  obs: 'Cliente desde 2010.',
  aceite: true,
};

const form = new Form('#clientes');

// Ações: cada uma vira um botão, nesta ordem. Nenhuma valida sozinha.
form.action('enviar', async ({ form, data }) => {
  const { valid } = form.validate({ focus: true });
  mostrar(valid ? 'Enviado (simulação)' : 'Há erros no formulário', data);
  if (valid && data.pessoais.cpf === '529.982.247-25') {
    // Erros vindos do "servidor" voltam como array.
    return { errors: [{ field: 'pessoais.cpf', message: 'CPF já cadastrado (simulação do servidor).' }] };
  }
});
form.action('limpar', async ({ form }) => {
  form.clear();
  mostrar('Formulário limpo', form.getData());
}, { label: 'Limpar tudo' });

await form.ready();

// --- Só para a demonstração: botões e painel fora do formulário.
const painel = document.createElement('section');
painel.className = 'container pb-4';
painel.innerHTML = `
  <div class="d-flex gap-2 mb-2">
    <button type="button" class="btn btn-sm btn-outline-primary" id="demo-preencher">Preencher com dados de exemplo</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="demo-json">Ver JSON</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="demo-leitura">Somente leitura</button>
  </div>
  <h2 class="h6 text-secondary" id="demo-titulo"></h2>
  <pre class="bg-body border rounded p-3 small" id="demo-saida" hidden></pre>`;
document.querySelector('main').append(painel);

let travado = false;
document.getElementById('demo-preencher').addEventListener('click', () => {
  form.setData(EXEMPLO);
  mostrar('setData(EXEMPLO) — getData() depois', form.getData());
});
document.getElementById('demo-json').addEventListener('click', () => mostrar('getData()', form.getData()));
document.getElementById('demo-leitura').addEventListener('click', (e) => {
  travado = !travado;
  form.readOnly(travado);
  e.target.textContent = travado ? 'Liberar edição' : 'Somente leitura';
});

function mostrar(titulo, dados) {
  document.getElementById('demo-titulo').textContent = titulo;
  const saida = document.getElementById('demo-saida');
  saida.hidden = false;
  saida.textContent = JSON.stringify(dados, null, 2);
}
