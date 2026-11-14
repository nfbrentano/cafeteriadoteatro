/* =========================================================
   PDV — REALTIME, TRIAGEM QR, SOM, VOZ & NOTIFICAÇÕES
   ========================================================= */

import { estadoPDV, escapeHtml, definirGlobalPDV } from './estado.js';

export function registrarRealtimePDV() {
  const {
    navBtnMesas,
    filtroChips,
    filtroEscopoChips,
    audioPronto,
    audioNovoPedidoCliente,
    btnToggleSound,
    soundToggleIcon,
    alertaProntoTop,
    alertaProntoTitulo,
    alertaProntoSubtitulo,
    btnAlertaProntoAcao,
    btnAlertaProntoFechar,
    btnPedidosClienteNav,
    badgePedidosCliente,
    btnChamadosMesaNav,
    badgeChamadosMesa,
    bannerPedidosClienteContainer,
    bannerPedidosClienteQtd,
    btnAbrirTriagemPedidosCliente,
    bannerChamadosMesaContainer,
    bannerChamadosMesaTexto,
    btnAtenderChamadoTopo,
    modalPedidosClienteTriagem,
    listaPedidosClienteAguardando,
    btnFecharTriagemPedidosCliente,
    btnFecharTriagemFooter
  } = estadoPDV.refs;

  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);

  function isSomAtivo() {
    return localStorage.getItem('cafeteria_pdv_som_ativo') !== 'false';
  }

  function updateSoundToggleUI() {
    if (!btnToggleSound || !soundToggleIcon) return;
    const label = btnToggleSound.querySelector('.sound-toggle-label');
    const ativo = isSomAtivo();
    if (ativo) {
      btnToggleSound.classList.remove('is-muted');
      btnToggleSound.title = 'Modo normal (Som ativo) · Toque para silenciar';
      soundToggleIcon.textContent = '🔔';
      if (label) label.textContent = 'Som';
    } else {
      btnToggleSound.classList.add('is-muted');
      btnToggleSound.title = 'Modo Silencioso (Sem som · apenas vibração/toast) · Toque para ativar som';
      soundToggleIcon.textContent = '🔕';
      if (label) label.textContent = 'Mudo';
    }
  }

  function setSomAtivo(ativo) {
    localStorage.setItem('cafeteria_pdv_som_ativo', ativo ? 'true' : 'false');
    updateSoundToggleUI();
  }

  function tocarAlertaPronto() {
    if (!isSomAtivo()) return;
    try {
      if (audioPronto) {
        audioPronto.currentTime = 0;
        audioPronto.play().catch(e => console.log('Autoplay bloqueado:', e));
      }
    } catch (e) {}
  }

  function tocarAlertaNovoPedidoCliente() {
    if (!isSomAtivo()) return;
    try {
      const audio = audioNovoPedidoCliente || audioPronto;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Autoplay bloqueado:', e));
      }
    } catch (e) {}
  }

  function chamarPedidoVoz(numeroPedido, mesaCodigo, clienteNome, paraViagem) {
    if (!isSomAtivo()) return;
    tocarAlertaPronto();
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
          ? `Atenção! Pedido da ${clienteNome}, está pronto para ser servido!`
          : `Atenção! Pedido número ${numeroPedido}, da mesa ${mesaCodigo}, está pronto para ser servido!`;
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

  function solicitarPermissaoNotificacao() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission().then(perm => {
          console.log('[PDV] Permissão de notificações:', perm);
        }).catch(() => {});
      } catch (e) {}
    }
  }

  function dispararVibracaoTatil() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([200, 80, 200, 80, 300]);
      } catch (e) {
        console.debug('[PDV Vibrate]', e);
      }
    }
  }

  function focarPedidoPronto(pedido) {
    if (!pedido) return;
    if (navBtnMesas) navBtnMesas.click();

    if (estadoPDV.currentFilterStatus !== 'todos' && estadoPDV.currentFilterStatus !== 'concluido') {
      estadoPDV.currentFilterStatus = 'todos';
      if (filtroChips) {
        filtroChips.forEach(chip => {
          const isActive = chip.dataset.filter === 'todos';
          chip.classList.toggle('active', isActive);
          chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }
      estadoPDV.fn.renderPedidosCards?.();
    }

    if (estadoPDV.currentFilterScope === 'meus') {
      const myId = estadoPDV.currentUser ? estadoPDV.currentUser.id : null;
      const isMeu = myId && (pedido.criado_por === myId || pedido.usuario_id === myId);
      if (!isMeu) {
        estadoPDV.currentFilterScope = 'todos';
        localStorage.setItem('cafeteria_pedidos_filtro_escopo', 'todos');
        if (filtroEscopoChips) {
          filtroEscopoChips.forEach(c => {
            const isActive = c.dataset.scope === 'todos';
            c.classList.toggle('active', isActive);
            c.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        }
        estadoPDV.fn.renderPedidosCards?.();
      }
    }

    setTimeout(() => {
      const card = document.querySelector(`.pedido-card-barista[data-pedido-id="${pedido.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('destaque-pronto-pulse');
        setTimeout(() => card.classList.remove('destaque-pronto-pulse'), 3500);
        return;
      }

      if (pedido.mesa_codigo) {
        const mesaCards = document.querySelectorAll('.mesa-card');
        for (const mc of mesaCards) {
          const cod = mc.querySelector('.mesa-card__codigo');
          if (cod && cod.textContent.trim() === pedido.mesa_codigo) {
            mc.scrollIntoView({ behavior: 'smooth', block: 'center' });
            mc.classList.add('destaque-pronto-pulse');
            setTimeout(() => mc.classList.remove('destaque-pronto-pulse'), 3500);
            break;
          }
        }
      }
    }, 220);
  }

  function dispararNotificacaoNativa(pedido) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const mesaStr = pedido.mesa_codigo ? `Mesa ${pedido.mesa_codigo}` : (pedido.para_viagem ? 'Para Viagem' : 'Balcão');
      const titulo = `☕ Pedido Pronto · ${mesaStr}`;
      const corpo = pedido.cliente_nome
        ? `Cliente: ${pedido.cliente_nome} (Pedido #${pedido.numero_pedido || pedido.id}). Pronto para servir!`
        : `Pedido #${pedido.numero_pedido || pedido.id} pronto para servir.`;

      const notif = new Notification(titulo, {
        body: corpo,
        icon: 'assets/icons/icon-192.png',
        tag: `pedido-pronto-${pedido.id}`,
        renotify: true
      });

      notif.onclick = () => {
        window.focus();
        focarPedidoPronto(pedido);
        notif.close();
      };
    } catch (e) {
      console.warn('[Notification API]', e);
    }
  }

  function exibirToastPedidoPronto(pedido) {
    if (!alertaProntoTop || !alertaProntoTitulo) return;
    if (estadoPDV.timers.alertaPronto) clearTimeout(estadoPDV.timers.alertaPronto);

    const mesaStr = pedido.mesa_codigo ? `Mesa ${pedido.mesa_codigo}` : (pedido.para_viagem ? 'Viagem' : 'Balcão');
    alertaProntoTitulo.textContent = `🔔 ${mesaStr}: Pedido #${pedido.numero_pedido || pedido.id} pronto!`;
    if (alertaProntoSubtitulo) {
      alertaProntoSubtitulo.textContent = pedido.cliente_nome
        ? `Cliente: ${pedido.cliente_nome} · Toque para ver comanda`
        : 'Pronto para servir · Toque para ver comanda';
    }

    const onAcao = (e) => {
      if (e) e.stopPropagation();
      alertaProntoTop.classList.add('hidden');
      focarPedidoPronto(pedido);
    };

    alertaProntoTop.onclick = onAcao;
    if (btnAlertaProntoAcao) btnAlertaProntoAcao.onclick = onAcao;
    if (btnAlertaProntoFechar) {
      btnAlertaProntoFechar.onclick = (e) => {
        e.stopPropagation();
        alertaProntoTop.classList.add('hidden');
      };
    }

    alertaProntoTop.classList.remove('hidden');

    estadoPDV.timers.alertaPronto = setTimeout(() => {
      alertaProntoTop.classList.add('hidden');
    }, 12000);
  }

  function notificarPedidoPronto(pedido) {
    if (!pedido || !pedido.id) return;
    if (estadoPDV.pedidosProntosNotificados.has(pedido.id)) return;
    estadoPDV.pedidosProntosNotificados.add(pedido.id);

    dispararVibracaoTatil();

    if (isSomAtivo()) {
      tocarAlertaPronto();
      chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
    } else {
      console.log('[PDV] Modo Silencioso ativo: som suprimido para pedido #', pedido.numero_pedido || pedido.id);
    }

    exibirToastPedidoPronto(pedido);

    if (document.visibilityState === 'hidden') {
      dispararNotificacaoNativa(pedido);
    }
  }

  function initSoundAndNotificationSystem() {
    updateSoundToggleUI();

    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        const novo = !isSomAtivo();
        setSomAtivo(novo);
        if (novo) {
          tocarAlertaPronto();
          showToast('🔔 Som ativado para alertas de pedidos prontos');
        } else {
          showToast('🔕 Modo Silencioso ativado (vibração e alertas visuais mantidos)');
        }
        solicitarPermissaoNotificacao();
      });
    }

    document.addEventListener('click', () => {
      solicitarPermissaoNotificacao();
    }, { once: true });

    const btnToggleWakeLock = document.getElementById('btn-toggle-wake-lock');
    if (btnToggleWakeLock) {
      if (window.WakeLockUtil) {
        window.WakeLockUtil.initWakeLockToggle(btnToggleWakeLock);
      } else {
        window.addEventListener('load', () => {
          window.WakeLockUtil?.initWakeLockToggle(btnToggleWakeLock);
        });
      }
    }

    const setupVoice = () => {
      if (window.VoiceDictation?.bindVoiceDictation) {
        window.VoiceDictation.bindVoiceDictation(
          document.getElementById('btn-voice-pedido-obs'),
          document.getElementById('pedido-obs')
        );
        window.VoiceDictation.bindVoiceDictation(
          document.getElementById('btn-voice-modal-obs'),
          document.getElementById('modal-obs-input')
        );
        window.VoiceDictation.bindVoiceDictation(
          document.getElementById('btn-voice-montagem-obs'),
          document.getElementById('modal-montagem-obs')
        );
      }
    };
    setupVoice();
    window.addEventListener('load', setupVoice);
  }

  // Triagem de Pedidos QR/Online & Chamados de Mesa
  async function aprovarPedidoCliente(pedidoId) {
    try {
      const pedidoAlvo = estadoPDV.pedidosClienteAguardando.find(p => p.id === pedidoId);
      showToast('Aprovando pedido...', 'info');
      await window.cafeteriaDB.clientePedido.aprovar(pedidoId);
      showToast('Pedido aprovado com sucesso!', 'success');

      if (pedidoAlvo && (pedidoAlvo.origem === 'online' || pedidoAlvo.mesa_codigo === 'RETIRADA') && pedidoAlvo.cliente_telefone) {
        const numPed = pedidoAlvo.numero_pedido || pedidoAlvo.id;
        let horarioTxt = 'em breve';
        if (pedidoAlvo.retirada_em) {
          const dt = new Date(pedidoAlvo.retirada_em);
          horarioTxt = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        const linkTrack = `${window.location.origin}/cardapio.html?pedido=${pedidoAlvo.pedido_token}`;
        const msg = `Olá, ${pedidoAlvo.cliente_nome || 'Cliente'}! ☕ Seu pedido #${numPed} na Cafeteria do Teatro foi confirmado para retirada em ${horarioTxt}. Acompanhe o status aqui: ${linkTrack}`;
        const foneClean = String(pedidoAlvo.cliente_telefone).replace(/\D/g, '');
        window.open(`https://wa.me/${foneClean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      }

      try {
        const { data: pData } = await window.cafeteriaSupabase
          .from('pedidos')
          .select(`
            *,
            pedido_itens (
              *,
              pedido_item_adicionais (*)
            )
          `)
          .eq('id', pedidoId)
          .single();
        const isAgendadoDistante = pData?.retirada_em && (new Date(pData.retirada_em).getTime() - Date.now() > 25 * 60 * 1000);
        if (pData && !isAgendadoDistante && window.imprimirCupomPedido) {
          window.imprimirCupomPedido(pData, false);
        }
      } catch (errPrint) {
        console.warn('Erro ao auto-imprimir pedido aprovado:', errPrint);
      }

      await loadPedidosClienteAguardando();
      await estadoPDV.fn.loadActivePedidos?.();
    } catch (err) {
      console.error('Erro ao aprovar pedido:', err);
      showToast('Erro ao aprovar pedido: ' + (err.message || err), { tipo: 'error' });
    }
  }

  async function recusarPedidoCliente(pedidoId) {
    const motivo = await window.showPromptBottomSheet({
      titulo: 'Recusar Pedido do Cardápio',
      mensagem: 'Informe o motivo da recusa (será exibido ao cliente no cardápio):',
      opcoesRapidas: ['Cozinha com alta demanda no momento', 'Item esgotado no estoque', 'Horário de encerramento atingido'],
      valorPadrao: 'Cozinha com alta demanda no momento',
      obrigatorio: true
    });
    if (motivo === null || !motivo) return;
    try {
      await window.cafeteriaDB.clientePedido.recusar(pedidoId, motivo);
      showToast('Pedido recusado.', 'info');
      await loadPedidosClienteAguardando();
    } catch (err) {
      console.error('Erro ao recusar pedido:', err);
      showToast('Erro ao recusar pedido: ' + (err.message || err), { tipo: 'error' });
    }
  }

  function renderTriagemPedidosCliente() {
    const qtd = estadoPDV.pedidosClienteAguardando.length;
    if (badgePedidosCliente) badgePedidosCliente.textContent = qtd;
    if (bannerPedidosClienteQtd) bannerPedidosClienteQtd.textContent = qtd;

    if (qtd > 0) {
      if (btnPedidosClienteNav) btnPedidosClienteNav.classList.remove('hidden');
      if (bannerPedidosClienteContainer) bannerPedidosClienteContainer.classList.remove('hidden');
    } else {
      if (btnPedidosClienteNav) btnPedidosClienteNav.classList.add('hidden');
      if (bannerPedidosClienteContainer) bannerPedidosClienteContainer.classList.add('hidden');
    }

    if (!listaPedidosClienteAguardando) return;

    if (qtd === 0) {
      listaPedidosClienteAguardando.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">✨</div>
          <strong style="color: #334155;">Nenhum pedido de cliente aguardando aprovação</strong>
          <p style="margin-top: 4px; font-size: 0.9rem;">Novos pedidos enviados pelo QR Code da mesa ou pelo Link Online aparecerão aqui em tempo real.</p>
        </div>
      `;
      return;
    }

    listaPedidosClienteAguardando.innerHTML = estadoPDV.pedidosClienteAguardando.map(pedido => {
      const itensHtml = (pedido.pedido_itens || []).map(item => {
        const adics = (item.pedido_item_adicionais || []).map(a => `+ ${escapeHtml(a.nome_adicional)} (R$ ${Number(a.preco_unitario || 0).toFixed(2)})`).join(', ');
        return `
          <div style="padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.9rem;">
            <div style="display: flex; justify-content: space-between;">
              <span><strong>${Number(item.quantidade) || 1}x</strong> ${escapeHtml(item.nome_produto || 'Item')}</span>
              <span>R$ ${(item.subtotal || item.preco_unitario * item.quantidade || 0).toFixed(2)}</span>
            </div>
            ${item.observacoes ? `<div style="font-size: 0.8rem; color: #b45309; font-style: italic; margin-left: 12px;">Obs: ${escapeHtml(item.observacoes)}</div>` : ''}
            ${adics ? `<div style="font-size: 0.8rem; color: #475569; margin-left: 12px;">${adics}</div>` : ''}
          </div>
        `;
      }).join('');

      const hora = new Date(pedido.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isOnline = pedido.origem === 'online' || pedido.origem === 'online_retirada' || pedido.mesa_codigo === 'RETIRADA';
      let retiradaBadge = '';
      if (pedido.retirada_em) {
        const dtRet = new Date(pedido.retirada_em);
        const retStr = dtRet.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + dtRet.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        retiradaBadge = `<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700; margin-left:6px;">🕒 Retirada: ${retStr}</span>`;
      }

      const obsTexto = pedido.observacoes_gerais || pedido.observacoes;

      return `
        <div class="card-pedido-triagem" style="border: 1px solid ${isOnline ? '#86efac' : '#c7d2fe'}; border-left: 5px solid ${isOnline ? '#059669' : '#4f46e5'}; border-radius: 8px; padding: 14px; background: ${isOnline ? '#f0fdf4' : '#faf5ff'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap:wrap; gap:6px;">
            <div>
              <span style="background: ${isOnline ? '#059669' : '#4f46e5'}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">
                ${isOnline ? '🌐 Online / Encomenda' : `Mesa ${escapeHtml(pedido.mesa_codigo)}`}
              </span>
              <span style="font-weight: 600; margin-left: 8px; color: #1e293b;">
                ${escapeHtml(pedido.cliente_nome || 'Cliente')} ${pedido.cliente_telefone ? `<small style="color:#475569;">(${escapeHtml(pedido.cliente_telefone)})</small>` : ''}
              </span>
              <span style="font-size: 0.8rem; color: #64748b; margin-left: 6px;">
                às ${hora}
              </span>
              ${retiradaBadge}
            </div>
            <strong style="font-size: 1.1rem; color: #1e1b4b;">
              R$ ${Number(pedido.total || 0).toFixed(2)}
            </strong>
          </div>

          ${obsTexto ? `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; color: #92400e; margin-bottom: 8px;">
              <strong>Observação:</strong> ${escapeHtml(obsTexto)}
            </div>
          ` : ''}

          <div style="background: white; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
            ${itensHtml}
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-recusar-pedido-cliente btn--danger" data-id="${pedido.id}">
              ✕ Recusar
            </button>
            <button type="button" class="btn-aprovar-pedido-cliente btn--primary ${isOnline ? 'btn--verde' : ''}" data-id="${pedido.id}">
              ✓ Aprovar ${isOnline ? '& Confirmar no WhatsApp' : '& Enviar à Cozinha'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    listaPedidosClienteAguardando.querySelectorAll('.btn-aprovar-pedido-cliente').forEach(btn => {
      btn.addEventListener('click', () => aprovarPedidoCliente(Number(btn.dataset.id)));
    });

    listaPedidosClienteAguardando.querySelectorAll('.btn-recusar-pedido-cliente').forEach(btn => {
      btn.addEventListener('click', () => recusarPedidoCliente(Number(btn.dataset.id)));
    });
  }

  async function loadPedidosClienteAguardando() {
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('pedidos')
        .select(`
          *,
          pedido_itens (
            *,
            pedido_item_adicionais (*)
          )
        `)
        .eq('status', 'aguardando_aprovacao')
        .order('created_at', { ascending: true });

      if (!error && data) {
        let temNovo = false;
        data.forEach(p => {
          if (!estadoPDV.pedidosClienteNotificados.has(p.id)) {
            estadoPDV.pedidosClienteNotificados.add(p.id);
            temNovo = true;
          }
        });
        if (temNovo && estadoPDV.pedidosClienteAguardando.length > 0) {
          tocarAlertaNovoPedidoCliente();
        }

        estadoPDV.pedidosClienteAguardando = data;
        renderTriagemPedidosCliente();
      }
    } catch (e) {
      console.warn('Erro ao carregar pedidos aguardando aprovação:', e);
    }
  }

  function renderChamadosMesa() {
    const qtd = estadoPDV.chamadosMesaPendentes.length;
    if (badgeChamadosMesa) badgeChamadosMesa.textContent = qtd;

    if (qtd > 0) {
      if (btnChamadosMesaNav) btnChamadosMesaNav.classList.remove('hidden');
      if (bannerChamadosMesaContainer) bannerChamadosMesaContainer.classList.remove('hidden');
      const primeiro = estadoPDV.chamadosMesaPendentes[0];
      const tipoTxt = primeiro.tipo === 'conta' ? '🧾 Pedido de Conta' : '🙋 Chamado de Garçom';
      if (bannerChamadosMesaTexto) {
        bannerChamadosMesaTexto.textContent = `${tipoTxt} na Mesa ${primeiro.mesa_codigo}${qtd > 1 ? ` (+${qtd - 1} outros)` : ''}`;
      }
    } else {
      if (btnChamadosMesaNav) btnChamadosMesaNav.classList.add('hidden');
      if (bannerChamadosMesaContainer) bannerChamadosMesaContainer.classList.add('hidden');
    }
  }

  async function loadChamadosMesa() {
    try {
      if (window.cafeteriaDB && window.cafeteriaDB.mesas) {
        const chamados = await window.cafeteriaDB.mesas.listarChamados(true);
        let temNovo = false;
        chamados.forEach(c => {
          if (!estadoPDV.chamadosNotificados.has(c.id)) {
            estadoPDV.chamadosNotificados.add(c.id);
            temNovo = true;
          }
        });
        if (temNovo && estadoPDV.chamadosMesaPendentes.length > 0) {
          tocarAlertaNovoPedidoCliente();
        }
        estadoPDV.chamadosMesaPendentes = chamados;
        renderChamadosMesa();
      }
    } catch (e) {
      console.warn('Erro ao carregar chamados de mesa:', e);
    }
  }

  async function atenderChamadoMesa(chamadoId) {
    try {
      await window.cafeteriaDB.mesas.atenderChamado(chamadoId);
      showToast('Chamado marcado como atendido!', 'success');
      await loadChamadosMesa();
    } catch (err) {
      console.error('Erro ao atender chamado:', err);
      showToast('Erro ao atender chamado: ' + (err.message || err), { tipo: 'error' });
    }
  }

  function abrirModalTriagemPedidosCliente() {
    if (modalPedidosClienteTriagem) {
      renderTriagemPedidosCliente();
      modalPedidosClienteTriagem.classList.remove('hidden');
    }
  }

  function fecharModalTriagemPedidosCliente() {
    if (modalPedidosClienteTriagem) {
      modalPedidosClienteTriagem.classList.add('hidden');
    }
  }

  if (btnPedidosClienteNav) btnPedidosClienteNav.addEventListener('click', abrirModalTriagemPedidosCliente);
  if (btnAbrirTriagemPedidosCliente) btnAbrirTriagemPedidosCliente.addEventListener('click', abrirModalTriagemPedidosCliente);
  if (btnFecharTriagemPedidosCliente) btnFecharTriagemPedidosCliente.addEventListener('click', fecharModalTriagemPedidosCliente);
  if (btnFecharTriagemFooter) btnFecharTriagemFooter.addEventListener('click', fecharModalTriagemPedidosCliente);
  if (modalPedidosClienteTriagem) {
    modalPedidosClienteTriagem.addEventListener('click', (e) => {
      if (e.target === modalPedidosClienteTriagem) fecharModalTriagemPedidosCliente();
    });
  }

  if (btnAtenderChamadoTopo) {
    btnAtenderChamadoTopo.addEventListener('click', () => {
      if (estadoPDV.chamadosMesaPendentes.length > 0) {
        atenderChamadoMesa(estadoPDV.chamadosMesaPendentes[0].id);
      }
    });
  }

  if (btnChamadosMesaNav) {
    btnChamadosMesaNav.addEventListener('click', async () => {
      if (estadoPDV.chamadosMesaPendentes.length > 0) {
        const primeiro = estadoPDV.chamadosMesaPendentes[0];
        const tipoTxt = primeiro.tipo === 'conta' ? 'Pedir a Conta' : 'Chamar Garçom';
        let confirmado = true;
        if (typeof window.showConfirmBottomSheet === 'function') {
          confirmado = await window.showConfirmBottomSheet({
            titulo: 'Atender chamado?',
            mensagem: `Marcar chamado da Mesa ${primeiro.mesa_codigo} (${tipoTxt}) como atendido?`,
            textoConfirmar: 'Sim, atendido',
            textoCancelar: 'Cancelar'
          });
        }
        if (confirmado) {
          atenderChamadoMesa(primeiro.id);
        }
      }
    });
  }

  // Incremental Realtime & Status de Conexão
  async function fetchPdvPedidoIncremental(pedidoId) {
    if (!pedidoId) return;
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('pedidos')
        .select(`
          *,
          pedido_itens (
            *,
            pedido_item_adicionais (*)
          )
        `)
        .eq('id', pedidoId)
        .maybeSingle();

      if (error) {
        console.warn('[PDV Incremental] Erro ao buscar pedido:', pedidoId, error);
        return;
      }

      const inicioDoDia = window.getInicioDoDiaSaoPaulo();

      const deveEstarAtivo = data &&
        data.status !== 'cancelado' &&
        (
          data.status === 'pendente' ||
          data.status === 'em_preparo' ||
          data.status_pagamento === 'pendente' ||
          !data.status_pagamento ||
          (data.status === 'concluido' && data.created_at >= inicioDoDia)
        );

      const idx = estadoPDV.activePedidos.findIndex(p => p.id === pedidoId);

      if (!deveEstarAtivo) {
        if (idx >= 0) {
          estadoPDV.activePedidos.splice(idx, 1);
        }
      } else {
        if (idx >= 0) {
          estadoPDV.activePedidos[idx] = data;
        } else {
          estadoPDV.activePedidos.unshift(data);
        }
        estadoPDV.activePedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if ((data.status === 'concluido' || data.status === 'pronto') && !estadoPDV.pedidosProntosNotificados.has(data.id)) {
          notificarPedidoPronto(data);
        }
      }

      localStorage.setItem('cafeteria_cache_pdv_active_pedidos', JSON.stringify(estadoPDV.activePedidos));
      estadoPDV.fn.renderMesasSection?.();
      estadoPDV.fn.renderPedidosCards?.();
      estadoPDV.fn.updateProntosBadge?.();
      estadoPDV.fn.updateMesaSelectOptions?.();
    } catch (err) {
      console.warn('[PDV Incremental] Falha:', err);
    }
  }

  function schedulePdvIncrementalFetch(pedidoId) {
    if (!pedidoId) return;
    const fetches = estadoPDV.timers.pendingPdvPedidoFetches;
    if (fetches.has(pedidoId)) {
      clearTimeout(fetches.get(pedidoId));
    }
    const timerId = setTimeout(() => {
      fetches.delete(pedidoId);
      fetchPdvPedidoIncremental(pedidoId);
    }, 300);
    fetches.set(pedidoId, timerId);
  }

  function debouncedLoadActivePedidos() {
    if (estadoPDV.timers.fetch) clearTimeout(estadoPDV.timers.fetch);
    estadoPDV.timers.fetch = setTimeout(() => {
      estadoPDV.fn.loadActivePedidos?.();
    }, 300);
  }

  function updateConnectionStatus(isConnected) {
    estadoPDV.isPdvOnline = isConnected;
    const indicator = document.getElementById('conn-status-indicator') || document.querySelector('.status-indicator');
    const dot = document.getElementById('conn-pulse-dot') || (indicator ? indicator.querySelector('.pulse-dot') : null);
    const text = document.getElementById('conn-status-text') || (indicator ? indicator.querySelector('.status-text') : null);

    const banner = document.getElementById('banner-offline-alert');
    const bannerIcon = document.getElementById('banner-offline-icon');
    const bannerText = document.getElementById('banner-offline-text');

    if (isConnected) {
      if (dot) dot.style.backgroundColor = '#4CAF50';
      if (text) { text.textContent = 'Conectado'; text.style.color = '#fff'; }

      if (estadoPDV.wasOffline && banner) {
        if (estadoPDV.timers.onlineToast) clearTimeout(estadoPDV.timers.onlineToast);
        banner.classList.remove('hidden', 'offline');
        banner.classList.add('online');
        if (bannerIcon) bannerIcon.textContent = '✓';
        if (bannerText) bannerText.textContent = 'Conexão restabelecida. Sincronizando pedidos pendentes...';

        estadoPDV.timers.onlineToast = setTimeout(() => {
          banner.classList.add('hidden');
          banner.classList.remove('online');
        }, 4000);
      } else if (banner && !estadoPDV.wasOffline) {
        banner.classList.add('hidden');
        banner.classList.remove('offline', 'online');
      }
      estadoPDV.wasOffline = false;
    } else {
      estadoPDV.wasOffline = true;
      if (estadoPDV.timers.onlineToast) clearTimeout(estadoPDV.timers.onlineToast);
      if (dot) dot.style.backgroundColor = '#e74c3c';
      if (text) { text.textContent = 'Modo Offline'; text.style.color = '#e74c3c'; }

      if (banner) {
        banner.classList.remove('hidden', 'online');
        banner.classList.add('offline');
        if (bannerIcon) bannerIcon.textContent = '⚡';
        if (bannerText) bannerText.textContent = 'Sem internet. O sistema continua operando offline e salvará seus pedidos.';
      }
    }
    estadoPDV.fn.atualizarModoConexaoCarrinho?.();
  }

  function setupRealtime() {
    window.cafeteriaSupabase.channel('pedidos-barista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
        const statusNovo = payload.new && payload.new.status;
        const statusAntigo = payload.old && payload.old.status;
        if (statusNovo === 'aguardando_aprovacao' || statusAntigo === 'aguardando_aprovacao') {
          loadPedidosClienteAguardando();
        }

        if (payload.eventType === 'UPDATE') {
          const isProntoAgora = payload.new && (payload.new.status === 'concluido' || payload.new.status === 'pronto');
          const eraProntoAntes = payload.old && (payload.old.status === 'concluido' || payload.old.status === 'pronto');
          if (isProntoAgora && !eraProntoAntes && !estadoPDV.pedidosProntosNotificados.has(payload.new.id)) {
            notificarPedidoPronto(payload.new);
          }
        }
        if (payload.eventType === 'DELETE') {
          const pId = payload.old && payload.old.id;
          if (pId) {
            const idx = estadoPDV.activePedidos.findIndex(p => p.id === pId);
            if (idx >= 0) {
              estadoPDV.activePedidos.splice(idx, 1);
              estadoPDV.fn.renderMesasSection?.();
              estadoPDV.fn.renderPedidosCards?.();
              estadoPDV.fn.updateProntosBadge?.();
              estadoPDV.fn.updateMesaSelectOptions?.();
            }
          }
        } else {
          const pId = payload.new && payload.new.id;
          if (pId) {
            schedulePdvIncrementalFetch(pId);
          } else {
            debouncedLoadActivePedidos();
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, payload => {
        const pId = (payload.new && payload.new.pedido_id) || (payload.old && payload.old.pedido_id);
        if (pId) {
          schedulePdvIncrementalFetch(pId);
        } else {
          debouncedLoadActivePedidos();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_chamados' }, () => {
        loadChamadosMesa();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produtos' }, () => {
        estadoPDV.fn.loadProdutos?.();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          updateConnectionStatus(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          updateConnectionStatus(false);
        }
      });
  }

  window.addEventListener('online', () => {
    updateConnectionStatus(true);
    debouncedLoadActivePedidos();
    estadoPDV.fn.loadInitialData?.();
    estadoPDV.fn.processarFilaOffline?.();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      estadoPDV.lastPdvHiddenTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      const ocultaMs = estadoPDV.lastPdvHiddenTime ? (Date.now() - estadoPDV.lastPdvHiddenTime) : 0;
      if (ocultaMs > 60000) {
        debouncedLoadActivePedidos();
      }
      if (navigator.onLine) estadoPDV.fn.processarFilaOffline?.();
    }
  });

  definirGlobalPDV('baristaRecusarPedidoCliente', recusarPedidoCliente);
  definirGlobalPDV('baristaChamarPedido', function (numeroOuId, mesaCodigo, clienteNome, paraViagem) {
    if (!isSomAtivo()) {
      showToast('🔕 Modo silencioso ativo. Ative o som no topo para chamar por voz.');
      return;
    }
    if (typeof numeroOuId === 'number' && !mesaCodigo && !clienteNome) {
      const pedido = estadoPDV.activePedidos.find(p => p.id === numeroOuId);
      if (pedido) {
        return chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    }
    chamarPedidoVoz(numeroOuId, mesaCodigo, clienteNome, paraViagem);
  });

  estadoPDV.fn.loadPedidosClienteAguardando = loadPedidosClienteAguardando;
  estadoPDV.fn.loadChamadosMesa = loadChamadosMesa;
  estadoPDV.fn.renderTriagemPedidosCliente = renderTriagemPedidosCliente;
  estadoPDV.fn.renderChamadosMesa = renderChamadosMesa;
  estadoPDV.fn.updateConnectionStatus = updateConnectionStatus;
  estadoPDV.fn.initSoundAndNotificationSystem = initSoundAndNotificationSystem;
  estadoPDV.fn.notificarPedidoPronto = notificarPedidoPronto;
  estadoPDV.fn.chamarPedidoVoz = chamarPedidoVoz;
  estadoPDV.fn.setupRealtime = setupRealtime;
}
