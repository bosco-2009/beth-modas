# Beth Modas — site da loja

Site da Beth Modas: https://bethmodas.com (hospedado no HostGator).
Uma cópia continua em https://bosco-2009.github.io/beth-modas/.

- Página inicial com a logo, as cores da marca (pink, branco e dourado) e o carrossel de fotos.
- `produtos.html`: produtos com preço, filtros por categoria e botão de colocar no carrinho.
- `carrinho.html` e `finalizar.html`: carrinho e finalização da compra (Pix, boleto, cartão de crédito ou débito).
- `pedido.html`: situação do pedido depois do pagamento.

O pagamento online usa o Mercado Pago. Para ativar, siga o [PAGAMENTO.md](PAGAMENTO.md);
enquanto não estiver ativado, a finalização envia o pedido para a loja pelo WhatsApp (21) 96595-9409.

Produtos e preços ficam em `dados/produtos.json`; depois de editar, rode `python3 ferramentas/gerar_paginas.py`.

## Publicação no bethmodas.com

Cada mudança aprovada no `main` é enviada sozinha para o HostGator pelo GitHub Actions
(`.github/workflows/publicar-hostgator.yml`). Para isso funcionar, é preciso cadastrar o acesso FTP uma vez:

1. No cPanel do HostGator, abra **Contas de FTP** e crie uma conta (por exemplo, `publicar`).
   No campo **Diretório**, apague o que vier preenchido e deixe só `public_html`.
   Crie uma senha forte e anote. Na mesma tela, em **Configurar cliente FTP**, anote o **Servidor FTP**.
2. No GitHub, abra o repositório **beth-modas → Settings → Secrets and variables → Actions → New repository secret**
   e crie três segredos:
   - `FTP_SERVIDOR`: o servidor FTP (por exemplo, `ftp.bethmodas.com`)
   - `FTP_USUARIO`: o usuário completo (por exemplo, `publicar@bethmodas.com`)
   - `FTP_SENHA`: a senha da conta FTP
3. Em **Actions → Publicar no bethmodas.com → Run workflow**, rode a primeira publicação.

A senha fica guardada só no GitHub, criptografada: não aparece no site nem no código.
Só os arquivos do site vão para o servidor (as pastas `ferramentas/`, `netlify/` e a documentação ficam fora).

O `.htaccess` (gerado pelo `ferramentas/gerar_paginas.py`) mostra a página 404 da loja e leva
`http://` e `www.` para `https://bethmodas.com`.
