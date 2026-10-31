# Como ativar o pagamento online da Beth Modas

O site já tem carrinho e finalização da compra com Pix, boleto, cartão de crédito e cartão de débito.
Enquanto o pagamento online não estiver ativado, o botão final envia o pedido para a loja pelo WhatsApp.

Para o dinheiro cair direto na conta da loja, são precisos dois cadastros gratuitos:

1. **Mercado Pago**: recebe os pagamentos numa página segura e deposita na conta da loja.
2. **Netlify**: guarda a chave secreta do Mercado Pago e cria cada pagamento.
   A chave nunca pode ficar no site, porque qualquer pessoa conseguiria ler.

O site continua no mesmo endereço: https://bethmodas.com.

## 1. Mercado Pago

1. Crie a conta da loja em https://www.mercadopago.com.br (pode ser como pessoa física ou com CNPJ).
2. Entre em https://www.mercadopago.com.br/developers/panel/app e crie uma aplicação
   (por exemplo, "Site Beth Modas"; tipo de pagamento: pagamentos online / Checkout Pro).
3. Na aplicação, abra **Credenciais**:
   - em **Teste**, copie o **Access Token** de teste, para fazer uma compra de teste primeiro;
   - em **Produção**, copie o **Access Token** de produção, que é o que recebe dinheiro de verdade.
   O Access Token é secreto: não mande em grupos nem publique em lugar nenhum.

## 2. Netlify

1. Crie a conta em https://www.netlify.com entrando com o GitHub (conta **bosco-2009**).
2. Clique em **Add new site → Import an existing project → GitHub** e escolha o repositório **beth-modas**.
   Pode deixar as configurações como vierem e clicar em **Deploy**.
3. Em **Site configuration → Environment variables**, crie a variável:
   - nome: `MP_ACCESS_TOKEN`
   - valor: o Access Token do Mercado Pago (primeiro o de teste)
4. Em **Deploys**, clique em **Trigger deploy → Deploy site** para a variável valer.
5. Anote o endereço que o Netlify deu ao site, algo como `https://nome-qualquer.netlify.app`.
   Abra `https://nome-qualquer.netlify.app/api/pagamento` no navegador:
   se aparecer `{"ok":true,"configurado":true}`, a função está no ar e com a chave.

## 3. Ligar o site ao pagamento

Envie para o Claude o endereço do Netlify (passo 2.5). Ele coloca esse endereço em
`assets/js/loja.js` (linha `URL_PAGAMENTO`), e o botão final passa a abrir a página de pagamento do Mercado Pago.

## 4. Compra de teste

Com o Access Token **de teste**, faça uma compra pelo site usando um cartão de teste do Mercado Pago:

- Cartão: Mastercard `5480 8328 0103 3311`, código `123`, validade `11/30`
- Nome do titular: `APRO` (pagamento aprovado) ou `OTHE` (pagamento recusado)
- CPF: `12345678909`

Depois troque, no Netlify, o valor de `MP_ACCESS_TOKEN` pelo Access Token **de produção** e repita o passo 2.4.
A partir daí, os pagamentos são reais.

## Onde ver os pedidos

- Cada pagamento aparece na conta Mercado Pago da loja (app ou site), com o número do pedido (`BM...`),
  os produtos, o nome, o WhatsApp, o e-mail e o endereço da cliente.
- Depois de pagar, a cliente vê um botão para avisar a loja pelo WhatsApp com o resumo do pedido.

## Para quem for mexer no código

- Produtos e preços: `dados/produtos.json`. Depois de editar, rode `python3 ferramentas/gerar_paginas.py`
  para atualizar `produtos.html`, `carrinho.html`, `finalizar.html`, `pedido.html` e os preços do servidor
  (`netlify/catalogo.mjs`).
- Função de pagamento: `netlify/functions/pagamento.mjs`. Testes: `node --test ferramentas/testes/pagamento.test.mjs`.
- O servidor sempre usa o preço do catálogo; o navegador só informa produto, tamanho e quantidade.
