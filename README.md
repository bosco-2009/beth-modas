# Beth Modas — site da loja

Site da Beth Modas: https://bosco-2009.github.io/beth-modas/

- Página inicial com a logo, as cores da marca (pink, branco e dourado) e o carrossel de fotos.
- `produtos.html`: produtos com preço, filtros por categoria e botão de colocar no carrinho.
- `carrinho.html` e `finalizar.html`: carrinho e finalização da compra (Pix, boleto, cartão de crédito ou débito).
- `pedido.html`: situação do pedido depois do pagamento.

O pagamento online usa o Mercado Pago. Para ativar, siga o [PAGAMENTO.md](PAGAMENTO.md);
enquanto não estiver ativado, a finalização envia o pedido para a loja pelo WhatsApp (21) 96595-9409.

Produtos e preços ficam em `dados/produtos.json`; depois de editar, rode `python3 ferramentas/gerar_paginas.py`.
