/**
 * js/admin/pedidos-admin.js
 * Lógica para listagem e gestão de pedidos na tela de Admin.
 */
(function() {
  const pagePedidos = document.getElementById('page-pedidos');
  if (!pagePedidos) return;

  const tbody = document.getElementById('pedidos-table-body');
  const btnRefresh = document.getElementById('btn-refresh-pedidos');
  const filterStatus = document.getElementById('filter-pedido-status');

  // Modal
  const modalOverlay = document.getElementById('modal-pedido-overlay');
  const btnClose = document.getElementById('modal-pedido-close');
  const btnCancel = document.getElementById('modal-pedido-cancel');
  const modalBody = document.getElementById('modal-pedido-body');

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
      'pendente': '<span class="status status--inactive" style="background:#FFF8E1; color:#795548;">Pendente</span>',
      'em_preparo': '<span class="status status--active" style="background:#E3F2FD; color:#1565C0;">Em Preparo</span>',
      'concluido': '<span class="status status--active" style="background:#E8F5E9; color:#2E7D32;">Concluído</span>',
      'cancelado': '<span class="status status--inactive" style="background:#FFEBEE; color:#C62828;">Cancelado</span>'
    };
    return map[status] || status;
  }

  async function loadPedidos() {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Carregando...</td></tr>';
    
    let query = window.cafeteriaSupabase
      .from('pedidos')
      .select(`
        *,
        pedido_itens (*)
      `)
      .order('created_at', { ascending: false });

    const statusVal = filterStatus.value;
    if (statusVal) {
      query = query.eq('status', statusVal);
    }

    const { data, error } = await query;

    if (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum pedido encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(pedido => {
      const dataCriacao = new Date(pedido.created_at).toLocaleString('pt-BR');
      const total = Number(pedido.total).toFixed(2).replace('.', ',');
      const qtdItens = pedido.pedido_itens ? pedido.pedido_itens.reduce((acc, item) => acc + item.quantidade, 0) : 0;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${pedido.numero_pedido || pedido.id}</td>
        <td><strong>${pedido.mesa_codigo}</strong></td>
        <td>${qtdItens} un</td>
        <td>R$ ${total}</td>
        <td>${formatStatus(pedido.status)}</td>
        <td>${pedido.criado_por_nome || '—'}</td>
        <td>${dataCriacao}</td>
        <td class="table-actions">
          <button class="btn btn--outline-dark btn-small" title="Ver Detalhes">👁️</button>
        </td>
      `;
      
      tr.querySelector('button').addEventListener('click', () => showDetalhes(pedido));
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
        itensHtml += `
          <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #ccc; padding: 4px 0;">
            <span>${item.quantidade}x ${item.nome_produto}</span>
            <span>R$ ${subtotal}</span>
          </div>
        `;
      });
    }

    const obsHtml = pedido.observacoes 
      ? `<div style="margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 4px;"><strong>Observações:</strong> ${pedido.observacoes}</div>`
      : '';

    let btnCancelarHtml = '';
    if (pedido.status !== 'concluido' && pedido.status !== 'cancelado') {
      btnCancelarHtml = `<button class="btn btn--danger btn-small" id="btn-cancelar-pedido" style="margin-top: 16px;">Cancelar Pedido</button>`;
    }

    modalBody.innerHTML = `
      <div style="font-size: 16px; line-height: 1.6;">
        <div><strong>Mesa:</strong> ${pedido.mesa_codigo}</div>
        <div><strong>Status:</strong> ${formatStatus(pedido.status)}</div>
        <div><strong>Criado em:</strong> ${dataCriacao}</div>
        <div><strong>Barista:</strong> ${pedido.criado_por_nome || '—'}</div>
        <hr style="margin: 16px 0; border: 0; border-top: 1px solid #eee;">
        
        <h4>Itens</h4>
        ${itensHtml}
        
        <div style="text-align: right; font-size: 18px; margin-top: 12px;">
          <strong>Total: R$ ${total}</strong>
        </div>
        
        ${obsHtml}
        ${btnCancelarHtml}
      </div>
    `;

    const btnCancelar = modalBody.querySelector('#btn-cancelar-pedido');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', async () => {
        if (!confirm('Tem certeza que deseja cancelar este pedido?')) return;
        
        btnCancelar.disabled = true;
        btnCancelar.textContent = 'Cancelando...';
        
        const { error } = await window.cafeteriaSupabase
          .from('pedidos')
          .update({ status: 'cancelado' })
          .eq('id', pedido.id);
          
        if (error) {
          alert('Erro ao cancelar: ' + error.message);
          btnCancelar.disabled = false;
          btnCancelar.textContent = 'Cancelar Pedido';
        } else {
          window.showToast('Pedido cancelado com sucesso.');
          closeModal();
          loadPedidos();
        }
      });
    }

    openModal();
  }

  // Eventos
  btnRefresh.addEventListener('click', loadPedidos);
  filterStatus.addEventListener('change', loadPedidos);

  // Expor init
  window.initAdminPedidos = loadPedidos;

  // Carrega ao iniciar se estiver na pagina (ou aguarda navegação do main)
  // loadPedidos();

})();
