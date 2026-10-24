/* ==========================================================================
   BETH MODAS — interações do site
   Cortina de abertura, carrossel, arara, vitrine com filtros,
   janela de detalhes da peça e animações ligadas à rolagem.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var mqMovimento = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var EASE = 'cubic-bezier(.22,.9,.24,1)';

  function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }
  function $$(seletor, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(seletor)); }
  function reduzido() { return !!(mqMovimento && mqMovimento.matches); }
  function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function podeAnimar(el) { return !reduzido() && el && typeof el.animate === 'function'; }

  function prenderFoco(ev, elementos) {
    var focaveis = elementos.filter(function (el) {
      return el && !el.disabled && !el.hidden && el.getClientRects().length > 0;
    });
    if (!focaveis.length) return;
    var primeiro = focaveis[0];
    var ultimo = focaveis[focaveis.length - 1];
    if (ev.shiftKey && document.activeElement === primeiro) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault();
      primeiro.focus();
    }
  }

  /* ------------------------------------------------------------------
     1. Cortina de abertura (provador)
     ------------------------------------------------------------------ */
  function iniciarCortina() {
    var cortina = $('.cortina');
    var liberado = false;

    function liberar() {
      if (liberado) return;
      liberado = true;
      doc.classList.add('intro-ok');
      document.dispatchEvent(new CustomEvent('beth:intro'));
    }

    if (!cortina || doc.classList.contains('sem-cortina') || getComputedStyle(cortina).display === 'none') {
      liberar();
      return;
    }

    var inicio = Date.now();
    var aberta = false;

    function abrir() {
      if (aberta) return;
      aberta = true;
      var espera = Math.max(0, 1750 - (Date.now() - inicio));
      setTimeout(function () {
        doc.classList.add('cortina-abrindo');
        try { sessionStorage.setItem('beth-cortina', '1'); } catch (e) { /* navegação privada */ }
        setTimeout(liberar, 620);
        setTimeout(function () { doc.classList.add('cortina-aberta'); }, 1700);
      }, espera);
    }

    if (document.readyState === 'complete') {
      abrir();
    } else {
      window.addEventListener('load', abrir);
      setTimeout(abrir, 3200);
    }
  }

  /* ------------------------------------------------------------------
     2. Cabeçalho, fita métrica e menu do celular
     ------------------------------------------------------------------ */
  var cabecalho = $('.cabecalho');
  var fita = $('.fita');
  var ultimoY = window.pageYOffset;

  function atualizarCabecalho() {
    var y = window.pageYOffset;
    if (cabecalho) {
      cabecalho.classList.toggle('is-rolado', y > 24);
      if (!doc.classList.contains('menu-aberto')) {
        if (y > ultimoY + 6 && y > 520) cabecalho.classList.add('is-escondido');
        else if (y < ultimoY - 6 || y <= 520) cabecalho.classList.remove('is-escondido');
      }
    }
    ultimoY = y;
    if (fita) {
      var max = doc.scrollHeight - window.innerHeight;
      fita.style.setProperty('--p', max > 0 ? limitar(y / max, 0, 1).toFixed(4) : '0');
    }
  }

  function iniciarMenu() {
    var botao = $('.menu-botao');
    var menu = $('#menu-movel');
    var rotulo = $('[data-menu-rotulo]');
    if (!botao || !menu) return;

    function teclado(ev) {
      if (ev.key === 'Escape') fechar(false);
      if (ev.key === 'Tab') prenderFoco(ev, [botao].concat($$('a, button', menu)));
    }

    function abrir() {
      menu.hidden = false;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { doc.classList.add('menu-aberto'); });
      });
      botao.setAttribute('aria-expanded', 'true');
      if (rotulo) rotulo.textContent = 'Fechar menu';
      if (cabecalho) cabecalho.classList.remove('is-escondido');
      document.addEventListener('keydown', teclado);
      setTimeout(function () {
        var primeiro = $('.menu-movel__link', menu);
        if (primeiro) primeiro.focus({ preventScroll: true });
      }, 380);
    }

    function fechar(irParaLink) {
      doc.classList.remove('menu-aberto');
      botao.setAttribute('aria-expanded', 'false');
      if (rotulo) rotulo.textContent = 'Abrir menu';
      document.removeEventListener('keydown', teclado);
      setTimeout(function () {
        if (!doc.classList.contains('menu-aberto')) menu.hidden = true;
      }, 720);
      if (!irParaLink) botao.focus({ preventScroll: true });
    }

    botao.addEventListener('click', function () {
      if (doc.classList.contains('menu-aberto')) fechar(false);
      else abrir();
    });
    menu.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) fechar(true);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1024 && doc.classList.contains('menu-aberto')) fechar(true);
    });
  }

  function iniciarMenuAtivo() {
    var links = $$('.menu__link');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var porId = {};
    links.forEach(function (l) { porId[l.getAttribute('href').slice(1)] = l; });
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) { l.classList.remove('is-atual'); l.removeAttribute('aria-current'); });
        var ativo = porId[en.target.id];
        if (ativo) { ativo.classList.add('is-atual'); ativo.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(porId).forEach(function (id) {
      var secao = document.getElementById(id);
      if (secao) io.observe(secao);
    });
  }

  /* ------------------------------------------------------------------
     3. Carrossel da vitrine em arco
     ------------------------------------------------------------------ */
  function iniciarCarrossel() {
    var raiz = $('[data-carrossel]');
    if (!raiz) return;
    var slides = $$('.carrossel__slide', raiz);
    var total = slides.length;
    if (total < 2) return;

    var janela = $('[data-janela]', raiz);
    var legenda = $('[data-legenda]', raiz);
    var numero = $('[data-atual]', raiz);
    var progresso = $('.carrossel__progresso', raiz);
    var miniatura = $('[data-miniatura]', raiz);

    // troca sozinha a cada 2,5 s, sem parar, e volta para a primeira foto no fim
    var DURACAO = 2500;
    var atual = 0;
    var decorrido = 0;
    var anterior = null;
    var ocupado = false;
    var naTela = true;
    var introPronta = doc.classList.contains('intro-ok');

    document.addEventListener('beth:intro', function () { introPronta = true; });

    function rodando() {
      return naTela && introPronta && !document.hidden;
    }

    function atualizarLegenda() {
      var slide = slides[atual];
      var titulo = slide.getAttribute('data-titulo') || '';
      if (legenda) {
        legenda.classList.add('troca');
        setTimeout(function () {
          legenda.textContent = titulo;
          legenda.classList.remove('troca');
        }, reduzido() ? 0 : 300);
      }
      if (numero) numero.textContent = (atual + 1 < 10 ? '0' : '') + (atual + 1);
      if (miniatura) {
        var proxima = slides[(atual + 1) % total].querySelector('img');
        if (proxima) {
          miniatura.style.opacity = '0';
          setTimeout(function () {
            miniatura.src = proxima.currentSrc || proxima.src;
            miniatura.style.opacity = '1';
          }, 320);
        }
      }
    }

    function irPara(n, direcao) {
      n = (n + total) % total;
      if (n === atual || ocupado) return;
      ocupado = true;
      var sai = slides[atual];
      var entra = slides[n];
      entra.classList.toggle('vem-de-baixo', direcao < 0);
      entra.classList.add('is-entrando');
      entra.removeAttribute('aria-hidden');
      if (janela && !reduzido()) {
        janela.classList.remove('brilha');
        void janela.offsetWidth;
        janela.classList.add('brilha');
      }
      setTimeout(function () {
        sai.classList.remove('is-ativo');
        sai.setAttribute('aria-hidden', 'true');
        entra.classList.remove('is-entrando', 'vem-de-baixo');
        entra.classList.add('is-ativo');
        ocupado = false;
      }, reduzido() ? 0 : 1120);
      atual = n;
      decorrido = 0;
      atualizarLegenda();
    }

    function quadro(t) {
      if (anterior === null) anterior = t;
      var dt = Math.min(t - anterior, 100);
      anterior = t;
      if (rodando()) {
        decorrido += dt;
        if (decorrido >= DURACAO) irPara(atual + 1, 1);
      }
      if (progresso) progresso.style.transform = 'scaleX(' + limitar(decorrido / DURACAO, 0, 1).toFixed(4) + ')';
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);

    $$('[data-proxima]', raiz).forEach(function (b) {
      b.addEventListener('click', function () { irPara(atual + 1, 1); });
    });
    raiz.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); irPara(atual + 1, 1); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); irPara(atual - 1, -1); }
    });

    // deslizar com o dedo
    if (janela) {
      var x0 = null;
      var y0 = 0;
      janela.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; y0 = ev.clientY; });
      janela.addEventListener('pointercancel', function () { x0 = null; });
      janela.addEventListener('pointerup', function (ev) {
        if (x0 === null) return;
        var dx = ev.clientX - x0;
        var dy = ev.clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          irPara(atual + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
        }
      });
      janela.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entradas) {
        naTela = entradas[0].isIntersecting;
      }, { threshold: 0.25 }).observe(raiz);
    }

    // carrega as próximas fotos logo depois da página
    window.addEventListener('load', function () {
      slides.forEach(function (s) {
        var img = s.querySelector('img');
        if (img) img.loading = 'eager';
      });
    });
  }

  /* ------------------------------------------------------------------
     4. Revelações ao rolar (arara, etiquetas, títulos, palco)
     ------------------------------------------------------------------ */
  function iniciarRevelacoes() {
    var alvos = $$('[data-revelar], .secao__titulo, .peca');
    if (!('IntersectionObserver' in window) || reduzido()) {
      alvos.forEach(function (a) { a.classList.add('is-visivel'); });
      return;
    }
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.remove('aguardando');
          en.target.classList.add('is-visivel');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    // só fica "aguardando" (escondido) o que começa fora da tela;
    // o que já aparece na primeira tela é mostrado na hora
    var alturaTela = window.innerHeight;
    alvos.forEach(function (a) {
      var r = a.getBoundingClientRect();
      if (r.top < alturaTela * 0.88 && r.bottom > 0) {
        a.classList.add('is-visivel');
      } else {
        a.classList.add('aguardando');
        io.observe(a);
      }
    });
  }

  /* ------------------------------------------------------------------
     5. Vitrine: filtros com animação, "ver mais" e atalhos de categoria
     ------------------------------------------------------------------ */
  function iniciarVitrine() {
    var grade = $('[data-grade]');
    if (!grade) return;
    var pecas = $$('.peca', grade);
    var filtros = $$('.filtro');
    var caixaFiltros = $('[data-filtros]');
    var fio = $('.filtros__fio');
    var maisArea = $('[data-mais-area]');
    var maisBotao = $('[data-mais]');
    var status = $('[data-status]');
    var passo = parseInt(grade.getAttribute('data-inicial'), 10) || 12;
    var limite = passo;
    var filtro = 'todas';

    function combina(p) {
      return filtro === 'todas' || p.getAttribute('data-categoria') === filtro;
    }

    function desejado() {
      var n = 0;
      return pecas.map(function (p) {
        if (!combina(p)) return false;
        n++;
        return n <= limite;
      });
    }

    function posicao(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + window.pageXOffset, y: r.top + window.pageYOffset };
    }

    function mostrar(estado) {
      pecas.forEach(function (p, i) { p.classList.toggle('is-oculta', !estado[i]); });
    }

    function animarTroca(estado) {
      var antes = new Map();
      pecas.forEach(function (p) {
        if (!p.classList.contains('is-oculta')) antes.set(p, posicao(p));
      });
      var saindo = pecas.filter(function (p, i) { return antes.has(p) && !estado[i]; });
      var saidas = saindo.map(function (p) {
        return p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }],
          { duration: 220, easing: 'ease-in', fill: 'forwards' });
      });

      function depois() {
        saidas.forEach(function (a) { a.cancel(); });
        mostrar(estado);
        var novas = 0;
        pecas.forEach(function (p, i) {
          if (!estado[i]) return;
          var a = antes.get(p);
          if (a) {
            var b = posicao(p);
            var dx = a.x - b.x;
            var dy = a.y - b.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
              p.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
                { duration: 700, easing: EASE });
            }
          } else {
            p.animate([{ opacity: 0, transform: 'translateY(22px) scale(.97)' }, { opacity: 1, transform: 'none' }],
              { duration: 650, delay: 60 + (novas++ % 8) * 55, easing: EASE, fill: 'backwards' });
          }
        });
      }

      if (saidas.length) saidas[0].onfinish = depois;
      else depois();
    }

    function aplicar(animar) {
      var estado = desejado();
      var totalCombina = pecas.filter(combina).length;
      if (animar && podeAnimar(grade)) animarTroca(estado);
      else mostrar(estado);

      var restantes = Math.max(0, totalCombina - limite);
      if (maisArea) maisArea.hidden = restantes <= 0;
      if (maisBotao) maisBotao.textContent = 'Ver mais ' + restantes + (restantes === 1 ? ' peça' : ' peças');
      if (status) status.textContent = totalCombina + (totalCombina === 1 ? ' peça' : ' peças') + ' na vitrine';
    }

    function moverFio(suave) {
      var ativo = $('.filtro.is-ativo');
      if (!fio || !ativo) return;
      fio.style.setProperty('--x', ativo.offsetLeft + 'px');
      fio.style.setProperty('--w', ativo.offsetWidth + 'px');
      if (caixaFiltros && caixaFiltros.scrollWidth > caixaFiltros.clientWidth) {
        var alvo = ativo.offsetLeft - caixaFiltros.clientWidth / 2 + ativo.offsetWidth / 2;
        caixaFiltros.scrollTo({ left: alvo, behavior: suave && !reduzido() ? 'smooth' : 'auto' });
      }
    }

    function selecionar(chave, animar) {
      if (!filtros.some(function (f) { return f.getAttribute('data-filtro') === chave; })) chave = 'todas';
      filtro = chave;
      limite = passo;
      filtros.forEach(function (f) {
        var ativo = f.getAttribute('data-filtro') === chave;
        f.classList.toggle('is-ativo', ativo);
        f.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      });
      moverFio(true);
      aplicar(animar);
    }

    filtros.forEach(function (f) {
      f.addEventListener('click', function () { selecionar(f.getAttribute('data-filtro'), true); });
    });

    if (maisBotao) {
      maisBotao.addEventListener('click', function () {
        limite += passo;
        aplicar(true);
      });
    }

    // atalhos: cabides da arara e itens da faixa
    document.addEventListener('click', function (ev) {
      var link = ev.target.closest('a[data-filtro]');
      if (!link) return;
      ev.preventDefault();
      selecionar(link.getAttribute('data-filtro'), false);
      var vitrine = document.getElementById('vitrine');
      if (vitrine) vitrine.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth', block: 'start' });
    });

    window.addEventListener('resize', function () { moverFio(false); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moverFio(false); });
    moverFio(false);
    aplicar(false);
  }

  /* ------------------------------------------------------------------
     6. Janela de detalhes da peça (e foto ampliada dos looks)
     ------------------------------------------------------------------ */
  function iniciarModal() {
    var modal = $('#modal');
    if (!modal) return;
    var caixa = $('.modal__caixa', modal);
    var fundo = $('.modal__fundo', modal);
    var figura = $('[data-m-foto]', modal);
    var moldura = $('.modal__moldura', modal);
    var img = $('[data-m-img]', modal);
    var info = $('.modal__info', modal);
    var botaoFechar = $('.modal__fechar', modal);
    var c = {
      categoria: $('[data-m-categoria]', modal),
      nome: $('[data-m-nome]', modal),
      ref: $('[data-m-ref]', modal),
      preco: $('[data-m-preco]', modal),
      descricao: $('[data-m-descricao]', modal),
      tamanhosArea: $('[data-m-tamanhos-area]', modal),
      tamanhos: $('[data-m-tamanhos]', modal),
      whats: $('[data-m-whats]', modal),
      carrinho: $('[data-m-carrinho]', modal),
      aviso: $('[data-m-aviso]', modal),
      legenda: $('[data-m-legenda]', modal),
      dica: $('[data-m-dica]', modal)
    };
    var pecas = [];
    try { pecas = JSON.parse($('#dados-pecas').textContent) || []; } catch (e) { pecas = []; }

    var aberto = false;
    var modoFoto = false;
    var refAtual = null;
    var origem = null;
    var focoAnterior = null;
    var semHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
    if (c.dica) c.dica.textContent = semHover ? 'Toque na foto para ampliar' : 'Passe o mouse para ampliar';

    function porRef(ref) {
      for (var i = 0; i < pecas.length; i++) if (pecas[i].ref === ref) return pecas[i];
      return null;
    }

    function cartao(ref) {
      return $('.peca[data-ref="' + (window.CSS && CSS.escape ? CSS.escape(ref) : ref) + '"] .peca__foto');
    }

    function ordem() {
      var refs = $$('.peca:not(.is-oculta)').map(function (p) { return p.getAttribute('data-ref'); });
      return refs.length ? refs : pecas.map(function (p) { return p.ref; });
    }

    function preencher(p) {
      img.src = p.foto;
      img.alt = p.nome;
      if (p.w && p.h) { img.width = p.w; img.height = p.h; }
      c.categoria.textContent = p.categoria || '';
      c.nome.textContent = p.nome;
      c.ref.textContent = p.ref;
      c.preco.textContent = p.preco || '';
      c.preco.hidden = !p.preco;
      c.descricao.textContent = p.descricao || '';
      c.tamanhos.innerHTML = '';
      (p.tamanhos || []).forEach(function (t) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tamanho';
        b.setAttribute('data-tamanho', t);
        b.setAttribute('aria-pressed', 'false');
        b.textContent = t;
        li.appendChild(b);
        c.tamanhos.appendChild(li);
      });
      c.tamanhosArea.hidden = !(p.tamanhos && p.tamanhos.length);
      if (c.aviso) c.aviso.hidden = true;
      if (c.carrinho) c.carrinho.setAttribute('data-ref', p.ref);
      c.whats.href = p.whatsapp;
      refAtual = p.ref;
    }

    // a foto "voa" de um lugar da página para outro
    function voar(de, para, src, aoTerminar) {
      var a = de.getBoundingClientRect();
      var b = para.getBoundingClientRect();
      if (!a.width || !b.width || !src) { aoTerminar(); return; }
      var fantasma = document.createElement('img');
      fantasma.src = src;
      fantasma.alt = '';
      fantasma.className = 'foto-voando';
      fantasma.style.left = b.left + 'px';
      fantasma.style.top = b.top + 'px';
      fantasma.style.width = b.width + 'px';
      fantasma.style.height = b.height + 'px';
      document.body.appendChild(fantasma);
      var animacao = fantasma.animate([
        { transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + (a.width / b.width) + ',' + (a.height / b.height) + ')', borderRadius: '6px' },
        { transform: 'none', borderRadius: '0px' }
      ], { duration: 640, easing: EASE });
      animacao.onfinish = function () {
        aoTerminar();
        requestAnimationFrame(function () { fantasma.remove(); });
      };
    }

    function naTela(el) {
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    }

    function teclado(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); fechar(); return; }
      if (ev.key === 'Tab') { prenderFoco(ev, $$('button, a[href]', caixa)); return; }
      if (!modoFoto && ev.key === 'ArrowRight') navegar(1);
      if (!modoFoto && ev.key === 'ArrowLeft') navegar(-1);
    }

    function abrir(foto, gatilho) {
      focoAnterior = document.activeElement;
      origem = gatilho || null;
      modoFoto = foto;
      tirarZoom();
      modal.classList.toggle('modal--foto', foto);
      caixa.setAttribute('aria-labelledby', foto ? 'modal-legenda' : 'modal-titulo');
      doc.style.setProperty('--barra', (window.innerWidth - doc.clientWidth) + 'px');
      modal.hidden = false;
      doc.classList.add('modal-aberto');
      aberto = true;
      abertoEm = Date.now();
      ultimoMouse = null;
      document.addEventListener('keydown', teclado);

      if (podeAnimar(caixa)) {
        fundo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
        caixa.animate([{ opacity: 0, transform: 'translateY(26px) scale(.985)' }, { opacity: 1, transform: 'none' }],
          { duration: 560, easing: EASE });
        var imagemOrigem = origem && origem.querySelector('img');
        if (!foto && imagemOrigem && naTela(imagemOrigem)) {
          moldura.style.visibility = 'hidden';
          voar(imagemOrigem, moldura, img.src, function () { moldura.style.visibility = ''; });
        } else if (foto) {
          img.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
            { duration: 520, easing: EASE });
        }
      }
      setTimeout(function () { botaoFechar.focus({ preventScroll: true }); }, 60);
    }

    function fechar() {
      if (!aberto) return;
      aberto = false;
      document.removeEventListener('keydown', teclado);
      tirarZoom();

      function terminar() {
        modal.hidden = true;
        doc.classList.remove('modal-aberto');
        moldura.style.visibility = '';
        [fundo, caixa].forEach(function (el) {
          if (el.getAnimations) el.getAnimations().forEach(function (a) { a.cancel(); });
        });
        if (focoAnterior && focoAnterior.focus) focoAnterior.focus({ preventScroll: true });
      }

      if (!podeAnimar(caixa)) { terminar(); return; }
      var destino = !modoFoto && refAtual ? cartao(refAtual) : null;
      var imagemDestino = destino && destino.querySelector('img');
      fundo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' });
      if (imagemDestino && naTela(imagemDestino) && window.innerWidth >= 860) {
        caixa.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
        voar(moldura, imagemDestino, img.src, terminar);
      } else {
        caixa.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(18px) scale(.985)' }],
          { duration: 300, easing: 'ease-in', fill: 'forwards' }).onfinish = terminar;
      }
    }

    function trocar(p, direcao) {
      tirarZoom();
      if (!podeAnimar(moldura)) { preencher(p); return; }
      var alvos = [moldura, info];
      var saidas = alvos.map(function (el) {
        return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-direcao * 26) + 'px)' }],
          { duration: 190, easing: 'ease-in', fill: 'forwards' });
      });
      var nova = new Image();
      nova.src = p.foto;
      var pronta = nova.decode ? nova.decode().catch(function () {}) : Promise.resolve();
      Promise.all([pronta, new Promise(function (ok) { saidas[0].onfinish = ok; })]).then(function () {
        preencher(p);
        saidas.forEach(function (a) { a.cancel(); });
        alvos.forEach(function (el) {
          el.animate([{ opacity: 0, transform: 'translateX(' + (direcao * 26) + 'px)' }, { opacity: 1, transform: 'none' }],
            { duration: 420, easing: EASE });
        });
      });
    }

    function navegar(direcao) {
      var lista = ordem();
      var i = lista.indexOf(refAtual);
      if (i < 0) return;
      var p = porRef(lista[(i + direcao + lista.length) % lista.length]);
      if (p) trocar(p, direcao);
    }

    // lupa: amplia o tecido seguindo o mouse; no celular, um toque amplia
    function tirarZoom() { figura.classList.remove('is-zoom'); }
    function focoZoom(ev) {
      var r = moldura.getBoundingClientRect();
      img.style.setProperty('--zx', limitar((ev.clientX - r.left) / r.width * 100, 0, 100) + '%');
      img.style.setProperty('--zy', limitar((ev.clientY - r.top) / r.height * 100, 0, 100) + '%');
    }
    var abertoEm = 0;
    var ultimoMouse = null;
    moldura.addEventListener('pointermove', function (ev) {
      if (ev.pointerType !== 'mouse' || modoFoto) return;
      var mexeu = ultimoMouse && (Math.abs(ev.clientX - ultimoMouse.x) + Math.abs(ev.clientY - ultimoMouse.y) > 2);
      ultimoMouse = { x: ev.clientX, y: ev.clientY };
      if (!mexeu || Date.now() - abertoEm < 500) return;
      focoZoom(ev);
      figura.classList.add('is-zoom');
    });
    moldura.addEventListener('pointerleave', function (ev) {
      if (ev.pointerType === 'mouse') { tirarZoom(); ultimoMouse = null; }
    });

    var toqueX = null;
    var toqueY = 0;
    moldura.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'mouse') { toqueX = ev.clientX; toqueY = ev.clientY; }
    });
    moldura.addEventListener('pointerup', function (ev) {
      if (toqueX === null || modoFoto) { toqueX = null; return; }
      var dx = ev.clientX - toqueX;
      var dy = ev.clientY - toqueY;
      toqueX = null;
      var zoom = figura.classList.contains('is-zoom');
      if (!zoom && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        navegar(dx < 0 ? 1 : -1);
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (zoom) tirarZoom();
        else { focoZoom(ev); figura.classList.add('is-zoom'); }
      }
    });

    $$('[data-fechar]', modal).forEach(function (b) { b.addEventListener('click', fechar); });
    $('[data-m-anterior]', modal).addEventListener('click', function () { navegar(-1); });
    $('[data-m-proxima]', modal).addEventListener('click', function () { navegar(1); });

    document.addEventListener('click', function (ev) {
      var gatilhoPeca = ev.target.closest('[data-abrir-peca]');
      if (gatilhoPeca) {
        var p = porRef(gatilhoPeca.getAttribute('data-abrir-peca'));
        if (!p) return;
        ev.preventDefault();
        preencher(p);
        var origemFoto = gatilhoPeca.classList.contains('peca__foto') ? gatilhoPeca : $('.carrossel__slide.is-ativo');
        abrir(false, origemFoto);
        return;
      }
      var gatilhoFoto = ev.target.closest('[data-abrir-foto]');
      if (gatilhoFoto) {
        ev.preventDefault();
        img.src = gatilhoFoto.getAttribute('data-abrir-foto');
        img.removeAttribute('width');
        img.removeAttribute('height');
        img.alt = gatilhoFoto.getAttribute('data-legenda') || '';
        c.legenda.textContent = gatilhoFoto.getAttribute('data-legenda') || '';
        refAtual = null;
        abrir(true, gatilhoFoto);
      }
    });
  }

  /* ------------------------------------------------------------------
     7. Efeitos ligados à rolagem: parallax dos looks, fio do "Sobre"
        e a costura do passo a passo
     ------------------------------------------------------------------ */
  function iniciarRolagem() {
    var parallax = $$('[data-parallax]');
    var costura = $('[data-costura]');
    var passos = costura ? $$('.passo', costura) : [];
    var fioSobre = $('[data-fio]');
    var pendente = false;

    function quadro() {
      pendente = false;
      atualizarCabecalho();
      var vh = window.innerHeight;

      if (!reduzido()) {
        parallax.forEach(function (el) {
          var r = el.parentNode.getBoundingClientRect();
          if (r.bottom < -120 || r.top > vh + 120) return;
          var desvio = r.top + r.height / 2 - vh / 2;
          var folga = r.height * 0.09; // a foto está ampliada 20%: nunca mostra a borda
          var y = limitar(-desvio * parseFloat(el.getAttribute('data-parallax')), -folga, folga);
          el.style.setProperty('--y', y.toFixed(1) + 'px');
        });
      }

      if (costura && passos.length) {
        var r = costura.getBoundingClientRect();
        var p = reduzido() ? (r.top < vh ? 1 : 0) : limitar((vh * 0.8 - r.top) / (r.height * 0.7), 0, 1);
        costura.style.setProperty('--p', p.toFixed(3));
        var horizontal = window.innerWidth >= 900;
        var ultimo = passos[passos.length - 1];
        if (!horizontal) costura.style.setProperty('--fim', (ultimo.offsetHeight - 29) + 'px');
        passos.forEach(function (passo, i) {
          var marco = horizontal
            ? (passos.length > 1 ? i / (passos.length - 1) : 0)
            : (ultimo.offsetTop > 0 ? passo.offsetTop / ultimo.offsetTop : 0);
          passo.classList.toggle('is-costurado', p > 0.02 && p >= marco - 0.03);
        });
      }

      if (fioSobre) {
        var r2 = fioSobre.getBoundingClientRect();
        var p2 = reduzido() ? 1 : limitar((vh * 0.92 - r2.top) / (r2.height * 0.95), 0, 1);
        fioSobre.style.setProperty('--p', p2.toFixed(3));
      }
    }

    function pedir() {
      if (!pendente) { pendente = true; requestAnimationFrame(quadro); }
    }
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    quadro();
  }

  /* ------------------------------------------------------------------
     Início
     ------------------------------------------------------------------ */
  iniciarCortina();
  iniciarMenu();
  iniciarMenuAtivo();
  iniciarCarrossel();
  iniciarRevelacoes();
  iniciarVitrine();
  iniciarModal();
  iniciarRolagem();
})();
