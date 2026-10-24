"""Gera as páginas da loja a partir de dados/produtos.json.

Uso (na pasta do projeto):  python3 ferramentas/gerar_paginas.py

Saídas:
  produtos.html, carrinho.html, finalizar.html, pedido.html
  netlify/catalogo.mjs             (preços que o servidor de pagamento usa)

O cabeçalho, o menu do celular, o rodapé e o <head> vêm do index.html,
então qualquer ajuste feito lá é copiado para as outras páginas.
"""
import html
import json
import os
import re
from urllib.parse import quote

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELOS = os.path.join(RAIZ, 'ferramentas', 'modelos')
WHATS = '5521965959409'

# ordem das categorias nos filtros e na vitrine
CATEGORIAS = [
    ('vestidos', 'Vestidos'), ('blusas', 'Blusas'), ('tops', 'Tops'), ('calcas', 'Calças'),
    ('combos', 'Combos'), ('bolsas', 'Bolsas'), ('beleza', 'Beleza'), ('cuidados', 'Cuidados'),
]


def ler(*caminho):
    with open(os.path.join(RAIZ, *caminho), encoding='utf-8') as f:
        return f.read()


def gravar(conteudo, *caminho):
    destino = os.path.join(RAIZ, *caminho)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(conteudo)
    print(os.path.relpath(destino, RAIZ), len(conteudo), 'bytes')


def pega(padrao, texto):
    m = re.search(padrao, texto, re.S)
    assert m, 'não achei: ' + padrao[:60]
    return m.group(0)


def reais(valor):
    inteiro, centavos = f'{valor:.2f}'.split('.')
    return 'R$ ' + f'{int(inteiro):,}'.replace(',', '.') + ',' + centavos


def esc(texto):
    return html.escape(texto, quote=True)


# ---------------------------------------------------------------- dados
catalogo = json.loads(ler('dados', 'produtos.json'))['produtos']
ordem = [c for c, _ in CATEGORIAS]
for p in catalogo:
    assert p['cat'] in ordem, f'categoria desconhecida: {p["cat"]}'
produtos = sorted(catalogo, key=lambda p: ordem.index(p['cat']))
for p in produtos:
    p['preco_txt'] = reais(p['preco'])
    msg = f'Olá, Beth Modas! Vi no site o produto *{p["nome"]}* ({p["preco_txt"]}, ref. {p["ref"]}) e queria saber mais.'
    p['whatsapp'] = f'https://wa.me/{WHATS}?text=' + quote(msg, safe='')

svg_whats = ler('ferramentas', 'modelos', 'icone-whatsapp.svg')
svg_ver = ler('ferramentas', 'modelos', 'icone-ver.svg')
svg_carrinho = ler('ferramentas', 'modelos', 'icone-carrinho.svg')
janela = ler('ferramentas', 'modelos', 'janela-detalhes.html')
svg_cadeado = ('<svg class="icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">'
               '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
               '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></g></svg>')

# ---------------------------------------------------------------- partes comuns (do index.html)
idx = ler('index.html')
HEAD = pega(r'<!DOCTYPE html>.*?</head>', idx)
HEAD = re.sub(r'<link rel="preload" href="assets/img/fotos/carrossel-1\.jpg[^>]*>\n', '', HEAD)
HEAD = re.sub(r'<script type="application/ld\+json">.*?</script>\n', '', HEAD, flags=re.S)
DESC_INDEX = re.search(r'<meta name="description" content="([^"]*)">', HEAD).group(1)
SCRIPTS = pega(r'<script src="assets/js/site\.js\?v=\d+" defer></script>\n<script src="assets/js/loja\.js\?v=\d+" defer></script>', idx)
FLUTUANTE = pega(r'<a class="whats-flutuante".*?</a>\n', idx)

LINKS = [('index.html', 'Início'), ('produtos.html', 'Produtos'), ('index.html#sobre', 'Sobre'),
         ('index.html#como-comprar', 'Como comprar'), ('index.html#contato', 'Contato')]


def cabeca(titulo, descricao, arquivo):
    h = HEAD.replace('<title>Beth Modas | Loja de roupas</title>', f'<title>{titulo} | Beth Modas</title>')
    h = h.replace(f'content="{DESC_INDEX}"', f'content="{esc(descricao)}"')
    h = h.replace('<meta property="og:title" content="Beth Modas | Loja de roupas">',
                  f'<meta property="og:title" content="{titulo} | Beth Modas">')
    h = h.replace('<link rel="canonical" href="https://bosco-2009.github.io/beth-modas/">',
                  f'<link rel="canonical" href="https://bosco-2009.github.io/beth-modas/{arquivo}">')
    assert f'<title>{titulo} | Beth Modas</title>' in h and 'carrossel' not in h
    return h


def cabecalho(atual):
    cab = pega(r'<header class="cabecalho">.*?</header>', idx)
    cab = cab.replace('<a class="marca" href="#inicio"', '<a class="marca" href="index.html"')
    itens = ''.join(
        f'\n                <li><a class="menu__link{" is-atual" if href == atual else ""}" href="{href}"'
        f'{" aria-current=" + chr(34) + "page" + chr(34) if href == atual else ""}>{nome}</a></li>'
        for href, nome in LINKS)
    cab = re.sub(r'<ul class="menu__lista">.*?</ul>', f'<ul class="menu__lista">{itens}\n              </ul>', cab, flags=re.S)
    movel = pega(r'<div class="menu-movel" id="menu-movel" hidden>.*?\n</div>\n', idx)
    itens = ''.join(
        f'\n      <li style="--i:{i}"><a class="menu-movel__link" href="{href}"'
        f'{" aria-current=" + chr(34) + "page" + chr(34) if href == atual else ""}>{nome}</a></li>'
        for i, (href, nome) in enumerate(LINKS + [('carrinho.html', 'Carrinho')]))
    movel = re.sub(r'<nav class="menu-movel__nav" aria-label="Menu">.*?</nav>',
                   f'<nav class="menu-movel__nav" aria-label="Menu">\n    <ul>{itens}\n    </ul>\n  </nav>', movel, flags=re.S)
    return cab + '\n\n' + movel


def rodape():
    r = pega(r'<footer class="rodape">.*?</footer>', idx)
    r = r.replace('<a class="marca" href="#inicio"', '<a class="marca" href="index.html"')
    r = r.replace('<li><a href="produtos.html">Produtos</a></li>', '<li><a href="produtos.html">Produtos</a></li>\n        <li><a href="carrinho.html">Carrinho</a></li>')
    for ancora in ('sobre', 'como-comprar', 'instagram', 'contato'):
        r = r.replace(f'<li><a href="#{ancora}">', f'<li><a href="index.html#{ancora}">')
    r = r.replace('<a class="rodape__subir" href="#inicio">', '<a class="rodape__subir" href="#conteudo">')
    assert 'href="#' not in r.replace('href="#conteudo"', ''), 'link interno sobrando no rodapé'
    return r


def pagina(arquivo, titulo, descricao, atual, principal, extra='', flutuante=True):
    # no carrinho e na finalização o botão flutuante cobriria o total no celular
    conteudo = (cabeca(titulo, descricao, arquivo) + '\n<body>\n<a class="pular" href="#conteudo">Pular para o conteúdo</a>\n\n'
                '<div class="fita" aria-hidden="true"><span class="fita__progresso"></span></div>\n\n'
                + cabecalho(atual) + '<main id="conteudo">\n' + principal + '</main>\n' + rodape() + '\n\n'
                + (FLUTUANTE if flutuante else '') + extra + SCRIPTS + '\n</body>\n</html>\n')
    gravar(conteudo, arquivo)


# ---------------------------------------------------------------- produtos.html
cont = {}
for p in produtos:
    cont[p['cat']] = cont.get(p['cat'], 0) + 1
botoes = ''.join(f'''
                <button type="button" class="filtro" data-filtro="{k}" aria-pressed="false">{n} <span class="filtro__qtd">{cont[k]}</span></button>'''
                 for k, n in CATEGORIAS if k in cont)
cartoes = ''
for i, p in enumerate(produtos):
    num = p['ref'].split('-')[1]
    nome = esc(p['nome'])
    cartoes += f'''
      <li class="peca" data-ref="{p['ref']}" data-categoria="{p['cat']}" style="--i:{i}">
        <button type="button" class="peca__foto" data-abrir-peca="{p['ref']}">
          <span class="sr">Ver detalhes: </span>
          <img src="assets/img/produtos/{p['foto']}" alt="{nome}" width="900" height="1200" loading="{'eager' if i < 2 else 'lazy'}" decoding="async">
          <span class="etiqueta" aria-hidden="true">
            <span class="etiqueta__furo"></span>
            <span class="etiqueta__rotulo">ref.</span><span class="etiqueta__valor">{num}</span>
          </span>
          <span class="peca__ver" aria-hidden="true">{svg_ver}Ver detalhes</span>
        </button>
        <div class="peca__info">
          <div class="peca__textos">
            <h3 class="peca__nome">{nome}</h3>
            <p class="peca__categoria">{esc(p['categoria'])}</p>
            <p class="peca__preco">{p['preco_txt']}</p>
          </div>
          <a class="peca__whats" href="{p['whatsapp']}" target="_blank" rel="noopener">
            {svg_whats}<span class="sr">Pedir {nome} pelo WhatsApp</span>
          </a>
        </div>
        <button type="button" class="peca__carrinho" data-carrinho-add data-ref="{p['ref']}"{' data-tem-tamanho' if p['tamanhos'] else ''}>
          {svg_carrinho}Adicionar ao carrinho<span class="sr">: {nome}</span>
        </button>
      </li>'''

dados = [dict(ref=p['ref'], nome=p['nome'], categoria=p['categoria'], descricao=p['descricao'], preco=p['preco_txt'],
              valor=p['preco'], tamanhos=p['tamanhos'], foto='assets/img/produtos/' + p['foto'], w=900, h=1200,
              whatsapp=p['whatsapp']) for p in produtos]

pagina('produtos.html', 'Produtos',
       'Vestidos, blusas, tops, calças, combos, bolsas de couro e mais da Beth Modas, com preços. Compre pelo site ou pelo WhatsApp (21) 96595-9409.',
       'produtos.html', f'''<section class="vitrine secao secao--branca secao--pagina" id="produtos" aria-labelledby="produtos-titulo">
  <div class="container">
    <div class="secao__cabeca secao__cabeca--linha">
      <h1 class="secao__titulo" id="produtos-titulo">Produtos</h1>
      <p class="secao__texto">Toque na foto para ver os detalhes. Coloque no carrinho e finalize a compra com Pix, boleto ou cartão.</p>
    </div>

    <div class="filtros" role="group" aria-label="Filtrar produtos por categoria" data-filtros>
      <div class="filtros__lista">
        <button type="button" class="filtro is-ativo" data-filtro="todas" aria-pressed="true">Todos <span class="filtro__qtd">{len(produtos)}</span></button>{botoes}
        <span class="filtros__fio" aria-hidden="true"></span>
      </div>
    </div>
    <p class="sr" aria-live="polite" data-status></p>

    <ul class="vitrine__grade" data-grade data-inicial="24" data-revelar>{cartoes}
    </ul>

    <div class="vitrine__mais" data-mais-area hidden>
      <button type="button" class="botao botao--contorno" data-mais>Ver mais produtos</button>
    </div>
  </div>
</section>
''', extra=janela + '\n<script type="application/json" id="dados-pecas">' + json.dumps(dados, ensure_ascii=False) + '</script>\n')

# ---------------------------------------------------------------- carrinho.html
pagina('carrinho.html', 'Carrinho', 'Seu carrinho na Beth Modas.', 'carrinho.html', '''<section class="carrinho secao secao--branca secao--pagina" aria-labelledby="carrinho-titulo">
  <div class="container">
    <div class="secao__cabeca">
      <h1 class="secao__titulo" id="carrinho-titulo">Carrinho</h1>
    </div>

    <div class="carrinho__vazio" data-carrinho-vazio hidden>
      <p>Seu carrinho está vazio.</p>
      <a class="botao" href="produtos.html">Ver produtos</a>
    </div>

    <div class="carrinho__grade" data-carrinho-cheio hidden>
      <ul class="carrinho__lista" data-carrinho-lista aria-live="polite"></ul>

      <aside class="resumo" aria-labelledby="resumo-titulo">
        <h2 class="resumo__titulo" id="resumo-titulo">Resumo</h2>
        <dl class="resumo__linhas">
          <div><dt>Produtos</dt><dd data-subtotal>R$ 0,00</dd></div>
          <div><dt>Frete</dt><dd>Retirada grátis ou a combinar</dd></div>
          <div class="resumo__total"><dt>Total</dt><dd data-total>R$ 0,00</dd></div>
        </dl>
        <a class="botao botao--grande resumo__acao" href="finalizar.html">Finalizar compra</a>
        <a class="resumo__voltar" href="produtos.html">Continuar comprando</a>
      </aside>
    </div>
  </div>
</section>
''', flutuante=False)

# ---------------------------------------------------------------- finalizar.html
opcoes_pagamento = [
    ('pix', 'Pix', 'Aprovação na hora, com QR Code ou Pix copia e cola.'),
    ('boleto', 'Boleto', 'O pedido é confirmado quando o boleto for compensado, o que pode levar até 3 dias úteis.'),
    ('credito', 'Cartão de crédito', 'Pague à vista ou parcelado.'),
    ('debito', 'Cartão de débito', 'Pagamento na hora, direto da sua conta.'),
]
pagamentos = ''.join(f'''
            <label class="opcao">
              <input type="radio" name="metodo" value="{v}" required>
              <span class="opcao__caixa"><strong class="opcao__nome">{n}</strong><small class="opcao__texto">{t}</small></span>
            </label>''' for v, n, t in opcoes_pagamento)

pagina('finalizar.html', 'Finalizar compra', 'Finalize sua compra na Beth Modas com Pix, boleto, cartão de crédito ou débito.', 'carrinho.html', f'''<section class="checkout secao secao--branca secao--pagina" aria-labelledby="checkout-titulo">
  <div class="container">
    <div class="secao__cabeca">
      <h1 class="secao__titulo" id="checkout-titulo">Finalizar compra</h1>
    </div>

    <div class="carrinho__vazio" data-carrinho-vazio hidden>
      <p>Seu carrinho está vazio.</p>
      <a class="botao" href="produtos.html">Ver produtos</a>
    </div>

    <form class="checkout__grade" data-checkout novalidate hidden>
      <div class="checkout__etapas">
        <fieldset class="etapa">
          <legend class="etapa__titulo"><span class="etapa__num" aria-hidden="true">1</span>Seus dados</legend>
          <div class="campos">
            <label class="campo campo--inteiro"><span class="campo__rotulo">Nome completo</span>
              <input name="nome" type="text" autocomplete="name" maxlength="80" required></label>
            <label class="campo"><span class="campo__rotulo">WhatsApp</span>
              <input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 90000-0000" maxlength="20" required></label>
            <label class="campo"><span class="campo__rotulo">E-mail</span>
              <input name="email" type="email" autocomplete="email" maxlength="120" required></label>
          </div>
        </fieldset>

        <fieldset class="etapa">
          <legend class="etapa__titulo"><span class="etapa__num" aria-hidden="true">2</span>Como receber</legend>
          <div class="opcoes">
            <label class="opcao">
              <input type="radio" name="entrega" value="retirada" checked>
              <span class="opcao__caixa"><strong class="opcao__nome">Retirar na loja</strong><small class="opcao__texto">A loja combina o dia e o horário com você pelo WhatsApp.</small></span>
            </label>
            <label class="opcao">
              <input type="radio" name="entrega" value="entrega">
              <span class="opcao__caixa"><strong class="opcao__nome">Receber em casa</strong><small class="opcao__texto">O valor do frete é combinado com a loja pelo WhatsApp.</small></span>
            </label>
          </div>
          <div class="campos campos--endereco" data-endereco hidden>
            <label class="campo campo--curto"><span class="campo__rotulo">CEP</span>
              <input name="cep" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" maxlength="9"></label>
            <label class="campo campo--inteiro"><span class="campo__rotulo">Rua</span>
              <input name="rua" type="text" autocomplete="address-line1" maxlength="120"></label>
            <label class="campo campo--curto"><span class="campo__rotulo">Número</span>
              <input name="numero" type="text" maxlength="10"></label>
            <label class="campo"><span class="campo__rotulo">Complemento <em>(opcional)</em></span>
              <input name="complemento" type="text" autocomplete="address-line2" maxlength="60"></label>
            <label class="campo"><span class="campo__rotulo">Bairro</span>
              <input name="bairro" type="text" maxlength="60"></label>
            <label class="campo"><span class="campo__rotulo">Cidade</span>
              <input name="cidade" type="text" autocomplete="address-level2" maxlength="60"></label>
          </div>
        </fieldset>

        <fieldset class="etapa">
          <legend class="etapa__titulo"><span class="etapa__num" aria-hidden="true">3</span>Forma de pagamento</legend>
          <div class="opcoes opcoes--pagamento">{pagamentos}
          </div>
        </fieldset>
      </div>

      <aside class="resumo" aria-labelledby="resumo-titulo">
        <h2 class="resumo__titulo" id="resumo-titulo">Resumo do pedido</h2>
        <ul class="resumo__itens" data-resumo-itens></ul>
        <dl class="resumo__linhas">
          <div><dt>Produtos</dt><dd data-subtotal>R$ 0,00</dd></div>
          <div><dt>Frete</dt><dd data-frete>Retirada na loja</dd></div>
          <div class="resumo__total"><dt>Total</dt><dd data-total>R$ 0,00</dd></div>
        </dl>
        <p class="resumo__erro" data-checkout-erro role="alert" hidden></p>
        <button class="botao botao--grande resumo__acao" type="submit" data-pagar>Ir para o pagamento</button>
        <p class="resumo__seguro" data-seguro>{svg_cadeado}<span>Você será levado à página segura do Mercado Pago para pagar.</span></p>
        <a class="resumo__voltar" href="carrinho.html">Voltar ao carrinho</a>
      </aside>
    </form>
  </div>
</section>
''', flutuante=False)

# ---------------------------------------------------------------- pedido.html
pagina('pedido.html', 'Pedido', 'Situação do seu pedido na Beth Modas.', '', f'''<section class="pedido secao secao--branca secao--pagina" aria-labelledby="pedido-titulo">
  <div class="container pedido__caixa" data-pedido>
    <span class="pedido__selo" data-pedido-selo aria-hidden="true"></span>
    <h1 class="secao__titulo" id="pedido-titulo" data-pedido-titulo>Seu pedido</h1>
    <p class="pedido__texto" data-pedido-texto></p>
    <p class="pedido__numero" data-pedido-numero hidden>Número do pedido: <strong></strong></p>
    <div class="pedido__acoes">
      <a class="botao" href="https://wa.me/{WHATS}" target="_blank" rel="noopener" data-pedido-whats>{svg_whats}Avisar a loja pelo WhatsApp</a>
      <a class="botao botao--contorno" href="produtos.html" data-pedido-voltar>Continuar comprando</a>
    </div>
  </div>
</section>
''')

# ---------------------------------------------------------------- preços para o servidor de pagamento
servidor = {p['ref']: dict(nome=p['nome'], preco=p['preco'], tamanhos=p['tamanhos'], foto=p['foto']) for p in catalogo}
gravar('// Gerado por ferramentas/gerar_paginas.py a partir de dados/produtos.json. Não edite à mão.\n'
       'export default ' + json.dumps(servidor, ensure_ascii=False, indent=2) + ';\n',
       'netlify', 'catalogo.mjs')
