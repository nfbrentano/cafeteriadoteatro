/* =========================================================
   COZINHA.JS — Painel da Cozinha & Bar (KDS Realtime)
   ========================================================= */

(function () {
  'use strict';

  // Refs
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

  const listPendentes = document.getElementById('list-pendentes');
  const listPreparo = document.getElementById('list-preparo');
  const listConcluidos = document.getElementById('list-concluidos');
  const countPendentes = document.getElementById('count-pendentes');
  const countPreparo = document.getElementById('count-preparo');
  const countConcluidos = document.getElementById('count-concluidos');

  const colPendentes = document.getElementById('col-pendentes');
  const colPreparo = document.getElementById('col-preparo');
  const colConcluidos = document.getElementById('col-concluidos');
  const mcountPendentes = document.getElementById('mcount-pendentes');
  const mcountPreparo = document.getElementById('mcount-preparo');
  const mcountConcluidos = document.getElementById('mcount-concluidos');
  const btnTesteVoz = document.getElementById('btn-teste-voz');
  const kdsTabBtns = document.querySelectorAll('.kds-tab-btn');

  const audioAlert = document.getElementById('audio-alert');
  const audioBanner = document.getElementById('audio-banner');
  const btnAtivarAudio = document.getElementById('btn-ativar-audio');
  const btnToggleSom = document.getElementById('btn-toggle-som');
  const btnTesteImpressao = document.getElementById('btn-teste-impressao');

  const cancelToast = document.getElementById('cancel-toast');
  const cancelToastMsg = document.getElementById('cancel-toast-msg');
  const cancelToastClose = document.getElementById('cancel-toast-close');

  // Estado
  let currentUser = null;
  let pedidos = []; // array de pedidos com itens
  let somHabilitado = true;
  let audioDesbloqueado = false;

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
      alert('Erro ao consultar perfil: ' + error.message);
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    if (!perfil) {
      alert(`O usuário (${user.email || user.id}) está autenticado, mas não possui cadastro na tabela "perfis".\n\nAdicione o usuário na tabela "perfis" com o perfil "cozinha" ou "admin".`);
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    if (perfil.role !== 'cozinha' && perfil.role !== 'admin') {
      alert('Acesso negado. Apenas equipe da cozinha e administradores podem usar esta tela.');
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    currentUser = { ...user, perfil };
    document.getElementById('user-name').textContent = perfil.nome;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    testAudioAutoplay();
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

  btnLogout.addEventListener('click', async () => {
    await window.cafeteriaSupabase.auth.signOut();
    window.location.reload();
  });

  // -----------------------------------------------------
  // 2. CONTROLE DE ÁUDIO (AUTOPLAY POLICY)
  // -----------------------------------------------------
  function testAudioAutoplay() {
    audioAlert.volume = 0.01;
    audioAlert.play().then(() => {
      audioAlert.pause();
      audioAlert.currentTime = 0;
      audioAlert.volume = 1.0;
      audioDesbloqueado = true;
      audioBanner.classList.add('hidden');
    }).catch(() => {
      // Bloqueado pelo navegador
      audioAlert.volume = 1.0;
      audioDesbloqueado = false;
      audioBanner.classList.remove('hidden');
    });
  }

  btnAtivarAudio.addEventListener('click', () => {
    audioAlert.currentTime = 0;
    audioAlert.play().then(() => {
      audioDesbloqueado = true;
      audioBanner.classList.add('hidden');
      if ('speechSynthesis' in window) {
        const unlock = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(unlock);
      }
    }).catch(e => console.log('Erro ao tocar:', e));
  });

  btnToggleSom.addEventListener('click', () => {
    somHabilitado = !somHabilitado;
    if (somHabilitado) {
      btnToggleSom.textContent = '🔔 Som Ativo';
      btnToggleSom.style.color = '#EEE';
      playAlert();
    } else {
      btnToggleSom.textContent = '🔕 Mudo';
      btnToggleSom.style.color = '#FFA726';
    }
  });

  function playAlert() {
    if (!somHabilitado) return;
    try {
      audioAlert.currentTime = 0;
      audioAlert.play().catch(e => console.warn('Autoplay impedido', e));
    } catch (e) {}
  }

  function chamarPedidoVoz(numeroPedido, mesaCodigo) {
    playAlert();
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const frase = `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para retirada!`;
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
      console.warn('Erro ao sintetizar voz na cozinha:', err);
    }
  }

  window.cozinhaChamarPedido = chamarPedidoVoz;

  if (btnTesteVoz) {
    btnTesteVoz.addEventListener('click', () => {
      chamarPedidoVoz('10', 'Mesa 01');
    });
  }

  // -----------------------------------------------------
  // 2.1 NAVEGAÇÃO SEGMENTADA MOBILE (KDS)
  // -----------------------------------------------------
  let activeMobileCol = 'pendentes';

  function setMobileCol(colName) {
    activeMobileCol = colName;
    kdsTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.col === colName);
    });
    if (colPendentes) colPendentes.classList.toggle('active-col', colName === 'pendentes');
    if (colPreparo) colPreparo.classList.toggle('active-col', colName === 'preparo');
    if (colConcluidos) colConcluidos.classList.toggle('active-col', colName === 'concluidos');
  }

  kdsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setMobileCol(btn.dataset.col);
    });
  });

  // Inicializar coluna ativa no mobile
  setMobileCol('pendentes');

  // Toast de Cancelamento
  cancelToastClose.addEventListener('click', () => {
    cancelToast.classList.add('hidden');
  });

  function showCancelToast(msg) {
    cancelToastMsg.textContent = msg;
    cancelToast.classList.remove('hidden');
    setTimeout(() => {
      cancelToast.classList.add('hidden');
    }, 8000);
  }

  // -----------------------------------------------------
  // 3. BUSCA DE PEDIDOS (Pendentes, Preparo e Concluídos do Dia)
  // -----------------------------------------------------
  async function fetchPedidosIniciais() {
    // Buscar pedidos pendentes e em preparo, mais todos os pedidos concluídos do dia atual (desde as 00:00)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicioDoDia = hoje.toISOString();

    const { data: pedidosData, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (
          *,
          pedido_item_adicionais (*),
          pedido_item_sabores (*)
        )
      `)
      .or(`status.in.(pendente,em_preparo),and(status.eq.concluido,created_at.gte.${inicioDoDia})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar pedidos da cozinha:', error);
      return;
    }

    pedidos = pedidosData || [];
    renderPedidos();
  }

  // -----------------------------------------------------
  // 4. RENDERIZAÇÃO DAS 3 COLUNAS
  // -----------------------------------------------------
  function renderPedidos() {
    const pendentes = pedidos.filter(p => p.status === 'pendente');
    const preparo = pedidos.filter(p => p.status === 'em_preparo');
    // Concluídos do dia: sempre os mais recentes no topo
    const concluidos = pedidos
      .filter(p => p.status === 'concluido')
      .sort((a, b) => new Date(b.concluido_em || b.updated_at || b.created_at) - new Date(a.concluido_em || a.updated_at || a.created_at));

    countPendentes.textContent = pendentes.length;
    countPreparo.textContent = preparo.length;
    countConcluidos.textContent = concluidos.length;

    if (mcountPendentes) mcountPendentes.textContent = pendentes.length;
    if (mcountPreparo) mcountPreparo.textContent = preparo.length;
    if (mcountConcluidos) mcountConcluidos.textContent = concluidos.length;

    renderList(pendentes, listPendentes, 'pendente');
    renderList(preparo, listPreparo, 'em_preparo');
    renderList(concluidos, listConcluidos, 'concluido');
  }

  function renderList(list, container, tipo) {
    if (list.length === 0) {
      const msgs = {
        'pendente': 'Nenhum pedido pendente.',
        'em_preparo': 'Nenhum pedido em preparo.',
        'concluido': 'Nenhum pedido concluído hoje.'
      };
      container.innerHTML = `<div class="empty-state">${msgs[tipo]}</div>`;
      return;
    }

    container.innerHTML = '';
    
    list.forEach(pedido => {
      const criacao = new Date(pedido.created_at);
      const agora = new Date();
      const diffMinutos = Math.floor((agora - criacao) / 60000);
      
      const atrasadoClass = (diffMinutos > 15 && tipo !== 'concluido') ? 'atrasado' : '';
      let tempoStr = diffMinutos < 1 ? 'Agora' : `${diffMinutos}m atrás`;

      // Montar Itens com observações individuais
      let itensHtml = '';
      if (pedido.pedido_itens && pedido.pedido_itens.length > 0) {
        pedido.pedido_itens.forEach(item => {
          const isCancelado = item.cancelado;
          const isCortesia = item.cortesia_de_item_id ? true : false;
          
          let cancelClass = isCancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
          let cancelLabel = isCancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
          let cortesiaLabel = isCortesia && !isCancelado ? '<span style="background: #e74c3c; color: white; font-size:10px; padding:2px 4px; border-radius:4px; margin-left:4px;">CORTESIA</span>' : '';

          const obsItemHtml = item.observacoes 
            ? `<div class="item-obs-badge">⚠️ Obs: ${window.escapeHtml(item.observacoes)}</div>` 
            : '';

          let adicHtml = '';
          if (item.pedido_item_adicionais && item.pedido_item_adicionais.length > 0) {
            adicHtml = item.pedido_item_adicionais.map(ad => 
              `<div style="font-size:12px; color:#666; margin-left:24px; ${isCancelado ? 'text-decoration: line-through;' : ''}">+ ${window.escapeHtml(ad.nome_adicional)}</div>`
            ).join('');
          }
          
          let saboresHtml = '';
          if (item.pedido_item_sabores && item.pedido_item_sabores.length === 2) {
            saboresHtml = `<div style="font-size:13px; color:#555; margin-left:24px; ${isCancelado ? 'text-decoration: line-through;' : ''}">
              ½ ${window.escapeHtml(item.pedido_item_sabores[0].nome)} <br/>
              ½ ${window.escapeHtml(item.pedido_item_sabores[1].nome)}
            </div>`;
          }

          itensHtml += `
            <div class="item-row">
              <div class="item-main" ${cancelClass}>
                <span class="item-qty">${item.quantidade}x</span>
                <span class="item-name">${window.escapeHtml(item.nome_produto)} ${cortesiaLabel} ${cancelLabel}</span>
              </div>
              ${saboresHtml}
              ${adicHtml}
              ${obsItemHtml}
            </div>
          `;
        });
      } else {
        itensHtml = '<div style="color:#888;">Nenhum item...</div>';
      }

      const card = document.createElement('div');
      card.className = 'pedido-card';
      
      let botoesHtml = '';
      if (tipo === 'pendente') {
        botoesHtml = `
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
          <div class="footer-actions">
            <button class="btn-card btn-card--preparo" onclick="window.updateStatus(${pedido.id}, 'em_preparo')">
              Iniciar Preparo
            </button>
            <button class="btn-card btn-card--concluir" onclick="window.updateStatus(${pedido.id}, 'concluido')">
              Pronto!
            </button>
          </div>
        `;
      } else if (tipo === 'em_preparo') {
        botoesHtml = `
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
          <div class="footer-actions">
            <button class="btn-card btn-card--concluir" onclick="window.updateStatus(${pedido.id}, 'concluido')">
              Pronto! (Concluir)
            </button>
          </div>
        `;
      } else {
        // Concluído (Permite chamar por voz, desfazer ou reimprimir)
        botoesHtml = `
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Reimprimir">🖨 Comanda</button>
          <div class="footer-actions">
            <button class="btn-card btn-card--chamar" onclick="window.cozinhaChamarPedido('${pedido.numero_pedido || pedido.id}', '${pedido.mesa_codigo}')" title="Chamar pelo celular">
              📢 Chamar
            </button>
            <button class="btn-card btn-card--desfazer" onclick="window.updateStatus(${pedido.id}, 'em_preparo')">
              ↩ Desfazer
            </button>
          </div>
        `;
      }

      const obsHtml = pedido.observacoes 
        ? `<div class="pedido-obs">📝 Obs Geral: ${window.escapeHtml(pedido.observacoes)}</div>` 
        : '';

      const operadorStr = pedido.criado_por_nome ? `Atendente: ${pedido.criado_por_nome}` : 'Atendimento';

      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-mesa">${pedido.mesa_codigo} <span style="font-size:14px; font-weight:normal; color:#888;">(#${pedido.numero_pedido || pedido.id})</span></div>
          <div class="pedido-tempo ${atrasadoClass}">⏱ ${tempoStr}</div>
        </div>
        <div class="pedido-operador">${operadorStr}</div>
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

  // Atualizar contadores de tempo a cada 60s
  setInterval(() => {
    if (currentUser) renderPedidos();
  }, 60000);

  // -----------------------------------------------------
  // 5. AÇÕES (Atualizar Status e Reimpressão)
  // -----------------------------------------------------
  window.updateStatus = async function (pedidoId, novoStatus) {
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

    // Atualização otimista local
    const p = pedidos.find(item => item.id === pedidoId);
    if (p) {
      p.status = novoStatus;
      p.updated_at = payload.updated_at;
      if (novoStatus === 'concluido') {
        p.concluido_em = payload.concluido_em;
        chamarPedidoVoz(p.numero_pedido || p.id, p.mesa_codigo);
      }
      renderPedidos();
    }
  };

  window.cozinhaReimprimir = function (pedidoId) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (pedido && window.cafeteriaPrint) {
      window.cafeteriaPrint.printPedido(pedido, pedido.pedido_itens || []);
    }
  };

  // -----------------------------------------------------
  // 6. SUPABASE REALTIME
  // -----------------------------------------------------
  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-cozinha-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async payload => {
        if (payload.eventType === 'INSERT') {
          playAlert();
          
          // Buscar pedido completo com itens para impressão e board
          const { data: newPedido } = await window.cafeteriaSupabase
            .from('pedidos')
            .select('*, pedido_itens(*, pedido_item_adicionais(*))')
            .eq('id', payload.new.id)
            .single();
            
          if (newPedido) {
            // Auto impressão da comanda
            if (window.cafeteriaPrint) {
              window.cafeteriaPrint.printPedido(newPedido, newPedido.pedido_itens || []);
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.status === 'cancelado') {
            showCancelToast(`⚠️ O Pedido #${payload.new.numero_pedido || payload.new.id} da ${payload.new.mesa_codigo} foi CANCELADO!`);
            playAlert();
          }
        }

        fetchPedidosIniciais();
      })
      .subscribe();
  }

  // Teste de impressão
  btnTesteImpressao.addEventListener('click', () => {
    const fakePedido = {
      id: 999,
      numero_pedido: 999,
      mesa_codigo: 'TESTE M-01',
      created_at: new Date().toISOString(),
      total: 15.50,
      forma_pagamento: 'pix',
      status_pagamento: 'pago',
      criado_por_nome: currentUser ? currentUser.perfil.nome : 'Barista Teste',
      observacoes: 'Teste de impressão térmica com observação do item.'
    };
    const fakeItens = [
      { quantidade: 2, nome_produto: 'Espresso Duplo', preco_unitario: 6.00, observacoes: 'Bem quente' },
      { quantidade: 1, nome_produto: 'Pão de Queijo', preco_unitario: 3.50, observacoes: 'Aquecido' }
    ];
    if (window.cafeteriaPrint) {
      window.cafeteriaPrint.printPedido(fakePedido, fakeItens);
    }
  });

  // Init
  checkSession();

})();
