/**
 * js/admin/clientes-admin.js
 * Gestão de Clientes, Ficha 360, Conta Corrente, Segmentação RFV, Tags e Campanhas WhatsApp
 * (CAF-000033, CAF-000034, CAF-000041)
 */
(function () {
  'use strict';

  let clientesCache = [];
  let rfvMap = new Map(); // cliente_id -> dados de v_clientes_rfv ou fallback
  let pedidosResumoMap = new Map(); // cliente_id -> { visitas, totalGasto, ultimaVisita }
  let saldosResumoMap = new Map();  // cliente_id -> { saldo, limite_credito, limite_disponivel, conta_habilitada, dia_vencimento }
  let tagsCache = []; // [{ id, nome, cor }]
  let tagVinculosMap = new Map(); // cliente_id -> Set<tag_id>
  let selectedClienteIds = new Set();

  let activeClienteConta = null;
  let activeExtratoData = null;
  let activeFichaClienteId = null;
  let activeCampanha = null;
  let activeCampanhaEnviosSet = new Set();

  let crmConfig = {
    dias_ativo: 30,
    dias_perdido: 90,
    pedidos_fiel_90d: 4,
    antispam_dias: 7
  };

  // Elementos da Página
  const pageClientes = document.getElementById('page-clientes');
  if (!pageClientes) return;

  const tbody = document.getElementById('tbody-clientes');
  const searchInput = document.getElementById('search-cliente');
  const filterSegmento = document.getElementById('filter-cliente-segmento');
  const filterTag = document.getElementById('filter-cliente-tag');
  const filterProduto = document.getElementById('filter-cliente-produto');
  const filterPeriodo = document.getElementById('filter-cliente-periodo');
  const filterContato = document.getElementById('filter-cliente-contato');
  const filterConta = document.getElementById('filter-cliente-conta');
  const filterStatus = document.getElementById('filter-cliente-status');
  const btnNovoCliente = document.getElementById('btn-novo-cliente');
  const btnExportCSV = document.getElementById('btn-export-clientes');
  const btnCrmTags = document.getElementById('btn-crm-tags');
  const btnCrmCampanhas = document.getElementById('btn-crm-campanhas');

  // Seleção em lote
  const chkSelectAll = document.getElementById('chk-select-all-clientes');
  const batchBar = document.getElementById('clientes-batch-bar');
  const batchCount = document.getElementById('clientes-batch-count');
  const batchTagSelect = document.getElementById('batch-tag-select');
  const btnBatchAplicarTag = document.getElementById('btn-batch-aplicar-tag');
  const btnBatchRemoverTag = document.getElementById('btn-batch-remover-tag');

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
  const fichaSegmentoBadge = document.getElementById('ficha-segmento-badge');
  const fichaTagsContainer = document.getElementById('ficha-tags-container');
  const fichaSelectNovaTag = document.getElementById('ficha-select-nova-tag');
  const btnFichaAddTag = document.getElementById('btn-ficha-add-tag');
  const btnFichaOptoutLgpd = document.getElementById('btn-ficha-optout-lgpd');
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

  // Modais CRM (Tags e Campanhas)
  const modalCrmTagsOverlay = document.getElementById('modal-crm-tags-overlay');
  const modalCrmTagsClose = document.getElementById('modal-crm-tags-close');
  const formCriarTagCrm = document.getElementById('form-criar-tag-crm');
  const modalCrmCampanhasOverlay = document.getElementById('modal-crm-campanhas-overlay');
  const modalCrmCampanhasClose = document.getElementById('modal-crm-campanhas-close');

  const SEGMENTO_STYLES = {
    'Novo': { bg: '#dbeafe', color: '#1d4ed8', icon: '🌱' },
    'Fiel': { bg: '#fef9c3', color: '#a16207', icon: '👑' },
    'Ativo': { bg: '#dcfce7', color: '#15803d', icon: '✅' },
    'Em risco': { bg: '#ffedd5', color: '#c2410c', icon: '⚠️' },
    'Perdido': { bg: '#fee2e2', color: '#b91c1c', icon: '💤' }
  };

  function renderSegmentoBadge(seg) {
    const s = SEGMENTO_STYLES[seg] || SEGMENTO_STYLES['Perdido'];
    return `<span class="badge" style="background:${s.bg}; color:${s.color}; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; white-space:nowrap;">${s.icon} ${seg || 'Perdido'}</span>`;
  }

  function renderTagChip(tag, removable = false, clienteId = null) {
    const cor = tag.cor || '#c9973a';
    const btnRemove = removable
      ? `<button type="button" class="btn-rm-tag-ficha" data-cliente="${clienteId}" data-tag="${tag.id}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;margin-left:4px;padding:0 2px;" title="Remover tag">✕</button>`
      : '';
    return `<span style="display:inline-flex;align-items:center;background:${cor}22;color:${cor};border:1px solid ${cor}66;font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;">${window.escapeHtml(tag.nome)}${btnRemove}</span>`;
  }

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

  function calcularSegmentoLocal(primeiraCompra, ultimaCompra, pedidos90d) {
    if (!ultimaCompra) return 'Perdido';
    const agora = Date.now();
    const diasUltima = (agora - new Date(ultimaCompra).getTime()) / (1000 * 60 * 60 * 24);
    const diasPrimeira = primeiraCompra ? (agora - new Date(primeiraCompra).getTime()) / (1000 * 60 * 60 * 24) : 999;

    if (diasPrimeira <= crmConfig.dias_ativo) return 'Novo';
    if (diasUltima <= crmConfig.dias_ativo && pedidos90d >= crmConfig.pedidos_fiel_90d) return 'Fiel';
    if (diasUltima <= crmConfig.dias_ativo) return 'Ativo';
    if (diasUltima <= crmConfig.dias_perdido) return 'Em risco';
    return 'Perdido';
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

  async function carregarConfigECrmAuxiliar() {
    const sb = window.cafeteriaSupabase || window.supabaseClient;
    if (!sb) return;

    // 1. Parâmetros configuráveis de CRM
    try {
      const { data: cfgs } = await sb
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['crm_dias_ativo', 'crm_dias_perdido', 'crm_pedidos_fiel_90d', 'crm_antispam_dias']);

      if (Array.isArray(cfgs)) {
        cfgs.forEach(row => {
          const n = parseInt(String(row.valor).replace(/\D/g, ''), 10);
          if (!isNaN(n) && n > 0) {
            if (row.chave === 'crm_dias_ativo') crmConfig.dias_ativo = n;
            if (row.chave === 'crm_dias_perdido') crmConfig.dias_perdido = n;
            if (row.chave === 'crm_pedidos_fiel_90d') crmConfig.pedidos_fiel_90d = n;
            if (row.chave === 'crm_antispam_dias') crmConfig.antispam_dias = n;
          }
        });
      }
    } catch (e) { /* ignora */ }

    // 2. Tags e vínculos
    tagsCache = [];
    tagVinculosMap.clear();
    try {
      const [{ data: tagsData }, { data: vincData }] = await Promise.all([
        sb.from('cliente_tags').select('*').order('nome'),
        sb.from('cliente_tag_vinculos').select('cliente_id, tag_id')
      ]);
      if (Array.isArray(tagsData)) tagsCache = tagsData;
      if (Array.isArray(vincData)) {
        vincData.forEach(v => {
          if (!tagVinculosMap.has(v.cliente_id)) tagVinculosMap.set(v.cliente_id, new Set());
          tagVinculosMap.get(v.cliente_id).add(Number(v.tag_id));
        });
      }
    } catch (e) { /* tabela pode ainda não estar migrada */ }

    popularSelectsTagsEProdutos();
  }

  function popularSelectsTagsEProdutos() {
    const tagOptionsHtml = tagsCache.map(t => `<option value="${t.id}">🏷️ ${window.escapeHtml(t.nome)}</option>`).join('');

    if (filterTag) {
      const cur = filterTag.value;
      filterTag.innerHTML = `<option value="">Todas as Tags</option>${tagOptionsHtml}`;
      filterTag.value = cur;
    }
    if (batchTagSelect) {
      batchTagSelect.innerHTML = `<option value="">Escolher Tag...</option>${tagOptionsHtml}`;
    }
    if (fichaSelectNovaTag) {
      fichaSelectNovaTag.innerHTML = `<option value="">+ Adicionar tag ao cliente...</option>${tagOptionsHtml}`;
    }
    const campTag = document.getElementById('camp-tag');
    if (campTag) {
      const cur = campTag.value;
      campTag.innerHTML = `<option value="">Qualquer tag</option>${tagOptionsHtml}`;
      campTag.value = cur;
    }

    // Produtos para filtro
    const prods = (window.admin && window.admin.appData && Array.isArray(window.admin.appData.produtos))
      ? window.admin.appData.produtos
      : [];
    const prodOptionsHtml = prods
      .slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      .map(p => `<option value="${p.id}">${window.escapeHtml(p.nome)}</option>`)
      .join('');

    if (filterProduto) {
      const cur = filterProduto.value;
      filterProduto.innerHTML = `<option value="">Qualquer produto comprado</option>${prodOptionsHtml}`;
      filterProduto.value = cur;
    }
    const campProd = document.getElementById('camp-produto');
    if (campProd) {
      const cur = campProd.value;
      campProd.innerHTML = `<option value="">Qualquer produto</option>${prodOptionsHtml}`;
      campProd.value = cur;
    }
  }

  // --- Carregamento de Dados ---
  async function loadData() {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">Carregando clientes e segmentação RFV...</td></tr>';

    try {
      await carregarConfigECrmAuxiliar();
      const sb = window.cafeteriaSupabase || window.supabaseClient;

      // 1. Carregar todos os clientes
      const clientes = await window.cafeteriaDB.clientes.all({ apenasAtivos: false });
      clientesCache = clientes || [];

      // 2. Tentar carregar v_clientes_rfv (CAF-000041)
      rfvMap.clear();
      pedidosResumoMap.clear();

      let rfvCarregada = false;
      if (sb) {
        try {
          const { data: rfvData, error: rfvErr } = await sb.from('v_clientes_rfv').select('*');
          if (!rfvErr && Array.isArray(rfvData)) {
            rfvCarregada = true;
            rfvData.forEach(r => {
              rfvMap.set(r.cliente_id, r);
              pedidosResumoMap.set(r.cliente_id, {
                visitas: Number(r.total_pedidos) || 0,
                pedidos90d: Number(r.pedidos_90d) || 0,
                totalGasto: Number(r.total_gasto) || 0,
                ultimaVisita: r.ultima_compra || null,
                primeiraCompra: r.primeira_compra || null,
                produtoFavorito: r.produto_favorito || null,
                produtosCompradosIds: r.produtos_comprados_ids || [],
                segmento: r.segmento || 'Perdido',
                segmentoMesAnterior: r.segmento_mes_anterior || null,
                bloqueadoAntispam: Boolean(r.bloqueado_antispam)
              });
            });
          }
        } catch (e) {
          rfvCarregada = false;
        }
      }

      // Fallback caso a view v_clientes_rfv ainda não tenha sido aplicada no banco
      if (!rfvCarregada && sb) {
        try {
          const { data: pedidosData, error: pedidosErr } = await sb
            .from('pedidos')
            .select('id, cliente_id, total, created_at, status')
            .not('cliente_id', 'is', null)
            .neq('status', 'cancelado');

          const limite90d = Date.now() - 90 * 24 * 60 * 60 * 1000;
          if (!pedidosErr && Array.isArray(pedidosData)) {
            pedidosData.forEach(p => {
              const cid = p.cliente_id;
              const item = pedidosResumoMap.get(cid) || {
                visitas: 0, pedidos90d: 0, totalGasto: 0, ultimaVisita: null, primeiraCompra: null,
                produtoFavorito: null, produtosCompradosIds: [], segmento: 'Perdido', segmentoMesAnterior: null
              };
              item.visitas += 1;
              if (new Date(p.created_at).getTime() >= limite90d) item.pedidos90d += 1;
              item.totalGasto += (Number(p.total) || 0);
              if (!item.ultimaVisita || new Date(p.created_at) > new Date(item.ultimaVisita)) {
                item.ultimaVisita = p.created_at;
              }
              if (!item.primeiraCompra || new Date(p.created_at) < new Date(item.primeiraCompra)) {
                item.primeiraCompra = p.created_at;
              }
              pedidosResumoMap.set(cid, item);
            });
          }
        } catch (errPedidos) {
          console.warn('[Clientes] Falha ao agregar compras dos clientes:', errPedidos);
        }
      }

      // Garantir que todo cliente tenha resumo e segmento calculado
      clientesCache.forEach(c => {
        if (!pedidosResumoMap.has(c.id)) {
          pedidosResumoMap.set(c.id, {
            visitas: 0, pedidos90d: 0, totalGasto: 0, ultimaVisita: null, primeiraCompra: null,
            produtoFavorito: null, produtosCompradosIds: [], segmento: 'Perdido', segmentoMesAnterior: null,
            bloqueadoAntispam: false
          });
        } else {
          const r = pedidosResumoMap.get(c.id);
          if (!r.segmento) {
            r.segmento = calcularSegmentoLocal(r.primeiraCompra, r.ultimaVisita, r.pedidos90d);
          }
        }
      });

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

      atualizarKPIsESegmentos();
      renderTabela();
    } catch (err) {
      console.error('[Clientes] Erro ao carregar:', err);
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#c62828; padding:20px;">Erro ao carregar clientes: ${err.message || 'tente novamente'}</td></tr>`;
    }
  }

  function atualizarKPIsESegmentos() {
    const total = clientesCache.length;
    let comPedidosCount = 0;
    let whatsappCount = 0;
    let totalGastoGeral = 0;
    let totalVisitasGeral = 0;

    const segAtual = { 'Novo': 0, 'Fiel': 0, 'Ativo': 0, 'Em risco': 0, 'Perdido': 0 };
    const segAnt = { 'Novo': 0, 'Fiel': 0, 'Ativo': 0, 'Em risco': 0, 'Perdido': 0 };

    clientesCache.forEach(c => {
      if (c.aceita_contato) whatsappCount++;
      const res = pedidosResumoMap.get(c.id);
      if (res && res.visitas > 0) {
        comPedidosCount++;
        totalGastoGeral += res.totalGasto;
        totalVisitasGeral += res.visitas;
      }
      if (c.ativo !== false) {
        const s = (res && res.segmento) || 'Perdido';
        if (segAtual[s] !== undefined) segAtual[s]++;
        if (res && res.segmentoMesAnterior && segAnt[res.segmentoMesAnterior] !== undefined) {
          segAnt[res.segmentoMesAnterior]++;
        }
      }
    });

    // Atualiza cartões de segmento e variação vs mês anterior
    ['Novo', 'Fiel', 'Ativo', 'Em risco', 'Perdido'].forEach(seg => {
      const countEl = document.getElementById(`count-seg-${seg}`);
      const varEl = document.getElementById(`var-seg-${seg}`);
      if (countEl) countEl.textContent = segAtual[seg];
      if (varEl) {
        const diff = segAtual[seg] - segAnt[seg];
        const sinal = diff > 0 ? `+${diff}` : String(diff);
        const cor = diff > 0 ? '#15803d' : (diff < 0 ? '#dc2626' : '#64748b');
        varEl.innerHTML = `<span style="color:${cor}; font-weight:700;" title="Variação em relação a 30 dias atrás">${sinal} vs. mês ant.</span>`;
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
    const segVal = filterSegmento ? filterSegmento.value : '';
    const tagVal = filterTag && filterTag.value ? Number(filterTag.value) : null;
    const prodVal = filterProduto ? filterProduto.value : '';
    const periodoVal = filterPeriodo ? filterPeriodo.value : '';
    const filtroZap = filterContato ? filterContato.value : '';
    const filtroConta = filterConta ? filterConta.value : 'todas';
    const filtroSt = filterStatus ? filterStatus.value : 'ativos';

    const agora = Date.now();

    return clientesCache.filter(c => {
      if (filtroSt === 'ativos' && !c.ativo) return false;
      if (filtroZap === 'sim' && !c.aceita_contato) return false;
      if (filtroZap === 'nao' && c.aceita_contato) return false;

      const res = pedidosResumoMap.get(c.id) || {
        visitas: 0, pedidos90d: 0, totalGasto: 0, ultimaVisita: null,
        produtoFavorito: null, produtosCompradosIds: [], segmento: 'Perdido'
      };

      // Filtro Segmento RFV
      if (segVal && res.segmento !== segVal) return false;

      // Filtro Tag
      if (tagVal) {
        const setTags = tagVinculosMap.get(c.id);
        if (!setTags || !setTags.has(tagVal)) return false;
      }

      // Filtro Produto já comprado
      if (prodVal) {
        const listaProds = Array.isArray(res.produtosCompradosIds) ? res.produtosCompradosIds : [];
        if (!listaProds.includes(prodVal)) return false;
      }

      // Filtro Período da última compra
      if (periodoVal) {
        const dias = res.ultimaVisita
          ? (agora - new Date(res.ultimaVisita).getTime()) / (1000 * 60 * 60 * 24)
          : 99999;
        if (periodoVal === '7d' && dias > 7) return false;
        if (periodoVal === '30d' && dias > 30) return false;
        if (periodoVal === '31_90d' && (dias <= 30 || dias > 90)) return false;
        if (periodoVal === 'mais_90d' && dias <= 90) return false;
      }

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
        const matchFav = (res.produtoFavorito || '').toLowerCase().includes(termo);
        const matchTel = termoDigitos.length >= 2 && (c.telefone || '').includes(termoDigitos);
        if (!matchNome && !matchEmail && !matchFav && !matchTel) return false;
      }

      return true;
    });
  }

  function atualizarBarraBatch() {
    if (!batchBar || !batchCount) return;
    const qtd = selectedClienteIds.size;
    if (qtd > 0) {
      batchCount.textContent = `${qtd} selecionado(s)`;
      batchBar.style.display = 'flex';
    } else {
      batchBar.style.display = 'none';
    }
  }

  function renderTabela() {
    const lista = getClientesFiltrados();
    tbody.innerHTML = '';

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#64748b;">Nenhum cliente encontrado com os filtros aplicados.</td></tr>';
      atualizarBarraBatch();
      return;
    }

    lista.forEach(c => {
      const tr = document.createElement('tr');
      if (!c.ativo) tr.style.opacity = '0.6';

      const res = pedidosResumoMap.get(c.id) || {
        visitas: 0, pedidos90d: 0, totalGasto: 0, ultimaVisita: null, produtoFavorito: null, segmento: 'Perdido'
      };
      const zapBadge = c.aceita_contato
        ? `<span class="badge" style="background:#dcfce7; color:#15803d; font-size:11px; padding:2px 8px; border-radius:12px;">Sim 💬</span>`
        : `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:11px; padding:2px 8px; border-radius:12px;">Não</span>`;

      const statusBadge = !c.ativo
        ? ` <span class="badge" style="background:#fee2e2; color:#991b1b; font-size:10px; margin-left:4px;">Inativo</span>`
        : '';

      const anonBadge = c.anonimizado
        ? ` <span class="badge" style="background:#fef3c7; color:#92400e; font-size:10px; margin-left:4px;">Anonimizado</span>`
        : '';

      // Tags vinculadas ao cliente
      const clienteTagSet = tagVinculosMap.get(c.id) || new Set();
      const tagsHtml = Array.from(clienteTagSet)
        .map(tid => tagsCache.find(t => Number(t.id) === Number(tid)))
        .filter(Boolean)
        .map(t => renderTagChip(t))
        .join(' ');

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

      const checkedAttr = selectedClienteIds.has(c.id) ? 'checked' : '';
      const favHtml = res.produtoFavorito
        ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">☕ Fav: ${window.escapeHtml(res.produtoFavorito)}</div>`
        : '';

      tr.innerHTML = `
        <td style="text-align:center;">
          <input type="checkbox" class="chk-cliente-row" data-id="${c.id}" ${checkedAttr} />
        </td>
        <td>
          <strong>${window.escapeHtml(c.nome)}</strong>
          ${statusBadge}${anonBadge}
          ${favHtml}
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            ${renderSegmentoBadge(res.segmento)}
            ${tagsHtml ? `<div style="display:flex; flex-wrap:wrap; gap:3px;">${tagsHtml}</div>` : ''}
          </div>
        </td>
        <td>
          <div>${formatarTelefone(c.telefone)}</div>
          ${c.email ? `<div style="font-size:11px; color:#64748b;">${window.escapeHtml(c.email)}</div>` : ''}
        </td>
        <td style="text-align:center; font-weight:600;">
          <span title="Pedidos nos últimos 90 dias">${res.pedidos90d || 0}</span>
          <span style="color:#94a3b8; font-weight:400;"> / ${res.visitas}</span>
        </td>
        <td style="text-align:right; font-weight:600; color:#15803d;">${formatarMoeda(res.totalGasto)}</td>
        <td style="text-align:center;">${contaTdHtml}</td>
        <td style="font-size:12px; color:#475569;">${formatarDataHora(res.ultimaVisita)}</td>
        <td style="text-align:center;">${zapBadge}</td>
        <td style="text-align:center; white-space:nowrap;">
          <div style="display:flex; justify-content:center; gap:4px;">
            <button class="btn btn--ghost btn--small btn-conta-cliente" data-id="${c.id}" title="Gerenciar Conta Corrente e Extrato" style="color:#0284c7;">💳 Conta</button>
            <button class="btn btn--ghost btn--small btn-ver-ficha" data-id="${c.id}" title="Ver Ficha 360 e Tags do Cliente">👁️ Ficha</button>
            <button class="btn btn--ghost btn--small btn-editar-cliente" data-id="${c.id}" title="Editar dados">✏️</button>
            <button class="btn btn--ghost btn--small btn-mesclar-cliente" data-id="${c.id}" title="Mesclar duplicado">🔗</button>
            ${!c.anonimizado ? `<button class="btn btn--ghost btn--small btn-anonimizar-cliente" data-id="${c.id}" title="Anonimizar dados (LGPD)" style="color:#b91c1c;">🗑️</button>` : ''}
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Checkboxes de seleção em lote
    tbody.querySelectorAll('.chk-cliente-row').forEach(chk => {
      chk.addEventListener('change', () => {
        const cid = chk.dataset.id;
        if (chk.checked) selectedClienteIds.add(cid);
        else selectedClienteIds.delete(cid);
        atualizarBarraBatch();
      });
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

    atualizarBarraBatch();
  }

  // Seleção em lote: selecionar todos e aplicar/remover tag
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', () => {
      const visiveis = getClientesFiltrados();
      if (chkSelectAll.checked) {
        visiveis.forEach(c => selectedClienteIds.add(c.id));
      } else {
        visiveis.forEach(c => selectedClienteIds.delete(c.id));
      }
      renderTabela();
    });
  }

  async function manipularTagEmLote(acao) {
    const tagId = Number(batchTagSelect?.value);
    if (!tagId) {
      window.admin.toast('Aviso', 'Selecione uma tag primeiro.', 'warn');
      return;
    }
    const ids = Array.from(selectedClienteIds);
    if (!ids.length) return;

    const sb = window.cafeteriaSupabase || window.supabaseClient;
    try {
      if (acao === 'aplicar') {
        const rows = ids.map(cid => ({ cliente_id: cid, tag_id: tagId }));
        const { error } = await sb.from('cliente_tag_vinculos').upsert(rows, { onConflict: 'cliente_id,tag_id' });
        if (error) throw error;
        window.admin.toast('Sucesso', `Tag aplicada em ${ids.length} cliente(s)!`, 'success');
      } else {
        const { error } = await sb
          .from('cliente_tag_vinculos')
          .delete()
          .eq('tag_id', tagId)
          .in('cliente_id', ids);
        if (error) throw error;
        window.admin.toast('Sucesso', `Tag removida de ${ids.length} cliente(s)!`, 'success');
      }
      await loadData();
    } catch (err) {
      window.admin.toast('Erro', err.message || 'Falha ao atualizar tags em lote.', 'error');
    }
  }

  if (btnBatchAplicarTag) btnBatchAplicarTag.addEventListener('click', () => manipularTagEmLote('aplicar'));
  if (btnBatchRemoverTag) btnBatchRemoverTag.addEventListener('click', () => manipularTagEmLote('remover'));

  // Clique nos cartões de segmento para filtrar rapidamente
  document.querySelectorAll('.crm-seg-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!filterSegmento) return;
      const seg = card.dataset.seg;
      filterSegmento.value = (filterSegmento.value === seg) ? '' : seg;
      renderTabela();
    });
  });

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
  function renderTagsNaFicha(clienteId) {
    if (!fichaTagsContainer) return;
    const tagSet = tagVinculosMap.get(clienteId) || new Set();
    const tags = Array.from(tagSet)
      .map(tid => tagsCache.find(t => Number(t.id) === Number(tid)))
      .filter(Boolean);

    if (!tags.length) {
      fichaTagsContainer.innerHTML = '<span style="font-size:12px; color:#94a3b8;">Nenhuma tag vinculada a este cliente.</span>';
      return;
    }

    fichaTagsContainer.innerHTML = tags.map(t => renderTagChip(t, true, clienteId)).join('');
    fichaTagsContainer.querySelectorAll('.btn-rm-tag-ficha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sb = window.cafeteriaSupabase || window.supabaseClient;
        const tagId = Number(btn.dataset.tag);
        await sb.from('cliente_tag_vinculos').delete().eq('cliente_id', clienteId).eq('tag_id', tagId);
        await loadData();
        renderTagsNaFicha(clienteId);
      });
    });
  }

  async function abrirFicha(clienteId) {
    if (!modalFichaOverlay) return;
    activeFichaClienteId = clienteId;

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

    const resRfv = pedidosResumoMap.get(clienteId) || { segmento: 'Perdido' };
    if (fichaSegmentoBadge) fichaSegmentoBadge.innerHTML = renderSegmentoBadge(resRfv.segmento);
    renderTagsNaFicha(clienteId);

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

      modalFichaNome.textContent = c.nome;
      const telFmt = formatarTelefone(c.telefone);
      const emailTxt = c.email || 'Sem e-mail';
      const nascTxt = c.data_nascimento ? ` | Nasc: ${formatarData(c.data_nascimento)}` : '';
      modalFichaContato.textContent = `Telefone: ${telFmt} | E-mail: ${emailTxt}${nascTxt}`;

      if (btnFichaOptoutLgpd) {
        btnFichaOptoutLgpd.style.display = c.aceita_contato ? 'inline-flex' : 'none';
      }

      if (c.aceita_contato) {
        modalFichaBadgeWhatsapp.innerHTML = `<span class="badge" style="background:#dcfce7; color:#15803d; font-size:12px; padding:3px 8px; border-radius:12px;">Autoriza WhatsApp (LGPD)</span>`;
        if (modalFichaBtnWhatsapp && c.telefone) {
          const rawTel = c.telefone.replace(/\D/g, '');
          modalFichaBtnWhatsapp.href = `https://wa.me/55${rawTel.replace(/^55/, '')}?text=${encodeURIComponent(`Olá, ${c.nome}! Entramos em contato da Cafeteria do Teatro.`)}`;
          modalFichaBtnWhatsapp.style.display = 'inline-flex';
        }
      } else {
        modalFichaBadgeWhatsapp.innerHTML = `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:12px; padding:3px 8px; border-radius:12px;">Não autoriza WhatsApp (Opt-out LGPD)</span>`;
        if (modalFichaBtnWhatsapp) modalFichaBtnWhatsapp.style.display = 'none';
      }

      fichaTotalGasto.textContent = formatarMoeda(res.total_gasto);
      fichaTotalVisitas.textContent = res.total_visitas || 0;
      fichaTicketMedio.textContent = formatarMoeda(res.ticket_medio);
      fichaUltimaVisita.textContent = formatarDataHora(res.ultima_visita);

      if (c.observacoes) {
        fichaTextoObs.textContent = c.observacoes;
        fichaBoxObs.style.display = 'block';
      } else {
        fichaBoxObs.style.display = 'none';
      }

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

  if (btnFichaAddTag) {
    btnFichaAddTag.addEventListener('click', async () => {
      if (!activeFichaClienteId) return;
      const tagId = Number(fichaSelectNovaTag?.value);
      if (!tagId) return;
      const sb = window.cafeteriaSupabase || window.supabaseClient;
      await sb.from('cliente_tag_vinculos').upsert({ cliente_id: activeFichaClienteId, tag_id: tagId }, { onConflict: 'cliente_id,tag_id' });
      fichaSelectNovaTag.value = '';
      await loadData();
      renderTagsNaFicha(activeFichaClienteId);
    });
  }

  if (btnFichaOptoutLgpd) {
    btnFichaOptoutLgpd.addEventListener('click', async () => {
      if (!activeFichaClienteId) return;
      try {
        await window.cafeteriaDB.clientes.update(activeFichaClienteId, { aceita_contato: false });
        window.admin.toast('LGPD', 'Opt-out registrado: este cliente não receberá mais campanhas.', 'info');
        await loadData();
        await abrirFicha(activeFichaClienteId);
      } catch (e) {
        window.admin.toast('Erro', 'Não foi possível atualizar o consentimento.', 'error');
      }
    });
  }

  function fecharFicha() {
    if (modalFichaOverlay) modalFichaOverlay.classList.remove('open');
  }

  if (modalFichaClose) modalFichaClose.addEventListener('click', fecharFicha);
  if (btnFecharFicha) btnFecharFicha.addEventListener('click', fecharFicha);

  // --- Modal Tags & Regras RFV (CAF-000041) ---
  function renderListaTagsModal() {
    const container = document.getElementById('crm-lista-tags-existentes');
    if (!container) return;
    if (!tagsCache.length) {
      container.innerHTML = '<span style="font-size:12px; color:#64748b;">Nenhuma tag cadastrada.</span>';
      return;
    }
    container.innerHTML = tagsCache.map(t => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:${t.cor}22;color:${t.cor};border:1px solid ${t.cor}66;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">
        ${window.escapeHtml(t.nome)}
        <button type="button" class="btn-del-tag-crm" data-id="${t.id}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;">✕</button>
      </span>
    `).join('');

    container.querySelectorAll('.btn-del-tag-crm').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sb = window.cafeteriaSupabase || window.supabaseClient;
        await sb.from('cliente_tags').delete().eq('id', Number(btn.dataset.id));
        await loadData();
        renderListaTagsModal();
      });
    });
  }

  if (btnCrmTags) {
    btnCrmTags.addEventListener('click', () => {
      const elAtivo = document.getElementById('cfg-crm-dias-ativo');
      const elPerdido = document.getElementById('cfg-crm-dias-perdido');
      const elFiel = document.getElementById('cfg-crm-pedidos-fiel');
      const elSpam = document.getElementById('cfg-crm-antispam');
      if (elAtivo) elAtivo.value = crmConfig.dias_ativo;
      if (elPerdido) elPerdido.value = crmConfig.dias_perdido;
      if (elFiel) elFiel.value = crmConfig.pedidos_fiel_90d;
      if (elSpam) elSpam.value = crmConfig.antispam_dias;
      renderListaTagsModal();
      if (modalCrmTagsOverlay) modalCrmTagsOverlay.classList.add('open');
    });
  }

  if (modalCrmTagsClose) {
    modalCrmTagsClose.addEventListener('click', () => modalCrmTagsOverlay?.classList.remove('open'));
  }

  if (formCriarTagCrm) {
    formCriarTagCrm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('crm-nova-tag-nome')?.value.trim();
      const cor = document.getElementById('crm-nova-tag-cor')?.value || '#c9973a';
      if (!nome) return;
      const sb = window.cafeteriaSupabase || window.supabaseClient;
      const { error } = await sb.from('cliente_tags').insert({ nome, cor });
      if (error) {
        window.admin.toast('Erro', error.message || 'Erro ao criar tag.', 'error');
        return;
      }
      document.getElementById('crm-nova-tag-nome').value = '';
      await loadData();
      renderListaTagsModal();
      window.admin.toast('Sucesso', `Tag "${nome}" criada!`, 'success');
    });
  }

  const btnSalvarRegrasRfv = document.getElementById('btn-salvar-regras-rfv');
  if (btnSalvarRegrasRfv) {
    btnSalvarRegrasRfv.addEventListener('click', async () => {
      const diasAtivo = Math.max(1, parseInt(document.getElementById('cfg-crm-dias-ativo')?.value, 10) || 30);
      const diasPerdido = Math.max(diasAtivo + 1, parseInt(document.getElementById('cfg-crm-dias-perdido')?.value, 10) || 90);
      const pedidosFiel = Math.max(2, parseInt(document.getElementById('cfg-crm-pedidos-fiel')?.value, 10) || 4);
      const diasSpam = Math.max(1, parseInt(document.getElementById('cfg-crm-antispam')?.value, 10) || 7);

      const sb = window.cafeteriaSupabase || window.supabaseClient;
      await sb.from('configuracoes_sistema').upsert([
        { chave: 'crm_dias_ativo', valor: diasAtivo },
        { chave: 'crm_dias_perdido', valor: diasPerdido },
        { chave: 'crm_pedidos_fiel_90d', valor: pedidosFiel },
        { chave: 'crm_antispam_dias', valor: diasSpam }
      ], { onConflict: 'chave' });

      await loadData();
      window.admin.toast('Sucesso', 'Limites RFV atualizados e base reclassificada!', 'success');
    });
  }

  // --- Modal Campanhas WhatsApp & Conversão (CAF-000041) ---
  function interpolarMensagemCampanha(template, cliente, res, cupom) {
    const primeiroNome = String(cliente.nome || 'Cliente').trim().split(/\s+/)[0];
    const prodFav = res.produtoFavorito || 'café especial';
    return String(template || '')
      .replace(/\{primeiro_nome\}/gi, primeiroNome)
      .replace(/\{produto_favorito\}/gi, prodFav)
      .replace(/\{cupom\}/gi, cupom || '');
  }

  function calcularDestinatariosCampanha(filtros) {
    let semConsentimento = 0;
    let bloqueadosAntispam = 0;
    const elegiveis = [];

    clientesCache.forEach(c => {
      if (c.ativo === false || c.anonimizado) return;
      const res = pedidosResumoMap.get(c.id) || { segmento: 'Perdido', produtosCompradosIds: [] };

      if (filtros.segmento && res.segmento !== filtros.segmento) return;
      if (filtros.tagId) {
        const tSet = tagVinculosMap.get(c.id);
        if (!tSet || !tSet.has(Number(filtros.tagId))) return;
      }
      if (filtros.produtoId) {
        const prods = Array.isArray(res.produtosCompradosIds) ? res.produtosCompradosIds : [];
        if (!prods.includes(filtros.produtoId)) return;
      }

      // LGPD: Só clientes com aceita_contato = true entram na campanha
      if (!c.aceita_contato || !c.telefone) {
        semConsentimento++;
        return;
      }

      // Anti-spam: limite de 1 campanha a cada X dias (exceto se já enviado nesta mesma campanha ativa)
      if (res.bloqueadoAntispam && !(activeCampanha && activeCampanhaEnviosSet.has(c.id))) {
        bloqueadosAntispam++;
        return;
      }

      elegiveis.push({ cliente: c, res });
    });

    return { elegiveis, semConsentimento, bloqueadosAntispam };
  }

  function atualizarPreviaElegiveisCampanha() {
    const elResumo = document.getElementById('camp-resumo-elegiveis');
    if (!elResumo) return;
    const filtros = {
      segmento: document.getElementById('camp-segmento')?.value || '',
      tagId: document.getElementById('camp-tag')?.value || '',
      produtoId: document.getElementById('camp-produto')?.value || ''
    };
    const { elegiveis, semConsentimento, bloqueadosAntispam } = calcularDestinatariosCampanha(filtros);
    elResumo.innerHTML = `✅ <strong>${elegiveis.length}</strong> destinatário(s) elegível(is) com consentimento LGPD · <span style="color:#64748b;">(${semConsentimento} ocultados sem opt-in LGPD, ${bloqueadosAntispam} protegidos pelo anti-spam de ${crmConfig.antispam_dias}d)</span>`;
  }

  async function renderizarListaDisparoCampanha(campanha) {
    activeCampanha = campanha;
    const box = document.getElementById('camp-disparo-box');
    const titulo = document.getElementById('camp-disparo-titulo');
    const sub = document.getElementById('camp-disparo-sub');
    const tbodyDest = document.getElementById('camp-destinatarios-tbody');
    if (!box || !tbodyDest) return;

    const sb = window.cafeteriaSupabase || window.supabaseClient;
    activeCampanhaEnviosSet.clear();
    if (sb && campanha.id) {
      const { data: envios } = await sb
        .from('campanha_envios')
        .select('cliente_id')
        .eq('campanha_id', campanha.id);
      if (Array.isArray(envios)) {
        envios.forEach(e => activeCampanhaEnviosSet.add(e.cliente_id));
      }
    }

    const { elegiveis } = calcularDestinatariosCampanha({
      segmento: campanha.segmento_filtro || '',
      tagId: campanha.tag_id_filtro || '',
      produtoId: campanha.produto_id_filtro || ''
    });

    box.style.display = 'block';
    if (titulo) titulo.textContent = `Disparo da Campanha: ${campanha.nome}`;
    if (sub) sub.textContent = `${elegiveis.length} cliente(s) na lista`;

    if (!elegiveis.length) {
      tbodyDest.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:14px; color:#64748b;">Nenhum cliente elegível para este filtro no momento.</td></tr>';
      return;
    }

    tbodyDest.innerHTML = elegiveis.map(({ cliente, res }) => {
      const msg = interpolarMensagemCampanha(campanha.mensagem_template, cliente, res, campanha.cupom_codigo);
      const jaEnviado = activeCampanhaEnviosSet.has(cliente.id);
      const fone = String(cliente.telefone || '').replace(/\D/g, '');
      const waLink = `https://wa.me/55${fone.replace(/^55/, '')}?text=${encodeURIComponent(msg)}`;

      return `
        <tr>
          <td>
            <strong>${window.escapeHtml(cliente.nome)}</strong>
            <div style="font-size:11px; color:#64748b;">${formatarTelefone(cliente.telefone)}</div>
          </td>
          <td>${renderSegmentoBadge(res.segmento)}</td>
          <td style="font-size:12px;">${window.escapeHtml(res.produtoFavorito || '—')}</td>
          <td style="font-size:12px; color:#334155; max-width:260px;">${window.escapeHtml(msg)}</td>
          <td style="text-align:center;">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer"
               class="btn ${jaEnviado ? 'btn--ghost' : 'btn--primary'} btn--sm btn-disparar-wa-campanha"
               data-cliente-id="${cliente.id}"
               data-fone="${fone}"
               data-msg="${window.escapeHtml(msg)}"
               style="padding:4px 10px; font-size:12px; text-decoration:none;">
              ${jaEnviado ? '✅ Enviado (Reenviar)' : '💬 Enviar WhatsApp'}
            </a>
          </td>
        </tr>
      `;
    }).join('');

    tbodyDest.querySelectorAll('.btn-disparar-wa-campanha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clienteId = btn.dataset.clienteId;
        const sbClient = window.cafeteriaSupabase || window.supabaseClient;
        if (sbClient && campanha.id) {
          await sbClient.from('campanha_envios').upsert({
            campanha_id: campanha.id,
            cliente_id: clienteId,
            telefone_enviado: btn.dataset.fone,
            mensagem_enviada: btn.dataset.msg
          }, { onConflict: 'campanha_id,cliente_id' });
        }
        btn.textContent = '✅ Enviado';
        btn.classList.remove('btn--primary');
        btn.classList.add('btn--ghost');
        carregarHistoricoCampanhas();
      });
    });
  }

  async function carregarHistoricoCampanhas() {
    const tbodyHist = document.getElementById('camp-historico-tbody');
    if (!tbodyHist) return;
    const sb = window.cafeteriaSupabase || window.supabaseClient;
    if (!sb) return;

    try {
      const { data, error } = await sb
        .from('v_campanhas_conversao')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !Array.isArray(data) || !data.length) {
        tbodyHist.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:14px; color:#64748b;">Nenhuma campanha registrada ainda.</td></tr>';
        return;
      }

      tbodyHist.innerHTML = data.map(cp => {
        const filtroDesc = [
          cp.segmento_filtro ? `Seg: ${cp.segmento_filtro}` : 'Todos',
          cp.cupom_codigo ? `Cupom: ${cp.cupom_codigo}` : null
        ].filter(Boolean).join(' · ');

        return `
          <tr>
            <td><strong>${window.escapeHtml(cp.nome)}</strong></td>
            <td style="font-size:12px;">${formatarData(cp.created_at)}</td>
            <td style="font-size:12px; color:#475569;">${window.escapeHtml(filtroDesc)}</td>
            <td style="text-align:center; font-weight:600;">${cp.total_enviados || 0}</td>
            <td style="text-align:center; font-weight:700; color:#2563eb;">${cp.clientes_converteram_7d || 0}</td>
            <td style="text-align:right; font-weight:700; color:#15803d;">${formatarMoeda(cp.faturamento_gerado_7d)}</td>
            <td style="text-align:center;">
              <button type="button" class="btn btn--ghost btn--sm btn-abrir-campanha-hist" data-id="${cp.campanha_id}" style="padding:3px 8px; font-size:11px;">
                📋 Ver Lista
              </button>
            </td>
          </tr>
        `;
      }).join('');

      tbodyHist.querySelectorAll('.btn-abrir-campanha-hist').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = data.find(d => String(d.campanha_id) === String(btn.dataset.id));
          if (item) {
            renderizarListaDisparoCampanha({
              id: item.campanha_id,
              nome: item.nome,
              segmento_filtro: item.segmento_filtro,
              tag_id_filtro: item.tag_id_filtro,
              produto_id_filtro: item.produto_id_filtro,
              cupom_codigo: item.cupom_codigo,
              mensagem_template: item.mensagem_template
            });
          }
        });
      });
    } catch (e) {
      // ignora se a view ainda não foi criada
    }
  }

  if (btnCrmCampanhas) {
    btnCrmCampanhas.addEventListener('click', () => {
      atualizarPreviaElegiveisCampanha();
      carregarHistoricoCampanhas();
      if (modalCrmCampanhasOverlay) modalCrmCampanhasOverlay.classList.add('open');
    });
  }

  if (modalCrmCampanhasClose) {
    modalCrmCampanhasClose.addEventListener('click', () => modalCrmCampanhasOverlay?.classList.remove('open'));
  }

  ['camp-segmento', 'camp-tag', 'camp-produto'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', atualizarPreviaElegiveisCampanha);
  });

  const btnCriarCampanha = document.getElementById('btn-salvar-criar-campanha');
  if (btnCriarCampanha) {
    btnCriarCampanha.addEventListener('click', async () => {
      const nome = document.getElementById('camp-nome')?.value.trim();
      const segmento = document.getElementById('camp-segmento')?.value || null;
      const tagId = document.getElementById('camp-tag')?.value ? Number(document.getElementById('camp-tag').value) : null;
      const prodId = document.getElementById('camp-produto')?.value || null;
      const cupom = document.getElementById('camp-cupom')?.value.trim() || null;
      const msgTemplate = document.getElementById('camp-mensagem')?.value.trim();

      if (!nome || !msgTemplate) {
        window.admin.toast('Atenção', 'Informe o nome da campanha e a mensagem do WhatsApp.', 'warn');
        return;
      }

      const sb = window.cafeteriaSupabase || window.supabaseClient;
      let novaCampanha = {
        id: null,
        nome,
        segmento_filtro: segmento,
        tag_id_filtro: tagId,
        produto_id_filtro: prodId,
        cupom_codigo: cupom,
        mensagem_template: msgTemplate
      };

      if (sb) {
        const { data, error } = await sb
          .from('campanhas')
          .insert({
            nome,
            segmento_filtro: segmento,
            tag_id_filtro: tagId,
            produto_id_filtro: prodId,
            cupom_codigo: cupom,
            mensagem_template: msgTemplate
          })
          .select('*')
          .single();

        if (!error && data) novaCampanha = data;
      }

      await renderizarListaDisparoCampanha(novaCampanha);
      await carregarHistoricoCampanhas();
      window.admin.toast('Campanha Pronta', 'Clique em "Enviar WhatsApp" em cada cliente para disparar a mensagem.', 'success');
    });
  }

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

  // --- Exportar CSV (Restrito a Admin conforme LGPD CAF-000041) ---
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      const role = window.admin?.session?.user?.role || 'admin';
      if (role && role !== 'admin') {
        window.admin.toast('Acesso Restrito (LGPD)', 'A exportação da base de clientes é permitida apenas para administradores.', 'error');
        return;
      }

      const lista = getClientesFiltrados();
      if (lista.length === 0) {
        window.admin.toast('Aviso', 'Não há clientes para exportar com os filtros atuais.', 'warn');
        return;
      }

      const cabecalho = ['ID', 'Nome', 'Segmento_RFV', 'Produto_Favorito', 'Telefone', 'Email', 'Data_Nascimento', 'Autoriza_WhatsApp_LGPD', 'Ativo', 'Visitas', 'Pedidos_90d', 'Total_Gasto_RS', 'Ultima_Visita', 'Criado_Em'];
      const linhas = lista.map(c => {
        const res = pedidosResumoMap.get(c.id) || { visitas: 0, pedidos90d: 0, totalGasto: 0, ultimaVisita: null, produtoFavorito: '', segmento: 'Perdido' };
        return [
          `"${c.id}"`,
          `"${(c.nome || '').replace(/"/g, '""')}"`,
          `"${res.segmento || 'Perdido'}"`,
          `"${(res.produtoFavorito || '').replace(/"/g, '""')}"`,
          `"${c.telefone || ''}"`,
          `"${c.email || ''}"`,
          `"${c.data_nascimento || ''}"`,
          c.aceita_contato ? 'SIM' : 'NAO',
          c.ativo ? 'SIM' : 'NAO',
          res.visitas,
          res.pedidos90d || 0,
          res.totalGasto.toFixed(2).replace('.', ','),
          `"${formatarDataHora(res.ultimaVisita)}"`,
          `"${formatarDataHora(c.created_at)}"`
        ].join(';');
      });

      const csvContent = [cabecalho.join(';'), ...linhas].join('\r\n');
      window.admin.downloadCSV(`clientes_crm_cafeteria_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
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
  [filterSegmento, filterTag, filterProduto, filterPeriodo, filterContato, filterConta, filterStatus].forEach(el => {
    if (el) el.addEventListener('change', renderTabela);
  });

  // Expor globalmente para navegação do admin
  window.initAdminClientes = loadData;
})();
