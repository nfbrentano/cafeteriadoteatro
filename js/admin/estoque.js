/* =========================================================
   ADMIN/ESTOQUE.JS — Controle de Estoque e Insumos (CAF-000031)
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;

  let state = {
    itens: [],
    fornecedores: [],
    filtroSearch: '',
    filtroStatus: '',
    filtroTipo: '',
    extratoItemId: null,
    extratoMovimentos: [],
    scannerStream: null,
    scannerTimer: null,
    scannerTargetInputId: null,
    isInitialized: false
  };

  function estoqueEls() {
    return {
      tableBody: document.getElementById('estoque-table-body'),
      search: document.getElementById('search-estoque'),
      filterStatus: document.getElementById('filter-estoque-status'),
      filterTipo: document.getElementById('filter-estoque-tipo'),
      btnNovo: document.getElementById('btn-novo-estoque-item'),
      btnScanner: document.getElementById('btn-scanner-barcode'),
      btnExportEstoque: document.getElementById('btn-exportar-estoque'),
      btnExportPerdas: document.getElementById('btn-exportar-perdas'),
      
      // KPIs
      kpiTotal: document.getElementById('stat-total-estoque-itens'),
      kpiCritico: document.getElementById('stat-estoque-critico'),
      kpiVencendo: document.getElementById('stat-estoque-vencimento'),
      kpiValorTotal: document.getElementById('stat-estoque-valor-total'),

      // Modal Item
      modalItemOverlay: 'modal-estoque-item-overlay',
      formItem: document.getElementById('form-estoque-item'),
      btnSalvarItem: document.getElementById('btn-salvar-estoque-item'),
      btnCancelItem: document.getElementById('modal-estoque-item-cancel'),
      btnCloseItem: document.getElementById('modal-estoque-item-close'),
      btnScanItemBarcode: document.getElementById('btn-scan-item-barcode'),

      // Modal Movimento
      modalMovOverlay: 'modal-estoque-movimento-overlay',
      formMov: document.getElementById('form-estoque-movimento'),
      btnSalvarMov: document.getElementById('btn-salvar-estoque-movimento'),
      btnCancelMov: document.getElementById('modal-estoque-movimento-cancel'),
      btnCloseMov: document.getElementById('modal-estoque-movimento-close'),
      selectMovItem: document.getElementById('mov-estoque-item-id'),
      selectMovTipo: document.getElementById('mov-estoque-tipo'),
      inputMovQtd: document.getElementById('mov-estoque-quantidade'),
      lblMovQtd: document.getElementById('lbl-mov-quantidade'),
      hintMovQtd: document.getElementById('hint-mov-quantidade'),
      boxMovEntrada: document.getElementById('box-mov-entrada'),
      boxMovAjuste: document.getElementById('box-mov-ajuste'),
      boxMovPerda: document.getElementById('box-mov-perda'),
      lblSaldoAtualAjuste: document.getElementById('lbl-saldo-atual-ajuste'),

      // Modal Extrato
      modalExtratoOverlay: 'modal-estoque-extrato-overlay',
      extratoTitle: document.getElementById('modal-estoque-extrato-title'),
      extratoSub: document.getElementById('modal-estoque-extrato-sub'),
      filterExtratoTipo: document.getElementById('filter-extrato-tipo'),
      filterExtratoPeriodo: document.getElementById('filter-extrato-periodo'),
      extratoTableBody: document.getElementById('estoque-extrato-table-body'),
      btnCloseExtratoHeader: document.getElementById('modal-estoque-extrato-close'),
      btnFecharExtrato: document.getElementById('btn-fechar-extrato'),

      // Modal Scanner
      modalScannerOverlay: 'modal-barcode-scanner-overlay',
      scannerVideo: document.getElementById('barcode-scanner-video'),
      scannerStatus: document.getElementById('barcode-scanner-status'),
      btnCloseScanner: document.getElementById('modal-scanner-close'),
      btnCancelScanner: document.getElementById('modal-scanner-cancel')
    };
  }

  // --- Inicialização da Página ---
  window.initAdminEstoque = async function () {
    const el = estoqueEls();
    if (!el.tableBody) return;

    if (!state.isInitialized) {
      setupEventListeners();
      state.isInitialized = true;
    }

    await carregarDadosEstoque();
  };

  async function carregarDadosEstoque() {
    const el = estoqueEls();
    try {
      if (el.tableBody) {
        el.tableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">⏳<br>Carregando inventário de estoque...</div></td></tr>`;
      }
      
      const itens = await window.cafeteriaDB.estoque.allItens();
      state.itens = itens || [];

      if (window.cafeteriaSupabase) {
        try {
          const { data: fornData } = await window.cafeteriaSupabase
            .from('fornecedores')
            .select('*')
            .order('nome', { ascending: true });
          state.fornecedores = fornData || [];

          const selItemForn = document.getElementById('estoque-item-fornecedor');
          if (selItemForn) {
            selItemForn.innerHTML = '<option value="">Nenhum fornecedor vinculado</option>' +
              state.fornecedores.map(f => `<option value="${f.id}">${window.escapeHtml(f.nome)}</option>`).join('');
          }
          const selMovForn = document.getElementById('mov-estoque-fornecedor');
          if (selMovForn) {
            selMovForn.innerHTML = '<option value="">Selecione um fornecedor...</option>' +
              state.fornecedores.map(f => `<option value="${f.id}">${window.escapeHtml(f.nome)}</option>`).join('');
          }
        } catch (fErr) {
          console.warn('[Estoque] Erro ao carregar fornecedores:', fErr);
        }
      }

      if (admin && admin.appData) {
        admin.appData.estoqueItens = state.itens;
      }

      atualizarKPIs();
      renderTabelaEstoque();
    } catch (err) {
      console.error('Erro ao carregar estoque:', err);
      admin.toast('Erro', 'Não foi possível carregar os dados de estoque.', 'error');
    }
  }

  function atualizarKPIs() {
    const el = estoqueEls();
    const itens = state.itens;

    const totalItens = itens.length;
    const abaixoMinimo = itens.filter(i => Number(i.quantidade ?? i.saldo_atual ?? 0) <= Number(i.estoque_minimo || 0)).length;

    // Próximos 3 dias para validade
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);
    limite3Dias.setHours(23, 59, 59, 999);

    const vencendo = itens.filter(i => {
      if (!i.validade_proxima) return false;
      const d = new Date(i.validade_proxima + 'T00:00:00');
      return d >= hoje && d <= limite3Dias;
    }).length;

    // Valor total do inventário (apenas saldo positivo * custo médio)
    const valorTotal = itens.reduce((acc, i) => {
      const saldo = Math.max(0, Number(i.quantidade ?? i.saldo_atual ?? 0));
      const custo = Number(i.custo_medio ?? i.custo_unitario_medio ?? 0);
      return acc + (saldo * custo);
    }, 0);

    if (el.kpiTotal) el.kpiTotal.textContent = totalItens;
    if (el.kpiCritico) el.kpiCritico.textContent = abaixoMinimo;
    if (el.kpiVencendo) el.kpiVencendo.textContent = vencendo;
    if (el.kpiValorTotal) {
      el.kpiValorTotal.textContent = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
  }

  function renderTabelaEstoque() {
    const el = estoqueEls();
    const search = (state.filtroSearch || '').toLowerCase().trim();
    const statusF = state.filtroStatus;
    const tipoF = state.filtroTipo;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite3Dias = new Date(hoje.getTime() + 3 * 24 * 60 * 60 * 1000);
    limite3Dias.setHours(23, 59, 59, 999);

    const filtrados = state.itens.filter(item => {
      // Busca por nome ou código de barras
      if (search) {
        const nomeMatch = (item.nome || '').toLowerCase().includes(search);
        const codeMatch = (item.codigo_barras || '').toLowerCase().includes(search);
        if (!nomeMatch && !codeMatch) return false;
      }

      // Filtro de tipo
      if (tipoF && item.tipo !== tipoF) return false;

      // Filtro de status
      const saldo = Number(item.quantidade ?? item.saldo_atual ?? 0);
      const min = Number(item.estoque_minimo || 0);
      const isVencendo = item.validade_proxima && (() => {
        const d = new Date(item.validade_proxima + 'T00:00:00');
        return d >= hoje && d <= limite3Dias;
      })();

      if (statusF === 'critico' && saldo > 0) return false;
      if (statusF === 'alerta' && (saldo <= 0 || saldo > min)) return false;
      if (statusF === 'ok' && saldo <= min) return false;
      if (statusF === 'vencendo' && !isVencendo) return false;

      return true;
    });

    if (filtrados.length === 0) {
      el.tableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">📦<br>Nenhum item de estoque encontrado com os filtros selecionados.</div></td></tr>`;
      return;
    }

    const tiposLabels = {
      insumo: 'Insumo / Ingrediente',
      produto_final: 'Produto Revenda',
      embalagem: 'Embalagem / Descartável'
    };

    el.tableBody.innerHTML = filtrados.map(item => {
      const saldo = Number(item.quantidade ?? item.saldo_atual ?? 0);
      const min = Number(item.estoque_minimo || 0);
      const un = item.unidade || item.unidade_medida || 'un';
      const custo = Number(item.custo_medio ?? item.custo_unitario_medio ?? 0);
      const totalValor = Math.max(0, saldo) * custo;

      let badgeSaldo = '';
      if (saldo <= 0) {
        badgeSaldo = `<span class="badge-estoque badge-estoque--critico" title="Estoque zerado ou negativo">⚠️ ${saldo} ${un}</span>`;
      } else if (saldo <= min) {
        badgeSaldo = `<span class="badge-estoque badge-estoque--alerta" title="Estoque no limite de segurança">⚡ ${saldo} ${un}</span>`;
      } else {
        badgeSaldo = `<span class="badge-estoque badge-estoque--ok" title="Estoque regular">✓ ${saldo} ${un}</span>`;
      }

      let validadeHtml = '';
      if (item.validade_proxima) {
        const d = new Date(item.validade_proxima + 'T00:00:00');
        const dFormatada = d.toLocaleDateString('pt-BR');
        if (d < hoje) {
          validadeHtml = `<div style="margin-top:4px;"><span class="badge-estoque badge-estoque--critico" title="Lote vencido!">⛔ Venceu em ${dFormatada}</span></div>`;
        } else if (d <= limite3Dias) {
          validadeHtml = `<div style="margin-top:4px;"><span class="badge-estoque badge-estoque--vencendo" title="Vencendo em breve!">⏳ Vence ${dFormatada}</span></div>`;
        } else {
          validadeHtml = `<div style="margin-top:2px; font-size:11px; color:var(--admin-text-sub);">Val: ${dFormatada}</div>`;
        }
      }

      const barcodeHtml = item.codigo_barras 
        ? `<span style="font-family:monospace; font-size:11px; background:rgba(255,255,255,0.06); padding:1px 6px; border-radius:4px; color:var(--caramelo);" title="Código de barras"># ${item.codigo_barras}</span>` 
        : '';

      const autoEsgotadoBadge = item.esgotado_automatico 
        ? `<span class="status-pill" style="background:#e74c3c;color:#fff;font-size:0.7em;" title="Esgotado automaticamente devido ao saldo zerado">Auto-Esgotado</span>`
        : '';

      return `
        <tr>
          <td class="td-name">
            <div style="font-weight:600; color:var(--admin-text);">${window.escapeHtml(item.nome)}</div>
            <div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">
              ${barcodeHtml}
              ${validadeHtml}
            </div>
          </td>
          <td><span style="color:var(--admin-text-sub); font-size:12px;">${tiposLabels[item.tipo] || item.tipo}</span></td>
          <td>${badgeSaldo}</td>
          <td><span style="font-size:12px; color:var(--admin-text-sub);">${min} ${un}</span></td>
          <td class="td-price" style="font-size:12px;">R$ ${custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="td-price" style="font-weight:600;">R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>
            ${item.ativo ? '<span class="status-pill status-pill--ativo">Ativo</span>' : '<span class="status-pill status-pill--inativo">Inativo</span>'}
            ${autoEsgotadoBadge}
          </td>
          <td>
            <div class="td-actions">
              <button class="btn btn--icon btn--ghost" title="Entrada / Ajuste / Perda" onclick="window.openMovimentoModal(${item.id})">⚖️</button>
              <button class="btn btn--icon btn--ghost" title="Extrato / Histórico" onclick="window.openExtratoModal(${item.id})">📜</button>
              <button class="btn btn--icon btn--ghost" title="Editar Item" onclick="window.openEstoqueItemModal(${item.id})">✏️</button>
              <button class="btn btn--icon btn--danger" title="Excluir Item" onclick="window.deleteEstoqueItem(${item.id})">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // --- Modal de Item de Estoque (CRUD) ---
  window.openEstoqueItemModal = function (itemId = null) {
    const el = estoqueEls();
    const isEdit = !!itemId;
    document.getElementById('modal-estoque-item-title').textContent = isEdit ? 'Editar Item de Estoque' : 'Novo Item de Estoque';
    document.getElementById('estoque-item-id').value = itemId || '';
    el.formItem.reset();

    if (isEdit) {
      const item = state.itens.find(i => String(i.id) === String(itemId));
      if (item) {
        document.getElementById('estoque-item-nome').value = item.nome || '';
        document.getElementById('estoque-item-tipo').value = item.tipo || 'insumo';
        document.getElementById('estoque-item-unidade').value = item.unidade || item.unidade_medida || 'un';
        document.getElementById('estoque-item-minimo').value = item.estoque_minimo !== undefined ? item.estoque_minimo : 5;
        document.getElementById('estoque-item-codigo-barras').value = item.codigo_barras || '';
        document.getElementById('estoque-item-fornecedor').value = item.fornecedor_padrao_id || '';
        document.getElementById('estoque-item-validade').checked = !!item.controla_validade;
        document.getElementById('estoque-item-ativo').checked = item.ativo !== false;
      }
    } else {
      document.getElementById('estoque-item-fornecedor').value = '';
      document.getElementById('estoque-item-minimo').value = '5';
      document.getElementById('estoque-item-ativo').checked = true;
    }

    admin.openModal(el.modalItemOverlay);
  };

  async function salvarItemEstoque() {
    const el = estoqueEls();
    const idVal = document.getElementById('estoque-item-id').value;
    const nome = document.getElementById('estoque-item-nome').value.trim();
    const tipo = document.getElementById('estoque-item-tipo').value;
    const unidade = document.getElementById('estoque-item-unidade').value;
    const estoque_minimo = parseFloat(document.getElementById('estoque-item-minimo').value);
    const fornecedor_padrao_id = document.getElementById('estoque-item-fornecedor').value || null;
    const codigo_barras = document.getElementById('estoque-item-codigo-barras').value.trim() || null;
    const controla_validade = document.getElementById('estoque-item-validade').checked;
    const ativo = document.getElementById('estoque-item-ativo').checked;

    if (!nome) {
      return admin.toast('Atenção', 'Informe o nome do item.', 'warn');
    }
    if (isNaN(estoque_minimo) || estoque_minimo < 0) {
      return admin.toast('Atenção', 'Informe um estoque mínimo válido (>= 0).', 'warn');
    }

    const payload = {
      nome,
      tipo,
      unidade,
      estoque_minimo,
      fornecedor_padrao_id,
      codigo_barras,
      controla_validade,
      ativo,
      updated_at: new Date().toISOString()
    };
    if (idVal) {
      payload.id = parseInt(idVal, 10);
    }

    el.btnSalvarItem.disabled = true;
    el.btnSalvarItem.textContent = 'Salvando...';

    try {
      await window.cafeteriaDB.estoque.upsertItem(payload);
      admin.toast('Sucesso', 'Item de estoque salvo com sucesso.', 'success');
      admin.closeModal(el.modalItemOverlay);
      await carregarDadosEstoque();
    } catch (err) {
      console.error('Erro ao salvar item de estoque:', err);
      admin.toast('Erro', 'Não foi possível salvar o item. Verifique os dados.', 'error');
    } finally {
      el.btnSalvarItem.disabled = false;
      el.btnSalvarItem.textContent = 'Salvar Item';
    }
  }

  window.deleteEstoqueItem = async function (id) {
    const item = state.itens.find(i => String(i.id) === String(id));
    if (!item) return;

    const ok = await admin.confirm({
      title: 'Excluir Item de Estoque?',
      msg: `Deseja realmente excluir "${item.nome}"? Seu histórico e vínculos serão impactados.`,
      okLabel: 'Excluir',
      okClass: 'btn--danger'
    });
    if (!ok) return;

    try {
      await window.cafeteriaDB.estoque.deleteItem(id);
      admin.toast('Item Excluído', `"${item.nome}" foi removido do estoque.`, 'info');
      await carregarDadosEstoque();
    } catch (err) {
      console.error('Erro ao excluir item de estoque:', err);
      admin.toast('Erro', 'Não foi possível excluir o item. Ele pode possuir movimentações registradas.', 'error');
    }
  };

  // --- Modal de Movimentação de Estoque ---
  window.openMovimentoModal = function (preselectedItemId = null, tipoPredefinido = 'entrada') {
    const el = estoqueEls();
    el.formMov.reset();

    // Popular select de itens
    el.selectMovItem.innerHTML = '<option value="">Selecione um item...</option>' +
      state.itens.map(i => {
        const s = i.quantidade ?? i.saldo_atual ?? 0;
        const u = i.unidade || i.unidade_medida || 'un';
        return `<option value="${i.id}" data-saldo="${s}" data-un="${u}">${window.escapeHtml(i.nome)} (Saldo: ${s} ${u})</option>`;
      }).join('');

    if (preselectedItemId) {
      el.selectMovItem.value = String(preselectedItemId);
      const selectedItem = state.itens.find(i => String(i.id) === String(preselectedItemId));
      const selForn = document.getElementById('mov-estoque-fornecedor');
      if (selForn) {
        selForn.value = selectedItem?.fornecedor_padrao_id || '';
      }
    }
    if (tipoPredefinido) {
      el.selectMovTipo.value = tipoPredefinido;
    }

    const custoTotEl = document.getElementById('mov-estoque-custo-total');
    if (custoTotEl) custoTotEl.value = '';
    const checkFin = document.getElementById('mov-estoque-gerar-financeiro');
    if (checkFin) checkFin.checked = false;
    const boxFin = document.getElementById('box-mov-financeiro-detalhes');
    if (boxFin) boxFin.style.display = 'none';
    const vencEl = document.getElementById('mov-estoque-vencimento');
    if (vencEl) vencEl.value = new Date().toISOString().slice(0, 10);
    const pagoHojeEl = document.getElementById('mov-estoque-pago-hoje');
    if (pagoHojeEl) pagoHojeEl.checked = false;

    atualizarCamposMovimento();
    admin.openModal(el.modalMovOverlay);
  };

  function atualizarCamposMovimento() {
    const el = estoqueEls();
    const tipo = el.selectMovTipo.value;
    const selectedOpt = el.selectMovItem.selectedOptions[0];
    const saldoAtual = selectedOpt ? parseFloat(selectedOpt.dataset.saldo || '0') : 0;
    const unidade = selectedOpt ? selectedOpt.dataset.un : 'un';

    // Reset visibility
    el.boxMovEntrada.style.display = 'none';
    el.boxMovAjuste.style.display = 'none';
    el.boxMovPerda.style.display = 'none';

    if (tipo === 'entrada') {
      el.boxMovEntrada.style.display = 'grid';
      el.lblMovQtd.textContent = 'Quantidade de Entrada *';
      el.hintMovQtd.textContent = 'Informe a quantidade comprada / reposta.';
      el.inputMovQtd.placeholder = `Ex: 10 ${unidade}`;

      // Preencher fornecedor se o item tiver fornecedor padrão
      const selectedItemId = el.selectMovItem.value;
      const currentItem = state.itens.find(i => String(i.id) === String(selectedItemId));
      const selForn = document.getElementById('mov-estoque-fornecedor');
      if (selForn && currentItem && currentItem.fornecedor_padrao_id) {
        selForn.value = currentItem.fornecedor_padrao_id;
      }
    } else if (tipo === 'ajuste') {
      el.boxMovAjuste.style.display = 'block';
      el.lblSaldoAtualAjuste.textContent = `${saldoAtual} ${unidade}`;
      el.lblMovQtd.textContent = 'Novo Saldo Real Apurado *';
      el.hintMovQtd.textContent = 'Digite a quantidade física real encontrada na contagem.';
      el.inputMovQtd.placeholder = `Ex: ${saldoAtual}`;
      el.inputMovQtd.value = saldoAtual;
    } else if (tipo === 'perda') {
      el.boxMovPerda.style.display = 'block';
      el.lblMovQtd.textContent = 'Quantidade Perdida / Descartada *';
      el.hintMovQtd.textContent = 'Esta quantidade será debitada do estoque.';
      el.inputMovQtd.placeholder = `Ex: 1 ${unidade}`;
    }
  }

  async function salvarMovimentacaoEstoque() {
    const el = estoqueEls();
    const itemId = parseInt(el.selectMovItem.value, 10);
    const tipo = el.selectMovTipo.value;
    const qtdInput = parseFloat(el.inputMovQtd.value);
    const custoUnit = parseFloat(document.getElementById('mov-estoque-custo').value) || null;
    const dataValidade = document.getElementById('mov-estoque-validade').value || null;
    const motivoRapido = document.getElementById('mov-estoque-motivo-rapido').value;
    const obs = document.getElementById('mov-estoque-observacao').value.trim();

    if (!itemId) {
      return admin.toast('Atenção', 'Selecione um item de estoque.', 'warn');
    }
    if (isNaN(qtdInput) || qtdInput < 0) {
      return admin.toast('Atenção', 'Informe uma quantidade válida.', 'warn');
    }

    const item = state.itens.find(i => i.id === itemId);
    const saldoAtual = Number(item ? (item.quantidade ?? item.saldo_atual ?? 0) : 0);

    let qtdFinal = qtdInput;
    let motivoFinal = obs;

    if (tipo === 'ajuste') {
      // Diferença = saldo apurado - saldo atual
      const diferenca = qtdInput - saldoAtual;
      if (diferenca === 0) {
        return admin.toast('Aviso', 'O saldo apurado é idêntico ao saldo atual. Nenhuma alteração necessária.', 'info');
      }
      qtdFinal = diferenca;
      motivoFinal = `Ajuste de inventário (de ${saldoAtual} para ${qtdInput}): ${obs || 'Contagem física'}`;
    } else if (tipo === 'perda') {
      if (qtdInput <= 0) {
        return admin.toast('Atenção', 'A quantidade de perda deve ser maior que zero.', 'warn');
      }
      motivoFinal = `Perda [${motivoRapido}]: ${obs || 'Descarte'}`;
    } else if (tipo === 'entrada') {
      if (qtdInput <= 0) {
        return admin.toast('Atenção', 'A quantidade de entrada deve ser maior que zero.', 'warn');
      }
      motivoFinal = obs || 'Entrada manual de compra / reposição';
    }

    el.btnSalvarMov.disabled = true;
    el.btnSalvarMov.textContent = 'Registrando...';

    try {
      // 1. O custo médio ponderado é calculado exclusivamente pelo trigger fn_estoque_recalcular_saldo no banco

      // 2. Se marcado para gerar lançamento em Contas a Pagar (CAF-000068)
      let despesaId = null;
      const fornId = document.getElementById('mov-estoque-fornecedor')?.value || item?.fornecedor_padrao_id || null;
      const gerarFin = document.getElementById('mov-estoque-gerar-financeiro')?.checked;

      if (tipo === 'entrada' && gerarFin && window.cafeteriaSupabase) {
        try {
          const custoTotal = parseFloat(document.getElementById('mov-estoque-custo-total')?.value) || ((custoUnit || 0) * qtdInput);
          if (custoTotal > 0) {
            const vencimento = document.getElementById('mov-estoque-vencimento')?.value || new Date().toISOString().slice(0, 10);
            const pagoHoje = document.getElementById('mov-estoque-pago-hoje')?.checked || false;

            // Busca categoria para compras de insumos
            let catId = null;
            const { data: cats } = await window.cafeteriaSupabase
              .from('despesa_categorias')
              .select('id, nome')
              .or('nome.ilike.%Insumos%,nome.ilike.%Mercadorias%')
              .limit(1);
            if (cats && cats.length > 0) catId = cats[0].id;

            const despPayload = window.cafeteriaStockPurchase ? window.cafeteriaStockPurchase.buildStockPayableExpensePayload({
              itemNome: item ? item.nome : 'Item',
              quantidade: qtdInput,
              unidade: item ? (item.unidade_medida || item.unidade || 'un') : 'un',
              custoTotal: custoTotal,
              fornecedorId: fornId,
              vencimento: vencimento,
              pagoHoje: pagoHoje,
              categoriaId: catId
            }) : {
              descricao: `Entrada Estoque: ${qtdInput} - ${item ? item.nome : 'Item'}`,
              valor: custoTotal,
              vencimento: vencimento,
              fornecedor_id: fornId,
              origem: 'estoque'
            };

            const { data: despData, error: despErr } = await window.cafeteriaSupabase
              .from('despesas')
              .insert([despPayload])
              .select()
              .single();

            if (!despErr && despData) {
              despesaId = despData.id;
            }
          }
        } catch (fErr) {
          console.warn('[Estoque] Erro ao lançar despesa em contas_pagar:', fErr);
        }
      }

      // 3. Criar movimento no estoque
      await window.cafeteriaDB.estoque.criarMovimento({
        item_id: itemId,
        tipo,
        quantidade: qtdFinal,
        custo_unitario: custoUnit,
        validade: dataValidade,
        fornecedor_id: fornId,
        despesa_id: despesaId,
        motivo: motivoFinal
      });

      admin.toast('Movimentação Registrada', 'O estoque foi atualizado com sucesso' + (despesaId ? ' e a despesa foi lançada em Contas a Pagar.' : '.'), 'success');
      admin.closeModal(el.modalMovOverlay);
      await carregarDadosEstoque();
    } catch (err) {
      console.error('Erro ao criar movimentação de estoque:', err);
      admin.toast('Erro', 'Não foi possível registrar a movimentação.', 'error');
    } finally {
      el.btnSalvarMov.disabled = false;
      el.btnSalvarMov.textContent = 'Confirmar Movimentação';
    }
  }

  // --- Modal Lista de Compras por Fornecedor (CAF-000068) ---
  window.abrirModalListaCompras = function () {
    const body = document.getElementById('modal-lista-compras-body');
    if (!body || !window.cafeteriaStockPurchase) return;

    const lista = window.cafeteriaStockPurchase.buildShoppingListBySupplier(state.itens, state.fornecedores);

    if (!lista || lista.length === 0) {
      body.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 12px;">✅</div>
          <h4 style="font-size: 1.1rem; color: var(--admin-text); margin-bottom: 6px;">Nenhum item com estoque baixo!</h4>
          <p style="color: var(--text-sec); font-size: 0.9rem;">
            Todos os insumos e produtos estão com saldo superior ao estoque mínimo de alerta.
          </p>
        </div>
      `;
      admin.openModal('modal-lista-compras-overlay');
      return;
    }

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        ${lista.map((grupo, gIdx) => {
          const forn = grupo.fornecedor;
          const itensTotal = grupo.itens.length;
          const msgWhatsapp = window.cafeteriaStockPurchase.formatSupplierWhatsAppOrder(forn.nome, grupo.itens);
          const linkWhatsapp = window.cafeteriaStockPurchase.getWhatsAppShareUrl(forn.telefone, msgWhatsapp);

          return `
            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px; background:#fff;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div>
                  <h4 style="margin:0; font-size:1.05rem; font-weight:700; color:#1e293b;">
                    🏢 ${window.escapeHtml(forn.nome)}
                  </h4>
                  <span style="font-size:0.85rem; color:#64748b;">
                    ${forn.telefone ? `📞 ${forn.telefone}` : 'Telefone não cadastrado'} • <strong>${itensTotal} item(ns) para reposição</strong>
                  </span>
                </div>
                <div style="display:flex; gap:8px;">
                  <button type="button" class="btn btn--sm btn--ghost btn-copiar-pedido-forn" data-idx="${gIdx}">
                    📋 Copiar Pedido
                  </button>
                  <a href="${linkWhatsapp}" target="_blank" rel="noopener noreferrer" class="btn btn--sm btn--primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; background:#16a34a; border-color:#16a34a; color:#fff;">
                    📲 Pedir no WhatsApp
                  </a>
                </div>
              </div>

              <div class="table-scroll">
                <table style="width:100%; font-size:0.88rem; border-collapse:collapse;">
                  <thead>
                    <tr style="border-bottom:1px solid #e2e8f0; text-align:left; color:#64748b; background:#f8fafc;">
                      <th style="padding:8px;">Item / Insumo</th>
                      <th style="padding:8px; text-align:center;">Estoque Atual</th>
                      <th style="padding:8px; text-align:center;">Estoque Mínimo</th>
                      <th style="padding:8px; text-align:center; color:#16a34a; font-weight:700;">Reposição Sugerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${grupo.itens.map(it => `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px; font-weight:600; color:#1e293b;">${window.escapeHtml(it.nome)}</td>
                        <td style="padding:8px; text-align:center; color:#dc2626; font-weight:600;">${it.saldoAtual} ${it.unidade}</td>
                        <td style="padding:8px; text-align:center; color:#64748b;">${it.estoqueMinimo} ${it.unidade}</td>
                        <td style="padding:8px; text-align:center; font-weight:700; color:#16a34a; background:#f0fdf4;">+ ${it.quantidadeSugerida} ${it.unidade}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    body.querySelectorAll('.btn-copiar-pedido-forn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const grupo = lista[idx];
        if (grupo) {
          const text = window.cafeteriaStockPurchase.formatSupplierWhatsAppOrder(grupo.fornecedor.nome, grupo.itens);
          navigator.clipboard.writeText(text).then(() => {
            admin.toast('Copiado', 'Texto do pedido copiado para a área de transferência!', 'success');
          }).catch(() => {
            prompt('Copie o texto do pedido:', text);
          });
        }
      });
    });

    admin.openModal('modal-lista-compras-overlay');
  };

  // --- Modal de Extrato / Histórico ---
  window.openExtratoModal = async function (itemId = null) {
    const el = estoqueEls();
    state.extratoItemId = itemId;

    const item = state.itens.find(i => String(i.id) === String(itemId));
    if (item) {
      const s = item.quantidade ?? item.saldo_atual ?? 0;
      const u = item.unidade || item.unidade_medida || 'un';
      el.extratoTitle.textContent = `Extrato: ${item.nome}`;
      el.extratoSub.textContent = `Saldo atual: ${s} ${u} | Mínimo: ${item.estoque_minimo} ${u}`;
    } else {
      el.extratoTitle.textContent = 'Extrato Geral de Movimentações';
      el.extratoSub.textContent = 'Todas as entradas, saídas, perdas e ajustes';
    }

    admin.openModal(el.modalExtratoOverlay);
    await carregarExtratoMovimentos();
  };

  async function carregarExtratoMovimentos() {
    const el = estoqueEls();
    el.extratoTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Carregando histórico...</td></tr>`;

    const tipoF = el.filterExtratoTipo.value;
    const periodoF = el.filterExtratoPeriodo.value;

    const filtro = {
      limite: 150
    };
    if (state.extratoItemId) {
      filtro.item_id = state.extratoItemId;
    }
    if (tipoF) {
      filtro.tipo = tipoF;
    }
    if (periodoF !== 'todos') {
      const dias = parseInt(periodoF, 10);
      const dataInicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      filtro.data_inicio = dataInicio;
    }

    try {
      const movs = await window.cafeteriaDB.estoque.getMovimentos(filtro);
      state.extratoMovimentos = movs || [];
      renderExtratoTable();
    } catch (err) {
      console.error('Erro ao carregar extrato de estoque:', err);
      el.extratoTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:20px;">Falha ao carregar extrato.</td></tr>`;
    }
  }

  function renderExtratoTable() {
    const el = estoqueEls();
    const movs = state.extratoMovimentos;

    if (!movs || movs.length === 0) {
      el.extratoTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--admin-text-sub); padding:24px;">Nenhuma movimentação encontrada para o período selecionado.</td></tr>`;
      return;
    }

    const badgeTipo = {
      entrada: '<span class="badge-estoque badge-estoque--ok">📥 Entrada</span>',
      saida_venda: '<span class="badge-estoque badge-estoque--alerta">🛒 Venda</span>',
      estorno: '<span class="badge-estoque badge-estoque--vencendo">↩️ Estorno</span>',
      ajuste: '<span class="badge-estoque" style="background:rgba(59,130,246,0.15);color:#60a5fa;">⚖️ Ajuste</span>',
      perda: '<span class="badge-estoque badge-estoque--critico">🗑️ Perda</span>'
    };

    el.extratoTableBody.innerHTML = movs.map(m => {
      const d = new Date(m.created_at);
      const dFormatada = d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const un = m.estoque_itens ? (m.estoque_itens.unidade || m.estoque_itens.unidade_medida || 'un') : 'un';
      const qtdNum = Number(m.quantidade);
      const sinal = qtdNum > 0 ? `+${qtdNum}` : `${qtdNum}`;
      const corQtd = (m.tipo === 'entrada' || (m.tipo === 'ajuste' && qtdNum > 0) || m.tipo === 'estorno') ? '#10b981' : '#ef4444';
      const custoStr = m.custo_unitario ? `R$ ${Number(m.custo_unitario).toFixed(2)}` : '—';
      const valRaw = m.validade || m.data_validade;
      const valStr = valRaw ? new Date(valRaw + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const itemNome = (!state.extratoItemId && m.estoque_itens) ? `<strong>${window.escapeHtml(m.estoque_itens.nome)}</strong> • ` : '';

      return `
        <tr>
          <td style="font-size:12px; white-space:nowrap;">${dFormatada}</td>
          <td>${badgeTipo[m.tipo] || m.tipo}</td>
          <td style="font-weight:700; color:${corQtd};">${sinal} ${un}</td>
          <td style="font-size:12px;">${custoStr}</td>
          <td style="font-size:12px;">${valStr}</td>
          <td style="font-size:12px; color:var(--admin-text);">${itemNome}${window.escapeHtml(m.motivo || '—')}</td>
        </tr>`;
    }).join('');
  }

  // --- Câmera e Scanner de Código de Barras ---
  window.startBarcodeScanner = async function (targetInputId = 'search-estoque') {
    const el = estoqueEls();
    state.scannerTargetInputId = targetInputId;

    admin.openModal(el.modalScannerOverlay);
    el.scannerStatus.textContent = 'Solicitando acesso à câmera...';
    el.scannerStatus.style.color = '#f59e0b';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.scannerStatus.textContent = 'Câmera não suportada neste navegador.';
      el.scannerStatus.style.color = '#ef4444';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      state.scannerStream = stream;
      el.scannerVideo.srcObject = stream;
      await el.scannerVideo.play();

      el.scannerStatus.textContent = 'Alinhe o código de barras no quadro acima...';
      el.scannerStatus.style.color = '#10b981';

      iniciarDeteccaoBarcode();
    } catch (err) {
      console.error('Erro ao acessar câmera para scanner:', err);
      el.scannerStatus.textContent = 'Permissão de câmera negada ou câmera ocupada.';
      el.scannerStatus.style.color = '#ef4444';
    }
  };

  function iniciarDeteccaoBarcode() {
    const el = estoqueEls();
    if (!('BarcodeDetector' in window)) {
      el.scannerStatus.textContent = 'Leitura por câmera não suportada diretamente pelo navegador. Você pode digitar o código manualmente no campo de busca.';
      el.scannerStatus.style.color = '#cbd5e1';
      return;
    }

    const formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'];
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats });
    } catch (e) {
      console.warn('BarcodeDetector formato fallback:', e);
      detector = new window.BarcodeDetector();
    }

    let isScanning = true;
    const scanFrame = async () => {
      if (!isScanning || !state.scannerStream) return;

      try {
        if (el.scannerVideo.readyState === el.scannerVideo.HAVE_ENOUGH_DATA) {
          const barcodes = await detector.detect(el.scannerVideo);
          if (barcodes && barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            isScanning = false;
            onBarcodeFound(code);
            return;
          }
        }
      } catch (err) {
        // frame scan error, continue
      }

      state.scannerTimer = requestAnimationFrame(scanFrame);
    };

    state.scannerTimer = requestAnimationFrame(scanFrame);
  }

  function onBarcodeFound(code) {
    const el = estoqueEls();
    try {
      if (navigator.vibrate) navigator.vibrate(100);
    } catch (e) {}

    el.scannerStatus.textContent = `Código lido: ${code}!`;
    el.scannerStatus.style.color = '#10b981';

    setTimeout(() => {
      window.stopBarcodeScanner();

      const targetInput = document.getElementById(state.scannerTargetInputId);
      if (targetInput) {
        targetInput.value = code;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        targetInput.focus();
      }

      admin.toast('Código Detectado', `Leitura concluída: ${code}`, 'success');
    }, 400);
  }

  window.stopBarcodeScanner = function () {
    const el = estoqueEls();
    if (state.scannerTimer) {
      cancelAnimationFrame(state.scannerTimer);
      state.scannerTimer = null;
    }
    if (state.scannerStream) {
      state.scannerStream.getTracks().forEach(track => track.stop());
      state.scannerStream = null;
    }
    if (el.scannerVideo) {
      el.scannerVideo.srcObject = null;
    }
    admin.closeModal(el.modalScannerOverlay);
  };

  // --- Exportações CSV ---
  function exportarEstoqueCSV() {
    if (state.itens.length === 0) {
      return admin.toast('Aviso', 'Nenhum item para exportar.', 'warn');
    }

    const headers = [
      'ID',
      'Nome',
      'Tipo',
      'Unidade',
      'Saldo Atual',
      'Estoque Minimo',
      'Custo Unitario Medio',
      'Valor Total em Estoque',
      'Codigo de Barras',
      'Validade Mais Proxima',
      'Ativo'
    ];

    const rows = state.itens.map(i => {
      const saldo = Number(i.quantidade ?? i.saldo_atual ?? 0);
      const custo = Number(i.custo_medio ?? i.custo_unitario_medio ?? 0);
      const valor = Math.max(0, saldo) * custo;
      const un = i.unidade || i.unidade_medida || 'un';
      return [
        i.id,
        `"${(i.nome || '').replace(/"/g, '""')}"`,
        i.tipo,
        un,
        saldo.toFixed(3),
        Number(i.estoque_minimo || 0).toFixed(3),
        custo.toFixed(2),
        valor.toFixed(2),
        i.codigo_barras ? `"${i.codigo_barras}"` : '',
        i.validade_proxima || '',
        i.ativo ? 'SIM' : 'NAO'
      ].join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\r\n');
    const dataHora = new Date().toISOString().slice(0, 10);
    admin.downloadCSV(`inventario_estoque_${dataHora}.csv`, csvContent);
    admin.toast('Exportado', 'Relatório de inventário baixado com sucesso.', 'success');
  }

  async function exportarPerdasCSV() {
    try {
      const perdas = await window.cafeteriaDB.estoque.getMovimentos({ tipo: 'perda', limite: 500 });
      if (!perdas || perdas.length === 0) {
        return admin.toast('Aviso', 'Nenhum registro de perda encontrado.', 'warn');
      }

      const headers = [
        'Data Hora',
        'ID Item',
        'Item',
        'Quantidade Perdida',
        'Unidade',
        'Custo Unitario',
        'Custo Total Perda',
        'Motivo / Justificativa'
      ];

      const rows = perdas.map(p => {
        const itemNome = p.estoque_itens ? p.estoque_itens.nome : '';
        const un = p.estoque_itens ? (p.estoque_itens.unidade || p.estoque_itens.unidade_medida || 'un') : 'un';
        const qtd = Math.abs(Number(p.quantidade || 0));
        const custo = Number(p.custo_unitario || 0);
        const custoTotal = qtd * custo;
        const dataStr = new Date(p.created_at).toLocaleString('pt-BR');

        return [
          `"${dataStr}"`,
          p.item_id,
          `"${(itemNome || '').replace(/"/g, '""')}"`,
          qtd.toFixed(3),
          un,
          custo.toFixed(2),
          custoTotal.toFixed(2),
          `"${(p.motivo || '').replace(/"/g, '""')}"`
        ].join(';');
      });

      const csvContent = [headers.join(';'), ...rows].join('\r\n');
      const dataHora = new Date().toISOString().slice(0, 10);
      admin.downloadCSV(`relatorio_perdas_estoque_${dataHora}.csv`, csvContent);
      admin.toast('Exportado', 'Relatório de perdas e descartes baixado com sucesso.', 'success');
    } catch (err) {
      console.error('Erro ao exportar perdas:', err);
      admin.toast('Erro', 'Não foi possível exportar relatório de perdas.', 'error');
    }
  }

  // --- Setup de Listeners ---
  function setupEventListeners() {
    const el = estoqueEls();

    // Filtros
    if (el.search) {
      el.search.addEventListener('input', (e) => {
        state.filtroSearch = e.target.value;
        renderTabelaEstoque();
      });
    }
    if (el.filterStatus) {
      el.filterStatus.addEventListener('change', (e) => {
        state.filtroStatus = e.target.value;
        renderTabelaEstoque();
      });
    }
    if (el.filterTipo) {
      el.filterTipo.addEventListener('change', (e) => {
        state.filtroTipo = e.target.value;
        renderTabelaEstoque();
      });
    }

    // Botões principais da página
    if (el.btnNovo) {
      el.btnNovo.addEventListener('click', () => window.openEstoqueItemModal());
    }
    if (el.btnScanner) {
      el.btnScanner.addEventListener('click', () => window.startBarcodeScanner('search-estoque'));
    }
    if (el.btnExportEstoque) {
      el.btnExportEstoque.addEventListener('click', exportarEstoqueCSV);
    }
    if (el.btnExportPerdas) {
      el.btnExportPerdas.addEventListener('click', exportarPerdasCSV);
    }

    // Modal Item
    if (el.btnSalvarItem) {
      el.btnSalvarItem.addEventListener('click', salvarItemEstoque);
    }
    if (el.btnCancelItem) {
      el.btnCancelItem.addEventListener('click', () => admin.closeModal(el.modalItemOverlay));
    }
    if (el.btnCloseItem) {
      el.btnCloseItem.addEventListener('click', () => admin.closeModal(el.modalItemOverlay));
    }
    if (el.btnScanItemBarcode) {
      el.btnScanItemBarcode.addEventListener('click', () => window.startBarcodeScanner('estoque-item-codigo-barras'));
    }

    // Modal Movimento
    if (el.selectMovItem) {
      el.selectMovItem.addEventListener('change', atualizarCamposMovimento);
    }
    if (el.selectMovTipo) {
      el.selectMovTipo.addEventListener('change', atualizarCamposMovimento);
    }
    if (el.btnSalvarMov) {
      el.btnSalvarMov.addEventListener('click', salvarMovimentacaoEstoque);
    }
    if (el.btnCancelMov) {
      el.btnCancelMov.addEventListener('click', () => admin.closeModal(el.modalMovOverlay));
    }
    if (el.btnCloseMov) {
      el.btnCloseMov.addEventListener('click', () => admin.closeModal(el.modalMovOverlay));
    }

    // Modal Extrato
    if (el.filterExtratoTipo) {
      el.filterExtratoTipo.addEventListener('change', carregarExtratoMovimentos);
    }
    if (el.filterExtratoPeriodo) {
      el.filterExtratoPeriodo.addEventListener('change', carregarExtratoMovimentos);
    }
    if (el.btnCloseExtratoHeader) {
      el.btnCloseExtratoHeader.addEventListener('click', () => admin.closeModal(el.modalExtratoOverlay));
    }
    if (el.btnFecharExtrato) {
      el.btnFecharExtrato.addEventListener('click', () => admin.closeModal(el.modalExtratoOverlay));
    }

    // Modal Scanner
    if (el.btnCloseScanner) {
      el.btnCloseScanner.addEventListener('click', window.stopBarcodeScanner);
    }
    if (el.btnCancelScanner) {
      el.btnCancelScanner.addEventListener('click', window.stopBarcodeScanner);
    }

    // CAF-000068: Botão Lista de Compras
    const btnLista = document.getElementById('btn-estoque-lista-compras');
    if (btnLista) {
      btnLista.addEventListener('click', window.abrirModalListaCompras);
    }
    const closeLista = document.getElementById('modal-lista-compras-close');
    const fecharLista = document.getElementById('modal-lista-compras-fechar');
    [closeLista, fecharLista].forEach(b => {
      b?.addEventListener('click', () => admin.closeModal('modal-lista-compras-overlay'));
    });

    // CAF-000068: Toggle de lançamento financeiro
    const checkGerarFin = document.getElementById('mov-estoque-gerar-financeiro');
    const boxFinDetalhes = document.getElementById('box-mov-financeiro-detalhes');
    if (checkGerarFin && boxFinDetalhes) {
      checkGerarFin.addEventListener('change', () => {
        boxFinDetalhes.style.display = checkGerarFin.checked ? 'grid' : 'none';
      });
    }

    // CAF-000068: Recálculo automático de custo unitário com base no custo total
    const inputCustoTotal = document.getElementById('mov-estoque-custo-total');
    const inputQtd = el.inputMovQtd;
    const inputCustoUnit = document.getElementById('mov-estoque-custo');
    function recalcularUnit() {
      const tot = parseFloat(inputCustoTotal?.value || '0');
      const q = parseFloat(inputQtd?.value || '0');
      if (tot > 0 && q > 0 && inputCustoUnit) {
        inputCustoUnit.value = (tot / q).toFixed(4);
      }
    }
    inputCustoTotal?.addEventListener('input', recalcularUnit);
    inputQtd?.addEventListener('input', recalcularUnit);
  }

})();
