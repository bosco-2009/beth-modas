# Como ativar o pagamento online da Beth Modas

O site já tem carrinho e finalização da compra com Pix, boleto, cartão de crédito e cartão de débito.
Enquanto o pagamento online não estiver ativado, o botão final envia o pedido para a loja pelo WhatsApp.

O pagamento roda no próprio HostGator (`api/pagamento.php`), no endereço https://bethmodas.com.
Só falta a conta no **Mercado Pago**, que recebe os pagamentos numa página segura e deposita na conta da loja.

## 1. Mercado Pago

1. Crie a conta da loja em https://www.mercadopago.com.br (pode ser como pessoa física ou com CNPJ).
2. **Cadastre uma chave Pix na conta.** Sem ela, o Pix não aparece para a cliente.
3. Entre em https://www.mercadopago.com.br/developers/panel/app e crie uma aplicação
   (por exemplo, "Site Beth Modas"; tipo de pagamento: pagamentos online / Checkout Pro).
4. Na aplicação, abra **Credenciais**:
   - em **Teste**, o **Access Token** começa com `TEST-`: serve para a compra de teste;
   - em **Produção**, o **Access Token** começa com `APP_USR-`: é o que recebe dinheiro de verdade.
   O Access Token é secreto: não mande por WhatsApp, e-mail ou chat, nem publique em lugar nenhum.

## 2. Guardar a chave no GitHub

No repositório **beth-modas**, abra **Settings → Secrets and variables → Actions → New repository secret**:

- Name: `MP_ACCESS_TOKEN`
- Secret: o Access Token **de teste** (o que começa com `TEST-`)

A cada publicação, o GitHub grava a chave só no servidor, em `api/config-segredo.php`.
Esse arquivo não vai para o GitHub e o `.htaccess` bloqueia o acesso a ele pelo navegador.

Depois de salvar o segredo, a chave passa a valer na próxima publicação
(ou em **Actions → Publicar no bethmodas.com → Run workflow**).

## 3. Compra de teste

Com a chave de teste, as clientes continuam vendo o envio pelo WhatsApp: o pagamento online só aparece em
**https://bethmodas.com/finalizar.html?teste=1**. Coloque um produto no carrinho, abra esse endereço e pague com
um cartão de teste do Mercado Pago:

- Cartão: Mastercard `5480 8328 0103 3311`, código `123`, validade `11/30`
- Nome do titular: `APRO` (pagamento aprovado) ou `OTHE` (pagamento recusado)
- CPF: `12345678909`

## 4. Ligar para todas as clientes

No GitHub, abra o segredo `MP_ACCESS_TOKEN` (ícone de lápis), cole o Access Token **de produção**
(o que começa com `APP_USR-`) e salve. Depois rode a publicação de novo.
A partir daí, o botão final vira **Ir para o pagamento** para todas as clientes, e os pagamentos são reais.

Para desligar o pagamento online, apague o segredo `MP_ACCESS_TOKEN` e publique de novo:
a finalização volta sozinha para o envio pelo WhatsApp.

## Onde ver os pedidos

- Cada pagamento aparece na conta Mercado Pago da loja (app ou site), com o número do pedido (`BM...`),
  os produtos, o nome, o WhatsApp, o e-mail e o endereço da cliente.
- Depois de pagar, a cliente vê um botão para avisar a loja pelo WhatsApp com o resumo do pedido.

## Para quem for mexer no código

- Produtos e preços: `dados/produtos.json`. Depois de editar, rode `python3 ferramentas/gerar_paginas.py`.
  O `api/pagamento.php` lê os preços direto desse arquivo: o navegador só informa produto, tamanho e quantidade.
- Pagamento: `api/pagamento.php` (PHP 7.4 ou mais novo, com cURL).
  Testes: `node --test ferramentas/testes/pagamento.test.mjs` (precisa do PHP instalado).
- A finalização (`assets/js/loja.js`) consulta `GET /api/pagamento.php` e só mostra **Ir para o pagamento**
  quando a chave está configurada. Com a chave de teste, só em `?teste=1`.
- O HostGator responde 409 com um cookie de verificação (`humans_...`) na primeira chamada a um `.php`;
  o `loja.js` grava esse cookie e repete a chamada uma vez.
