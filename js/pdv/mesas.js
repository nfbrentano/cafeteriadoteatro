/* =========================================================
   PDV — MESAS, ACOMPANHAMENTO DE PEDIDOS & TRANSFERÊNCIAS
   ========================================================= */

import { estadoPDV, definirGlobalPDV } from './estado.js';

export function registrarMesasPDV() {
  const {
    mesaSelect,
    btnMesaTrigger,
    mesaTriggerText,
    modalSelecionarMesa,
    modalSelecionarMesaClose,
    gridSelecaoMesas,
    btnSelecionarBalcao,
    btnLimparMesa,
    pedidoParaViagem,
    cartMesaBadge,
    badgeProntos,
    mesasGrid,
    pedidosCardsGrid,
    filtroChips,
    filtroEscopoChips,
    viewMesas,
    ptrIndicator,
    modalMesa,
    modalMesaTitle,
    modalMesaBody,
    modalMesaClose,
    modalMesaFechar,
    modalMesaFecharConta,
    btnMesaTransferir,
    btnMesaJuntar,
    modalTransferirMesa,
    modalTransferirTitle,
    selectTransferirMesa,
    btnTransferirClose,
    btnTransferirCancel,
    btnTransferirConfirm,
    btnMesaAdicionarItens,
    btnMesaRepetirRodada,
    bannerAdicionandoItens,
    lblMesaAdicionando,
    btnCancelarAdicao,
    btnMesaMaisAcoes,
    sheetMesaAcoes,
    btnMesaSheetClose,
    backdropMesaSheet
  } = estadoPDV.refs;

  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);
  const confirmAction = (...args) => (window.showConfirm || estadoPDV.fn.showConfirm)?.(...args);

  function updateMesaTriggerUI() {
    if (!btnMesaTrigger || !mesaTriggerText) return;
    const val = mesaSelect ? mesaSelect.value : '';
    const isViagem = pedidoParaViagem && pedidoParaViagem.checked;

    if (mesaSelect && mesaSelect.disabled) {
      btnMesaTrigger.disabled = true;
    } else {
      btnMesaTrigger.disabled = false;
    }

    if (val) {
      const m = estadoPDV.mesas.find(item => item.codigo === val);
      const desc = m && m.descricao ? ` (${m.descricao})` : '';
      mesaTriggerText.textContent = `Mesa ${val}${desc}`;
      btnMesaTrigger.classList.add('has-mesa');
      if (cartMesaBadge) cartMesaBadge.textContent = val;
    } else if (isViagem) {
      mesaTriggerText.textContent = '🥡 Balcão / Viagem';
      btnMesaTrigger.classList.add('has-mesa');
      if (cartMesaBadge) cartMesaBadge.textContent = '🥡 Viagem';
    } else {
      mesaTriggerText.textContent = 'Selecione a Mesa...';
      btnMesaTrigger.classList.remove('has-mesa');
      if (cartMesaBadge) cartMesaBadge.textContent = 'Sem Mesa';
    }
  }

  function closeModalSelecaoMesa() {
    if (modalSelecionarMesa) {
      modalSelecionarMesa.classList.add('hidden');
      if (btnMesaTrigger) btnMesaTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  function selecionarMesaViaGrid(codigo, isOcupada) {
    if (mesaSelect) {
      mesaSelect.value = codigo;
      mesaSelect.dispatchEvent(new Event('change'));
    }
    if (pedidoParaViagem) {
      pedidoParaViagem.checked = false;
    }
    updateMesaTriggerUI();
    closeModalSelecaoMesa();

    if (navigator.vibrate) {
      navigator.vibrate(isOcupada ? [20, 50, 20] : 15);
    }

    if (isOcupada) {
      const banner = document.getElementById('banner-adicionando-itens');
      if (banner && lblMesaAdicionando) {
        lblMesaAdicionando.textContent = codigo;
        banner.classList.remove('hidden');
      }
    }
  }

  function renderMesaSelectionGrid() {
    if (!gridSelecaoMesas) return;
    gridSelecaoMesas.innerHTML = '';

    if (!estadoPDV.mesas || estadoPDV.mesas.length === 0) {
      gridSelecaoMesas.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">Nenhuma mesa cadastrada.</div>';
      return;
    }

    const currentVal = mesaSelect ? mesaSelect.value : '';

    estadoPDV.mesas.forEach(m => {
      const pedidosMesa = estadoPDV.activePedidos.filter(p => p.mesa_codigo === m.codigo);
      const isOcupada = pedidosMesa.length > 0;
      const isSelected = currentVal === m.codigo;
      const totalMesa = pedidosMesa.reduce((acc, p) => acc + Number(p.total || 0), 0);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mesa-btn-card ${isOcupada ? 'is-ocupada' : 'is-livre'} ${isSelected ? 'is-selected' : ''}`;
      btn.setAttribute('data-mesa', m.codigo);
      btn.innerHTML = `
        <div class="mesa-btn-card__top">
          <span class="mesa-btn-card__code">${m.codigo}</span>
          <span class="mesa-btn-card__tag ${isOcupada ? 'tag-ocupada' : 'tag-livre'}">${isOcupada ? 'Ocupada' : 'Livre'}</span>
        </div>
        <div class="mesa-btn-card__desc" title="${m.descricao || ''}">${m.descricao || 'Mesa'}</div>
        <div class="mesa-btn-card__footer">
          ${isOcupada ? `<strong>${pedidosMesa.length} ped.</strong> · R$ ${totalMesa.toFixed(2).replace('.', ',')}` : 'Toque p/ abrir'}
        </div>
      `;

      btn.onclick = () => {
        selecionarMesaViaGrid(m.codigo, isOcupada);
      };

      gridSelecaoMesas.appendChild(btn);
    });
  }

  function openModalSelecaoMesa() {
    if (mesaSelect && mesaSelect.disabled) return;
    renderMesaSelectionGrid();
    if (modalSelecionarMesa) {
      modalSelecionarMesa.classList.remove('hidden');
      if (btnMesaTrigger) btnMesaTrigger.setAttribute('aria-expanded', 'true');
    }
  }

  function updateMesaSelectOptions() {
    if (!mesaSelect) return;
    const selectedVal = mesaSelect.value;
    mesaSelect.innerHTML = '<option value="">Selecione a Mesa...</option>';

    estadoPDV.mesas.forEach(m => {
      const pedidosMesa = estadoPDV.activePedidos.filter(p => p.mesa_codigo === m.codigo);
      const hasOpen = pedidosMesa.length > 0;
      const opt = document.createElement('option');
      opt.value = m.codigo;
      opt.textContent = `${m.codigo} — ${m.descricao || ''} ${hasOpen ? '🔴 (' + pedidosMesa.length + ' em aberto)' : '🟢 Livre'}`;
      mesaSelect.appendChild(opt);
    });

    if (selectedVal) {
      mesaSelect.value = selectedVal;
    }

    updateMesaTriggerUI();
    renderMesaSelectionGrid();
  }

  async function loadMesas() {
    try {
      const { data: mesasData, error } = await window.cafeteriaSupabase
        .from('mesas')
        .select('*')
        .eq('ativo', true)
        .order('codigo');

      if (!error && mesasData) {
        estadoPDV.mesas = mesasData;
        localStorage.setItem('cafeteria_cache_pdv_mesas', JSON.stringify(mesasData));
        updateMesaSelectOptions();
      } else {
        throw error || new Error('Falha ao carregar mesas');
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando mesas do cache local:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_mesas');
      if (cached) {
        try {
          estadoPDV.mesas = JSON.parse(cached);
          updateMesaSelectOptions();
        } catch {}
      }
    }
  }

  async function loadCortesiasDisponiveis() {
    const { data } = await window.cafeteriaSupabase
      .from('v_cortesias_disponiveis')
      .select('*')
      .gt('saldo_disponivel', 0);
    if (data) estadoPDV.cortesiasDisponiveis = data;
  }

  function updateProntosBadge() {
    if (!badgeProntos) return;
    const prontosCount = estadoPDV.activePedidos.filter(p => p.status === 'concluido').length;
    if (prontosCount > 0) {
      badgeProntos.textContent = `${prontosCount} pronto${prontosCount > 1 ? 's' : ''}`;
      badgeProntos.classList.remove('hidden');
    } else {
      badgeProntos.classList.add('hidden');
    }
  }

  async function loadActivePedidos() {
    try {
      const inicioDoDia = (window.datasSP && window.datasSP.inicioDoDiaSP)
        ? window.datasSP.inicioDoDiaSP()
        : window.getInicioDoDiaSaoPaulo();
      const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const filtroAtivos = [
        'status.in.(pendente,em_preparo,aguardando_pagamento,pronto)',
        `and(status.in.(concluido,entregue),created_at.gte.${inicioDoDia})`,
        `and(status_pagamento.eq.pendente,status.not.in.(cancelado,finalizado),created_at.gte.${doisDiasAtras})`
      ].join(',');

      const { data, error } = await window.cafeteriaSupabase
        .from('pedidos')
        .select(`
          *,
          pedido_itens (
            *,
            pedido_item_adicionais (*)
          )
        `)
        .or(filtroAtivos)
        .order('created_at', { ascending: false });

      if (!error && data) {
        if (estadoPDV.pedidosProntosNotificados.size > 0) {
          data.forEach(p => {
            if ((p.status === 'concluido' || p.status === 'pronto') && !estadoPDV.pedidosProntosNotificados.has(p.id)) {
              estadoPDV.fn.notificarPedidoPronto?.(p);
            }
          });
        } else {
          data.forEach(p => {
            if (p.status === 'concluido' || p.status === 'pronto') {
              estadoPDV.pedidosProntosNotificados.add(p.id);
            }
          });
        }
        estadoPDV.activePedidos = data;
        localStorage.setItem('cafeteria_cache_pdv_active_pedidos', JSON.stringify(data));
        await loadCortesiasDisponiveis();
        renderMesasSection();
        renderPedidosCards();
        updateProntosBadge();
        updateMesaSelectOptions();
        await Promise.all([
          estadoPDV.fn.loadPedidosClienteAguardando?.(),
          estadoPDV.fn.loadChamadosMesa?.()
        ]);
      }
    } catch (e) {
      console.warn('[PDV Cache] Falha ao carregar pedidos ativos:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_active_pedidos');
      if (cached) {
        try {
          estadoPDV.activePedidos = JSON.parse(cached);
          renderMesasSection();
          renderPedidosCards();
          updateProntosBadge();
          updateMesaSelectOptions();
        } catch {}
      }
    }
  }

  function renderMesasSection() {
    if (!mesasGrid) return;
    mesasGrid.innerHTML = '';

    const calcularSaldoPedidoMesa = (p) => {
      if (p.status_pagamento === 'pago') return 0;
      const pagoItens = (p.pedido_itens || []).reduce((acc, it) => {
        if (it.cancelado) return acc;
        return acc + (Number(it.quantidade_paga || 0) * Number(it.preco_unitario || 0));
      }, 0);
      return Math.max(0, Number(p.total || 0) - pagoItens);
    };

    estadoPDV.mesas.forEach(mesa => {
      const pedidosMesa = estadoPDV.activePedidos.filter(p => p.mesa_codigo === mesa.codigo);
      const pedidosAbertosMesa = pedidosMesa.filter(p => calcularSaldoPedidoMesa(p) > 0.001);
      const ocupada = pedidosAbertosMesa.length > 0;
      const totalMesa = pedidosAbertosMesa.reduce((acc, p) => acc + calcularSaldoPedidoMesa(p), 0);

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
          if (mesaSelect) mesaSelect.value = mesa.codigo;
          if (cartMesaBadge) cartMesaBadge.textContent = mesa.codigo;
          updateMesaTriggerUI();
          estadoPDV.fn.switchTab?.('novo');
        }
      };

      mesasGrid.appendChild(card);
    });
  }

  function renderPedidosCards() {
    if (!pedidosCardsGrid) return;
    pedidosCardsGrid.innerHTML = '';

    let list = estadoPDV.activePedidos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado');

    if (estadoPDV.currentFilterScope === 'meus') {
      const myId = estadoPDV.currentUser ? estadoPDV.currentUser.id : null;
      if (myId) {
        list = list.filter(p => p.usuario_id === myId || p.criado_por === myId);
      }
    }

    const agoraMs = Date.now();
    if (estadoPDV.currentFilterStatus === 'agendado') {
      list = list.filter(p => p.retirada_em && (new Date(p.retirada_em).getTime() - agoraMs > 20 * 60 * 1000));
    } else if (estadoPDV.currentFilterStatus !== 'todos') {
      list = list.filter(p => p.status === estadoPDV.currentFilterStatus);
    }

    if (list.length === 0) {
      const msgVazio = estadoPDV.currentFilterScope === 'meus'
        ? 'Você não possui pedidos ativos nesta categoria.'
        : 'Nenhum pedido nesta categoria.';
      pedidosCardsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1; text-align:center; padding:30px; color:#888;">${msgVazio}</div>`;
      return;
    }

    list.forEach(pedido => {
      const isPronto = pedido.status === 'concluido' || pedido.status === 'pronto';
      const isAgendadoDistante = Boolean(pedido.retirada_em && (new Date(pedido.retirada_em).getTime() - agoraMs > 20 * 60 * 1000) && pedido.status === 'pendente');
      const statusLabel = isAgendadoDistante
        ? '📅 Agendado (Aguardando Horário)'
        : ({
            'aguardando_pagamento': '🖥️ Totem (Aguardando Pagamento)',
            'pendente': '🟡 Na Fila (Pendente)',
            'em_preparo': '🔵 Em Preparo',
            'concluido': '🟢 PRONTO P/ SERVIR!',
            'pronto': '🟢 PRONTO P/ SERVIR!'
          }[pedido.status] || pedido.status);

      const isPrioritario = pedido.prioridade === 1;
      const prioridadeTag = isPrioritario
        ? `<span class="badge-prioridade-pdv" title="Motivo: ${window.escapeHtml(pedido.prioridade_motivo || 'Urgência')}">⚡ ${window.escapeHtml(pedido.prioridade_motivo || 'PRIORIDADE')}</span>`
        : '';
      const btnPrioridadeHtml = `
        <button class="btn-toggle-prioridade ${isPrioritario ? 'is-active' : ''}" 
                data-action="barista-toggle-prioridade"
                data-pedido-id="${pedido.id}" 
                title="${isPrioritario ? 'Remover prioridade' : 'Marcar como prioritário'}">
          ⚡ ${isPrioritario ? 'Prioritário' : 'Priorizar'}
        </button>
      `;

      const card = document.createElement('div');
      card.className = `pedido-card-barista ${isPronto ? 'pronto' : ''} ${isPrioritario ? 'prioritario' : ''}`;
      card.setAttribute('data-pedido-id', pedido.id);
      if (pedido.mesa_codigo) card.setAttribute('data-mesa-codigo', pedido.mesa_codigo);

      let itensHtml = '';
      (pedido.pedido_itens || []).forEach(item => {
        let adicHtml = '';
        if (item.pedido_item_adicionais && item.pedido_item_adicionais.length > 0) {
          adicHtml = item.pedido_item_adicionais.map(ad =>
            `<div style="font-size:12px; color:#666; margin-left:14px;">+ ${window.escapeHtml(ad.nome_adicional || ad.nome)}</div>`
          ).join('');
        }

        itensHtml += `
          <div class="pedido-card-barista__item">
            <span><strong>${item.quantidade}x</strong> ${window.escapeHtml(item.nome_produto)} ${item.observacoes ? '<em style="color:#D97706">(' + window.escapeHtml(item.observacoes) + ')</em>' : ''}</span>
            ${adicHtml}
          </div>
        `;
      });

      const isOnlineOuRetirada = pedido.origem === 'online' || pedido.origem === 'online_retirada' || pedido.mesa_codigo === 'RETIRADA';
      const btnWhatsappPronto = (pedido.cliente_telefone)
        ? `<button type="button" class="btn-ghost-small btn-whatsapp-pronto" data-action="barista-whatsapp-pronto" data-pedido-id="${pedido.id}" title="Avisar cliente pelo WhatsApp">
            📲 WhatsApp
           </button>`
        : '';
      const btnNaoRetirado = isOnlineOuRetirada
        ? `<button type="button" class="btn-ghost-small btn-nao-retirado" data-action="barista-nao-retirado" data-pedido-id="${pedido.id}" title="Marcar pedido como não retirado pelo cliente">
            🚫 Não retirado
           </button>`
        : '';

      let btnAcaoHtml = '';
      if (pedido.status === 'aguardando_pagamento') {
        btnAcaoHtml = `
          <div class="pedido-card-barista__actions" style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn-entregar btn-receber-totem" data-action="barista-receber-totem" data-pedido-id="${pedido.id}">
              💰 Receber & Enviar à Cozinha
            </button>
          </div>
        `;
      } else if (isPronto) {
        btnAcaoHtml = `
          <div class="pedido-card-barista__actions" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            ${btnWhatsappPronto}
            <button class="btn-chamar-voz" data-pedido-id="${pedido.id}" title="Fazer chamada por voz">
              📢 Chamar
            </button>
            <button class="btn-entregar" data-action="barista-marcar-entregue" data-pedido-id="${pedido.id}">
              ✅ Entregue
            </button>
            ${btnNaoRetirado}
          </div>`;
      } else {
        btnAcaoHtml = `
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            ${btnWhatsappPronto}
            ${btnNaoRetirado}
            <span style="font-size:12px; color:#888;">Operador: ${pedido.criado_por_nome || (isOnlineOuRetirada ? 'Online' : 'Barista')}</span>
          </div>
        `;
      }

      const viagemTag = pedido.para_viagem ? `<span style="background:#fff3cd; color:#856404; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:8px; font-weight:bold;">🥡 VIAGEM</span>` : '';
      let retiradaTag = '';
      if (pedido.retirada_em) {
        const dt = new Date(pedido.retirada_em);
        const retFmt = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        retiradaTag = `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:6px; font-weight:bold;">🕒 Retirada: ${retFmt}</span>`;
      }
      const nomeClienteHtml = pedido.cliente_nome ? `<div style="font-size:14px; font-weight:bold; color:var(--marrom-escuro); margin-top:4px;">${window.escapeHtml(pedido.cliente_nome)} ${pedido.cliente_telefone ? `<small style="font-weight:normal; color:#64748b;">(${pedido.cliente_telefone})</small>` : ''}</div>` : '';

      card.innerHTML = `
        <div class="pedido-card-barista__header">
          <span class="pedido-card-barista__mesa">${pedido.mesa_codigo} (Pedido #${pedido.numero_pedido || pedido.id})${viagemTag}${retiradaTag} ${prioridadeTag}</span>
          <span class="pedido-card-barista__status status-chip--${isPronto ? 'pronto' : pedido.status === 'em_preparo' ? 'preparo' : 'pendente'}">
            ${statusLabel}
          </span>
        </div>
        ${nomeClienteHtml}
        <div class="pedido-card-barista__itens">
          ${itensHtml}
        </div>
        <div class="pedido-card-barista__footer">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:14px;">Total: R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}</span>
            ${btnPrioridadeHtml}
          </div>
          ${btnAcaoHtml}
        </div>
      `;

      const podeEntregar = isPronto || pedido.status === 'pronto' || pedido.status === 'concluido';
      if (window.SwipeAction && typeof window.SwipeAction.bindSwipeRight === 'function' && podeEntregar) {
        window.SwipeAction.bindSwipeRight(card, () => {
          window.baristaMarcarEntregue(pedido.id);
        });
      }

      pedidosCardsGrid.appendChild(card);
    });
  }

  function fecharSheetMesaAcoes() {
    if (sheetMesaAcoes) {
      sheetMesaAcoes.classList.add('hidden');
    }
    if (btnMesaMaisAcoes) {
      btnMesaMaisAcoes.setAttribute('aria-expanded', 'false');
    }
  }

  function abrirSheetMesaAcoes() {
    if (sheetMesaAcoes) {
      sheetMesaAcoes.classList.remove('hidden');
      if (btnMesaMaisAcoes) btnMesaMaisAcoes.setAttribute('aria-expanded', 'true');
      const firstBtn = sheetMesaAcoes.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }
  }

  function abrirModalMesa(mesaCodigo, pedidosMesa) {
    estadoPDV.currentSelectedMesaParaConta = { mesaCodigo, pedidosMesa };
    if (modalMesaTitle) modalMesaTitle.textContent = `Consumo Atual: ${mesaCodigo}`;

    let total = 0;
    let jaPagoMesa = 0;
    let html = '<div style="display:flex; flex-direction:column; gap:12px;">';

    pedidosMesa.forEach(p => {
      total += Number(p.total || 0);
      if (p.status_pagamento === 'pago') {
        jaPagoMesa += Number(p.total || 0);
      }
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
        const disponiveis = estadoPDV.cortesiasDisponiveis.filter(c => c.pedido_item_origem_id === it.id);
        if (disponiveis.length > 0) {
          disponiveis.forEach(d => {
            const prod = estadoPDV.allProducts.find(pr => pr.id === d.produto_cortesia_id);
            if (prod) {
              cortesiaHtml += `<button class="btn-ghost-small btn-cortesia-item" data-action="barista-lancar-cortesia" data-pedido-id="${p.id}" data-item-id="${it.id}" data-produto-id="${window.escapeHtml(prod.id)}" title="Lançar ${window.escapeHtml(prod.nome)} como cortesia">🎁 ${window.escapeHtml(prod.nome)} (${d.saldo_disponivel})</button>`;
            }
          });
        }

        const cancelClass = it.cancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
        const cancelLabel = it.cancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
        let btnCancelarItemHtml = '';
        if (!it.cancelado && p.status !== 'concluido' && p.status !== 'cancelado') {
          btnCancelarItemHtml = `<button class="btn-ghost-small btn-cancelar-item" data-action="barista-cancelar-item" data-item-id="${it.id}" data-pedido-id="${p.id}" data-mesa-codigo="${window.escapeHtml(estadoPDV.currentSelectedMesaParaConta.mesaCodigo || '')}">✕ Cancelar</button>`;
        }

        const obsLabel = it.observacoes ? `<em style="color:#D97706">(${window.escapeHtml(it.observacoes)})</em>` : '';

        const qtdPaga = Number(it.quantidade_paga || 0);
        const qtdTotal = Number(it.quantidade || 0);
        let badgePagoItem = '';
        if (!it.cancelado) {
          if (qtdPaga >= qtdTotal && qtdTotal > 0) {
            badgePagoItem = '<span class="badge-item-pago" style="background:#e8f8f5; color:#27ae60; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px; margin-left:6px;">Pago ✓</span>';
            if (p.status_pagamento !== 'pago') {
              jaPagoMesa += (qtdTotal * Number(it.preco_unitario || 0));
            }
          } else if (qtdPaga > 0) {
            badgePagoItem = `<span class="badge-item-parcial" style="background:#fef9e7; color:#d35400; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px; margin-left:6px;">${qtdPaga}/${qtdTotal} Pago</span>`;
            if (p.status_pagamento !== 'pago') {
              jaPagoMesa += (qtdPaga * Number(it.preco_unitario || 0));
            }
          }
        }

        html += `<li ${cancelClass}>${it.quantidade}x ${window.escapeHtml(it.nome_produto)} ${obsLabel} — R$ ${(it.quantidade * it.preco_unitario).toFixed(2).replace('.', ',')} ${badgePagoItem} ${cancelLabel} ${btnCancelarItemHtml} ${adicText} ${cortesiaHtml}</li>`;
      });

      html += '</ul></div>';
    });

    const saldoRestanteMesa = Math.max(0, total - jaPagoMesa);

    html += `
      <div style="text-align:right; margin-top:10px;">
        <div style="font-size:14px; color:#666;">SUBTOTAL GERAL: R$ ${total.toFixed(2).replace('.', ',')}</div>
        ${jaPagoMesa > 0 ? `<div style="font-size:14px; color:#27ae60; font-weight:bold;">(-) JÁ AMORTIZADO: R$ ${jaPagoMesa.toFixed(2).replace('.', ',')}</div>` : ''}
        <div style="font-size:18px; font-weight:bold; color:var(--marrom-escuro); margin-top:4px;">
          SALDO A PAGAR: R$ ${saldoRestanteMesa.toFixed(2).replace('.', ',')}
        </div>
      </div>
    </div>`;

    if (modalMesaBody) modalMesaBody.innerHTML = html;
    modalMesa?.classList.remove('hidden');
  }

  function fecharModalMesa() {
    modalMesa?.classList.add('hidden');
    fecharSheetMesaAcoes();
    estadoPDV.currentSelectedMesaParaConta = null;
  }

  function resetarModoAdicao() {
    estadoPDV.pedidoOrigemIdAdicao = null;
    if (mesaSelect) mesaSelect.disabled = false;
    if (bannerAdicionandoItens) bannerAdicionandoItens.classList.add('hidden');
    if (lblMesaAdicionando) lblMesaAdicionando.textContent = '';
    updateMesaTriggerUI();
  }

  async function abrirModalTransferencia(acao, mesaBase) {
    estadoPDV.acaoTransferenciaAtiva = acao;
    estadoPDV.mesaAlvoTransferencia = mesaBase;

    if (modalTransferirTitle) {
      modalTransferirTitle.textContent = acao === 'transferir'
        ? `Transferir pedidos da mesa ${mesaBase} para:`
        : `Juntar pedidos de outra mesa à mesa ${mesaBase}:`;
    }

    if (selectTransferirMesa) selectTransferirMesa.innerHTML = '<option value="">Carregando mesas...</option>';
    modalTransferirMesa?.classList.remove('hidden');

    try {
      const { data: mesasList, error } = await window.cafeteriaSupabase
        .from('mesas')
        .select('codigo')
        .eq('ativo', true)
        .order('codigo');

      if (error) throw error;

      if (selectTransferirMesa) {
        selectTransferirMesa.innerHTML = '<option value="">Selecione...</option>';
        mesasList.forEach(m => {
          if (m.codigo !== mesaBase) {
            const opt = document.createElement('option');
            opt.value = m.codigo;
            opt.textContent = m.codigo;
            selectTransferirMesa.appendChild(opt);
          }
        });
      }
    } catch (err) {
      console.error('Erro ao buscar mesas:', err);
      if (selectTransferirMesa) selectTransferirMesa.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  function fecharModalTransferencia() {
    modalTransferirMesa?.classList.add('hidden');
    estadoPDV.acaoTransferenciaAtiva = null;
    estadoPDV.mesaAlvoTransferencia = null;
    if (selectTransferirMesa) selectTransferirMesa.value = '';
  }

  // Listeners de Mesa / Seleção / Filtros / Transferência
  if (mesaSelect) {
    mesaSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (cartMesaBadge) cartMesaBadge.textContent = val ? val : (pedidoParaViagem && pedidoParaViagem.checked ? '🥡 Viagem' : 'Sem Mesa');
      updateMesaTriggerUI();
      renderMesaSelectionGrid();
      estadoPDV.fn.checkFormValidity?.();
      estadoPDV.fn.salvarRascunhoCarrinho?.();
    });
  }

  if (btnMesaTrigger) btnMesaTrigger.addEventListener('click', openModalSelecaoMesa);
  if (cartMesaBadge) {
    cartMesaBadge.style.cursor = 'pointer';
    cartMesaBadge.title = 'Toque para selecionar a mesa';
    cartMesaBadge.addEventListener('click', openModalSelecaoMesa);
  }
  if (modalSelecionarMesaClose) modalSelecionarMesaClose.addEventListener('click', closeModalSelecaoMesa);
  if (modalSelecionarMesa) {
    modalSelecionarMesa.addEventListener('click', (e) => {
      if (e.target === modalSelecionarMesa) closeModalSelecaoMesa();
    });
  }
  if (btnSelecionarBalcao) {
    btnSelecionarBalcao.addEventListener('click', () => {
      if (mesaSelect) mesaSelect.value = '';
      if (pedidoParaViagem) pedidoParaViagem.checked = true;
      if (mesaSelect) mesaSelect.dispatchEvent(new Event('change'));
      updateMesaTriggerUI();
      closeModalSelecaoMesa();
      if (navigator.vibrate) navigator.vibrate(15);
    });
  }
  if (btnLimparMesa) {
    btnLimparMesa.addEventListener('click', () => {
      if (mesaSelect) mesaSelect.value = '';
      if (pedidoParaViagem) pedidoParaViagem.checked = false;
      if (mesaSelect) mesaSelect.dispatchEvent(new Event('change'));
      updateMesaTriggerUI();
      closeModalSelecaoMesa();
      if (navigator.vibrate) navigator.vibrate(10);
    });
  }

  if (filtroEscopoChips && filtroEscopoChips.length > 0) {
    filtroEscopoChips.forEach(chip => {
      const isSelected = chip.dataset.scope === estadoPDV.currentFilterScope;
      chip.classList.toggle('active', isSelected);
      chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      chip.addEventListener('click', () => {
        filtroEscopoChips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        estadoPDV.currentFilterScope = chip.dataset.scope;
        localStorage.setItem('cafeteria_pedidos_filtro_escopo', estadoPDV.currentFilterScope);
        if (navigator.vibrate) navigator.vibrate(15);
        renderPedidosCards();
      });
    });
  }

  if (filtroChips && filtroChips.length > 0) {
    filtroChips.forEach(chip => {
      const isSelected = chip.classList.contains('active') || chip.dataset.filter === estadoPDV.currentFilterStatus;
      chip.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      chip.addEventListener('click', () => {
        filtroChips.forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        estadoPDV.currentFilterStatus = chip.dataset.filter;
        renderPedidosCards();
      });
    });
  }

  if (viewMesas) {
    viewMesas.addEventListener('touchstart', (e) => {
      if (viewMesas.scrollTop > 0) return;
      estadoPDV.ptrStartY = e.touches[0].clientY;
      estadoPDV.isPulling = true;
    }, { passive: true });

    viewMesas.addEventListener('touchmove', (e) => {
      if (!estadoPDV.isPulling) return;
      estadoPDV.ptrCurrentY = e.touches[0].clientY;
      const dy = estadoPDV.ptrCurrentY - estadoPDV.ptrStartY;

      if (dy > 0 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'none';
          ptrIndicator.style.height = Math.min(dy * 0.5, 60) + 'px';
          ptrIndicator.style.opacity = Math.min(dy / 100, 1);
        }
      }
    }, { passive: true });

    viewMesas.addEventListener('touchend', async () => {
      if (!estadoPDV.isPulling) return;
      estadoPDV.isPulling = false;
      const dy = estadoPDV.ptrCurrentY - estadoPDV.ptrStartY;
      if (dy > 60 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'height 0.2s, opacity 0.2s';
          ptrIndicator.style.height = '40px';
          ptrIndicator.innerHTML = '<span>↻ Atualizando...</span>';
        }
        await Promise.all([loadActivePedidos(), loadMesas()]);
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

  if (pedidosCardsGrid) {
    pedidosCardsGrid.addEventListener('click', (e) => {
      const btnChamar = e.target.closest('.btn-chamar-voz');
      if (!btnChamar) return;
      const pedidoId = Number(btnChamar.dataset.pedidoId);
      const pedido = estadoPDV.activePedidos.find(p => p.id === pedidoId);
      if (pedido) {
        estadoPDV.fn.chamarPedidoVoz?.(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    });
  }

  if (btnMesaMaisAcoes) {
    btnMesaMaisAcoes.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sheetMesaAcoes && sheetMesaAcoes.classList.contains('hidden')) {
        abrirSheetMesaAcoes();
      } else {
        fecharSheetMesaAcoes();
      }
    });
  }
  if (btnMesaSheetClose) btnMesaSheetClose.addEventListener('click', fecharSheetMesaAcoes);
  if (backdropMesaSheet) backdropMesaSheet.addEventListener('click', fecharSheetMesaAcoes);
  if (sheetMesaAcoes) {
    sheetMesaAcoes.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.id !== 'btn-mesa-sheet-close') {
        fecharSheetMesaAcoes();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetMesaAcoes && !sheetMesaAcoes.classList.contains('hidden')) {
      fecharSheetMesaAcoes();
      if (btnMesaMaisAcoes) btnMesaMaisAcoes.focus();
    }
  });

  [modalMesaClose, modalMesaFechar].filter(Boolean).forEach(b => b.addEventListener('click', fecharModalMesa));

  if (btnCancelarAdicao) {
    btnCancelarAdicao.addEventListener('click', () => {
      estadoPDV.cart = [];
      estadoPDV.fn.limparRascunhoCarrinho?.();
      estadoPDV.fn.renderCart?.();
      resetarModoAdicao();
      if (mesaSelect) mesaSelect.value = '';
      updateMesaTriggerUI();
      estadoPDV.fn.checkFormValidity?.();
      estadoPDV.fn.switchTab?.('mesas');
    });
  }

  if (btnMesaAdicionarItens) {
    btnMesaAdicionarItens.addEventListener('click', () => {
      if (!estadoPDV.currentSelectedMesaParaConta) return;
      const mesa = estadoPDV.currentSelectedMesaParaConta.mesaCodigo;
      const pedidosMesa = estadoPDV.currentSelectedMesaParaConta.pedidosMesa || [];
      const ultimoPedido = pedidosMesa.find(p => p.status !== 'cancelado') || pedidosMesa[0];
      estadoPDV.pedidoOrigemIdAdicao = ultimoPedido ? (ultimoPedido.numero_pedido || ultimoPedido.id) : null;
      fecharModalMesa();

      estadoPDV.fn.switchTab?.('novo');
      if (mesaSelect) {
        mesaSelect.value = mesa;
        mesaSelect.disabled = true;
      }
      if (lblMesaAdicionando) lblMesaAdicionando.textContent = mesa;
      bannerAdicionandoItens?.classList.remove('hidden');

      const badge = document.getElementById('cart-mesa-badge');
      if (badge) badge.textContent = mesa;

      updateMesaTriggerUI();
      estadoPDV.fn.checkFormValidity?.();
    });
  }

  if (btnMesaRepetirRodada) {
    btnMesaRepetirRodada.addEventListener('click', () => {
      if (!estadoPDV.currentSelectedMesaParaConta || !estadoPDV.currentSelectedMesaParaConta.pedidosMesa) return;
      const pedidosValidos = estadoPDV.currentSelectedMesaParaConta.pedidosMesa.filter(p => p.status !== 'cancelado');
      if (pedidosValidos.length === 0) {
        showToast('Nenhum pedido anterior encontrado para repetir.', { tipo: 'warning' });
        return;
      }

      const ultimoPedido = pedidosValidos[0];
      if (!ultimoPedido.pedido_itens || ultimoPedido.pedido_itens.length === 0) {
        showToast('O último pedido não possui itens ativos.', { tipo: 'warning' });
        return;
      }

      const itensClonados = [];
      ultimoPedido.pedido_itens.forEach(it => {
        if (it.cancelado) return;
        const prod = estadoPDV.allProducts.find(p => p.id === it.produto_id) || {
          id: it.produto_id,
          nome: it.nome_produto,
          preco: it.preco_unitario
        };

        const adicionais = (it.pedido_item_adicionais || []).map(ad => {
          return estadoPDV.allAdicionais.find(a => a.id === ad.adicional_id) || {
            id: ad.adicional_id,
            nome: ad.nome_adicional,
            preco: ad.preco_unitario
          };
        });

        itensClonados.push({
          produto: prod,
          quantidade: it.quantidade,
          observacoes: it.observacoes || '',
          adicionaisSelecionados: adicionais,
          sabores: null
        });
      });

      if (itensClonados.length === 0) {
        showToast('Nenhum item válido para repetir.', { tipo: 'warning' });
        return;
      }

      estadoPDV.cart.push(...itensClonados);

      const mesa = estadoPDV.currentSelectedMesaParaConta.mesaCodigo;
      fecharModalMesa();
      estadoPDV.fn.switchTab?.('novo');
      if (mesaSelect) {
        mesaSelect.value = mesa;
        mesaSelect.disabled = true;
      }
      if (lblMesaAdicionando) lblMesaAdicionando.textContent = mesa;
      bannerAdicionandoItens?.classList.remove('hidden');

      const badge = document.getElementById('cart-mesa-badge');
      if (badge) badge.textContent = mesa;

      updateMesaTriggerUI();
      estadoPDV.fn.renderCart?.();
      estadoPDV.fn.openCartDrawer?.();

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([15, 60, 15]); } catch (_) {}
      }

      showToast(`Rodada da ${mesa} copiada para o carrinho!`, { tipo: 'success' });
    });
  }

  if (modalMesaFecharConta) {
    modalMesaFecharConta.addEventListener('click', () => {
      if (!estadoPDV.currentSelectedMesaParaConta) return;
      estadoPDV.fn.abrirModalFecharConta?.(
        estadoPDV.currentSelectedMesaParaConta.mesaCodigo,
        estadoPDV.currentSelectedMesaParaConta.pedidosMesa
      );
    });
  }

  if (btnMesaTransferir) {
    btnMesaTransferir.addEventListener('click', () => {
      if (!estadoPDV.currentSelectedMesaParaConta) return;
      abrirModalTransferencia('transferir', estadoPDV.currentSelectedMesaParaConta.mesaCodigo);
    });
  }

  if (btnMesaJuntar) {
    btnMesaJuntar.addEventListener('click', () => {
      if (!estadoPDV.currentSelectedMesaParaConta) return;
      abrirModalTransferencia('juntar', estadoPDV.currentSelectedMesaParaConta.mesaCodigo);
    });
  }

  [btnTransferirClose, btnTransferirCancel].filter(Boolean).forEach(b => b.addEventListener('click', fecharModalTransferencia));

  if (btnTransferirConfirm) {
    btnTransferirConfirm.addEventListener('click', async () => {
      const mesaSelecionada = selectTransferirMesa.value;
      if (!mesaSelecionada) {
        showToast('Por favor, selecione uma mesa.', { tipo: 'warning' });
        return;
      }

      let pOrigem, pDestino;
      if (estadoPDV.acaoTransferenciaAtiva === 'transferir') {
        pOrigem = estadoPDV.mesaAlvoTransferencia;
        pDestino = mesaSelecionada;
      } else {
        pOrigem = mesaSelecionada;
        pDestino = estadoPDV.mesaAlvoTransferencia;
      }

      try {
        btnTransferirConfirm.disabled = true;
        btnTransferirConfirm.textContent = 'Processando...';

        const { error } = await window.cafeteriaSupabase.rpc('transferir_mesa', {
          p_origem: pOrigem,
          p_destino: pDestino
        });

        if (error) throw error;

        window.showToast('Operação realizada com sucesso!', { tipo: 'success' });
        fecharModalTransferencia();
        fecharModalMesa();
        loadActivePedidos();
        loadMesas();
      } catch (err) {
        console.error('Erro ao transferir:', err);
        showToast('Erro ao transferir pedidos: ' + err.message, { tipo: 'error' });
      } finally {
        btnTransferirConfirm.disabled = false;
        btnTransferirConfirm.textContent = 'Confirmar';
      }
    });
  }

  // Handlers Globais de Pedidos & Mesas (Allowlist)
  definirGlobalPDV('baristaCancelarItem', async function (itemId, pedidoId, mesaCodigo) {
    let motivo = null;

    if (!estadoPDV.fn.usuarioTemPermissao?.('pdv.cancelar_item')) {
      const auth = await estadoPDV.fn.pedirAutorizacaoPin?.(
        'pdv.cancelar_item',
        `Cancelamento do item #${itemId} do Pedido #${pedidoId}`,
        { pedido_id: pedidoId, item_id: itemId, mesa_codigo: mesaCodigo }
      );
      if (!auth) {
        showToast('Cancelamento não autorizado por supervisor.', { tipo: 'warning' });
        return;
      }
      motivo = auth.motivo || null;
    }

    if (!motivo) {
      motivo = await window.showPromptBottomSheet({
        titulo: 'Cancelar Item do Pedido',
        mensagem: 'Selecione ou informe o motivo do cancelamento:',
        opcoesRapidas: ['Cliente desistiu', 'Lançado errado', 'Produto em falta', 'Troca de item'],
        valorPadrao: '',
        obrigatorio: true
      });
      if (!motivo) return;
    }

    try {
      const { error } = await window.cafeteriaSupabase.rpc('cancelar_item', {
        p_item_id: itemId,
        p_motivo: motivo
      });

      if (error) throw error;

      showToast('Item cancelado com sucesso!', { tipo: 'success' });

      const { data: itens, error: itErr } = await window.cafeteriaSupabase
        .from('pedido_itens')
        .select('cancelado')
        .eq('pedido_id', pedidoId);

      if (!itErr && itens && itens.every(i => i.cancelado === true)) {
        const confirmarCancelarPedido = await window.showConfirmBottomSheet({
          titulo: 'Cancelar Pedido Inteiro?',
          mensagem: 'Todos os itens deste pedido foram cancelados. Deseja cancelar o pedido inteiro também?',
          textoConfirmar: 'Sim, Cancelar Pedido',
          textoCancelar: 'Manter Pedido',
          perigoso: true
        });
        if (confirmarCancelarPedido) {
          await window.cafeteriaSupabase
            .from('pedidos')
            .update({
              status: 'cancelado',
              motivo_cancelamento: 'Todos os itens foram cancelados',
              cancelado_por: estadoPDV.currentUser ? estadoPDV.currentUser.id : null,
              cancelado_por_nome: estadoPDV.currentUser ? (estadoPDV.currentUser.nome || 'Barista') : 'Barista',
              cancelado_em: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', pedidoId);
          showToast('Pedido cancelado com sucesso!', { tipo: 'success' });
        }
      }

      await loadActivePedidos();
      if (estadoPDV.currentSelectedMesaParaConta && estadoPDV.currentSelectedMesaParaConta.mesaCodigo === mesaCodigo) {
        const pd = (window.cafeteriaDadosPainel?.pedidosPendentes || estadoPDV.activePedidos || []).filter(p => p.mesa_codigo === mesaCodigo);
        abrirModalMesa(mesaCodigo, pd);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao cancelar item: ' + err.message, { tipo: 'error' });
    }
  });

  definirGlobalPDV('baristaLancarCortesia', async function (pedidoId, itemId, produtoCortesiaId) {
    const confirmed = await confirmAction('Lançar Cortesia', 'Deseja lançar esta cortesia agora?');
    if (!confirmed) return;

    const payload = [{
      produto_id: produtoCortesiaId,
      quantidade: 1,
      observacoes: 'Cortesia lançada via mesa',
      cortesia_de_item_id: itemId
    }];

    const { error } = await window.cafeteriaSupabase.rpc('adicionar_itens_pedido', {
      p_pedido_id: pedidoId,
      p_itens: payload
    });

    if (error) {
      showToast('Erro ao lançar cortesia: ' + error.message);
    } else {
      fecharModalMesa();
      loadActivePedidos();
    }
  });

  definirGlobalPDV('baristaAvisarWhatsAppPronto', function (pedidoId) {
    const pedido = estadoPDV.activePedidos.find(p => p.id === pedidoId);
    if (!pedido || !pedido.cliente_telefone) return;
    const foneClean = String(pedido.cliente_telefone).replace(/\D/g, '');
    const numPed = pedido.numero_pedido || pedido.id;
    const isPronto = pedido.status === 'concluido' || pedido.status === 'pronto';
    const msg = isPronto
      ? `Olá, ${pedido.cliente_nome || 'Cliente'}! ☕🎉 Seu pedido #${numPed} já está PRONTO para retirada no balcão da Cafeteria do Teatro!`
      : `Olá, ${pedido.cliente_nome || 'Cliente'}! ☕ Sobre o seu pedido #${numPed} na Cafeteria do Teatro: `;
    window.open(`https://wa.me/${foneClean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  });

  definirGlobalPDV('baristaMarcarNaoRetirado', async function (pedidoId) {
    const pedido = estadoPDV.activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const motivo = await window.showPromptBottomSheet({
      titulo: 'Cliente Não Compareceu',
      mensagem: 'Confirmar que o cliente NÃO compareceu para retirar o pedido? Informe observação:',
      opcoesRapidas: ['Não retirado pelo cliente no horário agendado', 'Cliente não atendeu contato', 'Desistência no intervalo'],
      valorPadrao: 'Não retirado pelo cliente no horário agendado',
      obrigatorio: true
    });
    if (motivo === null || !motivo) return;
    try {
      await window.cafeteriaDB.clientePedido.marcarNaoRetirado(pedidoId, motivo);
      showToast('Pedido marcado como não retirado e registrado no histórico do cliente.', 'info');
      await loadActivePedidos();
    } catch (err) {
      console.error('Erro ao marcar como não retirado:', err);
      showToast('Erro: ' + (err.message || err), 'error');
    }
  });

  definirGlobalPDV('baristaReceberPedidoTotem', async function (pedidoId) {
    const pedido = estadoPDV.activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const numPed = pedido.numero_pedido || pedido.id;
    const valorNum = Number(pedido.total || 0);
    const forma = await window.showSelecionarPagamentoTotemSheet({
      numeroPedido: numPed,
      clienteNome: pedido.cliente_nome || 'Totem',
      valor: valorNum,
      formaSugerida: pedido.forma_pagamento || 'pix'
    });
    if (!forma) return;
    const formaInput = forma.trim().toLowerCase();
    const mapaFormas = {
      pix: 'pix',
      dinheiro: 'dinheiro',
      cartao_debito: 'cartao_debito',
      debito: 'cartao_debito',
      cartao_credito: 'cartao_credito',
      credito: 'cartao_credito',
      outros: 'outros'
    };
    const formaNorm = mapaFormas[formaInput] || 'pix';

    if (formaNorm === 'pix' && window.cafeteriaPix) {
      let exibirPix = true;
      if (typeof window.showConfirmBottomSheet === 'function') {
        exibirPix = await window.showConfirmBottomSheet({
          titulo: 'Exibir QR Code Pix?',
          mensagem: 'Deseja exibir o QR Code Pix na tela para o cliente pagar antes de liberar?',
          textoConfirmar: 'Exibir Pix',
          textoCancelar: 'Não, liberar direto'
        });
      }
      if (exibirPix) {
        window.cafeteriaPix.abrirModalClienteTelaCheia({
          valor: valorNum,
          txid: `CAFTOTEM${numPed}`,
          subtitulo: `Totem Senha #${numPed} · ${pedido.cliente_nome || 'Balcão'}`
        });
      }
    }

    try {
      const { error: rpcErr } = await window.cafeteriaSupabase.rpc('receber_pedido_totem', {
        p_pedido_id: pedidoId,
        p_forma_pagamento: formaNorm
      });

      if (rpcErr) {
        const { error } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({
            status: 'pendente',
            forma_pagamento: formaNorm,
            status_pagamento: 'pago',
            updated_at: new Date().toISOString()
          })
          .eq('id', pedidoId);
        if (error) throw error;
      }

      showToast(`Pagamento recebido! Pedido #${numPed} liberado para a cozinha.`, 'success');
      if (window.imprimirCupomPedido) {
        window.imprimirCupomPedido({ ...pedido, status: 'pendente', status_pagamento: 'pago', forma_pagamento: formaNorm }, false);
      }
      await loadActivePedidos();
    } catch (err) {
      console.error('Erro ao receber pedido do totem:', err);
      showToast('Erro ao liberar pedido: ' + err.message, 'error');
    }
  });

  definirGlobalPDV('baristaTogglePrioridade', async function (pedidoId) {
    const pedido = estadoPDV.activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const novaPrioridade = pedido.prioridade === 1 ? 0 : 1;
    let motivo = null;
    if (novaPrioridade === 1) {
      motivo = await window.showPromptBottomSheet({
        titulo: 'Priorizar Pedido',
        mensagem: 'Selecione ou informe o motivo da prioridade:',
        opcoesRapidas: ['Espetáculo', 'Refazer', 'Reclamação', 'Cliente c/ pressa'],
        valorPadrao: pedido.prioridade_motivo || 'Espetáculo',
        obrigatorio: true
      });
      if (motivo === null) return;
      motivo = motivo.trim() || 'Espetáculo';
    }

    pedido.prioridade = novaPrioridade;
    pedido.prioridade_motivo = motivo;
    renderPedidosCards();

    try {
      const { error: errRpc } = await window.cafeteriaSupabase.rpc('alterar_prioridade_pedido', {
        p_pedido_id: pedidoId,
        p_prioridade: novaPrioridade,
        p_motivo: motivo
      });

      if (errRpc) {
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

      showToast(novaPrioridade === 1 ? '⚡ Pedido marcado como prioritário!' : 'Prioridade removida.', 'info');
    } catch (err) {
      console.error('[PDV] Erro ao alternar prioridade:', err);
      showToast('Erro ao atualizar prioridade: ' + err.message, 'error');
      pedido.prioridade = novaPrioridade === 1 ? 0 : 1;
      renderPedidosCards();
    }
  });

  definirGlobalPDV('baristaMarcarEntregue', async function (pedidoId) {
    const payload = {
      status: 'entregue',
      entregue_em: new Date().toISOString(),
      entregue_por: estadoPDV.currentUser.id,
      updated_at: new Date().toISOString()
    };

    const { error } = await window.cafeteriaSupabase
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId);

    if (error) {
      if (window.showToast) window.showToast('Erro ao marcar como entregue: ' + error.message);
      return;
    }

    const p = estadoPDV.activePedidos.find(x => x.id === pedidoId);
    const statusAnterior = p ? p.status : 'pronto';
    if (p) p.status = 'entregue';

    renderPedidosCards();
    updateProntosBadge();

    if (window.showToast) {
      window.showToast('Pedido entregue', 'Desfazer', async () => {
        const { error: errRevert } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({
            status: statusAnterior,
            entregue_em: null,
            entregue_por: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', pedidoId);

        if (errRevert) {
          window.showToast('Erro ao desfazer: ' + errRevert.message);
          return;
        }

        if (p) p.status = statusAnterior;
        renderPedidosCards();
        updateProntosBadge();
      }, 5000);
    }
  });

  estadoPDV.fn.loadMesas = loadMesas;
  estadoPDV.fn.updateMesaSelectOptions = updateMesaSelectOptions;
  estadoPDV.fn.updateMesaTriggerUI = updateMesaTriggerUI;
  estadoPDV.fn.renderMesaSelectionGrid = renderMesaSelectionGrid;
  estadoPDV.fn.selecionarMesaViaGrid = selecionarMesaViaGrid;
  estadoPDV.fn.openModalSelecaoMesa = openModalSelecaoMesa;
  estadoPDV.fn.closeModalSelecaoMesa = closeModalSelecaoMesa;
  estadoPDV.fn.loadActivePedidos = loadActivePedidos;
  estadoPDV.fn.loadCortesiasDisponiveis = loadCortesiasDisponiveis;
  estadoPDV.fn.updateProntosBadge = updateProntosBadge;
  estadoPDV.fn.renderMesasSection = renderMesasSection;
  estadoPDV.fn.renderPedidosCards = renderPedidosCards;
  estadoPDV.fn.abrirModalMesa = abrirModalMesa;
  estadoPDV.fn.fecharModalMesa = fecharModalMesa;
  estadoPDV.fn.resetarModoAdicao = resetarModoAdicao;
  estadoPDV.fn.abrirModalTransferencia = abrirModalTransferencia;
  estadoPDV.fn.fecharModalTransferencia = fecharModalTransferencia;
}
