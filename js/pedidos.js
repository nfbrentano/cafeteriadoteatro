/* =========================================================
   PEDIDOS.JS — Lógica do PDV do Barista / Atendimento
   ========================================================= */

(function () {
  'use strict';

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
  const btnRecarregarPedidos = document.getElementById('btn-recarregar-pedidos');
  const filtroChips = document.querySelectorAll('.status-filters .filter-chip');

  // Refs Modais
  const modalObs = document.getElementById('modal-obs');
  const modalObsTitle = document.getElementById('modal-obs-title');
  const modalObsInput = document.getElementById('modal-obs-input');
  const modalObsSave = document.getElementById('modal-obs-save');
  const modalObsClose = document.getElementById('modal-obs-close');
  const modalObsCancel = document.getElementById('modal-obs-cancel');

  const modalMesa = document.getElementById('modal-mesa');
  const modalMesaTitle = document.getElementById('modal-mesa-title');
  const modalMesaBody = document.getElementById('modal-mesa-body');
  const modalMesaClose = document.getElementById('modal-mesa-close');
  const modalMesaFechar = document.getElementById('modal-mesa-fechar');
  const modalMesaPrint = document.getElementById('modal-mesa-print');

  const audioPronto = document.getElementById('audio-pronto');

  // Estado
  let currentUser = null;
  let allProducts = [];
  let currentCategory = '';
  let searchQuery = '';
  let cart = []; // Array de { produto, quantidade, observacoes }
  let mesas = [];
  let activePedidos = [];
  let currentFilterStatus = 'todos';
  let activeObsCartIndex = null;
  let currentSelectedMesaParaConta = null;
  let pedidosEntreguesLocais = new Set();

  // -----------------------------------------------------
  // 1. AUTENTICAÇÃO
  // -----------------------------------------------------
  async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data && data.session) {
      await loadProfile(data.session.user);
    }
  }

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
      loadActivePedidos()
    ]);
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
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === m.codigo && !pedidosEntreguesLocais.has(p.id));
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
    if (currentCategory) {
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
      card.className = 'product-card';
      const descHtml = p.descricao ? `<p class="product-card__desc">${p.descricao}</p>` : '';
      card.innerHTML = `
        <div class="product-card__header">
          <h4>${p.nome}</h4>
          ${descHtml}
        </div>
        <div class="product-card__bottom">
          <span class="price">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</span>
          <span class="btn-add-badge">+ Adicionar</span>
        </div>
      `;
      card.onclick = () => addToCart(p);
      productsGrid.appendChild(card);
    });
  }

  // -----------------------------------------------------
  // 4. CARRINHO & OBSERVAÇÃO POR ITEM
  // -----------------------------------------------------
  mesaSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    cartMesaBadge.textContent = val ? val : 'Sem Mesa';
    checkFormValidity();
  });

  function addToCart(produto) {
    const existingIndex = cart.findIndex(item => item.produto.id === produto.id && !item.observacoes);
    if (existingIndex > -1) {
      cart[existingIndex].quantidade += 1;
    } else {
      cart.push({ produto, quantidade: 1, observacoes: '' });
    }
    renderCart();
  }

  function updateQuantity(index, delta) {
    if (!cart[index]) return;
    cart[index].quantidade += delta;
    if (cart[index].quantidade <= 0) {
      cart.splice(index, 1);
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
  }

  function closeCartDrawer() {
    if (cartPanel) cartPanel.classList.remove('open-mobile');
    if (cartBackdrop) cartBackdrop.classList.add('hidden');
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

    cart.forEach((item, index) => {
      const subtotal = item.produto.preco * item.quantidade;
      total += subtotal;

      const obsHtml = item.observacoes 
        ? `<div class="cart-item-obs">↳ Obs: ${item.observacoes}</div>` 
        : '';

      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.produto.nome}</div>
            <div class="cart-item-price">R$ ${Number(item.produto.preco).toFixed(2).replace('.', ',')}</div>
            ${obsHtml}
          </div>
          <div class="cart-item-actions">
            <button class="cart-btn obs-btn" title="Adicionar Observação" onclick="window.baristaOpenObs(${index})">✏️</button>
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
    const hasItems = cart.length > 0;
    btnEnviarPedido.disabled = !(hasMesa && hasItems);
  }

  // -----------------------------------------------------
  // 5. ENVIAR PEDIDO
  // -----------------------------------------------------
  btnEnviarPedido.addEventListener('click', async () => {
    if (btnEnviarPedido.disabled) return;
    
    const mesaCodigo = mesaSelect.value;
    const obsGeral = pedidoObs.value.trim();
    const formaPag = pedidoPagamento.value || null;
    const statusPag = pedidoPago.checked ? 'pago' : 'pendente';
    
    const total = cart.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0);

    btnEnviarPedido.disabled = true;
    btnEnviarPedido.textContent = 'Enviando...';

    // 1. Inserir Pedido com operador e pagamento
    const { data: pedidoData, error: pedidoError } = await window.cafeteriaSupabase
      .from('pedidos')
      .insert([{
        mesa_codigo: mesaCodigo,
        observacoes: obsGeral,
        total: total,
        criado_por: currentUser.id,
        criado_por_nome: currentUser.perfil.nome,
        forma_pagamento: formaPag,
        status_pagamento: statusPag
      }])
      .select()
      .single();

    if (pedidoError) {
      alert('Erro ao criar pedido: ' + pedidoError.message);
      btnEnviarPedido.disabled = false;
      btnEnviarPedido.textContent = 'Enviar para Cozinha';
      return;
    }

    // 2. Inserir Itens com observações individuais
    const itensToInsert = cart.map(item => ({
      pedido_id: pedidoData.id,
      produto_id: item.produto.id,
      nome_produto: item.produto.nome,
      quantidade: item.quantidade,
      preco_unitario: item.produto.preco,
      observacoes: item.observacoes || null
    }));

    const { error: itensError } = await window.cafeteriaSupabase
      .from('pedido_itens')
      .insert(itensToInsert);

    if (itensError) {
      alert('Aviso: Pedido registrado, mas erro ao salvar itens: ' + itensError.message);
    }

    // Limpeza e Sucesso
    cart = [];
    pedidoObs.value = '';
    pedidoPagamento.value = '';
    pedidoPago.checked = false;
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
    const { data, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (*)
      `)
      .in('status', ['pendente', 'em_preparo', 'concluido'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      activePedidos = data;
      renderMesasSection();
      renderPedidosCards();
      updateProntosBadge();
      updateMesaSelectOptions();
    }
  }

  function updateProntosBadge() {
    const prontosCount = activePedidos.filter(p => p.status === 'concluido' && !pedidosEntreguesLocais.has(p.id)).length;
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
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === mesa.codigo && !pedidosEntreguesLocais.has(p.id));
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

  btnRecarregarPedidos.addEventListener('click', loadActivePedidos);

  function renderPedidosCards() {
    pedidosCardsGrid.innerHTML = '';

    let list = activePedidos.filter(p => !pedidosEntreguesLocais.has(p.id));
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
        itensHtml += `
          <div class="pedido-card-barista__item">
            <span><strong>${item.quantidade}x</strong> ${item.nome_produto} ${item.observacoes ? '<em style="color:#D97706">(' + item.observacoes + ')</em>' : ''}</span>
          </div>
        `;
      });

      const btnAcaoHtml = isPronto
        ? `<div class="pedido-card-barista__actions">
            <button class="btn-chamar-voz" onclick="window.baristaChamarPedido('${pedido.numero_pedido || pedido.id}', '${pedido.mesa_codigo}')" title="Fazer chamada por voz">
              📢 Chamar
            </button>
            <button class="btn-entregar" onclick="window.baristaMarcarEntregue(${pedido.id})">
              ✅ Entregue
            </button>
          </div>`
        : `<span style="font-size:12px; color:#888;">Operador: ${pedido.criado_por_nome || 'Barista'}</span>`;

      card.innerHTML = `
        <div class="pedido-card-barista__header">
          <span class="pedido-card-barista__mesa">${pedido.mesa_codigo} (Pedido #${pedido.numero_pedido || pedido.id})</span>
          <span class="pedido-card-barista__status status-chip--${pedido.status === 'concluido' ? 'pronto' : pedido.status === 'em_preparo' ? 'preparo' : 'pendente'}">
            ${statusLabel}
          </span>
        </div>
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

  window.baristaMarcarEntregue = function (pedidoId) {
    pedidosEntreguesLocais.add(pedidoId);
    renderPedidosCards();
    updateProntosBadge();
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
        html += `<li>${it.quantidade}x ${it.nome_produto} ${it.observacoes ? '<em style="color:#D97706">(' + it.observacoes + ')</em>' : ''} — R$ ${(it.quantidade * it.preco_unitario).toFixed(2).replace('.', ',')}</li>`;
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

  modalMesaPrint.addEventListener('click', () => {
    if (currentSelectedMesaParaConta && window.cafeteriaPrint) {
      window.cafeteriaPrint.printConferenciaMesa(
        currentSelectedMesaParaConta.mesaCodigo,
        currentSelectedMesaParaConta.pedidosMesa
      );
    }
  });

  // -----------------------------------------------------
  // 8. REALTIME (NOTIFICAÇÃO QUANDO PEDIDO FICA PRONTO)
  // -----------------------------------------------------
  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-barista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
        if (payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.status === 'concluido' && payload.old && payload.old.status !== 'concluido') {
            tocarAlertaPronto();
            chamarPedidoVoz(payload.new.numero_pedido || payload.new.id, payload.new.mesa_codigo);
          }
        }
        loadActivePedidos();
      })
      .subscribe();
  }

  function tocarAlertaPronto() {
    try {
      audioPronto.currentTime = 0;
      audioPronto.play().catch(e => console.log('Autoplay bloqueado:', e));
    } catch (e) {}
  }

  function chamarPedidoVoz(numeroPedido, mesaCodigo) {
    tocarAlertaPronto();
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const frase = `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para ser servido!`;
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
