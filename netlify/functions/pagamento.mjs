// Cria o pagamento da compra no Mercado Pago (Checkout Pro) e devolve o link da página segura de pagamento.
//
// Variáveis de ambiente (configuradas no painel do Netlify):
//   MP_ACCESS_TOKEN  Access Token da conta Mercado Pago da loja (obrigatória; nunca vai para o site)
//   SITE_URL         endereço do site, para onde o cliente volta depois de pagar
//                    (padrão: https://bosco-2009.github.io/beth-modas)
//   ORIGENS          sites que podem chamar esta função, separados por vírgula
//                    (padrão: https://bosco-2009.github.io)
//   MP_API_URL       só para testes locais (padrão: https://api.mercadopago.com)

import { randomUUID } from 'node:crypto';
import catalogo from '../catalogo.mjs';

const API = (process.env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || 'https://bosco-2009.github.io/beth-modas').replace(/\/$/, '');
const ORIGENS = (process.env.ORIGENS || 'https://bosco-2009.github.io').split(',').map((o) => o.trim()).filter(Boolean);

const METODOS = { pix: 'Pix', boleto: 'Boleto', credito: 'Cartão de crédito', debito: 'Cartão de débito' };

// Qual meio de pagamento do Mercado Pago corresponde a cada opção do site.
// "ticket" é o boleto; "pix" é o identificador do Pix.
const ESCOLHA = {
  pix: (m) => m.id === 'pix',
  boleto: (m) => m.payment_type_id === 'ticket',
  credito: (m) => m.payment_type_id === 'credit_card',
  debito: (m) => m.payment_type_id === 'debit_card',
};

// "Dinheiro em conta" do Mercado Pago não pode ser excluído (regra do Mercado Pago).
const NAO_EXCLUIVEL = new Set(['account_money']);

class ErroPedido extends Error {}

function texto(valor, max) {
  return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function digitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function validar(corpo) {
  if (!corpo || typeof corpo !== 'object') throw new ErroPedido('Pedido inválido.');

  const lista = Array.isArray(corpo.itens) ? corpo.itens : [];
  if (!lista.length) throw new ErroPedido('Seu carrinho está vazio.');
  if (lista.length > 30) throw new ErroPedido('Pedido com itens demais.');
  const itens = lista.map((i) => {
    // só os produtos do catálogo (um código como "toString" não pode passar)
    const p = i && Object.prototype.hasOwnProperty.call(catalogo, i.ref) ? catalogo[i.ref] : null;
    if (!p) throw new ErroPedido('Um dos produtos do carrinho não está mais disponível. Atualize o carrinho.');
    const qtd = Number(i.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 20) throw new ErroPedido('Quantidade inválida.');
    const tamanho = typeof i.tamanho === 'string' ? i.tamanho : '';
    if (p.tamanhos.length ? !p.tamanhos.includes(tamanho) : tamanho !== '') {
      throw new ErroPedido(`Escolha um tamanho válido para ${p.nome}.`);
    }
    // o preço sempre vem do catálogo da loja, nunca do navegador
    return { ref: i.ref, nome: p.nome, foto: p.foto, preco: p.preco, tamanho, qtd };
  });

  const c = corpo.cliente || {};
  const cliente = { nome: texto(c.nome, 80), whatsapp: digitos(c.whatsapp), email: texto(c.email, 120) };
  if (cliente.nome.length < 3) throw new ErroPedido('Escreva seu nome completo.');
  if (cliente.whatsapp.length < 10 || cliente.whatsapp.length > 13) throw new ErroPedido('Confira o número de WhatsApp.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email)) throw new ErroPedido('Confira o e-mail.');

  const e = corpo.entrega || {};
  const entrega = { tipo: e.tipo === 'entrega' ? 'entrega' : 'retirada' };
  if (entrega.tipo === 'entrega') {
    Object.assign(entrega, {
      cep: digitos(e.cep), rua: texto(e.rua, 120), numero: texto(e.numero, 10),
      complemento: texto(e.complemento, 60), bairro: texto(e.bairro, 60), cidade: texto(e.cidade, 60),
    });
    if (entrega.cep.length !== 8 || !entrega.rua || !entrega.numero || !entrega.bairro || !entrega.cidade) {
      throw new ErroPedido('Confira o endereço de entrega.');
    }
  }

  const metodo = corpo.metodo;
  if (!METODOS[metodo]) throw new ErroPedido('Escolha a forma de pagamento.');
  return { itens, cliente, entrega, metodo };
}

// Lista de meios de pagamento da conta, guardada por 10 minutos.
let meios = { lista: null, quando: 0 };

async function meiosDePagamento(token) {
  if (meios.lista && Date.now() - meios.quando < 10 * 60 * 1000) return meios.lista;
  const r = await fetch(`${API}/v1/payment_methods`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`payment_methods respondeu ${r.status}`);
  const lista = await r.json();
  if (!Array.isArray(lista)) throw new Error('payment_methods não devolveu uma lista');
  meios = { lista, quando: Date.now() };
  return lista;
}

// Deixa disponível só a forma de pagamento escolhida no site.
async function restricoes(token, metodo) {
  let lista;
  try {
    lista = await meiosDePagamento(token);
  } catch (erro) {
    console.error('Não consegui consultar os meios de pagamento:', erro.message);
    return {};
  }
  const escolhidos = lista.filter(ESCOLHA[metodo]);
  if (!escolhidos.length) {
    console.error(`Nenhum meio de pagamento corresponde a "${metodo}"; o checkout mostrará todos.`);
    return {};
  }
  const tiposPermitidos = new Set(escolhidos.map((m) => m.payment_type_id));
  const tipos = [...new Set(lista.map((m) => m.payment_type_id))]
    .filter((t) => t && !tiposPermitidos.has(t) && !NAO_EXCLUIVEL.has(t));
  // dentro do mesmo tipo, tira o que não é a escolha (ex.: outros meios além do Pix)
  const metodos = lista
    .filter((m) => tiposPermitidos.has(m.payment_type_id) && !ESCOLHA[metodo](m) && !NAO_EXCLUIVEL.has(m.payment_type_id))
    .map((m) => m.id);
  return {
    excluded_payment_types: tipos.map((id) => ({ id })),
    excluded_payment_methods: [...new Set(metodos)].map((id) => ({ id })),
  };
}

function numeroDoPedido() {
  const d = new Date();
  const data = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `BM${data}-${sufixo}`;
}

function reais(v) {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

function montarPreferencia(pedido, numero, pagamento) {
  const { itens, cliente, entrega, metodo } = pedido;
  const [nome, ...sobrenome] = cliente.nome.split(' ');
  const fone = cliente.whatsapp.length > 11 ? cliente.whatsapp.slice(-11) : cliente.whatsapp;
  const endereco = entrega.tipo === 'entrega'
    ? `${entrega.rua}, ${entrega.numero}${entrega.complemento ? ' - ' + entrega.complemento : ''}, ${entrega.bairro}, ${entrega.cidade}, CEP ${entrega.cep}`
    : 'Retirada na loja';
  const resumo = itens.map((i) => `${i.qtd}x ${i.nome}${i.tamanho ? ' (' + i.tamanho + ')' : ''}`).join('; ');
  return {
    items: itens.map((i) => ({
      id: i.ref,
      title: i.tamanho ? `${i.nome} - tamanho ${i.tamanho}` : i.nome,
      quantity: i.qtd,
      unit_price: i.preco,
      currency_id: 'BRL',
      picture_url: `${SITE}/assets/img/produtos/${i.foto}`,
    })),
    payer: {
      name: nome,
      surname: sobrenome.join(' '),
      email: cliente.email,
      phone: { area_code: fone.slice(0, 2), number: fone.slice(2) },
    },
    back_urls: {
      success: `${SITE}/pedido.html?resultado=aprovado`,
      pending: `${SITE}/pedido.html?resultado=pendente`,
      failure: `${SITE}/pedido.html?resultado=recusado`,
    },
    auto_return: 'approved',
    external_reference: numero,
    statement_descriptor: 'BETHMODAS',
    payment_methods: pagamento,
    additional_info: `Pedido ${numero}. ${resumo}. Entrega: ${endereco}. WhatsApp: ${cliente.whatsapp}.`.slice(0, 600),
    metadata: {
      pedido: numero,
      forma_de_pagamento: METODOS[metodo],
      cliente_nome: cliente.nome,
      cliente_whatsapp: cliente.whatsapp,
      cliente_email: cliente.email,
      entrega: endereco,
      itens: resumo,
      total: reais(itens.reduce((t, i) => t + i.preco * i.qtd, 0)),
    },
  };
}

function cabecalhosCors(req) {
  const origem = req.headers.get('origin');
  const h = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' };
  if (origem && ORIGENS.includes(origem)) {
    h['Access-Control-Allow-Origin'] = origem;
    h['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export default async (req) => {
  const cab = cabecalhosCors(req);
  const responder = (status, dados) => new Response(JSON.stringify(dados), { status, headers: cab });
  const token = process.env.MP_ACCESS_TOKEN;

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cab });
  // GET serve para conferir se a função está no ar e configurada
  if (req.method === 'GET') return responder(200, { ok: true, configurado: Boolean(token) });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });
  if (!token) return responder(503, { erro: 'O pagamento online ainda não foi configurado.' });

  let pedido;
  try {
    pedido = validar(await req.json());
  } catch (erro) {
    return responder(400, { erro: erro instanceof ErroPedido ? erro.message : 'Pedido inválido.' });
  }

  const numero = numeroDoPedido();
  const corpo = montarPreferencia(pedido, numero, await restricoes(token, pedido.metodo));

  let r;
  let dados;
  try {
    r = await fetch(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(corpo),
    });
    dados = await r.json().catch(() => ({}));
  } catch (erro) {
    console.error('Falha ao falar com o Mercado Pago:', erro.message);
    return responder(502, { erro: 'Não foi possível abrir o pagamento agora.' });
  }
  if (!r.ok) {
    console.error('Mercado Pago recusou a preferência:', r.status, JSON.stringify(dados).slice(0, 800));
    return responder(502, { erro: 'Não foi possível abrir o pagamento agora.' });
  }

  // credenciais de teste usam o checkout de testes
  const url = token.startsWith('TEST-') && dados.sandbox_init_point ? dados.sandbox_init_point : dados.init_point;
  if (!url) {
    console.error('Resposta do Mercado Pago sem link de pagamento:', JSON.stringify(dados).slice(0, 800));
    return responder(502, { erro: 'Não foi possível abrir o pagamento agora.' });
  }
  return responder(200, { url, pedido: numero });
};

export const config = { path: '/api/pagamento' };
