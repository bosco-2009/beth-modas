/* ==========================================================================
   BETH MODAS — Carrinho, finalização da compra e situação do pedido
   ========================================================================== */
(function () {
  'use strict';

  // Endereço do servidor que cria o pagamento no Mercado Pago (veja PAGAMENTO.md).
  // Enquanto estiver vazio, o pedido vai para a loja pelo WhatsApp.
  var URL_PAGAMENTO = window.BETH_URL_PAGAMENTO || '';
  var WHATS = '5521965959409';
  var CHAVE = 'beth-carrinho';
  var CHAVE_PEDIDO = 'beth-ultimo-pedido';
  var MAX_QTD = 20;

  var METODOS = { pix: 'Pix', boleto: 'Boleto', credito: 'Cartão de crédito', debito: 'Cartão de débito' };

  function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }
  function $$(seletor, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(seletor)); }
  function reais(v) { return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function digitos(t) { return String(t || '').replace(/\D/g, ''); }

  /* ------------------------------------------------------------------
     Armazenamento (o carrinho fica guardado no navegador)
     ------------------------------------------------------------------ */
  var memoria = { carrinho: '[]', pedido: '' };

  function lerTexto(chave, padrao) {
    try { var v = localStorage.getItem(chave); return v === null ? padrao : v; }
    catch (e) { return memoria[chave === CHAVE ? 'carrinho' : 'pedido'] || padrao; }
  }
  function gravarTexto(chave, valor) {
    try { localStorage.setItem(chave, valor); }
    catch (e) { memoria[chave === CHAVE ? 'carrinho' : 'pedido'] = valor; }
  }

  function ler() {
    var lista;
    try { lista = JSON.parse(lerTexto(CHAVE, '[]')); } catch (e) { lista = []; }
    if (!Array.isArray(lista)) return [];
    return lista.filter(function (i) {
      return i && typeof i.ref === 'string' && typeof i.qtd === 'number' && i.qtd >= 1;
    }).map(function (i) {
      return { ref: i.ref, tamanho: typeof i.tamanho === 'string' ? i.tamanho : '', qtd: Math.min(MAX_QTD, Math.floor(i.qtd)) };
    });
  }

  function gravar(lista) {
    gravarTexto(CHAVE, JSON.stringify(lista));
    atualizarContador();
    document.dispatchEvent(new CustomEvent('beth:carrinho'));
  }

  function chaveDe(i) { return i.ref + '|' + i.tamanho; }

  function adicionar(ref, tamanho) {
    var lista = ler();
    var achado = null;
    lista.forEach(function (i) { if (i.ref === ref && i.tamanho === tamanho) achado = i; });
    if (achado) achado.qtd = Math.min(MAX_QTD, achado.qtd + 1);
    else lista.push({ ref: ref, tamanho: tamanho, qtd: 1 });
    gravar(lista);
  }

  function alterar(chave, qtd) {
    gravar(ler().map(function (i) {
      if (chaveDe(i) === chave) i.qtd = Math.max(1, Math.min(MAX_QTD, qtd));
      return i;
    }));
  }

  function remover(chave) {
    gravar(ler().filter(function (i) { return chaveDe(i) !== chave; }));
  }

  function limpar() { gravar([]); }

  function contar(lista) {
    return lista.reduce(function (n, i) { return n + i.qtd; }, 0);
  }

  function atualizarContador() {
    var n = contar(ler());
    $$('[data-carrinho-qtd]').forEach(function (el) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n === 0;
    });
    $$('[data-carrinho-link]').forEach(function (el) {
      el.setAttribute('aria-label', n === 0 ? 'Carrinho vazio' : 'Carrinho, ' + n + (n === 1 ? ' item' : ' itens'));
    });
  }

  /* ------------------------------------------------------------------
     Catálogo (preços e fotos vêm do mesmo arquivo que o servidor usa)
     ------------------------------------------------------------------ */
  var catalogoPromessa = null;

  function catalogo() {
    if (catalogoPromessa) return catalogoPromessa;
    var embutido = $('#dados-pecas');
    if (embutido) {
      var mapa = {};
      try {
        JSON.parse(embutido.textContent).forEach(function (p) {
          mapa[p.ref] = { nome: p.nome, preco: p.valor, tamanhos: p.tamanhos || [], foto: p.mini || p.foto };
        });
      } catch (e) { /* segue com o mapa vazio */ }
      catalogoPromessa = Promise.resolve(mapa);
      return catalogoPromessa;
    }
    catalogoPromessa = fetch('dados/produtos.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('catálogo ' + r.status); return r.json(); })
      .then(function (d) {
        var mapa = {};
        (d.produtos || []).forEach(function (p) {
          // no carrinho basta a miniatura leve da foto
          mapa[p.ref] = { nome: p.nome, preco: p.preco, tamanhos: p.tamanhos || [], foto: 'assets/img/produtos/mini/' + p.foto.replace(/\.\w+$/, '.webp') };
        });
        return mapa;
      });
    return catalogoPromessa;
  }

  // itens do carrinho com nome e preço atuais; descarta o que saiu do catálogo
  function itensDetalhados(mapa) {
    var lista = ler();
    var validos = lista.filter(function (i) {
      var p = mapa[i.ref];
      if (!p) return false;
      return p.tamanhos.length ? p.tamanhos.indexOf(i.tamanho) !== -1 : i.tamanho === '';
    });
    if (validos.length !== lista.length) gravar(validos);
    return validos.map(function (i) {
      var p = mapa[i.ref];
      return { ref: i.ref, tamanho: i.tamanho, qtd: i.qtd, chave: chaveDe(i), nome: p.nome, preco: p.preco, foto: p.foto, subtotal: p.preco * i.qtd };
    });
  }

  function somar(itens) {
    return itens.reduce(function (t, i) { return t + i.subtotal; }, 0);
  }

  /* ------------------------------------------------------------------
     Aviso "Adicionado ao carrinho"
     ------------------------------------------------------------------ */
  var aviso = null;
  var avisoTempo = null;

  function avisar(texto) {
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'aviso-carrinho';
      aviso.setAttribute('role', 'status');
      aviso.innerHTML = '<span class="aviso-carrinho__texto"></span><a class="aviso-carrinho__link" href="carrinho.html">Ver carrinho</a>';
      document.body.appendChild(aviso);
    }
    $('.aviso-carrinho__texto', aviso).textContent = texto;
    aviso.classList.add('is-visivel');
    clearTimeout(avisoTempo);
    avisoTempo = setTimeout(function () { aviso.classList.remove('is-visivel'); }, 3600);
  }

  /* ------------------------------------------------------------------
     Botões "Adicionar ao carrinho" (vitrine e janela de detalhes)
     ------------------------------------------------------------------ */
  function avisoDaJanela(texto) {
    var el = $('[data-m-aviso]');
    if (!el) return;
    el.textContent = texto;
    el.hidden = !texto;
  }

  document.addEventListener('click', function (ev) {
    var tamanho = ev.target.closest('.tamanho');
    if (tamanho) {
      $$('.tamanho', tamanho.closest('ul')).forEach(function (b) {
        b.setAttribute('aria-pressed', b === tamanho ? 'true' : 'false');
      });
      avisoDaJanela('');
      return;
    }

    var botao = ev.target.closest('[data-carrinho-add], [data-comprar-agora]');
    if (!botao) return;
    var ref = botao.getAttribute('data-ref');
    if (!ref) return;
    var naJanela = botao.hasAttribute('data-m-carrinho') || botao.hasAttribute('data-m-comprar');
    var comprarAgora = botao.hasAttribute('data-comprar-agora');

    // peça com tamanho: abre os detalhes para a pessoa escolher
    if (!naJanela && botao.hasAttribute('data-tem-tamanho')) {
      var foto = $('.peca[data-ref="' + ref + '"] [data-abrir-peca]');
      if (foto) {
        foto.click();
        setTimeout(function () { avisoDaJanela('Escolha o tamanho para colocar no carrinho.'); }, 40);
      } else {
        // fora da página de produtos (destaques da página inicial)
        window.location.href = 'produtos.html#' + encodeURIComponent(ref);
      }
      return;
    }

    catalogo().then(function (mapa) {
      var p = mapa[ref];
      if (!p) return;
      var escolhido = '';
      if (p.tamanhos.length) {
        var marcado = $('.modal .tamanho[aria-pressed="true"]');
        if (!marcado) {
          avisoDaJanela('Escolha o tamanho para colocar no carrinho.');
          var primeiro = $('.modal .tamanho');
          if (primeiro) primeiro.focus();
          return;
        }
        escolhido = marcado.getAttribute('data-tamanho');
      }
      adicionar(ref, escolhido);
      if (comprarAgora) {
        window.location.href = 'finalizar.html';
        return;
      }
      avisar(p.nome + (escolhido ? ' (' + escolhido + ')' : '') + ' foi para o carrinho.');
      botao.classList.add('is-adicionado');
      setTimeout(function () { botao.classList.remove('is-adicionado'); }, 1400);
    });
  });

  /* ------------------------------------------------------------------
     Página do carrinho
     ------------------------------------------------------------------ */
  function iniciarCarrinho() {
    var listaEl = $('[data-carrinho-lista]');
    if (!listaEl) return;
    var cheio = $('[data-carrinho-cheio]');
    var vazio = $('[data-carrinho-vazio]');

    function desenhar(mapa) {
      var itens = itensDetalhados(mapa);
      vazio.hidden = itens.length > 0;
      cheio.hidden = itens.length === 0;
      listaEl.innerHTML = '';
      itens.forEach(function (i) {
        var li = document.createElement('li');
        li.className = 'item';
        li.setAttribute('data-chave', i.chave);
        li.innerHTML =
          '<img class="item__foto" alt="" width="90" height="120" loading="lazy">' +
          '<div class="item__info">' +
            '<p class="item__nome"></p>' +
            '<p class="item__detalhe"></p>' +
            '<p class="item__preco"></p>' +
          '</div>' +
          '<div class="item__qtd" role="group">' +
            '<button type="button" class="item__botao" data-menos aria-label="Diminuir quantidade">−</button>' +
            '<span class="item__numero"></span>' +
            '<button type="button" class="item__botao" data-mais aria-label="Aumentar quantidade">+</button>' +
          '</div>' +
          '<p class="item__subtotal"></p>' +
          '<button type="button" class="item__remover" data-remover>Remover</button>';
        $('.item__foto', li).src = i.foto;
        $('.item__nome', li).textContent = i.nome;
        $('.item__detalhe', li).textContent = i.tamanho ? 'Tamanho ' + i.tamanho : 'Ref. ' + i.ref;
        $('.item__preco', li).textContent = reais(i.preco) + (i.qtd > 1 ? ' cada' : '');
        $('.item__qtd', li).setAttribute('aria-label', 'Quantidade de ' + i.nome);
        $('.item__numero', li).textContent = i.qtd;
        $('[data-menos]', li).disabled = i.qtd <= 1;
        $('[data-mais]', li).disabled = i.qtd >= MAX_QTD;
        $('.item__subtotal', li).textContent = reais(i.subtotal);
        $('[data-remover]', li).setAttribute('aria-label', 'Remover ' + i.nome + ' do carrinho');
        listaEl.appendChild(li);
      });
      var total = somar(itens);
      $$('[data-subtotal]').forEach(function (el) { el.textContent = reais(total); });
      $$('[data-total]').forEach(function (el) { el.textContent = reais(total); });
    }

    listaEl.addEventListener('click', function (ev) {
      var li = ev.target.closest('.item');
      if (!li) return;
      var chave = li.getAttribute('data-chave');
      var atual = ler().filter(function (i) { return chaveDe(i) === chave; })[0];
      if (!atual) return;
      if (ev.target.closest('[data-menos]')) alterar(chave, atual.qtd - 1);
      else if (ev.target.closest('[data-mais]')) alterar(chave, atual.qtd + 1);
      else if (ev.target.closest('[data-remover]')) remover(chave);
    });

    catalogo().then(function (mapa) {
      desenhar(mapa);
      document.addEventListener('beth:carrinho', function () { desenhar(mapa); });
    }).catch(function () {
      vazio.hidden = false;
      vazio.querySelector('p').textContent = 'Não foi possível carregar o carrinho. Atualize a página.';
    });
  }

  /* ------------------------------------------------------------------
     Finalização da compra
     ------------------------------------------------------------------ */
  function iniciarFinalizacao() {
    var form = $('[data-checkout]');
    if (!form) return;
    var vazio = $('[data-carrinho-vazio]');
    var erro = $('[data-checkout-erro]');
    var pagar = $('[data-pagar]');
    var endereco = $('[data-endereco]');
    var frete = $('[data-frete]');
    var itens = [];

    if (!URL_PAGAMENTO) {
      pagar.textContent = 'Enviar pedido pelo WhatsApp';
      $('[data-seguro] span').textContent = 'Seu pedido vai para a loja pelo WhatsApp, e ela envia o pagamento na forma que você escolher.';
    }

    function desenharResumo() {
      var ul = $('[data-resumo-itens]');
      ul.innerHTML = '';
      itens.forEach(function (i) {
        var li = document.createElement('li');
        li.className = 'resumo__item';
        li.innerHTML = '<span class="resumo__item-nome"></span><span class="resumo__item-valor"></span>';
        $('.resumo__item-nome', li).textContent = i.qtd + '× ' + i.nome + (i.tamanho ? ' (' + i.tamanho + ')' : '');
        $('.resumo__item-valor', li).textContent = reais(i.subtotal);
        ul.appendChild(li);
      });
      var total = somar(itens);
      $('[data-subtotal]', form).textContent = reais(total);
      $('[data-total]', form).textContent = reais(total);
    }

    function mostrarEntrega() {
      var casa = form.entrega.value === 'entrega';
      endereco.hidden = !casa;
      frete.textContent = casa ? 'A combinar pelo WhatsApp' : 'Retirada na loja';
    }
    $$('input[name="entrega"]', form).forEach(function (r) { r.addEventListener('change', mostrarEntrega); });
    mostrarEntrega();

    // WhatsApp no formato (21) 99999-1234 enquanto a pessoa digita
    function formatarFone(valor) {
      var d = digitos(valor);
      if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2);
      d = d.slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      var resto = d.slice(2);
      var meio = resto.length > 8 ? 5 : 4;
      return '(' + d.slice(0, 2) + ') ' + (resto.length > meio ? resto.slice(0, meio) + '-' + resto.slice(meio) : resto);
    }
    form.whatsapp.addEventListener('input', function (ev) {
      // enquanto a pessoa apaga, não reformata (senão o hífen e o parêntese voltam)
      if (ev.inputType && ev.inputType.indexOf('delete') === 0) return;
      form.whatsapp.value = formatarFone(form.whatsapp.value);
    });
    form.whatsapp.addEventListener('blur', function () {
      form.whatsapp.value = formatarFone(form.whatsapp.value);
    });

    // CEP: completa rua, bairro e cidade pelo ViaCEP
    var statusCep = $('[data-cep-status]');
    var ultimoCep = '';
    var cepDosCampos = ''; // CEP do endereço que foi preenchido sozinho (pelo ViaCEP ou pelos dados lembrados)
    var AJUDA_CEP = statusCep ? statusCep.textContent : '';
    var CAMPOS_ENDERECO = ['rua', 'numero', 'complemento', 'bairro', 'cidade'];
    function preencherSeVazio(campo, valor) {
      if (valor && (!campo.value.trim() || campo.getAttribute('data-auto') === '1')) {
        campo.value = valor;
        campo.setAttribute('data-auto', '1');
      }
    }
    form.cep.addEventListener('input', function () {
      var d = digitos(form.cep.value).slice(0, 8);
      form.cep.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
      if (d.length !== 8 || d === ultimoCep) {
        if (d.length < 8 && statusCep) statusCep.textContent = AJUDA_CEP;
        return;
      }
      ultimoCep = d;
      if (d !== cepDosCampos) {
        // o endereço preenchido sozinho era de outro CEP: não pode ficar misturado com o novo
        CAMPOS_ENDERECO.forEach(function (n) {
          if (form[n].getAttribute('data-auto') === '1') { form[n].value = ''; form[n].removeAttribute('data-auto'); }
        });
        cepDosCampos = d;
      }
      if (!window.fetch) return;
      if (statusCep) statusCep.textContent = 'Buscando o endereço…';
      fetch('https://viacep.com.br/ws/' + d + '/json/')
        .then(function (r) { return r.ok ? r.json() : { erro: true }; })
        .then(function (e) {
          if (digitos(form.cep.value) !== d) return;
          if (e.erro) {
            if (statusCep) statusCep.textContent = 'CEP não encontrado. Confira o número ou preencha o endereço.';
            return;
          }
          preencherSeVazio(form.rua, e.logradouro);
          preencherSeVazio(form.bairro, e.bairro);
          preencherSeVazio(form.cidade, e.localidade && e.uf ? e.localidade + ' - ' + e.uf : e.localidade);
          if (statusCep) statusCep.textContent = 'Endereço encontrado. Confira e complete com o número.';
          if (!form.numero.value) form.numero.focus();
        })
        .catch(function () {
          if (statusCep) statusCep.textContent = 'Não deu para buscar o CEP agora. Preencha o endereço.';
        });
    });
    CAMPOS_ENDERECO.forEach(function (n) {
      form[n].addEventListener('input', function () { form[n].removeAttribute('data-auto'); });
    });

    // "Lembrar meus dados": guarda só neste aparelho
    var CHAVE_CLIENTE = 'beth-cliente';
    var CAMPOS_LEMBRADOS = ['nome', 'whatsapp', 'email', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade'];
    var lembrado = null;
    try { lembrado = JSON.parse(localStorage.getItem(CHAVE_CLIENTE) || 'null'); } catch (e) { lembrado = null; }
    if (lembrado && typeof lembrado === 'object') {
      CAMPOS_LEMBRADOS.forEach(function (n) { if (typeof lembrado[n] === 'string') form[n].value = lembrado[n]; });
      // o endereço lembrado é trocado se a pessoa digitar outro CEP
      CAMPOS_ENDERECO.forEach(function (n) { if (form[n].value) form[n].setAttribute('data-auto', '1'); });
      cepDosCampos = digitos(form.cep.value);
      if (lembrado.entrega === 'entrega') { form.querySelector('input[name="entrega"][value="entrega"]').checked = true; mostrarEntrega(); }
      form.lembrar.checked = true;
    }
    function guardarCliente() {
      try {
        if (!form.lembrar.checked) { localStorage.removeItem(CHAVE_CLIENTE); return; }
        var dados = { entrega: form.entrega.value };
        CAMPOS_LEMBRADOS.forEach(function (n) { dados[n] = form[n].value.trim(); });
        localStorage.setItem(CHAVE_CLIENTE, JSON.stringify(dados));
      } catch (e) { /* navegação privada: segue sem lembrar */ }
    }

    function falhar(campo, mensagem) {
      erro.textContent = mensagem;
      erro.hidden = false;
      if (campo) {
        campo.setAttribute('aria-invalid', 'true');
        campo.focus();
      }
      return null;
    }

    function coletar() {
      $$('[aria-invalid]', form).forEach(function (c) { c.removeAttribute('aria-invalid'); });
      erro.hidden = true;
      var f = form;
      var nome = f.nome.value.trim().replace(/\s+/g, ' ');
      if (nome.length < 3) return falhar(f.nome, 'Escreva seu nome completo.');
      var whats = digitos(f.whatsapp.value);
      if (whats.length < 10 || whats.length > 13) return falhar(f.whatsapp, 'Confira o número de WhatsApp, com DDD.');
      var email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return falhar(f.email, 'Confira o e-mail.');
      var entrega = { tipo: f.entrega.value === 'entrega' ? 'entrega' : 'retirada' };
      if (entrega.tipo === 'entrega') {
        var cep = digitos(f.cep.value);
        if (cep.length !== 8) return falhar(f.cep, 'Confira o CEP.');
        var obrig = [['rua', 'Escreva a rua.'], ['numero', 'Escreva o número.'], ['bairro', 'Escreva o bairro.'], ['cidade', 'Escreva a cidade.']];
        for (var k = 0; k < obrig.length; k++) {
          if (!f[obrig[k][0]].value.trim()) return falhar(f[obrig[k][0]], obrig[k][1]);
        }
        entrega.cep = cep;
        entrega.rua = f.rua.value.trim();
        entrega.numero = f.numero.value.trim();
        entrega.complemento = f.complemento.value.trim();
        entrega.bairro = f.bairro.value.trim();
        entrega.cidade = f.cidade.value.trim();
      }
      var metodo = (form.querySelector('input[name="metodo"]:checked') || {}).value;
      if (!METODOS[metodo]) return falhar(form.querySelector('input[name="metodo"]'), 'Escolha a forma de pagamento.');
      if (!itens.length) return falhar(null, 'Seu carrinho está vazio.');
      return {
        itens: itens.map(function (i) { return { ref: i.ref, tamanho: i.tamanho, qtd: i.qtd }; }),
        cliente: { nome: nome, whatsapp: whats, email: email },
        entrega: entrega,
        metodo: metodo
      };
    }

    function guardarPedido(pedido, numero) {
      gravarTexto(CHAVE_PEDIDO, JSON.stringify({
        numero: numero || '',
        metodo: pedido.metodo,
        entrega: pedido.entrega,
        nome: pedido.cliente.nome,
        itens: itens.map(function (i) { return { nome: i.nome, tamanho: i.tamanho, qtd: i.qtd, subtotal: i.subtotal }; }),
        total: somar(itens)
      }));
    }

    function ocupado(sim) {
      pagar.disabled = sim;
      pagar.classList.toggle('is-ocupado', sim);
      if (URL_PAGAMENTO) pagar.textContent = sim ? 'Abrindo o pagamento…' : 'Ir para o pagamento';
    }
    // quem volta do Mercado Pago pelo botão Voltar recebe a página como estava: destrava o botão
    window.addEventListener('pageshow', function (ev) { if (ev.persisted) ocupado(false); });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var pedido = coletar();
      if (!pedido) return;
      guardarCliente();

      if (!URL_PAGAMENTO) {
        guardarPedido(pedido, '');
        window.open(linkWhatsPedido(lerPedido(), 'quero finalizar este pedido'), '_blank', 'noopener');
        window.location.href = 'pedido.html?resultado=enviado';
        return;
      }

      ocupado(true);
      fetch(URL_PAGAMENTO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, dados: d }; });
      }).then(function (res) {
        if (!res.ok || !res.dados.url) throw new Error(res.dados.erro || 'Não foi possível abrir o pagamento.');
        guardarPedido(pedido, res.dados.pedido);
        window.location.href = res.dados.url;
      }).catch(function (e) {
        ocupado(false);
        falhar(null, (e && e.message && e.message !== 'Failed to fetch' ? e.message : 'Não foi possível abrir o pagamento.') +
          ' Tente de novo em instantes ou fale com a loja pelo WhatsApp.');
      });
    });

    catalogo().then(function (mapa) {
      function atualizar() {
        itens = itensDetalhados(mapa);
        vazio.hidden = itens.length > 0;
        form.hidden = itens.length === 0;
        desenharResumo();
      }
      atualizar();
      // o carrinho pode mudar em outra aba enquanto a pessoa preenche os dados
      document.addEventListener('beth:carrinho', atualizar);
    }).catch(function () {
      vazio.hidden = false;
      vazio.querySelector('p').textContent = 'Não foi possível carregar o carrinho. Atualize a página.';
    });
  }

  /* ------------------------------------------------------------------
     Situação do pedido (volta do Mercado Pago)
     ------------------------------------------------------------------ */
  function lerPedido() {
    try { return JSON.parse(lerTexto(CHAVE_PEDIDO, '')) || null; } catch (e) { return null; }
  }

  function linkWhatsPedido(p, frase) {
    var linhas = ['Olá, Beth Modas! ' + frase.charAt(0).toUpperCase() + frase.slice(1) + '.'];
    if (p) {
      if (p.numero) linhas.push('Pedido: ' + p.numero);
      linhas.push('');
      (p.itens || []).forEach(function (i) {
        linhas.push('• ' + i.qtd + 'x ' + i.nome + (i.tamanho ? ' (tamanho ' + i.tamanho + ')' : '') + ': ' + reais(i.subtotal));
      });
      linhas.push('Total: ' + reais(p.total || 0));
      linhas.push('Pagamento: ' + (METODOS[p.metodo] || '-'));
      var e = p.entrega || {};
      linhas.push(e.tipo === 'entrega'
        ? 'Entrega: ' + e.rua + ', ' + e.numero + (e.complemento ? ' - ' + e.complemento : '') + ', ' + e.bairro + ', ' + e.cidade + ' (CEP ' + e.cep + ')'
        : 'Entrega: retirada na loja');
      if (p.nome) linhas.push('Nome: ' + p.nome);
    }
    return 'https://wa.me/' + WHATS + '?text=' + encodeURIComponent(linhas.join('\n'));
  }

  function iniciarPedido() {
    var caixa = $('[data-pedido]');
    if (!caixa) return;
    var q = new URLSearchParams(window.location.search);
    var resultado = q.get('resultado') || '';
    var status = q.get('collection_status') || q.get('status') || '';
    if (status === 'approved') resultado = 'aprovado';
    else if ((status === 'pending' || status === 'in_process') && resultado !== 'aprovado') resultado = 'pendente';
    else if ((status === 'rejected' || status === 'null') && !resultado) resultado = 'recusado';

    var pedido = lerPedido();
    var numero = q.get('external_reference') || (pedido && pedido.numero) || '';
    if (pedido && numero) pedido.numero = numero;

    var textos = {
      aprovado: ['ok', 'Pagamento aprovado!', 'Agradecemos a compra. A loja já recebeu o pagamento e vai falar com você pelo WhatsApp para combinar a retirada ou a entrega.', 'meu pagamento foi aprovado'],
      pendente: ['espera', 'Pagamento em processamento', 'Assim que o pagamento for confirmado, a loja recebe o aviso. Se você escolheu Pix ou boleto, conclua o pagamento com o código que o Mercado Pago mostrou.', 'fiz um pedido e o pagamento está em processamento'],
      recusado: ['erro', 'O pagamento não foi concluído', 'Nenhum valor foi cobrado. Seus produtos continuam no carrinho: você pode tentar de novo ou escolher outra forma de pagamento.', 'tive um problema para pagar meu pedido'],
      // o pedido só chega à loja quando a pessoa toca em enviar no WhatsApp
      enviado: ['espera', 'Agora é só enviar no WhatsApp', 'O WhatsApp abriu com o seu pedido pronto. Toque em enviar para a loja receber e mandar o pagamento. Se ele não abriu, use o botão abaixo.', 'quero finalizar este pedido']
    };
    var t = textos[resultado];
    if (!t) {
      t = ['espera', 'Nenhum pedido em andamento', 'Escolha seus produtos e finalize a compra pelo carrinho.', 'tenho uma dúvida'];
      pedido = null;
    }

    $('[data-pedido-selo]').className = 'pedido__selo pedido__selo--' + t[0];
    $('[data-pedido-titulo]').textContent = t[1];
    $('[data-pedido-texto]').textContent = t[2];
    if (numero && resultado) {
      var n = $('[data-pedido-numero]');
      n.hidden = false;
      $('strong', n).textContent = numero;
    }
    var resumo = $('[data-pedido-resumo]');
    if (resumo && pedido && pedido.itens && pedido.itens.length) {
      var ul = $('[data-pedido-itens]', resumo);
      pedido.itens.forEach(function (i) {
        var li = document.createElement('li');
        li.innerHTML = '<span></span><span></span>';
        li.firstChild.textContent = i.qtd + '× ' + i.nome + (i.tamanho ? ' (' + i.tamanho + ')' : '');
        li.lastChild.textContent = reais(i.subtotal);
        ul.appendChild(li);
      });
      $('[data-pedido-total]', resumo).textContent = reais(pedido.total || 0) + ' · ' + (METODOS[pedido.metodo] || '');
      resumo.hidden = false;
    }
    $('[data-pedido-whats]').href = linkWhatsPedido(pedido, t[3]);
    var rotuloWhats = $('[data-pedido-whats-texto]');
    if (rotuloWhats && resultado === 'enviado') rotuloWhats.textContent = 'Enviar pedido pelo WhatsApp';
    if (resultado === 'recusado') {
      var voltar = $('[data-pedido-voltar]');
      voltar.textContent = 'Tentar de novo';
      voltar.href = 'finalizar.html';
    }
    if (resultado === 'aprovado' || resultado === 'pendente' || resultado === 'enviado') limpar();
  }

  function carrinhoMudouFora() {
    atualizarContador();
    document.dispatchEvent(new CustomEvent('beth:carrinho'));
  }
  atualizarContador();
  // carrinho alterado em outra aba (ev.key é null quando os dados do site são apagados)
  window.addEventListener('storage', function (ev) { if (ev.key === CHAVE || ev.key === null) carrinhoMudouFora(); });
  // página restaurada pelo botão Voltar: o carrinho pode ter mudado nesse meio-tempo
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) carrinhoMudouFora(); });
  iniciarCarrinho();
  iniciarFinalizacao();
  iniciarPedido();
})();
