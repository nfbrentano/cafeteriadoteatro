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

  const cancelToast = document.getElementById('cancel-toast');
  const cancelToastMsg = document.getElementById('cancel-toast-msg');
  const cancelToastClose = document.getElementById('cancel-toast-close');

  // Estado
  let currentUser = null;
  let pedidos = []; // array de pedidos com itens
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
  async function fetchPedidosIniciais() {
    // Buscar pedidos pendentes e em preparo, mais todos os pedidos concluídos do dia atual (fuso de SP)
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

    pedidos = pedidosData || [];
    renderPedidos();
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
        } else if (p.status === 'concluido' || p.status === 'entregue') {
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

        if (p.status === 'concluido' || p.status === 'entregue') {
          concluidos.push(p);
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
      const tA = calcularEstadoTempoPedido(a, agora).restanteMs;
      const tB = calcularEstadoTempoPedido(b, agora).restanteMs;
      if (tA !== tB) return tA - tB; // quem estoura antes (ou já estourou mais) aparece primeiro
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
    const agora = getNowAdjusted();
    
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

      const card = document.createElement('div');
      card.id = `pedido-card-${pedido.id}`;
      card.className = `pedido-card ${estadoTempo.semaforo} ${estadoTempo.isPulsing ? 'pulso-alerta' : ''}`;
      card.setAttribute('data-pedido-id', pedido.id);
      card.setAttribute('data-created-at', pedido.created_at);
      card.setAttribute('data-alvo-min', estadoTempo.alvoMin);
      card.setAttribute('data-tipo', tipo);
      card.setAttribute('data-status', pedido.status);
      card.setAttribute('data-concluido-em', pedido.concluido_em || pedido.updated_at || '');
      
      let botoesHtml = '';
      if (tipo === 'pendente') {
        botoesHtml = `
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
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
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Imprimir Comanda">🖨 Comanda</button>
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
          <button class="btn-card--print" onclick="window.cozinhaReimprimir(${pedido.id})" title="Reimprimir">🖨 Comanda</button>
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

      const badgeNovos = novosPendentesCount > 0 
        ? `<span class="badge-itens-novos" title="${novosPendentesCount} item(ns) adicionado(s) após o envio">+${novosPendentesCount} novo${novosPendentesCount > 1 ? 's' : ''}</span>`
        : '';

      card.innerHTML = `
        <div class="pedido-header">
          <div class="pedido-mesa">${pedido.mesa_codigo} <span style="font-size:14px; font-weight:normal; color:#888;">(#${pedido.numero_pedido || pedido.id})</span> ${viagemTag} ${badgeEntregue} ${seloAguardando} ${badgeNovos}</div>
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

      container.appendChild(card);
    });
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

  window.iniciarPreparoEstacao = async function(pedidoId) {
    const estacao = estacaoSelecionada === 'todas' ? null : estacaoSelecionada;
    const nowIso = new Date().toISOString();
    
    // Otimista
    const p = pedidos.find(item => item.id === pedidoId);
    if (p) {
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
    const p = pedidos.find(item => item.id === pedidoId);
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

  function getItensDaEstacaoAtual(itens) {
    if (estacaoSelecionada === 'todas') return itens;
    return (itens || []).filter(item => {
      const itemEstacao = getItemEstacao(item);
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
      if (itensParaImprimir.length > 0 && window.cafeteriaPrint) {
        window.cafeteriaPrint.printComandaAdicional(pedidoData, itensParaImprimir);
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
          
          // Buscar pedido completo com itens para impressão e board
          const { data: newPedido } = await window.cafeteriaSupabase
            .from('pedidos')
            .select(PEDIDO_SELECT_COMPLETO)
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
          } else if (payload.new && payload.new.status === 'concluido' && (!payload.old || payload.old.status !== 'concluido')) {
            playAlert();
            chamarPedidoVoz(payload.new.numero_pedido || payload.new.id, payload.new.mesa_codigo, payload.new.cliente_nome, payload.new.para_viagem);
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
