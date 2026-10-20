/**
 * js/admin/clientes-admin.js
 * Gestão de Clientes, Ficha 360, Histórico de Consumo, Mesclagem e LGPD (CAF-000033)
 */
(function() {
  'use strict';

  let clientesCache = [];
  let pedidosResumoMap = new Map(); // cliente_id -> { visitas, totalGasto, ultimaVisita }
  let saldosResumoMap = new Map();  // cliente_id -> { saldo, limite_credito, limite_disponivel, conta_habilitada, dia_vencimento }
  let activeClienteConta = null;
  let activeExtratoData = null;

  // Elementos da Página
  const pageClientes = document.getElementById('page-clientes');
  if (!pageClientes) return;

  const tbody = document.getElementById('tbody-clientes');
  const searchInput = document.getElementById('search-cliente');
  const filterContato = document.getElementById('filter-cliente-contato');
  const filterConta = document.getElementById('filter-cliente-conta');
  const filterStatus = document.getElementById('filter-cliente-status');
  const btnNovoCliente = document.getElementById('btn-novo-cliente');
  const btnExportCSV = document.getElementById('btn-export-clientes');

  // KPIs
  const kpiTotal = document.getElementById('kpi-clientes-total');
  const kpiComPedidos = document.getElementById('kpi-clientes-com-pedidos');
  const kpiWhatsappPct = document.getElementById('kpi-clientes-whatsapp-pct');
  const kpiWhatsappCount = document.getElementById('kpi-clientes-whatsapp-count');
  const kpiTicketMedio = document.getElementById('kpi-clientes-ticket-medio');

  // Modal Novo / Editar
  const modalClienteOverlay = document.getElementById('modal-cliente-overlay');
  const modalClienteClose = document.getElementById('modal-cliente-close');
  const btnCancelarCliente = document.getElementById('btn-cancelar-cliente');
  const formCliente = document.getElementById('form-cliente');
  const formClienteId = document.getElementById('form-cliente-id');
  const formClienteNome = document.getElementById('form-cliente-nome');
  const formClienteTelefone = document.getElementById('form-cliente-telefone');
  const formClienteNascimento = document.getElementById('form-cliente-nascimento');
  const formClienteEmail = document.getElementById('form-cliente-email');
  const formClienteObs = document.getElementById('form-cliente-obs');
  const formClienteContaHabilitada = document.getElementById('form-cliente-conta-habilitada');
  const boxContaConfig = document.getElementById('box-conta-config');
  const formClienteLimiteCredito = document.getElementById('form-cliente-limite-credito');
  const formClienteDiaVencimento = document.getElementById('form-cliente-dia-vencimento');
  const formClienteAceitaContato = document.getElementById('form-cliente-aceita-contato');
  const formClienteAtivo = document.getElementById('form-cliente-ativo');
  const modalClienteTitle = document.getElementById('modal-cliente-title');

  // Modal Conta Corrente (CAF-000034)
  const modalContaOverlay = document.getElementById('modal-conta-cliente-overlay');
  const modalContaClose = document.getElementById('modal-conta-cliente-close');
  const modalContaNome = document.getElementById('modal-conta-cliente-nome');
  const modalContaBadgeStatus = document.getElementById('modal-conta-badge-status');
  const modalContaSub = document.getElementById('modal-conta-cliente-sub');
  const contaSaldoAtual = document.getElementById('conta-saldo-atual');
  const contaSaldoTipo = document.getElementById('conta-saldo-tipo');
  const contaLimiteTotal = document.getElementById('conta-limite-total');
  const contaLimiteDisponivel = document.getElementById('conta-limite-disponivel');
  const contaDiaVencimento = document.getElementById('conta-dia-vencimento');
  const btnAbrirDeposito = document.getElementById('btn-abrir-deposito');
  const btnAbrirPagamento = document.getElementById('btn-abrir-pagamento');
  const btnWhatsappExtrato = document.getElementById('btn-whatsapp-extrato');
  const btnImprimirExtrato = document.getElementById('btn-imprimir-extrato');
  const boxLancamentoConta = document.getElementById('box-lancamento-conta');
  const lancamentoContaTitle = document.getElementById('lancamento-conta-title');
  const formLancamentoConta = document.getElementById('form-lancamento-conta');
  const lancamentoTipo = document.getElementById('lancamento-tipo');
  const lancamentoValor = document.getElementById('lancamento-valor');
  const lancamentoForma = document.getElementById('lancamento-forma');
  const lancamentoMotivo = document.getElementById('lancamento-motivo');
  const btnCancelarLancamento = document.getElementById('btn-cancelar-lancamento');
  const tbodyExtratoConta = document.getElementById('tbody-extrato-conta');
  const contaTotalMovimentos = document.getElementById('conta-total-movimentos');

  // Modal Ficha 360
  const modalFichaOverlay = document.getElementById('modal-ficha-cliente-overlay');
  const modalFichaClose = document.getElementById('modal-ficha-cliente-close');
  const btnFecharFicha = document.getElementById('btn-fechar-ficha-cliente');
  const modalFichaNome = document.getElementById('modal-ficha-cliente-nome');
  const modalFichaContato = document.getElementById('modal-ficha-cliente-contato');
  const modalFichaBadgeWhatsapp = document.getElementById('modal-ficha-badge-whatsapp');
  const modalFichaBtnWhatsapp = document.getElementById('modal-ficha-btn-whatsapp');
  const fichaTotalGasto = document.getElementById('ficha-total-gasto');
  const fichaTotalVisitas = document.getElementById('ficha-total-visitas');
  const fichaTicketMedio = document.getElementById('ficha-ticket-medio');
  const fichaUltimaVisita = document.getElementById('ficha-ultima-visita');
  const fichaBoxObs = document.getElementById('ficha-box-obs');
  const fichaTextoObs = document.getElementById('ficha-texto-obs');
  const fichaTbodyTopProdutos = document.getElementById('ficha-tbody-top-produtos');
  const fichaTbodyPedidos = document.getElementById('ficha-tbody-pedidos');

  // Modal Mesclar
  const modalMesclarOverlay = document.getElementById('modal-mesclar-cliente-overlay');
  const modalMesclarClose = document.getElementById('modal-mesclar-cliente-close');
  const btnCancelarMesclar = document.getElementById('btn-cancelar-mesclar');
  const btnConfirmarMesclar = document.getElementById('btn-confirmar-mesclar');
  const mesclarOrigemNome = document.getElementById('mesclar-origem-nome');
  const mesclarOrigemId = document.getElementById('mesclar-origem-id');
  const mesclarDestinoSelect = document.getElementById('mesclar-destino-id');

  // --- Helpers de Formatação ---
  function formatarTelefone(tel) {
    if (!tel) return '-';
    let d = String(tel).replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 10) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return tel;
  }

  function formatarMoeda(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarDataHora(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatarData(isoString) {
    if (!isoString) return '-';
    const parts = String(isoString).split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoString;
  }

  // Máscara dinâmica de telefone no formulário
  if (formClienteTelefone) {
    formClienteTelefone.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      if (v.length > 6) {
        v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
      } else if (v.length > 2) {
        v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      } else if (v.length > 0) {
        v = `(${v}`;
      }
      e.target.value = v;
    });
  }

  // --- Carregamento de Dados ---
  async function loadData() {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">Carregando clientes...</td></tr>';

    try {
      // 1. Carregar todos os clientes
      const clientes = await window.cafeteriaDB.clientes.all({ apenasAtivos: false });
      clientesCache = clientes || [];

      // 2. Carregar resumo agregado de compras por cliente
      pedidosResumoMap.clear();
      try {
        const { data: pedidosData, error: pedidosErr } = await window.cafeteriaSupabase
          .from('pedidos')
          .select('cliente_id, total, created_at, status')
          .not('cliente_id', 'is', null)
          .neq('status', 'cancelado');

        if (!pedidosErr && Array.isArray(pedidosData)) {
          pedidosData.forEach(p => {
            const cid = p.cliente_id;
            const item = pedidosResumoMap.get(cid) || { visitas: 0, totalGasto: 0, ultimaVisita: null };
            item.visitas += 1;
            item.totalGasto += (Number(p.total) || 0);
            if (!item.ultimaVisita || new Date(p.created_at) > new Date(item.ultimaVisita)) {
              item.ultimaVisita = p.created_at;
            }
            pedidosResumoMap.set(cid, item);
          });
        }
      } catch (errPedidos) {
        console.warn('[Clientes] Falha ao agregar compras dos clientes:', errPedidos);
      }

      // 3. Carregar saldos das contas dos clientes (CAF-000034)
      saldosResumoMap.clear();
      try {
        const saldos = await window.cafeteriaDB.clientes.getSaldos();
        if (Array.isArray(saldos)) {
          saldos.forEach(s => {
            saldosResumoMap.set(s.cliente_id, s);
          });
        }
      } catch (errSaldos) {
        console.warn('[Clientes] Falha ao carregar saldos de contas:', errSaldos);
      }

      atualizarKPIs();
      renderTabela();
    } catch (err) {
      console.error('[Clientes] Erro ao carregar:', err);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#c62828; padding:20px;">Erro ao carregar clientes: ${err.message || 'tente novamente'}</td></tr>`;
    }
  }

  function atualizarKPIs() {
    const total = clientesCache.length;
    let comPedidosCount = 0;
    let whatsappCount = 0;
    let totalGastoGeral = 0;
    let totalVisitasGeral = 0;

    clientesCache.forEach(c => {
      if (c.aceita_contato) whatsappCount++;
      const res = pedidosResumoMap.get(c.id);
      if (res && res.visitas > 0) {
        comPedidosCount++;
        totalGastoGeral += res.totalGasto;
        totalVisitasGeral += res.visitas;
      }
    });

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiComPedidos) kpiComPedidos.textContent = comPedidosCount;
    
    const pct = total > 0 ? Math.round((whatsappCount / total) * 100) : 0;
    if (kpiWhatsappPct) kpiWhatsappPct.textContent = `${pct}%`;
    if (kpiWhatsappCount) kpiWhatsappCount.textContent = `${whatsappCount} autorizados (LGPD)`;

    const ticketMedio = totalVisitasGeral > 0 ? (totalGastoGeral / totalVisitasGeral) : 0;
    if (kpiTicketMedio) kpiTicketMedio.textContent = formatarMoeda(ticketMedio);
  }

  function getClientesFiltrados() {
    const termo = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const termoDigitos = termo.replace(/\D/g, '');
    const filtroZap = filterContato ? filterContato.value : '';
    const filtroConta = filterConta ? filterConta.value : 'todas';
    const filtroSt = filterStatus ? filterStatus.value : 'ativos';

    return clientesCache.filter(c => {
      // Filtro status
      if (filtroSt === 'ativos' && !c.ativo) return false;

      // Filtro WhatsApp
      if (filtroZap === 'sim' && !c.aceita_contato) return false;
      if (filtroZap === 'nao' && c.aceita_contato) return false;

      // Filtro Conta Corrente
      const sInfo = saldosResumoMap.get(c.id);
      const isContaHab = sInfo ? sInfo.conta_habilitada : Boolean(c.conta_habilitada);
      const saldoVal = sInfo ? (Number(sInfo.saldo) || 0) : 0;

      if (filtroConta === 'conta_ativa' && !isContaHab) return false;
      if (filtroConta === 'com_saldo_positivo' && (!isContaHab || saldoVal <= 0)) return false;
      if (filtroConta === 'com_saldo_devedor' && (!isContaHab || saldoVal >= 0)) return false;

      // Filtro termo de busca
      if (termo) {
        const matchNome = (c.nome || '').toLowerCase().includes(termo);
        const matchEmail = (c.email || '').toLowerCase().includes(termo);
        const matchTel = termoDigitos.length >= 2 && (c.telefone || '').includes(termoDigitos);
        if (!matchNome && !matchEmail && !matchTel) return false;
      }

      return true;
    });
  }

  function renderTabela() {
    const lista = getClientesFiltrados();
    tbody.innerHTML = '';

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">Nenhum cliente encontrado com os filtros aplicados.</td></tr>';
      return;
    }

    lista.forEach(c => {
      const tr = document.createElement('tr');
      if (!c.ativo) tr.style.opacity = '0.6';

      const res = pedidosResumoMap.get(c.id) || { visitas: 0, totalGasto: 0, ultimaVisita: null };
      const zapBadge = c.aceita_contato
        ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-size:11px; padding:2px 8px; border-radius:12px;">Sim 💬</span>`
        : `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:11px; padding:2px 8px; border-radius:12px;">Não</span>`;

      const statusBadge = !c.ativo
        ? ` <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:10px; margin-left:4px;">Inativo</span>`
        : '';

      const anonBadge = c.anonimizado
        ? ` <span class="badge" style="background:#fef3c7; color:#92400e; font-size:10px; margin-left:4px;">Anonimizado</span>`
        : '';

      const sInfo = saldosResumoMap.get(c.id);
      const isContaHab = sInfo ? sInfo.conta_habilitada : Boolean(c.conta_habilitada);
      const saldoVal = sInfo ? (Number(sInfo.saldo) || 0) : 0;
      const limiteDisp = sInfo ? (Number(sInfo.limite_disponivel) || 0) : (Number(c.limite_credito) || 0);

      let contaTdHtml = '<span style="color:#94a3b8; font-size:12px;">Desabilitada</span>';
      if (isContaHab) {
        if (saldoVal > 0) {
          contaTdHtml = `
            <span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700; font-size:11px; padding:2px 8px; border-radius:12px;" title="Crédito pré-pago">+ ${formatarMoeda(saldoVal)}</span>
            <div style="font-size:10px; color:#64748b; margin-top:2px;">Disp: ${formatarMoeda(limiteDisp)}</div>
          `;
        } else if (saldoVal < 0) {
          contaTdHtml = `
            <span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700; font-size:11px; padding:2px 8px; border-radius:12px;" title="Débito / Fiado a pagar">${formatarMoeda(saldoVal)}</span>
            <div style="font-size:10px; color:#64748b; margin-top:2px;">Disp: ${formatarMoeda(limiteDisp)}</div>
          `;
        } else {
          contaTdHtml = `
            <span class="badge" style="background:#f1f5f9; color:#475569; font-size:11px; padding:2px 8px; border-radius:12px;">R$ 0,00</span>
            <div style="font-size:10px; color:#64748b; margin-top:2px;">Disp: ${formatarMoeda(limiteDisp)}</div>
          `;
        }
      }

      tr.innerHTML = `
        <td>
          <strong>${window.escapeHtml(c.nome)}</strong>
          ${statusBadge}${anonBadge}
        </td>
        <td>${formatarTelefone(c.telefone)}</td>
        <td>${c.email ? window.escapeHtml(c.email) : '<span style="color:#94a3b8;">-</span>'}</td>
        <td style="text-align:center; font-weight:600;">${res.visitas}</td>
        <td style="text-align:right; font-weight:600; color:#15803d;">${formatarMoeda(res.totalGasto)}</td>
        <td style="text-align:center;">${contaTdHtml}</td>
        <td style="font-size:12px; color:#475569;">${formatarDataHora(res.ultimaVisita)}</td>
        <td style="text-align:center;">${zapBadge}</td>
        <td style="text-align:center; white-space:nowrap;">
          <div style="display:flex; justify-content:center; gap:4px;">
            <button class="btn btn--ghost btn--small btn-conta-cliente" data-id="${c.id}" title="Gerenciar Conta Corrente e Extrato" style="color:#0284c7;">💳 Conta</button>
            <button class="btn btn--ghost btn--small btn-ver-ficha" data-id="${c.id}" title="Ver Ficha 360 do Cliente">👁️ Ficha</button>
            <button class="btn btn--ghost btn--small btn-editar-cliente" data-id="${c.id}" title="Editar dados">✏️</button>
            <button class="btn btn--ghost btn--small btn-mesclar-cliente" data-id="${c.id}" title="Mesclar duplicado">🔗</button>
            ${!c.anonimizado ? `<button class="btn btn--ghost btn--small btn-anonimizar-cliente" data-id="${c.id}" title="Anonimizar dados (LGPD)" style="color:#b91c1c;">🗑️</button>` : ''}
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Eventos nas ações da tabela
    tbody.querySelectorAll('.btn-conta-cliente').forEach(btn => {
      btn.addEventListener('click', () => abrirModalConta(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-ver-ficha').forEach(btn => {
      btn.addEventListener('click', () => abrirFicha(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-editar-cliente').forEach(btn => {
      btn.addEventListener('click', () => {
        const cliente = clientesCache.find(x => x.id === btn.dataset.id);
        if (cliente) abrirModalForm(cliente);
      });
    });
    tbody.querySelectorAll('.btn-mesclar-cliente').forEach(btn => {
      btn.addEventListener('click', () => {
        const cliente = clientesCache.find(x => x.id === btn.dataset.id);
        if (cliente) abrirModalMesclar(cliente);
      });
    });
    tbody.querySelectorAll('.btn-anonimizar-cliente').forEach(btn => {
      btn.addEventListener('click', () => {
        const cliente = clientesCache.find(x => x.id === btn.dataset.id);
        if (cliente) anonimizarCliente(cliente);
      });
    });
  }

  // --- Modal Novo / Editar Cliente ---
  function abrirModalForm(cliente = null) {
    if (!modalClienteOverlay) return;
    formCliente.reset();

    if (cliente) {
      modalClienteTitle.textContent = 'Editar Cliente';
      formClienteId.value = cliente.id;
      formClienteNome.value = cliente.nome || '';
      formClienteTelefone.value = formatarTelefone(cliente.telefone);
      formClienteNascimento.value = cliente.data_nascimento || '';
      formClienteEmail.value = cliente.email || '';
      formClienteObs.value = cliente.observacoes || '';
      if (formClienteContaHabilitada) {
        formClienteContaHabilitada.checked = Boolean(cliente.conta_habilitada);
        if (boxContaConfig) boxContaConfig.style.display = cliente.conta_habilitada ? 'block' : 'none';
        if (formClienteLimiteCredito) formClienteLimiteCredito.value = cliente.limite_credito !== undefined ? Number(cliente.limite_credito).toFixed(2) : '0.00';
        if (formClienteDiaVencimento) formClienteDiaVencimento.value = cliente.dia_vencimento || '';
      }
      formClienteAceitaContato.checked = Boolean(cliente.aceita_contato);
      formClienteAtivo.checked = cliente.ativo !== false;
    } else {
      modalClienteTitle.textContent = 'Novo Cliente';
      formClienteId.value = '';
      if (formClienteContaHabilitada) {
        formClienteContaHabilitada.checked = false;
        if (boxContaConfig) boxContaConfig.style.display = 'none';
        if (formClienteLimiteCredito) formClienteLimiteCredito.value = '0.00';
        if (formClienteDiaVencimento) formClienteDiaVencimento.value = '';
      }
      formClienteAceitaContato.checked = true;
      formClienteAtivo.checked = true;
    }

    modalClienteOverlay.classList.add('open');
    if (formClienteNome) formClienteNome.focus();
  }

  function fecharModalForm() {
    if (modalClienteOverlay) modalClienteOverlay.classList.remove('open');
  }

  if (formClienteContaHabilitada) {
    formClienteContaHabilitada.addEventListener('change', () => {
      if (boxContaConfig) {
        boxContaConfig.style.display = formClienteContaHabilitada.checked ? 'block' : 'none';
      }
    });
  }

  if (modalClienteClose) modalClienteClose.addEventListener('click', fecharModalForm);
  if (btnCancelarCliente) btnCancelarCliente.addEventListener('click', fecharModalForm);
  if (btnNovoCliente) btnNovoCliente.addEventListener('click', () => abrirModalForm());

  if (formCliente) {
    formCliente.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = formClienteId.value;
      const nome = formClienteNome.value.trim();
      const telefone = formClienteTelefone.value.trim();
      const email = formClienteEmail.value.trim();
      const dataNascimento = formClienteNascimento.value;
      const observacoes = formClienteObs.value.trim();
      const contaHabilitada = formClienteContaHabilitada ? formClienteContaHabilitada.checked : false;
      const limiteCredito = formClienteLimiteCredito ? (Number(formClienteLimiteCredito.value) || 0) : 0;
      const diaVencimento = formClienteDiaVencimento && formClienteDiaVencimento.value ? Number(formClienteDiaVencimento.value) : null;
      const aceitaContato = formClienteAceitaContato.checked;
      const ativo = formClienteAtivo.checked;

      if (!nome) {
        window.admin.toast('Erro', 'Informe o nome do cliente.', 'error');
        return;
      }
      if (!telefone || telefone.replace(/\D/g, '').length < 10) {
        window.admin.toast('Erro', 'Informe um telefone válido com DDD (mínimo 10 dígitos).', 'error');
        return;
      }

      const btnSalvar = document.getElementById('btn-salvar-cliente');
      if (btnSalvar) btnSalvar.disabled = true;

      try {
        const dados = {
          nome,
          telefone,
          email: email || null,
          data_nascimento: dataNascimento || null,
          observacoes: observacoes || null,
          conta_habilitada: contaHabilitada,
          limite_credito: limiteCredito,
          dia_vencimento: diaVencimento,
          aceita_contato: aceitaContato,
          ativo
        };

        if (id) {
          await window.cafeteriaDB.clientes.update(id, dados);
          window.admin.toast('Sucesso', 'Cliente atualizado com sucesso!', 'success');
        } else {
          await window.cafeteriaDB.clientes.create(dados);
          window.admin.toast('Sucesso', 'Cliente cadastrado com sucesso!', 'success');
        }

        fecharModalForm();
        await loadData();
      } catch (err) {
        console.error('[Clientes] Erro ao salvar:', err);
        const msg = (err.message && err.message.includes('unique'))
          ? 'Este telefone já está cadastrado para outro cliente.'
          : (err.message || 'Erro ao salvar cliente.');
        window.admin.toast('Erro', msg, 'error');
      } finally {
        if (btnSalvar) btnSalvar.disabled = false;
      }
    });
  }

  // --- Modal Conta Corrente do Cliente (CAF-000034) ---
  async function abrirModalConta(clienteId) {
    if (!modalContaOverlay) return;
    activeClienteConta = clienteId;
    if (boxLancamentoConta) boxLancamentoConta.style.display = 'none';
    if (formLancamentoConta) formLancamentoConta.reset();

    if (modalContaNome) modalContaNome.textContent = 'Carregando conta...';
    if (modalContaBadgeStatus) modalContaBadgeStatus.innerHTML = '';
    if (modalContaSub) modalContaSub.textContent = '';
    if (contaSaldoAtual) contaSaldoAtual.textContent = '...';
    if (contaLimiteTotal) contaLimiteTotal.textContent = '...';
    if (contaLimiteDisponivel) contaLimiteDisponivel.textContent = '...';
    if (contaDiaVencimento) contaDiaVencimento.textContent = '...';
    if (tbodyExtratoConta) tbodyExtratoConta.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:#94a3b8;">Carregando extrato...</td></tr>';

    modalContaOverlay.classList.add('open');

    try {
      const data = await window.cafeteriaDB.clientes.getExtrato(clienteId);
      activeExtratoData = data;

      if (modalContaNome) modalContaNome.textContent = `Conta Corrente — ${data.cliente_nome}`;
      if (modalContaSub) modalContaSub.textContent = `Telefone: ${formatarTelefone(data.cliente_telefone)}`;

      const statusBadge = data.conta_habilitada
        ? '<span class="badge" style="background:#dcfce7; color:#15803d; font-size:11px; padding:2px 8px; border-radius:12px;">Habilitada ✅</span>'
        : '<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:11px; padding:2px 8px; border-radius:12px;">Desabilitada ⚠️</span>';
      if (modalContaBadgeStatus) modalContaBadgeStatus.innerHTML = statusBadge;

      const saldo = Number(data.saldo) || 0;
      const limite = Number(data.limite_credito) || 0;
      const limiteDisp = Number(data.limite_disponivel) || 0;

      if (contaSaldoAtual) {
        contaSaldoAtual.textContent = (saldo > 0 ? '+ ' : '') + formatarMoeda(saldo);
        if (saldo > 0) {
          contaSaldoAtual.style.color = '#15803d';
          if (contaSaldoTipo) contaSaldoTipo.textContent = 'Créditos pré-pagos disponíveis';
        } else if (saldo < 0) {
          contaSaldoAtual.style.color = '#b91c1c';
          if (contaSaldoTipo) contaSaldoTipo.textContent = 'Débito / Fiado a pagar';
        } else {
          contaSaldoAtual.style.color = '#1e293b';
          if (contaSaldoTipo) contaSaldoTipo.textContent = 'Sem débitos ou créditos';
        }
      }

      if (contaLimiteTotal) contaLimiteTotal.textContent = formatarMoeda(limite);
      if (contaLimiteDisponivel) contaLimiteDisponivel.textContent = formatarMoeda(limiteDisp);
      if (contaDiaVencimento) contaDiaVencimento.textContent = data.dia_vencimento ? `Dia ${data.dia_vencimento}` : 'Não fixado';

      renderExtratoTabela(data.movimentos || []);
    } catch (err) {
      console.error('[Conta Extrato] Erro:', err);
      window.admin.toast('Erro', 'Falha ao carregar extrato: ' + (err.message || 'tente novamente'), 'error');
    }
  }

  function renderExtratoTabela(movimentos) {
    if (!tbodyExtratoConta) return;
    tbodyExtratoConta.innerHTML = '';
    if (contaTotalMovimentos) contaTotalMovimentos.textContent = `${movimentos.length} registro(s)`;

    if (movimentos.length === 0) {
      tbodyExtratoConta.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:#94a3b8;">Nenhuma movimentação registrada para esta conta.</td></tr>';
      return;
    }

    movimentos.forEach(m => {
      const tr = document.createElement('tr');
      const val = Number(m.valor) || 0;
      const valStr = (val > 0 ? '+ ' : '') + formatarMoeda(val);
      const valColor = val > 0 ? '#15803d' : '#b91c1c';

      const tipoBadges = {
        consumo: '<span class="badge" style="background:#fee2e2; color:#991b1b; font-size:10px;">Consumo</span>',
        pagamento: '<span class="badge" style="background:#dcfce7; color:#15803d; font-size:10px;">Pagamento</span>',
        deposito: '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">Depósito</span>',
        estorno: '<span class="badge" style="background:#fef3c7; color:#92400e; font-size:10px;">Estorno</span>',
        ajuste: '<span class="badge" style="background:#f1f5f9; color:#475569; font-size:10px;">Ajuste</span>'
      };

      const ref = m.pedido_id ? `Pedido #${m.pedido_id}` : (m.forma_pagamento ? m.forma_pagamento.toUpperCase() : '-');

      tr.innerHTML = `
        <td style="font-size:11px; color:#475569;">${formatarDataHora(m.created_at)}</td>
        <td>${tipoBadges[m.tipo] || m.tipo}</td>
        <td style="text-align:right; font-weight:700; color:${valColor};">${valStr}</td>
        <td style="font-size:11px;">${window.escapeHtml(ref)}</td>
        <td style="font-size:11px; color:#334155;">${window.escapeHtml(m.motivo || '-')}</td>
        <td style="font-size:11px; color:#64748b;">${window.escapeHtml(m.criado_por_nome || 'Sistema')}</td>
      `;
      tbodyExtratoConta.appendChild(tr);
    });
  }

  if (btnAbrirDeposito) {
    btnAbrirDeposito.addEventListener('click', () => {
      if (boxLancamentoConta) boxLancamentoConta.style.display = 'block';
      if (lancamentoTipo) lancamentoTipo.value = 'deposito';
      if (lancamentoContaTitle) lancamentoContaTitle.textContent = '➕ Adicionar Créditos Pré-pagos (Depósito)';
      if (lancamentoValor) {
        lancamentoValor.value = '';
        lancamentoValor.focus();
      }
      if (lancamentoMotivo) lancamentoMotivo.value = 'Depósito de créditos pré-pagos';
    });
  }

  if (btnAbrirPagamento) {
    btnAbrirPagamento.addEventListener('click', () => {
      if (boxLancamentoConta) boxLancamentoConta.style.display = 'block';
      if (lancamentoTipo) lancamentoTipo.value = 'pagamento';
      if (lancamentoContaTitle) lancamentoContaTitle.textContent = '💵 Receber Pagamento de Conta (Quitar Fiado)';
      if (lancamentoValor) {
        lancamentoValor.value = '';
        lancamentoValor.focus();
      }
      if (lancamentoMotivo) lancamentoMotivo.value = 'Quitação parcial / total de fiado';
    });
  }

  if (btnCancelarLancamento) {
    btnCancelarLancamento.addEventListener('click', () => {
      if (boxLancamentoConta) boxLancamentoConta.style.display = 'none';
    });
  }

  if (modalContaClose) {
    modalContaClose.addEventListener('click', () => {
      if (modalContaOverlay) modalContaOverlay.classList.remove('open');
    });
  }

  if (formLancamentoConta) {
    formLancamentoConta.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeClienteConta) return;

      const tipo = lancamentoTipo.value;
      const valor = Number(lancamentoValor.value);
      const forma = lancamentoForma.value;
      const motivo = lancamentoMotivo.value.trim();

      if (!valor || valor <= 0) {
        window.admin.toast('Erro', 'Informe um valor válido maior que zero.', 'error');
        return;
      }

      const btnConfirmar = document.getElementById('btn-confirmar-lancamento');
      if (btnConfirmar) btnConfirmar.disabled = true;

      try {
        await window.cafeteriaDB.clientes.lancarMovimento({
          clienteId: activeClienteConta,
          tipo,
          valor,
          formaPagamento: forma,
          motivo
        });

        window.admin.toast('Sucesso', `${tipo === 'deposito' ? 'Créditos adicionados' : 'Pagamento registrado'} com sucesso!`, 'success');
        if (boxLancamentoConta) boxLancamentoConta.style.display = 'none';
        if (formLancamentoConta) formLancamentoConta.reset();
        await abrirModalConta(activeClienteConta);
        await loadData();
      } catch (err) {
        console.error('[Lançar Movimento] Erro:', err);
        window.admin.toast('Erro', 'Falha ao registrar movimento: ' + (err.message || 'tente novamente'), 'error');
      } finally {
        if (btnConfirmar) btnConfirmar.disabled = false;
      }
    });
  }

  if (btnWhatsappExtrato) {
    btnWhatsappExtrato.addEventListener('click', () => {
      if (!activeExtratoData) return;
      const tel = (activeExtratoData.cliente_telefone || '').replace(/\D/g, '');
      if (!tel || tel.length < 10) {
        window.admin.toast('Aviso', 'Cliente não possui telefone válido para WhatsApp.', 'warn');
        return;
      }
      const numDestino = tel.startsWith('55') ? tel : `55${tel}`;
      const saldo = Number(activeExtratoData.saldo) || 0;
      const statusTxt = saldo > 0 
        ? `Você possui *${formatarMoeda(saldo)}* em créditos disponíveis.`
        : (saldo < 0 ? `Seu saldo em aberto é de *${formatarMoeda(Math.abs(saldo))}* (a pagar).` : `Seu saldo atual é de *R$ 0,00*.`);

      const msg = encodeURIComponent(
        `Olá, ${activeExtratoData.cliente_nome}! Segue o resumo da sua conta corrente na Cafeteria do Teatro:\n\n` +
        `💳 *Status da Conta:* ${statusTxt}\n` +
        (activeExtratoData.limite_credito > 0 ? `📊 *Limite Total:* ${formatarMoeda(activeExtratoData.limite_credito)}\n` : '') +
        (activeExtratoData.dia_vencimento ? `📅 *Vencimento:* dia ${activeExtratoData.dia_vencimento}\n\n` : '\n') +
        `Agradecemos pela preferência! Qualquer dúvida estamos à disposição. ☕🎭`
      );
      window.open(`https://wa.me/${numDestino}?text=${msg}`, '_blank');
    });
  }

  if (btnImprimirExtrato) {
    btnImprimirExtrato.addEventListener('click', () => {
      if (!activeExtratoData) return;
      const win = window.open('', '_blank', 'width=700,height=800');
      if (!win) {
        window.admin.toast('Erro', 'Pop-up bloqueado pelo navegador.', 'error');
        return;
      }
      const saldo = Number(activeExtratoData.saldo) || 0;
      const rowsHtml = (activeExtratoData.movimentos || []).map(m => {
        const val = Number(m.valor) || 0;
        return `
          <tr>
            <td style="padding:6px; border-bottom:1px solid #ddd;">${formatarDataHora(m.created_at)}</td>
            <td style="padding:6px; border-bottom:1px solid #ddd; text-transform:uppercase;">${m.tipo}</td>
            <td style="padding:6px; border-bottom:1px solid #ddd; text-align:right; font-weight:bold; color:${val > 0 ? 'green' : 'red'};">${(val > 0 ? '+' : '')}${formatarMoeda(val)}</td>
            <td style="padding:6px; border-bottom:1px solid #ddd;">${m.pedido_id ? `Pedido #${m.pedido_id}` : (m.forma_pagamento || '-')}</td>
            <td style="padding:6px; border-bottom:1px solid #ddd;">${m.motivo || '-'}</td>
          </tr>
        `;
      }).join('');

      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Extrato de Conta - ${activeExtratoData.cliente_nome}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #1e293b; font-size: 13px; }
            h2 { margin: 0 0 4px 0; color: #0f172a; }
            .header-info { margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; padding: 8px 6px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; }
          </style>
        </head>
        <body>
          <div class="header-info">
            <h2>Cafeteria do Teatro — Extrato de Conta Corrente</h2>
            <div><strong>Cliente:</strong> ${activeExtratoData.cliente_nome} | <strong>Telefone:</strong> ${formatarTelefone(activeExtratoData.cliente_telefone)}</div>
            <div style="margin-top:6px;"><strong>Saldo Atual:</strong> ${(saldo > 0 ? '+' : '')}${formatarMoeda(saldo)} | <strong>Limite:</strong> ${formatarMoeda(activeExtratoData.limite_credito)}</div>
            <div><strong>Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Tipo</th>
                <th style="text-align:right;">Valor</th>
                <th>Ref / Forma</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding:15px;">Nenhum movimento registrado.</td></tr>'}
            </tbody>
          </table>
          <script>window.print();<\/script>
        </body>
        </html>
      `);
      win.document.close();
    });
  }

  // --- Modal Ficha 360 do Cliente ---
  async function abrirFicha(clienteId) {
    if (!modalFichaOverlay) return;

    modalFichaNome.textContent = 'Carregando...';
    modalFichaContato.textContent = '';
    modalFichaBadgeWhatsapp.innerHTML = '';
    if (modalFichaBtnWhatsapp) modalFichaBtnWhatsapp.style.display = 'none';
    fichaTotalGasto.textContent = '...';
    fichaTotalVisitas.textContent = '...';
    fichaTicketMedio.textContent = '...';
    fichaUltimaVisita.textContent = '...';
    fichaBoxObs.style.display = 'none';
    fichaTbodyTopProdutos.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">Carregando...</td></tr>';
    fichaTbodyPedidos.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:10px;">Carregando...</td></tr>';

    modalFichaOverlay.classList.add('open');

    try {
      const ficha = await window.cafeteriaDB.clientes.getFicha(clienteId);
      if (!ficha || !ficha.cliente) {
        window.admin.toast('Erro', 'Não foi possível carregar a ficha do cliente.', 'error');
        fecharFicha();
        return;
      }

      const c = ficha.cliente;
      const res = ficha.resumo || {};
      const topProdutos = ficha.top_produtos || [];
      const pedidos = ficha.ultimos_pedidos || [];

      // Cabeçalho
      modalFichaNome.textContent = c.nome;
      const telFmt = formatarTelefone(c.telefone);
      const emailTxt = c.email || 'Sem e-mail';
      const nascTxt = c.data_nascimento ? ` | Nasc: ${formatarData(c.data_nascimento)}` : '';
      modalFichaContato.textContent = `Telefone: ${telFmt} | E-mail: ${emailTxt}${nascTxt}`;

      if (c.aceita_contato) {
        modalFichaBadgeWhatsapp.innerHTML = `<span class="badge" style="background:#dcfce7; color:#15803d; font-size:12px; padding:3px 8px; border-radius:12px;">Autoriza WhatsApp (LGPD)</span>`;
        if (modalFichaBtnWhatsapp && c.telefone) {
          const rawTel = c.telefone.replace(/\D/g, '');
          modalFichaBtnWhatsapp.href = `https://wa.me/${rawTel}?text=${encodeURIComponent(`Olá, ${c.nome}! Entramos em contato da Cafeteria do Teatro.`)}`;
          modalFichaBtnWhatsapp.style.display = 'inline-flex';
        }
      } else {
        modalFichaBadgeWhatsapp.innerHTML = `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:12px; padding:3px 8px; border-radius:12px;">Não autoriza WhatsApp</span>`;
        if (modalFichaBtnWhatsapp) modalFichaBtnWhatsapp.style.display = 'none';
      }

      // KPIs
      fichaTotalGasto.textContent = formatarMoeda(res.total_gasto);
      fichaTotalVisitas.textContent = res.total_visitas || 0;
      fichaTicketMedio.textContent = formatarMoeda(res.ticket_medio);
      fichaUltimaVisita.textContent = formatarDataHora(res.ultima_visita);

      // Observações
      if (c.observacoes) {
        fichaTextoObs.textContent = c.observacoes;
        fichaBoxObs.style.display = 'block';
      } else {
        fichaBoxObs.style.display = 'none';
      }

      // Top 5 Produtos
      fichaTbodyTopProdutos.innerHTML = '';
      if (topProdutos.length === 0) {
        fichaTbodyTopProdutos.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:12px; color:#64748b;">Nenhum produto consumido até o momento.</td></tr>';
      } else {
        topProdutos.forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${window.escapeHtml(p.nome_produto)}</strong></td>
            <td style="text-align:center; font-weight:600;">${p.quantidade_total}x</td>
            <td style="text-align:right; font-weight:600; color:#15803d;">${formatarMoeda(p.valor_total)}</td>
          `;
          fichaTbodyTopProdutos.appendChild(tr);
        });
      }

      // Últimos Pedidos
      fichaTbodyPedidos.innerHTML = '';
      if (pedidos.length === 0) {
        fichaTbodyPedidos.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:12px; color:#64748b;">Nenhum pedido registrado para este cliente.</td></tr>';
      } else {
        pedidos.forEach(p => {
          const tr = document.createElement('tr');
          const localStr = p.para_viagem ? '🥡 Viagem' : (p.mesa_codigo ? `Mesa ${p.mesa_codigo}` : 'Balcão');
          const statusBadge = `<span class="badge" style="font-size:11px;">${window.escapeHtml(p.status || 'concluido')}</span>`;

          tr.innerHTML = `
            <td><strong>#${p.numero_pedido || p.id}</strong></td>
            <td style="font-size:12px; color:#475569;">${formatarDataHora(p.created_at)}</td>
            <td>${localStr}</td>
            <td style="font-size:12px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${window.escapeHtml(p.itens_resumo || '')}">
              ${window.escapeHtml(p.itens_resumo || '-')}
            </td>
            <td style="text-align:right; font-weight:bold; color:#15803d;">${formatarMoeda(p.total)}</td>
            <td style="text-align:center;">${statusBadge}</td>
          `;
          fichaTbodyPedidos.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('[Clientes Ficha] Erro:', err);
      window.admin.toast('Erro', 'Falha ao buscar ficha: ' + (err.message || 'tente novamente'), 'error');
    }
  }

  function fecharFicha() {
    if (modalFichaOverlay) modalFichaOverlay.classList.remove('open');
  }

  if (modalFichaClose) modalFichaClose.addEventListener('click', fecharFicha);
  if (btnFecharFicha) btnFecharFicha.addEventListener('click', fecharFicha);

  // --- Modal Mesclar Duplicados ---
  function abrirModalMesclar(clienteOrigem) {
    if (!modalMesclarOverlay) return;
    mesclarOrigemId.value = clienteOrigem.id;
    mesclarOrigemNome.textContent = `${clienteOrigem.nome} (${formatarTelefone(clienteOrigem.telefone)})`;

    mesclarDestinoSelect.innerHTML = '<option value="">Selecione um cliente principal...</option>';
    clientesCache
      .filter(c => c.id !== clienteOrigem.id && c.ativo && !c.anonimizado)
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.nome} - ${formatarTelefone(c.telefone)}`;
        mesclarDestinoSelect.appendChild(opt);
      });

    modalMesclarOverlay.classList.add('open');
  }

  function fecharModalMesclar() {
    if (modalMesclarOverlay) modalMesclarOverlay.classList.remove('open');
  }

  if (modalMesclarClose) modalMesclarClose.addEventListener('click', fecharModalMesclar);
  if (btnCancelarMesclar) btnCancelarMesclar.addEventListener('click', fecharModalMesclar);

  if (btnConfirmarMesclar) {
    btnConfirmarMesclar.addEventListener('click', async () => {
      const origemId = mesclarOrigemId.value;
      const destinoId = mesclarDestinoSelect.value;

      if (!destinoId) {
        window.admin.toast('Atenção', 'Selecione o cliente de destino para receber os pedidos.', 'warn');
        return;
      }

      btnConfirmarMesclar.disabled = true;
      try {
        const res = await window.cafeteriaDB.clientes.mesclar(origemId, destinoId);
        window.admin.toast('Sucesso', `Clientes mesclados! ${res.pedidos_migrados || 0} pedido(s) transferidos.`, 'success');
        fecharModalMesclar();
        await loadData();
      } catch (err) {
        console.error('[Clientes Mesclar] Erro:', err);
        window.admin.toast('Erro', 'Falha ao mesclar clientes: ' + (err.message || 'tente novamente'), 'error');
      } finally {
        btnConfirmarMesclar.disabled = false;
      }
    });
  }

  // --- Anonimizar Cliente (LGPD) ---
  async function anonimizarCliente(cliente) {
    const ok = await window.admin.confirm({
      icon: '🛡️',
      title: 'Anonimizar Dados do Cliente (LGPD)',
      msg: `Deseja anonimizar permanentemente os dados de "${cliente.nome}"? O nome, telefone e email serão apagados para conformidade com a LGPD. Os pedidos serão mantidos sem identificação para garantir a integridade dos relatórios financeiros. Esta ação é irreversível.`,
      okLabel: 'Sim, Anonimizar Dados',
      okClass: 'btn--danger'
    });

    if (!ok) return;

    try {
      await window.cafeteriaDB.clientes.anonimizar(cliente.id);
      window.admin.toast('Sucesso', 'Dados do cliente anonimizados com sucesso em conformidade com a LGPD.', 'success');
      await loadData();
    } catch (err) {
      console.error('[Clientes Anonimizar] Erro:', err);
      window.admin.toast('Erro', 'Falha ao anonimizar: ' + (err.message || 'tente novamente'), 'error');
    }
  }

  // --- Exportar CSV ---
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      const lista = getClientesFiltrados();
      if (lista.length === 0) {
        window.admin.toast('Aviso', 'Não há clientes para exportar com os filtros atuais.', 'warn');
        return;
      }

      const cabecalho = ['ID', 'Nome', 'Telefone', 'Email', 'Data_Nascimento', 'Autoriza_WhatsApp_LGPD', 'Ativo', 'Visitas', 'Total_Gasto_RS', 'Ultima_Visita', 'Criado_Em'];
      const linhas = lista.map(c => {
        const res = pedidosResumoMap.get(c.id) || { visitas: 0, totalGasto: 0, ultimaVisita: null };
        return [
          `"${c.id}"`,
          `"${(c.nome || '').replace(/"/g, '""')}"`,
          `"${c.telefone || ''}"`,
          `"${c.email || ''}"`,
          `"${c.data_nascimento || ''}"`,
          c.aceita_contato ? 'SIM' : 'NAO',
          c.ativo ? 'SIM' : 'NAO',
          res.visitas,
          res.totalGasto.toFixed(2).replace('.', ','),
          `"${formatarDataHora(res.ultimaVisita)}"`,
          `"${formatarDataHora(c.created_at)}"`
        ].join(';');
      });

      const csvContent = [cabecalho.join(';'), ...linhas].join('\r\n');
      window.admin.downloadCSV(`clientes_cafeteria_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
      window.admin.toast('Sucesso', `${lista.length} clientes exportados para CSV!`, 'success');
    });
  }

  // --- Filtros e Busca ---
  if (searchInput) {
    let timerBusca = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timerBusca);
      timerBusca = setTimeout(renderTabela, 150);
    });
  }
  if (filterContato) filterContato.addEventListener('change', renderTabela);
  if (filterStatus) filterStatus.addEventListener('change', renderTabela);

  // Expor globalmente para navegação do admin
  window.initAdminClientes = loadData;
})();
