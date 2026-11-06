/**
 * js/admin/financeiro-admin.js
 * Módulo de Gestão Financeira, Contas a Pagar, Fornecedores, Fluxo de Caixa e DRE Gerencial (CAF-000035)
 */
(function() {
  'use strict';

  // Cache de dados
  let despesasCache = [];
  let categoriasCache = [];
  let fornecedoresCache = [];
  let resumoAtual = null;
  let fluxoAtual = [];
  let initialized = false;

  // Elementos - Sub-abas
  const pageFinanceiro = document.getElementById('page-financeiro');
  if (!pageFinanceiro) return;

  const btnTabContas = document.getElementById('btn-tab-contas');
  const btnTabFluxo = document.getElementById('btn-tab-fluxo');
  const btnTabResultado = document.getElementById('btn-tab-resultado');
  const btnTabRecebiveis = document.getElementById('btn-tab-recebiveis');

  const subtabContas = document.getElementById('subtab-financeiro-contas');
  const subtabFluxo = document.getElementById('subtab-financeiro-fluxo');
  const subtabResultado = document.getElementById('subtab-financeiro-resultado');
  const subtabRecebiveis = document.getElementById('subtab-financeiro-recebiveis');

  // KPIs Topo
  const kpiVencidasTotal = document.getElementById('kpi-contas-vencidas-total');
  const kpiVencidasCount = document.getElementById('kpi-contas-vencidas-count');
  const kpi7diasTotal = document.getElementById('kpi-contas-7dias-total');
  const kpi7diasCount = document.getElementById('kpi-contas-7dias-count');
  const kpiPagoMes = document.getElementById('kpi-contas-pago-mes');
  const kpiPagoMesSub = document.getElementById('kpi-contas-pago-mes-sub');
  const kpiResultadoMes = document.getElementById('kpi-financeiro-resultado-mes');
  const kpiResultadoSub = document.getElementById('kpi-financeiro-resultado-sub');
  const cardKpiResultado = document.getElementById('card-kpi-resultado');

  // Filtros Contas
  const filterStatus = document.getElementById('filter-despesa-status');
  const filterTipo = document.getElementById('filter-despesa-tipo');
  const filterCategoria = document.getElementById('filter-despesa-categoria');
  const filterPeriodo = document.getElementById('filter-despesa-periodo');
  const searchInput = document.getElementById('search-despesas');
  const tbodyDespesas = document.getElementById('tbody-despesas');

  // Ações Topo
  const btnNovaDespesa = document.getElementById('btn-nova-despesa');
  const btnAbrirFornecedores = document.getElementById('btn-abrir-fornecedores');
  const btnExportarCSV = document.getElementById('btn-exportar-financeiro-csv');

  // Modal Despesa
  const modalDespesaOverlay = document.getElementById('modal-despesa-overlay');
  const modalDespesaTitle = document.getElementById('modal-despesa-title');
  const modalDespesaClose = document.getElementById('modal-despesa-close');
  const btnCancelarDespesa = document.getElementById('btn-cancelar-despesa');
  const formDespesa = document.getElementById('form-despesa');
  const formDespesaId = document.getElementById('form-despesa-id');
  const formDespesaDescricao = document.getElementById('form-despesa-descricao');
  const formDespesaValor = document.getElementById('form-despesa-valor');
  const formDespesaVencimento = document.getElementById('form-despesa-vencimento');
  const formDespesaCategoria = document.getElementById('form-despesa-categoria');
  const formDespesaFornecedor = document.getElementById('form-despesa-fornecedor');
  const formDespesaTipo = document.getElementById('form-despesa-tipo');
  const formDespesaRecorrencia = document.getElementById('form-despesa-recorrencia');
  const formDespesaDoc = document.getElementById('form-despesa-doc');
  const formDespesaObs = document.getElementById('form-despesa-obs');
  const boxDespesaPagaCriacao = document.getElementById('box-despesa-paga-criacao');
  const formDespesaJaPaga = document.getElementById('form-despesa-ja-paga');
  const boxDespesaPagamentoDetalhes = document.getElementById('box-despesa-pagamento-detalhes');
  const formDespesaFormaPagamento = document.getElementById('form-despesa-forma-pagamento');
  const formDespesaDataPagamento = document.getElementById('form-despesa-data-pagamento');

  // Modal Baixar Despesa
  const modalBaixarOverlay = document.getElementById('modal-baixar-despesa-overlay');
  const modalBaixarClose = document.getElementById('modal-baixar-close');
  const btnCancelarBaixar = document.getElementById('btn-cancelar-baixar');
  const formBaixar = document.getElementById('form-baixar-despesa');
  const formBaixarId = document.getElementById('form-baixar-id');
  const baixarInfoDescricao = document.getElementById('baixar-info-descricao');
  const baixarInfoVencimento = document.getElementById('baixar-info-vencimento');
  const baixarInfoValorOriginal = document.getElementById('baixar-info-valor-original');
  const formBaixarValor = document.getElementById('form-baixar-valor');
  const formBaixarData = document.getElementById('form-baixar-data');
  const formBaixarForma = document.getElementById('form-baixar-forma');
  const formBaixarComprovante = document.getElementById('form-baixar-comprovante');
  const formBaixarObs = document.getElementById('form-baixar-obs');
  const baixarBoxRecorrencia = document.getElementById('baixar-box-recorrencia');

  // Modal Fornecedores
  const modalFornecedoresOverlay = document.getElementById('modal-fornecedores-overlay');
  const modalFornecedoresClose = document.getElementById('modal-fornecedores-close');
  const btnConcluirFornecedores = document.getElementById('btn-concluir-fornecedores');
  const formNovoFornecedor = document.getElementById('form-novo-fornecedor');
  const formFornecedorNome = document.getElementById('form-fornecedor-nome');
  const formFornecedorTelefone = document.getElementById('form-fornecedor-telefone');
  const formFornecedorCnpj = document.getElementById('form-fornecedor-cnpj');
  const formFornecedorPix = document.getElementById('form-fornecedor-pix');
  const formFornecedorCategoria = document.getElementById('form-fornecedor-categoria');
  const tbodyFornecedores = document.getElementById('tbody-fornecedores');

  // Fluxo de Caixa Elements
  const filterFluxoMes = document.getElementById('filter-fluxo-mes');
  const btnRecarregarFluxo = document.getElementById('btn-recarregar-fluxo');
  const fluxoTotalEntradas = document.getElementById('fluxo-total-entradas');
  const fluxoTotalSaidas = document.getElementById('fluxo-total-saidas');
  const fluxoTotalSaldo = document.getElementById('fluxo-total-saldo');
  const cardFluxoSaldo = document.getElementById('card-fluxo-saldo');
  const tbodyFluxoCaixa = document.getElementById('tbody-fluxo-caixa');

  // Meta Diária Elements (CAF-000113)
  const metaDiariaBanner = document.getElementById('financeiro-meta-diaria-banner');
  const metaDiariaBadge = document.getElementById('meta-diaria-badge');
  const metaDiariaProgressoTexto = document.getElementById('meta-diaria-progresso-texto');
  const metaDiariaBarra = document.getElementById('meta-diaria-barra');
  const metaDiariaFaltaLabel = document.getElementById('meta-diaria-falta-label');
  const metaDiariaPorcentagemLabel = document.getElementById('meta-diaria-porcentagem-label');
  const btnConfigurarMetas = document.getElementById('btn-configurar-metas');
  const modalMetasOverlay = document.getElementById('modal-metas-overlay');
  const modalMetasClose = document.getElementById('modal-metas-close');
  const btnCancelarMetas = document.getElementById('btn-cancelar-metas');
  const formMetas = document.getElementById('form-metas');
  const inputMetaNormal = document.getElementById('input-meta-normal');
  const inputMetaEspetaculo = document.getElementById('input-meta-espetaculo');

  // DRE Resultado Elements (CAF-000113)
  const filterResultadoMes = document.getElementById('filter-resultado-mes');
  const filterResultadoRegime = document.getElementById('filter-resultado-regime');
  const btnRecarregarResultado = document.getElementById('btn-recarregar-resultado');
  const btnExportarDRECSV = document.getElementById('btn-exportar-dre-csv');
  const drePeriodoLabel = document.getElementById('dre-periodo-label');
  const dreFaturamentoBruto = document.getElementById('dre-faturamento-bruto');
  const dreFaturamentoBrutoPct = document.getElementById('dre-faturamento-bruto-pct');
  const dreDescontos = document.getElementById('dre-descontos');
  const dreDescontosPct = document.getElementById('dre-descontos-pct');
  const dreTaxasPagamento = document.getElementById('dre-taxas-pagamento');
  const dreTaxasPagamentoPct = document.getElementById('dre-taxas-pagamento-pct');
  const dreFaturamentoLiquido = document.getElementById('dre-faturamento-liquido');
  const dreFaturamentoLiquidoPct = document.getElementById('dre-faturamento-liquido-pct');
  const dreTotalCMV = document.getElementById('dre-total-cmv');
  const dreTotalCMVPct = document.getElementById('dre-total-cmv-pct');
  const dreCMVItens = document.getElementById('dre-cmv-itens');
  const dreCMVPerdas = document.getElementById('dre-cmv-perdas');
  const dreMargemContribuicao = document.getElementById('dre-margem-contribuicao');
  const dreMargemContribuicaoPct = document.getElementById('dre-margem-contribuicao-pct');
  const dreTotalDespesasOperacionais = document.getElementById('dre-total-despesas-operacionais');
  const dreTotalDespesasPct = document.getElementById('dre-total-despesas-pct');
  const dreTotalVariaveis = document.getElementById('dre-total-variaveis');
  const dreListaVariaveis = document.getElementById('dre-lista-variaveis');
  const dreTotalFixas = document.getElementById('dre-total-fixas');
  const dreListaFixas = document.getElementById('dre-lista-fixas');
  const dreBoxResultadoFinal = document.getElementById('dre-box-resultado-final');
  const dreResultadoFinal = document.getElementById('dre-resultado-final');
  const dreResultadoFinalPct = document.getElementById('dre-resultado-final-pct');
  let dreCacheAtual = null;

  // Recebíveis Elements (CAF-000113)
  const btnRecarregarRecebiveis = document.getElementById('btn-recarregar-recebiveis');
  const kpiRecebiveisHoje = document.getElementById('kpi-recebiveis-hoje');
  const kpiRecebiveis7d = document.getElementById('kpi-recebiveis-7d');
  const kpiRecebiveis30d = document.getElementById('kpi-recebiveis-30d');
  const tbodyRecebiveis = document.getElementById('tbody-recebiveis');

  // --- Helpers de Formatação ---
  function formatarMoeda(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(dtStr) {
    if (!dtStr) return '--';
    const partes = String(dtStr).substring(0, 10).split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dtStr;
  }

  function getHojeYMD() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function getMesAtualYM() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${ano}-${mes}`;
  }

  function calcularDiferencaDias(vencimentoStr) {
    if (!vencimentoStr) return 0;
    const [y, m, d] = vencimentoStr.split('-').map(Number);
    const dtVenc = new Date(y, m - 1, d);
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const diffMs = dtVenc.getTime() - hoje.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  function showToast(msg, tipo = 'info') {
    if (window.cafeteriaAdmin && typeof window.cafeteriaAdmin.showToast === 'function') {
      window.cafeteriaAdmin.showToast(msg, tipo);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, tipo);
    } else {
      console.log(`[${tipo.toUpperCase()}] ${msg}`);
    }
  }

  // --- Sub-abas Navigation ---
  function switchTab(tab) {
    [btnTabContas, btnTabFluxo, btnTabResultado, btnTabRecebiveis].forEach(b => {
      if (b) {
        b.classList.remove('active');
        b.style.background = '#f8fafc';
        b.style.color = '#64748b';
      }
    });
    [subtabContas, subtabFluxo, subtabResultado, subtabRecebiveis].forEach(s => {
      if (s) s.style.display = 'none';
    });

    if (tab === 'contas') {
      if (btnTabContas) {
        btnTabContas.classList.add('active');
        btnTabContas.style.background = '#fff';
        btnTabContas.style.color = '#1e293b';
      }
      if (subtabContas) subtabContas.style.display = 'block';
      renderTabelaDespesas();
    } else if (tab === 'fluxo') {
      if (btnTabFluxo) {
        btnTabFluxo.classList.add('active');
        btnTabFluxo.style.background = '#fff';
        btnTabFluxo.style.color = '#1e293b';
      }
      if (subtabFluxo) subtabFluxo.style.display = 'block';
      carregarFluxoCaixa();
    } else if (tab === 'resultado') {
      if (btnTabResultado) {
        btnTabResultado.classList.add('active');
        btnTabResultado.style.background = '#fff';
        btnTabResultado.style.color = '#1e293b';
      }
      if (subtabResultado) subtabResultado.style.display = 'block';
      carregarResultadoDRE();
    } else if (tab === 'recebiveis') {
      if (btnTabRecebiveis) {
        btnTabRecebiveis.classList.add('active');
        btnTabRecebiveis.style.background = '#fff';
        btnTabRecebiveis.style.color = '#1e293b';
      }
      if (subtabRecebiveis) subtabRecebiveis.style.display = 'block';
      carregarRecebiveis();
    }
  }

  // --- Inicialização Principal ---
  window.initAdminFinanceiro = async function() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }

    if (filterFluxoMes && !filterFluxoMes.value) {
      filterFluxoMes.value = getMesAtualYM();
    }
    if (filterResultadoMes && !filterResultadoMes.value) {
      filterResultadoMes.value = getMesAtualYM();
    }

    await Promise.all([
      carregarCategorias(),
      carregarFornecedores()
    ]);

    await carregarDespesas();
    await carregarResumoKPIs();
    await carregarMetaDiaria();
  };

  function bindEvents() {
    // Tabs
    if (btnTabContas) btnTabContas.addEventListener('click', () => switchTab('contas'));
    if (btnTabFluxo) btnTabFluxo.addEventListener('click', () => switchTab('fluxo'));
    if (btnTabResultado) btnTabResultado.addEventListener('click', () => switchTab('resultado'));
    if (btnTabRecebiveis) btnTabRecebiveis.addEventListener('click', () => switchTab('recebiveis'));

    // DRE e Metas Events (CAF-000113)
    if (filterResultadoMes) filterResultadoMes.addEventListener('change', carregarResultadoDRE);
    if (filterResultadoRegime) filterResultadoRegime.addEventListener('change', carregarResultadoDRE);
    if (btnRecarregarResultado) btnRecarregarResultado.addEventListener('click', carregarResultadoDRE);
    if (btnExportarDRECSV) btnExportarDRECSV.addEventListener('click', exportarCSVDRE);
    if (btnRecarregarRecebiveis) btnRecarregarRecebiveis.addEventListener('click', carregarRecebiveis);
    if (btnConfigurarMetas) btnConfigurarMetas.addEventListener('click', abrirModalMetas);
    if (modalMetasClose) modalMetasClose.addEventListener('click', fecharModalMetas);
    if (btnCancelarMetas) btnCancelarMetas.addEventListener('click', fecharModalMetas);
    if (formMetas) formMetas.addEventListener('submit', salvarMetas);
    if (modalMetasOverlay) {
      modalMetasOverlay.addEventListener('click', e => {
        if (e.target === modalMetasOverlay) fecharModalMetas();
      });
    }

    // Filtros Contas
    if (filterStatus) filterStatus.addEventListener('change', renderTabelaDespesas);
    if (filterTipo) filterTipo.addEventListener('change', renderTabelaDespesas);
    if (filterCategoria) filterCategoria.addEventListener('change', renderTabelaDespesas);
    if (filterPeriodo) filterPeriodo.addEventListener('change', renderTabelaDespesas);
    if (searchInput) searchInput.addEventListener('input', renderTabelaDespesas);

    // Botões topo
    if (btnNovaDespesa) btnNovaDespesa.addEventListener('click', () => abrirModalDespesa());
    if (btnAbrirFornecedores) btnAbrirFornecedores.addEventListener('click', abrirModalFornecedores);
    if (btnExportarCSV) btnExportarCSV.addEventListener('click', exportarCSVDespesas);

    // Modal Despesa
    if (modalDespesaClose) modalDespesaClose.addEventListener('click', fecharModalDespesa);
    if (btnCancelarDespesa) btnCancelarDespesa.addEventListener('click', fecharModalDespesa);
    if (modalDespesaOverlay) {
      modalDespesaOverlay.addEventListener('click', e => {
        if (e.target === modalDespesaOverlay) fecharModalDespesa();
      });
    }
    if (formDespesaJaPaga) {
      formDespesaJaPaga.addEventListener('change', () => {
        boxDespesaPagamentoDetalhes.style.display = formDespesaJaPaga.checked ? 'block' : 'none';
        if (formDespesaJaPaga.checked && !formDespesaDataPagamento.value) {
          formDespesaDataPagamento.value = getHojeYMD();
        }
      });
    }
    if (formDespesa) formDespesa.addEventListener('submit', salvarDespesa);

    // Modal Baixar Despesa
    if (modalBaixarClose) modalBaixarClose.addEventListener('click', fecharModalBaixar);
    if (btnCancelarBaixar) btnCancelarBaixar.addEventListener('click', fecharModalBaixar);
    if (modalBaixarOverlay) {
      modalBaixarOverlay.addEventListener('click', e => {
        if (e.target === modalBaixarOverlay) fecharModalBaixar();
      });
    }
    if (formBaixar) formBaixar.addEventListener('submit', confirmarBaixaDespesa);

    // Modal Fornecedores
    if (modalFornecedoresClose) modalFornecedoresClose.addEventListener('click', fecharModalFornecedores);
    if (btnConcluirFornecedores) btnConcluirFornecedores.addEventListener('click', fecharModalFornecedores);
    if (modalFornecedoresOverlay) {
      modalFornecedoresOverlay.addEventListener('click', e => {
        if (e.target === modalFornecedoresOverlay) fecharModalFornecedores();
      });
    }
    if (formNovoFornecedor) formNovoFornecedor.addEventListener('submit', salvarNovoFornecedor);

    // Fluxo & Resultado
    if (btnRecarregarFluxo) btnRecarregarFluxo.addEventListener('click', carregarFluxoCaixa);
    if (filterFluxoMes) filterFluxoMes.addEventListener('change', carregarFluxoCaixa);
    if (btnRecarregarResultado) btnRecarregarResultado.addEventListener('click', carregarResultadoDRE);
    if (filterResultadoMes) filterResultadoMes.addEventListener('change', carregarResultadoDRE);
  }

  // --- Carregamento de Categorias & Fornecedores ---
  async function carregarCategorias() {
    try {
      const db = window.cafeteriaDB?.financeiro?.categorias;
      if (!db) return;
      categoriasCache = await db.all();

      // Popula selects
      if (filterCategoria) {
        filterCategoria.innerHTML = '<option value="">Todas as Categorias</option>' +
          categoriasCache.map(c => `<option value="${c.id}">${c.icone || ''} ${c.nome} (${c.tipo === 'fixa' ? 'Fixa' : 'Variável'})</option>`).join('');
      }
      if (formDespesaCategoria) {
        formDespesaCategoria.innerHTML = '<option value="">Selecione uma categoria...</option>' +
          categoriasCache.map(c => `<option value="${c.id}" data-tipo="${c.tipo}">${c.icone || ''} ${c.nome}</option>`).join('');
      }
    } catch (err) {
      console.error('Erro ao carregar categorias financeiras:', err);
    }
  }

  async function carregarFornecedores() {
    try {
      const db = window.cafeteriaDB?.financeiro?.fornecedores;
      if (!db) return;
      fornecedoresCache = await db.all();

      if (formDespesaFornecedor) {
        formDespesaFornecedor.innerHTML = '<option value="">Sem fornecedor vinculado</option>' +
          fornecedoresCache.map(f => `<option value="${f.id}">${f.nome} ${f.cnpj_cpf ? `(${f.cnpj_cpf})` : ''}</option>`).join('');
      }
      renderTabelaFornecedores();
    } catch (err) {
      console.error('Erro ao carregar fornecedores:', err);
    }
  }

  // --- Carregamento de Despesas & KPIs ---
  async function carregarDespesas() {
    try {
      if (tbodyDespesas) {
        tbodyDespesas.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#64748b;">Carregando despesas...</td></tr>';
      }
      const db = window.cafeteriaDB?.financeiro?.despesas;
      if (!db) return;
      const raw = await db.all();
      despesasCache = (raw || []).map(d => window.cafeteriaDespesaMapper ? window.cafeteriaDespesaMapper.normalizeDespesaFromDB(d) : d);
      renderTabelaDespesas();
    } catch (err) {
      console.error('Erro ao carregar despesas:', err);
      if (tbodyDespesas) {
        tbodyDespesas.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar despesas ou acesso restrito a administradores.</td></tr>';
      }
    }
  }

  async function carregarResumoKPIs() {
    try {
      const db = window.cafeteriaDB?.financeiro;
      if (!db) return;
      const mesYM = getMesAtualYM();
      resumoAtual = await db.getResumo(mesYM);

      if (!resumoAtual) return;

      if (kpiVencidasTotal) kpiVencidasTotal.textContent = formatarMoeda(resumoAtual.total_vencidas);
      if (kpiVencidasCount) kpiVencidasCount.textContent = `${resumoAtual.qtd_vencidas || 0} conta(s) em atraso`;

      if (kpi7diasTotal) kpi7diasTotal.textContent = formatarMoeda(resumoAtual.total_a_vencer_7d);
      if (kpi7diasCount) kpi7diasCount.textContent = `${resumoAtual.qtd_a_vencer_7d || 0} conta(s) a pagar`;

      if (kpiPagoMes) kpiPagoMes.textContent = formatarMoeda(resumoAtual.total_despesas_pagas);
      if (kpiPagoMesSub) kpiPagoMesSub.textContent = `Em ${formatarNomeMes(mesYM)}`;

      const resOperacional = Number(resumoAtual.resultado_operacional) || 0;
      if (kpiResultadoMes) {
        kpiResultadoMes.textContent = formatarMoeda(resOperacional);
        kpiResultadoMes.style.color = resOperacional >= 0 ? '#15803d' : '#dc2626';
      }
      if (kpiResultadoSub) {
        kpiResultadoSub.textContent = `Fat. Líq. (${formatarMoeda(resumoAtual.faturamento_liquido)}) − Despesas`;
      }
      if (cardKpiResultado) {
        cardKpiResultado.style.borderLeftColor = resOperacional >= 0 ? '#10b981' : '#ef4444';
      }
    } catch (err) {
      console.error('Erro ao carregar resumo de KPIs:', err);
    }
  }

  function formatarNomeMes(ymStr) {
    if (!ymStr) return '';
    const [ano, mes] = ymStr.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[Number(mes) - 1]} / ${ano}`;
  }

  // --- Renderização da Tabela de Despesas ---
  function filtrarDespesas() {
    const fStatus = filterStatus ? filterStatus.value : 'pendentes';
    const fTipo = filterTipo ? filterTipo.value : '';
    const fCat = filterCategoria ? filterCategoria.value : '';
    const fPeriodo = filterPeriodo ? filterPeriodo.value : 'mes_atual';
    const termo = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const mesAtual = getMesAtualYM();
    const dHoje = new Date();
    const proximoMesDate = new Date(dHoje.getFullYear(), dHoje.getMonth() + 1, 1);
    const proxAno = proximoMesDate.getFullYear();
    const proxMes = String(proximoMesDate.getMonth() + 1).padStart(2, '0');
    const mesProximo = `${proxAno}-${proxMes}`;

    return despesasCache.filter(d => {
      const diffDias = calcularDiferencaDias(d.vencimento);
      const isPaga = Boolean(d.pago_em);

      // Filtro Status
      if (fStatus === 'pendentes' && isPaga) return false;
      if (fStatus === 'pagas' && !isPaga) return false;
      if (fStatus === 'vencidas' && (isPaga || diffDias >= 0)) return false;
      if (fStatus === '7dias' && (isPaga || diffDias < 0 || diffDias > 7)) return false;
      if (fStatus === 'hoje' && (isPaga || diffDias !== 0)) return false;

      // Filtro Tipo
      if (fTipo && d.tipo !== fTipo) return false;

      // Filtro Categoria
      if (fCat && d.categoria_id !== fCat) return false;

      // Filtro Período de Vencimento
      if (fPeriodo === 'mes_atual') {
        const dYM = d.vencimento ? d.vencimento.substring(0, 7) : '';
        if (dYM !== mesAtual && !(fStatus === 'pendentes' && diffDias < 0)) {
          // Permite que vencidas de meses anteriores continuem visíveis se o status for pendente
          return false;
        }
      } else if (fPeriodo === 'proximo_mes') {
        const dYM = d.vencimento ? d.vencimento.substring(0, 7) : '';
        if (dYM !== mesProximo) return false;
      }

      // Filtro Termo de Busca
      if (termo) {
        const desc = (d.descricao || '').toLowerCase();
        const fornecedorNome = (d.fornecedor?.nome || '').toLowerCase();
        const doc = (d.documento || d.documento_numero || '').toLowerCase();
        const catNome = (d.categoria?.nome || '').toLowerCase();
        if (!desc.includes(termo) && !fornecedorNome.includes(termo) && !doc.includes(termo) && !catNome.includes(termo)) {
          return false;
        }
      }

      return true;
    });
  }

  function renderTabelaDespesas() {
    if (!tbodyDespesas) return;

    const lista = filtrarDespesas();

    if (lista.length === 0) {
      tbodyDespesas.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:30px; color:#64748b;">
            Nenhuma despesa encontrada para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    // Ordena: pendentes primeiro (por vencimento), depois pagas
    lista.sort((a, b) => {
      const isPagaA = Boolean(a.pago_em);
      const isPagaB = Boolean(b.pago_em);
      if (!isPagaA && isPagaB) return -1;
      if (isPagaA && !isPagaB) return 1;
      return (a.vencimento || '').localeCompare(b.vencimento || '');
    });

    tbodyDespesas.innerHTML = lista.map(d => {
      const isPaga = Boolean(d.pago_em);
      const diffDias = calcularDiferencaDias(d.vencimento);

      // Status Badge
      let statusHtml = '';
      if (isPaga) {
        statusHtml = `<span style="background:#dcfce7; color:#15803d; font-weight:600; padding:3px 8px; border-radius:12px; font-size:11px; display:inline-block;">🟢 Paga em ${formatarData(d.pago_em)}</span>`;
      } else if (diffDias < 0) {
        statusHtml = `<span style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:3px 8px; border-radius:12px; font-size:11px; display:inline-block;">🔴 Vencida (${Math.abs(diffDias)}d)</span>`;
      } else if (diffDias === 0) {
        statusHtml = `<span style="background:#fef3c7; color:#b45309; font-weight:700; padding:3px 8px; border-radius:12px; font-size:11px; display:inline-block;">🟡 Vence Hoje</span>`;
      } else if (diffDias <= 7) {
        statusHtml = `<span style="background:#ffedd5; color:#c2410c; font-weight:600; padding:3px 8px; border-radius:12px; font-size:11px; display:inline-block;">🟠 Em ${diffDias} dias</span>`;
      } else {
        statusHtml = `<span style="background:#f1f5f9; color:#475569; font-weight:500; padding:3px 8px; border-radius:12px; font-size:11px; display:inline-block;">⚪ Em Aberto</span>`;
      }

      // Tipo Badge
      const tipoBadge = d.tipo === 'fixa'
        ? `<span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#f1f5f9; color:#334155;">Fixa</span>`
        : `<span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#fff7ed; color:#c2410c;">Variável</span>`;

      // Recorrência Badge
      const recBadge = d.recorrencia === 'mensal'
        ? `<span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#eff6ff; color:#1d4ed8;" title="Gera o próximo mês automaticamente na baixa">🔁 Mensal</span>`
        : `<span style="font-size:11px; color:#94a3b8;">Única</span>`;

      // Fornecedor
      const fornNome = d.fornecedor?.nome
        ? `<span title="${d.fornecedor.telefone ? 'Tel: ' + d.fornecedor.telefone : ''}">${d.fornecedor.nome}</span>`
        : `<span style="color:#94a3b8;">--</span>`;

      // Categoria com ícone
      const catNome = d.categoria ? `${d.categoria.icone || '🏷️'} ${d.categoria.nome}` : '--';

      // Doc / NF
      const docHtml = (d.documento || d.documento_numero)
        ? `<div style="font-size:11px; color:#64748b;">Doc: ${d.documento || d.documento_numero}</div>`
        : '';

      // Ações
      const btnPagar = !isPaga
        ? `<button class="btn btn--primary btn-sm btn-pagar-despesa" data-id="${d.id}" style="padding:4px 8px; font-size:11px;">💵 Pagar</button>`
        : '';

      const btnEditar = `<button class="btn btn--ghost btn-sm btn-editar-despesa" data-id="${d.id}" title="Editar despesa" style="padding:4px 8px; font-size:12px;">✏️</button>`;
      const btnExcluir = `<button class="btn btn--ghost btn-sm btn-excluir-despesa" data-id="${d.id}" title="Excluir despesa" style="padding:4px 8px; font-size:12px; color:#dc2626;">🗑️</button>`;

      return `
        <tr style="border-bottom:1px solid #f1f5f9; ${isPaga ? 'background:#fafafa;' : ''}">
          <td style="padding:10px 12px; font-weight:600; font-size:13px; color:${!isPaga && diffDias < 0 ? '#dc2626' : '#1e293b'};">
            ${formatarData(d.vencimento)}
          </td>
          <td style="padding:10px 12px;">
            <div style="font-weight:600; color:#1e293b; font-size:13px;">${d.descricao}</div>
            ${docHtml}
          </td>
          <td style="padding:10px 12px; font-size:12px; color:#475569;">${catNome}</td>
          <td style="padding:10px 12px; font-size:12px; color:#475569;">${fornNome}</td>
          <td style="padding:10px 12px; text-align:center;">${tipoBadge}</td>
          <td style="padding:10px 12px; text-align:center;">${recBadge}</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; font-size:13px; color:#0f172a;">
            ${formatarMoeda(d.valor)}
            ${isPaga && Number(d.valor_pago) !== Number(d.valor) ? `<div style="font-size:10px; color:#15803d;">Pago: ${formatarMoeda(d.valor_pago)}</div>` : ''}
          </td>
          <td style="padding:10px 12px; text-align:center;">${statusHtml}</td>
          <td style="padding:10px 12px; text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
              ${btnPagar}
              ${btnEditar}
              ${btnExcluir}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Adiciona event listeners nas ações
    tbodyDespesas.querySelectorAll('.btn-pagar-despesa').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const despesa = despesasCache.find(d => d.id === id);
        if (despesa) abrirModalBaixar(despesa);
      });
    });

    tbodyDespesas.querySelectorAll('.btn-editar-despesa').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const despesa = despesasCache.find(d => d.id === id);
        if (despesa) abrirModalDespesa(despesa);
      });
    });

    tbodyDespesas.querySelectorAll('.btn-excluir-despesa').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        excluirDespesa(id);
      });
    });
  }

  // --- Modal Nova / Editar Despesa ---
  function abrirModalDespesa(despesa = null) {
    if (!modalDespesaOverlay) return;
    formDespesa.reset();

    if (boxDespesaPagamentoDetalhes) boxDespesaPagamentoDetalhes.style.display = 'none';

    if (despesa) {
      modalDespesaTitle.textContent = 'Editar Despesa';
      formDespesaId.value = despesa.id;
      formDespesaDescricao.value = despesa.descricao || '';
      formDespesaValor.value = Number(despesa.valor).toFixed(2);
      formDespesaVencimento.value = despesa.vencimento || '';
      formDespesaCategoria.value = despesa.categoria_id || '';
      formDespesaFornecedor.value = despesa.fornecedor_id || '';
      formDespesaTipo.value = despesa.tipo || 'variavel';
      formDespesaRecorrencia.value = despesa.recorrencia || 'nenhuma';
      formDespesaDoc.value = despesa.documento || despesa.documento_numero || '';
      formDespesaObs.value = despesa.observacoes || '';

      if (boxDespesaPagaCriacao) boxDespesaPagaCriacao.style.display = 'none';
    } else {
      modalDespesaTitle.textContent = 'Nova Despesa / Conta a Pagar';
      formDespesaId.value = '';
      formDespesaVencimento.value = getHojeYMD();
      formDespesaTipo.value = 'variavel';
      formDespesaRecorrencia.value = 'nenhuma';

      if (boxDespesaPagaCriacao) {
        boxDespesaPagaCriacao.style.display = 'block';
        formDespesaJaPaga.checked = false;
      }
    }

    modalDespesaOverlay.classList.add('open');
    if (formDespesaDescricao) formDespesaDescricao.focus();
  }

  function fecharModalDespesa() {
    if (modalDespesaOverlay) modalDespesaOverlay.classList.remove('open');
  }

  async function salvarDespesa(e) {
    e.preventDefault();
    const id = formDespesaId.value;
    const descricao = formDespesaDescricao.value.trim();
    const valor = parseFloat(formDespesaValor.value);
    const vencimento = formDespesaVencimento.value;
    const categoria_id = formDespesaCategoria.value;
    const fornecedor_id = formDespesaFornecedor.value || null;
    const tipo = formDespesaTipo.value;
    const recorrencia = formDespesaRecorrencia.value === 'mensal' ? 'mensal' : 'nenhuma';
    const documento = formDespesaDoc.value.trim() || null;
    const observacoes = formDespesaObs.value.trim() || null;

    if (!descricao || isNaN(valor) || valor <= 0 || !vencimento || !categoria_id) {
      showToast('Preencha os campos obrigatórios corretamente.', 'warning');
      return;
    }

    const payload = {
      descricao,
      valor,
      vencimento,
      categoria_id: Number(categoria_id),
      fornecedor_id,
      recorrencia,
      documento,
      observacoes
    };

    // Caso de nova despesa já paga no momento da criação
    if (!id && formDespesaJaPaga && formDespesaJaPaga.checked) {
      payload.valor_pago = valor;
      payload.pago_em = formDespesaDataPagamento.value || getHojeYMD();
      payload.forma_pagamento = formDespesaFormaPagamento.value || 'pix';
    }

    try {
      const db = window.cafeteriaDB?.financeiro?.despesas;
      if (!db) throw new Error('Módulo de banco indisponível');

      if (id) {
        await db.update(id, payload);
        showToast('Despesa atualizada com sucesso!', 'success');
      } else {
        await db.create(payload);
        showToast('Despesa cadastrada com sucesso!', 'success');
      }

      fecharModalDespesa();
      await carregarDespesas();
      await carregarResumoKPIs();
    } catch (err) {
      console.error('Erro ao salvar despesa:', err);
      showToast('Erro ao salvar despesa: ' + (err.message || 'Verifique se você tem permissão de administrador.'), 'error');
    }
  }

  async function excluirDespesa(id) {
    const despesa = despesasCache.find(d => d.id === id);
    if (!despesa) return;

    const conf = await (window.cafeteriaAdmin?.confirm || window.admin?.confirm)({
      title: 'Excluir despesa?',
      msg: `Deseja realmente excluir a despesa "${despesa.descricao}" no valor de ${formatarMoeda(despesa.valor)}?`,
      okLabel: 'Excluir'
    });
    if (!conf) return;

    try {
      const db = window.cafeteriaDB?.financeiro?.despesas;
      if (!db) return;
      await db.delete(id);
      showToast('Despesa excluída.', 'success');
      await carregarDespesas();
      await carregarResumoKPIs();
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      showToast('Erro ao excluir: ' + (err.message || err), 'error');
    }
  }

  // --- Modal Baixar Pagamento ---
  function abrirModalBaixar(despesa) {
    if (!modalBaixarOverlay) return;
    formBaixar.reset();

    formBaixarId.value = despesa.id;
    if (baixarInfoDescricao) baixarInfoDescricao.textContent = despesa.descricao;
    if (baixarInfoVencimento) baixarInfoVencimento.textContent = formatarData(despesa.vencimento);
    if (baixarInfoValorOriginal) baixarInfoValorOriginal.textContent = formatarMoeda(despesa.valor);

    formBaixarValor.value = Number(despesa.valor).toFixed(2);
    formBaixarData.value = getHojeYMD();
    formBaixarForma.value = 'pix';
    formBaixarComprovante.value = '';
    formBaixarObs.value = '';

    if (baixarBoxRecorrencia) {
      baixarBoxRecorrencia.style.display = despesa.recorrencia === 'mensal' ? 'block' : 'none';
    }

    modalBaixarOverlay.classList.add('open');
    if (formBaixarValor) formBaixarValor.focus();
  }

  function fecharModalBaixar() {
    if (modalBaixarOverlay) modalBaixarOverlay.classList.remove('open');
  }

  async function confirmarBaixaDespesa(e) {
    e.preventDefault();
    const id = formBaixarId.value;
    const valor_pago = parseFloat(formBaixarValor.value);
    const pago_em = formBaixarData.value;
    const forma_pagamento = formBaixarForma.value;
    const comprovante = formBaixarComprovante.value.trim() || null;
    const obs = formBaixarObs.value.trim() || null;

    if (!id || isNaN(valor_pago) || valor_pago <= 0 || !pago_em) {
      showToast('Informe o valor e a data de pagamento.', 'warning');
      return;
    }

    try {
      const db = window.cafeteriaDB?.financeiro?.despesas;
      if (!db) return;

      const res = await db.baixar(id, {
        valor_pago,
        pago_em,
        forma_pagamento,
        comprovante,
        obs
      });

      if (res && res.recorrencia_criada) {
        showToast(`Pagamento registrado! Despesa do próximo mês gerada automaticamente (${formatarData(res.novo_vencimento)}).`, 'success');
      } else {
        showToast('Pagamento registrado com sucesso!', 'success');
      }

      fecharModalBaixar();
      await carregarDespesas();
      await carregarResumoKPIs();
    } catch (err) {
      console.error('Erro ao baixar despesa:', err);
      showToast('Erro ao confirmar baixa: ' + (err.message || err), 'error');
    }
  }

  // --- Modal Gestão de Fornecedores ---
  function abrirModalFornecedores() {
    if (!modalFornecedoresOverlay) return;
    renderTabelaFornecedores();
    modalFornecedoresOverlay.classList.add('open');
    if (formFornecedorNome) formFornecedorNome.focus();
  }

  function fecharModalFornecedores() {
    if (modalFornecedoresOverlay) modalFornecedoresOverlay.classList.remove('open');
  }

  function renderTabelaFornecedores() {
    if (!tbodyFornecedores) return;

    if (fornecedoresCache.length === 0) {
      tbodyFornecedores.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#64748b;">Nenhum fornecedor cadastrado.</td></tr>`;
      return;
    }

    tbodyFornecedores.innerHTML = fornecedoresCache.map(f => {
      const contato = [f.telefone, f.email].filter(Boolean).join(' • ') || '--';
      const docs = [f.cnpj_cpf ? `Doc: ${f.cnpj_cpf}` : '', f.chave_pix ? `PIX: ${f.chave_pix}` : ''].filter(Boolean).join(' | ') || '--';

      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:8px 12px; font-weight:600; color:#1e293b;">
            ${f.nome}
            ${f.categoria ? `<div style="font-size:11px; color:#64748b; font-weight:normal;">${f.categoria}</div>` : ''}
          </td>
          <td style="padding:8px 12px; font-size:12px; color:#475569;">${contato}</td>
          <td style="padding:8px 12px; font-size:12px; color:#475569;">${docs}</td>
          <td style="padding:8px 12px; text-align:center;">
            <button class="btn btn--ghost btn-sm btn-excluir-fornecedor" data-id="${f.id}" title="Excluir fornecedor" style="padding:3px 6px; font-size:11px; color:#dc2626;">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    tbodyFornecedores.querySelectorAll('.btn-excluir-fornecedor').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const forn = fornecedoresCache.find(f => f.id === id);
        if (!forn) return;
        const ok = await (window.cafeteriaAdmin?.confirm || window.admin?.confirm)({
          title: 'Remover fornecedor?',
          msg: `Deseja remover o fornecedor "${forn.nome}"?`,
          okLabel: 'Remover'
        });
        if (!ok) return;

        try {
          await window.cafeteriaDB.financeiro.fornecedores.delete(id);
          showToast('Fornecedor removido.', 'success');
          await carregarFornecedores();
        } catch (err) {
          showToast('Erro ao remover fornecedor: ' + err.message, 'error');
        }
      });
    });
  }

  async function salvarNovoFornecedor(e) {
    e.preventDefault();
    const nome = formFornecedorNome.value.trim();
    const telefone = formFornecedorTelefone.value.trim() || null;
    const cnpj_cpf = formFornecedorCnpj.value.trim() || null;
    const chave_pix = formFornecedorPix.value.trim() || null;
    const categoria = formFornecedorCategoria.value.trim() || null;

    if (!nome) {
      showToast('O nome do fornecedor é obrigatório.', 'warning');
      return;
    }

    try {
      const db = window.cafeteriaDB?.financeiro?.fornecedores;
      if (!db) return;

      await db.create({
        nome,
        telefone,
        cnpj_cpf,
        chave_pix,
        categoria
      });

      showToast(`Fornecedor "${nome}" cadastrado!`, 'success');
      formNovoFornecedor.reset();
      await carregarFornecedores();
    } catch (err) {
      console.error('Erro ao cadastrar fornecedor:', err);
      showToast('Erro ao cadastrar fornecedor: ' + err.message, 'error');
    }
  }

  // --- Sub-aba 2: Fluxo de Caixa Diário ---
  async function carregarFluxoCaixa() {
    if (!tbodyFluxoCaixa) return;
    const mesYM = filterFluxoMes ? filterFluxoMes.value : getMesAtualYM();
    if (!mesYM) return;

    tbodyFluxoCaixa.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Carregando fluxo de caixa...</td></tr>';

    try {
      const [ano, mes] = mesYM.split('-').map(Number);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const dtInicio = `${mesYM}-01`;
      const dtFim = `${mesYM}-${String(ultimoDia).padStart(2, '0')}`;

      const db = window.cafeteriaDB?.financeiro;
      if (!db) return;

      fluxoAtual = await db.getFluxoCaixa(dtInicio, dtFim);

      let totalVendas = 0;
      let totalCreditos = 0;
      let totalDespesas = 0;
      let totalSangrias = 0;

      fluxoAtual.forEach(f => {
        totalVendas += Number(f.total_vendas) || 0;
        totalCreditos += Number(f.total_creditos) || 0;
        totalDespesas += Number(f.total_despesas_pagas) || 0;
        totalSangrias += Number(f.total_sangrias) || 0;
      });

      const totalEntradas = totalVendas + totalCreditos;
      const totalSaidas = totalDespesas + totalSangrias;
      const saldoPeriodo = totalEntradas - totalSaidas;

      if (fluxoTotalEntradas) fluxoTotalEntradas.textContent = formatarMoeda(totalEntradas);
      if (fluxoTotalSaidas) fluxoTotalSaidas.textContent = formatarMoeda(totalSaidas);
      if (fluxoTotalSaldo) {
        fluxoTotalSaldo.textContent = formatarMoeda(saldoPeriodo);
        fluxoTotalSaldo.style.color = saldoPeriodo >= 0 ? '#15803d' : '#dc2626';
      }
      if (cardFluxoSaldo) {
        cardFluxoSaldo.style.borderColor = saldoPeriodo >= 0 ? '#bbf7d0' : '#fecaca';
        cardFluxoSaldo.style.background = saldoPeriodo >= 0 ? '#f0fdf4' : '#fef2f2';
      }

      if (fluxoAtual.length === 0) {
        tbodyFluxoCaixa.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:25px; color:#64748b;">Nenhuma movimentação financeira no período selecionado.</td></tr>`;
        return;
      }

      tbodyFluxoCaixa.innerHTML = fluxoAtual.map(f => {
        const saldoDia = Number(f.saldo_dia) || 0;
        const saldoAcum = Number(f.saldo_acumulado) || 0;

        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 12px; font-weight:600; color:#1e293b;">${formatarData(f.data)}</td>
            <td style="padding:10px 12px; text-align:right; color:#15803d; font-weight:500;">${formatarMoeda(f.total_vendas)}</td>
            <td style="padding:10px 12px; text-align:right; color:#2563eb; font-weight:500;">${formatarMoeda(f.total_creditos)}</td>
            <td style="padding:10px 12px; text-align:right; color:#b91c1c; font-weight:500;">${formatarMoeda(f.total_despesas_pagas)}</td>
            <td style="padding:10px 12px; text-align:right; color:#ea580c; font-weight:500;">${formatarMoeda(f.total_sangrias)}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:${saldoDia >= 0 ? '#15803d' : '#dc2626'};">
              ${formatarMoeda(saldoDia)}
            </td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:${saldoAcum >= 0 ? '#1e293b' : '#dc2626'};">
              ${formatarMoeda(saldoAcum)}
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Erro ao carregar fluxo de caixa:', err);
      tbodyFluxoCaixa.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar fluxo de caixa.</td></tr>`;
    }
  }

  // --- Sub-aba 3: Demonstrativo de Resultado (DRE Gerencial - CAF-000113) ---
  async function carregarResultadoDRE() {
    const mesYM = filterResultadoMes ? filterResultadoMes.value : getMesAtualYM();
    if (!mesYM) return;
    const regime = filterResultadoRegime ? filterResultadoRegime.value : 'caixa';

    const [anoStr, mesStr] = mesYM.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const inicio = `${mesYM}-01`;
    const fim = `${mesYM}-${String(ultimoDia).padStart(2, '0')}`;

    if (drePeriodoLabel) {
      drePeriodoLabel.textContent = `Período de Apuração: ${formatarNomeMes(mesYM)} (Regime de ${regime === 'competencia' ? 'Competência' : 'Caixa'})`;
    }

    try {
      const db = window.cafeteriaDB?.financeiro;
      let dreData = null;
      if (db && typeof db.obterDRE === 'function') {
        dreData = await db.obterDRE(inicio, fim, regime);
      }

      // Se não retornar da RPC, recalcula a partir do cache local
      if (!dreData) {
        const pagasNoPeriodo = despesasCache.filter(d => {
          const refDate = regime === 'competencia' ? d.vencimento : d.pago_em;
          return refDate && refDate.substring(0, 7) === mesYM;
        });

        let fixas = 0;
        let variaveis = 0;
        const mapaCategorias = new Map();

        pagasNoPeriodo.forEach(d => {
          const catNome = d.categoria?.nome || 'Outros';
          const catTipo = d.tipo || 'fixa';
          const val = Number(d.valor_pago || d.valor) || 0;
          if (catNome.toLowerCase().includes('taxa') || catNome.toLowerCase().includes('maquininha')) return;
          if (catTipo === 'variavel') variaveis += val;
          else fixas += val;
          mapaCategorias.set(catNome, {
            categoria: catNome,
            tipo: catTipo,
            total: (mapaCategorias.get(catNome)?.total || 0) + val
          });
        });

        dreData = {
          faturamento_bruto: 0,
          faturamento_bruto_pct: 100.0,
          descontos: 0,
          descontos_pct: 0,
          taxas_pagamento: 0,
          taxas_pagamento_pct: 0,
          receita_liquida: 0,
          receita_liquida_pct: 0,
          cmv_itens: 0,
          cmv_perdas: 0,
          cmv_total: 0,
          cmv_total_pct: 0,
          margem_contribuicao: 0,
          margem_contribuicao_pct: 0,
          despesas_fixas: fixas,
          despesas_fixas_pct: 0,
          despesas_variaveis: variaveis,
          despesas_variaveis_pct: 0,
          despesas_total: fixas + variaveis,
          despesas_total_pct: 0,
          despesas_categorias: Array.from(mapaCategorias.values()),
          resultado_liquido: -(fixas + variaveis),
          resultado_liquido_pct: 0
        };
      }

      dreCacheAtual = dreData;

      const fatBruto = Number(dreData.faturamento_bruto) || 0;
      const fatBrutoPct = Number(dreData.faturamento_bruto_pct) || 100;
      const descontos = Number(dreData.descontos) || 0;
      const descontosPct = Number(dreData.descontos_pct) || 0;
      const taxas = Number(dreData.taxas_pagamento) || 0;
      const taxasPct = Number(dreData.taxas_pagamento_pct) || 0;
      const fatLiquido = Number(dreData.receita_liquida) || 0;
      const fatLiquidoPct = Number(dreData.receita_liquida_pct) || 0;
      const cmvTotal = Number(dreData.cmv_total) || 0;
      const cmvTotalPct = Number(dreData.cmv_total_pct) || 0;
      const cmvItens = Number(dreData.cmv_itens) || 0;
      const cmvPerdas = Number(dreData.cmv_perdas) || 0;
      const margem = Number(dreData.margem_contribuicao) || 0;
      const margemPct = Number(dreData.margem_contribuicao_pct) || 0;
      const totalDespesas = Number(dreData.despesas_total) || 0;
      const totalDespesasPct = Number(dreData.despesas_total_pct) || 0;
      const totalFixas = Number(dreData.despesas_fixas) || 0;
      const totalVar = Number(dreData.despesas_variaveis) || 0;
      const resultado = Number(dreData.resultado_liquido) || 0;
      const resultadoPct = Number(dreData.resultado_liquido_pct) || 0;

      if (dreFaturamentoBruto) dreFaturamentoBruto.textContent = formatarMoeda(fatBruto);
      if (dreFaturamentoBrutoPct) dreFaturamentoBrutoPct.textContent = `(${fatBrutoPct.toFixed(1)}%)`;
      if (dreDescontos) dreDescontos.textContent = `-${formatarMoeda(descontos)}`;
      if (dreDescontosPct) dreDescontosPct.textContent = `(${descontosPct.toFixed(1)}%)`;
      if (dreTaxasPagamento) dreTaxasPagamento.textContent = `-${formatarMoeda(taxas)}`;
      if (dreTaxasPagamentoPct) dreTaxasPagamentoPct.textContent = `(${taxasPct.toFixed(1)}%)`;
      if (dreFaturamentoLiquido) dreFaturamentoLiquido.textContent = formatarMoeda(fatLiquido);
      if (dreFaturamentoLiquidoPct) dreFaturamentoLiquidoPct.textContent = `(${fatLiquidoPct.toFixed(1)}%)`;
      if (dreTotalCMV) dreTotalCMV.textContent = `-${formatarMoeda(cmvTotal)}`;
      if (dreTotalCMVPct) dreTotalCMVPct.textContent = `(${cmvTotalPct.toFixed(1)}%)`;
      if (dreCMVItens) dreCMVItens.textContent = formatarMoeda(cmvItens);
      if (dreCMVPerdas) dreCMVPerdas.textContent = formatarMoeda(cmvPerdas);
      if (dreMargemContribuicao) dreMargemContribuicao.textContent = formatarMoeda(margem);
      if (dreMargemContribuicaoPct) dreMargemContribuicaoPct.textContent = `(${margemPct.toFixed(1)}%)`;
      if (dreTotalDespesasOperacionais) dreTotalDespesasOperacionais.textContent = `-${formatarMoeda(totalDespesas)}`;
      if (dreTotalDespesasPct) dreTotalDespesasPct.textContent = `(${totalDespesasPct.toFixed(1)}%)`;
      if (dreTotalFixas) dreTotalFixas.textContent = formatarMoeda(totalFixas);
      if (dreTotalVariaveis) dreTotalVariaveis.textContent = formatarMoeda(totalVar);

      if (dreResultadoFinal) {
        dreResultadoFinal.textContent = formatarMoeda(resultado);
      }
      if (dreResultadoFinalPct) {
        dreResultadoFinalPct.textContent = `(${resultadoPct.toFixed(1)}%)`;
      }
      if (dreBoxResultadoFinal) {
        dreBoxResultadoFinal.style.background = resultado >= 0 ? '#f0fdf4' : '#fef2f2';
        dreBoxResultadoFinal.style.color = resultado >= 0 ? '#15803d' : '#b91c1c';
        dreBoxResultadoFinal.style.borderColor = resultado >= 0 ? '#bbf7d0' : '#fecaca';
      }

      renderDRECategoriasDetalhe(dreData.despesas_categorias || []);
    } catch (err) {
      console.error('Erro ao calcular DRE:', err);
    }
  }

  function renderDRECategoriasDetalhe(categorias = []) {
    if (!dreListaVariaveis || !dreListaFixas) return;

    const fixas = categorias.filter(c => c.tipo !== 'variavel');
    const variaveis = categorias.filter(c => c.tipo === 'variavel');

    if (fixas.length === 0) {
      dreListaFixas.innerHTML = `<div style="font-size:12px; color:#94a3b8; font-style:italic;">Nenhuma despesa fixa no período.</div>`;
    } else {
      dreListaFixas.innerHTML = fixas.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>• ${c.categoria}</span>
          <span style="font-weight:600; color:#334155;">${formatarMoeda(c.total)}</span>
        </div>
      `).join('');
    }

    if (variaveis.length === 0) {
      dreListaVariaveis.innerHTML = `<div style="font-size:12px; color:#94a3b8; font-style:italic;">Nenhum custo variável no período.</div>`;
    } else {
      dreListaVariaveis.innerHTML = variaveis.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>• ${c.categoria}</span>
          <span style="font-weight:600; color:#334155;">${formatarMoeda(c.total)}</span>
        </div>
      `).join('');
    }
  }

  // --- Exportar DRE CSV (CAF-000113) ---
  function exportarCSVDRE() {
    if (!dreCacheAtual) {
      showToast('Calcule o DRE antes de exportar.', 'warning');
      return;
    }
    const mesYM = filterResultadoMes ? filterResultadoMes.value : getMesAtualYM();
    const d = dreCacheAtual;

    const linhas = [
      ['Estrutura do DRE Gerencial', 'Valor (R$)', 'AV (%)'],
      ['(+) Faturamento Bruto (Vendas Realizadas)', (Number(d.faturamento_bruto) || 0).toFixed(2).replace('.', ','), '100,0%'],
      ['(-) Descontos e Cupons Concedidos', `-${(Number(d.descontos) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.descontos_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['(-) Taxas de Meios de Pagamento', `-${(Number(d.taxas_pagamento) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.taxas_pagamento_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['(=) Receita Operacional Líquida', (Number(d.receita_liquida) || 0).toFixed(2).replace('.', ','), `${(Number(d.receita_liquida_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['(-) Custo da Mercadoria Vendida (CMV Real + Perdas)', `-${(Number(d.cmv_total) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.cmv_total_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['   • CMV dos Produtos Vendidos (Fichas Técnicas)', (Number(d.cmv_itens) || 0).toFixed(2).replace('.', ','), ''],
      ['   • Perdas e Quebras de Estoque', (Number(d.cmv_perdas) || 0).toFixed(2).replace('.', ','), ''],
      ['(=) Margem de Contribuição Bruta', (Number(d.margem_contribuicao) || 0).toFixed(2).replace('.', ','), `${(Number(d.margem_contribuicao_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['(-) Despesas Operacionais Totais', `-${(Number(d.despesas_total) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.despesas_total_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['   • Despesas Fixas', `-${(Number(d.despesas_fixas) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.despesas_fixas_pct) || 0).toFixed(1).replace('.', ',')}%`],
      ['   • Despesas Variáveis (sem taxas)', `-${(Number(d.despesas_variaveis) || 0).toFixed(2).replace('.', ',')}`, `${(Number(d.despesas_variaveis_pct) || 0).toFixed(1).replace('.', ',')}%`]
    ];

    if (Array.isArray(d.despesas_categorias) && d.despesas_categorias.length > 0) {
      linhas.push(['--- Detalhamento por Categoria ---', '', '']);
      d.despesas_categorias.forEach(cat => {
        linhas.push([
          `   [${cat.tipo === 'fixa' ? 'Fixa' : 'Variável'}] ${cat.categoria}`,
          `-${(Number(cat.total) || 0).toFixed(2).replace('.', ',')}`,
          `${(Number(cat.percentual_receita || 0)).toFixed(1).replace('.', ',')}%`
        ]);
      });
    }

    linhas.push([
      '(=) Resultado Operacional Líquido',
      (Number(d.resultado_liquido) || 0).toFixed(2).replace('.', ','),
      `${(Number(d.resultado_liquido_pct) || 0).toFixed(1).replace('.', ',')}%`
    ]);

    const csvContent = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const nomeArquivo = `dre_gerencial_${mesYM}.csv`;

    if (window.cafeteriaAdmin && typeof window.cafeteriaAdmin.downloadCSV === 'function') {
      window.cafeteriaAdmin.downloadCSV(nomeArquivo, csvContent);
    } else {
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    }

    showToast(`DRE ${nomeArquivo} exportado com sucesso!`, 'success');
  }

  // --- Sub-aba 4: Recebíveis & Conciliação de Taxas (CAF-000113) ---
  async function carregarRecebiveis() {
    if (!tbodyRecebiveis) return;
    try {
      tbodyRecebiveis.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Carregando recebíveis...</td></tr>`;
      const db = window.cafeteriaDB?.financeiro;
      if (!db || typeof db.obterPrevisaoRecebiveis !== 'function') return;

      const data = await db.obterPrevisaoRecebiveis();
      if (!data) {
        tbodyRecebiveis.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Nenhuma previsão de recebimento encontrada.</td></tr>`;
        return;
      }

      if (kpiRecebiveisHoje) kpiRecebiveisHoje.textContent = formatarMoeda(data.total_hoje || 0);
      if (kpiRecebiveis7d) kpiRecebiveis7d.textContent = formatarMoeda(data.total_7dias || 0);
      if (kpiRecebiveis30d) kpiRecebiveis30d.textContent = formatarMoeda(data.total_30dias || 0);

      const lista = data.recebiveis || [];
      if (lista.length === 0) {
        tbodyRecebiveis.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Nenhum recebível previsto no período.</td></tr>`;
        return;
      }

      tbodyRecebiveis.innerHTML = lista.map(r => {
        const prazoLabel = Number(r.prazo_dias) === 0 ? 'D+0 (Hoje)' : `D+${r.prazo_dias}`;
        const formaLabel = String(r.forma || 'outros').replace(/_/g, ' ').toUpperCase();

        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 12px; font-weight:700; color:#1e293b;">${formatarData(r.data_prevista)}</td>
            <td style="padding:10px 12px; color:#64748b;">${formatarData(r.data_venda)}</td>
            <td style="padding:10px 12px; font-weight:600; color:#334155;">${formaLabel}</td>
            <td style="padding:10px 12px; text-align:center;"><span style="background:#e2e8f0; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700;">${prazoLabel}</span></td>
            <td style="padding:10px 12px; text-align:right; color:#334155;">${formatarMoeda(r.valor_bruto)}</td>
            <td style="padding:10px 12px; text-align:right; color:#b91c1c;">-${formatarMoeda(r.taxa_valor)}</td>
            <td style="padding:10px 12px; text-align:right; font-weight:700; color:#15803d;">${formatarMoeda(r.valor_liquido)}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Erro ao carregar recebíveis:', err);
      tbodyRecebiveis.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar recebíveis.</td></tr>`;
    }
  }

  // --- Metas de Venda (CAF-000113) ---
  let metaConfigCache = { normal: 1500, espetaculo: 3000 };

  async function carregarMetaDiaria() {
    try {
      const db = window.cafeteriaDB?.financeiro;
      if (!db || typeof db.obterMetaProgressoDia !== 'function') return;

      const meta = await db.obterMetaProgressoDia();
      if (!meta) return;

      const isEsp = Boolean(meta.is_espetaculo);
      const metaValor = Number(meta.meta_valor) || (isEsp ? 3000 : 1500);
      const vendasHoje = Number(meta.vendas_hoje) || 0;
      const pct = Number(meta.percentual_atingido) || 0;
      const falta = Number(meta.falta_para_meta) || Math.max(0, metaValor - vendasHoje);

      if (metaDiariaBadge) {
        metaDiariaBadge.textContent = isEsp ? '🎭 Modo Dia de Espetáculo' : 'Dia Normal';
        metaDiariaBadge.style.background = isEsp ? '#fae8ff' : '#e0f2fe';
        metaDiariaBadge.style.color = isEsp ? '#86198f' : '#0369a1';
      }

      if (metaDiariaProgressoTexto) {
        metaDiariaProgressoTexto.textContent = `${formatarMoeda(vendasHoje)} de ${formatarMoeda(metaValor)} (${pct.toFixed(0)}%)`;
      }

      if (metaDiariaBarra) {
        metaDiariaBarra.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      }

      if (metaDiariaFaltaLabel) {
        metaDiariaFaltaLabel.textContent = falta > 0
          ? `Faltam ${formatarMoeda(falta)} para bater a meta`
          : '🎉 Meta do dia atingida com sucesso!';
      }

      if (metaDiariaPorcentagemLabel) {
        metaDiariaPorcentagemLabel.textContent = `${pct.toFixed(0)}%`;
      }
    } catch (err) {
      console.error('Erro ao carregar meta diária:', err);
    }
  }

  async function abrirModalMetas() {
    if (!modalMetasOverlay) return;
    try {
      if (window.cafeteriaSupabase) {
        const { data } = await window.cafeteriaSupabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['meta_faturamento_dia_normal', 'meta_faturamento_dia_espetaculo']);

        if (data && Array.isArray(data)) {
          data.forEach(cfg => {
            const valNum = Number(cfg.valor) || 0;
            if (cfg.chave === 'meta_faturamento_dia_normal') metaConfigCache.normal = valNum;
            if (cfg.chave === 'meta_faturamento_dia_espetaculo') metaConfigCache.espetaculo = valNum;
          });
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar configuracoes de meta:', e);
    }

    if (inputMetaNormal) inputMetaNormal.value = metaConfigCache.normal || 1500;
    if (inputMetaEspetaculo) inputMetaEspetaculo.value = metaConfigCache.espetaculo || 3000;
    modalMetasOverlay.style.display = 'flex';
  }

  function fecharModalMetas() {
    if (modalMetasOverlay) modalMetasOverlay.style.display = 'none';
  }

  async function salvarMetas(e) {
    if (e) e.preventDefault();
    const valNormal = parseFloat(inputMetaNormal?.value) || 1500;
    const valEspetaculo = parseFloat(inputMetaEspetaculo?.value) || 3000;

    try {
      if (window.cafeteriaSupabase) {
        await Promise.all([
          window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert({ chave: 'meta_faturamento_dia_normal', valor: valNormal, updated_at: new Date().toISOString() }),
          window.cafeteriaSupabase
            .from('configuracoes_sistema')
            .upsert({ chave: 'meta_faturamento_dia_espetaculo', valor: valEspetaculo, updated_at: new Date().toISOString() })
        ]);
      }
      metaConfigCache.normal = valNormal;
      metaConfigCache.espetaculo = valEspetaculo;
      fecharModalMetas();
      await carregarMetaDiaria();
      showToast('Metas atualizadas com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao salvar metas:', err);
      showToast('Erro ao salvar metas.', 'error');
    }
  }

  // --- Exportar CSV ---
  function exportarCSVDespesas() {
    const lista = filtrarDespesas();
    if (lista.length === 0) {
      showToast('Nenhuma despesa para exportar.', 'warning');
      return;
    }

    const headers = [
      'Vencimento',
      'Descrição',
      'Categoria',
      'Fornecedor',
      'Tipo',
      'Recorrência',
      'Valor',
      'Status',
      'Data Pagamento',
      'Valor Pago',
      'Forma Pagamento',
      'Nº Documento',
      'Observações'
    ];

    const rows = lista.map(d => {
      const isPaga = Boolean(d.pago_em);
      const diffDias = calcularDiferencaDias(d.vencimento);
      const statusLabel = isPaga ? 'Pago' : (diffDias < 0 ? 'Vencida' : 'Em Aberto');

      return [
        d.vencimento || '',
        `"${(d.descricao || '').replace(/"/g, '""')}"`,
        `"${(d.categoria?.nome || '').replace(/"/g, '""')}"`,
        `"${(d.fornecedor?.nome || '').replace(/"/g, '""')}"`,
        d.tipo || '',
        d.recorrencia || '',
        (Number(d.valor) || 0).toFixed(2).replace('.', ','),
        statusLabel,
        d.pago_em || '',
        d.valor_pago ? (Number(d.valor_pago) || 0).toFixed(2).replace('.', ',') : '',
        d.forma_pagamento || '',
        `"${(d.documento || d.documento_numero || '').replace(/"/g, '""')}"`,
        `"${(d.observacoes || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const nomeArquivo = `despesas_financeiro_${getHojeYMD()}.csv`;

    if (window.cafeteriaAdmin && typeof window.cafeteriaAdmin.downloadCSV === 'function') {
      window.cafeteriaAdmin.downloadCSV(nomeArquivo, csvContent);
    } else {
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    }

    showToast(`Arquivo ${nomeArquivo} baixado com sucesso!`, 'success');
  }

  // Exporta métodos internos para testes e integração
  window.cafeteriaFinanceiroAdmin = {
    initAdminFinanceiro: window.initAdminFinanceiro,
    switchTab,
    carregarResultadoDRE,
    carregarRecebiveis,
    carregarMetaDiaria,
    exportarCSVDRE,
    salvarMetas
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.initAdminFinanceiro = window.initAdminFinanceiro;
    globalThis.cafeteriaFinanceiroAdmin = window.cafeteriaFinanceiroAdmin;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initAdminFinanceiro: window.initAdminFinanceiro,
      cafeteriaFinanceiroAdmin: window.cafeteriaFinanceiroAdmin
    };
  }
})();
