/* =========================================================
   COZINHA.JS — Painel da Cozinha (Realtime)
   ========================================================= */

(function () {
  'use strict';

  // Refs
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  
  const listPendentes = document.getElementById('list-pendentes');
  const listPreparo = document.getElementById('list-preparo');
  const countPendentes = document.getElementById('count-pendentes');
  const countPreparo = document.getElementById('count-preparo');
  
  const audioAlert = document.getElementById('audio-alert');
  const btnTesteImpressao = document.getElementById('btn-teste-impressao');

  // Estado
  let currentUser = null;
  let pedidos = []; // array de objetos de pedido, incluindo os itens

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

    if (perfil.role !== 'cozinha' && perfil.role !== 'admin') {
      alert('Acesso negado. Apenas equipe da cozinha pode usar esta tela.');
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    currentUser = { ...user, perfil };
    document.getElementById('user-name').textContent = perfil.nome;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    await fetchPedidosIniciais();
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
  // 2. BUSCA DE DADOS (Fetch Inicial)
  // -----------------------------------------------------
  async function fetchPedidosIniciais() {
    const { data: pedidosData, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (*)
      `)
      .in('status', ['pendente', 'em_preparo'])
      .order('created_at', { ascending: true }); // Mais antigos primeiro

    if (error) {
      console.error('Erro ao buscar pedidos:', error);
      return;
    }

    pedidos = pedidosData || [];
    renderPedidos();
  }

  // -----------------------------------------------------
  // 3. RENDERIZAÇÃO
  // -----------------------------------------------------
  function renderPedidos() {
    const pendentes = pedidos.filter(p => p.status === 'pendente');
    const preparo = pedidos.filter(p => p.status === 'em_preparo');

    countPendentes.textContent = pendentes.length;
    countPreparo.textContent = preparo.length;

    renderList(pendentes, listPendentes, 'pendente');
    renderList(preparo, listPreparo, 'em_preparo');
  }

  function renderList(list, container, tipo) {
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum pedido ${tipo === 'pendente' ? 'pendente' : 'em preparo'}.</div>`;
      return;
    }

    container.innerHTML = '';
    
    list.forEach(pedido => {
      // Calcular tempo corrido
      const criacao = new Date(pedido.created_at);
      const agora = new Date();
      const diffMinutos = Math.floor((agora - criacao) / 60000);
      
      const atrasadoClass = diffMinutos > 15 ? 'atrasado' : '';
      let tempoStr = diffMinutos < 1 ? 'Agora' : `${diffMinutos}m atrás`;

      // Montar Itens
      let itensHtml = '';
      if (pedido.pedido_itens && pedido.pedido_itens.length > 0) {
        pedido.pedido_itens.forEach(item => {
          itensHtml += `
            <div class="item-row">
              <span class="item-qty">${item.quantidade}x</span>
              <span class="item-name">${item.nome_produto}</span>
            </div>
          `;
        });
      } else {
        itensHtml = '<div>Nenhum item...</div>';
      }

      const card = document.createElement('div');
      card.className = 'pedido-card';
      
      let botoesHtml = '';
      if (tipo === 'pendente') {
        botoesHtml = `
          <button class="btn-card btn-card--preparo" onclick="window.updateStatus(${pedido.id}, 'em_preparo')">
            Mover p/ Preparo
          </button>
          <button class="btn-card btn-card--concluir" onclick="window.updateStatus(${pedido.id}, 'concluido')">
            Concluir Direto
          </button>
        `;
      } else {
        botoesHtml = `
          <button class="btn-card btn-card--concluir" onclick="window.updateStatus(${pedido.id}, 'concluido')">
            Pronto! (Concluir)
          </button>
        `;
      }

      const obsHtml = pedido.observacoes 
        ? `<div class="pedido-obs">📝 ${pedido.observacoes}</div>` 
        : '';

      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-mesa">${pedido.mesa_codigo}</div>
          <div class="pedido-tempo ${atrasadoClass}">⏱ ${tempoStr}</div>
        </div>
        <div class="pedido-itens">
          ${itensHtml}
        </div>
        ${obsHtml}
        <div class="pedido-footer">
          ${botoesHtml}
        </div>
      `;

      container.appendChild(card);
    });
  }

  // Atualizador de tempo (roda a cada 1 minuto)
  setInterval(() => {
    if (currentUser) renderPedidos();
  }, 60000);

  // -----------------------------------------------------
  // 4. AÇÕES (Atualizar Status)
  // -----------------------------------------------------
  window.updateStatus = async function(pedidoId, novoStatus) {
    const payload = {
      status: novoStatus,
      updated_at: new Date().toISOString()
    };
    
    if (novoStatus === 'concluido') {
      payload.concluido_por = currentUser.id;
      payload.concluido_em = new Date().toISOString();
    }

    const { error } = await window.cafeteriaSupabase
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId);

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
      return;
    }
    
    // Opcional: Atualizar UI otimisticamente (nós faremos reload via Realtime, mas pra garantir)
    // Se o realtime for rápido, não precisa.
  };

  // -----------------------------------------------------
  // 5. SUPABASE REALTIME
  // -----------------------------------------------------
  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-cozinha')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async payload => {
        // Quando houver QUALQUER mudança na tabela pedidos, recarrega
        // Idealmente verificar o event.type, mas recarregar tudo garante que temos os itens.
        
        // Toca som se for um novo pedido
        if (payload.eventType === 'INSERT') {
          playAlert();
          
          // Buscar itens do novo pedido para imprimir
          const { data: newPedido } = await window.cafeteriaSupabase
            .from('pedidos')
            .select('*, pedido_itens(*)')
            .eq('id', payload.new.id)
            .single();
            
          if (newPedido) {
             // Chama a impressão automática
             if (window.cafeteriaPrint) {
               window.cafeteriaPrint.printPedido(newPedido, newPedido.pedido_itens);
             }
          }
        }

        fetchPedidosIniciais();
      })
      .subscribe();
  }

  function playAlert() {
    try {
      audioAlert.currentTime = 0;
      audioAlert.play().catch(e => console.warn('Bloqueio de autoplay do navegador', e));
    } catch(e) {}
  }

  // Teste de impressão
  btnTesteImpressao.addEventListener('click', () => {
    const fakePedido = {
      id: 999,
      numero_pedido: 999,
      mesa_codigo: 'TESTE',
      created_at: new Date().toISOString(),
      total: 10.50,
      observacoes: 'Teste de impressão com sucesso!'
    };
    const fakeItens = [
      { quantidade: 1, nome_produto: 'Café Teste', preco_unitario: 10.50 }
    ];
    if (window.cafeteriaPrint) {
      window.cafeteriaPrint.printPedido(fakePedido, fakeItens);
    }
  });

  // Init
  checkSession();

})();
