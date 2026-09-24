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
  
  // Cache de estacoes
  let produtosCache = {}; // { produto_id: estacao }
  let estacaoSelecionada = localStorage.getItem('kds_estacao') || 'todas';
  const filtroEstacao = document.getElementById('filtro-estacao');
  
  if (filtroEstacao) {
    filtroEstacao.value = estacaoSelecionada;
    filtroEstacao.addEventListener('change', (e) => {
      estacaoSelecionada = e.target.value;
      localStorage.setItem('kds_estacao', estacaoSelecionada);
      renderPedidos();
    });
  }

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
    await loadProdutosECategorias();
    await fetchPedidosIniciais();
    setupRealtime();
  }

  async function loadProdutosECategorias() {
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        window.cafeteriaSupabase.from('categorias').select('id, estacao'),
        window.cafeteriaSupabase.from('produtos').select('id, categoria_id')
      ]);
      
      const catMap = {};
      if (cats) cats.forEach(c => catMap[c.id] = c.estacao || 'cozinha');
      
      if (prods) {
        prods.forEach(p => {
          produtosCache[p.id] = catMap[p.categoria_id] || 'cozinha';
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar produtos/categorias para estacoes:', e);
    }
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
      btnToggleSom.innerHTML = '🔔 <span class="btn-label">Som Ativo</span>';
      btnToggleSom.setAttribute('aria-label', 'Som Ativo');
      btnToggleSom.style.color = '#EEE';
      playAlert();
    } else {
      btnToggleSom.innerHTML = '🔕 <span class="btn-label">Mudo</span>';
      btnToggleSom.setAttribute('aria-label', 'Som Mudo');
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

  function chamarPedidoVoz(numeroPedido, mesaCodigo, clienteNome) {
    playAlert();
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      let frase = '';
      if (clienteNome) {
        frase = `Atenção! Pedido da ${clienteNome}, está pronto para retirada!`;
      } else {
        frase = `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para retirada!`;
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
    // Buscar pedidos pendentes e em preparo, mais todos os pedidos concluídos do dia atual (fuso de SP)
    const inicioDoDia = window.getInicioDoDiaSaoPaulo();

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
      .or(`status.in.(pendente,em_preparo),and(status.in.(concluido,entregue),created_at.gte.${inicioDoDia})`)
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
      .filter(p => p.status === 'concluido' || p.status === 'entregue')
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
      let tempoStr;
      if (diffMinutos < 1) tempoStr = 'Agora';
      else if (diffMinutos < 60) tempoStr = `${diffMinutos}m atrás`;
      else if (diffMinutos < 1440) tempoStr = `${Math.floor(diffMinutos / 60)}h ${diffMinutos % 60}m atrás`;
      else tempoStr = `${Math.floor(diffMinutos / 1440)}d atrás`;

      // Filtrar itens pela estação selecionada (se não for "todas")
      let itensDaEstacao = [];
      let itensOutraEstacaoCount = 0;
      
      if (pedido.pedido_itens && pedido.pedido_itens.length > 0) {
        pedido.pedido_itens.forEach(item => {
          const itemEstacao = produtosCache[item.produto_id] || 'cozinha';
          
          if (estacaoSelecionada === 'todas' || estacaoSelecionada === itemEstacao) {
            itensDaEstacao.push(item);
          } else {
            itensOutraEstacaoCount++;
          }
        });
      }

      // Se estamos filtrando por estação e não há nenhum item para esta estação neste pedido,
      // e o pedido está pendente ou em preparo, pulamos a renderização do card?
      // Ou mostramos vazio? Vamos pular se não houver itens para esta estação, 
      // exceto se for "todas".
      if (estacaoSelecionada !== 'todas' && itensDaEstacao.length === 0 && tipo !== 'concluido') {
        return; // não mostra o pedido se ele não tem itens para esta estação
      }

      // Contagem de progresso
      let totalItems = 0;
      let readyItems = 0;
      if (pedido.pedido_itens) {
        pedido.pedido_itens.forEach(item => {
          if (!item.cancelado) {
            totalItems++;
            if (item.pronto_em) {
              readyItems++;
            }
          }
        });
      }
      let progressHtml = totalItems > 0 && tipo !== 'concluido' ? `<div class="pedido-progress">${readyItems}/${totalItems} itens</div>` : '';

      let itensHtml = '';
      if (itensDaEstacao.length > 0) {
        itensDaEstacao.forEach(item => {
          const isCancelado = item.cancelado;
          const isCortesia = item.cortesia_de_item_id ? true : false;
          
          let cancelClass = isCancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
          let cancelLabel = isCancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
          let cortesiaLabel = isCortesia && !isCancelado ? '<span style="background: #e74c3c; color: white; font-size:10px; padding:2px 4px; border-radius:4px; margin-left:4px;">CORTESIA</span>' : '';
          let prontoClass = item.pronto_em ? 'is-pronto' : '';
          let checkHtml = item.pronto_em ? '<span class="check-icon">✓</span>' : '';
          
          let actionClass = (!isCancelado && tipo !== 'concluido') ? 'is-clickable' : '';
          let onClick = (!isCancelado && tipo !== 'concluido') ? `onclick="window.toggleItemPronto(${pedido.id}, ${item.id}, ${item.pronto_em ? 'true' : 'false'})"` : '';

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
            <div class="item-row ${actionClass} ${prontoClass}" ${onClick}>
              <div class="item-main" ${cancelClass}>
                <span class="item-qty">${item.quantidade}x</span>
                <span class="item-name">${checkHtml}${window.escapeHtml(item.nome_produto)} ${cortesiaLabel} ${cancelLabel}</span>
              </div>
              ${saboresHtml}
              ${adicHtml}
              ${obsItemHtml}
            </div>
          `;
        });
        
        if (itensOutraEstacaoCount > 0) {
          itensHtml += `<div style="color:#aaa; font-style:italic; font-size:12px; margin-top:8px;">+ ${itensOutraEstacaoCount} item(s) de outra estação</div>`;
        }
      } else {
        itensHtml = '<div style="color:#888;">Nenhum item para esta estação...</div>';
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
            <button class="btn-card btn-card--chamar" onclick="window.cozinhaChamarPedido('${pedido.numero_pedido || pedido.id}', '${pedido.mesa_codigo}', '${window.escapeHtml(pedido.cliente_nome || '')}')" title="Chamar pelo celular">
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
      
      const badgeEntregue = pedido.status === 'entregue' ? '<span style="background:#ddd; color:#555; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">ENTREGUE NA MESA</span>' : '';
      
      const viagemTag = pedido.para_viagem ? `<span style="background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:8px; font-weight:bold;">🥡 VIAGEM</span>` : '';
      const nomeClienteHtml = pedido.cliente_nome ? `<div style="font-size:15px; font-weight:bold; color:var(--marrom-escuro); margin-bottom: 6px;">${window.escapeHtml(pedido.cliente_nome)}</div>` : '';

      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-mesa">${pedido.mesa_codigo} <span style="font-size:14px; font-weight:normal; color:#888;">(#${pedido.numero_pedido || pedido.id})</span> ${viagemTag} ${badgeEntregue}</div>
          ${progressHtml}
          <div class="pedido-tempo ${atrasadoClass}">⏱ ${tempoStr}</div>
        </div>
        ${nomeClienteHtml}
        <div class="pedido-operador">${operadorStr}</div>
        <div class="pedido-itens" ${pedido.status === 'entregue' ? 'style="opacity: 0.6;"' : ''}>
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

  window.toggleItemPronto = async function(pedidoId, itemId, isProntoAtualmente) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    // Otimista
    const item = pedido.pedido_itens.find(i => i.id === itemId);
    if (item) {
      item.pronto_em = isProntoAtualmente ? null : new Date().toISOString();
      renderPedidos();
    }
    
    const { error } = await window.cafeteriaSupabase
      .from('pedido_itens')
      .update({ pronto_em: isProntoAtualmente ? null : new Date().toISOString() })
      .eq('id', itemId);
      
    if (error) {
      alert('Erro ao atualizar item: ' + error.message);
      if (item) {
        item.pronto_em = isProntoAtualmente ? new Date().toISOString() : null;
        renderPedidos();
      }
      return;
    }
    
    // Checar progresso atualizado (se foi marcado)
    if (!isProntoAtualmente) {
      let total = 0;
      let ready = 0;
      pedido.pedido_itens.forEach(i => {
        if (!i.cancelado) {
          total++;
          if (i.pronto_em) ready++;
        }
      });
      
      if (pedido.status === 'pendente') {
        window.updateStatus(pedidoId, 'em_preparo');
      } else if (ready === total && total > 0) {
        window.updateStatus(pedidoId, 'concluido');
      }
    }
  };

  window.updateStatus = async function (pedidoId, novoStatus) {
    const payload = {
      status: novoStatus,
      updated_at: new Date().toISOString()
    };
    
    if (novoStatus === 'em_preparo') {
      const p = pedidos.find(item => item.id === pedidoId);
      if (p && !p.iniciado_em) {
        payload.iniciado_em = new Date().toISOString();
      }
    }
    
    if (novoStatus === 'concluido') {
      payload.concluido_por = currentUser.id;
      payload.concluido_em = new Date().toISOString();
      
      // Marcar todos os itens não cancelados como prontos
      await window.cafeteriaSupabase
        .from('pedido_itens')
        .update({ pronto_em: new Date().toISOString() })
        .eq('pedido_id', pedidoId)
        .eq('cancelado', false)
        .is('pronto_em', null);
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
      if (payload.iniciado_em) {
        p.iniciado_em = payload.iniciado_em;
      }
      if (novoStatus === 'concluido') {
        p.concluido_em = payload.concluido_em;
        chamarPedidoVoz(p.numero_pedido || p.id, p.mesa_codigo);
      }
      renderPedidos();
    }
  };

  function getItensDaEstacaoAtual(itens) {
    if (estacaoSelecionada === 'todas') return itens;
    return (itens || []).filter(item => {
      const itemEstacao = produtosCache[item.produto_id] || 'cozinha';
      return itemEstacao === estacaoSelecionada;
    });
  }

  window.cozinhaReimprimir = function (pedidoId) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (pedido && window.cafeteriaPrint) {
      const itensFiltrados = getItensDaEstacaoAtual(pedido.pedido_itens || []);
      if (itensFiltrados.length > 0 || estacaoSelecionada === 'todas') {
        window.cafeteriaPrint.printPedido(pedido, itensFiltrados);
      } else {
        alert("Não há itens desta estação neste pedido para imprimir.");
      }
    }
  };

  // -----------------------------------------------------
  // 6. SUPABASE REALTIME & CONEXÃO
  // -----------------------------------------------------
  let fetchTimeout = null;
  function debouncedFetchPedidos() {
    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      fetchPedidosIniciais();
    }, 300);
  }

  const offlineBanner = document.getElementById('cozinha-offline-banner');
  let isCurrentlyConnected = true;

  function updateConnectionStatus(isConnected) {
    isCurrentlyConnected = isConnected;
    const indicator = document.getElementById('cozinha-status-indicator') || document.querySelector('.status-indicator');
    const pulseDot = document.getElementById('cozinha-pulse-dot') || indicator?.querySelector('.pulse-dot');
    const statusText = document.getElementById('cozinha-status-text');

    if (isConnected) {
      if (offlineBanner) offlineBanner.classList.add('hidden');
      if (pulseDot) pulseDot.style.background = '#4CAF50';
      if (statusText) statusText.textContent = 'Conectado (Tempo Real)';
      if (indicator) indicator.style.color = '#fff';
    } else {
      if (offlineBanner) offlineBanner.classList.remove('hidden');
      if (pulseDot) pulseDot.style.background = '#e74c3c';
      if (statusText) statusText.textContent = 'Sem Conexão';
      if (indicator) indicator.style.color = '#e74c3c';
    }
  }

  // Monitoramento periódico de conectividade (detecta queda em até 4 segundos)
  setInterval(() => {
    if (!navigator.onLine && isCurrentlyConnected) {
      updateConnectionStatus(false);
    }
  }, 4000);

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
              const itensFiltrados = getItensDaEstacaoAtual(newPedido.pedido_itens || []);
              if (itensFiltrados.length > 0 || estacaoSelecionada === 'todas') {
                window.cafeteriaPrint.printPedido(newPedido, itensFiltrados);
              }
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.status === 'cancelado') {
            showCancelToast(`⚠️ O Pedido #${payload.new.numero_pedido || payload.new.id} da ${payload.new.mesa_codigo} foi CANCELADO!`);
            playAlert();
          }
        }

        debouncedFetchPedidos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, async payload => {
        if (payload.eventType === 'UPDATE' && payload.new.cancelado === true && (!payload.old || payload.old.cancelado === false)) {
          // Vamos notificar só se o item tiver mudado para cancelado agora
          const nomeProd = payload.new.nome_produto || 'Item';
          showCancelToast(`⚠️ Item cancelado: ${payload.new.quantidade || 1}x ${nomeProd}`);
          playAlert();
        } else if (payload.eventType === 'INSERT') {
          const isCortesia = payload.new.cortesia_de_item_id ? true : false;
          if (isCortesia) {
            playAlert();
          }
        }
        debouncedFetchPedidos();
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
    debouncedFetchPedidos();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  // Lidar com repouso/troca de aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      debouncedFetchPedidos();
    }
  });

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
  updateConnectionStatus(navigator.onLine);
  checkSession();

})();
