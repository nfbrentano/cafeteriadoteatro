/**
 * js/admin/pedidos-admin.js
 * Lógica para listagem, gestão e métricas de pedidos na tela de Admin.
 */
(function() {
  if (!window.escapeHtml) {
    window.escapeHtml = function(unsafe) {
      if (!unsafe) return '';
      return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
  }

  const pagePedidos = document.getElementById('page-pedidos');
  if (!pagePedidos) return;

  const tbody = document.getElementById('pedidos-table-body');
  const btnRefresh = document.getElementById('btn-refresh-pedidos');
  const filterStatus = document.getElementById('filter-pedido-status');
  const filterPeriodo = document.getElementById('filter-pedido-periodo');
  const filterPagamento = document.getElementById('filter-pedido-pagamento');

  // KPIs
  const statFaturamento = document.getElementById('stat-pedidos-faturamento');
  const statTotal = document.getElementById('stat-pedidos-total');
  const statTicket = document.getElementById('stat-pedidos-ticket');
  const statAbertos = document.getElementById('stat-pedidos-abertos');

  // Modal
  const modalOverlay = document.getElementById('modal-pedido-overlay');
  const btnClose = document.getElementById('modal-pedido-close');
  const btnCancel = document.getElementById('modal-pedido-cancel');
  const modalBody = document.getElementById('modal-pedido-body');

  let realtimeChannel = null;

  function openModal() {
    modalOverlay.style.display = 'flex';
  }
  function closeModal() {
    modalOverlay.style.display = 'none';
  }
  [btnClose, btnCancel].forEach(el => el && el.addEventListener('click', closeModal));

  // Utils
  function formatStatus(status) {
    const map = {
      'pendente': '<span class="status status--inactive" style="background:#FFF8E1; color:#E65100; font-weight:bold;">Pendente</span>',
      'em_preparo': '<span class="status status--active" style="background:#E3F2FD; color:#1565C0; font-weight:bold;">Em Preparo</span>',
      'concluido': '<span class="status status--active" style="background:#E8F5E9; color:#2E7D32; font-weight:bold;">Concluído</span>',
      'entregue': '<span class="status status--active" style="background:#E0E0E0; color:#424242; font-weight:bold;">Entregue</span>',
      'cancelado': '<span class="status status--inactive" style="background:#FFEBEE; color:#C62828; font-weight:bold;">Cancelado</span>'
    };
    return map[status] || status;
  }

  function formatPagamento(forma, status) {
    const mapForma = {
      'pix': 'PIX',
      'dinheiro': 'Dinheiro',
      'cartao_credito': 'Crédito',
      'cartao_debito': 'Débito',
      'outros': 'Outros'
    };
    const nomeForma = mapForma[forma] || (forma ? forma.toUpperCase() : 'Não informado');
    const badgeStatus = status === 'pago' 
      ? '<span style="color:#2E7D32; font-size:11px; font-weight:bold;">(Pago ✅)</span>' 
      : '<span style="color:#E65100; font-size:11px; font-weight:bold;">(A pagar)</span>';

    return `${nomeForma} ${badgeStatus}`;
  }

  async function updateKPIs() {
    // Buscar todos os pedidos de hoje para calcular métricas
    const hojeStart = new Date();
    hojeStart.setHours(0, 0, 0, 0);

    const { data: pedidosHoje, error } = await window.cafeteriaSupabase
      .from('pedidos')
      .select('id, total, status, created_at')
      .gte('created_at', hojeStart.toISOString());

    // Buscar pedidos abertos gerais
    const { count: abertosCount } = await window.cafeteriaSupabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pendente', 'em_preparo']);

    if (!error && pedidosHoje) {
      const validos = pedidosHoje.filter(p => p.status !== 'cancelado');
      const faturamento = validos.reduce((acc, p) => acc + Number(p.total || 0), 0);
      const concluidosCount = validos.filter(p => p.status === 'concluido' || p.status === 'entregue').length;
      const ticketMedio = validos.length > 0 ? faturamento / validos.length : 0;

      if (statFaturamento) statFaturamento.textContent = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;
      if (statTotal) statTotal.textContent = String(concluidosCount);
      if (statTicket) statTicket.textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;
      if (statAbertos) statAbertos.textContent = String(abertosCount || 0);
    }
  }

  async function loadPedidos() {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando pedidos...</td></tr>';
    
    updateKPIs();

    let query = window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (
          *,
          pedido_item_adicionais (*),
          pedido_item_sabores (*)
        )
      `)
      .order('created_at', { ascending: false });

    // Filtro Período
    const periodoVal = filterPeriodo ? filterPeriodo.value : 'hoje';
    const now = new Date();

    if (periodoVal === 'hoje') {
      const inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      query = query.gte('created_at', inicio.toISOString());
    } else if (periodoVal === 'ontem') {
      const ontemInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const ontemFim = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      query = query.gte('created_at', ontemInicio.toISOString()).lte('created_at', ontemFim.toISOString());
    } else if (periodoVal === '7dias') {
      const seteDiasAtras = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      query = query.gte('created_at', seteDiasAtras.toISOString());
    } else if (periodoVal === 'mes') {
      const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      query = query.gte('created_at', mesInicio.toISOString());
    }

    // Filtro Status
    const statusVal = filterStatus ? filterStatus.value : '';
    if (statusVal) {
      query = query.eq('status', statusVal);
    }

    // Filtro Pagamento
    const pagamentoVal = filterPagamento ? filterPagamento.value : '';
    if (pagamentoVal) {
      query = query.eq('forma_pagamento', pagamentoVal);
    }

    const { data, error } = await query;

    if (error) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="color:#888; padding:24px;">Nenhum pedido encontrado para os filtros selecionados.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(pedido => {
      const dataCriacao = new Date(pedido.created_at).toLocaleString('pt-BR');
      const total = Number(pedido.total).toFixed(2).replace('.', ',');
      const qtdItens = pedido.pedido_itens ? pedido.pedido_itens.reduce((acc, item) => acc + item.quantidade, 0) : 0;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${pedido.numero_pedido || pedido.id}</strong></td>
        <td><span style="font-weight:bold; font-size:14px;">${pedido.mesa_codigo}</span></td>
        <td>${qtdItens} un</td>
        <td><strong style="color:var(--admin-primary, #C07F43);">R$ ${total}</strong></td>
        <td>${formatPagamento(pedido.forma_pagamento, pedido.status_pagamento)}</td>
        <td>${formatStatus(pedido.status)}</td>
        <td>${pedido.criado_por_nome || '—'}</td>
        <td style="font-size:12px; color:#555;">${dataCriacao}</td>
        <td class="table-actions">
          <button class="btn btn--outline-dark btn-small btn-detalhes" title="Ver Detalhes">👁️</button>
        </td>
      `;
      
      tr.querySelector('.btn-detalhes').addEventListener('click', () => showDetalhes(pedido));
      tbody.appendChild(tr);
    });
  }

  function showDetalhes(pedido) {
    const total = Number(pedido.total).toFixed(2).replace('.', ',');
    const dataCriacao = new Date(pedido.created_at).toLocaleString('pt-BR');
    
    let itensHtml = '';
    if (pedido.pedido_itens) {
      pedido.pedido_itens.forEach(item => {
        const subtotal = (item.quantidade * item.preco_unitario).toFixed(2).replace('.', ',');
        const obsItem = item.observacoes ? `<div style="font-size:12px; color:#E65100; margin-left:14px;">↳ Obs: ${window.escapeHtml(item.observacoes)}</div>` : '';
        
        let adicHtml = '';
        if (item.pedido_item_adicionais && item.pedido_item_adicionais.length > 0) {
          adicHtml = item.pedido_item_adicionais.map(ad => 
            `<div style="font-size:12px; color:#666; margin-left:14px;">+ ${window.escapeHtml(ad.nome_adicional)}</div>`
          ).join('');
        }

        let saboresHtml = '';
        if (item.pedido_item_sabores && item.pedido_item_sabores.length === 2) {
          saboresHtml = `<div style="font-size:12px; color:#555; margin-left:14px;">½ ${window.escapeHtml(item.pedido_item_sabores[0].nome)} / ½ ${window.escapeHtml(item.pedido_item_sabores[1].nome)}</div>`;
        }
        
        let descHtml = '';
        if (item.desconto > 0) {
           descHtml = `<div style="font-size:12px; color:#e74c3c; margin-left:14px;">↳ Desconto: - R$ ${Number(item.desconto).toFixed(2).replace('.', ',')}</div>`;
        }
        
        let isCortesia = item.cortesia_de_item_id ? `<span style="background:#e74c3c; color:white; font-size:10px; padding:2px 4px; border-radius:4px; margin-left:4px;">CORTESIA</span>` : '';

        let cancelClass = item.cancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
        let cancelLabel = item.cancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
        let btnCancelarItemHtml = '';
        
        if (!item.cancelado && pedido.status !== 'concluido' && pedido.status !== 'cancelado') {
          btnCancelarItemHtml = `<button class="btn-ghost-small btn-cancelar-item" data-item-id="${item.id}" style="color: #e74c3c; padding: 2px 6px; font-size: 11px; border: 1px solid #e74c3c; border-radius: 4px;">✕ Cancelar Item</button>`;
        }

        itensHtml += `
          <div style="border-bottom: 1px dashed #eee; padding: 6px 0;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span ${cancelClass}><strong>${item.quantidade}x</strong> ${window.escapeHtml(item.nome_produto)} ${isCortesia} ${cancelLabel}</span>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span ${cancelClass}>R$ ${subtotal}</span>
                ${btnCancelarItemHtml}
              </div>
            </div>
            <div ${cancelClass}>
              ${saboresHtml}
              ${adicHtml}
              ${descHtml}
              ${obsItem}
            </div>
          </div>
        `;
      });
    }

    const obsHtml = pedido.observacoes 
      ? `<div style="margin-top: 14px; padding: 10px 14px; background: #FFF9C4; border-radius: 6px; font-size:13px; color:#5D4037;"><strong>Observações do Pedido:</strong> ${window.escapeHtml(pedido.observacoes)}</div>`
      : '';

    let btnCancelarHtml = '';
    if (pedido.status !== 'concluido' && pedido.status !== 'cancelado') {
      btnCancelarHtml = `<button class="btn btn--danger btn-small" id="btn-cancelar-pedido" style="margin-top: 16px;">Cancelar Pedido</button>`;
    }

    modalBody.innerHTML = `
      <div style="font-size: 15px; line-height: 1.6;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <div><strong>Mesa:</strong> <span style="font-size:16px; font-weight:bold;">${pedido.mesa_codigo}</span></div>
          <div><strong>Pedido:</strong> #${pedido.numero_pedido || pedido.id}</div>
        </div>
        <div><strong>Status:</strong> ${formatStatus(pedido.status)}</div>
        <div><strong>Pagamento:</strong> ${formatPagamento(pedido.forma_pagamento, pedido.status_pagamento)}</div>
        <div><strong>Data e Hora:</strong> ${dataCriacao}</div>
        <div><strong>Operador / Barista:</strong> ${pedido.criado_por_nome || '—'}</div>
        <hr style="margin: 14px 0; border: 0; border-top: 1px solid #EEE;">
        
        <h4 style="margin-bottom:8px;">Itens do Pedido</h4>
        ${itensHtml}
        
        <div style="text-align: right; font-size: 18px; margin-top: 14px; font-weight:bold; color:var(--admin-primary, #C07F43);">
          Total: R$ ${total}
        </div>
        
        ${obsHtml}
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
          <button class="btn btn--secondary btn-small" id="btn-print-admin">🖨 Imprimir Comanda</button>
          ${btnCancelarHtml}
        </div>
      </div>
    `;

    const btnPrint = modalBody.querySelector('#btn-print-admin');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        if (window.cafeteriaPrint) {
          window.cafeteriaPrint.printPedido(pedido, pedido.pedido_itens || []);
        }
      });
    }

    const btnsCancelarItem = modalBody.querySelectorAll('.btn-cancelar-item');
    btnsCancelarItem.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = e.target.getAttribute('data-item-id');
        const motivo = prompt('Motivo do cancelamento (Ex: Cliente desistiu, Lançado errado, Em falta):');
        if (!motivo) return;

        btn.disabled = true;
        btn.textContent = 'Cancelando...';

        try {
          const { data, error } = await window.cafeteriaSupabase.rpc('cancelar_item', {
            p_item_id: itemId,
            p_motivo: motivo
          });

          if (error) throw error;
          
          alert('Item cancelado com sucesso!');
          fecharModal();
          await fetchPedidos('hoje'); // Recarrega a lista
        } catch (err) {
          console.error(err);
          alert('Erro ao cancelar item: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = '✕ Cancelar Item';
        }
      });
    });

    const btnCancelar = modalBody.querySelector('#btn-cancelar-pedido');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', async () => {
        if (!confirm(`Tem certeza que deseja CANCELAR o pedido #${pedido.numero_pedido || pedido.id}?`)) return;
        
        btnCancelar.disabled = true;
        btnCancelar.textContent = 'Cancelando...';
        
        const { error } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({ status: 'cancelado', updated_at: new Date().toISOString() })
          .eq('id', pedido.id);
          
        if (error) {
          alert('Erro ao cancelar: ' + error.message);
          btnCancelar.disabled = false;
          btnCancelar.textContent = 'Cancelar Pedido';
        } else {
          if (window.showToast) window.showToast('Pedido cancelado com sucesso.');
          closeModal();
          loadPedidos();
        }
      });
    }

    openModal();
  }

  let fetchTimeout = null;
  function debouncedLoadPedidos() {
    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      if (pagePedidos.classList.contains('active')) {
        loadPedidos();
      }
    }, 300);
  }

  function updateConnectionStatus(isConnected) {
    const indicator = document.querySelector('.status-indicator');
    if (!indicator) return;
    const dot = indicator.querySelector('.pulse-dot');
    const text = indicator.querySelector('.status-text');
    
    if (isConnected) {
      if(dot) dot.style.backgroundColor = '#4CAF50';
      if(text) { text.textContent = 'Conectado'; text.style.color = '#666'; }
    } else {
      if(dot) dot.style.backgroundColor = '#e74c3c';
      if(text) { text.textContent = 'Reconectando...'; text.style.color = '#e74c3c'; }
    }
  }

  function setupRealtime() {
    if (realtimeChannel) return;
    realtimeChannel = window.cafeteriaSupabase.channel('admin-pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        debouncedLoadPedidos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_itens' }, () => {
        debouncedLoadPedidos();
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
    debouncedLoadPedidos();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  // Lidar com repouso/troca de aba
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      debouncedLoadPedidos();
    }
  });

  // Eventos
  if (btnRefresh) btnRefresh.addEventListener('click', loadPedidos);
  if (filterStatus) filterStatus.addEventListener('change', loadPedidos);
  if (filterPeriodo) filterPeriodo.addEventListener('change', loadPedidos);
  if (filterPagamento) filterPagamento.addEventListener('change', loadPedidos);

  // Expor init
  window.initAdminPedidos = () => {
    loadPedidos();
    setupRealtime();
  };

})();

