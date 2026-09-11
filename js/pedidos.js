/* =========================================================
   PEDIDOS.JS — Lógica do PDV do Barista
   ========================================================= */

(function () {
  'use strict';

  // Refs
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  
  const mesaSelect = document.getElementById('mesa-select');
  const categoriesTabs = document.getElementById('categories-tabs');
  const productsGrid = document.getElementById('products-grid');
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalValue = document.getElementById('cart-total-value');
  const cartMesaBadge = document.getElementById('cart-mesa-badge');
  const btnEnviarPedido = document.getElementById('btn-enviar-pedido');
  const pedidoObs = document.getElementById('pedido-obs');
  
  // Estado
  let currentUser = null;
  let allProducts = [];
  let currentCategory = '';
  let cart = []; // Array de { produto, quantidade }
  let mesas = [];

  // -----------------------------------------------------
  // 1. AUTENTICAÇÃO
  // -----------------------------------------------------
  async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data.session) {
      await loadProfile(data.session.user);
    }
  }

  async function loadProfile(user) {
    const { data: perfil, error } = await window.cafeteriaSupabase
      .from('perfis')
      .select('nome, role')
      .eq('id', user.id)
      .single();

    if (error || !perfil) {
      alert('Erro ao carregar perfil. Fale com o administrador.');
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    if (perfil.role !== 'barista' && perfil.role !== 'admin') {
      alert('Acesso negado. Apenas baristas podem usar esta tela.');
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    currentUser = { ...user, perfil };
    document.getElementById('user-name').textContent = perfil.nome;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    await loadInitialData();
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
      loginError.textContent = 'Credenciais inválidas.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    await loadProfile(data.user);
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await window.cafeteriaSupabase.auth.signOut();
    window.location.reload();
  });

  // -----------------------------------------------------
  // 2. CARREGAMENTO DE DADOS (Mesas e Cardápio)
  // -----------------------------------------------------
  async function loadInitialData() {
    // Carregar mesas
    const { data: mesasData } = await window.cafeteriaSupabase
      .from('mesas')
      .select('*')
      .eq('ativo', true)
      .order('codigo');
    
    if (mesasData) {
      mesas = mesasData;
      mesaSelect.innerHTML = '<option value="">Selecione...</option>';
      mesas.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.codigo;
        opt.textContent = `${m.codigo} — ${m.descricao}`;
        mesaSelect.appendChild(opt);
      });
    }

    // Carregar categorias (usando as configs existentes do admin, ou distinct de produtos)
    // Para simplificar, faremos um fetch dos produtos ativos
    const { data: produtosData } = await window.cafeteriaSupabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('ordem');

    if (produtosData) {
      allProducts = produtosData;
      renderCategories();
      // Seleciona a primeira categoria por padrão
      const firstCat = [...new Set(allProducts.map(p => p.categoria_id))][0];
      if (firstCat) setCategory(firstCat);
    }
  }

  function renderCategories() {
    // Obter IDs únicos de categoria
    const catIds = [...new Set(allProducts.map(p => p.categoria_id))];
    
    categoriesTabs.innerHTML = '';
    catIds.forEach(catId => {
      const btn = document.createElement('button');
      btn.className = 'cat-tab';
      // Aqui idealmente buscaríamos o nome real da categoria na tabela 'categorias', 
      // mas como o schema inicial não mostrou a tabela categorias, usaremos o ID capitalizado.
      btn.textContent = (catId.charAt(0).toUpperCase() + catId.slice(1)).replace('-', ' ');
      btn.onclick = () => setCategory(catId);
      categoriesTabs.appendChild(btn);
    });
  }

  function setCategory(catId) {
    currentCategory = catId;
    
    // Atualizar tabs
    document.querySelectorAll('.cat-tab').forEach(t => {
      t.classList.toggle('active', t.textContent.toLowerCase().replace(' ', '-') === catId.toLowerCase());
    });

    renderProducts();
  }

  function renderProducts() {
    productsGrid.innerHTML = '';
    const filtered = allProducts.filter(p => p.categoria_id === currentCategory);
    
    if (filtered.length === 0) {
      productsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center;">Nenhum produto nesta categoria.</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <h4>${p.nome}</h4>
        <div class="price">R$ ${p.preco.toFixed(2).replace('.', ',')}</div>
      `;
      card.onclick = () => addToCart(p);
      productsGrid.appendChild(card);
    });
  }

  // -----------------------------------------------------
  // 3. CARRINHO (CART)
  // -----------------------------------------------------
  mesaSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    cartMesaBadge.textContent = val ? val : 'Sem Mesa';
    checkFormValidity();
  });

  function addToCart(produto) {
    const existing = cart.find(item => item.produto.id === produto.id);
    if (existing) {
      existing.quantidade += 1;
    } else {
      cart.push({ produto, quantidade: 1 });
    }
    renderCart();
  }

  function updateQuantity(produtoId, delta) {
    const item = cart.find(i => i.produto.id === produtoId);
    if (!item) return;
    
    item.quantidade += delta;
    if (item.quantidade <= 0) {
      cart = cart.filter(i => i.produto.id !== produtoId);
    }
    renderCart();
  }

  function renderCart() {
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<div class="cart-empty">Nenhum item adicionado.</div>';
      cartTotalValue.textContent = 'R$ 0,00';
      checkFormValidity();
      return;
    }

    cartItemsContainer.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
      const subtotal = item.produto.preco * item.quantidade;
      total += subtotal;

      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name">${item.produto.nome}</div>
          <div class="cart-item-price">R$ ${item.produto.preco.toFixed(2).replace('.', ',')}</div>
        </div>
        <div class="cart-item-actions">
          <button class="cart-btn" onclick="window.updateQuantity(${item.produto.id}, -1)">-</button>
          <span class="cart-qty">${item.quantidade}</span>
          <button class="cart-btn" onclick="window.updateQuantity(${item.produto.id}, 1)">+</button>
          <button class="cart-btn remove" onclick="window.updateQuantity(${item.produto.id}, -999)">🗑</button>
        </div>
      `;
      cartItemsContainer.appendChild(div);
    });

    cartTotalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    checkFormValidity();
  }
  
  // Expor global para os handlers inline (onclick="window.updateQuantity...")
  window.updateQuantity = updateQuantity;

  function checkFormValidity() {
    const hasMesa = mesaSelect.value !== '';
    const hasItems = cart.length > 0;
    btnEnviarPedido.disabled = !(hasMesa && hasItems);
  }

  // -----------------------------------------------------
  // 4. ENVIAR PEDIDO (SUPABASE)
  // -----------------------------------------------------
  btnEnviarPedido.addEventListener('click', async () => {
    if (btnEnviarPedido.disabled) return;
    
    const mesaCodigo = mesaSelect.value;
    const obs = pedidoObs.value.trim();
    
    const total = cart.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0);

    btnEnviarPedido.disabled = true;
    btnEnviarPedido.textContent = 'Enviando...';

    // 1. Criar Pedido
    const { data: pedidoData, error: pedidoError } = await window.cafeteriaSupabase
      .from('pedidos')
      .insert([{
        mesa_codigo: mesaCodigo,
        observacoes: obs,
        total: total,
        criado_por: currentUser.id
      }])
      .select()
      .single();

    if (pedidoError) {
      alert('Erro ao criar pedido: ' + pedidoError.message);
      btnEnviarPedido.disabled = false;
      btnEnviarPedido.textContent = 'Enviar Pedido';
      return;
    }

    // 2. Criar Itens do Pedido
    const itensToInsert = cart.map(item => ({
      pedido_id: pedidoData.id,
      produto_id: item.produto.id,
      nome_produto: item.produto.nome,
      quantidade: item.quantidade,
      preco_unitario: item.produto.preco
    }));

    const { error: itensError } = await window.cafeteriaSupabase
      .from('pedido_itens')
      .insert(itensToInsert);

    if (itensError) {
      alert('Erro ao salvar itens do pedido. Avise o admin.');
    } else {
      // Sucesso! Limpar tela
      cart = [];
      pedidoObs.value = '';
      // mesaSelect.value = ''; // Pode ser útil manter a mesa se forem muitos pedidos seguidos para a mesma, mas vamos limpar
      mesaSelect.value = ''; 
      cartMesaBadge.textContent = 'Sem Mesa';
      renderCart();
      
      // Feedback visual rápido
      btnEnviarPedido.textContent = 'Enviado! ✅';
      setTimeout(() => {
        btnEnviarPedido.textContent = 'Enviar Pedido';
      }, 2000);
    }
  });

  // Init
  checkSession();

})();
