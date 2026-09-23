/* =========================================================
   PEDIDOS.JS — Lógica do PDV do Barista / Atendimento
   ========================================================= */

(function () {
  'use strict';

  if (!window.escapeHtml) {
    window.escapeHtml = function(unsafe) {
      if (!unsafe) return '';
      return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
  }

  // Refs de Telas e Navegação
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

  const navBtnNovo = document.getElementById('nav-btn-novo');
  const navBtnMesas = document.getElementById('nav-btn-mesas');
  const viewNovoPedido = document.getElementById('view-novo-pedido');
  const viewMesasPedidos = document.getElementById('view-mesas-pedidos');
  const badgeProntos = document.getElementById('badge-prontos');

  // Refs Novo Pedido
  const mesaSelect = document.getElementById('mesa-select');
  const productSearch = document.getElementById('product-search');
  const categoriesTabs = document.getElementById('categories-tabs');
  const productsGrid = document.getElementById('products-grid');
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalValue = document.getElementById('cart-total-value');
  const cartMesaBadge = document.getElementById('cart-mesa-badge');
  const btnEnviarPedido = document.getElementById('btn-enviar-pedido');
  const pedidoObs = document.getElementById('pedido-obs');
  const pedidoClienteNome = document.getElementById('pedido-cliente-nome');
  const pedidoParaViagem = document.getElementById('pedido-para-viagem');
  const pedidoPagamento = document.getElementById('pedido-pagamento');
  const pedidoPago = document.getElementById('pedido-pago');

  // Refs Mobile Carrinho & Drawer
  const mobileCartBar = document.getElementById('mobile-cart-bar');
  const mobileCartCount = document.getElementById('mobile-cart-count');
  const mobileCartTotal = document.getElementById('mobile-cart-total');
  const btnOpenMobileCart = document.getElementById('btn-open-mobile-cart');
  const btnCloseCartDrawer = document.getElementById('btn-close-cart-drawer');
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');

  // Refs Mesas & Acompanhamento
  const mesasGrid = document.getElementById('mesas-grid');
  const pedidosCardsGrid = document.getElementById('pedidos-cards-grid');
  const filtroChips = document.querySelectorAll('.status-filters .filter-chip');

  // Refs Modais
  const modalObs = document.getElementById('modal-obs');
  const modalObsTitle = document.getElementById('modal-obs-title');
  const modalObsInput = document.getElementById('modal-obs-input');
  const modalObsSave = document.getElementById('modal-obs-save');
  const modalObsClose = document.getElementById('modal-obs-close');
  const modalObsCancel = document.getElementById('modal-obs-cancel');

  const modalMontagem = document.getElementById('modal-montagem');
  const modalMontagemTitle = document.getElementById('modal-montagem-title');
  const modalMontagemList = document.getElementById('montagem-adicionais-list');
  const modalMontagemObs = document.getElementById('modal-montagem-obs');
  const modalMontagemTotal = document.getElementById('montagem-total');
  const modalMontagemCancel = document.getElementById('modal-montagem-cancel');
  const modalMontagemSave = document.getElementById('modal-montagem-save');
  const modalMontagemClose = document.getElementById('modal-montagem-close');

  const modalMesa = document.getElementById('modal-mesa');
  const modalMesaTitle = document.getElementById('modal-mesa-title');
  const modalMesaBody = document.getElementById('modal-mesa-body');
  const modalMesaClose = document.getElementById('modal-mesa-close');
  const modalMesaFechar = document.getElementById('modal-mesa-fechar');
  const modalMesaPrint = document.getElementById('modal-mesa-print');
  const modalMesaFecharConta = document.getElementById('modal-mesa-fechar-conta');
  const btnMesaTransferir = document.getElementById('btn-mesa-transferir');
  const btnMesaJuntar = document.getElementById('btn-mesa-juntar');
  const modalTransferirMesa = document.getElementById('modal-transferir-mesa');
  const modalTransferirTitle = document.getElementById('modal-transferir-title');
  const selectTransferirMesa = document.getElementById('transferir-mesa-select');
  const btnTransferirClose = document.getElementById('modal-transferir-close');
  const btnTransferirCancel = document.getElementById('modal-transferir-cancel');
  const btnTransferirConfirm = document.getElementById('modal-transferir-confirm');
  let acaoTransferenciaAtiva = null;
  let mesaAlvoTransferencia = null;

  const btnMesaAdicionarItens = document.getElementById('btn-mesa-adicionar-itens');
  const bannerAdicionandoItens = document.getElementById('banner-adicionando-itens');
  const lblMesaAdicionando = document.getElementById('lbl-mesa-adicionando');
  const btnCancelarAdicao = document.getElementById('btn-cancelar-adicao');

  const modalFecharConta = document.getElementById('modal-fechar-conta');
  const fecharContaTitle = document.getElementById('modal-fechar-conta-title');
  const fecharContaClose = document.getElementById('modal-fechar-conta-close');
  const fecharContaCancelar = document.getElementById('modal-fechar-conta-cancelar');
  const fecharContaConfirmar = document.getElementById('modal-fechar-conta-confirmar');
  const fecharContaResumo = document.getElementById('fechar-conta-resumo-pedidos');
  const fecharContaTotalLbl = document.getElementById('fechar-conta-total-lbl');
  const fecharContaJaPagoLbl = document.getElementById('fechar-conta-ja-pago-lbl');
  const fecharContaAPagarLbl = document.getElementById('fechar-conta-a-pagar-lbl');
  const fecharContaFaltaLbl = document.getElementById('fechar-conta-falta-lbl');
  const fecharContaForma = document.getElementById('fechar-conta-forma');
  const fecharContaValor = document.getElementById('fechar-conta-valor');
  const btnAddPagamento = document.getElementById('btn-add-pagamento');
  const divDinheiroRecebido = document.getElementById('div-dinheiro-recebido');
  const inputDinheiroRecebido = document.getElementById('fechar-conta-dinheiro-recebido');
  const fecharContaTrocoLbl = document.getElementById('fechar-conta-troco-lbl');
  const fecharContaLista = document.getElementById('fechar-conta-lista-pagamentos');

  const fecharContaModo = document.getElementById('fechar-conta-modo');
  const fecharContaDivPessoas = document.getElementById('fechar-conta-div-pessoas');
  const fecharContaNumPessoas = document.getElementById('fechar-conta-num-pessoas');
  const btnGerarPartesIgual = document.getElementById('btn-gerar-partes-igual');
  const fecharContaDivAddParte = document.getElementById('fechar-conta-div-add-parte');
  const fecharContaNomeParte = document.getElementById('fechar-conta-nome-parte');
  const btnAddParteItem = document.getElementById('btn-add-parte-item');
  const fecharContaListaPartes = document.getElementById('fechar-conta-lista-partes');
  const fecharContaPainelPagamento = document.getElementById('fechar-conta-painel-pagamento');
  const tituloPagamentoParte = document.getElementById('titulo-pagamento-parte');
  const fecharContaImprimirCupom = document.getElementById('fechar-conta-imprimir-cupom');


  const audioPronto = document.getElementById('audio-pronto');

  // Estado
  let currentUser = null;
  let allProducts = [];
  let allAdicionais = [];
  let allVinculosProduto = [];
  let currentCategory = '';
  let searchQuery = '';
  let cart = []; // Array de { produto, quantidade, observacoes, adicionaisSelecionados: [] }
  let mesas = [];
  let activePedidos = [];
  let currentFilterStatus = 'todos';
  let activeObsCartIndex = null;
  let activeMontagemItem = null; // Guardará o item temporário da montagem
  let currentSelectedMesaParaConta = null;
  
  let currentFechamento = {
    mesaCodigo: null,
    pedidos: [],
    totalConta: 0,
    jaPago: 0,
    aPagar: 0,
    pagamentos: [],
    valorRecebidoDinheiro: 0
  };

  let activePromos = [];
  let cortesiasDisponiveis = [];

  // -----------------------------------------------------
  // 1. AUTENTICAÇÃO
  // -----------------------------------------------------
  async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data && data.session) {
      await loadProfile(data.session.user);
    }
  }

  // -----------------------------------------------------
  // TOAST COMPONENT
  // -----------------------------------------------------
  window.showToast = function(message, actionText = null, actionCallback = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);
    
    let isRemoved = false;
    const removeToast = () => {
      if (isRemoved) return;
      isRemoved = true;
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    };

    if (actionText && actionCallback) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.textContent = actionText;
      actionBtn.onclick = () => {
        actionCallback();
        removeToast();
      };
      toast.appendChild(actionBtn);
    }
    
    container.appendChild(toast);
    setTimeout(removeToast, 4000);
  };

  window.showConfirm = function(title, msg) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('modal-confirm-title');
      const msgEl = document.getElementById('modal-confirm-msg');
      const btnCancel = document.getElementById('modal-confirm-cancel');
      const btnOk = document.getElementById('modal-confirm-ok');
      
      if (!modal) {
        resolve(confirm(msg));
        return;
      }
      
      titleEl.textContent = title;
      msgEl.textContent = msg;
      
      const close = (result) => {
        modal.classList.add('hidden');
        btnCancel.onclick = null;
        btnOk.onclick = null;
        resolve(result);
      };
      
      btnCancel.onclick = () => close(false);
      btnOk.onclick = () => close(true);
      
      modal.classList.remove('hidden');
    });
  };

  window.baristaCancelarItem = async function(itemId, pedidoId, mesaCodigo) {
    const motivo = prompt('Motivo do cancelamento (Ex: Cliente desistiu, Lançado errado, Em falta):');
    if (!motivo) return;

    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('cancelar_item', {
        p_item_id: itemId,
        p_motivo: motivo
      });

      if (error) throw error;
      
      alert('Item cancelado com sucesso!');
      
      // Checar se todos os itens foram cancelados (fazendo fetch)
      const { data: itens, error: itErr } = await window.cafeteriaSupabase
        .from('pedido_itens')
        .select('cancelado')
        .eq('pedido_id', pedidoId);
        
      if (!itErr && itens && itens.every(i => i.cancelado === true)) {
        if (confirm('Todos os itens deste pedido foram cancelados. Deseja cancelar o pedido inteiro também?')) {
          await window.cafeteriaSupabase
            .from('pedidos')
            .update({ status: 'cancelado', updated_at: new Date().toISOString() })
            .eq('id', pedidoId);
          alert('Pedido cancelado!');
        }
      }

      carregarPainel(); // Recarrega PDV
      if (currentSelectedMesaParaConta && currentSelectedMesaParaConta.mesaCodigo === mesaCodigo) {
        // Atualiza a view da mesa
        const pd = window.cafeteriaDadosPainel.pedidosPendentes.filter(p => p.mesa_codigo === mesaCodigo);
        abrirModalMesa(mesaCodigo, pd);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao cancelar item: ' + err.message);
    }
  };

  window.baristaLancarCortesia = async function(pedidoId, itemId, produtoCortesiaId) {
    const confirmed = await showConfirm('Lançar Cortesia', 'Deseja lançar esta cortesia agora?');
    if (!confirmed) return;
    
    const payload = [{
      produto_id: produtoCortesiaId,
      quantidade: 1,
      observacoes: 'Cortesia lançada via mesa',
      cortesia_de_item_id: itemId
    }];
    
    const { data, error } = await window.cafeteriaSupabase.rpc('adicionar_itens_pedido', {
      p_pedido_id: pedidoId,
      p_itens: payload
    });
    
    if (error) {
      showToast("Erro ao lançar cortesia: " + error.message);
    } else {
      fecharModalMesa();
      loadActivePedidos();
    }
  };

  async function loadProfile(user) {
    const { data: perfil, error } = await window.cafeteriaSupabase
      .from('perfis')
      .select('nome, role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar perfil:', error);
      alert('Erro ao consultar banco de dados: ' + error.message);
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    if (!perfil) {
      alert(`O usuário (${user.email || user.id}) está autenticado, mas não possui um registro cadastrado na tabela "perfis".\n\nAdicione o usuário na tabela "perfis" com o perfil "barista" ou "admin" para liberar o acesso.`);
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    if (perfil.role !== 'barista' && perfil.role !== 'admin') {
      alert('Acesso negado. Apenas baristas e administradores podem usar esta tela.');
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    currentUser = { ...user, perfil };
    document.getElementById('user-name').textContent = perfil.nome;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    await loadInitialData();
    setupRealtime();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    const btn = document.getElementById('login-btn');
    
    btn.disabled = true;
    btn.textContent = 'Autenticando...';
    loginError.textContent = '';

    const { data, error } = await window.cafeteriaSupabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginError.textContent = 'E-mail ou senha incorretos.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    await loadProfile(data.user);
  });

  btnLogout.addEventListener('click', async () => {
    await window.cafeteriaSupabase.auth.signOut();
    window.location.reload();
  });

  // -----------------------------------------------------
  // 2. NAVEGAÇÃO ENTRE ABAS
  // -----------------------------------------------------
  function switchTab(tabName) {
    if (tabName === 'novo') {
      navBtnNovo.classList.add('active');
      navBtnMesas.classList.remove('active');
      viewNovoPedido.classList.remove('hidden');
      viewMesasPedidos.classList.add('hidden');
    } else {
      navBtnNovo.classList.remove('active');
      navBtnMesas.classList.add('active');
      viewNovoPedido.classList.add('hidden');
      viewMesasPedidos.classList.remove('hidden');
      loadActivePedidos();
    }
  }

  navBtnNovo.addEventListener('click', () => switchTab('novo'));
  navBtnMesas.addEventListener('click', () => switchTab('mesas'));

  // -----------------------------------------------------
  // 3. CARREGAMENTO DE DADOS (Mesas e Cardápio)
  // -----------------------------------------------------
  async function loadInitialData() {
    await Promise.all([
      loadMesas(),
      loadProdutos(),
      loadAdicionais(),
      loadActivePedidos(),
      loadPromocoes()
    ]);
  }

  async function loadPromocoes() {
    const { data, error } = await window.cafeteriaSupabase.rpc('promocoes_do_dia');
    if (!error && data) {
      activePromos = data;
    }
  }

  async function loadAdicionais() {
    const [{ data }, { data: vinculosData }] = await Promise.all([
      window.cafeteriaSupabase
        .from('adicionais')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true }),
      window.cafeteriaSupabase
        .from('v_adicionais_produto')
        .select('*')
    ]);
    
    if (data) {
      allAdicionais = data;
    }
    if (vinculosData) {
      allVinculosProduto = vinculosData;
    }
  }

  async function loadMesas() {
    const { data: mesasData } = await window.cafeteriaSupabase
      .from('mesas')
      .select('*')
      .eq('ativo', true)
      .order('codigo');
    
    if (mesasData) {
      mesas = mesasData;
      updateMesaSelectOptions();
    }
  }

  function updateMesaSelectOptions() {
    const selectedVal = mesaSelect.value;
    mesaSelect.innerHTML = '<option value="">Selecione a Mesa...</option>';

    mesas.forEach(m => {
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === m.codigo);
      const hasOpen = pedidosMesa.length > 0;
      const opt = document.createElement('option');
      opt.value = m.codigo;
      opt.textContent = `${m.codigo} — ${m.descricao || ''} ${hasOpen ? '🔴 (' + pedidosMesa.length + ' em aberto)' : '🟢 Livre'}`;
      mesaSelect.appendChild(opt);
    });

    if (selectedVal) {
      mesaSelect.value = selectedVal;
    }
  }

  async function loadProdutos() {
    const { data: produtosData } = await window.cafeteriaSupabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('ordem');

    if (produtosData) {
      allProducts = produtosData;
      renderCategories();
      const firstCat = [...new Set(allProducts.map(p => p.categoria_id))][0];
      if (firstCat) setCategory(firstCat);
    }
  }

  function renderCategories() {
    const catIds = [...new Set(allProducts.map(p => p.categoria_id))];
    categoriesTabs.innerHTML = '';

    const btnTodos = document.createElement('button');
    btnTodos.className = 'cat-tab' + (currentCategory === '' ? ' active' : '');
    btnTodos.textContent = '🌟 Todos';
    btnTodos.onclick = () => setCategory('');
    categoriesTabs.appendChild(btnTodos);

    const btnPromos = document.createElement('button');
    btnPromos.className = 'cat-tab' + (currentCategory === '__promos__' ? ' active' : '');
    btnPromos.textContent = '🔥 Promos de hoje';
    btnPromos.onclick = () => setCategory('__promos__');
    categoriesTabs.appendChild(btnPromos);

    catIds.forEach(catId => {
      if (!catId) return;
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (currentCategory === catId ? ' active' : '');
      btn.textContent = (catId.charAt(0).toUpperCase() + catId.slice(1)).replace('-', ' ');
      btn.onclick = () => setCategory(catId);
      categoriesTabs.appendChild(btn);
    });
  }

  function setCategory(catId) {
    currentCategory = catId;
    document.querySelectorAll('.cat-tab').forEach(t => {
      if (catId === '') {
        t.classList.toggle('active', t.textContent.includes('Todos'));
      } else if (catId === '__promos__') {
        t.classList.toggle('active', t.textContent.includes('Promos'));
      } else {
        t.classList.toggle('active', t.textContent.toLowerCase().replace(' ', '-') === catId.toLowerCase());
      }
    });
    renderProducts();
  }

  // Busca instantânea
  productSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderProducts();
  });

  function renderProducts() {
    productsGrid.innerHTML = '';
    
    let filtered = allProducts;
    if (currentCategory === '__promos__') {
      filtered = filtered.filter(p => activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id));
    } else if (currentCategory) {
      filtered = filtered.filter(p => p.categoria_id === currentCategory);
    }
    if (searchQuery) {
      filtered = filtered.filter(p => p.nome.toLowerCase().includes(searchQuery) || (p.descricao && p.descricao.toLowerCase().includes(searchQuery)));
    }
    
    if (filtered.length === 0) {
      productsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #888;">Nenhum produto encontrado.</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card' + (p.disponivel === false ? ' produto-esgotado' : '');
      const descHtml = p.descricao ? `<p class="product-card__desc">${p.descricao}</p>` : '';
      const isPromo = activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id);
      const promoBadgeHtml = isPromo ? `<span style="background:#e74c3c; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">PROMO</span>` : '';
      const stampHtml = p.disponivel === false ? `<div class="esgotado-stamp">ESGOTADO</div>` : '';
      
      card.innerHTML = `
        <div class="product-card__header">
          <h4>${p.nome}${promoBadgeHtml}</h4>
          ${descHtml}
        </div>
        <div class="product-card__bottom">
          <span class="price">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</span>
          <span class="btn-add-badge">+ Adicionar</span>
        </div>
        ${stampHtml}
      `;
      card.onclick = (e) => {
        if (p.disponivel === false) return;
        if (!p.permite_adicionais && p.tipo_montagem !== 'meio_a_meio') {
          addToCartFromMontagem({
            produto: p,
            adicionaisSelecionados: [],
            sabores: null,
            observacoes: ''
          });
        } else {
          openMontagemModal(p);
        }
      };

      // Lógica de Esgotar (Pressionar e Segurar)
      let pressTimer;
      const startPress = (e) => {
        if (e.button && e.button !== 0) return; // apenas click esquerdo
        pressTimer = setTimeout(() => {
          showEsgotadoMenu(p);
        }, 800); // 800ms para considerar long press
      };
      const cancelPress = () => clearTimeout(pressTimer);
      
      card.addEventListener('pointerdown', startPress);
      card.addEventListener('pointerup', cancelPress);
      card.addEventListener('pointerleave', cancelPress);
      card.addEventListener('pointercancel', cancelPress);
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Evita menu nativo no right-click/long-press mobile e mostra o nosso
        cancelPress();
        showEsgotadoMenu(p);
      });

      productsGrid.appendChild(card);
    });
  }

  async function showEsgotadoMenu(produto) {
    const isEsgotado = produto.disponivel === false;
    const msg = isEsgotado 
      ? `Marcar "${produto.nome}" como DISPONÍVEL?` 
      : `Marcar "${produto.nome}" como ESGOTADO?`;
      
    if (confirm(msg)) {
      try {
        const { error } = await window.cafeteriaSupabase.rpc('toggle_produto_disponivel', {
          p_produto_id: produto.id,
          p_disponivel: isEsgotado
        });
        if (error) throw error;
        // Atualiza localmente para resposta rápida. O realtime sincronizará outras abas.
        produto.disponivel = isEsgotado;
        renderProducts();
      } catch (err) {
        console.error('Erro ao atualizar disponibilidade', err);
        alert('Erro ao atualizar produto. Verifique suas permissões ou tente recarregar.');
      }
    }
  }

  // -----------------------------------------------------
  // 4. CARRINHO, MONTAGEM & OBSERVAÇÃO POR ITEM
  // -----------------------------------------------------
  mesaSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    cartMesaBadge.textContent = val ? val : 'Sem Mesa';
    checkFormValidity();
  });

  // --- Modal de Montagem ---
  function openMontagemModal(produto) {
    activeMontagemItem = {
      produto: produto,
      adicionaisSelecionados: [],
      sabores: null,
      observacoes: ''
    };
    
    modalMontagemTitle.textContent = produto.nome;
    modalMontagemObs.value = '';
    
    const saboresContainer = document.getElementById('montagem-sabores-container');
    const selectDoce = document.getElementById('modal-montagem-sabor-doce');
    const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
    
    if (produto.tipo_montagem === 'meio_a_meio') {
      saboresContainer.classList.remove('hidden');
      
      const doces = allProducts.filter(p => p.categoria_id === 'crepes-doces' && p.tipo_montagem !== 'meio_a_meio');
      const salgados = allProducts.filter(p => p.categoria_id === 'crepes-salgados' && p.tipo_montagem !== 'meio_a_meio');
      
      selectDoce.innerHTML = doces.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
      selectSalgado.innerHTML = salgados.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
      
      selectDoce.onchange = updateMontagemTotal;
      selectSalgado.onchange = updateMontagemTotal;
    } else {
      saboresContainer.classList.add('hidden');
      selectDoce.innerHTML = '';
      selectSalgado.innerHTML = '';
    }
    
    // Renderiza adicionais (apenas os vinculados)
    const adsDoProduto = allVinculosProduto
      .filter(v => v.produto_id === produto.id)
      .map(v => ({ id: v.adicional_id, nome: v.nome, preco: v.preco, ordem: v.ordem }))
      .sort((a, b) => a.ordem - b.ordem);

    if (!produto.permite_adicionais) {
      modalMontagemList.innerHTML = '<p style="color:#888; font-size:14px;">Este produto não permite adicionais.</p>';
    } else if (adsDoProduto.length === 0) {
      modalMontagemList.innerHTML = '<p style="color:#888; font-size:14px;">Nenhum adicional vinculado.</p>';
    } else {
      modalMontagemList.innerHTML = adsDoProduto.map(ad => `
        <label class="adicional-checkbox">
          <input type="checkbox" value="${ad.id}" data-preco="${ad.preco}" data-nome="${ad.nome}" class="chk-adicional">
          <span class="adicional-checkbox__label">${ad.nome} (+ R$ ${Number(ad.preco).toFixed(2).replace('.', ',')})</span>
        </label>
      `).join('');
      
      // Adiciona listeners aos checkboxes para atualizar o total
      const chks = modalMontagemList.querySelectorAll('.chk-adicional');
      chks.forEach(chk => {
        chk.addEventListener('change', updateMontagemTotal);
      });
    }

    updateMontagemTotal();
    modalMontagem.classList.remove('hidden');
  }

  function closeMontagemModal() {
    modalMontagem.classList.add('hidden');
    activeMontagemItem = null;
  }

  function updateMontagemTotal() {
    if (!activeMontagemItem) return;
    let total = 0;
    
    if (activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
      const selectDoce = document.getElementById('modal-montagem-sabor-doce');
      const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
      const optDoce = selectDoce.options[selectDoce.selectedIndex];
      const optSalgado = selectSalgado.options[selectSalgado.selectedIndex];
      
      if (optDoce && optSalgado) {
        total = (parseFloat(optDoce.dataset.preco) * 0.5) + (parseFloat(optSalgado.dataset.preco) * 0.5);
      }
    } else {
      total = Number(activeMontagemItem.produto.preco);
    }
    
    const chks = modalMontagemList.querySelectorAll('.chk-adicional:checked');
    chks.forEach(chk => {
      total += parseFloat(chk.dataset.preco);
    });
    modalMontagemTotal.textContent = `Total: R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  if (modalMontagemClose) modalMontagemClose.addEventListener('click', closeMontagemModal);
  if (modalMontagemCancel) modalMontagemCancel.addEventListener('click', closeMontagemModal);
  if (modalMontagemSave) {
    modalMontagemSave.addEventListener('click', () => {
      if (!activeMontagemItem) return;
      
      const chks = modalMontagemList.querySelectorAll('.chk-adicional:checked');
      activeMontagemItem.adicionaisSelecionados = Array.from(chks).map(chk => ({
        id: chk.value,
        nome: chk.dataset.nome,
        preco: parseFloat(chk.dataset.preco)
      }));
      
      if (activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
        const selectDoce = document.getElementById('modal-montagem-sabor-doce');
        const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
        activeMontagemItem.sabores = [
          { lado: 'doce', produto_id: selectDoce.value },
          { lado: 'salgado', produto_id: selectSalgado.value }
        ];
      }
      
      activeMontagemItem.observacoes = modalMontagemObs.value.trim();
      
      addToCartFromMontagem(activeMontagemItem);
      closeMontagemModal();
    });
  }

  function addToCartFromMontagem(item) {
    // Para agrupar itens no carrinho, eles devem ter o mesmo produto, mesmas obs e mesmos adicionais.
    // Como os adicionais podem variar, se não tiver adicionais nem obs, tentamos agrupar.
    const hasAdicionais = item.adicionaisSelecionados.length > 0;
    const hasObs = item.observacoes.length > 0;
    
    let existingIndex = -1;
    
    if (!hasAdicionais && !hasObs && (!item.sabores || item.sabores.length === 0)) {
      existingIndex = cart.findIndex(c => c.produto.id === item.produto.id && c.adicionaisSelecionados.length === 0 && !c.observacoes && (!c.sabores || c.sabores.length === 0));
    } else {
      // Se tiver adicionais ou observações únicas, vamos apenas adicionar como um novo item separadamente
      // (Poderia checar se o array de adicionais é exatamente igual, mas por simplicidade cria nova linha)
    }

    if (existingIndex > -1) {
      cart[existingIndex].quantidade += 1;
    } else {
      cart.push({
        produto: item.produto,
        quantidade: 1,
        observacoes: item.observacoes,
        adicionaisSelecionados: item.adicionaisSelecionados,
        sabores: item.sabores,
        cortesia_de_item_index: item.cortesia_de_item_index // Será preenchido quando for cortesia
      });
    }
    renderCart();

    if (navigator.vibrate) navigator.vibrate(10);
    const badge = document.getElementById('mobile-cart-count');
    if (badge) {
      badge.classList.remove('animate-pop');
      void badge.offsetWidth;
      badge.classList.add('animate-pop');
    }
  }

  function updateQuantity(index, delta) {
    if (!cart[index]) return;

    if (delta === -999) {
      const removedItem = cart.splice(index, 1)[0];
      renderCart();
      showToast('Item removido', 'Desfazer', () => {
        cart.splice(index, 0, removedItem);
        renderCart();
      });
      return;
    }

    cart[index].quantidade += delta;
    if (cart[index].quantidade <= 0) {
      const removedItem = cart.splice(index, 1)[0];
      renderCart();
      showToast('Item removido', 'Desfazer', () => {
        removedItem.quantidade = 1;
        cart.splice(index, 0, removedItem);
        renderCart();
      });
      return;
    }
    renderCart();
  }

  function openItemObsModal(index) {
    activeObsCartIndex = index;
    const item = cart[index];
    if (!item) return;

    modalObsTitle.textContent = `Observação: ${item.produto.nome}`;
    modalObsInput.value = item.observacoes || '';
    modalObs.classList.remove('hidden');
    modalObsInput.focus();
  }

  function closeItemObsModal() {
    modalObs.classList.add('hidden');
    activeObsCartIndex = null;
  }

  modalObsSave.addEventListener('click', () => {
    if (activeObsCartIndex !== null && cart[activeObsCartIndex]) {
      cart[activeObsCartIndex].observacoes = modalObsInput.value.trim();
      renderCart();
    }
    closeItemObsModal();
  });

  [modalObsClose, modalObsCancel].forEach(b => b.addEventListener('click', closeItemObsModal));

  function openCartDrawer() {
    if (cartPanel) cartPanel.classList.add('open-mobile');
    if (cartBackdrop) cartBackdrop.classList.remove('hidden');
    history.pushState({ cartOpen: true }, '', '#cart');
  }

  function closeCartDrawer() {
    if (history.state && history.state.cartOpen) {
      history.back();
    } else {
      if (cartPanel) cartPanel.classList.remove('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.add('hidden');
    }
  }

  window.addEventListener('popstate', (e) => {
    if (!e.state || !e.state.cartOpen) {
      if (cartPanel) cartPanel.classList.remove('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.add('hidden');
    } else {
      if (cartPanel) cartPanel.classList.add('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.remove('hidden');
    }
  });

  // Swipe to close
  let touchStartY = 0;
  if (cartPanel) {
    cartPanel.addEventListener('touchstart', e => {
      const itemsContainer = e.target.closest('.cart-items');
      if (itemsContainer && itemsContainer.scrollTop > 0) return;
      touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});
    
    cartPanel.addEventListener('touchmove', e => {
      if (!touchStartY) return;
      const currentY = e.changedTouches[0].screenY;
      const diff = currentY - touchStartY;
      if (diff > 50) {
        closeCartDrawer();
        touchStartY = 0;
      }
    }, {passive: true});
    
    cartPanel.addEventListener('touchend', () => {
      touchStartY = 0;
    });
  }

  if (btnOpenMobileCart) btnOpenMobileCart.addEventListener('click', openCartDrawer);
  if (btnCloseCartDrawer) btnCloseCartDrawer.addEventListener('click', closeCartDrawer);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCartDrawer);

  function renderCart() {
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<div class="cart-empty">Nenhum item adicionado.</div>';
      cartTotalValue.textContent = 'R$ 0,00';
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
      closeCartDrawer();
      checkFormValidity();
      return;
    }

    cartItemsContainer.innerHTML = '';
    let total = 0;
    
    // --- Calculo simplificado de promos para preview ---
    let groupedProduct = {};
    let groupedCategory = {};
    
    cart.forEach((item, idx) => {
      const pId = item.produto.id;
      const cId = item.produto.categoria_id;
      
      let precoBase = Number(item.produto.preco);
      if (item.produto.tipo_montagem === 'meio_a_meio' && item.sabores && item.sabores.length === 2) {
        const pd = Number(allProducts.find(p => p.id === item.sabores[0].produto_id)?.preco || 0);
        const ps = Number(allProducts.find(p => p.id === item.sabores[1].produto_id)?.preco || 0);
        precoBase = (pd * 0.5) + (ps * 0.5);
      }

      if (!groupedProduct[pId]) groupedProduct[pId] = { qtd: 0, precoBase, indices: [] };
      groupedProduct[pId].qtd += item.quantidade;
      groupedProduct[pId].indices.push(idx);
      
      if (!groupedCategory[cId]) groupedCategory[cId] = { qtd: 0, precoBase, indices: [] };
      groupedCategory[cId].qtd += item.quantidade;
      groupedCategory[cId].indices.push(idx);
    });

    let promoLabels = {};
    let promoDiscounts = {};

    activePromos.forEach(promo => {
      let g = null;
      if (promo.produto_id && groupedProduct[promo.produto_id]) {
        g = groupedProduct[promo.produto_id];
      } else if (promo.categoria_id && groupedCategory[promo.categoria_id]) {
        g = groupedCategory[promo.categoria_id];
      }
      
      if (g) {
        let desc = 0;
        let label = '';
        if (promo.tipo === 'percentual') {
          desc = (g.qtd * g.precoBase) * (promo.percentual / 100.0);
          label = `Promo: ${promo.percentual}% off`;
        } else if (promo.tipo === 'compre_leve') {
          let gratis = Math.floor(g.qtd / promo.qtd_leva) * (promo.qtd_leva - promo.qtd_compra);
          desc = gratis * g.precoBase;
          label = `Promo: Leve ${promo.qtd_leva} Pague ${promo.qtd_compra}`;
        } else if (promo.tipo === 'segunda_unidade') {
          desc = Math.floor(g.qtd / 2) * g.precoBase * (promo.percentual / 100.0);
          label = `Promo: 2ª unid. ${promo.percentual}% off`;
        }
        
        if (desc > 0) {
          const targetIdx = g.indices[0]; // Aplica ao primeiro item no visual
          if (!promoDiscounts[targetIdx] || desc > promoDiscounts[targetIdx]) {
            promoDiscounts[targetIdx] = desc;
            promoLabels[targetIdx] = label;
          }
        }
      }
    });

    cart.forEach((item, index) => {
      let adicTotal = 0;
      let adicHtml = '';
      if (item.adicionaisSelecionados && item.adicionaisSelecionados.length > 0) {
        item.adicionaisSelecionados.forEach(ad => {
          adicTotal += ad.preco;
          adicHtml += `<div style="font-size:12px; color:#666;">+ ${window.escapeHtml(ad.nome)} (R$ ${ad.preco.toFixed(2).replace('.', ',')})</div>`;
        });
      }

      let precoBase = Number(item.produto.preco);
      let saboresHtml = '';
      
      if (item.produto.tipo_montagem === 'meio_a_meio' && item.sabores && item.sabores.length === 2) {
        const precoDoce = Number(allProducts.find(p => p.id === item.sabores[0].produto_id)?.preco || 0);
        const precoSalgado = Number(allProducts.find(p => p.id === item.sabores[1].produto_id)?.preco || 0);
        precoBase = (precoDoce * 0.5) + (precoSalgado * 0.5);
        
        const nomeDoce = allProducts.find(p => p.id === item.sabores[0].produto_id)?.nome || '';
        const nomeSalgado = allProducts.find(p => p.id === item.sabores[1].produto_id)?.nome || '';
        saboresHtml = `<div style="font-size:12px; color:#aaa;">½ ${window.escapeHtml(nomeDoce)} / ½ ${window.escapeHtml(nomeSalgado)}</div>`;
      }

      const precoUnitario = precoBase + adicTotal;
      const subtotal = precoUnitario * item.quantidade;
      total += subtotal;

      const obsHtml = item.observacoes 
        ? `<div class="cart-item-obs">↳ Obs: ${window.escapeHtml(item.observacoes)}</div>` 
        : '';
        
      let promoHtml = '';
      if (promoDiscounts[index]) {
        total -= promoDiscounts[index];
        promoHtml = `<div style="font-size:12px; color:#e74c3c; margin-top: 4px;">↳ ${promoLabels[index]} (- R$ ${promoDiscounts[index].toFixed(2).replace('.', ',')})</div>`;
      }

      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${window.escapeHtml(item.produto.nome)}</div>
            ${saboresHtml}
            <div class="cart-item-price">R$ ${precoUnitario.toFixed(2).replace('.', ',')}</div>
            ${adicHtml}
            ${obsHtml}
            ${promoHtml}
          </div>
          <div class="cart-item-actions">
            <button class="cart-btn obs-btn" title="Adicionar/Editar Observação" onclick="window.baristaOpenObs(${index})" style="font-size:12px; width:auto; padding:0 8px;">
              ${item.observacoes ? 'Editar obs' : '+ Obs'}
            </button>
            <button class="cart-btn" onclick="window.baristaUpdateQty(${index}, -1)">-</button>
            <span class="cart-qty">${item.quantidade}</span>
            <button class="cart-btn" onclick="window.baristaUpdateQty(${index}, 1)">+</button>
            <button class="cart-btn remove" onclick="window.baristaUpdateQty(${index}, -999)">🗑</button>
          </div>
        </div>
      `;
      cartItemsContainer.appendChild(div);
    });

    cartTotalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    // Atualizar Barra Mobile Flutuante
    const totalItens = cart.reduce((acc, item) => acc + item.quantidade, 0);
    if (mobileCartCount) mobileCartCount.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
    if (mobileCartTotal) mobileCartTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (mobileCartBar) mobileCartBar.classList.remove('hidden');

    checkFormValidity();
  }

  window.baristaUpdateQty = updateQuantity;
  window.baristaOpenObs = openItemObsModal;

  function checkFormValidity() {
    const hasMesa = mesaSelect.value !== '';
    const isParaViagem = pedidoParaViagem.checked;
    const hasNome = pedidoClienteNome.value.trim() !== '';
    const hasItems = cart.length > 0;
    
    // Pode enviar se tiver mesa selecionada OU se for para viagem/tiver nome (pois usaremos BALCAO).
    const canSend = (hasMesa || isParaViagem || hasNome) && hasItems;
    btnEnviarPedido.disabled = !canSend;
  }
  
  if (pedidoClienteNome) pedidoClienteNome.addEventListener('input', checkFormValidity);
  if (pedidoParaViagem) pedidoParaViagem.addEventListener('change', checkFormValidity);

  // -----------------------------------------------------
  // 5. ENVIAR PEDIDO
  // -----------------------------------------------------
  btnEnviarPedido.addEventListener('click', async () => {
    if (btnEnviarPedido.disabled) return;
    
    const mesaCodigo = mesaSelect.value;
    const obsGeral = pedidoObs.value.trim();
    const clienteNome = pedidoClienteNome.value.trim();
    const paraViagem = pedidoParaViagem.checked;
    const formaPag = pedidoPagamento.value || null;
    const statusPag = pedidoPago.checked ? 'pago' : 'pendente';
    
    const total = cart.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0);

    btnEnviarPedido.disabled = true;
    btnEnviarPedido.textContent = 'Enviando...';

    // Formatar itens para RPC
    const itensParaRpc = cart.map(item => ({
      produto_id: item.produto.id,
      quantidade: item.quantidade,
      observacoes: item.observacoes || null,
      adicionais: (item.adicionaisSelecionados || []).map(ad => ad.id),
      sabores: item.sabores || undefined,
      cortesia_de_item_index: item.cortesia_de_item_index !== undefined ? item.cortesia_de_item_index : null
    }));

    const payload = {
      mesa_codigo: mesaCodigo,
      observacoes: obsGeral,
      cliente_nome: clienteNome,
      para_viagem: paraViagem,
      forma_pagamento: formaPag,
      status_pagamento: statusPag,
      itens: itensParaRpc
    };

    const { data: pedidoData, error: pedidoError } = await window.cafeteriaSupabase.rpc('criar_pedido', {
      p_payload: payload
    });

    if (pedidoError) {
      showToast('Erro ao criar pedido: ' + pedidoError.message);
      btnEnviarPedido.disabled = false;
      btnEnviarPedido.textContent = 'Enviar para Cozinha';
      return;
    }

    // Limpeza e Sucesso
    cart = [];
    pedidoObs.value = '';
    pedidoClienteNome.value = '';
    pedidoParaViagem.checked = false;
    pedidoPagamento.value = '';
    pedidoPago.checked = false;
    resetarModoAdicao();
    mesaSelect.value = '';
    renderCart();

    btnEnviarPedido.textContent = 'Enviado! ✅';
    setTimeout(() => {
      btnEnviarPedido.textContent = 'Enviar para Cozinha';
      checkFormValidity();
    }, 1500);

    await loadActivePedidos();
  });

  // -----------------------------------------------------
  // 6. MESAS & ACOMPANHAMENTO DE ENTREGAS
  // -----------------------------------------------------
  async function loadActivePedidos() {
    const inicioDoDia = window.getInicioDoDiaSaoPaulo();
    const { data, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (
          *,
          pedido_item_adicionais (*)
        )
      `)
      .or(`status.in.(pendente,em_preparo),status_pagamento.eq.pendente,status_pagamento.is.null,and(status.eq.concluido,created_at.gte.${inicioDoDia})`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      activePedidos = data;
      await loadCortesiasDisponiveis();
      renderMesasSection();
      renderPedidosCards();
      updateProntosBadge();
      updateMesaSelectOptions();
    }
  }

  async function loadCortesiasDisponiveis() {
    const { data } = await window.cafeteriaSupabase
      .from('v_cortesias_disponiveis')
      .select('*')
      .gt('saldo_disponivel', 0);
    if (data) cortesiasDisponiveis = data;
  }

  function updateProntosBadge() {
    const prontosCount = activePedidos.filter(p => p.status === 'concluido').length;
    if (prontosCount > 0) {
      badgeProntos.textContent = `${prontosCount} pronto${prontosCount > 1 ? 's' : ''}`;
      badgeProntos.classList.remove('hidden');
    } else {
      badgeProntos.classList.add('hidden');
    }
  }

  function renderMesasSection() {
    mesasGrid.innerHTML = '';
    
    mesas.forEach(mesa => {
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === mesa.codigo);
      const ocupada = pedidosMesa.length > 0;
      const totalMesa = pedidosMesa.reduce((acc, p) => acc + Number(p.total || 0), 0);

      const card = document.createElement('div');
      card.className = `mesa-card ${ocupada ? 'ocupada' : 'livre'}`;
      card.innerHTML = `
        <div class="mesa-card__header">
          <span class="mesa-card__codigo">${mesa.codigo}</span>
          <span class="mesa-card__status">${ocupada ? 'Ocupada' : 'Livre'}</span>
        </div>
        <div class="mesa-card__desc">${mesa.descricao || 'Mesa Cafeteria'}</div>
        <div class="mesa-card__info">
          ${ocupada ? `${pedidosMesa.length} pedido(s) • <span>R$ ${totalMesa.toFixed(2).replace('.', ',')}</span>` : 'Sem consumo'}
        </div>
      `;

      card.onclick = () => {
        if (ocupada) {
          abrirModalMesa(mesa.codigo, pedidosMesa);
        } else {
          // Selecionar para novo pedido
          mesaSelect.value = mesa.codigo;
          cartMesaBadge.textContent = mesa.codigo;
          switchTab('novo');
        }
      };

      mesasGrid.appendChild(card);
    });
  }

  // Filtros de Pedidos Ativos
  filtroChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filtroChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterStatus = chip.dataset.filter;
      renderPedidosCards();
    });
  });

  const viewMesas = document.getElementById('view-mesas-pedidos');
  const ptrIndicator = document.getElementById('ptr-indicator');
  let ptrStartY = 0;
  let ptrCurrentY = 0;
  let isPulling = false;

  if (viewMesas) {
    viewMesas.addEventListener('touchstart', (e) => {
      if (viewMesas.scrollTop > 0) return;
      ptrStartY = e.touches[0].clientY;
      isPulling = true;
    }, { passive: true });

    viewMesas.addEventListener('touchmove', (e) => {
      if (!isPulling) return;
      ptrCurrentY = e.touches[0].clientY;
      const dy = ptrCurrentY - ptrStartY;
      
      if (dy > 0 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'none';
          ptrIndicator.style.height = Math.min(dy * 0.5, 60) + 'px';
          ptrIndicator.style.opacity = Math.min(dy / 100, 1);
        }
      }
    }, { passive: true });

    viewMesas.addEventListener('touchend', async () => {
      if (!isPulling) return;
      isPulling = false;
      const dy = ptrCurrentY - ptrStartY;
      if (dy > 60 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'height 0.2s, opacity 0.2s';
          ptrIndicator.style.height = '40px';
          ptrIndicator.innerHTML = '<span>↻ Atualizando...</span>';
        }
        await Promise.all([loadActivePedidos(), loadMesasOverview()]);
      }
      if (ptrIndicator) {
        ptrIndicator.style.transition = 'height 0.2s, opacity 0.2s';
        ptrIndicator.style.height = '0';
        ptrIndicator.style.opacity = '0';
        setTimeout(() => {
          ptrIndicator.innerHTML = '<span>↻ Puxe para atualizar...</span>';
        }, 200);
      }
    });
  }

  function renderPedidosCards() {
    pedidosCardsGrid.innerHTML = '';

    let list = activePedidos.filter(p => p.status !== 'entregue');
    if (currentFilterStatus !== 'todos') {
      list = list.filter(p => p.status === currentFilterStatus);
    }

    if (list.length === 0) {
      pedidosCardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">Nenhum pedido nesta categoria.</div>';
      return;
    }

    list.forEach(pedido => {
      const isPronto = pedido.status === 'concluido';
      const statusLabel = {
        'pendente': '🟡 Na Fila (Pendente)',
        'em_preparo': '🔵 Em Preparo',
        'concluido': '🟢 PRONTO P/ SERVIR!'
      }[pedido.status] || pedido.status;

      const card = document.createElement('div');
      card.className = `pedido-card-barista ${isPronto ? 'pronto' : ''}`;

      let itensHtml = '';
      (pedido.pedido_itens || []).forEach(item => {
        let adicHtml = '';
        if (item.pedido_item_adicionais && item.pedido_item_adicionais.length > 0) {
          adicHtml = item.pedido_item_adicionais.map(ad => 
            `<div style="font-size:12px; color:#666; margin-left:14px;">+ ${window.escapeHtml(ad.nome_adicional)}</div>`
          ).join('');
        }

        itensHtml += `
          <div class="pedido-card-barista__item">
            <span><strong>${item.quantidade}x</strong> ${window.escapeHtml(item.nome_produto)} ${item.observacoes ? '<em style="color:#D97706">(' + window.escapeHtml(item.observacoes) + ')</em>' : ''}</span>
            ${adicHtml}
          </div>
        `;
      });

      const btnAcaoHtml = isPronto
        ? `<div class="pedido-card-barista__actions">
            <button class="btn-chamar-voz" onclick="window.baristaChamarPedido('${pedido.numero_pedido || pedido.id}', '${pedido.mesa_codigo}', '${window.escapeHtml(pedido.cliente_nome || '')}')" title="Fazer chamada por voz">
              📢 Chamar
            </button>
            <button class="btn-entregar" onclick="window.baristaMarcarEntregue(${pedido.id})">
              ✅ Entregue
            </button>
          </div>`
        : `<span style="font-size:12px; color:#888;">Operador: ${pedido.criado_por_nome || 'Barista'}</span>`;

      const viagemTag = pedido.para_viagem ? `<span style="background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:8px; font-weight:bold;">🥡 VIAGEM</span>` : '';
      const nomeClienteHtml = pedido.cliente_nome ? `<div style="font-size:14px; font-weight:bold; color:var(--marrom-escuro); margin-top:4px;">${window.escapeHtml(pedido.cliente_nome)}</div>` : '';

      card.innerHTML = `
        <div class="pedido-card-barista__header">
          <span class="pedido-card-barista__mesa">${pedido.mesa_codigo} (Pedido #${pedido.numero_pedido || pedido.id})${viagemTag}</span>
          <span class="pedido-card-barista__status status-chip--${pedido.status === 'concluido' ? 'pronto' : pedido.status === 'em_preparo' ? 'preparo' : 'pendente'}">
            ${statusLabel}
          </span>
        </div>
        ${nomeClienteHtml}
        <div class="pedido-card-barista__itens">
          ${itensHtml}
        </div>
        <div class="pedido-card-barista__footer">
          <span style="font-weight:700; font-size:14px;">Total: R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</span>
          ${btnAcaoHtml}
        </div>
      `;

      pedidosCardsGrid.appendChild(card);
    });
  }

  window.baristaMarcarEntregue = async function (pedidoId) {
    const payload = {
      status: 'entregue',
      entregue_em: new Date().toISOString(),
      entregue_por: currentUser.id,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await window.cafeteriaSupabase
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId);

    if (error) {
      if (window.showToast) window.showToast("Erro ao marcar como entregue: " + error.message);
      return;
    }

    // Otimista
    const p = activePedidos.find(x => x.id === pedidoId);
    if (p) p.status = 'entregue';
    
    renderPedidosCards();
    updateProntosBadge();

    if (window.showToast) {
      window.showToast('Pedido entregue', 'Desfazer', async () => {
        const { error: errRevert } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({ 
            status: 'concluido', 
            entregue_em: null, 
            entregue_por: null, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', pedidoId);
          
        if (errRevert) {
          window.showToast("Erro ao desfazer: " + errRevert.message);
          return;
        }

        if (p) p.status = 'concluido';
        renderPedidosCards();
        updateProntosBadge();
      });
    }
  };

  // -----------------------------------------------------
  // 7. MODAL CONSUMO DA MESA & PRÉVIA DA CONTA
  // -----------------------------------------------------
  function abrirModalMesa(mesaCodigo, pedidosMesa) {
    currentSelectedMesaParaConta = { mesaCodigo, pedidosMesa };
    modalMesaTitle.textContent = `Consumo Atual: ${mesaCodigo}`;

    let total = 0;
    let html = '<div style="display:flex; flex-direction:column; gap:12px;">';

    pedidosMesa.forEach(p => {
      total += Number(p.total || 0);
      const dataStr = new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const statusPagStr = p.status_pagamento === 'pago' ? ' (Já Pago ✅)' : ' (A pagar)';

      html += `
        <div style="background:#F9F9F9; border:1px solid #E5E5E5; border-radius:8px; padding:12px;">
          <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:6px;">
            <span>Pedido #${p.numero_pedido || p.id} às ${dataStr}</span>
            <span>R$ ${Number(p.total).toFixed(2).replace('.', ',')} ${statusPagStr}</span>
          </div>
          <ul style="padding-left:18px; margin:0; font-size:13px; color:#444;">
      `;

      (p.pedido_itens || []).forEach(it => {
        let adicText = '';
        if (it.pedido_item_adicionais && it.pedido_item_adicionais.length > 0) {
          adicText = it.pedido_item_adicionais.map(ad => `<div style="font-size:11px; color:#666; margin-left:16px;">+ ${window.escapeHtml(ad.nome_adicional)}</div>`).join('');
        }
        
        let cortesiaHtml = '';
        const disponiveis = cortesiasDisponiveis.filter(c => c.pedido_item_origem_id === it.id);
        if (disponiveis.length > 0) {
          disponiveis.forEach(d => {
            const prod = allProducts.find(pr => pr.id === d.produto_cortesia_id);
            if (prod) {
              cortesiaHtml += `<button class="btn-ghost-small" style="font-size:11px; padding:2px 6px; margin-left:8px;" onclick="window.baristaLancarCortesia(${p.id}, ${it.id}, '${prod.id}')" title="Lançar ${prod.nome} como cortesia">🎁 ${prod.nome} (${d.saldo_disponivel})</button>`;
            }
          });
        }

        let cancelClass = it.cancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
        let cancelLabel = it.cancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
        let btnCancelarItemHtml = '';
        if (!it.cancelado && p.status !== 'concluido' && p.status !== 'cancelado') {
          btnCancelarItemHtml = `<button class="btn-ghost-small" style="color: #e74c3c; padding: 2px 6px; font-size: 11px; margin-left:8px;" onclick="window.baristaCancelarItem(${it.id}, ${p.id}, '${currentSelectedMesaParaConta.mesaCodigo}')">✕ Cancelar</button>`;
        }
        
        let obsLabel = it.observacoes ? `<em style="color:#D97706">(${window.escapeHtml(it.observacoes)})</em>` : '';

        html += `<li ${cancelClass}>${it.quantidade}x ${window.escapeHtml(it.nome_produto)} ${obsLabel} — R$ ${(it.quantidade * it.preco_unitario).toFixed(2).replace('.', ',')} ${cancelLabel} ${btnCancelarItemHtml} ${adicText} ${cortesiaHtml}</li>`;
      });

      html += '</ul></div>';
    });

    html += `
      <div style="text-align:right; font-size:18px; font-weight:bold; margin-top:10px; color:var(--marrom-escuro);">
        TOTAL GERAL DA MESA: R$ ${total.toFixed(2).replace('.', ',')}
      </div>
    </div>`;

    modalMesaBody.innerHTML = html;
    modalMesa.classList.remove('hidden');
  }

  function fecharModalMesa() {
    modalMesa.classList.add('hidden');
    currentSelectedMesaParaConta = null;
  }

  [modalMesaClose, modalMesaFechar].forEach(b => b.addEventListener('click', fecharModalMesa));

  function resetarModoAdicao() {
    if (mesaSelect) mesaSelect.disabled = false;
    if (bannerAdicionandoItens) bannerAdicionandoItens.classList.add('hidden');
    if (lblMesaAdicionando) lblMesaAdicionando.textContent = '';
  }

  if (btnCancelarAdicao) {
    btnCancelarAdicao.addEventListener('click', () => {
      cart = [];
      renderCart();
      resetarModoAdicao();
      mesaSelect.value = '';
      checkFormValidity();
      switchTab('mesas');
    });
  }

  if (btnMesaAdicionarItens) {
    btnMesaAdicionarItens.addEventListener('click', () => {
      if (!currentSelectedMesaParaConta) return;
      const mesa = currentSelectedMesaParaConta.mesaCodigo;
      fecharModalMesa();
      
      switchTab('novo');
      mesaSelect.value = mesa;
      mesaSelect.disabled = true;
      lblMesaAdicionando.textContent = mesa;
      bannerAdicionandoItens.classList.remove('hidden');
      
      const badge = document.getElementById('cart-mesa-badge');
      if (badge) badge.textContent = mesa;
      
      checkFormValidity();
    });
  }

  modalMesaPrint.addEventListener('click', () => {
    if (currentSelectedMesaParaConta && window.cafeteriaPrint) {
      window.cafeteriaPrint.printConferenciaMesa(
        currentSelectedMesaParaConta.mesaCodigo,
        currentSelectedMesaParaConta.pedidosMesa
      );
    }
  });

  // -----------------------------------------------------
  // 7.1. FLUXO DE FECHAMENTO DE CONTA DA MESA
  // -----------------------------------------------------

  modalMesaFecharConta.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalFecharConta(currentSelectedMesaParaConta.mesaCodigo, currentSelectedMesaParaConta.pedidosMesa);
  });

  // -----------------------------------------------------
  // 7.0. TRANSFERIR / JUNTAR MESAS
  // -----------------------------------------------------

  btnMesaTransferir.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalTransferencia('transferir', currentSelectedMesaParaConta.mesaCodigo);
  });

  btnMesaJuntar.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalTransferencia('juntar', currentSelectedMesaParaConta.mesaCodigo);
  });

  async function abrirModalTransferencia(acao, mesaBase) {
    acaoTransferenciaAtiva = acao;
    mesaAlvoTransferencia = mesaBase;

    modalTransferirTitle.textContent = acao === 'transferir' 
      ? `Transferir pedidos da mesa ${mesaBase} para:` 
      : `Juntar pedidos de outra mesa à mesa ${mesaBase}:`;
    
    selectTransferirMesa.innerHTML = '<option value="">Carregando mesas...</option>';
    modalTransferirMesa.classList.remove('hidden');

    try {
      const { data: mesas, error } = await supabase
        .from('mesas')
        .select('codigo')
        .eq('ativo', true)
        .order('codigo');

      if (error) throw error;

      selectTransferirMesa.innerHTML = '<option value="">Selecione...</option>';
      mesas.forEach(m => {
        if (m.codigo !== mesaBase) {
          const opt = document.createElement('option');
          opt.value = m.codigo;
          opt.textContent = m.codigo;
          selectTransferirMesa.appendChild(opt);
        }
      });
    } catch (err) {
      console.error('Erro ao buscar mesas:', err);
      selectTransferirMesa.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  function fecharModalTransferencia() {
    modalTransferirMesa.classList.add('hidden');
    acaoTransferenciaAtiva = null;
    mesaAlvoTransferencia = null;
    selectTransferirMesa.value = '';
  }

  [btnTransferirClose, btnTransferirCancel].forEach(b => b.addEventListener('click', fecharModalTransferencia));

  btnTransferirConfirm.addEventListener('click', async () => {
    const mesaSelecionada = selectTransferirMesa.value;
    if (!mesaSelecionada) {
      alert('Por favor, selecione uma mesa.');
      return;
    }

    let pOrigem, pDestino;
    if (acaoTransferenciaAtiva === 'transferir') {
      pOrigem = mesaAlvoTransferencia;
      pDestino = mesaSelecionada;
    } else {
      pOrigem = mesaSelecionada;
      pDestino = mesaAlvoTransferencia;
    }

    try {
      btnTransferirConfirm.disabled = true;
      btnTransferirConfirm.textContent = 'Processando...';

      const { error } = await supabase.rpc('transferir_mesa', {
        p_origem: pOrigem,
        p_destino: pDestino
      });

      if (error) throw error;

      window.showToast(`Operação realizada com sucesso!`);
      fecharModalTransferencia();
      fecharModalMesa();
      loadPedidos(); // Recarrega os pedidos e mesas
    } catch (err) {
      console.error('Erro ao transferir:', err);
      alert('Erro ao transferir pedidos: ' + err.message);
    } finally {
      btnTransferirConfirm.disabled = false;
      btnTransferirConfirm.textContent = 'Confirmar';
    }
  });


  let currentPartes = [];
  let parteAtivaId = null;

  function abrirModalFecharConta(mesaCodigo, pedidosMesa) {
    currentFechamento.mesaCodigo = mesaCodigo;
    currentFechamento.pedidos = pedidosMesa;
    currentFechamento.totalConta = 0;
    currentFechamento.jaPago = 0;
    currentFechamento.aPagar = 0;
    
    // Calcula totais
    pedidosMesa.forEach(p => {
      const valorPedido = Number(p.total || 0);
      currentFechamento.totalConta += valorPedido;
      if (p.status_pagamento === 'pago') {
        currentFechamento.jaPago += valorPedido;
      } else {
        currentFechamento.aPagar += valorPedido;
        // Iniciar pedidos com % de atribuição
        p._atribuicoes = []; // { parteId, perc }
      }
    });

    if (currentFechamento.aPagar <= 0) {
      showToast('Esta mesa não tem pedidos pendentes de pagamento.', 'info');
      return;
    }

    fecharContaTitle.textContent = `Fechar Conta: ${mesaCodigo}`;
    fecharContaTotalLbl.textContent = `R$ ${currentFechamento.totalConta.toFixed(2).replace('.', ',')}`;
    fecharContaJaPagoLbl.textContent = `R$ ${currentFechamento.jaPago.toFixed(2).replace('.', ',')}`;
    fecharContaAPagarLbl.textContent = `R$ ${currentFechamento.aPagar.toFixed(2).replace('.', ',')}`;
    
    // Reseta UI
    fecharContaModo.value = 'padrao';
    fecharContaModo.dispatchEvent(new Event('change'));
    
    modalMesa.classList.add('hidden');
    modalFecharConta.classList.remove('hidden');
  }

  fecharContaModo.addEventListener('change', () => {
    const modo = fecharContaModo.value;
    fecharContaDivPessoas.classList.add('hidden');
    fecharContaDivAddParte.classList.add('hidden');
    
    currentPartes = [];
    parteAtivaId = null;
    
    if (modo === 'padrao') {
      currentPartes.push({
        id: 1,
        nome: 'Parte Única',
        valor_devido: currentFechamento.aPagar,
        pagamentos: [],
        dinheiro_recebido: 0
      });
      parteAtivaId = 1;
    } else if (modo === 'igual') {
      fecharContaDivPessoas.classList.remove('hidden');
    } else if (modo === 'item') {
      fecharContaDivAddParte.classList.remove('hidden');
      // Limpar atribuições dos pedidos
      currentFechamento.pedidos.forEach(p => { if (p._atribuicoes) p._atribuicoes = []; });
    }
    renderPartes();
    renderResumoItens();
  });

  btnGerarPartesIgual.addEventListener('click', () => {
    const num = Number(fecharContaNumPessoas.value);
    if (num < 2) return;
    currentPartes = [];
    
    const valorBase = Math.floor((currentFechamento.aPagar / num) * 100) / 100;
    let sobra = currentFechamento.aPagar - (valorBase * num);
    
    for (let i = 1; i <= num; i++) {
      let valor = valorBase;
      if (i === 1) valor += sobra;
      
      currentPartes.push({
        id: i,
        nome: `Parte ${i}`,
        valor_devido: valor,
        pagamentos: [],
        dinheiro_recebido: 0
      });
    }
    parteAtivaId = 1;
    renderPartes();
  });

  btnAddParteItem.addEventListener('click', () => {
    const nome = fecharContaNomeParte.value.trim() || `Parte ${currentPartes.length + 1}`;
    currentPartes.push({
      id: Date.now(),
      nome: nome,
      valor_devido: 0,
      pagamentos: [],
      dinheiro_recebido: 0
    });
    fecharContaNomeParte.value = '';
    renderPartes();
  });

  // Expor no window para usar no html gerado
  window.selecionarParte = function(id) {
    parteAtivaId = id;
    renderPartes();
    renderResumoItens();
  };

  window.atribuirItem = function(pedidoId, percent) {
    if (fecharContaModo.value !== 'item') return;
    if (!parteAtivaId) {
      showToast('Selecione uma parte primeiro!', 'warning');
      return;
    }
    
    const p = currentFechamento.pedidos.find(x => x.id === pedidoId);
    if (!p) return;
    
    // Remove se já existe essa atribuição para recalcular
    p._atribuicoes = p._atribuicoes.filter(a => a.parteId !== parteAtivaId);
    
    // Soma % atual (exceto a parte atual)
    let totalPerc = p._atribuicoes.reduce((sum, a) => sum + a.perc, 0);
    if (totalPerc + percent > 100) {
      showToast('O item não pode passar de 100% de atribuição.', 'error');
      return;
    }
    
    if (percent > 0) {
      p._atribuicoes.push({ parteId: parteAtivaId, perc: percent });
    }
    
    recalcularValorDevidoItemMode();
    renderResumoItens();
    renderPartes();
  };

  function recalcularValorDevidoItemMode() {
    currentPartes.forEach(pt => pt.valor_devido = 0);
    
    currentFechamento.pedidos.forEach(p => {
      if (p.status_pagamento === 'pago') return;
      if (!p._atribuicoes) return;
      
      const valorPedido = Number(p.total || 0);
      p._atribuicoes.forEach(a => {
        const pt = currentPartes.find(x => x.id === a.parteId);
        if (pt) {
          pt.valor_devido += (valorPedido * (a.perc / 100));
        }
      });
    });
  }

  function renderResumoItens() {
    let htmlResumo = '<ul style="padding-left:16px; margin:0; list-style-type:none;">';
    
    currentFechamento.pedidos.forEach(p => {
      const valorPedido = Number(p.total || 0);
      let statusHtml = '';
      if (p.status_pagamento === 'pago') {
        statusHtml = '<span style="color:green; font-weight:bold;">(Pago)</span>';
      }
      
      htmlResumo += `<li style="margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Pedido #${p.numero_pedido || p.id} ${statusHtml}</span>
          <strong>R$ ${valorPedido.toFixed(2).replace('.', ',')}</strong>
        </div>`;
        
      if (fecharContaModo.value === 'item' && p.status_pagamento !== 'pago') {
        let atribuido = 0;
        let badges = '';
        if (p._atribuicoes) {
          p._atribuicoes.forEach(a => {
            atribuido += a.perc;
            const pt = currentPartes.find(x => x.id === a.parteId);
            if (pt) {
              badges += `<span style="font-size:10px; background:#ddd; padding:2px 4px; border-radius:4px; margin-right:4px;">${pt.nome} (${a.perc}%)</span>`;
            }
          });
        }
        
        let botoesAtrib = '';
        if (atribuido < 100 && parteAtivaId) {
          let faltante = 100 - atribuido;
          botoesAtrib = `
            <div style="margin-top: 4px;">
              ${faltante === 100 ? `<button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, 100)">Atribuir 100%</button>` : ''}
              <button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, 50)">+50%</button>
              <button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, ${faltante})">Restante (${faltante}%)</button>
            </div>
          `;
        }
        
        htmlResumo += `<div>${badges}${botoesAtrib}</div>`;
      }
      
      htmlResumo += `</li>`;
    });
    htmlResumo += '</ul>';
    fecharContaResumo.innerHTML = htmlResumo;
  }

  function renderPartes() {
    let totalPagoAll = 0;
    
    let htmlPartes = '';
    currentPartes.forEach(pt => {
      let totalPagoParte = pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);
      totalPagoAll += totalPagoParte;
      
      let faltaParte = pt.valor_devido - totalPagoParte;
      if (faltaParte < 0) faltaParte = 0;
      
      let statusColor = faltaParte > 0 ? '#D97706' : 'green';
      if (pt.valor_devido === 0 && fecharContaModo.value === 'item') statusColor = '#999';
      
      let isActive = pt.id === parteAtivaId;
      
      htmlPartes += `
        <div onclick="window.selecionarParte(${pt.id})" style="border: 2px solid ${isActive ? 'var(--marrom)' : '#E5E5E5'}; padding: 8px 12px; border-radius: 8px; cursor: pointer; background: ${isActive ? '#fdf7f1' : '#fff'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color: ${isActive ? 'var(--marrom-escuro)' : '#333'}">${pt.nome}</strong>
            <span style="font-size:12px; font-weight:bold; color: ${statusColor}">
              ${faltaParte > 0 ? 'Falta: R$ ' + faltaParte.toFixed(2).replace('.', ',') : (pt.valor_devido > 0 ? 'Pago!' : '')}
            </span>
          </div>
          <div style="font-size: 12px; color: #555;">
            Devido: R$ ${pt.valor_devido.toFixed(2).replace('.', ',')} | Pago: R$ ${totalPagoParte.toFixed(2).replace('.', ',')}
          </div>
        </div>
      `;
    });
    
    fecharContaListaPartes.innerHTML = htmlPartes;
    
    const faltaTotal = currentFechamento.aPagar - totalPagoAll;
    fecharContaFaltaLbl.textContent = `R$ ${(faltaTotal > 0 ? faltaTotal : 0).toFixed(2).replace('.', ',')}`;
    
    if (faltaTotal <= 0.05 && totalPagoAll > 0 && currentPartes.length > 0) {
      fecharContaConfirmar.disabled = false;
      fecharContaFaltaLbl.style.color = 'green';
    } else {
      fecharContaConfirmar.disabled = true;
      fecharContaFaltaLbl.style.color = 'red';
    }

    renderPainelPagamento();
  }

  function renderPainelPagamento() {
    if (!parteAtivaId) {
      fecharContaPainelPagamento.classList.add('hidden');
      return;
    }
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (!pt) return;
    
    fecharContaPainelPagamento.classList.remove('hidden');
    tituloPagamentoParte.textContent = `Pagamentos - ${pt.nome}`;
    
    inputDinheiroRecebido.value = pt.dinheiro_recebido || '';
    
    let totalPagoParte = 0;
    let htmlLista = '';
    const formasNomes = { 'pix': 'PIX', 'dinheiro': 'Dinheiro', 'cartao_debito': 'Cartão de Débito', 'cartao_credito': 'Cartão de Crédito', 'outros': 'Outros' };

    pt.pagamentos.forEach(pag => {
      totalPagoParte += pag.valor;
      htmlLista += `
        <div style="display:flex; justify-content: space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:6px; border-radius:4px; margin-bottom:4px; font-size:13px;">
          <span>${formasNomes[pag.forma] || pag.forma}: <strong>R$ ${pag.valor.toFixed(2).replace('.', ',')}</strong></span>
          <button class="btn-ghost-small" style="color:red; padding:2px 6px;" onclick="window.removerPagamentoFechamento(${pag.id})">X</button>
        </div>
      `;
    });
    fecharContaLista.innerHTML = htmlLista;
    
    const faltaParte = pt.valor_devido - totalPagoParte;
    if (faltaParte > 0 && !fecharContaValor.value) {
      fecharContaValor.value = faltaParte.toFixed(2);
    } else if (faltaParte <= 0) {
      fecharContaValor.value = '';
    }

    let valorDinheiroLancado = pt.pagamentos.filter(pag => pag.forma === 'dinheiro').reduce((sum, pag) => sum + pag.valor, 0);
    let recebido = Number(inputDinheiroRecebido.value) || 0;
    
    if (recebido > 0) {
      let troco = recebido - valorDinheiroLancado;
      if (troco < 0) troco = 0;
      fecharContaTrocoLbl.textContent = `R$ ${troco.toFixed(2).replace('.', ',')}`;
    } else {
      fecharContaTrocoLbl.textContent = `R$ 0,00`;
    }
  }

  fecharContaForma.addEventListener('change', () => {
    if (fecharContaForma.value === 'dinheiro') {
      divDinheiroRecebido.classList.remove('hidden');
    } else {
      divDinheiroRecebido.classList.add('hidden');
    }
  });

  inputDinheiroRecebido.addEventListener('input', () => {
    if (parteAtivaId) {
      const pt = currentPartes.find(x => x.id === parteAtivaId);
      if (pt) {
        pt.dinheiro_recebido = Number(inputDinheiroRecebido.value) || 0;
        renderPainelPagamento();
      }
    }
  });

  btnAddPagamento.addEventListener('click', () => {
    if (!parteAtivaId) return;
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (!pt) return;

    const forma = fecharContaForma.value;
    const valor = Number(fecharContaValor.value);
    
    if (!valor || valor <= 0) {
      showToast('Digite um valor válido para o pagamento.', 'error');
      return;
    }

    pt.pagamentos.push({
      id: Date.now(),
      forma: forma,
      valor: valor
    });

    fecharContaValor.value = '';
    renderPartes();
  });

  window.removerPagamentoFechamento = function(id) {
    if (!parteAtivaId) return;
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (pt) {
      pt.pagamentos = pt.pagamentos.filter(p => p.id !== id);
      renderPartes();
    }
  };

  function fecharModalFecharConta() {
    modalFecharConta.classList.add('hidden');
    if (currentSelectedMesaParaConta) {
      abrirModalMesa(currentSelectedMesaParaConta.mesaCodigo, currentSelectedMesaParaConta.pedidosMesa);
    }
  }

  [fecharContaClose, fecharContaCancelar].forEach(b => b.addEventListener('click', fecharModalFecharConta));

  fecharContaConfirmar.addEventListener('click', async () => {
    // Coleta todos pagamentos de todas as partes
    let todosPagamentos = [];
    currentPartes.forEach(pt => {
      pt.pagamentos.forEach(pag => {
        todosPagamentos.push({ forma: pag.forma, valor: pag.valor, parteNome: pt.nome });
      });
    });

    let totalPagamentos = todosPagamentos.reduce((sum, p) => sum + p.valor, 0);
    
    if (totalPagamentos < currentFechamento.aPagar - 0.05) {
      showToast('O valor dos pagamentos é menor que o total a pagar!', 'error');
      return;
    }

    if (todosPagamentos.length === 0) {
      showToast('Adicione pelo menos uma forma de pagamento.', 'error');
      return;
    }

    fecharContaConfirmar.disabled = true;
    fecharContaConfirmar.textContent = 'Fechando...';

    try {
      const pagamentosPayload = todosPagamentos.map(p => ({
        forma: p.forma,
        valor: p.valor
      }));

      const { data, error } = await window.cafeteriaSupabase.rpc('fechar_conta_mesa', {
        p_mesa_codigo: currentFechamento.mesaCodigo,
        p_pagamentos: pagamentosPayload
      });

      if (error) throw error;

      showToast(`Conta da mesa ${currentFechamento.mesaCodigo} fechada com sucesso!`, 'success');
      
      if (fecharContaImprimirCupom.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoContaMultiPartes) {
        window.cafeteriaPrint.printFechamentoContaMultiPartes(
          currentFechamento.mesaCodigo,
          currentFechamento.pedidos,
          currentPartes,
          currentFechamento.aPagar,
          data.troco || 0
        );
      } else if (fecharContaImprimirCupom.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoConta) {
        window.cafeteriaPrint.printFechamentoConta(
          currentFechamento.mesaCodigo,
          currentFechamento.pedidos,
          todosPagamentos,
          currentFechamento.aPagar,
          data.troco || 0
        );
      }

      currentSelectedMesaParaConta = null;
      modalFecharConta.classList.add('hidden');
      loadActivePedidos();

    } catch (err) {
      console.error(err);
      showToast('Erro ao fechar conta: ' + err.message, 'error');
    } finally {
      fecharContaConfirmar.disabled = false;
      fecharContaConfirmar.textContent = 'Confirmar Fechamento';
    }
  });

  // -----------------------------------------------------
  // 8. REALTIME (NOTIFICAÇÃO QUANDO PEDIDO FICA PRONTO)
  // -----------------------------------------------------
  let fetchTimeout = null;
  function debouncedLoadActivePedidos() {
    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      loadActivePedidos();
    }, 300);
  }

  function updateConnectionStatus(isConnected) {
    const indicator = document.querySelector('.status-indicator');
    if (!indicator) return;
    const dot = indicator.querySelector('.pulse-dot');
    const text = indicator.querySelector('.status-text');
    
    if (isConnected) {
      if(dot) dot.style.backgroundColor = '#4CAF50';
      if(text) { text.textContent = 'Conectado'; text.style.color = '#fff'; }
    } else {
      if(dot) dot.style.backgroundColor = '#e74c3c';
      if(text) { text.textContent = 'Reconectando...'; text.style.color = '#e74c3c'; }
    }
  }

  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-barista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
        if (payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.status === 'concluido' && payload.old && payload.old.status !== 'concluido') {
            tocarAlertaPronto();
            chamarPedidoVoz(payload.new.numero_pedido || payload.new.id, payload.new.mesa_codigo, payload.new.cliente_nome);
          }
        }
        debouncedLoadActivePedidos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, payload => {
        debouncedLoadActivePedidos();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produtos' }, payload => {
        loadProdutos();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          updateConnectionStatus(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          updateConnectionStatus(false);
        }
      });
  }

  // Lidar com conexão caindo ou voltando
  window.addEventListener('online', () => {
    updateConnectionStatus(true);
    debouncedLoadActivePedidos();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  // Lidar com repouso/troca de aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      debouncedLoadActivePedidos();
    }
  });

  function tocarAlertaPronto() {
    try {
      audioPronto.currentTime = 0;
      audioPronto.play().catch(e => console.log('Autoplay bloqueado:', e));
    } catch (e) {}
  }

  function chamarPedidoVoz(numeroPedido, mesaCodigo, clienteNome) {
    tocarAlertaPronto();
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      let frase = '';
      if (clienteNome) {
        frase = `Atenção! Pedido da ${clienteNome}, está pronto para ser servido!`;
      } else {
        frase = `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para ser servido!`;
      }
      const utterance = new SpeechSynthesisUtterance(frase);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang && (v.lang === 'pt-BR' || v.lang.startsWith('pt')));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 300);
    } catch (err) {
      console.warn('Erro ao chamar por voz:', err);
    }
  }

  window.baristaChamarPedido = chamarPedidoVoz;

  // Inicializar
  checkSession();

})();
