/**
 * CAF-000040 — Totem / Tablet de Autoatendimento no Balcão (js/totem.js)
 */
(function () {
  'use strict';

  const STORAGE_TOKEN_KEY = 'cafeteria_totem_token';
  const IDLE_TIMEOUT_MS = 60 * 1000;      // 60s -> Tela de descanso
  const CLEAR_CART_TIMEOUT_MS = 90 * 1000; // 90s -> Limpa carrinho

  let totemToken = localStorage.getItem(STORAGE_TOKEN_KEY) || '';
  let totemInfo = {
    nome: 'Totem Balcão',
    avisoTitulo: '🎭 Hoje no Teatro Univates',
    avisoSubtitulo: 'Garanta seu café e lanche sem fila antes do espetáculo começar!'
  };

  let categorias = [];
  let produtos = [];
  let adicionais = [];
  let vinculosAdicionais = [];
  let promocoesAtivas = [];
  let sugestoesConfig = [];

  let categoriaAtivaId = null;
  let carrinho = [];
  let jaMostrouSugestoesNoCiclo = false;
  let itemEmEdicao = null;
  let paraViagem = false;
  let formaPagamentoEscolhida = 'pix';
  let ultimoPedidoGerado = null;
  let totemCupomAplicado = null;

  let idleTimer = null;
  let clearCartTimer = null;
  let promoCarouselInterval = null;
  let promoCarouselIndex = 0;
  let successCountdownInterval = null;

  // Elementos DOM
  const offlineOverlay = document.getElementById('totem-offline-overlay');
  const pairingScreen = document.getElementById('totem-pairing-screen');
  const pairingTitle = document.getElementById('totem-pairing-title');
  const pairingDesc = document.getElementById('totem-pairing-desc');
  const pairingInput = document.getElementById('totem-pairing-code-input');
  const pairingError = document.getElementById('totem-pairing-error');
  const btnPairSubmit = document.getElementById('btn-totem-pair-submit');

  let espetaculoTotemConfig = null;
  let reservandoParaIntervaloTotem = false;
  let termoBuscaTotem = '';

  const idleScreen = document.getElementById('totem-idle-screen');
  const idleTeatroTitulo = document.getElementById('totem-idle-teatro-titulo');
  const idleTeatroSub = document.getElementById('totem-idle-teatro-sub');
  const idlePromoContainer = document.getElementById('totem-idle-promo-container');

  const categoriesBar = document.getElementById('totem-categories-bar');
  const productsGrid = document.getElementById('totem-products-grid');
  const cartCountEl = document.getElementById('totem-cart-count');
  const cartTotalEl = document.getElementById('totem-cart-total');
  const btnLimpar = document.getElementById('btn-totem-limpar');
  const btnAvancar = document.getElementById('btn-totem-avancar');
  const btnVerSacola = document.getElementById('btn-totem-ver-sacola');

  const modalItem = document.getElementById('totem-modal-item');
  const itemModalTitle = document.getElementById('totem-item-modal-title');
  const itemModalBody = document.getElementById('totem-item-modal-body');
  const btnCloseItemModal = document.getElementById('btn-close-item-modal');
  const btnCancelItemModal = document.getElementById('btn-cancel-item-modal');
  const btnConfirmItemModal = document.getElementById('btn-confirm-item-modal');

  const modalSugestoes = document.getElementById('totem-modal-sugestoes');
  const sugestoesList = document.getElementById('totem-sugestoes-list');
  const sugestoesFrase = document.getElementById('totem-sugestoes-frase');
  const btnCloseSugestoes = document.getElementById('btn-close-sugestoes-modal');
  const btnPularSugestoes = document.getElementById('btn-pular-sugestoes');

  const modalCheckout = document.getElementById('totem-modal-checkout');
  const btnCloseCheckout = document.getElementById('btn-close-checkout-modal');
  const btnBackCheckout = document.getElementById('btn-back-checkout-modal');
  const btnComerAqui = document.getElementById('btn-totem-comer-aqui');
  const btnParaViagem = document.getElementById('btn-totem-para-viagem');
  const inputNome = document.getElementById('totem-input-nome');
  const checkoutItemsList = document.getElementById('totem-checkout-items-list');
  const checkoutTotalLbl = document.getElementById('totem-checkout-total-lbl');
  const totemInputCupom = document.getElementById('totem-input-cupom');
  const btnTotemAplicarCupom = document.getElementById('btn-totem-aplicar-cupom');
  const totemCupomFeedback = document.getElementById('totem-cupom-feedback');
  const btnEnviarPedido = document.getElementById('btn-totem-enviar-pedido');

  const successScreen = document.getElementById('totem-success-screen');
  const successClienteLbl = document.getElementById('totem-success-cliente-lbl');
  const successSenhaLbl = document.getElementById('totem-success-senha');
  const successTotalLbl = document.getElementById('totem-success-total');
  const successPixBox = document.getElementById('totem-success-pix-box');
  const successPixQr = document.getElementById('totem-success-pix-qr');
  const successCountdownLbl = document.getElementById('totem-success-countdown');
  const btnPrintSenha = document.getElementById('btn-totem-print-senha');
  const btnNovoPedido = document.getElementById('btn-totem-novo-pedido');

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoeda(val) {
    return 'R$ ' + Number(val || 0).toFixed(2).replace('.', ',');
  }

  // ── 1. CONECTIVIDADE ──
  function atualizarStatusRede() {
    if (!navigator.onLine) {
      offlineOverlay?.classList.remove('hidden');
    } else {
      offlineOverlay?.classList.add('hidden');
    }
  }
  window.addEventListener('online', atualizarStatusRede);
  window.addEventListener('offline', atualizarStatusRede);

  // ── 2. ACESSIBILIDADE & TELA CHEIA ──
  document.getElementById('btn-totem-font-toggle')?.addEventListener('click', function () {
    document.body.classList.toggle('totem-font-large');
    this.classList.toggle('is-active', document.body.classList.contains('totem-font-large'));
  });

  document.getElementById('btn-totem-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  // Bloqueio básico de menu de contexto em modo quiosque
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── 3. CONTROLE DE INATIVIDADE (60s descanso / 90s limpa carrinho) ──
  function registrarToqueAtividade() {
    clearTimeout(idleTimer);
    clearTimeout(clearCartTimer);

    idleTimer = setTimeout(() => {
      mostrarTelaDescanso();
    }, IDLE_TIMEOUT_MS);

    clearCartTimer = setTimeout(() => {
      if (carrinho.length > 0) {
        limparCarrinhoSilencioso();
      }
      fecharTodosModais();
      mostrarTelaDescanso();
    }, CLEAR_CART_TIMEOUT_MS);
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, () => {
      if (!idleScreen.classList.contains('hidden')) {
        sairTelaDescanso();
      }
      registrarToqueAtividade();
    }, { passive: true });
  });

  function mostrarTelaDescanso() {
    if (!pairingScreen.classList.contains('hidden')) return;
    if (!successScreen.classList.contains('hidden')) return;
    idleScreen.classList.remove('hidden');
    renderizarCarrosselDescanso();
  }

  function sairTelaDescanso() {
    idleScreen.classList.add('hidden');
  }

  function renderizarCarrosselDescanso() {
    if (idleTeatroTitulo) idleTeatroTitulo.textContent = totemInfo.avisoTitulo || '🎭 Hoje no Teatro Univates';
    if (idleTeatroSub) idleTeatroSub.textContent = totemInfo.avisoSubtitulo || 'Garanta seu café e lanche sem fila antes do espetáculo começar!';

    if (!promocoesAtivas || promocoesAtivas.length === 0) {
      idlePromoContainer?.classList.add('hidden');
      return;
    }

    idlePromoContainer?.classList.remove('hidden');
    const exibirSlide = () => {
      const promo = promocoesAtivas[promoCarouselIndex % promocoesAtivas.length];
      promoCarouselIndex++;
      if (!promo) return;
      const prod = produtos.find((p) => p.id === promo.produto_id);
      const titulo = promo.titulo || (prod ? prod.nome : 'Promoção do Dia');
      const desc = promo.descricao || (prod ? prod.descricao : 'Aproveite no autoatendimento!');
      idlePromoContainer.innerHTML = `
        <div style="display:inline-block; background:#DC2626; color:#FFF; font-weight:800; padding:6px 14px; border-radius:999px; font-size:0.9rem; margin-bottom:10px;">
          🏷️ PROMOÇÃO DO DIA
        </div>
        <h3 style="margin:0 0 6px; font-size:1.55rem; color:var(--totem-primary);">${esc(titulo)}</h3>
        <p style="margin:0; font-size:1.05rem; color:var(--totem-text-sub);">${esc(desc)}</p>
      `;
    };
    exibirSlide();
    clearInterval(promoCarouselInterval);
    if (promocoesAtivas.length > 1) {
      promoCarouselInterval = setInterval(exibirSlide, 5000);
    }
  }

  // ── 4. PAREAMENTO E SESSÃO DO TOTEM ──
  function exibirTelaPareamento(motivoRevogado = false) {
    pairingScreen.classList.remove('hidden');
    idleScreen.classList.add('hidden');
    if (motivoRevogado) {
      pairingTitle.textContent = '🔒 Totem Desativado';
      pairingDesc.innerHTML = 'O acesso deste totem foi revogado no painel administrativo. Gere um novo código de pareamento no Admin para reativá-lo.';
    } else {
      pairingTitle.textContent = 'Ativar Totem de Balcão';
      pairingDesc.innerHTML = 'No painel Admin (Configurações → Totem), clique em <strong>+ Parear Novo Tablet</strong> e digite o código de 6 dígitos abaixo:';
    }
  }

  async function validarSessao() {
    if (!totemToken) {
      exibirTelaPareamento(false);
      return false;
    }
    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('validar_sessao_totem', {
        p_token: totemToken
      });
      if (error) throw error;
      if (!data || !data.valido) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        totemToken = '';
        exibirTelaPareamento(data?.motivo === 'TOTEM_REVOGADO');
        return false;
      }
      totemInfo.nome = data.nome || 'Totem Balcão';
      totemInfo.avisoTitulo = data.aviso_titulo || totemInfo.avisoTitulo;
      totemInfo.avisoSubtitulo = data.aviso_subtitulo || totemInfo.avisoSubtitulo;
      const lbl = document.getElementById('totem-device-label');
      if (lbl) lbl.textContent = `${totemInfo.nome} · Faça seu pedido aqui e pague no caixa`;
      pairingScreen.classList.add('hidden');
      return true;
    } catch (err) {
      console.warn('Falha ao validar sessão do totem:', err);
      return true; // Mantém operando se for oscilação momentânea
    }
  }

  btnPairSubmit?.addEventListener('click', async () => {
    const codigo = (pairingInput?.value || '').trim();
    if (codigo.length < 4) {
      pairingError.textContent = 'Digite o código de 6 dígitos gerado no Admin.';
      pairingError.classList.remove('hidden');
      return;
    }
    pairingError.classList.add('hidden');
    btnPairSubmit.disabled = true;
    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('parear_totem', {
        p_codigo: codigo
      });
      if (error) throw error;
      if (!data || !data.token) throw new Error('Resposta inválida do servidor.');

      totemToken = data.token;
      localStorage.setItem(STORAGE_TOKEN_KEY, totemToken);
      pairingInput.value = '';
      await validarSessao();
      await carregarDadosCardapio();
      mostrarTelaDescanso();
    } catch (err) {
      pairingError.textContent = err.message || 'Código inválido ou expirado.';
      pairingError.classList.remove('hidden');
    } finally {
      btnPairSubmit.disabled = false;
    }
  });

  // ── 5. CARREGAMENTO DO CARDÁPIO E SUGESTÕES ──
  async function carregarDadosCardapio() {
    if (!window.cafeteriaSupabase) return;
    try {
      const hojeDiaSemana = new Date().getDay();
      const [
        { data: cats },
        { data: prods },
        { data: adics },
        { data: vincs },
        { data: promos },
        { data: sugs }
      ] = await Promise.all([
        window.cafeteriaSupabase.from('categorias').select('*').eq('ativo', true).order('ordem'),
        window.cafeteriaSupabase.from('produtos').select('*').eq('ativo', true).eq('disponivel', true).order('ordem'),
        window.cafeteriaSupabase.from('adicionais').select('*').eq('ativo', true).order('nome'),
        window.cafeteriaSupabase.from('v_adicionais_produto').select('produto_id, adicional_id'),
        window.cafeteriaSupabase.from('promocoes').select('*').eq('ativo', true),
        window.cafeteriaSupabase.from('totem_sugestoes').select('*').eq('ativo', true).order('ordem')
      ]);

      categorias = (cats || []).filter((c) => c.id !== 'todos');
      // Exclui produtos exclusivos de encomenda agendada (CAF-000038)
      produtos = (prods || []).filter((p) => !p.apenas_encomenda);
      adicionais = adics || [];
      vinculosAdicionais = vincs || [];
      sugestoesConfig = sugs || [];

      const agora = new Date();
      promocoesAtivas = (promos || []).filter((pr) => {
        if (Array.isArray(pr.dias_semana) && pr.dias_semana.length > 0 && !pr.dias_semana.includes(hojeDiaSemana)) {
          return false;
        }
        if (pr.data_inicio && new Date(pr.data_inicio) > agora) return false;
        if (pr.data_fim && new Date(pr.data_fim + 'T23:59:59') < agora) return false;
        return true;
      });

      if (!categoriaAtivaId && categorias.length > 0) {
        categoriaAtivaId = categorias[0].id;
      }

      // Configuração de Espetáculo (CAF-000084 / RF03)
      try {
        const { data: configs } = await window.cafeteriaSupabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .like('chave', 'espetaculo_%');
        const cfg = {};
        (configs || []).forEach(r => {
          const val = typeof r.valor === 'string' ? r.valor.replace(/^"|"$/g, '') : r.valor;
          cfg[r.chave] = val;
        });
        espetaculoTotemConfig = cfg;
        atualizarBannerEspetaculoTotem();
      } catch (e) {
        console.warn('Erro ao carregar espetáculo no totem:', e);
      }

      initBuscaTotem();
      renderizarCategorias();
      renderizarProdutos();
    } catch (err) {
      console.error('Erro ao carregar dados do totem:', err);
    }
  }

  function atualizarBannerEspetaculoTotem() {
    const banner = document.getElementById('totem-banner-espetaculo');
    const tit = document.getElementById('totem-banner-espetaculo-titulo');
    const desc = document.getElementById('totem-banner-espetaculo-desc');
    const btn = document.getElementById('btn-totem-reservar-intervalo');

    if (!banner) return;

    const theaterHelper = window.TheaterMode || window.theaterMode;
    const isActive = theaterHelper && typeof theaterHelper.isTheaterModeActive === 'function'
      ? theaterHelper.isTheaterModeActive(espetaculoTotemConfig)
      : false;

    if (isActive) {
      const info = (theaterHelper && typeof theaterHelper.getTheaterIntervalInfo === 'function')
        ? theaterHelper.getTheaterIntervalInfo(espetaculoTotemConfig)
        : { nome: espetaculoTotemConfig?.espetaculo_nome || 'Espetáculo', horario: espetaculoTotemConfig?.espetaculo_horario_intervalo || '21:00' };

      if (tit) tit.textContent = `🎭 Hoje no Teatro Univates: ${info.nome}!`;
      if (desc) desc.textContent = `Peça agora e retire sem fila no intervalo das ${info.horario}.`;
      banner.classList.remove('hidden');

      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
          reservandoParaIntervaloTotem = !reservandoParaIntervaloTotem;
          if (reservandoParaIntervaloTotem) {
            btn.innerHTML = '✓ Reservado p/ Intervalo';
            btn.style.background = '#22c55e';
            btn.style.color = '#fff';
          } else {
            btn.innerHTML = '⚡ Reservar p/ o Intervalo';
            btn.style.background = '#fff';
            btn.style.color = '#6b21a8';
          }
        });
      }
    } else {
      banner.classList.add('hidden');
    }
  }

  function initBuscaTotem() {
    const input = document.getElementById('totem-input-busca');
    const btnLimpar = document.getElementById('btn-totem-limpar-busca');

    if (input && !input.dataset.bound) {
      input.dataset.bound = 'true';
      input.addEventListener('input', () => {
        termoBuscaTotem = (input.value || '').trim();
        if (btnLimpar) btnLimpar.style.display = termoBuscaTotem ? 'flex' : 'none';
        renderizarProdutos();
      });
    }

    if (btnLimpar && !btnLimpar.dataset.bound) {
      btnLimpar.dataset.bound = 'true';
      btnLimpar.addEventListener('click', () => {
        if (input) input.value = '';
        termoBuscaTotem = '';
        btnLimpar.style.display = 'none';
        renderizarProdutos();
        if (input) input.focus();
      });
    }
  }

  function renderizarCategorias() {
    if (!categoriesBar) return;
    categoriesBar.innerHTML = categorias.map((c) => {
      const active = c.id === categoriaAtivaId ? 'is-active' : '';
      const icone = c.icone || '☕';
      return `
        <button type="button" class="totem-cat-btn ${active}" data-cat-id="${esc(c.id)}">
          <span>${esc(icone)}</span>
          <span>${esc(c.nome)}</span>
        </button>
      `;
    }).join('');

    categoriesBar.querySelectorAll('.totem-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoriaAtivaId = btn.getAttribute('data-cat-id');
        renderizarCategorias();
        renderizarProdutos();
      });
    });
  }

  function obterPromoProduto(prod) {
    return promocoesAtivas.find((pr) => pr.produto_id === prod.id || (pr.categoria_id && pr.categoria_id === prod.categoria_id));
  }

  function renderizarProdutos() {
    if (!productsGrid) return;
    let lista = categoriaAtivaId
      ? produtos.filter((p) => p.categoria_id === categoriaAtivaId)
      : produtos;

    if (termoBuscaTotem) {
      if (window.SmartSearch && typeof window.SmartSearch.filterProducts === 'function') {
        lista = window.SmartSearch.filterProducts(produtos, termoBuscaTotem);
      } else {
        const q = termoBuscaTotem.toLowerCase();
        lista = produtos.filter((p) => p.nome.toLowerCase().includes(q) || (p.descricao && p.descricao.toLowerCase().includes(q)));
      }
    }

    if (lista.length === 0) {
      productsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px; color:var(--totem-text-sub); font-size:1.2rem;">Nenhum produto disponível nesta categoria no momento.</div>`;
      return;
    }

    productsGrid.innerHTML = lista.map((p) => {
      const img = p.imagem_data || p.imagem || 'assets/images/logo.webp';
      const promo = obterPromoProduto(p);
      let promoBadge = '';
      if (promo) {
        if (promo.tipo === 'percentual') promoBadge = `<div class="totem-product-card__promo">-${promo.percentual}% OFF</div>`;
        else if (promo.tipo === 'compre_leve') promoBadge = `<div class="totem-product-card__promo">Leve ${promo.qtd_leva} Pague ${promo.qtd_compra}</div>`;
        else if (promo.tipo === 'segunda_unidade') promoBadge = `<div class="totem-product-card__promo">2ª un. -${promo.percentual}%</div>`;
      }

      return `
        <article class="totem-product-card" data-prod-id="${esc(p.id)}">
          <div class="totem-product-card__img-wrap">
            ${promoBadge}
            <img src="${esc(img)}" alt="${esc(p.nome)}" class="totem-product-card__img" loading="lazy" onerror="this.src='assets/images/logo.webp'" />
          </div>
          <div class="totem-product-card__body">
            <h3 class="totem-product-card__title">${esc(p.nome)}</h3>
            <p class="totem-product-card__desc">${esc(p.descricao || '')}</p>
            <div class="totem-product-card__footer">
              <span class="totem-product-card__price">${fmtMoeda(p.preco)}</span>
              <button type="button" class="totem-btn-add">
                + Escolher
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    productsGrid.querySelectorAll('.totem-product-card').forEach((card) => {
      card.addEventListener('click', () => {
        const prodId = card.getAttribute('data-prod-id');
        const prod = produtos.find((x) => x.id === prodId);
        if (prod) abrirModalPersonalizarItem(prod);
      });
    });
  }

  // ── 6. PERSONALIZAÇÃO DO ITEM ──
  function obterAdicionaisPermitidos(prod) {
    if (!prod || !prod.permite_adicionais) return [];
    const idsPermitidos = vinculosAdicionais
      .filter((v) => v.produto_id === prod.id)
      .map((v) => v.adicional_id);
    return adicionais.filter((a) => idsPermitidos.includes(a.id));
  }

  function abrirModalPersonalizarItem(prod) {
    if (window.cafeteriaMenuAnalytics && prod) {
      window.cafeteriaMenuAnalytics.trackMenuEvent(window.cafeteriaSupabase || window.supabaseClient, {
        canal: 'totem',
        tipoEvento: 'view_item',
        produtoId: prod.id,
        produtoNome: prod.nome,
        valor: prod.preco
      });
    }

    const adicsPermitidos = obterAdicionaisPermitidos(prod);
    const isMeioAMeio = prod.tipo_montagem === 'meio_a_meio';

    itemEmEdicao = {
      produto: prod,
      quantidade: 1,
      adicionaisIds: [],
      sabores: [],
      observacoes: ''
    };

    itemModalTitle.textContent = prod.nome;

    let saboresHtml = '';
    if (isMeioAMeio) {
      const opcoesSabores = produtos.filter((p) => p.id !== prod.id && p.categoria_id === prod.categoria_id);
      const opts = opcoesSabores.map((s) => `<option value="${esc(s.id)}">${esc(s.nome)} (${fmtMoeda(s.preco * 0.5)})</option>`).join('');
      saboresHtml = `
        <div style="margin-bottom:18px;">
          <label style="font-weight:800; display:block; margin-bottom:8px;">Escolha os 2 sabores (Meio a Meio):</label>
          <select id="totem-sabor-1" style="width:100%; height:64px; border-radius:14px; border:2px solid var(--totem-border); padding:0 14px; font-size:1.05rem; font-weight:700; margin-bottom:10px;">
            ${opts}
          </select>
          <select id="totem-sabor-2" style="width:100%; height:64px; border-radius:14px; border:2px solid var(--totem-border); padding:0 14px; font-size:1.05rem; font-weight:700;">
            ${opts}
          </select>
        </div>
      `;
    }

    let adicsHtml = '';
    if (adicsPermitidos.length > 0) {
      adicsHtml = `
        <div style="margin-bottom:18px;">
          <label style="font-weight:800; display:block; margin-bottom:10px; font-size:1.08rem;">Deseja acrescentar algum adicional?</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
            ${adicsPermitidos.map((a) => `
              <button type="button" class="totem-choice-btn totem-adic-toggle" data-adic-id="${esc(a.id)}" style="min-height:68px; padding:10px 14px; flex-direction:row; justify-content:space-between;">
                <span>${esc(a.nome)}</span>
                <strong style="color:var(--totem-accent);">+ ${fmtMoeda(a.preco)}</strong>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    itemModalBody.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--totem-surface-alt); padding:16px; border-radius:16px; margin-bottom:18px;">
        <div>
          <div style="font-weight:800; font-size:1.25rem;">${fmtMoeda(prod.preco)}</div>
          <div style="font-size:0.92rem; color:var(--totem-text-sub);">${esc(prod.descricao || '')}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <button type="button" id="totem-item-qty-minus" class="totem-btn totem-btn--ghost" style="min-width:64px; padding:0;">−</button>
          <span id="totem-item-qty-val" style="font-size:1.6rem; font-weight:900; min-width:36px; text-align:center;">1</span>
          <button type="button" id="totem-item-qty-plus" class="totem-btn totem-btn--ghost" style="min-width:64px; padding:0;">+</button>
        </div>
      </div>
      ${saboresHtml}
      ${adicsHtml}
      <div>
        <label for="totem-item-obs" style="font-weight:800; display:block; margin-bottom:8px;">Observação (opcional):</label>
        <input type="text" id="totem-item-obs" maxlength="100" placeholder="Ex: Sem açúcar, bem quente, sem cebola..." style="width:100%; height:64px; border-radius:14px; border:2px solid var(--totem-border); padding:0 16px; font-size:1.05rem;" />
      </div>
    `;

    const qtyLbl = document.getElementById('totem-item-qty-val');
    document.getElementById('totem-item-qty-minus')?.addEventListener('click', () => {
      if (itemEmEdicao.quantidade > 1) {
        itemEmEdicao.quantidade--;
        qtyLbl.textContent = String(itemEmEdicao.quantidade);
      }
    });
    document.getElementById('totem-item-qty-plus')?.addEventListener('click', () => {
      if (itemEmEdicao.quantidade < 20) {
        itemEmEdicao.quantidade++;
        qtyLbl.textContent = String(itemEmEdicao.quantidade);
      }
    });

    itemModalBody.querySelectorAll('.totem-adic-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-adic-id');
        btn.classList.toggle('is-selected');
        if (itemEmEdicao.adicionaisIds.includes(id)) {
          itemEmEdicao.adicionaisIds = itemEmEdicao.adicionaisIds.filter((x) => x !== id);
        } else {
          itemEmEdicao.adicionaisIds.push(id);
        }
      });
    });

    modalItem.classList.remove('hidden');
  }

  btnCloseItemModal?.addEventListener('click', () => modalItem.classList.add('hidden'));
  btnCancelItemModal?.addEventListener('click', () => modalItem.classList.add('hidden'));

  btnConfirmItemModal?.addEventListener('click', () => {
    if (!itemEmEdicao) return;
    const prod = itemEmEdicao.produto;
    const obsInput = document.getElementById('totem-item-obs');
    itemEmEdicao.observacoes = (obsInput?.value || '').trim();

    if (prod.tipo_montagem === 'meio_a_meio') {
      const s1 = document.getElementById('totem-sabor-1')?.value;
      const s2 = document.getElementById('totem-sabor-2')?.value;
      if (s1 && s2) {
        itemEmEdicao.sabores = [
          { lado: '1', produto_id: s1 },
          { lado: '2', produto_id: s2 }
        ];
      }
    }

    const adicsObjs = itemEmEdicao.adicionaisIds
      .map((id) => adicionais.find((a) => a.id === id))
      .filter(Boolean);

    const precoAdics = adicsObjs.reduce((acc, a) => acc + Number(a.preco || 0), 0);
    let precoBase = Number(prod.preco || 0);
    if (prod.tipo_montagem === 'meio_a_meio' && itemEmEdicao.sabores.length === 2) {
      const p1 = Number(produtos.find((p) => p.id === itemEmEdicao.sabores[0].produto_id)?.preco || 0);
      const p2 = Number(produtos.find((p) => p.id === itemEmEdicao.sabores[1].produto_id)?.preco || 0);
      precoBase = (p1 * 0.5) + (p2 * 0.5);
    }

    carrinho.push({
      produto: prod,
      quantidade: itemEmEdicao.quantidade,
      adicionais: adicsObjs,
      sabores: itemEmEdicao.sabores,
      observacoes: itemEmEdicao.observacoes,
      precoUnitario: precoBase + precoAdics
    });

    if (window.cafeteriaMenuAnalytics && prod) {
      window.cafeteriaMenuAnalytics.trackMenuEvent(window.cafeteriaSupabase || window.supabaseClient, {
        canal: 'totem',
        tipoEvento: 'add_to_cart',
        produtoId: prod.id,
        produtoNome: prod.nome,
        valor: (precoBase + precoAdics) * itemEmEdicao.quantidade
      });
    }

    modalItem.classList.add('hidden');
    itemEmEdicao = null;
    atualizarBarraCarrinho();
  });

  // ── 7. CARRINHO E CÁLCULO DE TOTAL ──
  function calcularTotalCarrinho() {
    return carrinho.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
  }

  function atualizarBarraCarrinho() {
    const qtdTotal = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    const valorTotal = calcularTotalCarrinho();

    if (cartCountEl) cartCountEl.textContent = String(qtdTotal);
    if (cartTotalEl) cartTotalEl.textContent = fmtMoeda(valorTotal);

    const vazio = carrinho.length === 0;
    if (btnLimpar) btnLimpar.disabled = vazio;
    if (btnAvancar) btnAvancar.disabled = vazio;
  }

  function limparCarrinhoSilencioso() {
    carrinho = [];
    jaMostrouSugestoesNoCiclo = false;
    reservandoParaIntervaloTotem = false;
    const btnReservar = document.getElementById('btn-totem-reservar-intervalo');
    if (btnReservar) {
      btnReservar.innerHTML = '⚡ Reservar p/ o Intervalo';
      btnReservar.style.background = '#fff';
      btnReservar.style.color = '#6b21a8';
    }
    if (inputNome) inputNome.value = '';
    atualizarBarraCarrinho();
  }

  btnLimpar?.addEventListener('click', () => {
    limparCarrinhoSilencioso();
  });

  // ── 8. SUGESTÕES DE COMPLEMENTO (ATÉ 3 POR PEDIDO) ──
  function obterSugestoesParaCarrinho() {
    const idsNoCarrinho = new Set(carrinho.map((i) => i.produto.id));
    const catsNoCarrinho = new Set(carrinho.map((i) => i.produto.categoria_id));

    const sugeridos = [];
    let fraseCustom = 'Separamos algumas sugestões deliciosas que combinam com sua escolha:';

    // 1. Sugestões configuradas no Admin (totem_sugestoes)
    for (const regra of sugestoesConfig) {
      if (sugeridos.length >= 3) break;
      const bateCategoria = !regra.gatilho_categoria_id || catsNoCarrinho.has(regra.gatilho_categoria_id);
      const bateProduto = !regra.gatilho_produto_id || idsNoCarrinho.has(regra.gatilho_produto_id);
      if (bateCategoria && bateProduto && !idsNoCarrinho.has(regra.produto_sugerido_id)) {
        const prod = produtos.find((p) => p.id === regra.produto_sugerido_id);
        if (prod && !sugeridos.some((s) => s.id === prod.id)) {
          sugeridos.push(prod);
          if (regra.frase_destaque) fraseCustom = regra.frase_destaque;
        }
      }
    }

    // 2. Fallback inteligente: sugere itens populares ou de outras categorias (ex: salgados/doces quando tem café)
    if (sugeridos.length < 3) {
      const candidatos = produtos.filter((p) => !idsNoCarrinho.has(p.id) && !sugeridos.some((s) => s.id === p.id));
      const outraCat = candidatos.filter((p) => !catsNoCarrinho.has(p.categoria_id));
      const pool = outraCat.length > 0 ? outraCat : candidatos;
      for (const p of pool) {
        if (sugeridos.length >= 3) break;
        sugeridos.push(p);
      }
    }

    return { itens: sugeridos.slice(0, 3), frase: fraseCustom };
  }

  function avancarFluxoPedido() {
    if (carrinho.length === 0) return;

    if (!jaMostrouSugestoesNoCiclo) {
      const { itens, frase } = obterSugestoesParaCarrinho();
      if (itens.length > 0) {
        jaMostrouSugestoesNoCiclo = true;
        abrirModalSugestoes(itens, frase);
        return;
      }
    }
    abrirModalCheckout();
  }

  btnAvancar?.addEventListener('click', avancarFluxoPedido);
  btnVerSacola?.addEventListener('click', avancarFluxoPedido);

  function abrirModalSugestoes(itensSugeridos, frase) {
    if (sugestoesFrase) sugestoesFrase.textContent = frase;
    sugestoesList.innerHTML = itensSugeridos.map((p) => {
      const img = p.imagem_data || p.imagem || 'assets/images/logo.webp';
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; background:var(--totem-surface-alt); border:2px solid var(--totem-border); border-radius:18px; padding:12px 16px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <img src="${esc(img)}" alt="${esc(p.nome)}" style="width:72px; height:72px; border-radius:14px; object-fit:cover;" onerror="this.src='assets/images/logo.webp'" />
            <div>
              <div style="font-weight:800; font-size:1.15rem;">${esc(p.nome)}</div>
              <div style="font-weight:800; color:var(--totem-primary); font-size:1.1rem;">+ ${fmtMoeda(p.preco)}</div>
            </div>
          </div>
          <button type="button" class="totem-btn totem-btn--accent btn-add-sugestao-rapida" data-prod-id="${esc(p.id)}" style="min-height:64px; padding:0 20px;">
            + Adicionar
          </button>
        </div>
      `;
    }).join('');

    sugestoesList.querySelectorAll('.btn-add-sugestao-rapida').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prodId = btn.getAttribute('data-prod-id');
        const prod = produtos.find((x) => x.id === prodId);
        if (prod) {
          carrinho.push({
            produto: prod,
            quantidade: 1,
            adicionais: [],
            sabores: [],
            observacoes: '',
            precoUnitario: Number(prod.preco || 0)
          });
          atualizarBarraCarrinho();
          btn.textContent = '✓ Adicionado';
          btn.disabled = true;
        }
      });
    });

    modalSugestoes.classList.remove('hidden');
  }

  btnCloseSugestoes?.addEventListener('click', () => modalSugestoes.classList.add('hidden'));
  btnPularSugestoes?.addEventListener('click', () => {
    modalSugestoes.classList.add('hidden');
    abrirModalCheckout();
  });

  // ── 9. CHECKOUT E ENVIO DO PEDIDO ──
  function abrirModalCheckout() {
    if (window.cafeteriaMenuAnalytics && carrinho.length > 0) {
      window.cafeteriaMenuAnalytics.trackMenuEvent(window.cafeteriaSupabase || window.supabaseClient, {
        canal: 'totem',
        tipoEvento: 'begin_checkout'
      });
    }

    renderizarListaCheckout();

    if (window.cafeteriaCashback) {
      try {
        const sb = window.cafeteriaSupabase || window.supabaseClient;
        const promptEl = document.getElementById('totem-cashback-prompt');
        if (promptEl) {
          (async () => {
            try {
              const cfg = await (window.cafeteriaCashback.loadCashbackConfig 
                ? window.cafeteriaCashback.loadCashbackConfig(sb) 
                : Promise.resolve(null));
              if (window.cafeteriaCashback.isCashbackActive(cfg)) {
                const prompt = window.cafeteriaCashback.getCashbackPrompt(cfg);
                if (prompt) {
                  promptEl.textContent = prompt;
                  promptEl.style.display = 'block';
                  return;
                }
              }
              promptEl.style.display = 'none';
            } catch (_) {
              promptEl.style.display = 'none';
            }
          })();
        }
      } catch (_) {}
    }

    modalCheckout.classList.remove('hidden');
    setTimeout(() => inputNome?.focus(), 150);
  }

  function renderizarListaCheckout() {
    if (!checkoutItemsList) return;
    if (carrinho.length === 0) {
      modalCheckout.classList.add('hidden');
      return;
    }

    checkoutItemsList.innerHTML = carrinho.map((item, idx) => {
      const adicsTxt = item.adicionais.length > 0
        ? `<div style="font-size:0.85rem; color:var(--totem-text-sub);">+ ${item.adicionais.map((a) => esc(a.nome)).join(', ')}</div>`
        : '';
      const obsTxt = item.observacoes
        ? `<div style="font-size:0.85rem; color:#B45309;">Obs: ${esc(item.observacoes)}</div>`
        : '';
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:#FFF; padding:10px 14px; border-radius:12px; border:1px solid var(--totem-border);">
          <div>
            <div style="font-weight:800;">${item.quantidade}x ${esc(item.produto.nome)}</div>
            ${adicsTxt}
            ${obsTxt}
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <strong style="font-size:1.05rem;">${fmtMoeda(item.precoUnitario * item.quantidade)}</strong>
            <button type="button" class="btn-rm-checkout-item" data-idx="${idx}" style="width:48px; height:48px; border-radius:12px; border:1px solid #FECACA; background:#FEF2F2; color:#DC2626; font-weight:800; cursor:pointer;">✕</button>
          </div>
        </div>
      `;
    }).join('');

    checkoutItemsList.querySelectorAll('.btn-rm-checkout-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        carrinho.splice(idx, 1);
        atualizarBarraCarrinho();
        renderizarListaCheckout();
      });
    });

    const subtotal = calcularTotalCarrinho();
    if (totemCupomAplicado) {
      const check = window.couponValidator ? window.couponValidator.validateCouponLocally(totemCupomAplicado, subtotal) : { valid: false };
      if (!check.valid) {
        totemCupomAplicado = null;
        if (totemCupomFeedback) {
          totemCupomFeedback.textContent = `⚠️ ${check.message}`;
          totemCupomFeedback.style.color = '#B45309';
          totemCupomFeedback.style.display = 'block';
        }
      } else {
        totemCupomAplicado.desconto_calculado = check.desconto_calculado;
      }
    }

    if (checkoutTotalLbl) {
      if (totemCupomAplicado && totemCupomAplicado.desconto_calculado > 0) {
        const finalVal = Math.max(0, subtotal - totemCupomAplicado.desconto_calculado);
        checkoutTotalLbl.innerHTML = `<span style="font-size:0.95rem; text-decoration:line-through; color:#94A3B8; margin-right:6px;">${fmtMoeda(subtotal)}</span> ${fmtMoeda(finalVal)} <span style="font-size:0.85rem; color:#15803D; font-weight:700;">(-${fmtMoeda(totemCupomAplicado.desconto_calculado)})</span>`;
      } else {
        checkoutTotalLbl.textContent = fmtMoeda(subtotal);
      }
    }
  }

  btnTotemAplicarCupom?.addEventListener('click', async () => {
    const code = (totemInputCupom?.value || '').trim();
    if (!code) {
      if (totemCupomFeedback) {
        totemCupomFeedback.textContent = 'Informe o código do cupom.';
        totemCupomFeedback.style.color = '#DC2626';
        totemCupomFeedback.style.display = 'block';
      }
      return;
    }

    const subtotal = calcularTotalCarrinho();
    const validator = window.couponValidator;
    const sb = window.cafeteriaSupabase;

    let res = null;
    if (validator && sb) {
      res = await validator.validateCouponWithSupabase(sb, code, subtotal);
    } else {
      res = { valid: false, message: 'Validador de cupons não disponível.' };
    }

    if (res && res.valid) {
      totemCupomAplicado = res;
      if (totemCupomFeedback) {
        totemCupomFeedback.textContent = `🎉 ${res.message} (- ${fmtMoeda(res.desconto_calculado)})`;
        totemCupomFeedback.style.color = '#15803D';
        totemCupomFeedback.style.display = 'block';
      }
    } else {
      totemCupomAplicado = null;
      if (totemCupomFeedback) {
        totemCupomFeedback.textContent = `❌ ${res ? res.message : 'Cupom inválido.'}`;
        totemCupomFeedback.style.color = '#DC2626';
        totemCupomFeedback.style.display = 'block';
      }
    }
    renderizarListaCheckout();
  });

  btnComerAqui?.addEventListener('click', () => {
    paraViagem = false;
    btnComerAqui.classList.add('is-selected');
    btnParaViagem.classList.remove('is-selected');
  });

  btnParaViagem?.addEventListener('click', () => {
    paraViagem = true;
    btnParaViagem.classList.add('is-selected');
    btnComerAqui.classList.remove('is-selected');
  });

  document.querySelectorAll('#totem-pagamento-choices .totem-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#totem-pagamento-choices .totem-choice-btn').forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      formaPagamentoEscolhida = btn.getAttribute('data-forma') || 'pix';
    });
  });

  btnCloseCheckout?.addEventListener('click', () => modalCheckout.classList.add('hidden'));
  btnBackCheckout?.addEventListener('click', () => modalCheckout.classList.add('hidden'));

  btnEnviarPedido?.addEventListener('click', async () => {
    const nome = (inputNome?.value || '').trim();
    if (nome.length < 2) {
      inputNome?.focus();
      inputNome.style.borderColor = '#DC2626';
      return;
    }
    inputNome.style.borderColor = '';

    if (!navigator.onLine) {
      atualizarStatusRede();
      return;
    }

    btnEnviarPedido.disabled = true;
    const originalTxt = btnEnviarPedido.innerHTML;
    btnEnviarPedido.innerHTML = '⏳ Gerando sua senha...';

    try {
      const subtotalPedido = calcularTotalCarrinho();

      let retiradaEmIso = null;
      const theaterHelper = window.TheaterMode || window.theaterMode;
      if (reservandoParaIntervaloTotem && espetaculoTotemConfig && theaterHelper?.calculateIntervalRetiradaEm) {
        retiradaEmIso = theaterHelper.calculateIntervalRetiradaEm(espetaculoTotemConfig);
      }

      const payload = {
        cliente_nome: nome,
        para_viagem: paraViagem,
        forma_pagamento: formaPagamentoEscolhida,
        cupom_codigo: totemCupomAplicado?.cupom_codigo || null,
        campanha_id: totemCupomAplicado?.campanha_id || null,
        desconto_cupom: totemCupomAplicado?.desconto_calculado || 0,
        is_intervalo: Boolean(reservandoParaIntervaloTotem),
        retirada_em: retiradaEmIso,
        espetaculo_nome: (reservandoParaIntervaloTotem && espetaculoTotemConfig) ? (espetaculoTotemConfig.nome || espetaculoTotemConfig.espetaculo_nome) : null,
        horario_retirada: (reservandoParaIntervaloTotem && espetaculoTotemConfig) ? (espetaculoTotemConfig.horario_intervalo || espetaculoTotemConfig.espetaculo_horario_intervalo) : null,
        itens: carrinho.map((item) => ({
          produto_id: item.produto.id,
          quantidade: item.quantidade,
          adicionais: item.adicionais.map((a) => a.id),
          sabores: item.sabores,
          observacoes: item.observacoes
        }))
      };

      const idempotencyKey = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : null;

      const { data, error } = await window.cafeteriaSupabase.rpc('criar_pedido_totem', {
        p_token: totemToken,
        p_payload: payload,
        p_idempotency_key: idempotencyKey
      });

      if (error) throw error;

      reservandoParaIntervaloTotem = false;
      const btnReservar = document.getElementById('btn-totem-reservar-intervalo');
      if (btnReservar) {
        btnReservar.innerHTML = '⚡ Reservar p/ o Intervalo';
        btnReservar.style.background = '#fff';
        btnReservar.style.color = '#6b21a8';
      }

      const novoPedidoId = data?.pedido_id || data?.id;
      if (totemCupomAplicado && totemCupomAplicado.campanha_id && window.couponValidator && novoPedidoId) {
        try {
          await window.couponValidator.registerCouponUsage(window.cafeteriaSupabase, totemCupomAplicado.campanha_id, novoPedidoId);
        } catch (couponErr) {
          console.warn('[Totem] Falha ao registrar uso de cupom:', couponErr);
        }
      }
      totemCupomAplicado = null;
      if (totemInputCupom) totemInputCupom.value = '';
      if (totemCupomFeedback) totemCupomFeedback.style.display = 'none';

      ultimoPedidoGerado = {
        numero_pedido: data.numero_pedido || data.pedido_id,
        total: Number(data.total || calcularTotalCarrinho()),
        cliente_nome: nome,
        para_viagem: paraViagem,
        forma_pagamento: formaPagamentoEscolhida,
        itens: [...carrinho]
      };

      modalCheckout.classList.add('hidden');

      if (window.cafeteriaMenuAnalytics) {
        window.cafeteriaMenuAnalytics.trackMenuEvent(window.cafeteriaSupabase || window.supabaseClient, {
          canal: 'totem',
          tipoEvento: 'purchase',
          valor: valorTotalComDesconto
        });
      }

      await exibirTelaSenhaFinal(ultimoPedidoGerado);
      limparCarrinhoSilencioso();
    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes('TOTEM_REVOGADO')) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        totemToken = '';
        modalCheckout.classList.add('hidden');
        exibirTelaPareamento(true);
      } else {
        alert('Não foi possível registrar o pedido: ' + msg);
      }
    } finally {
      btnEnviarPedido.disabled = false;
      btnEnviarPedido.innerHTML = originalTxt;
    }
  });

  // ── 10. TELA FINAL DE SENHA (15s AUTO-RESET) ──
  async function exibirTelaSenhaFinal(pedido) {
    if (successClienteLbl) {
      successClienteLbl.textContent = `${pedido.cliente_nome}, seu pedido foi enviado! (${pedido.para_viagem ? 'Para Viagem' : 'Comer Aqui'})`;
    }
    if (successSenhaLbl) {
      successSenhaLbl.textContent = `#${pedido.numero_pedido}`;
    }
    if (successTotalLbl) {
      successTotalLbl.textContent = `Total a pagar no caixa: ${fmtMoeda(pedido.total)}`;
    }

    // Se escolheu PIX e houver chave configurada, exibe o QR Code PIX
    if (pedido.forma_pagamento === 'pix' && window.cafeteriaPix) {
      try {
        const cfg = await window.cafeteriaPix.obterConfigPix();
        const res = window.cafeteriaPix.gerarPayloadPix({
          chave: cfg.chave,
          recebedor: cfg.recebedor,
          cidade: cfg.cidade,
          valor: pedido.total,
          txid: `TOTEM${pedido.numero_pedido}`
        });
        if (res.ok && successPixBox && successPixQr) {
          successPixQr.innerHTML = window.cafeteriaPix.gerarQrSvg(res.payload, 3, 1);
          successPixBox.classList.remove('hidden');
        } else {
          successPixBox?.classList.add('hidden');
        }
      } catch (e) {
        successPixBox?.classList.add('hidden');
      }
    } else {
      successPixBox?.classList.add('hidden');
    }

    successScreen.classList.remove('hidden');

    let segundos = 15;
    if (successCountdownLbl) successCountdownLbl.textContent = String(segundos);
    clearInterval(successCountdownInterval);
    successCountdownInterval = setInterval(() => {
      segundos--;
      if (successCountdownLbl) successCountdownLbl.textContent = String(Math.max(0, segundos));
      if (segundos <= 0) {
        clearInterval(successCountdownInterval);
        successScreen.classList.add('hidden');
        mostrarTelaDescanso();
      }
    }, 1000);
  }

  btnNovoPedido?.addEventListener('click', () => {
    clearInterval(successCountdownInterval);
    successScreen.classList.add('hidden');
    registrarToqueAtividade();
  });

  btnPrintSenha?.addEventListener('click', () => {
    if (!ultimoPedidoGerado) return;
    const win = window.open('', '_blank', 'width=340,height=480');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Senha #${ultimoPedidoGerado.numero_pedido}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body { font-family: monospace; text-align: center; margin: 0; padding: 8px; }
          .senha { font-size: 42px; font-weight: bold; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div><strong>CAFETERIA DO TEATRO</strong></div>
        <div>SENHA DE AUTOATENDIMENTO</div>
        <div class="senha">#${ultimoPedidoGerado.numero_pedido}</div>
        <div>Cliente: ${esc(ultimoPedidoGerado.cliente_nome)}</div>
        <div>${ultimoPedidoGerado.para_viagem ? 'PARA VIAGEM' : 'CONSUMO LOCAL'}</div>
        <hr/>
        <div><strong>Total a pagar no caixa: ${fmtMoeda(ultimoPedidoGerado.total)}</strong></div>
        <div style="margin-top:8px; font-size:11px;">Dirija-se ao caixa para pagamento e acompanhe sua senha na TV!</div>
        <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 400); };<\/script>
      </body>
      </html>
    `);
    win.document.close();
  });

  function fecharTodosModais() {
    modalItem?.classList.add('hidden');
    modalSugestoes?.classList.add('hidden');
    modalCheckout?.classList.add('hidden');
  }

  // ── 11. INICIALIZAÇÃO ──
  async function init() {
    atualizarStatusRede();
    const ok = await validarSessao();
    if (ok) {
      if (window.cafeteriaMenuAnalytics) {
        window.cafeteriaMenuAnalytics.trackMenuEvent(window.cafeteriaSupabase || window.supabaseClient, {
          canal: 'totem',
          tipoEvento: 'sessao_cardapio'
        });
      }

      await carregarDadosCardapio();
      registrarToqueAtividade();
    }
    // Heartbeat a cada 60s para validar se o token não foi revogado e expirar pedidos antigos
    setInterval(() => {
      if (totemToken && navigator.onLine) {
        validarSessao();
      }
    }, 60000);

    // CAF-000064: Manter tela do totem sempre ligada
    if (window.WakeLockUtil) {
      window.WakeLockUtil.setupAutoWakeLock({ defaultActive: true });
    } else {
      window.addEventListener('load', () => {
        window.WakeLockUtil?.setupAutoWakeLock({ defaultActive: true });
      });
    }
  }

  init();
})();
