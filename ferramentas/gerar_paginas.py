"""Gera as páginas da loja a partir de dados/produtos.json.

Uso (na pasta do projeto):  python3 ferramentas/gerar_paginas.py

Saídas:
  produtos.html, carrinho.html, finalizar.html, pedido.html, trocas.html, privacidade.html, 404.html
  index.html (só a seção de destaques), sitemap.xml, manifest.webmanifest
  assets/img/produtos/mini/*.webp  (miniaturas leves para a vitrine)
  netlify/catalogo.mjs             (preços que o servidor de pagamento usa)

Precisa do Pillow (pip install pillow) para as miniaturas e os ícones.

O cabeçalho, o menu do celular, o rodapé e o <head> vêm do index.html,
então qualquer ajuste feito lá é copiado para as outras páginas.
"""
import datetime
import html
import json
import os
import re
import unicodedata
from urllib.parse import quote

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELOS = os.path.join(RAIZ, 'ferramentas', 'modelos')
WHATS = '5521965959409'
SITE = 'https://bosco-2009.github.io/beth-modas/'
HOJE = datetime.date.today().isoformat()

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


def sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')


def miniatura(foto):
    """Cria (se faltar) a versão leve da foto para a vitrine: 600x800 em WebP."""
    nome = os.path.splitext(foto)[0] + '.webp'
    destino = os.path.join(RAIZ, 'assets', 'img', 'produtos', 'mini', nome)
    origem = os.path.join(RAIZ, 'assets', 'img', 'produtos', foto)
    if not os.path.exists(destino) or os.path.getmtime(destino) < os.path.getmtime(origem):
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        Image.open(origem).convert('RGB').resize((600, 800), Image.LANCZOS).save(destino, quality=80, method=6)
    return 'assets/img/produtos/mini/' + nome


# ---------------------------------------------------------------- dados
catalogo = json.loads(ler('dados', 'produtos.json'))['produtos']
ordem = [c for c, _ in CATEGORIAS]
for p in catalogo:
    assert p['cat'] in ordem, f'categoria desconhecida: {p["cat"]}'
produtos = sorted(catalogo, key=lambda p: ordem.index(p['cat']))
for p in produtos:
    p['preco_txt'] = reais(p['preco'])
    p['mini'] = miniatura(p['foto'])
    p['busca'] = sem_acento(p['nome'] + ' ' + p['categoria'])
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


def cabeca(titulo, descricao, arquivo, indexar=True):
    h = HEAD.replace('<title>Beth Modas | Loja de roupas</title>', f'<title>{titulo} | Beth Modas</title>')
    h = h.replace(f'content="{DESC_INDEX}"', f'content="{esc(descricao)}"')
    h = h.replace('<meta property="og:title" content="Beth Modas | Loja de roupas">',
                  f'<meta property="og:title" content="{titulo} | Beth Modas">')
    h = h.replace('<link rel="canonical" href="https://bosco-2009.github.io/beth-modas/">',
                  f'<link rel="canonical" href="https://bosco-2009.github.io/beth-modas/{arquivo}">')
    if not indexar:
        h = h.replace('<meta name="viewport"', '<meta name="robots" content="noindex">\n<meta name="viewport"', 1)
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
    for ancora in ('sobre', 'como-comprar', 'instagram', 'duvidas', 'contato'):
        r = r.replace(f'<li><a href="#{ancora}">', f'<li><a href="index.html#{ancora}">')
    r = r.replace('<a class="rodape__subir" href="#inicio">', '<a class="rodape__subir" href="#conteudo">')
    assert 'href="#' not in r.replace('href="#conteudo"', ''), 'link interno sobrando no rodapé'
    return r


def pagina(arquivo, titulo, descricao, atual, principal, extra='', flutuante=True, indexar=True, cabeca_extra='', base=''):
    # no carrinho e na finalização o botão flutuante cobriria o total no celular
    h = cabeca(titulo, descricao, arquivo, indexar).replace('</head>', cabeca_extra + '</head>')
    if base:
        # o <base> precisa vir antes de qualquer endereço relativo (CSS, fontes, ícones)
        h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="' + base + '">', 1)
    conteudo = (h + '\n<body>\n<a class="pular" href="#conteudo">Pular para o conteúdo</a>\n\n'
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
TAMANHOS_IMG = '(min-width: 1100px) 290px, (min-width: 640px) 31vw, 46vw'


def cartao(p, i, na_vitrine=True):
    """Card de produto. Na vitrine a foto abre os detalhes; nos destaques leva à página de produtos."""
    num = p['ref'].split('-')[1]
    nome = esc(p['nome'])
    img = (f'<img src="{p["mini"]}" srcset="{p["mini"]} 600w, assets/img/produtos/{p["foto"]} 900w" sizes="{TAMANHOS_IMG}" '
           f'alt="{nome}" width="900" height="1200" loading="{"eager" if na_vitrine and i < 2 else "lazy"}" decoding="async">')
    miolo = f'''<span class="sr">Ver detalhes: </span>
          {img}
          <span class="etiqueta" aria-hidden="true">
            <span class="etiqueta__furo"></span>
            <span class="etiqueta__rotulo">ref.</span><span class="etiqueta__valor">{num}</span>
          </span>
          <span class="peca__ver" aria-hidden="true">{svg_ver}Ver detalhes</span>'''
    if na_vitrine:
        foto = f'<button type="button" class="peca__foto" data-abrir-peca="{p["ref"]}">\n          {miolo}\n        </button>'
    else:
        foto = f'<a class="peca__foto" href="produtos.html#{p["ref"]}">\n          {miolo}\n        </a>'
    return f'''
      <li class="peca" data-ref="{p['ref']}" data-categoria="{p['cat']}" data-preco="{p['preco']:.2f}" data-busca="{esc(p['busca'])}" style="--i:{i}">
        {foto}
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


cartoes = ''.join(cartao(p, i) for i, p in enumerate(produtos))

dados = [dict(ref=p['ref'], nome=p['nome'], categoria=p['categoria'], descricao=p['descricao'], preco=p['preco_txt'],
              valor=p['preco'], tamanhos=p['tamanhos'], foto='assets/img/produtos/' + p['foto'], mini=p['mini'], w=900, h=1200,
              whatsapp=p['whatsapp']) for p in produtos]

# dados de produto para o Google (preço em reais em cada item)
lista_google = {
    '@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Produtos Beth Modas',
    'itemListElement': [{
        '@type': 'ListItem', 'position': i + 1,
        'item': {
            '@type': 'Product', 'name': p['nome'], 'sku': p['ref'], 'category': p['categoria'],
            'description': p['descricao'], 'image': SITE + 'assets/img/produtos/' + p['foto'],
            'url': SITE + 'produtos.html#' + p['ref'],
            'offers': {'@type': 'Offer', 'price': f"{p['preco']:.2f}", 'priceCurrency': 'BRL',
                       'url': SITE + 'produtos.html#' + p['ref']},
        },
    } for i, p in enumerate(produtos)],
}
svg_lupa = ('<svg class="icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">'
            '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></g></svg>')

pagina('produtos.html', 'Produtos',
       'Vestidos, blusas, tops, calças, combos, bolsas de couro e mais da Beth Modas, com preços. Compre pelo site ou pelo WhatsApp (21) 96595-9409.',
       'produtos.html', f'''<section class="vitrine secao secao--branca secao--pagina" id="produtos" aria-labelledby="produtos-titulo">
  <div class="container">
    <div class="secao__cabeca secao__cabeca--linha">
      <h1 class="secao__titulo" id="produtos-titulo">Produtos</h1>
      <p class="secao__texto">Toque na foto para ver os detalhes. Coloque no carrinho e finalize a compra com Pix, boleto ou cartão.</p>
    </div>

    <div class="vitrine__ferramentas">
      <label class="busca">
        <span class="sr">Buscar produto</span>
        {svg_lupa}
        <input type="search" placeholder="Buscar produto" autocomplete="off" enterkeyhint="search" data-busca>
      </label>
      <label class="ordenar">
        <span class="ordenar__rotulo">Ordenar</span>
        <select data-ordenar>
          <option value="padrao">Por categoria</option>
          <option value="menor">Menor preço</option>
          <option value="maior">Maior preço</option>
        </select>
      </label>
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
    <div class="vitrine__vazia" data-vazia hidden>
      <p>Nenhum produto encontrado.</p>
      <button type="button" class="botao botao--contorno" data-limpar-busca>Ver todos os produtos</button>
    </div>

    <div class="vitrine__mais" data-mais-area hidden>
      <button type="button" class="botao botao--contorno" data-mais>Ver mais produtos</button>
    </div>
  </div>
</section>
''', extra=janela + '\n<script type="application/json" id="dados-pecas">' + json.dumps(dados, ensure_ascii=False) + '</script>\n',
       cabeca_extra='<script type="application/ld+json">' + json.dumps(lista_google, ensure_ascii=False) + '</script>\n')

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
''', flutuante=False, indexar=False)

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
          <label class="lembrar"><input type="checkbox" name="lembrar" data-lembrar> Lembrar meus dados neste aparelho para a próxima compra</label>
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
              <input name="cep" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" maxlength="9" aria-describedby="cep-status"></label>
            <p class="campo__ajuda" id="cep-status" data-cep-status aria-live="polite">Digite o CEP e o endereço é preenchido sozinho.</p>
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
        <p class="resumo__termos">Ao continuar, você concorda com as <a href="trocas.html">trocas e devoluções</a> e a <a href="privacidade.html">política de privacidade</a>.</p>
        <a class="resumo__voltar" href="carrinho.html">Voltar ao carrinho</a>
      </aside>
    </form>
  </div>
</section>
''', flutuante=False, indexar=False)

# ---------------------------------------------------------------- pedido.html
pagina('pedido.html', 'Pedido', 'Situação do seu pedido na Beth Modas.', '', f'''<section class="pedido secao secao--branca secao--pagina" aria-labelledby="pedido-titulo">
  <div class="container pedido__caixa" data-pedido>
    <span class="pedido__selo" data-pedido-selo aria-hidden="true"></span>
    <h1 class="secao__titulo" id="pedido-titulo" data-pedido-titulo>Seu pedido</h1>
    <p class="pedido__texto" data-pedido-texto></p>
    <p class="pedido__numero" data-pedido-numero hidden>Número do pedido: <strong></strong></p>
    <div class="pedido__resumo" data-pedido-resumo hidden>
      <ul class="pedido__itens" data-pedido-itens></ul>
      <p class="pedido__total">Total: <strong data-pedido-total></strong></p>
    </div>
    <div class="pedido__acoes">
      <a class="botao" href="https://wa.me/{WHATS}" target="_blank" rel="noopener" data-pedido-whats>{svg_whats}Avisar a loja pelo WhatsApp</a>
      <a class="botao botao--contorno" href="produtos.html" data-pedido-voltar>Continuar comprando</a>
    </div>
  </div>
</section>
''', indexar=False)

# ---------------------------------------------------------------- trocas.html e privacidade.html
def documento(arquivo, titulo, descricao, intro, blocos):
    corpo = ''.join(f'\n    <h2>{t}</h2>\n' + ''.join(f'    {p}\n' for p in ps) for t, ps in blocos)
    pagina(arquivo, titulo, descricao, '', f'''<section class="documento secao secao--branca secao--pagina" aria-labelledby="doc-titulo">
  <div class="container documento__texto">
    <h1 class="secao__titulo" id="doc-titulo">{titulo}</h1>
    <p class="documento__intro">{intro}</p>{corpo}
    <p class="documento__data">Atualizado em {datetime.date.today().strftime('%d/%m/%Y')}.</p>
  </div>
</section>
''')


WHATS_TXT = f'<a href="https://wa.me/{WHATS}" target="_blank" rel="noopener">WhatsApp (21) 96595-9409</a>'

documento('trocas.html', 'Trocas e devoluções', 'Como trocar ou devolver uma compra feita na Beth Modas.',
          f'Queremos que você fique feliz com a sua compra. Para trocar ou devolver, fale com a loja pelo {WHATS_TXT} e informe o número do pedido.',
          [
              ('Desistência da compra', [
                  '<p>Nas compras feitas pelo site ou pelo WhatsApp, você pode desistir em até <strong>7 dias corridos</strong> depois de receber o produto, sem precisar explicar o motivo. Esse direito é garantido pelo artigo 49 do Código de Defesa do Consumidor.</p>',
                  '<p>Basta avisar a loja dentro desse prazo e devolver o produto. O valor pago é devolvido por completo.</p>',
              ]),
              ('Produto com defeito', [
                  '<p>Se a peça chegar com defeito, avise a loja e, se puder, mande fotos. O prazo para reclamar segue o artigo 26 do Código de Defesa do Consumidor: 30 dias para produtos não duráveis e 90 dias para produtos duráveis, contados da entrega.</p>',
              ]),
              ('Troca de tamanho ou cor', [
                  '<p>Fale com a loja pelo WhatsApp para ver se o tamanho ou a cor que você quer está disponível e combinar a troca.</p>',
                  '<p>Dica: guarde a peça sem uso e com a etiqueta até ter certeza de que serviu.</p>',
              ]),
              ('Como recebo o dinheiro de volta', [
                  '<p>O valor volta pela mesma forma de pagamento da compra: no Pix e no boleto, por transferência; no cartão, pelo estorno na fatura ou na conta.</p>',
              ]),
          ])

documento('privacidade.html', 'Política de privacidade', 'Como a Beth Modas usa os seus dados.',
          'Esta página explica quais dados a Beth Modas recebe quando você compra pelo site e o que é feito com eles, conforme a Lei Geral de Proteção de Dados (LGPD).',
          [
              ('Quais dados recebemos', [
                  '<p>Na finalização da compra: nome, WhatsApp, e-mail e, se você escolher receber em casa, o endereço de entrega.</p>',
              ]),
              ('Para que usamos', [
                  '<p>Para registrar e entregar o seu pedido, processar o pagamento e falar com você sobre a compra. Não enviamos propaganda sem a sua autorização e nunca vendemos os seus dados.</p>',
              ]),
              ('Pagamento', [
                  '<p>O pagamento é feito na página do Mercado Pago, que recebe os dados do pedido para cobrar. Os dados do cartão são digitados direto no Mercado Pago: a Beth Modas não tem acesso a eles.</p>',
              ]),
              ('O que fica guardado no seu aparelho', [
                  '<p>Os produtos do carrinho ficam salvos no seu navegador. Se você marcar "Lembrar meus dados", o nome, o contato e o endereço também ficam salvos, só neste aparelho. Para apagar, desmarque a opção na próxima compra ou limpe os dados de navegação.</p>',
                  '<p>O site não usa cookies de propaganda nem de rastreamento. Os servidores que hospedam o site podem registrar dados técnicos de acesso, como o endereço IP, por segurança.</p>',
              ]),
              ('Seus direitos', [
                  f'<p>Você pode pedir para ver, corrigir ou apagar os seus dados a qualquer momento pelo {WHATS_TXT}.</p>',
              ]),
          ])

# ---------------------------------------------------------------- 404.html
# o GitHub Pages mostra esta página para endereços que não existem; o <base> mantém os links certos
pagina('404.html', 'Página não encontrada', 'Página não encontrada.', '', '''<section class="pedido secao secao--branca secao--pagina" aria-labelledby="erro-titulo">
  <div class="container pedido__caixa">
    <span class="pedido__selo pedido__selo--espera" aria-hidden="true"></span>
    <h1 class="secao__titulo" id="erro-titulo">Página não encontrada</h1>
    <p class="pedido__texto">O endereço pode ter mudado. Que tal ver os produtos da loja?</p>
    <div class="pedido__acoes">
      <a class="botao" href="produtos.html">Ver produtos</a>
      <a class="botao botao--contorno" href="index.html">Ir para o início</a>
    </div>
  </div>
</section>
''', indexar=False, base='/beth-modas/')

# ---------------------------------------------------------------- destaques na página inicial
destaques = [p for p in produtos if p.get('destaque')][:4]
assert destaques, 'marque produtos com "destaque": true em dados/produtos.json'
secao_destaques = f'''<section class="destaques secao secao--branca" id="destaques" aria-labelledby="destaques-titulo">
  <div class="container">
    <div class="secao__cabeca secao__cabeca--linha">
      <h2 class="secao__titulo" id="destaques-titulo">Destaques</h2>
      <p class="secao__texto">Algumas peças da loja. Toque para ver os detalhes ou coloque direto no carrinho.</p>
    </div>
    <ul class="vitrine__grade destaques__grade">{''.join(cartao(p, i, na_vitrine=False) for i, p in enumerate(destaques))}
    </ul>
    <div class="destaques__acao">
      <a class="botao botao--grande" href="produtos.html">Ver todos os produtos</a>
    </div>
  </div>
</section>'''
novo_idx, n = re.subn(r'<section class="destaques secao[^"]*" id="destaques".*?</section>', lambda m: secao_destaques, idx, flags=re.S)
assert n == 1, 'seção de destaques não encontrada no index.html'
gravar(novo_idx, 'index.html')

# ---------------------------------------------------------------- sitemap e "app" na tela inicial
gravar('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
       + ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{HOJE}</lastmod></url>\n'
                 for u in ('', 'produtos.html', 'trocas.html', 'privacidade.html'))
       + '</urlset>\n', 'sitemap.xml')

for lado in (192, 512):
    destino = os.path.join(RAIZ, 'assets', 'img', f'icone-{lado}.png')
    if not os.path.exists(destino):
        logo = Image.open(os.path.join(RAIZ, 'assets', 'img', 'logo-grande.webp')).convert('RGBA')
        alvo = round(lado * .8)
        logo = logo.resize((round(logo.width * alvo / logo.height), alvo), Image.LANCZOS)
        fundo = Image.new('RGBA', (lado, lado), (255, 255, 255, 255))
        fundo.alpha_composite(logo, ((lado - logo.width) // 2, (lado - logo.height) // 2))
        fundo.convert('RGB').save(destino, optimize=True)
gravar(json.dumps({
    'name': 'Beth Modas', 'short_name': 'Beth Modas', 'lang': 'pt-BR',
    'description': 'Moda feminina: vestidos, blusas, bolsas de couro e mais.',
    'start_url': './', 'scope': './', 'display': 'standalone',
    'background_color': '#ffffff', 'theme_color': '#d6246e',
    'icons': [{'src': f'assets/img/icone-{l}.png', 'sizes': f'{l}x{l}', 'type': 'image/png', 'purpose': 'any'} for l in (192, 512)],
}, ensure_ascii=False, indent=2) + '\n', 'manifest.webmanifest')

# ---------------------------------------------------------------- preços para o servidor de pagamento
servidor = {p['ref']: dict(nome=p['nome'], preco=p['preco'], tamanhos=p['tamanhos'], foto=p['foto']) for p in catalogo}
gravar('// Gerado por ferramentas/gerar_paginas.py a partir de dados/produtos.json. Não edite à mão.\n'
       'export default ' + json.dumps(servidor, ensure_ascii=False, indent=2) + ';\n',
       'netlify', 'catalogo.mjs')
