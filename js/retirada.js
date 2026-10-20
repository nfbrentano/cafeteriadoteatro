/**
 * CAF-000027 — Painel de Senhas / TV de Retirada (retirada.js)
 * Cafeteria do Teatro
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos da interface
  const gridPreparando = document.getElementById('grid-preparando');
  const gridPronto = document.getElementById('grid-pronto');
  const countPreparando = document.getElementById('count-preparando');
  const countPronto = document.getElementById('count-pronto');
  const relogioEl = document.getElementById('retirada-relogio');
  const chipConexao = document.getElementById('retirada-status-conexao');
  const audioBanner = document.getElementById('retirada-audio-banner');
  const btnAtivarAudio = document.getElementById('btn-ativar-audio');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  const audioDing = document.getElementById('audio-ding');

  // Configurações e Estado
  const urlParams = new URLSearchParams(window.location.search);
  const mostrarMesas = urlParams.get('mostrar_mesas') === '1';
  const tempoMaxProntoMinutos = parseInt(urlParams.get('expirar_min') || '15', 10);

  let pedidosPreparando = [];
  let pedidosProntos = [];
  let idsProntosAnteriores = new Set();
  let idsNovosProntos = new Set(); // Ids que ganham destaque por 15s
  let isPrimeiraCarga = true;
  let somAtivo = localStorage.getItem('cafeteria_retirada_som') !== 'false';
  let audioDesbloqueado = false;
  let pollingIntervalId = null;

  // -----------------------------------------------------
  // 1. RELÓGIO DIGITAL & AUTO-REFRESH DA MADRUGADA
  // -----------------------------------------------------
  function atualizarRelogio() {
    const agora = new Date();
    const h = String(agora.getHours()).padStart(2, '0');
    const m = String(agora.getMinutes()).padStart(2, '0');
    if (relogioEl) relogioEl.textContent = `${h}:${m}`;

    // Auto-refresh diário às 04:00 para manter a memória da TV limpa
    if (agora.getHours() === 4 && agora.getMinutes() === 0 && agora.getSeconds() < 2) {
      window.location.reload();
    }
  }
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();

  // -----------------------------------------------------
  // 2. CONTROLE DE ÁUDIO & AUTOPLAY POLICY
  // -----------------------------------------------------
  function atualizarBotaoSom() {
    if (!btnToggleSound) return;
    if (somAtivo) {
      btnToggleSound.textContent = '🔔';
      btnToggleSound.classList.remove('muted');
      btnToggleSound.title = 'Som ativado · Toque para silenciar';
    } else {
      btnToggleSound.textContent = '🔕';
      btnToggleSound.classList.add('muted');
      btnToggleSound.title = 'Som desativado · Toque para ativar';
    }
  }
  atualizarBotaoSom();

  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      somAtivo = !somAtivo;
      localStorage.setItem('cafeteria_retirada_som', somAtivo ? 'true' : 'false');
      atualizarBotaoSom();
      if (somAtivo) tocarSinalRetirada();
    });
  }

  function desbloquearAudio() {
    if (audioDesbloqueado) return;
    if (audioDing) {
      audioDing.volume = 0.01;
      audioDing.play().then(() => {
        audioDing.pause();
        audioDing.currentTime = 0;
        audioDing.volume = 1.0;
        audioDesbloqueado = true;
        if (audioBanner) audioBanner.classList.add('hidden');
      }).catch(() => {
        // Autoplay ainda bloqueado, mantém banner
      });
    }
  }

  if (btnAtivarAudio) {
    btnAtivarAudio.addEventListener('click', (e) => {
      e.stopPropagation();
      desbloquearAudio();
    });
  }

  // Qualquer toque ou clique na TV tenta desbloquear o áudio
  document.addEventListener('click', () => {
    desbloquearAudio();
  }, { once: true });

  function tocarSinalRetirada() {
    if (!somAtivo) return;
    if (audioDing) {
      audioDing.currentTime = 0;
      audioDing.play().catch(() => {
        // Fallback Web Audio API caso o arquivo esteja inacessível
        tocarSinoWebAudio();
      });
    } else {
      tocarSinoWebAudio();
    }
  }

  function tocarSinoWebAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota Lá (A5)
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch (e) {
      console.warn('[Retirada Audio]', e);
    }
  }

  // -----------------------------------------------------
  // 3. TELA CHEIA (FULLSCREEN)
  // -----------------------------------------------------
  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('[Retirada] Erro ao entrar em tela cheia:', err);
        });
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // -----------------------------------------------------
  // 4. STATUS DA CONEXÃO
  // -----------------------------------------------------
  function setStatusConexao(status) {
    if (!chipConexao) return;
    chipConexao.className = `retirada-status-chip ${status}`;
    const txt = chipConexao.querySelector('.status-text');
    if (txt) {
      txt.textContent = status === 'online' ? 'Online' : status === 'reconectando' ? 'Reconectando...' : 'Offline';
    }
  }

  window.addEventListener('online', () => setStatusConexao('online'));
  window.addEventListener('offline', () => setStatusConexao('offline'));

  // -----------------------------------------------------
  // 5. PROCESSAMENTO & SANITIZAÇÃO DE DADOS (LGPD)
  // -----------------------------------------------------
  function extrairPrimeiroNome(nomeCompleto) {
    if (!nomeCompleto) return '';
    const partes = String(nomeCompleto).trim().split(/\s+/);
    return partes[0] || '';
  }

  function formatarNumeroPedido(num, id) {
    if (num !== undefined && num !== null && String(num).trim() !== '') {
      return String(num).replace('#', '');
    }
    return String(id).slice(-4);
  }

  function pedidoElegivel(p) {
    // Por padrão na TV de retirada, exibe pedidos para viagem ou sem mesa específica
    if (mostrarMesas) return true;
    return !!p.para_viagem || !p.mesa_codigo || p.mesa_codigo === 'BALCAO' || p.mesa_codigo === 'VIAGEM';
  }

  // -----------------------------------------------------
  // 6. CARREGAMENTO DOS PEDIDOS (VIEW OU FALLBACK)
  // -----------------------------------------------------
  async function carregarPedidos() {
    if (!window.cafeteriaSupabase) {
      console.warn('[Retirada] Supabase client não inicializado');
      return;
    }

    try {
      // Data de corte: início do dia em São Paulo
      const hoje = new Date();
      const inicioDiaISO = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0).toISOString();

      // Tentativa 1: Consulta na view v_painel_retirada (CAF-000027)
      let { data, error } = await window.cafeteriaSupabase
        .from('v_painel_retirada')
        .select('*')
        .order('created_at', { ascending: false });

      // Fallback: caso a migration da view ainda não tenha sido aplicada no ambiente
      if (error) {
        const fallbackRes = await window.cafeteriaSupabase
          .from('pedidos')
          .select('id, numero_pedido, cliente_nome, status, pronto_em, concluido_em, para_viagem, mesa_codigo, created_at')
          .gte('created_at', inicioDiaISO)
          .in('status', ['pendente', 'em_preparo', 'concluido'])
          .order('created_at', { ascending: false });

        if (fallbackRes.error) {
          console.error('[Retirada] Erro ao carregar pedidos:', fallbackRes.error);
          setStatusConexao('reconectando');
          return;
        }

        data = (fallbackRes.data || []).map(p => ({
          ...p,
          primeiro_nome: extrairPrimeiroNome(p.cliente_nome)
        }));
      }

      setStatusConexao('online');
      processarListaPedidos(data || []);
    } catch (err) {
      console.error('[Retirada] Falha na consulta:', err);
      setStatusConexao('reconectando');
    }
  }

  function processarListaPedidos(lista) {
    const agora = Date.now();
    const limiteMs = tempoMaxProntoMinutos * 60 * 1000;

    const novosPreparando = [];
    const novosProntos = [];
    const prontosIdsAtuais = new Set();
    let temNovoPronto = false;

    lista.forEach(item => {
      if (!pedidoElegivel(item)) return;

      if (item.status === 'pendente' || item.status === 'em_preparo') {
        novosPreparando.push(item);
      } else if (item.status === 'concluido') {
        // Checar expiração de pedidos concluídos há muito tempo
        const dataConclusao = item.pronto_em || item.concluido_em || item.created_at;
        const diffMs = agora - new Date(dataConclusao).getTime();
        
        if (diffMs <= limiteMs) {
          novosProntos.push(item);
          prontosIdsAtuais.add(item.id);

          // Verifica se virou pronto nesta atualização
          if (!isPrimeiraCarga && !idsProntosAnteriores.has(item.id)) {
            temNovoPronto = true;
            idsNovosProntos.add(item.id);
            // Remove destaque após 15 segundos
            setTimeout(() => {
              idsNovosProntos.delete(item.id);
              renderPronto();
            }, 15000);
          }
        }
      }
    });

    // Dispara alarme sonoro se um pedido acabou de ficar pronto
    if (temNovoPronto) {
      tocarSinalRetirada();
    }

    idsProntosAnteriores = prontosIdsAtuais;
    isPrimeiraCarga = false;

    pedidosPreparando = novosPreparando;
    pedidosProntos = novosProntos;

    renderPreparando();
    renderPronto();
  }

  // -----------------------------------------------------
  // 7. RENDERIZAÇÃO DAS COLUNAS
  // -----------------------------------------------------
  function renderPreparando() {
    if (!gridPreparando) return;
    if (countPreparando) countPreparando.textContent = pedidosPreparando.length;

    if (pedidosPreparando.length === 0) {
      gridPreparando.innerHTML = '<div class="retirada-empty-state">Nenhum pedido em preparo no momento.</div>';
      return;
    }

    gridPreparando.innerHTML = pedidosPreparando.map(p => {
      const num = formatarNumeroPedido(p.numero_pedido, p.id);
      const nome = p.primeiro_nome || extrairPrimeiroNome(p.cliente_nome) || 'Balcão';
      const badge = p.status === 'em_preparo' ? '🔵 No Fogo / Barista' : '🟡 Na Fila';
      return `
        <div class="card-senha-preparando" data-id="${p.id}">
          <div class="senha-numero">#${num}</div>
          <div class="senha-nome">${window.escapeHtml ? window.escapeHtml(nome) : nome}</div>
          <div class="senha-badge">${badge}</div>
        </div>
      `;
    }).join('');
  }

  function renderPronto() {
    if (!gridPronto) return;
    if (countPronto) countPronto.textContent = pedidosProntos.length;

    if (pedidosProntos.length === 0) {
      gridPronto.innerHTML = '<div class="retirada-empty-state">Aguardando pedidos prontos...</div>';
      return;
    }

    gridPronto.innerHTML = pedidosProntos.map(p => {
      const num = formatarNumeroPedido(p.numero_pedido, p.id);
      const nome = p.primeiro_nome || extrairPrimeiroNome(p.cliente_nome) || 'Cliente';
      const isNovo = idsNovosProntos.has(p.id);

      return `
        <div class="card-senha-pronto ${isNovo ? 'pedido-novo-pronto' : ''}" data-id="${p.id}">
          <div class="senha-numero">#${num}</div>
          <div class="senha-nome">${window.escapeHtml ? window.escapeHtml(nome) : nome}</div>
          <div class="senha-instrucao">✓ Retire no Balcão</div>
        </div>
      `;
    }).join('');
  }

  // -----------------------------------------------------
  // 8. REALTIME COM SUPABASE
  // -----------------------------------------------------
  function configurarRealtime() {
    if (!window.cafeteriaSupabase) return;

    try {
      const channel = window.cafeteriaSupabase
        .channel('retirada_pedidos_channel')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pedidos'
        }, (payload) => {
          carregarPedidos();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setStatusConexao('online');
          } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            setStatusConexao('reconectando');
          }
        });
    } catch (err) {
      console.warn('[Retirada Realtime]', err);
    }
  }

  // -----------------------------------------------------
  // 9. INICIALIZAÇÃO & POLLING DE RESILIÊNCIA
  // -----------------------------------------------------
  carregarPedidos();
  configurarRealtime();

  // Polling de segurança a cada 15s para garantir atualização mesmo em conexões instáveis
  pollingIntervalId = setInterval(carregarPedidos, 15000);

  // CAF-000064: Manter painel de retirada sempre ligado
  if (window.WakeLockUtil) {
    window.WakeLockUtil.setupAutoWakeLock({ defaultActive: true });
  } else {
    window.addEventListener('load', () => {
      window.WakeLockUtil?.setupAutoWakeLock({ defaultActive: true });
    });
  }
});
