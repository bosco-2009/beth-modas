// Testes do api/pagamento.php, rodando no PHP de verdade (php -S) com o Mercado Pago simulado.
// Rodar na pasta do projeto:  node --test ferramentas/testes/pagamento.test.mjs   (precisa do PHP com cURL)
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEM_PHP = spawnSync('php', ['-v']).status !== 0;
const ORIGEM = 'https://loja.exemplo';

const MEIOS = [
  { id: 'pix', payment_type_id: 'bank_transfer' },
  { id: 'bolbradesco', payment_type_id: 'ticket' },
  { id: 'visa', payment_type_id: 'credit_card' },
  { id: 'debelo', payment_type_id: 'debit_card' },
  { id: 'account_money', payment_type_id: 'account_money' },
];

// ---------------------------------------------------------------- Mercado Pago simulado
let enviado;
let respostaPreferencia;
const mp = createServer(async (req, res) => {
  let corpo = '';
  for await (const parte of req) corpo += parte;
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/v1/payment_methods') return res.end(JSON.stringify(MEIOS));
  if (req.url === '/checkout/preferences') {
    enviado = { cabecalhos: req.headers, corpo: JSON.parse(corpo) };
    res.statusCode = respostaPreferencia.status;
    return res.end(JSON.stringify(respostaPreferencia.corpo));
  }
  res.statusCode = 404;
  res.end('{}');
});

// ---------------------------------------------------------------- PHP com cada credencial
const servidores = {};
let cache;

async function portaLivre() {
  const s = createServer();
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const { port } = s.address();
  await new Promise((ok) => s.close(ok));
  return port;
}

async function subirPhp(token) {
  const porta = await portaLivre();
  const env = { ...process.env, MP_API_URL: `http://127.0.0.1:${mp.address().port}`, SITE_URL: 'https://loja.exemplo/beth', ORIGENS: ORIGEM, MP_CACHE_DIR: cache };
  delete env.MP_ACCESS_TOKEN;
  if (token) env.MP_ACCESS_TOKEN = token;
  const processo = spawn('php', ['-S', `127.0.0.1:${porta}`, '-t', RAIZ], { env, stdio: 'ignore' });
  const url = `http://127.0.0.1:${porta}/api/pagamento.php`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(url); return { url, processo }; } catch { await new Promise((ok) => setTimeout(ok, 50)); }
  }
  throw new Error('o PHP não subiu');
}

before(async () => {
  if (SEM_PHP) return;
  cache = mkdtempSync(join(tmpdir(), 'beth-mp-'));
  await new Promise((ok) => mp.listen(0, '127.0.0.1', ok));
  servidores.teste = await subirPhp('TEST-123');
  servidores.real = await subirPhp('APP_USR-123');
  servidores.sem = await subirPhp('');
});

after(() => {
  for (const s of Object.values(servidores)) s.processo.kill();
  mp.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

beforeEach(() => {
  enviado = null;
  respostaPreferencia = { status: 201, corpo: { id: 'p1', init_point: 'https://mp/real', sandbox_init_point: 'https://mp/teste' } };
});

const cliente = { nome: 'Maria da Silva', whatsapp: '(21) 99999-1234', email: 'maria@exemplo.com' };
const simples = { itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' };

function pedir(corpo, { servidor = 'teste', origem = ORIGEM } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origem) headers.Origin = origem;
  return fetch(servidores[servidor].url, { method: 'POST', headers, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
}

const opcoes = { skip: SEM_PHP && 'PHP não instalado' };

test('o preço vem do catálogo, não do navegador', opcoes, async () => {
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
  assert.equal(enviado.cabecalhos.authorization, 'Bearer TEST-123');
  assert.match(enviado.cabecalhos['x-idempotency-key'], /^[0-9a-f-]{36}$/);
});

test('cada forma de pagamento deixa só ela disponível', opcoes, async () => {
  const esperado = {
    pix: ['ticket', 'credit_card', 'debit_card'],
    boleto: ['bank_transfer', 'credit_card', 'debit_card'],
    credito: ['bank_transfer', 'ticket', 'debit_card'],
    debito: ['bank_transfer', 'ticket', 'credit_card'],
  };
  for (const [metodo, tipos] of Object.entries(esperado)) {
    const r = await pedir({ ...simples, metodo });
    assert.equal(r.status, 200, metodo);
    const excluidos = enviado.corpo.payment_methods.excluded_payment_types.map((t) => t.id);
    assert.deepEqual(excluidos.sort(), tipos.sort(), metodo);
    assert.ok(!excluidos.includes('account_money'), 'dinheiro em conta não pode ser excluído');
  }
});

test('volta para a página do pedido depois de pagar', opcoes, async () => {
  await pedir({ ...simples, metodo: 'credito' });
  assert.deepEqual(enviado.corpo.back_urls, {
    success: 'https://loja.exemplo/beth/pedido.html?resultado=aprovado',
    pending: 'https://loja.exemplo/beth/pedido.html?resultado=pendente',
    failure: 'https://loja.exemplo/beth/pedido.html?resultado=recusado',
  });
  assert.equal(enviado.corpo.auto_return, 'approved');
  assert.match(enviado.corpo.external_reference, /^BM\d{6}-[A-Z0-9]{4}$/);
  assert.equal(enviado.corpo.payer.phone.area_code, '21');
});

test('credencial de teste usa o checkout de testes; a real usa o de produção', opcoes, async () => {
  assert.equal((await (await pedir(simples)).json()).url, 'https://mp/teste');
  assert.equal((await (await pedir(simples, { servidor: 'real' })).json()).url, 'https://mp/real');
});

test('a finalização sabe se o pagamento está ligado e se é de teste', opcoes, async () => {
  const estado = async (s) => (await fetch(servidores[s].url)).json();
  assert.deepEqual(await estado('teste'), { ok: true, configurado: true, teste: true });
  assert.deepEqual(await estado('real'), { ok: true, configurado: true, teste: false });
  assert.deepEqual(await estado('sem'), { ok: true, configurado: false, teste: false });
});

test('recusa pedidos inválidos', opcoes, async () => {
  const base = { cliente, entrega: { tipo: 'retirada' }, metodo: 'pix' };
  const casos = [
    [{ ...base, itens: [] }, /vazio/],
    [{ ...base, itens: [{ ref: 'BM-99', qtd: 1 }] }, /não está mais disponível/],
    [{ ...base, itens: [{ ref: 'toString', qtd: 1 }] }, /não está mais disponível/],
    [{ ...base, itens: [{ ref: '__proto__', qtd: 1 }] }, /não está mais disponível/],
    [{ ...base, itens: [null] }, /não está mais disponível/],
    [{ ...base, itens: [{ ref: 'BM-09', tamanho: '', qtd: 1 }] }, /tamanho/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 21 }] }, /Quantidade/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1.5 }] }, /Quantidade/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], metodo: 'cheque' }, /forma de pagamento/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], metodo: 'toString' }, /forma de pagamento/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], entrega: { tipo: 'entrega', cep: '1' } }, /endereço/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente: { ...cliente, whatsapp: '2199' } }, /WhatsApp/],
    [{ ...base, itens: [{ ref: 'BM-12', tamanho: '', qtd: 1 }], cliente: { ...cliente, email: 'maria@exemplo' } }, /e-mail/],
    ['isto não é json', /inválido/],
  ];
  for (const [corpo, mensagem] of casos) {
    const r = await pedir(corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.match((await r.json()).erro, mensagem);
  }
  assert.equal(enviado, null, 'nada pode ir para o Mercado Pago');
});

test('sem a credencial configurada, avisa em vez de quebrar', opcoes, async () => {
  const r = await pedir(simples, { servidor: 'sem' });
  assert.equal(r.status, 503);
  assert.match((await r.json()).erro, /ainda não foi configurado/);
  assert.equal(enviado, null);
});

test('erro do Mercado Pago vira mensagem amigável', opcoes, async () => {
  respostaPreferencia = { status: 401, corpo: { message: 'invalid token' } };
  const r = await pedir(simples);
  assert.equal(r.status, 502);
  assert.match((await r.json()).erro, /Não foi possível abrir o pagamento/);
});

test('só o site da loja pode chamar pelo navegador', opcoes, async () => {
  assert.equal((await pedir(simples, { origem: 'https://outro.site' })).status, 403);
  assert.equal(enviado, null);
  assert.equal((await pedir(simples)).status, 200);
});
