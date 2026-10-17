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
  const mcountProducao = document.getElementById('mcount-producao');
  const btnTesteVoz = document.getElementById('btn-teste-voz');
  const kdsTabBtns = document.querySelectorAll('.kds-tab-btn');

  // CAF-000026: Elementos da Visão Consolidada de Produção
  const pedidosBoard = document.getElementById('pedidos-board');
  const viewProducao = document.getElementById('view-producao');
  const listProducao = document.getElementById('list-producao');
  const btnViewBoard = document.getElementById('btn-view-board');
  const btnViewProducao = document.getElementById('btn-view-producao');
  const topbarBadgeProducao = document.getElementById('topbar-badge-producao');
  const producaoEstacaoBadge = document.getElementById('producao-estacao-badge');
  const producaoTotalItensBadge = document.getElementById('producao-total-itens-badge');

  const audioAlert = document.getElementById('audio-alert');
  const audioBanner = document.getElementById('audio-banner');
  const btnAtivarAudio = document.getElementById('btn-ativar-audio');
  const btnToggleSom = document.getElementById('btn-toggle-som');
  const btnTesteImpressao = document.getElementById('btn-teste-impressao');

  // CAF-000028: Configuração de Impressão Desta Tela
  const btnConfigTela = document.getElementById('btn-config-tela');
  const modalConfigTela = document.getElementById('modal-config-tela');
  const modalConfigTelaClose = document.getElementById('modal-config-tela-close');
  const cfgAutoPrint = document.getElementById('cfg-auto-print');
  const cfgPrintEstacao = document.getElementById('cfg-print-estacao');
  const cfgDeviceName = document.getElementById('cfg-device-name');
  const cfgStatusSummary = document.getElementById('cfg-status-summary');
  const btnCfgTestarImpressao = document.getElementById('btn-cfg-testar-impressao');
  const btnCfgSalvar = document.getElementById('btn-cfg-salvar');
  const topbarPrinterStatus = document.getElementById('topbar-printer-status');

  const cancelToast = document.getElementById('cancel-toast');
  const cancelToastMsg = document.getElementById('cancel-toast-msg');
  const cancelToastClose = document.getElementById('cancel-toast-close');

  // Estado
  let currentUser = null;
  let pedidos = []; // array de pedidos com itens
  let historicoPedidosRecentes = []; // CAF-000030: buffer de recall dos últimos 20 pedidos finalizados de hoje
  let mapaImpressoes = new Map(); // pedido_id -> array de logs de impressão
  let somHabilitado = true;
  let audioDesbloqueado = false;
  
  // Consulta de pedido completo compartilhada entre busca inicial e realtime
  const PEDIDO_SELECT_COMPLETO = `
    *,
    pedido_itens (
      *,
      pedido_item_adicionais (*),
      pedido_item_sabores (*)
    )
  `;
  
  // Cache de estacoes e tempos alvo (CAF-000025)
  let produtosCache = {}; // { produto_id: estacao }
  let produtosInfo = {}; // { produto_id: { estacao, tempo_alvo_min, categoria_id } }
  let categoriasInfo = {}; // { categoria_id: { estacao, tempo_alvo_min, nome } }
  let tempoAlvoPadraoMin = 15;
  let serverClockSkewMs = 0; // offset = serverTime - localTime
  const pedidosAvisadosAtraso = new Set();
  let audioCtx = null;

  async function syncServerClock() {
    try {
      const t0 = Date.now();
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { method: 'GET' }).catch(() => null);
      const dateHeader = res?.headers?.get('date');
      if (dateHeader) {
        const serverDate = new Date(dateHeader).getTime();
        const roundTrip = Date.now() - t0;
        serverClockSkewMs = (serverDate + roundTrip / 2) - Date.now();
        console.log(`[KDS] Sincronização de relógio: skew = ${Math.round(serverClockSkewMs)}ms`);
      }
    } catch (e) {
      console.warn('[KDS] Falha na sincronização de relógio com servidor:', e);
      serverClockSkewMs = 0;
    }
  }

  function getNowAdjusted() {
    return new Date(Date.now() + serverClockSkewMs);
  }

  function playAlertaAtrasoBeep() {
    if (!somHabilitado) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      // Tom 1
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Tom 2 (agudo, indicando alerta)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.18);
      gain2.gain.setValueAtTime(0.18, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.38);
    } catch (e) {
      console.warn('[KDS] Falha ao tocar beep sonoro de atraso:', e);
    }
  }

  // Desbloqueia AudioContext em qualquer clique na tela
  document.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { once: false, passive: true });

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
  // CAF-000028: CONFIGURAÇÃO DESTA TELA (IMPRESSORA & ESTAÇÃO)
  // -----------------------------------------------------
  const CONFIG_STORAGE_KEY_AUTOPRINT = 'cafeteria_kds_auto_print';
  const CONFIG_STORAGE_KEY_ESTACAO = 'cafeteria_kds_print_estacao';
  const CONFIG_STORAGE_KEY_DEVICE = 'cafeteria_kds_device_name';

  function getTelaPrintConfig() {
    return {
      autoPrint: localStorage.getItem(CONFIG_STORAGE_KEY_AUTOPRINT) === 'true', // padrão: false (não imprime)
      estacao: localStorage.getItem(CONFIG_STORAGE_KEY_ESTACAO) || 'todas',
      deviceName: localStorage.getItem(CONFIG_STORAGE_KEY_DEVICE) || ('KDS-' + Math.random().toString(36).substring(2, 6).toUpperCase())
    };
  }

  function saveTelaPrintConfig(cfg) {
    localStorage.setItem(CONFIG_STORAGE_KEY_AUTOPRINT, cfg.autoPrint ? 'true' : 'false');
    localStorage.setItem(CONFIG_STORAGE_KEY_ESTACAO, cfg.estacao);
    localStorage.setItem(CONFIG_STORAGE_KEY_DEVICE, cfg.deviceName.trim());
    updateTopbarPrinterStatusUI();
  }

  function updateTopbarPrinterStatusUI() {
    if (!topbarPrinterStatus) return;
    const cfg = getTelaPrintConfig();
    if (!cfg.autoPrint) {
      topbarPrinterStatus.textContent = 'Não imprime';
      topbarPrinterStatus.className = '';
      if (btnConfigTela) btnConfigTela.title = 'Esta tela não imprime automaticamente (Toque para configurar)';
    } else {
      const mapaEst = { 'todas': 'Todas', 'cozinha': 'Cozinha', 'bar': 'Bar' };
      topbarPrinterStatus.textContent = mapaEst[cfg.estacao] || 'Ativa';
      topbarPrinterStatus.className = 'ativo';
      if (btnConfigTela) btnConfigTela.title = `Esta tela imprime automaticamente: ${mapaEst[cfg.estacao] || cfg.estacao} [${cfg.deviceName}]`;
    }
  }

  function atualizarResumoConfigModal() {
    if (!cfgStatusSummary) return;
    const isAtivo = cfgAutoPrint.checked;
    const est = cfgPrintEstacao.value;
    const dev = cfgDeviceName.value.trim() || 'Dispositivo sem nome';

    if (!isAtivo) {
      cfgStatusSummary.className = 'config-info-box inativo';
      cfgStatusSummary.innerHTML = `<strong>⚠️ Impressão automática desativada nesta tela.</strong><br>Este dispositivo só imprimirá quando alguém tocar no botão "🖨 Comanda" manualmente.`;
    } else {
      const mapaEst = { 'todas': 'Cozinha & Bar', 'cozinha': 'apenas Cozinha', 'bar': 'apenas Bar' };
      cfgStatusSummary.className = 'config-info-box';
      cfgStatusSummary.innerHTML = `<strong>✓ Impressora Ativa:</strong> Este dispositivo (<em>${dev}</em>) imprimirá automaticamente as comandas de <strong>${mapaEst[est] || est}</strong> com trava anti-duplicação.`;
    }
  }

  function abrirModalConfigTela() {
    if (!modalConfigTela) return;
    const cfg = getTelaPrintConfig();
    cfgAutoPrint.checked = cfg.autoPrint;
    cfgPrintEstacao.value = cfg.estacao;
    cfgDeviceName.value = cfg.deviceName;
    atualizarResumoConfigModal();
    modalConfigTela.classList.remove('hidden');
  }

  function fecharModalConfigTela() {
    if (modalConfigTela) modalConfigTela.classList.add('hidden');
  }

  if (btnConfigTela) {
    btnConfigTela.addEventListener('click', abrirModalConfigTela);
  }
  if (modalConfigTelaClose) {
    modalConfigTelaClose.addEventListener('click', fecharModalConfigTela);
  }
  if (modalConfigTela) {
    modalConfigTela.addEventListener('click', (e) => {
      if (e.target === modalConfigTela) fecharModalConfigTela();
    });
  }

  if (cfgAutoPrint) cfgAutoPrint.addEventListener('change', atualizarResumoConfigModal);
  if (cfgPrintEstacao) cfgPrintEstacao.addEventListener('change', atualizarResumoConfigModal);
  if (cfgDeviceName) cfgDeviceName.addEventListener('input', atualizarResumoConfigModal);

  if (btnCfgSalvar) {
    btnCfgSalvar.addEventListener('click', async () => {
      const novoCfg = {
        autoPrint: cfgAutoPrint.checked,
        estacao: cfgPrintEstacao.value,
        deviceName: cfgDeviceName.value.trim() || 'KDS-TELA'
      };
      saveTelaPrintConfig(novoCfg);
      fecharModalConfigTela();

      // Se ativou impressão automática, verificar pendências do dia
      if (novoCfg.autoPrint) {
        await verificarImpressaoPendentesAoConectar();
      }
    });
  }

  if (btnCfgTestarImpressao) {
    btnCfgTestarImpressao.addEventListener('click', () => {
      const est = cfgPrintEstacao ? cfgPrintEstacao.value : 'todas';
      const dev = cfgDeviceName ? cfgDeviceName.value.trim() : 'KDS';
      const fakePedido = {
        id: 999,
        numero_pedido: 999,
        mesa_codigo: 'TESTE M-01',
        created_at: new Date().toISOString(),
        total: 18.00,
        forma_pagamento: 'pix',
        status_pagamento: 'pago',
        criado_por_nome: dev,
        observacoes: `Configuração atual desta tela: ${est.toUpperCase()}`
      };
      const fakeItens = [
        { quantidade: 1, nome_produto: 'Café Especial (Bar)', preco_unitario: 8.00, observacoes: 'Estação Bar' },
        { quantidade: 1, nome_produto: 'Croissant Recheado (Cozinha)', preco_unitario: 10.00, observacoes: 'Estação Cozinha' }
      ];
      if (window.cafeteriaPrint) {
        window.cafeteriaPrint.printPedido(fakePedido, fakeItens, { estacao: est });
      }
    });
  }

  updateTopbarPrinterStatusUI();

  // -----------------------------------------------------
  // CAF-000028: TRAVA ATÔMICA & IMPRESSÃO POR ESTAÇÃO
  // -----------------------------------------------------
  async function carregarLogsImpressoes(pedidoIds) {
    if (!pedidoIds || pedidoIds.length === 0) return;
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('pedido_impressoes')
        .select('pedido_id, estacao, tipo, impresso_em, dispositivo')
        .in('pedido_id', pedidoIds);

      if (!error && data) {
        data.forEach(log => {
          const list = mapaImpressoes.get(log.pedido_id) || [];
          // Evita duplicar no cache em memória
          if (!list.some(x => x.estacao === log.estacao && x.tipo === log.tipo)) {
            list.push(log);
          }
          mapaImpressoes.set(log.pedido_id, list);
        });
      }
    } catch (e) {
      console.warn('[KDS Impressão] Erro ao carregar logs:', e);
    }
  }

  async function requisitarTravaImpressao(pedidoId, estacao, tipo, dispositivo) {
    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('travar_impressao_pedido', {
        p_pedido_id: pedidoId,
        p_estacao: estacao,
        p_tipo: tipo,
        p_dispositivo: dispositivo
      });

      if (error) {
        // Fallback caso a função RPC ainda não tenha sido aplicada no banco
        const { data: insData, error: insErr } = await window.cafeteriaSupabase
          .from('pedido_impressoes')
          .insert({
            pedido_id: pedidoId,
            estacao: estacao,
            tipo: tipo,
            dispositivo: dispositivo
          })
          .select('id')
          .single();
        return !insErr && insData;
      }
      return Boolean(data);
    } catch (e) {
      console.error('[KDS Impressão] Exceção ao requisitar trava:', e);
      return false;
    }
  }

  function registrarImpressaoLocal(pedidoId, estacao, tipo, dispositivo) {
    const list = mapaImpressoes.get(pedidoId) || [];
    list.push({
      estacao: estacao,
      tipo: tipo,
      impresso_em: new Date().toISOString(),
      dispositivo: dispositivo
    });
    mapaImpressoes.set(pedidoId, list);
    renderPedidos();
  }

  async function tentarTravarEImprimir(pedido, tipo = 'comanda', itensCustom = null) {
    const cfg = getTelaPrintConfig();
    if (!cfg.autoPrint) return; // Dispositivo configurado para não imprimir automaticamente

    const itensParaAvaliar = itensCustom || pedido.pedido_itens || [];
    if (!itensParaAvaliar || itensParaAvaliar.length === 0) return;

    // Separar itens por estação
    const itensCozinha = itensParaAvaliar.filter(it => !it.cancelado && getItemEstacao(it) === 'cozinha');
    const itensBar = itensParaAvaliar.filter(it => !it.cancelado && getItemEstacao(it) === 'bar');

    // Avaliar estações que esta tela deve imprimir
    const deveImprimirCozinha = (cfg.estacao === 'todas' || cfg.estacao === 'cozinha') && itensCozinha.length > 0;
    const deveImprimirBar = (cfg.estacao === 'todas' || cfg.estacao === 'bar') && itensBar.length > 0;

    // 1. Emissão da Comanda da Cozinha
    if (deveImprimirCozinha) {
      const obteveTrava = await requisitarTravaImpressao(pedido.id, 'cozinha', tipo, cfg.deviceName);
      if (obteveTrava && window.cafeteriaPrint) {
        window.cafeteriaPrint.printPedido(pedido, itensCozinha, {
          estacao: 'cozinha',
          isComplementar: tipo === 'adicional'
        });
        registrarImpressaoLocal(pedido.id, 'cozinha', tipo, cfg.deviceName);
      }
    }

    // 2. Emissão da Comanda do Bar
    if (deveImprimirBar) {
      const obteveTrava = await requisitarTravaImpressao(pedido.id, 'bar', tipo, cfg.deviceName);
      if (obteveTrava && window.cafeteriaPrint) {
        window.cafeteriaPrint.printPedido(pedido, itensBar, {
          estacao: 'bar',
          isComplementar: tipo === 'adicional'
        });
        registrarImpressaoLocal(pedido.id, 'bar', tipo, cfg.deviceName);
      }
    }
  }

  async function verificarImpressaoPendentesAoConectar() {
    const cfg = getTelaPrintConfig();
    if (!cfg.autoPrint) return;

    const pedidosAtivos = pedidos.filter(p => p.status === 'pendente' || p.status === 'em_preparo');
    for (const ped of pedidosAtivos) {
      const logs = mapaImpressoes.get(ped.id) || [];
      const temComanda = logs.some(l => l.tipo === 'comanda');
      if (!temComanda) {
        await tentarTravarEImprimir(ped, 'comanda');
      }
    }
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
    await syncServerClock();
    await loadProdutosECategorias();
    await fetchPedidosIniciais();
    setupRealtime();
  }

  async function loadProdutosECategorias() {
    try {
      const [{ data: cats }, { data: prods }, { data: settings }] = await Promise.all([
        window.cafeteriaSupabase.from('categorias').select('id, estacao, tempo_alvo_min, nome'),
        window.cafeteriaSupabase.from('produtos').select('id, categoria_id, tempo_alvo_min'),
        window.cafeteriaSupabase.from('site_settings').select('key, value').eq('key', 'tempo_alvo_padrao_min').maybeSingle()
      ]);
      
      if (settings && settings.value) {
        const val = parseInt(settings.value, 10);
        if (!isNaN(val) && val > 0) tempoAlvoPadraoMin = val;
      }

      categoriasInfo = {};
      if (cats) {
        cats.forEach(c => {
          categoriasInfo[c.id] = {
            estacao: c.estacao || 'cozinha',
            tempo_alvo_min: (c.tempo_alvo_min !== null && c.tempo_alvo_min !== undefined) ? Number(c.tempo_alvo_min) : tempoAlvoPadraoMin,
            nome: c.nome
          };
        });
      }
      
      produtosCache = {};
      produtosInfo = {};
      if (prods) {
        prods.forEach(p => {
          const cat = categoriasInfo[p.categoria_id];
          const estacao = cat ? cat.estacao : 'cozinha';
          produtosCache[p.id] = estacao;
          produtosInfo[p.id] = {
            estacao: estacao,
            categoria_id: p.categoria_id,
            tempo_alvo_min: (p.tempo_alvo_min !== null && p.tempo_alvo_min !== undefined)
              ? Number(p.tempo_alvo_min)
              : (cat ? cat.tempo_alvo_min : tempoAlvoPadraoMin)
          };
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar produtos/categorias para estacoes e tempos alvo:', e);
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

  function chamarPedidoVoz(numeroPedido, mesaCodigo, clienteNome, paraViagem) {
    playAlert();
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      let frase = '';
      if (typeof numeroPedido === 'object' && numeroPedido !== null) {
        frase = window.formatarChamadaVozPedido ? window.formatarChamadaVozPedido(numeroPedido) : '';
      } else if (window.formatarChamadaVozPedido) {
        frase = window.formatarChamadaVozPedido({
          numeroPedido,
          mesaCodigo,
          clienteNome,
          paraViagem
        });
      } else {
        frase = clienteNome
          ? `Atenção! Pedido da ${clienteNome}, está pronto para retirada!`
          : `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para retirada!`;
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

  window.cozinhaChamarPedido = function(numeroOuId, mesaCodigo, clienteNome, paraViagem) {
    if (typeof numeroOuId === 'number' && !mesaCodigo && !clienteNome) {
      const pedido = pedidos.find(p => p.id === numeroOuId);
      if (pedido) {
        return chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    }
    chamarPedidoVoz(numeroOuId, mesaCodigo, clienteNome, paraViagem);
  };

  if (listConcluidos) {
    listConcluidos.addEventListener('click', (e) => {
      const btnChamar = e.target.closest('.btn-card--chamar');
      if (!btnChamar) return;
      const pedidoId = Number(btnChamar.dataset.pedidoId);
      const pedido = pedidos.find(p => p.id === pedidoId);
      if (pedido) {
        chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    });
  }

  if (btnTesteVoz) {
    btnTesteVoz.addEventListener('click', () => {
      chamarPedidoVoz('10', 'Mesa 01');
    });
  }

  // -----------------------------------------------------
  // 2.1 NAVEGAÇÃO SEGMENTADA & VIEW SWITCHER (KDS) (CAF-000026)
  // -----------------------------------------------------
  let activeMobileCol = 'pendentes';
  let activeDesktopView = 'board';

  function setDesktopView(viewName) {
    activeDesktopView = viewName;
    if (btnViewBoard) btnViewBoard.classList.toggle('active', viewName === 'board');
    if (btnViewProducao) btnViewProducao.classList.toggle('active', viewName === 'producao');

    if (window.innerWidth > 860) {
      if (viewName === 'board') {
        if (pedidosBoard) pedidosBoard.classList.remove('hidden');
        if (viewProducao) viewProducao.classList.add('hidden');
      } else {
        if (pedidosBoard) pedidosBoard.classList.add('hidden');
        if (viewProducao) viewProducao.classList.remove('hidden');
      }
    }
  }

  function setMobileCol(colName) {
    activeMobileCol = colName;
    kdsTabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.col === colName);
    });

    if (colName === 'producao') {
      if (pedidosBoard) pedidosBoard.classList.add('hidden');
      if (viewProducao) viewProducao.classList.remove('hidden');
      if (colPendentes) colPendentes.classList.remove('active-col');
      if (colPreparo) colPreparo.classList.remove('active-col');
      if (colConcluidos) colConcluidos.classList.remove('active-col');
    } else {
      if (pedidosBoard) pedidosBoard.classList.remove('hidden');
      if (viewProducao) viewProducao.classList.add('hidden');
      if (colPendentes) colPendentes.classList.toggle('active-col', colName === 'pendentes');
      if (colPreparo) colPreparo.classList.toggle('active-col', colName === 'preparo');
      if (colConcluidos) colConcluidos.classList.toggle('active-col', colName === 'concluidos');
    }
  }

  if (btnViewBoard) {
    btnViewBoard.addEventListener('click', () => setDesktopView('board'));
  }
  if (btnViewProducao) {
    btnViewProducao.addEventListener('click', () => setDesktopView('producao'));
  }

  kdsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setMobileCol(btn.dataset.col);
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth <= 860) {
      setMobileCol(activeMobileCol);
    } else {
      setDesktopView(activeDesktopView);
    }
  });

  // Inicializar estado visual de acordo com o tamanho da tela
  if (window.innerWidth <= 860) {
    setMobileCol('pendentes');
  } else {
    setDesktopView('board');
  }

  // Toast de Cancelamento
  cancelToastClose.addEventListener('click', () => {
    cancelToast.classList.add('hidden');
  });

  function showCancelToast(msg) {
    cancelToastMsg.textContent = msg;
    cancelToast.classList.remove('toast--novo-item');
    cancelToast.classList.remove('hidden');
    setTimeout(() => {
      cancelToast.classList.add('hidden');
    }, 8000);
  }

  function showNovoItemToast(msg) {
    cancelToastMsg.textContent = msg;
    cancelToast.classList.add('toast--novo-item');
    cancelToast.classList.remove('hidden');
    setTimeout(() => {
      cancelToast.classList.add('hidden');
      cancelToast.classList.remove('toast--novo-item');
    }, 8000);
  }

  // -----------------------------------------------------
  // 3. BUSCA DE PEDIDOS (Pendentes, Preparo e Concluídos do Dia)
  // -----------------------------------------------------
  function adicionarHistoricoRecente(pedido) {
    if (!pedido) return;
    const idx = historicoPedidosRecentes.findIndex(p => p.id === pedido.id);
    if (idx >= 0) {
      historicoPedidosRecentes[idx] = pedido;
    } else {
      historicoPedidosRecentes.unshift(pedido);
    }
    // Ordenar decrescente pelo horário de conclusão mais recente
    historicoPedidosRecentes.sort((a, b) => {
      const dataA = new Date(a.concluido_em || a.updated_at || a.created_at).getTime();
      const dataB = new Date(b.concluido_em || b.updated_at || b.created_at).getTime();
      return dataB - dataA;
    });
    if (historicoPedidosRecentes.length > 20) {
      historicoPedidosRecentes.length = 20;
    }
    const modalHist = document.getElementById('modal-historico-kds');
    if (modalHist && !modalHist.classList.contains('hidden')) {
      renderHistoricoModal();
    }
  }

  async function fetchPedidosIniciais() {
    // Buscar pedidos pendentes e em preparo, mais todos os pedidos concluídos e entregues do dia atual (fuso de SP)
    const inicioDoDia = window.getInicioDoDiaSaoPaulo();

    const { data: pedidosData, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select(PEDIDO_SELECT_COMPLETO)
      .or(`status.in.(pendente,em_preparo),and(status.in.(concluido,entregue),created_at.gte.${inicioDoDia})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar pedidos da cozinha:', error);
      return;
    }

    const todos = pedidosData || [];

    // CAF-000030: Buffer de histórico recente (últimos 20 finalizados/entregues de hoje para recall)
    historicoPedidosRecentes = todos
      .filter(p => (p.status === 'concluido' || p.status === 'entregue'))
      .sort((a, b) => {
        const dataA = new Date(a.concluido_em || a.updated_at || a.created_at).getTime();
        const dataB = new Date(b.concluido_em || b.updated_at || b.created_at).getTime();
        return dataB - dataA;
      })
      .slice(0, 20);

    // CAF-000030: Coluna "Prontos" enxuta: pedidos entregues saem do board ativo
    pedidos = todos.filter(p => p.status !== 'entregue');

    if (pedidos.length > 0) {
      await carregarLogsImpressoes(pedidos.map(p => p.id));
    }
    renderPedidos();
    verificarImpressaoPendentesAoConectar();
  }

  // -----------------------------------------------------
  // 4. RENDERIZAÇÃO DAS 3 COLUNAS
  // -----------------------------------------------------

  function getItemEstacao(item) {
    return item.estacao || produtosCache[item.produto_id] || 'cozinha';
  }

  function getItemTempoAlvoMin(item) {
    const pInfo = produtosInfo[item.produto_id];
    if (pInfo && pInfo.tempo_alvo_min !== null && pInfo.tempo_alvo_min !== undefined) {
      return Number(pInfo.tempo_alvo_min);
    }
    const catId = pInfo?.categoria_id || item.categoria_id;
    if (catId && categoriasInfo[catId]?.tempo_alvo_min !== null && categoriasInfo[catId]?.tempo_alvo_min !== undefined) {
      return Number(categoriasInfo[catId].tempo_alvo_min);
    }
    return tempoAlvoPadraoMin;
  }

  function getPedidoTempoAlvoMin(pedido, estacaoFiltro) {
    const itens = (pedido.pedido_itens || []).filter(i => !i.cancelado);
    let itensEstacao = itens;
    if (estacaoFiltro && estacaoFiltro !== 'todas') {
      itensEstacao = itens.filter(i => getItemEstacao(i) === estacaoFiltro);
    }
    if (itensEstacao.length === 0) itensEstacao = itens;
    if (itensEstacao.length === 0) return tempoAlvoPadraoMin;

    let maxAlvo = 0;
    itensEstacao.forEach(i => {
      const alvo = getItemTempoAlvoMin(i);
      if (alvo > maxAlvo) maxAlvo = alvo;
    });
    return maxAlvo || tempoAlvoPadraoMin;
  }

  function calcularEstadoTempoPedido(pedido, agora = getNowAdjusted()) {
    const alvoMin = getPedidoTempoAlvoMin(pedido, estacaoSelecionada);
    const alvoMs = alvoMin * 60 * 1000;
    const criacao = new Date(pedido.created_at);

    let decorridoMs = 0;
    if (pedido.status === 'concluido' || pedido.status === 'entregue') {
      const fim = new Date(pedido.concluido_em || pedido.updated_at || criacao);
      decorridoMs = Math.max(0, fim - criacao);
    } else {
      decorridoMs = Math.max(0, agora - criacao);
    }

    const restanteMs = alvoMs - decorridoMs;
    const ratio = alvoMs > 0 ? (decorridoMs / alvoMs) : 0;

    const totalSegundos = Math.floor(decorridoMs / 1000);
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    const mm = String(minutos).padStart(2, '0');
    const ss = String(segundos).padStart(2, '0');

    let semaforo = 'semaforo-verde';
    let isAtrasado = false;
    let isPulsing = false;

    if (pedido.status !== 'concluido' && pedido.status !== 'entregue') {
      if (ratio >= 1.0) {
        semaforo = 'semaforo-vermelho';
        isAtrasado = true;
        const excessoMs = decorridoMs - alvoMs;
        if (excessoMs <= 120000) { // Primeiros 2 minutos
          isPulsing = true;
        }
      } else if (ratio >= 0.7) {
        semaforo = 'semaforo-amarelo';
      }
    }

    return {
      alvoMin,
      decorridoMs,
      restanteMs,
      ratio,
      mm,
      ss,
      semaforo,
      isAtrasado,
      isPulsing
    };
  }

  function getPedidoEstacaoInfo(pedido) {
    const itens = (pedido.pedido_itens || []).filter(i => !i.cancelado);
    let barTotal = 0, barProntos = 0;
    let cozinhaTotal = 0, cozinhaProntos = 0;

    itens.forEach(item => {
      const est = getItemEstacao(item);
      if (est === 'bar') {
        barTotal++;
        if (item.pronto_em) barProntos++;
      } else {
        cozinhaTotal++;
        if (item.pronto_em) cozinhaProntos++;
      }
    });

    const temBar = barTotal > 0;
    const temCozinha = cozinhaTotal > 0;
    const barConcluido = temBar && (barProntos === barTotal);
    const cozinhaConcluido = temCozinha && (cozinhaProntos === cozinhaTotal);
    const pedidoMisto = temBar && temCozinha;

    return {
      barTotal,
      barProntos,
      temBar,
      barConcluido,
      cozinhaTotal,
      cozinhaProntos,
      temCozinha,
      cozinhaConcluido,
      pedidoMisto,
      totalItens: itens.length,
      totalProntos: barProntos + cozinhaProntos
    };
  }

  function renderPedidos() {
    let pendentes = [];
    let preparo = [];
    let concluidos = [];

    pedidos.forEach(p => {
      if (p.status === 'cancelado') return;

      const info = getPedidoEstacaoInfo(p);

      if (estacaoSelecionada === 'todas') {
        if (p.status === 'pendente') {
          pendentes.push(p);
        } else if (p.status === 'em_preparo') {
          preparo.push(p);
        } else if (p.status === 'concluido') {
          concluidos.push(p);
        }
      } else {
        const isBar = estacaoSelecionada === 'bar';
        const temMinhaEstacao = isBar ? info.temBar : info.temCozinha;
        const minhaEstacaoConcluida = isBar ? info.barConcluido : info.cozinhaConcluido;

        // Se o pedido não tem itens desta estação:
        if (!temMinhaEstacao) {
          return;
        }

        if (p.status === 'concluido') {
          concluidos.push(p);
        } else if (p.status === 'entregue') {
          return; // Pedidos entregues vão apenas para o histórico/recall
        } else if (minhaEstacaoConcluida) {
          // A minha estação terminou! Vai para Prontos desta tela com o selo "Aguardando outra estação"
          concluidos.push(p);
        } else if (p.status === 'pendente') {
          pendentes.push(p);
        } else {
          preparo.push(p);
        }
      }
    });

    const agora = getNowAdjusted();
    const sortFn = (a, b) => {
      // 1. Prioridade (CAF-000029): 1 vem antes de 0
      const pA = Number(a.prioridade || 0);
      const pB = Number(b.prioridade || 0);
      if (pA !== pB) return pB - pA; // prioritário no topo

      // 2. Semáforo / Tempo restante (CAF-000025)
      const tA = calcularEstadoTempoPedido(a, agora).restanteMs;
      const tB = calcularEstadoTempoPedido(b, agora).restanteMs;
      if (tA !== tB) return tA - tB; // quem estoura antes aparece primeiro
      return new Date(a.created_at) - new Date(b.created_at);
    };

    pendentes.sort(sortFn);
    preparo.sort(sortFn);

    concluidos.sort((a, b) => new Date(b.concluido_em || b.updated_at || b.created_at) - new Date(a.concluido_em || a.updated_at || a.created_at));

    // Limpa avisos de pedidos que já saíram do board
    const activeIds = new Set(pedidos.map(p => String(p.id)));
    for (const id of pedidosAvisadosAtraso) {
      if (!activeIds.has(id)) pedidosAvisadosAtraso.delete(id);
    }

    countPendentes.textContent = pendentes.length;
    countPreparo.textContent = preparo.length;
    countConcluidos.textContent = concluidos.length;

    if (mcountPendentes) mcountPendentes.textContent = pendentes.length;
    if (mcountPreparo) mcountPreparo.textContent = preparo.length;
    if (mcountConcluidos) mcountConcluidos.textContent = concluidos.length;

    renderList(pendentes, listPendentes, 'pendente');
    renderList(preparo, listPreparo, 'em_preparo');
    renderList(concluidos, listConcluidos, 'concluido');

    // CAF-000026: Renderizar visão consolidada de produção (totais por produto)
    renderProducaoConsolidada();

    // CAF-000029: Atualizar destaque visual do foco por teclado / bump bar
    atualizarDestaqueFoco();
  }

  function renderList(list, container, tipo) {
    if (list.length === 0) {
      const msgs = {
        'pendente': 'Nenhum pedido pendente.',
        'em_preparo': 'Nenhum pedido em preparo.',
        'concluido': 'Nenhum pedido pronto no momento.'
      };
      container.innerHTML = `<div class="empty-state">${msgs[tipo]}</div>`;
      return;
    }

    // CAF-000030: Reconciliação incremental de nós do DOM sem container.innerHTML = ''
    const emptyStateEl = container.querySelector('.empty-state');
    if (emptyStateEl) emptyStateEl.remove();

    const agora = getNowAdjusted();
    const validIds = new Set(list.map(p => p.id));

    // Remover cards que não pertencem mais a esta lista
    Array.from(container.children).forEach(child => {
      if (child.classList.contains('pedido-card')) {
        const id = Number(child.getAttribute('data-pedido-id'));
        if (!validIds.has(id)) {
          child.remove();
        }
      }
    });

    let currentDomIndex = 0;
    
    list.forEach(pedido => {
      const estadoTempo = calcularEstadoTempoPedido(pedido, agora);
      const atrasadoClass = estadoTempo.isAtrasado ? 'atrasado' : '';
      let tempoStr = `⏱ ${estadoTempo.mm}:${estadoTempo.ss} / ${estadoTempo.alvoMin} min`;
      if (estadoTempo.isAtrasado) {
        tempoStr += ` <span class="badge-atrasado">ATRASADO</span>`;
      }

      // Filtrar itens pela estação selecionada (se não for "todas")
      let itensDaEstacao = [];
      let itensOutraEstacaoCount = 0;
      
      if (pedido.pedido_itens && pedido.pedido_itens.length > 0) {
        pedido.pedido_itens.forEach(item => {
          const itemEstacao = getItemEstacao(item);
          
          if (estacaoSelecionada === 'todas' || estacaoSelecionada === itemEstacao) {
            itensDaEstacao.push(item);
          } else {
            itensOutraEstacaoCount++;
          }
        });
      }

      if (estacaoSelecionada !== 'todas' && itensDaEstacao.length === 0 && tipo !== 'concluido') {
        return; // não mostra o pedido se ele não tem itens para esta estação
      }

      const info = getPedidoEstacaoInfo(pedido);
      const isBar = estacaoSelecionada === 'bar';
      const isCozinha = estacaoSelecionada === 'cozinha';
      const aguardandoOutraEstacao = (estacaoSelecionada !== 'todas') && (pedido.status !== 'concluido' && pedido.status !== 'entregue');

      // Contagem de progresso: da estação quando filtrado, ou global
      let totalItems = 0;
      let readyItems = 0;
      if (estacaoSelecionada === 'todas') {
        totalItems = info.totalItens;
        readyItems = info.totalProntos;
      } else if (isBar) {
        totalItems = info.barTotal;
        readyItems = info.barProntos;
      } else {
        totalItems = info.cozinhaTotal;
        readyItems = info.cozinhaProntos;
      }
      let progressHtml = totalItems > 0 && tipo !== 'concluido' ? `<div class="pedido-progress">${readyItems}/${totalItems} itens</div>` : '';

      // Indicador de status por estação
      let estacaoStatusHtml = '';
      if (info.pedidoMisto) {
        if (isBar) {
          if (info.barConcluido && !info.cozinhaConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--aguardando">Bar: pronto ✓ · aguardando Cozinha</div>`;
          } else if (!info.barConcluido && info.cozinhaConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--aviso">Cozinha: pronta ✓ · Bar em preparo</div>`;
          } else if (info.barConcluido && info.cozinhaConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--sucesso">Bar e Cozinha prontos ✓</div>`;
          } else {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--misto">Bar e Cozinha em preparo</div>`;
          }
        } else if (isCozinha) {
          if (info.cozinhaConcluido && !info.barConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--aguardando">Cozinha: pronta ✓ · aguardando Bar</div>`;
          } else if (!info.cozinhaConcluido && info.barConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--aviso">Bar: pronto ✓ · Cozinha em preparo</div>`;
          } else if (info.cozinhaConcluido && info.barConcluido) {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--sucesso">Bar e Cozinha prontos ✓</div>`;
          } else {
            estacaoStatusHtml = `<div class="estacao-status-tag tag--misto">Bar e Cozinha em preparo</div>`;
          }
        } else {
          // Filtro "Todas"
          const barStr = info.temBar ? (info.barConcluido ? 'Bar: pronto ✓' : `Bar: ${info.barProntos}/${info.barTotal}`) : '';
          const cozStr = info.temCozinha ? (info.cozinhaConcluido ? 'Cozinha: pronta ✓' : `Cozinha: ${info.cozinhaProntos}/${info.cozinhaTotal}`) : '';
          estacaoStatusHtml = `<div class="estacao-status-tag tag--info">${[barStr, cozStr].filter(Boolean).join(' · ')}</div>`;
        }
      }

      let itensHtml = '';
      let novosPendentesCount = 0;

      if (itensDaEstacao.length > 0) {
        itensDaEstacao.forEach(item => {
          const isCancelado = item.cancelado;
          const isCortesia = item.cortesia_de_item_id ? true : false;
          const isLancadoDepois = Boolean(item.lancado_depois);
          const isNovoNaoPronto = isLancadoDepois && !item.pronto_em && !isCancelado;

          if (isNovoNaoPronto) {
            novosPendentesCount++;
          }
          
          let cancelClass = isCancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
          let cancelLabel = isCancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
          let cortesiaLabel = isCortesia && !isCancelado ? '<span style="background: #e74c3c; color: white; font-size:10px; padding:2px 4px; border-radius:4px; margin-left:4px;">CORTESIA</span>' : '';
          let novoLabel = isNovoNaoPronto ? '<span class="badge-item-novo" title="Item adicionado após o envio">NOVO</span>' : '';
          let prontoClass = item.pronto_em ? 'is-pronto' : '';
          let lancadoDepoisClass = isNovoNaoPronto ? 'is-lancado-depois' : '';
          let checkHtml = item.pronto_em ? '<span class="check-icon">✓</span>' : '';
          
          const isClickable = !isCancelado && (tipo !== 'concluido' || aguardandoOutraEstacao);
          let actionClass = isClickable ? 'is-clickable' : '';
          let onClick = isClickable ? `onclick="window.toggleItemPronto(${pedido.id}, ${item.id}, ${item.pronto_em ? 'true' : 'false'})"` : '';

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
            <div class="item-row ${actionClass} ${prontoClass} ${lancadoDepoisClass}" ${onClick}>
              <div class="item-main" ${cancelClass}>
                <span class="item-qty">${item.quantidade}x</span>
                <span class="item-name">${checkHtml}${window.escapeHtml(item.nome_produto)} ${cortesiaLabel} ${novoLabel} ${cancelLabel}</span>
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

      const isPrioritario = pedido.prioridade === 1;
      const prioridadeBadgeHtml = isPrioritario
        ? `<span class="badge-prioridade-kds" onclick="window.cozinhaTogglePrioridade(${pedido.id})" title="Prioridade ativa! Motivo: ${window.escapeHtml(pedido.prioridade_motivo || 'Espetáculo')}. Clique para alterar.">⚡ PRIORIDADE${pedido.prioridade_motivo ? ': ' + window.escapeHtml(pedido.prioridade_motivo) : ''}</span>`
        : '';
      const btnPrioridadeHtml = `
        <button class="btn-card--prioridade ${isPrioritario ? 'is-active' : ''}" onclick="window.cozinhaTogglePrioridade(${pedido.id})" title="${isPrioritario ? 'Remover prioridade' : 'Marcar como prioritário'}">
          ⚡ ${isPrioritario ? 'Prioritário' : 'Priorizar'}
        </button>
      `;

      const isCardFocado = cardFocadoId === pedido.id;
      let card = document.getElementById(`pedido-card-${pedido.id}`);
      if (!card) {
        card = document.createElement('div');
        card.id = `pedido-card-${pedido.id}`;
        card.addEventListener('click', (e) => {
          if (!e.target.closest('button') && !e.target.closest('input')) {
            definirCardFocado(tipo, pedido.id);
          }
        });
      }
      card.className = `pedido-card ${estadoTempo.semaforo} ${estadoTempo.isPulsing ? 'pulso-alerta' : ''} ${isPrioritario ? 'pedido-card--prioritario' : ''} ${isCardFocado ? 'is-keyboard-focused' : ''}`;
      card.setAttribute('data-pedido-id', pedido.id);
      card.setAttribute('data-created-at', pedido.created_at);
      card.setAttribute('data-alvo-min', estadoTempo.alvoMin);
      card.setAttribute('data-tipo', tipo);
      card.setAttribute('data-status', pedido.status);
      card.setAttribute('data-concluido-em', pedido.concluido_em || pedido.updated_at || '');
      card.tabIndex = 0;
      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', `Pedido ${pedido.numero_pedido || pedido.id} da mesa ${pedido.mesa_codigo}`);
      
      let botoesHtml = '';
      if (tipo === 'pendente') {
        botoesHtml = `
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
            ${btnPrioridadeHtml}
          </div>
          <div class="footer-actions">
            <button class="btn-card btn-card--preparo" onclick="window.iniciarPreparoEstacao(${pedido.id})">
               Iniciar Preparo
            </button>
            <button class="btn-card btn-card--concluir" onclick="window.concluirPreparoEstacao(${pedido.id})">
              Pronto!
            </button>
          </div>
        `;
      } else if (tipo === 'em_preparo') {
        const btnLabel = estacaoSelecionada === 'todas' 
          ? 'Pronto! (Concluir)' 
          : (isBar ? 'Pronto! (Bar)' : 'Pronto! (Cozinha)');
        botoesHtml = `
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
            ${btnPrioridadeHtml}
          </div>
          <div class="footer-actions">
            <button class="btn-card btn-card--concluir" onclick="window.concluirPreparoEstacao(${pedido.id})">
              ${btnLabel}
            </button>
          </div>
        `;
      } else {
        // Concluído (ou Concluído nesta estação)
        const podeChamar = (pedido.status === 'concluido' || pedido.status === 'entregue');
        const botaoChamar = podeChamar ? `
          <button class="btn-card btn-card--chamar" data-pedido-id="${pedido.id}" title="Chamar pelo celular">
            📢 Chamar
          </button>
        ` : `
          <button class="btn-card btn-card--chamar" disabled style="opacity:0.5; cursor:not-allowed;" title="Aguardando conclusão de todas as estações">
            ⏳ Aguardando
          </button>
        `;

        botoesHtml = `
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Reimprimir">🖨 Comanda</button>
            ${btnPrioridadeHtml}
          </div>
          <div class="footer-actions">
            ${botaoChamar}
            <button class="btn-card btn-card--desfazer" onclick="window.desfazerPreparo(${pedido.id})">
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
      
      const seloAguardando = aguardandoOutraEstacao
        ? `<span class="badge-aguardando-estacao">⏳ Aguardando ${isBar ? 'Cozinha' : 'Bar'}</span>`
        : '';

      // Badge de status de impressão (CAF-000028)
      const logsImpressao = mapaImpressoes.get(pedido.id) || [];
      const logsFiltrados = logsImpressao.filter(l => {
        if (estacaoSelecionada === 'todas') return true;
        return l.estacao === estacaoSelecionada || l.estacao === 'todas';
      });

      let badgeImpressaoHtml = '';
      if (logsFiltrados.length > 0) {
        const ultimoLog = [...logsFiltrados].sort((a, b) => new Date(b.impresso_em) - new Date(a.impresso_em))[0];
        const horaStr = new Date(ultimoLog.impresso_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const disp = ultimoLog.dispositivo ? ` por ${window.escapeHtml(ultimoLog.dispositivo)}` : '';
        const tipoLabel = ultimoLog.tipo === 'adicional' ? ' (adicional)' : (ultimoLog.tipo === 'reimpressao' ? ' (reimpr.)' : '');
        badgeImpressaoHtml = `<span class="badge-impressao badge-impressao--ok" title="Comanda emitida às ${horaStr}${disp}${tipoLabel}">🖨 ${horaStr}</span>`;
      } else {
        const minutosCriacao = Math.floor(Math.max(0, agora - new Date(pedido.created_at)) / 60000);
        if (minutosCriacao >= 1 && tipo !== 'concluido') {
          badgeImpressaoHtml = `<span class="badge-impressao badge-impressao--pendente" title="Mais de 1 minuto sem comanda impressa">⚠ Não impressa</span>`;
        }
      }

      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-mesa">${pedido.mesa_codigo} <span style="font-size:14px; font-weight:normal; color:#888;">(#${pedido.numero_pedido || pedido.id})</span> ${viagemTag} ${badgeEntregue} ${seloAguardando} ${badgeNovos} ${prioridadeBadgeHtml} ${badgeImpressaoHtml}</div>
          ${progressHtml}
          <div class="pedido-tempo ${estadoTempo.semaforo} ${atrasadoClass}">${tempoStr}</div>
        </div>
        ${estacaoStatusHtml}
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

      // CAF-000030: Posicionar card mantendo a ordem sem recriar nós nem resetar scroll
      const targetChild = container.children[currentDomIndex];
      if (targetChild !== card) {
        container.insertBefore(card, targetChild || null);
      }
      currentDomIndex++;
    });

    if (currentDomIndex === 0 && list.length > 0) {
      const msgs = {
        'pendente': 'Nenhum pedido pendente.',
        'em_preparo': 'Nenhum pedido em preparo.',
        'concluido': 'Nenhum pedido pronto no momento.'
      };
      container.innerHTML = `<div class="empty-state">${msgs[tipo]}</div>`;
    }
  }

  // --- Cronômetro de Alta Performance (1s) e Semáforo (CAF-000025) ---
  function updateTimers() {
    if (!currentUser) return;
    const agora = getNowAdjusted();
    const cards = document.querySelectorAll('.pedido-card[data-tipo="pendente"], .pedido-card[data-tipo="em_preparo"]');
    if (!cards || cards.length === 0) return;

    cards.forEach(card => {
      const createdAtStr = card.getAttribute('data-created-at');
      const alvoMin = parseFloat(card.getAttribute('data-alvo-min')) || tempoAlvoPadraoMin;
      const pedidoId = card.getAttribute('data-pedido-id');
      if (!createdAtStr) return;

      const criacao = new Date(createdAtStr);
      const decorridoMs = Math.max(0, agora - criacao);
      const alvoMs = alvoMin * 60 * 1000;
      const ratio = alvoMs > 0 ? (decorridoMs / alvoMs) : 0;

      const totalSegundos = Math.floor(decorridoMs / 1000);
      const minutos = Math.floor(totalSegundos / 60);
      const segundos = totalSegundos % 60;
      const mm = String(minutos).padStart(2, '0');
      const ss = String(segundos).padStart(2, '0');

      let semaforo = 'semaforo-verde';
      let isAtrasado = false;
      let isPulsing = false;

      if (ratio >= 1.0) {
        semaforo = 'semaforo-vermelho';
        isAtrasado = true;
        const excessoMs = decorridoMs - alvoMs;
        if (excessoMs <= 120000) { // Primeiros 2 minutos pulsando
          isPulsing = true;
        }
      } else if (ratio >= 0.7) {
        semaforo = 'semaforo-amarelo';
      }

      // Beep sonoro opcional apenas ao estourar o prazo
      if (isAtrasado && !pedidosAvisadosAtraso.has(pedidoId)) {
        pedidosAvisadosAtraso.add(pedidoId);
        playAlertaAtrasoBeep();
      }

      // Atualiza classes do card sem re-renderizar
      if (!card.classList.contains(semaforo)) {
        card.classList.remove('semaforo-verde', 'semaforo-amarelo', 'semaforo-vermelho');
        card.classList.add(semaforo);
      }
      if (isPulsing) {
        if (!card.classList.contains('pulso-alerta')) card.classList.add('pulso-alerta');
      } else {
        if (card.classList.contains('pulso-alerta')) card.classList.remove('pulso-alerta');
      }

      const elTempo = card.querySelector('.pedido-tempo');
      if (elTempo) {
        const atrasadoBadge = isAtrasado ? '<span class="badge-atrasado">ATRASADO</span>' : '';
        const novoTexto = `⏱ ${mm}:${ss} / ${alvoMin} min ${atrasadoBadge}`;
        if (elTempo.innerHTML !== novoTexto) {
          elTempo.className = `pedido-tempo ${semaforo} ${isAtrasado ? 'atrasado' : ''}`;
          elTempo.innerHTML = novoTexto;
        }
      }
    });
  }

  // 1. Atualizar contadores de tempo (mm:ss) a cada 1 segundo (ultra leve)
  setInterval(() => {
    if (currentUser) updateTimers();
  }, 1000);

  // 2. Re-ordenação periódica do board por tempo restante a cada 30 segundos
  setInterval(() => {
    if (currentUser) renderPedidos();
  }, 30000);

  // -----------------------------------------------------
  // 4.1 VISÃO CONSOLIDADA DE PRODUÇÃO (CAF-000026)
  // -----------------------------------------------------
  let gruposProducaoAtivos = new Map();

  function renderProducaoConsolidada() {
    if (!listProducao) return;

    gruposProducaoAtivos.clear();

    // 1. Filtrar pedidos em aberto (pendente e em_preparo)
    const pedidosAbertos = pedidos.filter(p => 
      p.status === 'pendente' || p.status === 'em_preparo'
    );

    let totalItensEmAberto = 0;

    pedidosAbertos.forEach(pedido => {
      const itens = (pedido.pedido_itens || []).filter(item => {
        if (item.cancelado) return false;
        if (item.pronto_em) return false;
        if (estacaoSelecionada !== 'todas') {
          const itemEstacao = getItemEstacao(item);
          if (itemEstacao !== estacaoSelecionada) return false;
        }
        return true;
      });

      itens.forEach(item => {
        const qty = Number(item.quantidade) || 1;
        totalItensEmAberto += qty;

        // Chave: produto_id + adicionais ordenados + sabores + observação
        const produtoId = String(item.produto_id || item.nome_produto || 'item');

        // Adicionais ordenados
        const adicList = (item.pedido_item_adicionais || [])
          .map(a => (a.nome_adicional || a.adicional_id || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const adicKey = adicList.join('|');

        // Sabores ordenados (meio a meio)
        const saborList = (item.pedido_item_sabores || [])
          .map(s => (s.nome || s.produto_id || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const saborKey = saborList.join('|');

        // Observação limpa (segrega se houver obs específica)
        const obs = (item.observacoes || '').trim();
        const obsKey = obs.toLowerCase();

        const groupKey = `${produtoId}:::${adicKey}:::${saborKey}:::${obsKey}`;

        if (!gruposProducaoAtivos.has(groupKey)) {
          gruposProducaoAtivos.set(groupKey, {
            key: groupKey,
            produtoId: item.produto_id,
            nomeProduto: item.nome_produto || 'Produto',
            adicionais: item.pedido_item_adicionais || [],
            sabores: item.pedido_item_sabores || [],
            observacao: obs,
            quantidadeTotal: 0,
            itemIds: [],
            pedidosOrigemMap: new Map(),
            maisAntigoCreatedAt: new Date(pedido.created_at).getTime()
          });
        }

        const group = gruposProducaoAtivos.get(groupKey);
        group.quantidadeTotal += qty;
        group.itemIds.push(item.id);

        const pTime = new Date(pedido.created_at).getTime();
        if (pTime < group.maisAntigoCreatedAt) {
          group.maisAntigoCreatedAt = pTime;
        }

        if (!group.pedidosOrigemMap.has(pedido.id)) {
          group.pedidosOrigemMap.set(pedido.id, {
            pedidoId: pedido.id,
            mesaCodigo: pedido.mesa_codigo,
            clienteNome: pedido.cliente_nome,
            paraViagem: pedido.para_viagem,
            numeroPedido: pedido.numero_pedido || pedido.id,
            status: pedido.status,
            quantidade: 0
          });
        }
        const pOrigem = group.pedidosOrigemMap.get(pedido.id);
        pOrigem.quantidade += qty;
      });
    });

    // Atualizar badges de quantidade
    if (topbarBadgeProducao) topbarBadgeProducao.textContent = totalItensEmAberto;
    if (mcountProducao) mcountProducao.textContent = totalItensEmAberto;
    if (producaoTotalItensBadge) {
      producaoTotalItensBadge.textContent = `${totalItensEmAberto} item${totalItensEmAberto === 1 ? '' : 's'} a fazer`;
    }

    if (producaoEstacaoBadge) {
      const mapaEstacao = {
        'todas': 'Todas as Estações',
        'bar': 'Estação: Bar',
        'cozinha': 'Estação: Cozinha'
      };
      producaoEstacaoBadge.textContent = mapaEstacao[estacaoSelecionada] || 'Todas as Estações';
    }

    // Ordenar grupos pelo pedido mais antigo (FIFO)
    const gruposOrdenados = Array.from(gruposProducaoAtivos.values()).sort((a, b) => {
      return a.maisAntigoCreatedAt - b.maisAntigoCreatedAt;
    });

    if (gruposOrdenados.length === 0) {
      listProducao.innerHTML = `
        <div class="producao-empty">
          <span class="producao-empty-icon">🎉</span>
          <h3 class="producao-empty-title">Tudo pronto na produção!</h3>
          <p class="producao-empty-desc">Nenhum item pendente de preparo para a estação selecionada no momento.</p>
        </div>
      `;
      return;
    }

    listProducao.innerHTML = '';

    gruposOrdenados.forEach(group => {
      const card = document.createElement('div');
      card.className = 'producao-card';

      // Sabores (meio a meio)
      let saboresHtml = '';
      if (group.sabores && group.sabores.length === 2) {
        saboresHtml = `
          <div class="producao-sabores">
            ½ ${window.escapeHtml(group.sabores[0].nome)} · ½ ${window.escapeHtml(group.sabores[1].nome)}
          </div>
        `;
      }

      // Adicionais
      let adicionaisHtml = '';
      if (group.adicionais && group.adicionais.length > 0) {
        adicionaisHtml = `
          <div class="producao-adicionais">
            ${group.adicionais.map(ad => `<span class="producao-adicional-tag">+ ${window.escapeHtml(ad.nome_adicional || '')}</span>`).join('')}
          </div>
        `;
      }

      // Observação
      let obsHtml = '';
      if (group.observacao) {
        obsHtml = `
          <div class="producao-obs-box">
            ⚠️ <strong>Obs:</strong> ${window.escapeHtml(group.observacao)}
          </div>
        `;
      }

      // Chips de pedidos de origem
      const chipsHtml = Array.from(group.pedidosOrigemMap.values()).map(orig => {
        let desc = orig.paraViagem 
          ? `🥡 ${orig.clienteNome ? window.escapeHtml(orig.clienteNome) + ' ' : ''}#${orig.numeroPedido}`
          : `${orig.mesaCodigo} #${orig.numeroPedido}`;
        if (orig.quantidade > 1) {
          desc += ` (${orig.quantidade}x)`;
        }
        return `<button type="button" class="origem-chip" onclick="window.focarPedidoDoChip(${orig.pedidoId})" title="Ver pedido #${orig.numeroPedido}">${desc}</button>`;
      }).join('');

      card.innerHTML = `
        <div class="producao-qty-box" title="${group.quantidadeTotal} unidade(s) no total">
          ${group.quantidadeTotal}×
        </div>
        <div class="producao-details">
          <div class="producao-prod-nome">${window.escapeHtml(group.nomeProduto)}</div>
          ${saboresHtml}
          ${adicionaisHtml}
          ${obsHtml}
          <div class="producao-origens-box">
            <span class="producao-origens-label">Pedidos de origem (${group.pedidosOrigemMap.size}):</span>
            <div class="producao-origens-chips">
              ${chipsHtml}
            </div>
          </div>
        </div>
        <div class="producao-action">
          <button type="button" class="btn-marcar-grupo" data-group-key="${window.escapeHtml(group.key)}" onclick="window.marcarGrupoPronto('${encodeURIComponent(group.key)}')">
            ✓ Marcar ${group.quantidadeTotal} como pronto${group.quantidadeTotal > 1 ? 's' : ''}
          </button>
        </div>
      `;

      listProducao.appendChild(card);
    });
  }

  window.focarPedidoDoChip = function(pedidoId) {
    const p = pedidos.find(item => item.id === pedidoId);
    if (!p) return;

    if (window.innerWidth <= 860) {
      const colName = p.status === 'pendente' ? 'pendentes' : 'preparo';
      setMobileCol(colName);
    } else {
      setDesktopView('board');
    }

    setTimeout(() => {
      const card = document.getElementById(`pedido-card-${pedidoId}`) || document.querySelector(`.pedido-card[data-pedido-id="${pedidoId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('pedido-card--focus-highlight');
        setTimeout(() => {
          card.classList.remove('pedido-card--focus-highlight');
        }, 2500);
      }
    }, 60);
  };

  window.marcarGrupoPronto = async function(encodedKey) {
    const groupKey = decodeURIComponent(encodedKey);
    const group = gruposProducaoAtivos.get(groupKey);
    if (!group || !group.itemIds || group.itemIds.length === 0) return;

    const itemIds = [...group.itemIds];
    const nowIso = new Date().toISOString();

    const btn = document.querySelector(`.btn-marcar-grupo[data-group-key="${CSS.escape(groupKey)}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Gravando...';
    }

    // 1. Atualização otimista em memória dos itens
    itemIds.forEach(itemId => {
      pedidos.forEach(p => {
        const it = (p.pedido_itens || []).find(i => i.id === itemId);
        if (it) {
          it.pronto_em = nowIso;
          it.pronto_por = currentUser ? currentUser.id : null;
        }
      });
    });

    // 2. Atualização otimista dos pedidos
    pedidos.forEach(p => {
      const info = getPedidoEstacaoInfo(p);
      if (info.totalItens > 0 && info.totalProntos === info.totalItens) {
        if (p.status !== 'concluido' && p.status !== 'entregue') {
          p.status = 'concluido';
          p.concluido_em = nowIso;
        }
      } else if (p.status === 'pendente' && info.totalProntos > 0) {
        p.status = 'em_preparo';
        if (!p.iniciado_em) p.iniciado_em = nowIso;
      }
    });

    // 3. Re-renderizar board e producao imediatamente
    renderPedidos();

    // 4. Persistir no Supabase em lote
    const { error } = await window.cafeteriaSupabase
      .from('pedido_itens')
      .update({
        pronto_em: nowIso,
        pronto_por: currentUser ? currentUser.id : null
      })
      .in('id', itemIds);

    if (error) {
      alert('Erro ao marcar itens como prontos: ' + error.message);
      debouncedFetchPedidos();
      return;
    }
  };

  // -----------------------------------------------------
  // 5. AÇÕES (Atualizar Status e Reimpressão)
  // -----------------------------------------------------

  window.toggleItemPronto = async function(pedidoId, itemId, isProntoAtualmente) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    const nowIso = new Date().toISOString();
    const item = (pedido.pedido_itens || []).find(i => i.id === itemId);
    if (item) {
      item.pronto_em = isProntoAtualmente ? null : nowIso;
      
      const info = getPedidoEstacaoInfo(pedido);
      if (info.totalItens > 0 && info.totalProntos === info.totalItens) {
        pedido.status = 'concluido';
        pedido.concluido_em = nowIso;
      } else if (isProntoAtualmente && pedido.status === 'concluido') {
        pedido.status = 'em_preparo';
        pedido.concluido_em = null;
      } else if (!isProntoAtualmente && pedido.status === 'pendente') {
        pedido.status = 'em_preparo';
      }
      renderPedidos();
    }
    
    const { error } = await window.cafeteriaSupabase
      .from('pedido_itens')
      .update({ 
        pronto_em: isProntoAtualmente ? null : nowIso,
        pronto_por: isProntoAtualmente ? null : currentUser.id
      })
      .eq('id', itemId);
      
    if (error) {
      alert('Erro ao atualizar item: ' + error.message);
      if (item) {
        item.pronto_em = isProntoAtualmente ? nowIso : null;
        renderPedidos();
      }
      return;
    }
  };

  // Pilha de histórico para desfazer via Backspace no Bump Bar (CAF-000029)
  const historicoAcoes = [];

  window.iniciarPreparoEstacao = async function(pedidoId) {
    const estacao = estacaoSelecionada === 'todas' ? null : estacaoSelecionada;
    const nowIso = new Date().toISOString();
    
    // Otimista
    const p = pedidos.find(item => item.id === pedidoId);
    if (p) {
      historicoAcoes.push({
        tipo: 'iniciar',
        pedidoId: pedidoId,
        pedidoNumero: p.numero_pedido || p.id,
        timestamp: Date.now()
      });
      if (p.status === 'pendente') p.status = 'em_preparo';
      if (!p.iniciado_em) p.iniciado_em = nowIso;
      (p.pedido_itens || []).forEach(i => {
        if (!estacao || getItemEstacao(i) === estacao) {
          if (!i.iniciado_em) i.iniciado_em = nowIso;
        }
      });
      renderPedidos();
    }

    const { error } = await window.cafeteriaSupabase.rpc('iniciar_estacao', {
      p_pedido_id: pedidoId,
      p_estacao: estacao
    });

    if (error) {
      alert('Erro ao iniciar preparo: ' + error.message);
      await fetchPedidosIniciais();
      return;
    }
  };

  window.concluirPreparoEstacao = async function(pedidoId) {
    const estacao = estacaoSelecionada === 'todas' ? null : estacaoSelecionada;
    const nowIso = new Date().toISOString();

    // Otimista
    const p = pedidos.find(item => item.id === pedidoId);
    if (p) {
      historicoAcoes.push({
        tipo: 'concluir',
        pedidoId: pedidoId,
        pedidoNumero: p.numero_pedido || p.id,
        timestamp: Date.now()
      });
      (p.pedido_itens || []).forEach(i => {
        if (!i.cancelado && (!estacao || getItemEstacao(i) === estacao)) {
          i.pronto_em = nowIso;
        }
      });
      const info = getPedidoEstacaoInfo(p);
      if (info.totalItens > 0 && info.totalProntos === info.totalItens) {
        p.status = 'concluido';
        p.concluido_em = nowIso;
      }
      renderPedidos();
    }

    const { error } = await window.cafeteriaSupabase.rpc('concluir_estacao', {
      p_pedido_id: pedidoId,
      p_estacao: estacao
    });

    if (error) {
      alert('Erro ao concluir estação: ' + error.message);
      await fetchPedidosIniciais();
      return;
    }
  };

  window.desfazerPreparo = async function(pedidoId) {
    const estacao = estacaoSelecionada === 'todas' ? null : estacaoSelecionada;

    // Otimista
    let p = pedidos.find(item => item.id === pedidoId);
    if (!p) {
      p = historicoPedidosRecentes.find(item => item.id === pedidoId);
      if (p && !pedidos.some(x => x.id === pedidoId)) {
        pedidos.push(p);
      }
    }
    if (p) {
      (p.pedido_itens || []).forEach(i => {
        if (!estacao || getItemEstacao(i) === estacao) {
          i.pronto_em = null;
        }
      });
      p.status = 'em_preparo';
      p.concluido_em = null;
      renderPedidos();
    }

    const { error } = await window.cafeteriaSupabase.rpc('desfazer_estacao', {
      p_pedido_id: pedidoId,
      p_estacao: estacao
    });

    if (error) {
      alert('Erro ao desfazer preparo: ' + error.message);
      await fetchPedidosIniciais();
      return;
    }

    await fetchPedidoIncremental(pedidoId);
  };

  window.updateStatus = async function (pedidoId, novoStatus) {
    if (novoStatus === 'em_preparo') {
      return window.iniciarPreparoEstacao(pedidoId);
    }
    if (novoStatus === 'concluido') {
      return window.concluirPreparoEstacao(pedidoId);
    }
    
    const payload = {
      status: novoStatus,
      updated_at: new Date().toISOString()
    };
    if (novoStatus === 'entregue') {
      payload.entregue_por = currentUser.id;
      payload.entregue_em = new Date().toISOString();
    }
    const { error } = await window.cafeteriaSupabase
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId);
    if (error) alert('Erro ao atualizar status: ' + error.message);
  };

  // -----------------------------------------------------
  // PRIORIDADE DE PEDIDO NO KDS (CAF-000029)
  // -----------------------------------------------------
  window.cozinhaTogglePrioridade = async function (pedidoId) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const novaPrioridade = pedido.prioridade === 1 ? 0 : 1;
    let motivo = null;
    if (novaPrioridade === 1) {
      motivo = prompt('Motivo da prioridade (ex: Espetáculo, Refazer, Reclamação):', pedido.prioridade_motivo || 'Espetáculo');
      if (motivo === null) return; // cancelou
      motivo = motivo.trim() || 'Espetáculo';
    }

    // Otimismo
    pedido.prioridade = novaPrioridade;
    pedido.prioridade_motivo = motivo;
    renderPedidos();

    try {
      const { error: errRpc } = await window.cafeteriaSupabase.rpc('alterar_prioridade_pedido', {
        p_pedido_id: pedidoId,
        p_prioridade: novaPrioridade,
        p_motivo: motivo
      });

      if (errRpc) {
        // Fallback update direto
        const { error: errUpd } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({
            prioridade: novaPrioridade,
            prioridade_motivo: motivo,
            updated_at: new Date().toISOString()
          })
          .eq('id', pedidoId);

        if (errUpd) throw errUpd;
      }

      showNovoItemToast(novaPrioridade === 1 ? `⚡ Pedido #${pedido.numero_pedido || pedido.id} priorizado!` : `Prioridade de #${pedido.numero_pedido || pedido.id} removida.`);
    } catch (err) {
      console.error('[KDS] Erro ao alternar prioridade:', err);
      alert('Erro ao atualizar prioridade: ' + err.message);
      await fetchPedidosIniciais();
    }
  };

  // -----------------------------------------------------
  // OPERAÇÃO POR TECLADO / BUMP BAR (CAF-000029)
  // -----------------------------------------------------
  let colunaFocada = 'pendente'; // 'pendente' | 'em_preparo' | 'concluido'
  let cardFocadoId = null;

  function getContainerDaColuna(coluna) {
    if (coluna === 'pendente') return listPendentes;
    if (coluna === 'em_preparo') return listPreparo;
    if (coluna === 'concluido') return listConcluidos;
    return listPendentes;
  }

  function getCardsDaColuna(coluna) {
    const container = getContainerDaColuna(coluna);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.pedido-card'));
  }

  function definirCardFocado(coluna, pedidoId) {
    colunaFocada = coluna;
    cardFocadoId = pedidoId;
    atualizarDestaqueFoco();
  }

  function atualizarDestaqueFoco() {
    const todosCards = document.querySelectorAll('.pedido-card');
    todosCards.forEach(c => c.classList.remove('is-keyboard-focused'));

    if (!cardFocadoId) {
      const cardsColuna = getCardsDaColuna(colunaFocada);
      if (cardsColuna.length > 0) {
        cardFocadoId = Number(cardsColuna[0].getAttribute('data-pedido-id'));
      }
    }

    if (cardFocadoId) {
      const cardEl = document.getElementById(`pedido-card-${cardFocadoId}`);
      if (cardEl) {
        cardEl.classList.add('is-keyboard-focused');
        cardEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function moverColuna(direcao) {
    const colunas = ['pendente', 'em_preparo', 'concluido'];
    let idx = colunas.indexOf(colunaFocada);
    if (idx === -1) idx = 0;
    idx = (idx + direcao + colunas.length) % colunas.length;
    colunaFocada = colunas[idx];
    
    // Sincronizar aba mobile se visível
    const colTabMap = { 'pendente': 'pendentes', 'em_preparo': 'preparo', 'concluido': 'concluidos' };
    const tabMobile = document.querySelector(`.kds-tab-btn[data-col="${colTabMap[colunaFocada]}"]`);
    if (tabMobile) tabMobile.click();

    const cards = getCardsDaColuna(colunaFocada);
    if (cards.length > 0) {
      cardFocadoId = Number(cards[0].getAttribute('data-pedido-id'));
    } else {
      cardFocadoId = null;
    }
    atualizarDestaqueFoco();
  }

  function moverCard(direcao) {
    const cards = getCardsDaColuna(colunaFocada);
    if (cards.length === 0) return;

    let idx = cards.findIndex(c => Number(c.getAttribute('data-pedido-id')) === cardFocadoId);
    if (idx === -1) {
      idx = direcao > 0 ? 0 : cards.length - 1;
    } else {
      idx = (idx + direcao + cards.length) % cards.length;
    }

    cardFocadoId = Number(cards[idx].getAttribute('data-pedido-id'));
    atualizarDestaqueFoco();
  }

  function selecionarCardPorIndice(indice1Based) {
    const cards = getCardsDaColuna(colunaFocada);
    const idx = indice1Based - 1;
    if (idx >= 0 && idx < cards.length) {
      cardFocadoId = Number(cards[idx].getAttribute('data-pedido-id'));
      atualizarDestaqueFoco();
    }
  }

  async function avancarCardFocado() {
    if (!cardFocadoId) return;
    const pedido = pedidos.find(p => p.id === cardFocadoId);
    if (!pedido) return;

    if (colunaFocada === 'pendente') {
      await window.iniciarPreparoEstacao(pedido.id);
      definirCardFocado('em_preparo', pedido.id);
    } else if (colunaFocada === 'em_preparo') {
      await window.concluirPreparoEstacao(pedido.id);
      definirCardFocado('concluido', pedido.id);
    }
  }

  async function desfazerUltimaAcaoTeclado() {
    if (historicoAcoes.length === 0) {
      showCancelToast('Nenhuma ação recente para desfazer.');
      return;
    }
    const ultima = historicoAcoes.pop();
    if (Date.now() - ultima.timestamp > 30000) {
      showCancelToast('A última ação expirou (>30s) e não pode ser desfeita por atalho.');
      return;
    }

    if (ultima.tipo === 'concluir') {
      await window.desfazerPreparo(ultima.pedidoId);
      showNovoItemToast(`↩ Pedido #${ultima.pedidoNumero} retornado para Em Preparo!`);
      definirCardFocado('em_preparo', ultima.pedidoId);
    } else if (ultima.tipo === 'iniciar') {
      const estacao = estacaoSelecionada === 'todas' ? null : estacaoSelecionada;
      const { error } = await window.cafeteriaSupabase
        .from('pedidos')
        .update({ status: 'pendente', iniciado_em: null, updated_at: new Date().toISOString() })
        .eq('id', ultima.pedidoId);
      
      const ped = pedidos.find(p => p.id === ultima.pedidoId);
      if (ped) {
        ped.status = 'pendente';
        ped.iniciado_em = null;
        (ped.pedido_itens || []).forEach(it => {
          if (!estacao || getItemEstacao(it) === estacao) {
            it.iniciado_em = null;
          }
        });
        renderPedidos();
      }
      showNovoItemToast(`↩ Pedido #${ultima.pedidoNumero} retornado para Pendentes!`);
      definirCardFocado('pendente', ultima.pedidoId);
    }
  }

  // Modal de atalhos
  const modalAtalhos = document.getElementById('modal-atalhos-teclado');
  const btnAjudaAtalhos = document.getElementById('btn-ajuda-atalhos');
  const btnCloseAtalhosModal = document.getElementById('btn-close-atalhos-modal');
  const btnOkAtalhos = document.getElementById('btn-ok-atalhos');

  function abrirModalAtalhos() {
    if (modalAtalhos) modalAtalhos.classList.remove('hidden');
  }
  function fecharModalAtalhos() {
    if (modalAtalhos) modalAtalhos.classList.add('hidden');
  }

  if (btnAjudaAtalhos) btnAjudaAtalhos.addEventListener('click', abrirModalAtalhos);
  if (btnCloseAtalhosModal) btnCloseAtalhosModal.addEventListener('click', fecharModalAtalhos);
  if (btnOkAtalhos) btnOkAtalhos.addEventListener('click', fecharModalAtalhos);
  if (modalAtalhos) {
    modalAtalhos.addEventListener('click', (e) => {
      if (e.target === modalAtalhos) fecharModalAtalhos();
    });
  }

  // CAF-000030: Modal de Histórico e Recall
  const modalHistoricoKds = document.getElementById('modal-historico-kds');
  const btnHistoricoKds = document.getElementById('btn-historico-kds');
  const btnFecharHistorico = document.getElementById('btn-fechar-historico');

  function abrirModalHistorico() {
    renderHistoricoModal();
    if (modalHistoricoKds) modalHistoricoKds.classList.remove('hidden');
  }

  function fecharModalHistorico() {
    if (modalHistoricoKds) modalHistoricoKds.classList.add('hidden');
  }

  function renderHistoricoModal() {
    const listaEl = document.getElementById('historico-pedidos-lista');
    if (!listaEl) return;

    if (!historicoPedidosRecentes || historicoPedidosRecentes.length === 0) {
      listaEl.innerHTML = '<div class="empty-state">Nenhum pedido finalizado recente encontrado hoje.</div>';
      return;
    }

    listaEl.innerHTML = historicoPedidosRecentes.map(p => {
      const horaConclusao = (p.concluido_em || p.updated_at)
        ? new Date(p.concluido_em || p.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

      const itensResumo = (p.pedido_itens || [])
        .filter(i => !i.cancelado)
        .map(i => `${i.quantidade}x ${window.escapeHtml(i.nome_produto)}`)
        .join(', ');

      const statusClass = p.status === 'entregue' ? 'entregue' : 'concluido';
      const statusLabel = p.status === 'entregue' ? 'Entregue' : 'Pronto';
      const prioritarioClass = p.prioridade === 1 ? 'is-prioritario' : '';
      const prioridadeBadge = p.prioridade === 1 ? `<span style="color:#f59e0b; font-weight:bold; font-size:0.75rem;">⚡ Prioritário</span>` : '';

      return `
        <div class="historico-pedido-row ${prioritarioClass}">
          <div class="historico-info-main">
            <div class="historico-num-mesa">
              <span>#${p.numero_pedido || p.id} · ${window.escapeHtml(p.mesa_codigo)}</span>
              ${p.cliente_nome ? `<span style="font-size:0.85rem; font-weight:normal; color:#cbd5e1;">(${window.escapeHtml(p.cliente_nome)})</span>` : ''}
              <span class="historico-badge-status ${statusClass}">${statusLabel}</span>
              ${prioridadeBadge}
            </div>
            <div class="historico-detalhes-itens">${itensResumo || 'Sem itens ativos'}</div>
            <div class="historico-meta-tempo">
              <span>🕒 Concluído às ${horaConclusao}</span>
              ${p.criado_por_nome ? `<span>· Atendente: ${window.escapeHtml(p.criado_por_nome)}</span>` : ''}
            </div>
          </div>
          <div class="historico-acoes">
            <button class="btn-recall-reimprimir" onclick="window.cozinhaReimprimir(${p.id})" title="Reimprimir Comanda">
              🖨️ Reimprimir
            </button>
            <button class="btn-recall-desfazer" onclick="window.desfazerRecallPreparo(${p.id})" title="Desfazer e retornar para Em Preparo">
              ↩️ Desfazer
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.desfazerRecallPreparo = async function(pedidoId) {
    await window.desfazerPreparo(pedidoId);
    showNovoItemToast(`↩️ Pedido #${pedidoId} retornado para a coluna Em Preparo!`);
    fecharModalHistorico();
  };

  if (btnHistoricoKds) btnHistoricoKds.addEventListener('click', abrirModalHistorico);
  if (btnFecharHistorico) btnFecharHistorico.addEventListener('click', fecharModalHistorico);
  if (modalHistoricoKds) {
    modalHistoricoKds.addEventListener('click', (e) => {
      if (e.target === modalHistoricoKds) fecharModalHistorico();
    });
  }

  // Listener global de teclado e Bump Bar
  window.addEventListener('keydown', (e) => {
    // 1. Ignorar se o foco estiver em campo de texto
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
      return;
    }

    // 2. Escape fecha modais
    if (e.key === 'Escape') {
      fecharModalAtalhos();
      fecharModalHistorico();
      if (typeof fecharModalConfigTela === 'function') {
        fecharModalConfigTela();
      }
      return;
    }

    // 3. Se algum modal estiver visível, não processar ações da fila
    const algumModalAberto = (modalAtalhos && !modalAtalhos.classList.contains('hidden')) ||
                             (modalHistoricoKds && !modalHistoricoKds.classList.contains('hidden')) ||
                             (modalConfigTela && !modalConfigTela.classList.contains('hidden'));
    if (algumModalAberto) {
      return;
    }

    // 4. Tecla ? abre atalhos
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      abrirModalAtalhos();
      return;
    }

    // 5. Navegação por Setas
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moverColuna(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moverColuna(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moverCard(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moverCard(1);
      return;
    }

    // 6. Teclas 1 a 9 (Seleção rápida)
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      selecionarCardPorIndice(parseInt(e.key, 10));
      return;
    }

    // 7. Enter: avançar status
    if (e.key === 'Enter') {
      e.preventDefault();
      avancarCardFocado();
      return;
    }

    // 8. Backspace: desfazer última ação
    if (e.key === 'Backspace') {
      e.preventDefault();
      desfazerUltimaAcaoTeclado();
      return;
    }

    // 9. Tecla P: reimprimir comanda
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (cardFocadoId) {
        window.cozinhaReimprimir(cardFocadoId);
      }
      return;
    }

    // 10. Tecla C: chamar por voz
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      if (cardFocadoId) {
        const ped = pedidos.find(p => p.id === cardFocadoId);
        if (ped && (ped.status === 'concluido' || ped.status === 'entregue')) {
          chamarPedidoVoz(ped.numero_pedido || ped.id, ped.mesa_codigo, ped.cliente_nome, ped.para_viagem);
        }
      }
      return;
    }
  });

  function getItensDaEstacaoAtual(itens) {
    if (estacaoSelecionada === 'todas') return itens;
    return (itens || []).filter(item => {
      const itemEstacao = getItemEstacao(item);
      return itemEstacao === estacaoSelecionada;
    });
  }

  window.cozinhaReimprimir = async function (pedidoId) {
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || !window.cafeteriaPrint) return;

    const itensFiltrados = getItensDaEstacaoAtual(pedido.pedido_itens || []);
    if (itensFiltrados.length === 0 && estacaoSelecionada !== 'todas') {
      alert("Não há itens desta estação neste pedido para imprimir.");
      return;
    }

    const cfg = getTelaPrintConfig();
    const estacaoAlvo = estacaoSelecionada === 'todas' ? 'todas' : estacaoSelecionada;

    window.cafeteriaPrint.printPedido(pedido, itensFiltrados, {
      estacao: estacaoAlvo
    });

    // Registrar log de reimpressão sem conflitar com concorrência
    await requisitarTravaImpressao(pedido.id, estacaoAlvo, 'reimpressao', cfg.deviceName);
    registrarImpressaoLocal(pedido.id, estacaoAlvo, 'reimpressao', cfg.deviceName);
  };

  // -----------------------------------------------------
  // 6. SUPABASE REALTIME & CONEXÃO (INCREMENTAL)
  // -----------------------------------------------------
  // CAF-000030: Debounce individual por pedido (300ms)
  const pendingPedidoFetches = new Map();

  function scheduleIncrementalFetch(pedidoId) {
    if (!pedidoId) return;
    if (pendingPedidoFetches.has(pedidoId)) {
      clearTimeout(pendingPedidoFetches.get(pedidoId));
    }
    const timerId = setTimeout(() => {
      pendingPedidoFetches.delete(pedidoId);
      fetchPedidoIncremental(pedidoId);
    }, 300);
    pendingPedidoFetches.set(pedidoId, timerId);
  }

  async function fetchPedidoIncremental(pedidoId) {
    if (!pedidoId) return;
    try {
      const { data: pedidoData, error } = await window.cafeteriaSupabase
        .from('pedidos')
        .select(PEDIDO_SELECT_COMPLETO)
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) {
        console.error('[KDS Incremental] Erro ao buscar pedido:', pedidoId, error);
        return;
      }

      const inicioDoDia = window.getInicioDoDiaSaoPaulo();

      if (!pedidoData) {
        removerPedidoLocal(pedidoId);
        return;
      }

      if (pedidoData.status === 'cancelado') {
        removerPedidoLocal(pedidoId);
        return;
      }

      // Adicionar ou atualizar no histórico recente de recall se finalizado hoje
      if ((pedidoData.status === 'concluido' || pedidoData.status === 'entregue') && pedidoData.created_at >= inicioDoDia) {
        adicionarHistoricoRecente(pedidoData);
      }

      // Pedido entregue não deve ficar no board ativo da cozinha (apenas recall)
      if (pedidoData.status === 'entregue') {
        removerPedidoLocal(pedidoId);
        return;
      }

      // Se concluído de outro dia, remove
      if (pedidoData.status === 'concluido' && pedidoData.created_at < inicioDoDia) {
        removerPedidoLocal(pedidoId);
        return;
      }

      // Atualizar ou inserir no array de pedidos ativos
      const idx = pedidos.findIndex(p => p.id === pedidoId);
      if (idx >= 0) {
        pedidos[idx] = pedidoData;
      } else {
        pedidos.push(pedidoData);
      }

      if (!mapaImpressoes.has(pedidoId)) {
        await carregarLogsImpressoes([pedidoId]);
      }

      renderPedidos();
    } catch (err) {
      console.error('[KDS Incremental] Exceção:', err);
    }
  }

  function removerPedidoLocal(pedidoId) {
    const idx = pedidos.findIndex(p => p.id === pedidoId);
    if (idx >= 0) {
      pedidos.splice(idx, 1);
    }
    const cardEl = document.getElementById(`pedido-card-${pedidoId}`);
    if (cardEl) {
      cardEl.remove();
    }
    renderPedidos();
  }

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

  // Fila e debounce de ~1.5s para impressão de itens adicionais / complementares
  let debouncePrintAdicionaisTimer = null;
  const pendingAdicionaisPedidos = new Set();

  function agendarImpressaoComplementar(pedidoId) {
    if (!pedidoId || !window.cafeteriaPrint) return;
    pendingAdicionaisPedidos.add(pedidoId);
    
    if (debouncePrintAdicionaisTimer) {
      clearTimeout(debouncePrintAdicionaisTimer);
    }
    
    debouncePrintAdicionaisTimer = setTimeout(async () => {
      const pedidosParaProcessar = Array.from(pendingAdicionaisPedidos);
      pendingAdicionaisPedidos.clear();
      
      for (const pId of pedidosParaProcessar) {
        await processarImpressaoComplementar(pId);
      }
    }, 1500);
  }

  async function processarImpressaoComplementar(pedidoId) {
    try {
      // 1. Buscar pedido completo com itens
      const { data: pedidoData, error: errPed } = await window.cafeteriaSupabase
        .from('pedidos')
        .select(PEDIDO_SELECT_COMPLETO)
        .eq('id', pedidoId)
        .single();
        
      if (errPed || !pedidoData) return;

      const todosItens = pedidoData.pedido_itens || [];
      // Filtrar itens lançados depois que ainda não foram impressos e não estão cancelados
      const itensNovosNaoImpressos = todosItens.filter(i => 
        i.lancado_depois === true && !i.impresso_em && !i.cancelado
      );

      if (itensNovosNaoImpressos.length === 0) return;

      // 2. Filtrar pela estação ativa da tela
      let itensAlvo = itensNovosNaoImpressos;
      if (estacaoSelecionada !== 'todas') {
        itensAlvo = itensNovosNaoImpressos.filter(i => getItemEstacao(i) === estacaoSelecionada);
      }

      if (itensAlvo.length === 0) return;

      const itemIds = itensAlvo.map(i => i.id);

      // 3. Marcar atomicamente como impresso no banco para evitar duplicidade entre múltiplas telas
      const { data: markedIds, error: errRpc } = await window.cafeteriaSupabase.rpc('marcar_itens_impressos', {
        p_item_ids: itemIds
      });

      if (errRpc || !markedIds || markedIds.length === 0) {
        // Outra tela já imprimiu ou nenhum foi retornado
        return;
      }

      // 4. Imprimir comanda complementar contendo apenas os itens reservados para impressão
      const itensParaImprimir = itensAlvo.filter(i => markedIds.includes(i.id));
      if (itensParaImprimir.length > 0) {
        await tentarTravarEImprimir(pedidoData, 'adicional', itensParaImprimir);
      }
    } catch (err) {
      console.error('[KDS Print] Erro ao processar impressão complementar:', err);
    }
  }

  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-cozinha-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async payload => {
        if (payload.eventType === 'INSERT') {
          playAlert();
          
          // Buscar pedido completo com itens para auto-impressão
          const { data: newPedido } = await window.cafeteriaSupabase
            .from('pedidos')
            .select(PEDIDO_SELECT_COMPLETO)
            .eq('id', payload.new.id)
            .single();
            
          if (newPedido) {
            // Auto-impressão da comanda com trava atômica e filtro por estação da tela
            await tentarTravarEImprimir(newPedido, 'comanda');
          }
          scheduleIncrementalFetch(payload.new.id);
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new && payload.new.status === 'cancelado') {
            showCancelToast(`⚠️ O Pedido #${payload.new.numero_pedido || payload.new.id} da ${payload.new.mesa_codigo} foi CANCELADO!`);
            playAlert();
          } else if (payload.new && payload.new.status === 'concluido' && (!payload.old || payload.old.status !== 'concluido')) {
            playAlert();
            chamarPedidoVoz(payload.new.numero_pedido || payload.new.id, payload.new.mesa_codigo, payload.new.cliente_nome, payload.new.para_viagem);
          }
          scheduleIncrementalFetch(payload.new.id);
        } else if (payload.eventType === 'DELETE') {
          if (payload.old && payload.old.id) {
            removerPedidoLocal(payload.old.id);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, async payload => {
        if (payload.eventType === 'UPDATE' && payload.new && payload.new.cancelado === true && (!payload.old || payload.old.cancelado === false)) {
          const nomeProd = payload.new.nome_produto || 'Item';
          showCancelToast(`⚠️ Item cancelado: ${payload.new.quantidade || 1}x ${nomeProd}`);
          playAlert();
        } else if (payload.eventType === 'INSERT' && payload.new) {
          const isCortesia = payload.new.cortesia_de_item_id ? true : false;
          const isLancadoDepois = Boolean(payload.new.lancado_depois);

          if (isCortesia || isLancadoDepois) {
            playAlert();
            const nomeProd = payload.new.nome_produto || 'Item';
            showNovoItemToast(`➕ Item adicionado: ${payload.new.quantidade || 1}x ${nomeProd}`);
          }

          if (isLancadoDepois && payload.new.pedido_id) {
            agendarImpressaoComplementar(payload.new.pedido_id);
          }
        }
        
        const pedidoId = (payload.new && payload.new.pedido_id) || (payload.old && payload.old.pedido_id);
        if (pedidoId) {
          scheduleIncrementalFetch(pedidoId);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedido_impressoes' }, payload => {
        if (payload.new && payload.new.pedido_id) {
          const list = mapaImpressoes.get(payload.new.pedido_id) || [];
          if (!list.some(l => l.id === payload.new.id)) {
            list.push(payload.new);
            mapaImpressoes.set(payload.new.pedido_id, list);
            scheduleIncrementalFetch(payload.new.pedido_id);
          }
        }
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
    fetchPedidosIniciais();
    verificarImpressaoPendentesAoConectar();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  // Lidar com repouso/troca de aba (CAF-000030: recarga completa apenas se ficou oculta > 60 segundos)
  let lastKdsHiddenTime = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastKdsHiddenTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      const ocultaMs = lastKdsHiddenTime ? (Date.now() - lastKdsHiddenTime) : 0;
      if (ocultaMs > 60000) {
        fetchPedidosIniciais();
        verificarImpressaoPendentesAoConectar();
      } else {
        updateTimers();
      }
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
