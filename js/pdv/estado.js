/* =========================================================
   PDV — ESTADO COMPARTILHADO, REFS DOM & ALLOWLIST GLOBAL
   ========================================================= */

export const WINDOW_PDV_ALLOWLIST = Object.freeze([
  'escapeHtml',
  'baristaCheckSession',
  'showToast',
  'showConfirmBottomSheet',
  'showConfirm',
  'showPromptBottomSheet',
  'showSelecionarPagamentoTotemSheet',
  'baristaSalvarPedidoOffline',
  'baristaObterFilaOffline',
  'baristaRemoverPedidoOffline',
  'baristaReenviarPedidoOffline',
  'baristaDescartarPedidoOffline',
  'baristaCancelarItem',
  'baristaLancarCortesia',
  'baristaUpdateQty',
  'baristaOpenObs',
  'baristaLimparCarrinho',
  'baristaSelecionarCliente',
  'baristaDesvincularCliente',
  'baristaAbrirCadastroCliente',
  'baristaRecusarPedidoCliente',
  'baristaAvisarWhatsAppPronto',
  'baristaMarcarNaoRetirado',
  'baristaReceberPedidoTotem',
  'baristaTogglePrioridade',
  'baristaMarcarEntregue',
  'baristaAbrirModalFecharConta',
  'selecionarParte',
  'atribuirItem',
  'mostrarQrPixPagamento',
  'removerPagamentoFechamento',
  'baristaSetFecharContaStep',
  'baristaChamarPedido'
]);

export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function definirGlobalPDV(nome, valor) {
  if (!WINDOW_PDV_ALLOWLIST.includes(nome)) {
    throw new Error(`[PDV] Atribuição não autorizada a window.${nome}`);
  }
  window[nome] = valor;
}

export const estadoPDV = {
  // Estado principal do PDV
  selectedClienteObj: null,
  isPdvOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncingQueue: false,
  wasOffline: false,
  acaoTransferenciaAtiva: null,
  mesaAlvoTransferencia: null,
  currentFecharContaStep: 1,
  currentPartes: [],
  parteAtivaId: null,
  currentUser: null,
  pedidoEmEdicaoId: null,
  allProducts: [],
  sugestoesRegras: [],
  allAdicionais: [],
  allVinculosProduto: [],
  currentCategory: '__rapidos__',
  searchQuery: '',
  cart: [],
  mesas: [],
  activePedidos: [],
  currentFilterStatus: 'todos',
  currentFilterScope: 'todos',
  activeObsCartIndex: null,
  activeMontagemItem: null,
  currentSelectedMesaParaConta: null,
  pedidoOrigemIdAdicao: null,
  activePromos: [],
  cortesiasDisponiveis: [],
  pedidosClienteAguardando: [],
  chamadosMesaPendentes: [],
  pedidosProntosNotificados: new Set(),
  pedidosClienteNotificados: new Set(),
  chamadosNotificados: new Set(),
  ultimoTotalCarrinhoCalculado: 0,
  ultimoPayloadPixCarrinho: '',
  ultimoPixFechamentoState: { payload: '', valor: 0, txid: '', subtitulo: '' },
  isRenderingProducts: false,
  ptrStartY: 0,
  ptrCurrentY: 0,
  isPulling: false,
  touchStartY: 0,
  lastPdvHiddenTime: 0,
  currentFechamento: {
    mesaCodigo: null,
    pedidos: [],
    subtotal: 0,
    descontoAplicado: 0,
    descontoMotivo: '',
    taxaServico: 0,
    totalConta: 0,
    jaPago: 0,
    aPagar: 0,
    pagamentos: [],
    valorRecebidoDinheiro: 0
  },
  configTaxaServico: { ativa: false, percentual: 10 },
  timers: {
    offlineSyncInterval: null,
    alertaPronto: null,
    saveDraft: null,
    buscaCliente: null,
    fetch: null,
    onlineToast: null,
    pendingPdvPedidoFetches: new Map()
  },
  refs: {},
  fn: {}
};

export function atualizarReferenciasDOM() {
  const byId = (id) => document.getElementById(id);

  estadoPDV.refs = {
    // Telas e Navegação
    app: byId('app'),
    loginScreen: byId('login-screen'),
    loginForm: byId('login-form'),
    loginError: byId('login-error'),
    btnLogout: byId('btn-logout'),
    navBtnNovo: byId('nav-btn-novo'),
    navBtnMesas: byId('nav-btn-mesas'),
    viewNovoPedido: byId('view-novo-pedido'),
    viewMesasPedidos: byId('view-mesas-pedidos'),
    badgeProntos: byId('badge-prontos'),

    // Refs Novo Pedido
    mesaSelect: byId('mesa-select'),
    btnMesaTrigger: byId('btn-mesa-trigger'),
    mesaTriggerText: byId('mesa-trigger-text'),
    modalSelecionarMesa: byId('modal-selecionar-mesa'),
    modalSelecionarMesaClose: byId('modal-selecionar-mesa-close'),
    gridSelecaoMesas: byId('grid-selecao-mesas'),
    btnSelecionarBalcao: byId('btn-selecionar-balcao'),
    btnLimparMesa: byId('btn-limpar-mesa'),
    productSearch: byId('product-search'),
    categoriesTabs: byId('categories-tabs'),
    productsGrid: byId('products-grid'),
    cartItemsContainer: byId('cart-items'),
    cartTotalValue: byId('cart-total-value'),
    cartTotalLabel: byId('cart-total-label'),
    cartOfflineNote: byId('cart-offline-note'),
    cartMesaBadge: byId('cart-mesa-badge'),
    btnEnviarPedido: byId('btn-enviar-pedido'),
    btnOfflineQueue: byId('btn-offline-queue'),
    modalOfflineQueue: byId('modal-offline-queue'),
    modalOfflineClose: byId('modal-offline-close'),
    modalOfflineCloseBtn: byId('modal-offline-close-btn'),
    btnSyncOfflineNow: byId('btn-sync-offline-now'),
    offlineQueueList: byId('offline-queue-list'),
    offlineQueueCount: byId('offline-queue-count'),
    pedidoObs: byId('pedido-obs'),
    pedidoClienteNome: byId('pedido-cliente-nome'),
    pedidoClienteId: byId('pedido-cliente-id'),
    clienteBadge: byId('cliente-selecionado-badge'),
    clienteBadgeNome: byId('cliente-selecionado-nome'),
    clienteBadgeTel: byId('cliente-selecionado-tel'),
    clienteBadgeConta: byId('cliente-selecionado-conta'),
    btnDesvincularCliente: byId('btn-desvincular-cliente'),
    sugestoesClientes: byId('sugestoes-clientes'),
    btnAbrirCadastroCliente: byId('btn-abrir-cadastro-cliente'),
    modalCadastroCliente: byId('modal-cadastro-cliente'),
    btnFecharModalCliente: byId('btn-fechar-modal-cliente'),
    btnCancelarCadastroCliente: byId('btn-cancelar-cadastro-cliente'),
    formCadastroClienteRapido: byId('form-cadastro-cliente-rapido'),
    cadClienteNome: byId('cad-cliente-nome'),
    cadClienteTel: byId('cad-cliente-tel'),
    cadClienteConsentimento: byId('cad-cliente-consentimento'),
    pedidoParaViagem: byId('pedido-para-viagem'),
    pedidoPrioritario: byId('pedido-prioritario'),
    boxMotivoPrioridade: byId('box-motivo-prioridade'),
    pedidoPrioridadeMotivo: byId('pedido-prioridade-motivo'),
    pedidoPagamento: byId('pedido-pagamento'),
    pedidoPago: byId('pedido-pago'),

    // Refs Mobile Carrinho & Drawer
    mobileCartBar: byId('mobile-cart-bar'),
    mobileCartCount: byId('mobile-cart-count'),
    mobileCartTotal: byId('mobile-cart-total'),
    btnOpenMobileCart: byId('btn-open-mobile-cart'),
    btnCloseCartDrawer: byId('btn-close-cart-drawer'),
    cartPanel: byId('cart-panel'),
    cartBackdrop: byId('cart-backdrop'),

    // Refs Mesas & Acompanhamento
    mesasGrid: byId('mesas-grid'),
    pedidosCardsGrid: byId('pedidos-cards-grid'),
    filtroChips: document.querySelectorAll('.status-filters .filter-chip'),
    filtroEscopoChips: document.querySelectorAll('.pedidos-filtro-escopo .btn-escopo-chip'),
    viewMesas: byId('view-mesas-pedidos'),
    ptrIndicator: byId('ptr-indicator'),

    // Refs Modais
    modalObs: byId('modal-obs'),
    modalObsTitle: byId('modal-obs-title'),
    modalObsInput: byId('modal-obs-input'),
    modalObsSave: byId('modal-obs-save'),
    modalObsClose: byId('modal-obs-close'),
    modalObsCancel: byId('modal-obs-cancel'),

    modalMontagem: byId('modal-montagem'),
    modalMontagemTitle: byId('modal-montagem-title'),
    modalMontagemList: byId('montagem-adicionais-list'),
    modalMontagemObs: byId('modal-montagem-obs'),
    modalMontagemTotal: byId('montagem-total'),
    modalMontagemCancel: byId('modal-montagem-cancel'),
    modalMontagemSave: byId('modal-montagem-save'),
    modalMontagemClose: byId('modal-montagem-close'),

    modalMesa: byId('modal-mesa'),
    modalMesaTitle: byId('modal-mesa-title'),
    modalMesaBody: byId('modal-mesa-body'),
    modalMesaClose: byId('modal-mesa-close'),
    modalMesaFechar: byId('modal-mesa-fechar'),
    modalMesaPrint: byId('modal-mesa-print'),
    modalMesaFecharConta: byId('modal-mesa-fechar-conta'),
    btnMesaTransferir: byId('btn-mesa-transferir'),
    btnMesaJuntar: byId('btn-mesa-juntar'),
    modalTransferirMesa: byId('modal-transferir-mesa'),
    modalTransferirTitle: byId('modal-transferir-title'),
    selectTransferirMesa: byId('transferir-mesa-select'),
    btnTransferirClose: byId('modal-transferir-close'),
    btnTransferirCancel: byId('modal-transferir-cancel'),
    btnTransferirConfirm: byId('modal-transferir-confirm'),

    btnMesaAdicionarItens: byId('btn-mesa-adicionar-itens'),
    btnMesaRepetirRodada: byId('btn-mesa-repetir-rodada'),
    bannerAdicionandoItens: byId('banner-adicionando-itens'),
    lblMesaAdicionando: byId('lbl-mesa-adicionando'),
    btnCancelarAdicao: byId('btn-cancelar-adicao'),
    btnMesaMaisAcoes: byId('btn-mesa-mais-acoes'),
    sheetMesaAcoes: byId('modal-mesa-sheet-acoes'),
    btnMesaSheetClose: byId('btn-mesa-sheet-close'),
    backdropMesaSheet: byId('modal-mesa-sheet-backdrop'),

    modalFecharConta: byId('modal-fechar-conta'),
    fecharContaTitle: byId('modal-fechar-conta-title'),
    fecharContaClose: byId('modal-fechar-conta-close'),
    fecharContaCancelar: byId('modal-fechar-conta-cancelar'),
    fecharContaConfirmar: byId('modal-fechar-conta-confirmar'),
    btnFecharContaVoltar: byId('btn-fechar-conta-voltar'),
    btnFecharContaVoltarFooter: byId('btn-fechar-conta-voltar-footer'),
    fecharContaStepSub: byId('fechar-conta-step-sub'),
    btnFecharContaNext1: byId('btn-fechar-conta-next-1'),
    btnFecharContaNext2: byId('btn-fechar-conta-next-2'),
    fecharContaFooterLabel: byId('fechar-conta-footer-label'),
    fecharContaFooterVal: byId('fechar-conta-footer-val'),
    stepFecharConsumo: byId('step-fechar-consumo'),
    stepFecharAjustes: byId('step-fechar-ajustes'),
    stepFecharPagamento: byId('step-fechar-pagamento'),
    fecharContaResumo: byId('fechar-conta-resumo-pedidos'),

    fecharContaSubtotalLbl: byId('fechar-conta-subtotal-lbl'),
    fecharContaDivDesconto: byId('fechar-conta-div-desconto'),
    fecharContaDescontoTipo: byId('fechar-conta-desconto-tipo'),
    fecharContaDescontoValor: byId('fechar-conta-desconto-valor'),
    fecharContaDescontoMotivo: byId('fechar-conta-desconto-motivo'),
    btnSolicitarDescontoPin: byId('btn-solicitar-desconto-pin'),

    fecharContaCupomInput: byId('fechar-conta-cupom-input'),
    btnFecharContaAplicarCupom: byId('btn-fechar-conta-aplicar-cupom'),
    fecharContaCupomMsg: byId('fechar-conta-cupom-msg'),

    fecharContaDivTaxa: byId('fechar-conta-div-taxa'),
    fecharContaTaxaCheck: byId('fechar-conta-taxa-check'),
    fecharContaTaxaPercLbl: byId('fechar-conta-taxa-perc-lbl'),
    fecharContaTaxaValLbl: byId('fechar-conta-taxa-val-lbl'),

    fecharContaTotalLbl: byId('fechar-conta-total-lbl'),
    fecharContaJaPagoLbl: byId('fechar-conta-ja-pago-lbl'),
    fecharContaAPagarLbl: byId('fechar-conta-a-pagar-lbl'),
    fecharContaFaltaLbl: byId('fechar-conta-falta-lbl'),
    fecharContaForma: byId('fechar-conta-forma'),
    fecharContaValor: byId('fechar-conta-valor'),
    btnAddPagamento: byId('btn-add-pagamento'),
    divDinheiroRecebido: byId('div-dinheiro-recebido'),
    inputDinheiroRecebido: byId('fechar-conta-dinheiro-recebido'),
    containerTrocoChips: byId('fechar-conta-troco-chips'),
    fecharContaTrocoLbl: byId('fechar-conta-troco-lbl'),
    fecharContaLista: byId('fechar-conta-lista-pagamentos'),

    fecharContaModo: byId('fechar-conta-modo'),
    fecharContaDivPessoas: byId('fechar-conta-div-pessoas'),
    fecharContaNumPessoas: byId('fechar-conta-num-pessoas'),
    btnGerarPartesIgual: byId('btn-gerar-partes-igual'),
    fecharContaDivAddParte: byId('fechar-conta-div-add-parte'),
    fecharContaNomeParte: byId('fechar-conta-nome-parte'),
    btnAddParteItem: byId('btn-add-parte-item'),
    fecharContaListaPartes: byId('fechar-conta-lista-partes'),
    fecharContaPainelPagamento: byId('fechar-conta-painel-pagamento'),
    tituloPagamentoParte: byId('titulo-pagamento-parte'),
    fecharContaImprimirCupom: byId('fechar-conta-imprimir-cupom'),
    fecharContaEmitirNfce: byId('fechar-conta-emitir-nfce'),
    fecharContaNfceCpf: byId('fechar-conta-nfce-cpf'),
    fecharContaDivParcialItens: byId('fechar-conta-div-parcial-itens'),
    fecharContaListaItensParcial: byId('fechar-conta-lista-itens-parcial'),
    fecharContaDivParcialValor: byId('fechar-conta-div-parcial-valor'),
    fecharContaInputParcialValor: byId('fechar-conta-input-parcial-valor'),

    // Refs Notificação / Som / Triagem
    audioPronto: byId('audio-pronto'),
    audioNovoPedidoCliente: byId('audio-novo-pedido-cliente'),
    btnToggleSound: byId('btn-toggle-sound'),
    soundToggleIcon: byId('sound-toggle-icon'),
    alertaProntoTop: byId('alerta-pronto-top'),
    alertaProntoTitulo: byId('alerta-pronto-titulo'),
    alertaProntoSubtitulo: byId('alerta-pronto-subtitulo'),
    btnAlertaProntoAcao: byId('btn-alerta-pronto-acao'),
    btnAlertaProntoFechar: byId('btn-alerta-pronto-fechar'),

    btnPedidosClienteNav: byId('btn-pedidos-cliente-nav'),
    badgePedidosCliente: byId('badge-pedidos-cliente'),
    btnChamadosMesaNav: byId('btn-chamados-mesa-nav'),
    badgeChamadosMesa: byId('badge-chamados-mesa'),
    bannerPedidosClienteContainer: byId('banner-pedidos-cliente-container'),
    bannerPedidosClienteQtd: byId('banner-pedidos-cliente-qtd'),
    btnAbrirTriagemPedidosCliente: byId('btn-abrir-triagem-pedidos-cliente'),
    bannerChamadosMesaContainer: byId('banner-chamados-mesa-container'),
    bannerChamadosMesaTexto: byId('banner-chamados-mesa-texto'),
    btnAtenderChamadoTopo: byId('btn-atender-chamado-topo'),
    modalPedidosClienteTriagem: byId('modal-pedidos-cliente-triagem'),
    listaPedidosClienteAguardando: byId('lista-pedidos-cliente-aguardando'),
    btnFecharTriagemPedidosCliente: byId('btn-fechar-triagem-pedidos-cliente'),
    btnFecharTriagemFooter: byId('btn-fechar-triagem-footer')
  };

  return estadoPDV.refs;
}

export function resetarEstadoPDV() {
  if (estadoPDV.timers.offlineSyncInterval) {
    clearInterval(estadoPDV.timers.offlineSyncInterval);
    estadoPDV.timers.offlineSyncInterval = null;
  }
  if (estadoPDV.timers.alertaPronto) {
    clearTimeout(estadoPDV.timers.alertaPronto);
    estadoPDV.timers.alertaPronto = null;
  }
  if (estadoPDV.timers.saveDraft) {
    clearTimeout(estadoPDV.timers.saveDraft);
    estadoPDV.timers.saveDraft = null;
  }
  if (estadoPDV.timers.buscaCliente) {
    clearTimeout(estadoPDV.timers.buscaCliente);
    estadoPDV.timers.buscaCliente = null;
  }
  if (estadoPDV.timers.fetch) {
    clearTimeout(estadoPDV.timers.fetch);
    estadoPDV.timers.fetch = null;
  }
  if (estadoPDV.timers.onlineToast) {
    clearTimeout(estadoPDV.timers.onlineToast);
    estadoPDV.timers.onlineToast = null;
  }
  if (estadoPDV.timers.pendingPdvPedidoFetches instanceof Map) {
    estadoPDV.timers.pendingPdvPedidoFetches.forEach((timerId) => clearTimeout(timerId));
    estadoPDV.timers.pendingPdvPedidoFetches.clear();
  } else {
    estadoPDV.timers.pendingPdvPedidoFetches = new Map();
  }

  estadoPDV.selectedClienteObj = null;
  estadoPDV.isPdvOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  estadoPDV.isSyncingQueue = false;
  estadoPDV.wasOffline = false;
  estadoPDV.acaoTransferenciaAtiva = null;
  estadoPDV.mesaAlvoTransferencia = null;
  estadoPDV.currentFecharContaStep = 1;
  estadoPDV.currentPartes = [];
  estadoPDV.parteAtivaId = null;
  estadoPDV.currentUser = null;
  estadoPDV.pedidoEmEdicaoId = null;
  estadoPDV.allProducts = [];
  estadoPDV.allAdicionais = [];
  estadoPDV.allVinculosProduto = [];
  estadoPDV.currentCategory = '__rapidos__';
  estadoPDV.searchQuery = '';
  estadoPDV.cart = [];
  estadoPDV.mesas = [];
  estadoPDV.activePedidos = [];
  estadoPDV.currentFilterStatus = 'todos';
  estadoPDV.currentFilterScope = (typeof localStorage !== 'undefined' && localStorage.getItem('cafeteria_pedidos_filtro_escopo')) || 'todos';
  estadoPDV.activeObsCartIndex = null;
  estadoPDV.activeMontagemItem = null;
  estadoPDV.currentSelectedMesaParaConta = null;
  estadoPDV.pedidoOrigemIdAdicao = null;
  estadoPDV.activePromos = [];
  estadoPDV.cortesiasDisponiveis = [];
  estadoPDV.pedidosClienteAguardando = [];
  estadoPDV.chamadosMesaPendentes = [];
  estadoPDV.pedidosProntosNotificados = new Set();
  estadoPDV.pedidosClienteNotificados = new Set();
  estadoPDV.chamadosNotificados = new Set();
  estadoPDV.ultimoTotalCarrinhoCalculado = 0;
  estadoPDV.ultimoPayloadPixCarrinho = '';
  estadoPDV.ultimoPixFechamentoState = { payload: '', valor: 0, txid: '', subtitulo: '' };
  estadoPDV.isRenderingProducts = false;
  estadoPDV.ptrStartY = 0;
  estadoPDV.ptrCurrentY = 0;
  estadoPDV.isPulling = false;
  estadoPDV.touchStartY = 0;
  estadoPDV.lastPdvHiddenTime = 0;

  estadoPDV.currentFechamento = {
    mesaCodigo: null,
    pedidos: [],
    subtotal: 0,
    descontoAplicado: 0,
    descontoMotivo: '',
    taxaServico: 0,
    totalConta: 0,
    jaPago: 0,
    aPagar: 0,
    pagamentos: [],
    valorRecebidoDinheiro: 0
  };
  estadoPDV.configTaxaServico = { ativa: false, percentual: 10 };
  estadoPDV.fn = {};

  if (!window.escapeHtml) {
    definirGlobalPDV('escapeHtml', escapeHtml);
  }

  atualizarReferenciasDOM();
}
