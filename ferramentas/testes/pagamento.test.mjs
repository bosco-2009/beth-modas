// Testes da função de pagamento, com o Mercado Pago simulado.
// Rodar na pasta do projeto:  node --test ferramentas/testes/pagamento.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_URL = 'https://loja.exemplo/beth';
process.env.ORIGENS = 'https://loja.exemplo';
const { default: pagamento } = await import('../../netlify/functions/pagamento.mjs');

const MEIOS = [
  { id: 'pix', payment_type_id: 'bank_transfer' },
  { id: 'bolbradesco', payment_type_id: 'ticket' },
  { id: 'visa', payment_type_id: 'credit_card' },
  { id: 'debelo', payment_type_id: 'debit_card' },
  { id: 'account_money', payment_type_id: 'account_money' },
];

let enviado;
let respostaPreferencia;

beforeEach(() => {
  process.env.MP_ACCESS_TOKEN = 'TEST-123';
  enviado = null;
  respostaPreferencia = { status: 201, corpo: { id: 'p1', init_point: 'https://mp/real', sandbox_init_point: 'https://mp/teste' } };
  globalThis.fetch = async (url, opcoes = {}) => {
    if (url.endsWith('/v1/payment_methods')) return new Response(JSON.stringify(MEIOS), { status: 200 });
    if (url.endsWith('/checkout/preferences')) {
      enviado = { cabecalhos: opcoes.headers, corpo: JSON.parse(opcoes.body) };
      return new Response(JSON.stringify(respostaPreferencia.corpo), { status: respostaPreferencia.status });
    }
    throw new Error('URL inesperada: ' + url);
  };
});

const cliente = { nome: 'Maria da Silva', whatsapp: '(21) 99999-1234', email: 'maria@exemplo.com' };

function pedir(corpo, origem = 'https://loja.exemplo') {
  return pagamento(new Request('https://funcao/api/pagamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origem },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  }));
}

test('o preço vem do catálogo, não do navegador', async () => {
  const r = await pedir({
    itens: [{ ref: 'BM-09', tamanho: 'G', qtd: 2, preco: 0.01 }, { ref: 'BM-12', tamanho: '', qtd: 1 }],
    cliente, entrega: { tipo: 'retirada' }, metodo: 'pix',
  });
  assert.equal(r.status, 200);
  const itens = enviado.corpo.items;
  assert.deepEqual(itens.map((i) => [i.id, i.quantity, i.unit_price, i.currency_id]),
    [['BM-09', 2, 37, 'BRL'], ['BM-12', 1, 135, 'BRL']]);
  assert.match(itens[0].title, /tamanho G/);
  assert.equal(enviado.corpo.metadata.total, 'R$ 209,00');
  assert.equal(enviado.cabecalhos.Authorization, 'Bearer TEST-123');
});

test('cada forma de pagamento deixa só ela disponível', async () => {
  const esperado = {
    pix: ['ticket', 'credit_card', 'debit_card'],
    boleto: ['bank_transfer', 'credit_card', 'debit_card'],
    credito: ['bank_transfer', 'ticket', 'debit_card'],
    debito: ['bank_transfer', 'ticket', 'credit_card'],
  };
  for (const [metodo, tipos] of Object.entries(esperado)) {
    const r = await pedir({ itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo });
    assert.equal(r.status, 200, metodo);
    const excluidos = enviado.corpo.payment_methods.excluded_payment_types.map((t) => t.id);
    assert.deepEqual(excluidos.sort(), tipos.sort(), metodo);
    assert.ok(!excluidos.includes('account_money'), 'dinheiro em conta não pode ser excluído');
  }
});

test('volta para a página do pedido depois de pagar', async () => {
  await pedir({ itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'credito' });
  assert.deepEqual(enviado.corpo.back_urls, {
    success: 'https://loja.exemplo/beth/pedido.html?resultado=aprovado',
    pending: 'https://loja.exemplo/beth/pedido.html?resultado=pendente',
    failure: 'https://loja.exemplo/beth/pedido.html?resultado=recusado',
  });
  assert.equal(enviado.corpo.auto_return, 'approved');
  assert.match(enviado.corpo.external_reference, /^BM\d{6}-[A-Z0-9]{4}$/);
});

test('credencial de teste usa o checkout de testes; a real usa o de produção', async () => {
  const corpo = { itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' };
  assert.equal((await (await pedir(corpo)).json()).url, 'https://mp/teste');
  process.env.MP_ACCESS_TOKEN = 'APP_USR-123';
  assert.equal((await (await pedir(corpo)).json()).url, 'https://mp/real');
});

test('recusa pedidos inválidos', async () => {
  const base = { cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' };
  const casos = [
    [{ ...base, itens: [] }, /vazio/],
    [{ ...base, itens: [{ ref: 'BM-99', qtd: 1 }] }, /não está mais disponível/],
    [{ ...base, itens: [{ ref: 'BM-09', tamanho: '', qtd: 1 }] }, /tamanho/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 21 }] }, /Quantidade/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], metodo: 'cheque' }, /forma de pagamento/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], entrega: { tipo: 'entrega', cep: '1' } }, /endereço/],
    ['isto não é json', /inválido/],
  ];
  for (const [corpo, mensagem] of casos) {
    const r = await pedir(corpo);
    assert.equal(r.status, 400);
    assert.match((await r.json()).erro, mensagem);
  }
  assert.equal(enviado, null, 'nada pode ir para o Mercado Pago');
});

test('sem a credencial configurada, avisa em vez de quebrar', async () => {
  delete process.env.MP_ACCESS_TOKEN;
  const r = await pedir({ itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' });
  assert.equal(r.status, 503);
  const estado = await (await pagamento(new Request('https://funcao/api/pagamento'))).json();
  assert.deepEqual(estado, { ok: true, configurado: false });
});

test('erro do Mercado Pago vira mensagem amigável', async () => {
  respostaPreferencia = { status: 401, corpo: { message: 'invalid token' } };
  const r = await pedir({ itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' });
  assert.equal(r.status, 502);
  assert.match((await r.json()).erro, /Não foi possível abrir o pagamento/);
});

test('só o site da loja pode chamar a função pelo navegador', async () => {
  const corpo = { itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' };
  assert.equal((await pedir(corpo)).headers.get('Access-Control-Allow-Origin'), 'https://loja.exemplo');
  assert.equal((await pedir(corpo, 'https://outro.site')).headers.get('Access-Control-Allow-Origin'), null);
});
