/* =========================================================
   PEDIDOS.JS — Lógica do PDV do Barista / Atendimento
   ========================================================= */

(function () {
  'use strict';

  if (!window.escapeHtml) {
    window.escapeHtml = function(unsafe) {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
  }

  // Refs de Telas e Navegação
  const app = document.getElementById('app');
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

  const navBtnNovo = document.getElementById('nav-btn-novo');
  const navBtnMesas = document.getElementById('nav-btn-mesas');
  const viewNovoPedido = document.getElementById('view-novo-pedido');
  const viewMesasPedidos = document.getElementById('view-mesas-pedidos');
  const badgeProntos = document.getElementById('badge-prontos');

  // Refs Novo Pedido
  const mesaSelect = document.getElementById('mesa-select');
  const btnMesaTrigger = document.getElementById('btn-mesa-trigger');
  const mesaTriggerText = document.getElementById('mesa-trigger-text');
  const modalSelecionarMesa = document.getElementById('modal-selecionar-mesa');
  const modalSelecionarMesaClose = document.getElementById('modal-selecionar-mesa-close');
  const gridSelecaoMesas = document.getElementById('grid-selecao-mesas');
  const btnSelecionarBalcao = document.getElementById('btn-selecionar-balcao');
  const btnLimparMesa = document.getElementById('btn-limpar-mesa');
  const productSearch = document.getElementById('product-search');
  const categoriesTabs = document.getElementById('categories-tabs');
  const productsGrid = document.getElementById('products-grid');
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalValue = document.getElementById('cart-total-value');
  const cartTotalLabel = document.getElementById('cart-total-label');
  const cartOfflineNote = document.getElementById('cart-offline-note');
  const cartMesaBadge = document.getElementById('cart-mesa-badge');
  const btnEnviarPedido = document.getElementById('btn-enviar-pedido');
  const btnOfflineQueue = document.getElementById('btn-offline-queue');
  const modalOfflineQueue = document.getElementById('modal-offline-queue');
  const modalOfflineClose = document.getElementById('modal-offline-close');
  const modalOfflineCloseBtn = document.getElementById('modal-offline-close-btn');
  const btnSyncOfflineNow = document.getElementById('btn-sync-offline-now');
  const offlineQueueList = document.getElementById('offline-queue-list');
  const offlineQueueCount = document.getElementById('offline-queue-count');
  const pedidoObs = document.getElementById('pedido-obs');
  const pedidoClienteNome = document.getElementById('pedido-cliente-nome');
  const pedidoClienteId = document.getElementById('pedido-cliente-id');
  const clienteBadge = document.getElementById('cliente-selecionado-badge');
  const clienteBadgeNome = document.getElementById('cliente-selecionado-nome');
  const clienteBadgeTel = document.getElementById('cliente-selecionado-tel');
  const clienteBadgeConta = document.getElementById('cliente-selecionado-conta');
  const btnDesvincularCliente = document.getElementById('btn-desvincular-cliente');
  let selectedClienteObj = null;
  const sugestoesClientes = document.getElementById('sugestoes-clientes');
  const btnAbrirCadastroCliente = document.getElementById('btn-abrir-cadastro-cliente');
  const modalCadastroCliente = document.getElementById('modal-cadastro-cliente');
  const btnFecharModalCliente = document.getElementById('btn-fechar-modal-cliente');
  const btnCancelarCadastroCliente = document.getElementById('btn-cancelar-cadastro-cliente');
  const formCadastroClienteRapido = document.getElementById('form-cadastro-cliente-rapido');
  const cadClienteNome = document.getElementById('cad-cliente-nome');
  const cadClienteTel = document.getElementById('cad-cliente-tel');
  const cadClienteConsentimento = document.getElementById('cad-cliente-consentimento');
  const pedidoParaViagem = document.getElementById('pedido-para-viagem');
  const pedidoPrioritario = document.getElementById('pedido-prioritario');
  const boxMotivoPrioridade = document.getElementById('box-motivo-prioridade');
  const pedidoPrioridadeMotivo = document.getElementById('pedido-prioridade-motivo');
  const pedidoPagamento = document.getElementById('pedido-pagamento');
  const pedidoPago = document.getElementById('pedido-pago');

  let isPdvOnline = navigator.onLine;
  let isSyncingQueue = false;

  // Refs Mobile Carrinho & Drawer
  const mobileCartBar = document.getElementById('mobile-cart-bar');
  const mobileCartCount = document.getElementById('mobile-cart-count');
  const mobileCartTotal = document.getElementById('mobile-cart-total');
  const btnOpenMobileCart = document.getElementById('btn-open-mobile-cart');
  const btnCloseCartDrawer = document.getElementById('btn-close-cart-drawer');
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');

  // Refs Mesas & Acompanhamento
  const mesasGrid = document.getElementById('mesas-grid');
  const pedidosCardsGrid = document.getElementById('pedidos-cards-grid');
  const filtroChips = document.querySelectorAll('.status-filters .filter-chip');
  const filtroEscopoChips = document.querySelectorAll('.pedidos-filtro-escopo .btn-escopo-chip');

  // Refs Modais
  const modalObs = document.getElementById('modal-obs');
  const modalObsTitle = document.getElementById('modal-obs-title');
  const modalObsInput = document.getElementById('modal-obs-input');
  const modalObsSave = document.getElementById('modal-obs-save');
  const modalObsClose = document.getElementById('modal-obs-close');
  const modalObsCancel = document.getElementById('modal-obs-cancel');

  const modalMontagem = document.getElementById('modal-montagem');
  const modalMontagemTitle = document.getElementById('modal-montagem-title');
  const modalMontagemList = document.getElementById('montagem-adicionais-list');
  const modalMontagemObs = document.getElementById('modal-montagem-obs');
  const modalMontagemTotal = document.getElementById('montagem-total');
  const modalMontagemCancel = document.getElementById('modal-montagem-cancel');
  const modalMontagemSave = document.getElementById('modal-montagem-save');
  const modalMontagemClose = document.getElementById('modal-montagem-close');

  const modalMesa = document.getElementById('modal-mesa');
  const modalMesaTitle = document.getElementById('modal-mesa-title');
  const modalMesaBody = document.getElementById('modal-mesa-body');
  const modalMesaClose = document.getElementById('modal-mesa-close');
  const modalMesaFechar = document.getElementById('modal-mesa-fechar');
  const modalMesaPrint = document.getElementById('modal-mesa-print');
  const modalMesaFecharConta = document.getElementById('modal-mesa-fechar-conta');
  const btnMesaTransferir = document.getElementById('btn-mesa-transferir');
  const btnMesaJuntar = document.getElementById('btn-mesa-juntar');
  const modalTransferirMesa = document.getElementById('modal-transferir-mesa');
  const modalTransferirTitle = document.getElementById('modal-transferir-title');
  const selectTransferirMesa = document.getElementById('transferir-mesa-select');
  const btnTransferirClose = document.getElementById('modal-transferir-close');
  const btnTransferirCancel = document.getElementById('modal-transferir-cancel');
  const btnTransferirConfirm = document.getElementById('modal-transferir-confirm');
  let acaoTransferenciaAtiva = null;
  let mesaAlvoTransferencia = null;

  const btnMesaAdicionarItens = document.getElementById('btn-mesa-adicionar-itens');
  const btnMesaRepetirRodada = document.getElementById('btn-mesa-repetir-rodada');
  const bannerAdicionandoItens = document.getElementById('banner-adicionando-itens');
  const lblMesaAdicionando = document.getElementById('lbl-mesa-adicionando');
  const btnCancelarAdicao = document.getElementById('btn-cancelar-adicao');

  const modalFecharConta = document.getElementById('modal-fechar-conta');
  const fecharContaTitle = document.getElementById('modal-fechar-conta-title');
  const fecharContaClose = document.getElementById('modal-fechar-conta-close');
  const fecharContaCancelar = document.getElementById('modal-fechar-conta-cancelar');
  const fecharContaConfirmar = document.getElementById('modal-fechar-conta-confirmar');
  const btnFecharContaVoltar = document.getElementById('btn-fechar-conta-voltar');
  const fecharContaStepSub = document.getElementById('fechar-conta-step-sub');
  const btnFecharContaNext1 = document.getElementById('btn-fechar-conta-next-1');
  const btnFecharContaNext2 = document.getElementById('btn-fechar-conta-next-2');
  const fecharContaFooterLabel = document.getElementById('fechar-conta-footer-label');
  const fecharContaFooterVal = document.getElementById('fechar-conta-footer-val');
  const stepFecharConsumo = document.getElementById('step-fechar-consumo');
  const stepFecharAjustes = document.getElementById('step-fechar-ajustes');
  const stepFecharPagamento = document.getElementById('step-fechar-pagamento');
  let currentFecharContaStep = 1;
  const fecharContaResumo = document.getElementById('fechar-conta-resumo-pedidos');
  
  const fecharContaSubtotalLbl = document.getElementById('fechar-conta-subtotal-lbl');
  
  const fecharContaDivDesconto = document.getElementById('fechar-conta-div-desconto');
  const fecharContaDescontoTipo = document.getElementById('fechar-conta-desconto-tipo');
  const fecharContaDescontoValor = document.getElementById('fechar-conta-desconto-valor');
  const fecharContaDescontoMotivo = document.getElementById('fechar-conta-desconto-motivo');

  const fecharContaCupomInput = document.getElementById('fechar-conta-cupom-input');
  const btnFecharContaAplicarCupom = document.getElementById('btn-fechar-conta-aplicar-cupom');
  const fecharContaCupomMsg = document.getElementById('fechar-conta-cupom-msg');
  
  const fecharContaDivTaxa = document.getElementById('fechar-conta-div-taxa');
  const fecharContaTaxaCheck = document.getElementById('fechar-conta-taxa-check');
  const fecharContaTaxaPercLbl = document.getElementById('fechar-conta-taxa-perc-lbl');
  const fecharContaTaxaValLbl = document.getElementById('fechar-conta-taxa-val-lbl');
  
  const fecharContaTotalLbl = document.getElementById('fechar-conta-total-lbl');
  const fecharContaJaPagoLbl = document.getElementById('fechar-conta-ja-pago-lbl');
  const fecharContaAPagarLbl = document.getElementById('fechar-conta-a-pagar-lbl');
  const fecharContaFaltaLbl = document.getElementById('fechar-conta-falta-lbl');
  const fecharContaForma = document.getElementById('fechar-conta-forma');
  const fecharContaValor = document.getElementById('fechar-conta-valor');
  const btnAddPagamento = document.getElementById('btn-add-pagamento');
  const divDinheiroRecebido = document.getElementById('div-dinheiro-recebido');
  const inputDinheiroRecebido = document.getElementById('fechar-conta-dinheiro-recebido');
  const containerTrocoChips = document.getElementById('fechar-conta-troco-chips');
  const fecharContaTrocoLbl = document.getElementById('fechar-conta-troco-lbl');
  const fecharContaLista = document.getElementById('fechar-conta-lista-pagamentos');

  const fecharContaModo = document.getElementById('fechar-conta-modo');
  const fecharContaDivPessoas = document.getElementById('fechar-conta-div-pessoas');
  const fecharContaNumPessoas = document.getElementById('fechar-conta-num-pessoas');
  const btnGerarPartesIgual = document.getElementById('btn-gerar-partes-igual');
  const fecharContaDivAddParte = document.getElementById('fechar-conta-div-add-parte');
  const fecharContaNomeParte = document.getElementById('fechar-conta-nome-parte');
  const btnAddParteItem = document.getElementById('btn-add-parte-item');
  const fecharContaListaPartes = document.getElementById('fechar-conta-lista-partes');
  const fecharContaPainelPagamento = document.getElementById('fechar-conta-painel-pagamento');
  const tituloPagamentoParte = document.getElementById('titulo-pagamento-parte');
  const fecharContaImprimirCupom = document.getElementById('fechar-conta-imprimir-cupom');


  const audioPronto = document.getElementById('audio-pronto');
  const audioNovoPedidoCliente = document.getElementById('audio-novo-pedido-cliente');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const soundToggleIcon = document.getElementById('sound-toggle-icon');
  const alertaProntoTop = document.getElementById('alerta-pronto-top');
  const alertaProntoTitulo = document.getElementById('alerta-pronto-titulo');
  const alertaProntoSubtitulo = document.getElementById('alerta-pronto-subtitulo');
  const btnAlertaProntoAcao = document.getElementById('btn-alerta-pronto-acao');
  const btnAlertaProntoFechar = document.getElementById('btn-alerta-pronto-fechar');
  const pedidosProntosNotificados = new Set();
  let alertaProntoTimeout = null;

  // CAF-000037: Elementos de Pedidos QR e Chamados de Mesa
  const btnPedidosClienteNav = document.getElementById('btn-pedidos-cliente-nav');
  const badgePedidosCliente = document.getElementById('badge-pedidos-cliente');
  const btnChamadosMesaNav = document.getElementById('btn-chamados-mesa-nav');
  const badgeChamadosMesa = document.getElementById('badge-chamados-mesa');
  const bannerPedidosClienteContainer = document.getElementById('banner-pedidos-cliente-container');
  const bannerPedidosClienteQtd = document.getElementById('banner-pedidos-cliente-qtd');
  const btnAbrirTriagemPedidosCliente = document.getElementById('btn-abrir-triagem-pedidos-cliente');
  const bannerChamadosMesaContainer = document.getElementById('banner-chamados-mesa-container');
  const bannerChamadosMesaTexto = document.getElementById('banner-chamados-mesa-texto');
  const btnAtenderChamadoTopo = document.getElementById('btn-atender-chamado-topo');
  const modalPedidosClienteTriagem = document.getElementById('modal-pedidos-cliente-triagem');
  const listaPedidosClienteAguardando = document.getElementById('lista-pedidos-cliente-aguardando');
  const btnFecharTriagemPedidosCliente = document.getElementById('btn-fechar-triagem-pedidos-cliente');
  const btnFecharTriagemFooter = document.getElementById('btn-fechar-triagem-footer');

  let pedidosClienteAguardando = [];
  let chamadosMesaPendentes = [];
  const pedidosClienteNotificados = new Set();
  const chamadosNotificados = new Set();

  // Estado
  let currentUser = null;
  let allProducts = [];
  let allAdicionais = [];
  let allVinculosProduto = [];
  let currentCategory = '__rapidos__';
  let searchQuery = '';
  let cart = []; // Array de { produto, quantidade, observacoes, adicionaisSelecionados: [] }
  let mesas = [];
  let activePedidos = [];
  let currentFilterStatus = 'todos';
  let currentFilterScope = localStorage.getItem('cafeteria_pedidos_filtro_escopo') || 'todos';
  let activeObsCartIndex = null;
  let activeMontagemItem = null; // Guardará o item temporário da montagem
  let currentSelectedMesaParaConta = null;
  let pedidoOrigemIdAdicao = null;
  
  let currentFechamento = {
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
  let configTaxaServico = { ativa: false, percentual: 10 };

  let activePromos = [];
  let cortesiasDisponiveis = [];

  // -----------------------------------------------------
  // 1. AUTENTICAÇÃO
  // -----------------------------------------------------
  async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data && data.session) {
      await loadProfile(data.session.user);
    }
  }

  // -----------------------------------------------------
  // TOAST COMPONENT & BOTTOM SHEET (CAF-000056)
  // -----------------------------------------------------
  window.showToast = function(message, optionsOrActionText = null, actionCallback = null, duracaoMs = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    let tipo = 'info';
    let acaoTexto = null;
    let acaoCb = null;
    let duracao = duracaoMs;

    if (typeof optionsOrActionText === 'object' && optionsOrActionText !== null) {
      tipo = optionsOrActionText.tipo || 'info';
      acaoTexto = optionsOrActionText.acaoTexto || null;
      acaoCb = optionsOrActionText.acaoCallback || null;
      duracao = optionsOrActionText.duracaoMs || duracao;
    } else if (typeof optionsOrActionText === 'string') {
      acaoTexto = optionsOrActionText;
      acaoCb = actionCallback;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${tipo}`;
    toast.setAttribute('role', 'alert');

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: '☕'
    };
    const icon = icons[tipo] || 'ℹ';

    const msgWrap = document.createElement('div');
    msgWrap.className = 'toast-msg-wrap';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icon;
    msgWrap.appendChild(iconSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = message;
    msgWrap.appendChild(textSpan);

    toast.appendChild(msgWrap);

    let isRemoved = false;
    let timeoutId = null;

    const removeToast = () => {
      if (isRemoved) return;
      isRemoved = true;
      if (timeoutId) clearTimeout(timeoutId);
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    };

    if (acaoTexto && acaoCb) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action';
      actionBtn.textContent = acaoTexto;
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch (_) {}
        }
        acaoCb();
        removeToast();
      };
      toast.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Fechar notificação');
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      removeToast();
    };
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    timeoutId = setTimeout(removeToast, duracao);
  };

  window.showConfirmBottomSheet = function(opts) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('modal-confirm-title');
      const msgEl = document.getElementById('modal-confirm-msg');
      const btnCancel = document.getElementById('modal-confirm-cancel');
      const btnOk = document.getElementById('modal-confirm-ok');

      if (!modal) {
        resolve(true);
        return;
      }

      const titulo = typeof opts === 'string' ? opts : (opts && opts.titulo ? opts.titulo : 'Confirmar');
      const mensagem = typeof opts === 'object' && opts !== null ? (opts.mensagem || '') : (arguments[1] || '');
      const textoConfirmar = (opts && opts.textoConfirmar) ? opts.textoConfirmar : 'Confirmar';
      const textoCancelar = (opts && opts.textoCancelar !== undefined) ? opts.textoCancelar : 'Cancelar';
      const perigoso = !!(opts && opts.perigoso);

      titleEl.textContent = titulo;
      msgEl.textContent = mensagem;
      btnOk.textContent = textoConfirmar;

      if (perigoso) {
        btnOk.className = 'btn-destructive';
      } else {
        btnOk.className = 'btn-primary-small';
      }

      if (!textoCancelar) {
        btnCancel.classList.add('hidden');
      } else {
        btnCancel.classList.remove('hidden');
        btnCancel.textContent = textoCancelar;
      }

      let isClosed = false;
      const close = (result) => {
        if (isClosed) return;
        isClosed = true;
        modal.classList.add('hidden');
        btnCancel.onclick = null;
        btnOk.onclick = null;
        modal.onclick = null;
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      btnCancel.onclick = (e) => {
        e.stopPropagation();
        close(false);
      };

      btnOk.onclick = (e) => {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(12); } catch (_) {}
        }
        close(true);
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          close(false);
        }
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          close(false);
        }
      };
      document.addEventListener('keydown', onKeyDown);

      modal.classList.remove('hidden');
    });
  };

  // Mantém compatibilidade com chamadas legadas showConfirm(title, msg)
  window.showConfirm = function(title, msg) {
    return window.showConfirmBottomSheet({ titulo: title, mensagem: msg });
  };

  // -----------------------------------------------------
  // INDEXEDDB — Fila Local de Pedidos Offline (CAF-000018)
  // -----------------------------------------------------
  const IDB_NAME = 'CafeteriaPDV_DB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'pedidos_offline';

  function openOfflineDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[OfflineDB] IndexedDB não suportado.');
        return resolve(null);
      }
      try {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            const store = db.createObjectStore(IDB_STORE, { keyPath: 'client_id' });
            store.createIndex('created_at', 'created_at', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => {
          console.error('[OfflineDB] Erro ao abrir IndexedDB:', e);
          resolve(null);
        };
      } catch (err) {
        console.error('[OfflineDB] Falha crítica no IndexedDB:', err);
        resolve(null);
      }
    });
  }

  async function dbSalvarPedidoOffline(pedidoData) {
    const db = await openOfflineDB();
    if (!db) {
      try {
        const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        const idx = list.findIndex(p => p.client_id === pedidoData.client_id);
        if (idx >= 0) list[idx] = pedidoData;
        else list.push(pedidoData);
        localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(list));
      } catch (e) {
        console.error('Fallback localStorage falhou:', e);
      }
      return true;
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(pedidoData);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.error('[OfflineDB] Erro ao gravar pedido:', e);
          reject(e);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  async function dbObterFilaOffline() {
    const db = await openOfflineDB();
    if (!db) {
      try {
        const list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return list;
      } catch {
        return [];
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = req.result || [];
          items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          resolve(items);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function dbRemoverPedidoOffline(clientId) {
    const db = await openOfflineDB();
    if (!db) {
      try {
        let list = JSON.parse(localStorage.getItem('cafeteria_pedidos_offline_fallback') || '[]');
        list = list.filter(item => item.client_id !== clientId);
        localStorage.setItem('cafeteria_pedidos_offline_fallback', JSON.stringify(list));
      } catch {}
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.delete(clientId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function dbAtualizarStatusPedidoOffline(clientId, status, ultimoErro = null) {
    const db = await openOfflineDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(clientId);
        req.onsuccess = () => {
          if (req.result) {
            const item = req.result;
            item.status = status;
            if (ultimoErro !== null) item.ultimo_erro = ultimoErro;
            item.tentativas = (item.tentativas || 0) + 1;
            store.put(item);
          }
        };
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function atualizarModoConexaoCarrinho() {
    if (cartTotalLabel) {
      cartTotalLabel.textContent = isPdvOnline ? 'Total:' : 'Total estimado:';
    }
    if (cartOfflineNote) {
      if (!isPdvOnline) {
        cartOfflineNote.classList.remove('hidden');
      } else {
        cartOfflineNote.classList.add('hidden');
      }
    }
    if (btnEnviarPedido && !btnEnviarPedido.disabled) {
      btnEnviarPedido.textContent = isPdvOnline ? 'Enviar para Cozinha' : 'Salvar na Fila (Offline)';
    }
  }

  async function atualizarContadorFilaOffline() {
    const fila = await dbObterFilaOffline();
    const count = fila.length;
    if (offlineQueueCount) offlineQueueCount.textContent = count;
    
    if (btnOfflineQueue) {
      if (count > 0) {
        btnOfflineQueue.textContent = `⏳ ${count} Pendente${count > 1 ? 's' : ''}`;
        btnOfflineQueue.classList.remove('hidden');
        btnOfflineQueue.classList.add('pulse-queue');
      } else {
        btnOfflineQueue.classList.add('hidden');
        btnOfflineQueue.classList.remove('pulse-queue');
      }
    }
    return fila;
  }

  async function processarFilaOffline() {
    if (isSyncingQueue) return;
    if (!navigator.onLine) {
      await atualizarContadorFilaOffline();
      return;
    }

    const fila = await dbObterFilaOffline();
    if (fila.length === 0) {
      await atualizarContadorFilaOffline();
      return;
    }

    isSyncingQueue = true;
    if (btnSyncOfflineNow) {
      btnSyncOfflineNow.disabled = true;
      btnSyncOfflineNow.textContent = '🔄 Enviando...';
    }
    if (btnOfflineQueue) {
      btnOfflineQueue.textContent = `🔄 Enviando (${fila.length})...`;
    }

    let enviadosComSucesso = 0;

    for (const pedido of fila) {
      if (!navigator.onLine) break;

      try {
        await dbAtualizarStatusPedidoOffline(pedido.client_id, 'enviando');
        
        const { data: pedidoData, error: pedidoError } = await window.cafeteriaSupabase.rpc('criar_pedido', {
          p_payload: pedido.payload
        });

        if (pedidoError) {
          console.error('[OfflineQueue] Erro ao sincronizar pedido:', pedido.client_id, pedidoError);
          if (pedidoError.message && (pedidoError.message.includes('fetch') || pedidoError.message.includes('network') || pedidoError.message.includes('Failed'))) {
            await dbAtualizarStatusPedidoOffline(pedido.client_id, 'aguardando_envio', 'Erro de conexão');
            break;
          } else {
            await dbAtualizarStatusPedidoOffline(pedido.client_id, 'falha', pedidoError.message);
          }
        } else {
          await dbRemoverPedidoOffline(pedido.client_id);
          enviadosComSucesso++;
          const mesaStr = pedido.mesa_codigo ? (pedido.mesa_codigo === 'BALCAO' ? 'Balcão' : `Mesa ${pedido.mesa_codigo}`) : 'Balcão';
          showToast(`✅ Pedido (${mesaStr}) sincronizado com a cozinha!`);
        }
      } catch (err) {
        console.error('[OfflineQueue] Exceção durante envio:', err);
        await dbAtualizarStatusPedidoOffline(pedido.client_id, 'aguardando_envio', err.message);
        break;
      }
    }

    isSyncingQueue = false;
    if (btnSyncOfflineNow) {
      btnSyncOfflineNow.disabled = false;
      btnSyncOfflineNow.textContent = '🔄 Sincronizar Fila Agora';
    }

    await atualizarContadorFilaOffline();

    if (enviadosComSucesso > 0) {
      await loadActivePedidos();
    }

    if (modalOfflineQueue && !modalOfflineQueue.classList.contains('hidden')) {
      renderOfflineQueueModal();
    }
  }

  async function renderOfflineQueueModal() {
    const fila = await dbObterFilaOffline();
    if (offlineQueueCount) offlineQueueCount.textContent = fila.length;
    if (!offlineQueueList) return;

    if (fila.length === 0) {
      offlineQueueList.innerHTML = '<div style="text-align:center; padding: 30px; color: #888;">Nenhum pedido pendente na fila. Tudo sincronizado! 🎉</div>';
      return;
    }

    offlineQueueList.innerHTML = '';
    fila.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'offline-card';
      
      const horaStr = p.created_at ? new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      const mesaNome = p.mesa_codigo ? (p.mesa_codigo === 'BALCAO' ? '🥡 Balcão / Viagem' : `Mesa ${p.mesa_codigo}`) : 'Balcão';
      const clienteStr = p.cliente_nome ? ` · Cliente: ${window.escapeHtml(p.cliente_nome)}` : '';
      const totalStr = (p.total_estimado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      let statusHtml = '';
      if (p.status === 'enviando') {
        statusHtml = '<span style="color: #1976d2; font-size: 11px; font-weight: bold;">🔄 Enviando...</span>';
      } else if (p.status === 'falha') {
        statusHtml = `<span style="color: #d32f2f; font-size: 11px; font-weight: bold;" title="${window.escapeHtml(p.ultimo_erro || '')}">⚠️ Falha: ${window.escapeHtml(p.ultimo_erro || '')}</span>`;
      } else {
        statusHtml = '<span style="color: #f57c00; font-size: 11px; font-weight: bold;">⏳ Aguardando conexão</span>';
      }

      const safeMesaNome = window.escapeHtml(mesaNome || '');
      const safeClienteStr = window.escapeHtml(clienteStr || '');
      const safeHoraStr = window.escapeHtml(horaStr || '--:--');
      const safeItensResumo = window.escapeHtml(p.itens_resumo || 'Itens do pedido');
      const safeTotalStr = window.escapeHtml(totalStr || '');
      const safeStatusText = window.escapeHtml(statusHtml || '');
      const safeClientId = window.escapeHtml((p.client_id || '').toString());

      card.innerHTML = `
        <div class="offline-card__header">
          <div class="offline-card__title">${safeMesaNome}${safeClienteStr}</div>
          <div class="offline-card__time">${safeHoraStr}</div>
        </div>
        <div class="offline-card__items">
          ${safeItensResumo}
        </div>
        <div class="offline-card__footer">
          <div>
            <span class="offline-card__total">Estimado: ${safeTotalStr}</span>
            <div style="margin-top: 2px;">${safeStatusText}</div>
          </div>
          <div class="offline-card__actions">
            <button class="btn-queue-action btn-queue-action--retry" onclick="window.baristaReenviarPedidoOffline('${safeClientId}')">Reenviar</button>
            <button class="btn-queue-action btn-queue-action--discard" onclick="window.baristaDescartarPedidoOffline('${safeClientId}')">Descartar</button>
          </div>
        </div>
      `;
      offlineQueueList.appendChild(card);
    });
  }

  window.baristaReenviarPedidoOffline = async function(clientId) {
    if (!navigator.onLine) {
      showToast('Aparelho ainda sem internet. O envio ocorrerá automaticamente na reconexão.');
      return;
    }
    await processarFilaOffline();
  };

  window.baristaDescartarPedidoOffline = async function(clientId) {
    const confirmed = await showConfirm('Descartar Pedido?', 'Deseja realmente descartar este pedido da fila offline? Ele NÃO será enviado à cozinha.');
    if (!confirmed) return;
    await dbRemoverPedidoOffline(clientId);
    showToast('Pedido descartado da fila.');
    await atualizarContadorFilaOffline();
    renderOfflineQueueModal();
  };

  // Listeners do Modal Offline
  if (btnOfflineQueue) {
    btnOfflineQueue.addEventListener('click', () => {
      renderOfflineQueueModal();
      if (modalOfflineQueue) modalOfflineQueue.classList.remove('hidden');
    });
  }
  if (modalOfflineClose) {
    modalOfflineClose.addEventListener('click', () => {
      if (modalOfflineQueue) modalOfflineQueue.classList.add('hidden');
    });
  }
  if (modalOfflineCloseBtn) {
    modalOfflineCloseBtn.addEventListener('click', () => {
      if (modalOfflineQueue) modalOfflineQueue.classList.add('hidden');
    });
  }
  if (btnSyncOfflineNow) {
    btnSyncOfflineNow.addEventListener('click', () => {
      processarFilaOffline();
    });
  }

  // Monitor de verificação da fila periódica (a cada 15s)
  setInterval(() => {
    if (navigator.onLine && !isSyncingQueue) {
      processarFilaOffline();
    }
  }, 15000);

  // --- CONTROLE DE ACESSO GRANULAR & AUTORIZAÇÃO POR PIN (CAF-000036 / CAF-000081) ---
  function usuarioTemPermissao(permissao) {
    if (!currentUser) return false;
    if (currentUser.is_admin || currentUser.perfil?.role === 'admin') return true;
    if (Array.isArray(currentUser.permissoes)) {
      return currentUser.permissoes.includes(permissao);
    }
    // Fallbacks de retrocompatibilidade SOMENTE para usuários sem cargo atribuído
    if (!currentUser.perfil?.cargo_id) {
      if (permissao === 'pdv.vender' && currentUser.perfil?.role === 'barista') return true;
      if (permissao === 'pdv.desconto' && currentUser.perfil?.pode_dar_desconto) return true;
    }
    return false;
  }

  function pedirAutorizacaoPin(permissaoNecessaria, descricaoAcao, contexto = null) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-autorizacao-pin');
      const descEl = document.getElementById('modal-pin-descricao-acao');
      const inputPin = document.getElementById('input-pin-supervisor');
      const selectSupervisor = document.getElementById('select-pin-supervisor');
      const inputMotivo = document.getElementById('input-pin-motivo');
      const erroEl = document.getElementById('modal-pin-erro');
      const btnConfirmar = document.getElementById('btn-confirmar-pin');
      const btnCancelar = document.getElementById('btn-cancelar-pin');
      const btnClose = document.getElementById('modal-pin-close');

      if (!modal || !inputPin) {
        console.error('Modal de autorização por PIN não encontrado no DOM');
        resolve(null);
        return;
      }

      if (descEl) {
        descEl.innerHTML = `<strong>Ação restrita:</strong> ${descricaoAcao || 'Operação requer supervisor'}<br><span style="font-size:11px; color:#64748b;">Permissão exigida: <code>${permissaoNecessaria}</code></span>`;
      }
      inputPin.value = '';
      if (inputMotivo) inputMotivo.value = '';
      if (erroEl) {
        erroEl.style.display = 'none';
        erroEl.textContent = '';
      }

      function cleanup() {
        modal.classList.add('hidden');
        btnConfirmar.removeEventListener('click', onConfirmar);
        btnCancelar.removeEventListener('click', onCancelar);
        btnClose.removeEventListener('click', onCancelar);
        inputPin.removeEventListener('keydown', onKeyDown);
      }

      function onCancelar() {
        cleanup();
        resolve(null);
      }

      async function onConfirmar() {
        const pin = inputPin.value.trim();
        const motivo = inputMotivo ? inputMotivo.value.trim() : '';
        const autorizadorId = selectSupervisor ? (selectSupervisor.value || null) : null;

        if (!pin || pin.length < 4 || pin.length > 8) {
          if (erroEl) {
            erroEl.style.display = 'block';
            erroEl.textContent = 'O PIN deve conter entre 4 e 8 dígitos numéricos.';
          }
          inputPin.focus();
          return;
        }

        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Validando...';
        if (erroEl) erroEl.style.display = 'none';

        try {
          const res = await window.cafeteriaDB.cargos.validarPin(
            pin, 
            permissaoNecessaria, 
            motivo || `Autorizado na tela PDV (${permissaoNecessaria})`, 
            contexto,
            autorizadorId
          );

          if (res && res.autorizado) {
            showToast(`Ação liberada por ${res.supervisor_nome || 'Supervisor'} (${res.cargo_nome || 'Cargo'})!`, { tipo: 'success' });
            cleanup();
            resolve({ ...res, motivo });
          } else {
            if (erroEl) {
              erroEl.style.display = 'block';
              erroEl.textContent = (res && res.mensagem) || 'PIN inválido ou sem permissão para esta ação.';
            }
            inputPin.value = '';
            inputPin.focus();
          }
        } catch (err) {
          console.error('Erro na validação de PIN:', err);
          if (erroEl) {
            erroEl.style.display = 'block';
            erroEl.textContent = 'Erro ao validar PIN: ' + (err.message || 'Falha de comunicação');
          }
        } finally {
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = 'Liberar Ação';
        }
      }

      function onKeyDown(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirmar();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancelar();
        }
      }

      btnConfirmar.addEventListener('click', onConfirmar);
      btnCancelar.addEventListener('click', onCancelar);
      btnClose.addEventListener('click', onCancelar);
      inputPin.addEventListener('keydown', onKeyDown);

      modal.classList.remove('hidden');
      setTimeout(() => inputPin.focus(), 100);
    });
  }

  window.baristaCancelarItem = async function(itemId, pedidoId, mesaCodigo) {
    let motivo = null;

    if (!usuarioTemPermissao('pdv.cancelar_item')) {
      const auth = await pedirAutorizacaoPin(
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
      motivo = prompt('Motivo do cancelamento (Ex: Cliente desistiu, Lançado errado, Em falta):');
      if (!motivo) return;
    }

    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('cancelar_item', {
        p_item_id: itemId,
        p_motivo: motivo
      });

      if (error) throw error;
      
      showToast('Item cancelado com sucesso!', { tipo: 'success' });
      
      // Checar se todos os itens foram cancelados (fazendo fetch)
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
              cancelado_por: currentUser ? currentUser.id : null,
              cancelado_por_nome: currentUser ? (currentUser.nome || 'Barista') : 'Barista',
              cancelado_em: new Date().toISOString(),
              updated_at: new Date().toISOString() 
            })
            .eq('id', pedidoId);
          showToast('Pedido cancelado com sucesso!', { tipo: 'success' });
        }
      }

      carregarPainel(); // Recarrega PDV
      if (currentSelectedMesaParaConta && currentSelectedMesaParaConta.mesaCodigo === mesaCodigo) {
        // Atualiza a view da mesa
        const pd = window.cafeteriaDadosPainel.pedidosPendentes.filter(p => p.mesa_codigo === mesaCodigo);
        abrirModalMesa(mesaCodigo, pd);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao cancelar item: ' + err.message, { tipo: 'error' });
    }
  };

  window.baristaLancarCortesia = async function(pedidoId, itemId, produtoCortesiaId) {
    const confirmed = await showConfirm('Lançar Cortesia', 'Deseja lançar esta cortesia agora?');
    if (!confirmed) return;
    
    const payload = [{
      produto_id: produtoCortesiaId,
      quantidade: 1,
      observacoes: 'Cortesia lançada via mesa',
      cortesia_de_item_id: itemId
    }];
    
    const { data, error } = await window.cafeteriaSupabase.rpc('adicionar_itens_pedido', {
      p_pedido_id: pedidoId,
      p_itens: payload
    });
    
    if (error) {
      showToast("Erro ao lançar cortesia: " + error.message);
    } else {
      fecharModalMesa();
      loadActivePedidos();
    }
  };

  async function loadProfile(user) {
    let perfil = null;
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('perfis')
        .select('nome, role, pode_dar_desconto, cargo_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data) {
        perfil = data;
        localStorage.setItem('cafeteria_pdv_perfil_' + user.id, JSON.stringify(perfil));
      } else if (error) {
        throw error;
      }
    } catch (err) {
      console.warn('[PDV Cache] Falha ao consultar perfil na rede, buscando cache:', err);
      const cached = localStorage.getItem('cafeteria_pdv_perfil_' + user.id);
      if (cached) {
        try {
          perfil = JSON.parse(cached);
        } catch {}
      }
      if (!perfil) {
        console.error('Erro ao buscar perfil:', err);
        showToast('Erro ao consultar perfil: ' + (err.message || 'Verifique a conexão'), { tipo: 'error', duracaoMs: 6000 });
        await window.cafeteriaSupabase.auth.signOut();
        return;
      }
    }

    if (!perfil) {
      await window.showConfirmBottomSheet({
        titulo: 'Perfil Não Cadastrado',
        mensagem: `O usuário (${user.email || user.id}) está autenticado, mas não possui um registro cadastrado na tabela "perfis". Cadastre o colaborador em Cargos & Usuários para liberar o acesso.`,
        textoConfirmar: 'Entendido',
        textoCancelar: ''
      });
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    // Carrega permissões granulares associadas ao cargo (CAF-000036)
    let permissoesInfo = null;
    try {
      if (window.cafeteriaDB?.cargos?.getMinhasPermissoes) {
        permissoesInfo = await window.cafeteriaDB.cargos.getMinhasPermissoes();
        if (permissoesInfo) {
          localStorage.setItem('cafeteria_pdv_permissoes_' + user.id, JSON.stringify(permissoesInfo));
        }
      }
    } catch (pErr) {
      console.warn('[PDV Cache] Falha ao carregar permissões na rede, buscando cache:', pErr);
      const cachedP = localStorage.getItem('cafeteria_pdv_permissoes_' + user.id);
      if (cachedP) {
        try { permissoesInfo = JSON.parse(cachedP); } catch {}
      }
    }

    const permissoes = (permissoesInfo && permissoesInfo.permissoes) || [];
    const isAdmin = (permissoesInfo && permissoesInfo.is_admin) || perfil.role === 'admin';
    const podeAcessarPDV = isAdmin || permissoes.includes('pdv.vender') || perfil.role === 'barista';

    if (!podeAcessarPDV) {
      showToast('Acesso negado. Seu perfil não possui permissão para acessar o PDV (pdv.vender).', { tipo: 'error', duracaoMs: 6000 });
      await window.cafeteriaSupabase.auth.signOut();
      return;
    }

    currentUser = { 
      ...user, 
      perfil, 
      cargo_nome: permissoesInfo?.cargo_nome,
      permissoes: permissoes,
      is_admin: isAdmin 
    };
    document.getElementById('user-name').textContent = perfil.nome;
    
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    atualizarModoConexaoCarrinho();
    await atualizarContadorFilaOffline();
    await loadInitialData();
    setupRealtime();
    processarFilaOffline();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    const btn = document.getElementById('login-btn');
    
    btn.disabled = true;
    btn.textContent = 'Autenticando...';
    loginError.textContent = '';

    const { data, error } = await window.cafeteriaSupabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginError.textContent = 'E-mail ou senha incorretos.';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    await loadProfile(data.user);
  });

  btnLogout.addEventListener('click', async () => {
    await window.cafeteriaSupabase.auth.signOut();
    window.location.reload();
  });

  // -----------------------------------------------------
  // 2. NAVEGAÇÃO ENTRE ABAS
  // -----------------------------------------------------
  function switchTab(tabName) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch (_) {}
    }
    if (tabName === 'novo') {
      navBtnNovo.classList.add('active');
      navBtnMesas.classList.remove('active');
      viewNovoPedido.classList.remove('hidden');
      viewMesasPedidos.classList.add('hidden');
    } else {
      navBtnNovo.classList.remove('active');
      navBtnMesas.classList.add('active');
      viewNovoPedido.classList.add('hidden');
      viewMesasPedidos.classList.remove('hidden');
      loadActivePedidos();
    }
  }

  navBtnNovo.addEventListener('click', () => switchTab('novo'));
  navBtnMesas.addEventListener('click', () => switchTab('mesas'));

  // -----------------------------------------------------
  // 3. CARREGAMENTO DE DADOS (Mesas e Cardápio)
  // -----------------------------------------------------
  async function loadInitialData() {
    await Promise.all([
      loadMesas(),
      loadProdutos(),
      loadAdicionais(),
      loadActivePedidos(),
      loadPromocoes()
    ]);
    restaurarRascunhoCarrinho();
  }

  async function loadPromocoes() {
    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('promocoes_do_dia');
      if (!error && data) {
        activePromos = data;
        localStorage.setItem('cafeteria_cache_pdv_promos', JSON.stringify(data));
      } else {
        throw error || new Error('Falha ao carregar promoções');
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando promoções do cache local:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_promos');
      if (cached) {
        try { activePromos = JSON.parse(cached); } catch {}
      }
    }
  }

  async function loadAdicionais() {
    try {
      const [{ data, error: errAdic }, { data: vinculosData, error: errVinc }] = await Promise.all([
        window.cafeteriaSupabase
          .from('adicionais')
          .select('*')
          .eq('ativo', true)
          .order('ordem', { ascending: true }),
        window.cafeteriaSupabase
          .from('v_adicionais_produto')
          .select('*')
      ]);
      
      if (!errAdic && data) {
        allAdicionais = data;
        localStorage.setItem('cafeteria_cache_pdv_adicionais', JSON.stringify(data));
      }
      if (!errVinc && vinculosData) {
        allVinculosProduto = vinculosData;
        localStorage.setItem('cafeteria_cache_pdv_vinculos', JSON.stringify(vinculosData));
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando adicionais do cache local:', e);
      const cachedAdic = localStorage.getItem('cafeteria_cache_pdv_adicionais');
      if (cachedAdic) {
        try { allAdicionais = JSON.parse(cachedAdic); } catch {}
      }
      const cachedVinc = localStorage.getItem('cafeteria_cache_pdv_vinculos');
      if (cachedVinc) {
        try { allVinculosProduto = JSON.parse(cachedVinc); } catch {}
      }
    }
  }

  async function loadMesas() {
    try {
      const { data: mesasData, error } = await window.cafeteriaSupabase
        .from('mesas')
        .select('*')
        .eq('ativo', true)
        .order('codigo');
      
      if (!error && mesasData) {
        mesas = mesasData;
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
          mesas = JSON.parse(cached);
          updateMesaSelectOptions();
        } catch {}
      }
    }
  }

  function updateMesaSelectOptions() {
    const selectedVal = mesaSelect.value;
    mesaSelect.innerHTML = '<option value="">Selecione a Mesa...</option>';

    mesas.forEach(m => {
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === m.codigo);
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
      const m = mesas.find(item => item.codigo === val);
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

  function renderMesaSelectionGrid() {
    if (!gridSelecaoMesas) return;
    gridSelecaoMesas.innerHTML = '';

    if (!mesas || mesas.length === 0) {
      gridSelecaoMesas.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; padding: 20px;">Nenhuma mesa cadastrada.</div>';
      return;
    }

    const currentVal = mesaSelect ? mesaSelect.value : '';

    mesas.forEach(m => {
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === m.codigo);
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
      // Notificação visual sutil
      const banner = document.getElementById('banner-adicionando-itens');
      if (banner && lblMesaAdicionando) {
        lblMesaAdicionando.textContent = codigo;
        banner.classList.remove('hidden');
      }
    }
  }

  function openModalSelecaoMesa() {
    if (mesaSelect && mesaSelect.disabled) return;
    renderMesaSelectionGrid();
    if (modalSelecionarMesa) {
      modalSelecionarMesa.classList.remove('hidden');
      if (btnMesaTrigger) btnMesaTrigger.setAttribute('aria-expanded', 'true');
    }
  }

  function closeModalSelecaoMesa() {
    if (modalSelecionarMesa) {
      modalSelecionarMesa.classList.add('hidden');
      if (btnMesaTrigger) btnMesaTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  async function loadProdutos() {
    try {
      const { data: produtosData, error } = await window.cafeteriaSupabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (!error && produtosData) {
        allProducts = produtosData.filter(p => !p.apenas_encomenda);
        localStorage.setItem('cafeteria_cache_pdv_produtos', JSON.stringify(allProducts));
      } else {
        throw error || new Error('Falha ao carregar produtos');
      }
    } catch (e) {
      console.warn('[PDV Cache] Carregando produtos do cache local:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_produtos');
      if (cached) {
        try { allProducts = JSON.parse(cached).filter(p => !p.apenas_encomenda); } catch {}
      }
    }

    if (allProducts && allProducts.length > 0) {
      renderCategories();
      const firstCat = [...new Set(allProducts.map(p => p.categoria_id))][0];
      if (firstCat && !currentCategory) setCategory(firstCat);
      else renderProducts();
    }
  }

  const TERMOS_RAPIDOS = ['expresso', 'espresso', 'cappuccino', 'pão de queijo', 'pao de queijo', 'croissant', 'água', 'agua', 'cookie', 'latte', 'mocha', 'mate', 'refrigerante', 'suco'];

  function isProdutoRapido(p) {
    if (!p) return false;
    const nome = (p.nome || '').toLowerCase();
    const desc = (p.descricao || '').toLowerCase();
    return TERMOS_RAPIDOS.some(t => nome.includes(t) || desc.includes(t));
  }

  function renderCategories() {
    const catIds = [...new Set(allProducts.map(p => p.categoria_id))];
    categoriesTabs.innerHTML = '';

    const btnRapidos = document.createElement('button');
    btnRapidos.className = 'cat-tab' + (currentCategory === '__rapidos__' ? ' active' : '');
    btnRapidos.textContent = '⭐ Rápidos';
    btnRapidos.onclick = () => setCategory('__rapidos__');
    categoriesTabs.appendChild(btnRapidos);

    const btnTodos = document.createElement('button');
    btnTodos.className = 'cat-tab' + (currentCategory === '' ? ' active' : '');
    btnTodos.textContent = '🌟 Todos';
    btnTodos.onclick = () => setCategory('');
    categoriesTabs.appendChild(btnTodos);

    const btnPromos = document.createElement('button');
    btnPromos.className = 'cat-tab' + (currentCategory === '__promos__' ? ' active' : '');
    btnPromos.textContent = '🔥 Promos de hoje';
    btnPromos.onclick = () => setCategory('__promos__');
    categoriesTabs.appendChild(btnPromos);

    catIds.forEach(catId => {
      if (!catId) return;
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (currentCategory === catId ? ' active' : '');
      btn.textContent = (catId.charAt(0).toUpperCase() + catId.slice(1)).replace(/-/g, ' ');
      btn.onclick = () => setCategory(catId);
      categoriesTabs.appendChild(btn);
    });
  }

  function setCategory(catId) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (_) {}
    }
    currentCategory = catId || '';
    document.querySelectorAll('.cat-tab').forEach(t => {
      if (currentCategory === '__rapidos__') {
        t.classList.toggle('active', t.textContent.includes('Rápidos'));
      } else if (!currentCategory) {
        t.classList.toggle('active', t.textContent.includes('Todos'));
      } else if (currentCategory === '__promos__') {
        t.classList.toggle('active', t.textContent.includes('Promos'));
      } else {
        const textNorm = (t.textContent || '').toLowerCase().replace(/\s+/g, '-');
        t.classList.toggle('active', textNorm === currentCategory.toLowerCase());
      }
    });
    renderProducts();
  }

  // Busca instantânea
  productSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderProducts();
  });

  function renderProducts() {
    productsGrid.innerHTML = '';
    
    let filtered = allProducts;
    if (currentCategory === '__rapidos__') {
      const rapidos = filtered.filter(p => isProdutoRapido(p));
      if (rapidos.length >= 4) {
        filtered = rapidos.slice(0, 14);
      } else {
        const simples = filtered.filter(p => !p.permite_adicionais && p.tipo_montagem !== 'meio_a_meio');
        filtered = [...new Set([...rapidos, ...simples])].slice(0, 14);
      }
    } else if (currentCategory === '__promos__') {
      filtered = filtered.filter(p => activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id));
    } else if (currentCategory) {
      filtered = filtered.filter(p => p.categoria_id === currentCategory);
    }
    if (searchQuery) {
      if (window.SmartSearch && typeof window.SmartSearch.filterProducts === 'function') {
        filtered = window.SmartSearch.filterProducts(filtered, searchQuery);
      } else {
        filtered = filtered.filter(p => p.nome.toLowerCase().includes(searchQuery) || (p.descricao && p.descricao.toLowerCase().includes(searchQuery)));
      }
    }
    
    if (filtered.length === 0) {
      productsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: #888;">Nenhum produto encontrado.</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      const isSimples = !p.permite_adicionais && p.tipo_montagem !== 'meio_a_meio';

      // Identificar itens correspondentes no carrinho
      const cartItemIndex = cart.findIndex(item => 
        item.produto.id === p.id && 
        (!item.adicionaisSelecionados || item.adicionaisSelecionados.length === 0) && 
        (!item.sabores || item.sabores.length === 0)
      );
      const totalQtdCarrinho = cart
        .filter(item => item.produto.id === p.id)
        .reduce((sum, item) => sum + item.quantidade, 0);

      card.className = 'product-card' + 
        (p.disponivel === false ? ' produto-esgotado' : '') + 
        (totalQtdCarrinho > 0 ? ' is-in-cart' : '');

      const descHtml = p.descricao ? `<p class="product-card__desc">${window.escapeHtml(p.descricao)}</p>` : '';
      const isPromo = activePromos.some(promo => promo.produto_id === p.id || promo.categoria_id === p.categoria_id);
      const promoBadgeHtml = isPromo ? `<span style="background:#e74c3c; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">PROMO</span>` : '';
      const stampHtml = p.disponivel === false ? `<div class="esgotado-stamp">ESGOTADO</div>` : '';

      let actionBadgeHtml = '';
      if (p.disponivel !== false) {
        if (isSimples && cartItemIndex !== -1) {
          actionBadgeHtml = `
            <div class="card-qty-controls">
              <button type="button" class="card-qty-btn minus" title="Diminuir quantidade">−</button>
              <span class="card-qty-val">${cart[cartItemIndex].quantidade}</span>
              <button type="button" class="card-qty-btn plus" title="Aumentar quantidade">+</button>
            </div>
          `;
        } else if (!isSimples && totalQtdCarrinho > 0) {
          actionBadgeHtml = `<span class="card-cart-pill">${totalQtdCarrinho} no carrinho</span>`;
        } else {
          actionBadgeHtml = `<span class="btn-add-badge">+ Adicionar</span>`;
        }
      }
      
      card.innerHTML = `
        <div class="product-card__header">
          <h4>${window.escapeHtml(p.nome)}${promoBadgeHtml}</h4>
          ${descHtml}
        </div>
        <div class="product-card__bottom">
          <span class="price">R$ ${Number(p.preco).toFixed(2).replace('.', ',')}</span>
          ${actionBadgeHtml}
        </div>
        ${stampHtml}
      `;

      // Eventos inline dos botões de quantidade no card
      const btnMinus = card.querySelector('.card-qty-btn.minus');
      const btnPlus = card.querySelector('.card-qty-btn.plus');

      if (btnMinus) {
        btnMinus.onclick = (e) => {
          e.stopPropagation();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
          }
          updateQuantity(cartItemIndex, -1);
          renderProducts();
        };
      }

      if (btnPlus) {
        btnPlus.onclick = (e) => {
          e.stopPropagation();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
          }
          updateQuantity(cartItemIndex, 1);
          renderProducts();
        };
      }

      card.onclick = (e) => {
        if (p.disponivel === false) return;
        if (isSimples) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(15); } catch (_) {}
          }
          if (cartItemIndex !== -1) {
            updateQuantity(cartItemIndex, 1);
          } else {
            addToCartFromMontagem({
              produto: p,
              adicionaisSelecionados: [],
              sabores: null,
              observacoes: ''
            });
          }
          renderProducts();
        } else {
          openMontagemModal(p);
        }
      };

      // Lógica de Esgotar (Pressionar e Segurar)
      let pressTimer;
      const startPress = (e) => {
        if (e.button && e.button !== 0) return; // apenas click esquerdo
        pressTimer = setTimeout(() => {
          showEsgotadoMenu(p);
        }, 800); // 800ms para considerar long press
      };
      const cancelPress = () => clearTimeout(pressTimer);
      
      card.addEventListener('pointerdown', startPress);
      card.addEventListener('pointerup', cancelPress);
      card.addEventListener('pointerleave', cancelPress);
      card.addEventListener('pointercancel', cancelPress);
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Evita menu nativo no right-click/long-press mobile e mostra o nosso
        cancelPress();
        showEsgotadoMenu(p);
      });

      productsGrid.appendChild(card);
    });
  }

  async function showEsgotadoMenu(produto) {
    const isEsgotado = produto.disponivel === false;
    const msg = isEsgotado 
      ? `Deseja marcar "${produto.nome}" como DISPONÍVEL para pedidos?` 
      : `Deseja marcar "${produto.nome}" como ESGOTADO no cardápio?`;
      
    const confirmar = await window.showConfirmBottomSheet({
      titulo: 'Disponibilidade do Produto',
      mensagem: msg,
      textoConfirmar: isEsgotado ? 'Sim, Disponibilizar' : 'Sim, Esgotar',
      textoCancelar: 'Cancelar',
      perigoso: !isEsgotado
    });

    if (confirmar) {
      try {
        const { error } = await window.cafeteriaSupabase.rpc('toggle_produto_disponivel', {
          p_produto_id: produto.id,
          p_disponivel: isEsgotado
        });
        if (error) throw error;
        // Atualiza localmente para resposta rápida. O realtime sincronizará outras abas.
        produto.disponivel = isEsgotado;
        renderProducts();
        showToast(`"${produto.nome}" marcado como ${isEsgotado ? 'disponível' : 'esgotado'}.`, { tipo: 'success' });
      } catch (err) {
        console.error('Erro ao atualizar disponibilidade', err);
        showToast('Erro ao atualizar produto. Verifique suas permissões ou tente recarregar.', { tipo: 'error' });
      }
    }
  }

  // -----------------------------------------------------
  // 4. CARRINHO, MONTAGEM & OBSERVAÇÃO POR ITEM
  // -----------------------------------------------------

  // CAF-000057: Rascunho Persistente do Carrinho (LocalStorage)
  const RASCUNHO_CARRINHO_KEY = 'cafeteria_pdv_carrinho_rascunho';
  const RASCUNHO_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas
  let saveDraftTimeout = null;

  function salvarRascunhoCarrinho() {
    if (saveDraftTimeout) clearTimeout(saveDraftTimeout);
    saveDraftTimeout = setTimeout(() => {
      try {
        if (!cart || cart.length === 0) {
          localStorage.removeItem(RASCUNHO_CARRINHO_KEY);
          return;
        }

        const rascunho = {
          timestamp: Date.now(),
          mesa: mesaSelect ? mesaSelect.value : '',
          clienteNome: pedidoClienteNome ? pedidoClienteNome.value : '',
          clienteId: pedidoClienteId ? pedidoClienteId.value : '',
          clienteTel: clienteBadgeTel ? clienteBadgeTel.textContent : '',
          paraViagem: pedidoParaViagem ? pedidoParaViagem.checked : false,
          prioridade: pedidoPrioritario ? (pedidoPrioritario.checked ? 1 : 0) : 0,
          prioridadeMotivo: pedidoPrioridadeMotivo ? pedidoPrioridadeMotivo.value : '',
          observacoesGerais: pedidoObs ? pedidoObs.value : '',
          pedidoEmEdicaoId: pedidoEmEdicaoId || null,
          cart: cart.map(item => ({
            produtoId: item.produto.id,
            quantidade: item.quantidade,
            observacoes: item.observacoes || '',
            adicionaisIds: (item.adicionaisSelecionados || []).map(a => a.id),
            saboresIds: (item.sabores || []).map(s => s.produto_id),
            cortesia_de_item_index: item.cortesia_de_item_index
          }))
        };

        localStorage.setItem(RASCUNHO_CARRINHO_KEY, JSON.stringify(rascunho));
      } catch (err) {
        console.warn('[PDV Rascunho] Erro ao salvar rascunho:', err);
      }
    }, 250);
  }

  function limparRascunhoCarrinho() {
    if (saveDraftTimeout) clearTimeout(saveDraftTimeout);
    try {
      localStorage.removeItem(RASCUNHO_CARRINHO_KEY);
    } catch (err) {
      console.warn('[PDV Rascunho] Erro ao limpar rascunho:', err);
    }
  }

  function restaurarRascunhoCarrinho() {
    try {
      const raw = localStorage.getItem(RASCUNHO_CARRINHO_KEY);
      if (!raw) return;

      const rascunho = JSON.parse(raw);
      if (!rascunho || !rascunho.cart || !Array.isArray(rascunho.cart) || rascunho.cart.length === 0) {
        localStorage.removeItem(RASCUNHO_CARRINHO_KEY);
        return;
      }

      // Descartar rascunhos com mais de 12 horas
      if (rascunho.timestamp && (Date.now() - rascunho.timestamp) > RASCUNHO_MAX_AGE_MS) {
        console.log('[PDV Rascunho] Rascunho expirado (>12h). Descartando.');
        localStorage.removeItem(RASCUNHO_CARRINHO_KEY);
        return;
      }

      // Reconstruir o carrinho com referências de produtos reais
      const restoredCart = [];
      rascunho.cart.forEach(rawItem => {
        const prod = allProducts.find(p => p.id === rawItem.produtoId);
        if (!prod) return;

        const adicionais = (rawItem.adicionaisIds || [])
          .map(id => allAdicionais.find(a => a.id === id))
          .filter(Boolean);

        const sabores = (rawItem.saboresIds || []).map(pId => {
          const sProd = allProducts.find(p => p.id === pId);
          return sProd ? { produto_id: sProd.id, nome: sProd.nome } : null;
        }).filter(Boolean);

        restoredCart.push({
          produto: prod,
          quantidade: rawItem.quantidade || 1,
          observacoes: rawItem.observacoes || '',
          adicionaisSelecionados: adicionais,
          sabores: sabores,
          cortesia_de_item_index: rawItem.cortesia_de_item_index
        });
      });

      if (restoredCart.length === 0) {
        localStorage.removeItem(RASCUNHO_CARRINHO_KEY);
        return;
      }

      cart = restoredCart;

      // Restaurar campos auxiliares
      if (rascunho.mesa && mesaSelect) {
        mesaSelect.value = rascunho.mesa;
      }
      if (rascunho.clienteNome && pedidoClienteNome) {
        pedidoClienteNome.value = rascunho.clienteNome;
      }
      if (rascunho.clienteId && pedidoClienteId) {
        pedidoClienteId.value = rascunho.clienteId;
        if (clienteBadge && clienteBadgeNome) {
          clienteBadgeNome.textContent = rascunho.clienteNome;
          if (clienteBadgeTel) clienteBadgeTel.textContent = rascunho.clienteTel || '';
          clienteBadge.style.display = 'flex';
          if (pedidoClienteNome) pedidoClienteNome.style.display = 'none';
        }
      }
      if (rascunho.paraViagem !== undefined && pedidoParaViagem) {
        pedidoParaViagem.checked = !!rascunho.paraViagem;
      }
      if (rascunho.prioridade !== undefined && pedidoPrioritario) {
        pedidoPrioritario.checked = rascunho.prioridade === 1;
        if (boxMotivoPrioridade) {
          boxMotivoPrioridade.style.display = pedidoPrioritario.checked ? 'block' : 'none';
        }
      }
      if (rascunho.prioridadeMotivo && pedidoPrioridadeMotivo) {
        pedidoPrioridadeMotivo.value = rascunho.prioridadeMotivo;
      }
      if (rascunho.observacoesGerais && pedidoObs) {
        pedidoObs.value = rascunho.observacoesGerais;
      }
      if (rascunho.pedidoEmEdicaoId) {
        pedidoEmEdicaoId = rascunho.pedidoEmEdicaoId;
      }

      updateMesaTriggerUI();
      renderCart();

      const totalQtd = cart.reduce((acc, i) => acc + i.quantidade, 0);
      showToast(`Rascunho recuperado (${totalQtd} ${totalQtd === 1 ? 'item' : 'itens'})`, {
        tipo: 'info',
        acaoTexto: 'Limpar',
        duracaoMs: 6000,
        acaoCallback: () => {
          cart = [];
          if (pedidoClienteNome) {
            pedidoClienteNome.value = '';
            pedidoClienteNome.style.display = '';
          }
          if (pedidoClienteId) pedidoClienteId.value = '';
          if (clienteBadge) clienteBadge.style.display = 'none';
          if (pedidoObs) pedidoObs.value = '';
          if (pedidoParaViagem) pedidoParaViagem.checked = false;
          limparRascunhoCarrinho();
          renderCart();
        }
      });
    } catch (err) {
      console.warn('[PDV Rascunho] Erro ao restaurar rascunho:', err);
    }
  }

  mesaSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    cartMesaBadge.textContent = val ? val : (pedidoParaViagem && pedidoParaViagem.checked ? '🥡 Viagem' : 'Sem Mesa');
    updateMesaTriggerUI();
    renderMesaSelectionGrid();
    checkFormValidity();
    salvarRascunhoCarrinho();
  });

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

  // --- Modal de Montagem ---
  function openMontagemModal(produto) {
    activeMontagemItem = {
      produto: produto,
      adicionaisSelecionados: [],
      sabores: null,
      observacoes: ''
    };
    
    modalMontagemTitle.textContent = produto.nome;
    modalMontagemObs.value = '';
    
    const saboresContainer = document.getElementById('montagem-sabores-container');
    const selectDoce = document.getElementById('modal-montagem-sabor-doce');
    const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
    
    if (produto.tipo_montagem === 'meio_a_meio') {
      saboresContainer.classList.remove('hidden');
      
      const doces = allProducts.filter(p => p.categoria_id === 'crepes-doces' && p.tipo_montagem !== 'meio_a_meio');
      const salgados = allProducts.filter(p => p.categoria_id === 'crepes-salgados' && p.tipo_montagem !== 'meio_a_meio');
      
      selectDoce.innerHTML = doces.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
      selectSalgado.innerHTML = salgados.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
      
      selectDoce.onchange = updateMontagemTotal;
      selectSalgado.onchange = updateMontagemTotal;
    } else {
      saboresContainer.classList.add('hidden');
      selectDoce.innerHTML = '';
      selectSalgado.innerHTML = '';
    }
    
    // Renderiza adicionais (apenas os vinculados)
    const adsDoProduto = allVinculosProduto
      .filter(v => v.produto_id === produto.id)
      .map(v => ({ id: v.adicional_id, nome: v.nome, preco: v.preco, ordem: v.ordem }))
      .sort((a, b) => a.ordem - b.ordem);

    if (!produto.permite_adicionais) {
      modalMontagemList.innerHTML = '<p style="color:#888; font-size:14px;">Este produto não permite adicionais.</p>';
    } else if (adsDoProduto.length === 0) {
      modalMontagemList.innerHTML = '<p style="color:#888; font-size:14px;">Nenhum adicional vinculado.</p>';
    } else {
      modalMontagemList.innerHTML = adsDoProduto.map(ad => `
        <label class="adicional-checkbox">
          <input type="checkbox" value="${window.escapeHtml(ad.id)}" data-preco="${ad.preco}" data-nome="${window.escapeHtml(ad.nome)}" class="chk-adicional">
          <span class="adicional-checkbox__label">${window.escapeHtml(ad.nome)} (+ R$ ${Number(ad.preco).toFixed(2).replace('.', ',')})</span>
        </label>
      `).join('');
      
      // Adiciona listeners aos checkboxes para atualizar o total
      const chks = modalMontagemList.querySelectorAll('.chk-adicional');
      chks.forEach(chk => {
        chk.addEventListener('change', updateMontagemTotal);
      });
    }

    updateMontagemTotal();
    modalMontagem.classList.remove('hidden');
  }

  function closeMontagemModal() {
    modalMontagem.classList.add('hidden');
    activeMontagemItem = null;
  }

  function updateMontagemTotal() {
    if (!activeMontagemItem) return;
    let total = 0;
    
    if (activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
      const selectDoce = document.getElementById('modal-montagem-sabor-doce');
      const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
      const optDoce = selectDoce.options[selectDoce.selectedIndex];
      const optSalgado = selectSalgado.options[selectSalgado.selectedIndex];
      
      if (optDoce && optSalgado) {
        total = (parseFloat(optDoce.dataset.preco) * 0.5) + (parseFloat(optSalgado.dataset.preco) * 0.5);
      }
    } else {
      total = Number(activeMontagemItem.produto.preco);
    }
    
    const chks = modalMontagemList.querySelectorAll('.chk-adicional:checked');
    chks.forEach(chk => {
      total += parseFloat(chk.dataset.preco);
    });
    modalMontagemTotal.textContent = `Total: R$ ${total.toFixed(2).replace('.', ',')}`;
  }

  if (modalMontagemClose) modalMontagemClose.addEventListener('click', closeMontagemModal);
  if (modalMontagemCancel) modalMontagemCancel.addEventListener('click', closeMontagemModal);
  if (modalMontagemSave) {
    modalMontagemSave.addEventListener('click', () => {
      if (!activeMontagemItem) return;
      
      const chks = modalMontagemList.querySelectorAll('.chk-adicional:checked');
      activeMontagemItem.adicionaisSelecionados = Array.from(chks).map(chk => ({
        id: chk.value,
        nome: chk.dataset.nome,
        preco: parseFloat(chk.dataset.preco)
      }));
      
      if (activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
        const selectDoce = document.getElementById('modal-montagem-sabor-doce');
        const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
        activeMontagemItem.sabores = [
          { lado: 'doce', produto_id: selectDoce.value },
          { lado: 'salgado', produto_id: selectSalgado.value }
        ];
      }
      
      activeMontagemItem.observacoes = modalMontagemObs.value.trim();
      
      addToCartFromMontagem(activeMontagemItem);
      closeMontagemModal();
    });
  }

  function addToCartFromMontagem(item) {
    // Para agrupar itens no carrinho, eles devem ter o mesmo produto, mesmas obs e mesmos adicionais.
    // Como os adicionais podem variar, se não tiver adicionais nem obs, tentamos agrupar.
    const hasAdicionais = item.adicionaisSelecionados.length > 0;
    const hasObs = item.observacoes.length > 0;
    
    let existingIndex = -1;
    
    if (!hasAdicionais && !hasObs && (!item.sabores || item.sabores.length === 0)) {
      existingIndex = cart.findIndex(c => c.produto.id === item.produto.id && c.adicionaisSelecionados.length === 0 && !c.observacoes && (!c.sabores || c.sabores.length === 0));
    } else {
      // Se tiver adicionais ou observações únicas, vamos apenas adicionar como um novo item separadamente
      // (Poderia checar se o array de adicionais é exatamente igual, mas por simplicidade cria nova linha)
    }

    if (existingIndex > -1) {
      cart[existingIndex].quantidade += 1;
    } else {
      cart.push({
        produto: item.produto,
        quantidade: 1,
        observacoes: item.observacoes,
        adicionaisSelecionados: item.adicionaisSelecionados,
        sabores: item.sabores,
        cortesia_de_item_index: item.cortesia_de_item_index // Será preenchido quando for cortesia
      });
    }
    renderCart();

    if (navigator.vibrate) navigator.vibrate(10);
    const badge = document.getElementById('mobile-cart-count');
    if (badge) {
      badge.classList.remove('animate-pop');
      void badge.offsetWidth;
      badge.classList.add('animate-pop');
    }
  }

  function updateQuantity(index, delta) {
    if (!cart[index]) return;

    if (delta === -999) {
      const removedItem = cart.splice(index, 1)[0];
      renderCart();
      const nomeItem = removedItem.produto?.nome || 'Item';
      showToast(`"${nomeItem}" removido do carrinho`, {
        tipo: 'info',
        acaoTexto: 'Desfazer',
        duracaoMs: 5000,
        acaoCallback: () => {
          cart.splice(index, 0, removedItem);
          renderCart();
        }
      });
      return;
    }

    cart[index].quantidade += delta;
    if (cart[index].quantidade <= 0) {
      const removedItem = cart.splice(index, 1)[0];
      renderCart();
      const nomeItem = removedItem.produto?.nome || 'Item';
      showToast(`"${nomeItem}" removido do carrinho`, {
        tipo: 'info',
        acaoTexto: 'Desfazer',
        duracaoMs: 5000,
        acaoCallback: () => {
          removedItem.quantidade = 1;
          cart.splice(index, 0, removedItem);
          renderCart();
        }
      });
      return;
    }
    renderCart();
  }

  function openItemObsModal(index) {
    activeObsCartIndex = index;
    const item = cart[index];
    if (!item) return;

    modalObsTitle.textContent = `Observação: ${item.produto.nome}`;
    modalObsInput.value = item.observacoes || '';
    modalObs.classList.remove('hidden');
    modalObsInput.focus();
  }

  function closeItemObsModal() {
    modalObs.classList.add('hidden');
    activeObsCartIndex = null;
  }

  modalObsSave.addEventListener('click', () => {
    if (activeObsCartIndex !== null && cart[activeObsCartIndex]) {
      cart[activeObsCartIndex].observacoes = modalObsInput.value.trim();
      renderCart();
    }
    closeItemObsModal();
  });

  [modalObsClose, modalObsCancel].forEach(b => b.addEventListener('click', closeItemObsModal));

  function openCartDrawer() {
    if (cartPanel) cartPanel.classList.add('open-mobile');
    if (cartBackdrop) cartBackdrop.classList.remove('hidden');
    history.pushState({ cartOpen: true }, '', '#cart');
  }

  function closeCartDrawer() {
    if (history.state && history.state.cartOpen) {
      history.back();
    } else {
      if (cartPanel) cartPanel.classList.remove('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.add('hidden');
    }
  }

  window.addEventListener('popstate', (e) => {
    if (!e.state || !e.state.cartOpen) {
      if (cartPanel) cartPanel.classList.remove('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.add('hidden');
    } else {
      if (cartPanel) cartPanel.classList.add('open-mobile');
      if (cartBackdrop) cartBackdrop.classList.remove('hidden');
    }
  });

  // Swipe to close
  let touchStartY = 0;
  if (cartPanel) {
    cartPanel.addEventListener('touchstart', e => {
      const itemsContainer = e.target.closest('.cart-items');
      if (itemsContainer && itemsContainer.scrollTop > 0) return;
      touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});
    
    cartPanel.addEventListener('touchmove', e => {
      if (!touchStartY) return;
      const currentY = e.changedTouches[0].screenY;
      const diff = currentY - touchStartY;
      if (diff > 50) {
        closeCartDrawer();
        touchStartY = 0;
      }
    }, {passive: true});
    
    cartPanel.addEventListener('touchend', () => {
      touchStartY = 0;
    });
  }

  if (btnOpenMobileCart) btnOpenMobileCart.addEventListener('click', openCartDrawer);
  if (btnCloseCartDrawer) btnCloseCartDrawer.addEventListener('click', closeCartDrawer);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCartDrawer);

  function renderCart() {
    if (cart.length === 0) {
      document.body.classList.remove('has-cart-bar');
      cartItemsContainer.innerHTML = '<div class="cart-empty">Nenhum item adicionado.</div>';
      cartTotalValue.textContent = 'R$ 0,00';
      ultimoTotalCarrinhoCalculado = 0;
      document.getElementById('pix-cart-preview')?.classList.add('hidden');
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
      closeCartDrawer();
      checkFormValidity();
      return;
    }
    document.body.classList.add('has-cart-bar');

    cartItemsContainer.innerHTML = '';
    let total = 0;
    
    // --- Calculo simplificado de promos para preview ---
    let groupedProduct = {};
    let groupedCategory = {};
    
    cart.forEach((item, idx) => {
      const pId = item.produto.id;
      const cId = item.produto.categoria_id;
      
      let precoBase = Number(item.produto.preco);
      if (item.produto.tipo_montagem === 'meio_a_meio' && item.sabores && item.sabores.length === 2) {
        const pd = Number(allProducts.find(p => p.id === item.sabores[0].produto_id)?.preco || 0);
        const ps = Number(allProducts.find(p => p.id === item.sabores[1].produto_id)?.preco || 0);
        precoBase = (pd * 0.5) + (ps * 0.5);
      }

      if (!groupedProduct[pId]) groupedProduct[pId] = { qtd: 0, precoBase, indices: [] };
      groupedProduct[pId].qtd += item.quantidade;
      groupedProduct[pId].indices.push(idx);
      
      if (!groupedCategory[cId]) groupedCategory[cId] = { qtd: 0, precoBase, indices: [] };
      groupedCategory[cId].qtd += item.quantidade;
      groupedCategory[cId].indices.push(idx);
    });

    let promoLabels = {};
    let promoDiscounts = {};

    activePromos.forEach(promo => {
      let g = null;
      if (promo.produto_id && groupedProduct[promo.produto_id]) {
        g = groupedProduct[promo.produto_id];
      } else if (promo.categoria_id && groupedCategory[promo.categoria_id]) {
        g = groupedCategory[promo.categoria_id];
      }
      
      if (g) {
        let desc = 0;
        let label = '';
        if (promo.tipo === 'percentual') {
          desc = (g.qtd * g.precoBase) * (promo.percentual / 100.0);
          label = `Promo: ${promo.percentual}% off`;
        } else if (promo.tipo === 'compre_leve') {
          let gratis = Math.floor(g.qtd / promo.qtd_leva) * (promo.qtd_leva - promo.qtd_compra);
          desc = gratis * g.precoBase;
          label = `Promo: Leve ${promo.qtd_leva} Pague ${promo.qtd_compra}`;
        } else if (promo.tipo === 'segunda_unidade') {
          desc = Math.floor(g.qtd / 2) * g.precoBase * (promo.percentual / 100.0);
          label = `Promo: 2ª unid. ${promo.percentual}% off`;
        }
        
        if (desc > 0) {
          const targetIdx = g.indices[0]; // Aplica ao primeiro item no visual
          if (!promoDiscounts[targetIdx] || desc > promoDiscounts[targetIdx]) {
            promoDiscounts[targetIdx] = desc;
            promoLabels[targetIdx] = label;
          }
        }
      }
    });

    cart.forEach((item, index) => {
      let adicTotal = 0;
      let adicHtml = '';
      if (item.adicionaisSelecionados && item.adicionaisSelecionados.length > 0) {
        item.adicionaisSelecionados.forEach(ad => {
          adicTotal += ad.preco;
          adicHtml += `<div style="font-size:12px; color:#666;">+ ${window.escapeHtml(ad.nome)} (R$ ${ad.preco.toFixed(2).replace('.', ',')})</div>`;
        });
      }

      let precoBase = Number(item.produto.preco);
      let saboresHtml = '';
      
      if (item.produto.tipo_montagem === 'meio_a_meio' && item.sabores && item.sabores.length === 2) {
        const precoDoce = Number(allProducts.find(p => p.id === item.sabores[0].produto_id)?.preco || 0);
        const precoSalgado = Number(allProducts.find(p => p.id === item.sabores[1].produto_id)?.preco || 0);
        precoBase = (precoDoce * 0.5) + (precoSalgado * 0.5);
        
        const nomeDoce = allProducts.find(p => p.id === item.sabores[0].produto_id)?.nome || '';
        const nomeSalgado = allProducts.find(p => p.id === item.sabores[1].produto_id)?.nome || '';
        saboresHtml = `<div style="font-size:12px; color:#aaa;">½ ${window.escapeHtml(nomeDoce)} / ½ ${window.escapeHtml(nomeSalgado)}</div>`;
      }

      const precoUnitario = precoBase + adicTotal;
      const subtotal = precoUnitario * item.quantidade;
      total += subtotal;

      const obsHtml = item.observacoes 
        ? `<div class="cart-item-obs">↳ Obs: ${window.escapeHtml(item.observacoes)}</div>` 
        : '';
        
      let promoHtml = '';
      if (promoDiscounts[index]) {
        total -= promoDiscounts[index];
        promoHtml = `<div style="font-size:12px; color:#e74c3c; margin-top: 4px;">↳ ${window.escapeHtml(promoLabels[index])} (- R$ ${promoDiscounts[index].toFixed(2).replace('.', ',')})</div>`;
      }

      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${window.escapeHtml(item.produto.nome)}</div>
            ${saboresHtml}
            <div class="cart-item-price">R$ ${precoUnitario.toFixed(2).replace('.', ',')}</div>
            ${adicHtml}
            ${obsHtml}
            ${promoHtml}
          </div>
          <div class="cart-item-actions">
            <button class="cart-btn obs-btn" title="Adicionar/Editar Observação" onclick="window.baristaOpenObs(${index})" style="font-size:12px; width:auto; padding:0 8px;">
              ${item.observacoes ? 'Editar obs' : '+ Obs'}
            </button>
            <button class="cart-btn" onclick="window.baristaUpdateQty(${index}, -1)">-</button>
            <span class="cart-qty">${item.quantidade}</span>
            <button class="cart-btn" onclick="window.baristaUpdateQty(${index}, 1)">+</button>
            <button class="cart-btn remove" onclick="window.baristaUpdateQty(${index}, -999)">🗑</button>
          </div>
        </div>
      `;
      cartItemsContainer.appendChild(div);
    });

    cartTotalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    ultimoTotalCarrinhoCalculado = total;
    atualizarPreviewPixCarrinho(total);

    // Atualizar Barra Mobile Flutuante
    const totalItens = cart.reduce((acc, item) => acc + item.quantidade, 0);
    if (mobileCartCount) mobileCartCount.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
    if (mobileCartTotal) mobileCartTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (mobileCartBar) mobileCartBar.classList.remove('hidden');

    checkFormValidity();
    salvarRascunhoCarrinho();
    syncProductCardsWithCart();
  }

  let ultimoTotalCarrinhoCalculado = 0;
  let ultimoPayloadPixCarrinho = '';

  async function atualizarPreviewPixCarrinho(totalForcado) {
    const box = document.getElementById('pix-cart-preview');
    if (!box) return;
    const total = totalForcado !== undefined ? totalForcado : ultimoTotalCarrinhoCalculado;

    if (!pedidoPagamento || pedidoPagamento.value !== 'pix' || cart.length === 0 || total <= 0) {
      box.classList.add('hidden');
      ultimoPayloadPixCarrinho = '';
      return;
    }

    box.classList.remove('hidden');
    const lblVal = document.getElementById('pix-cart-valor-lbl');
    const qrContainer = document.getElementById('pix-cart-qr-svg');
    const avisoSemChave = document.getElementById('pix-cart-aviso-sem-chave');
    if (lblVal) lblVal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    if (!window.cafeteriaPix) return;
    const cfg = await window.cafeteriaPix.obterConfigPix();
    const res = window.cafeteriaPix.gerarPayloadPix({
      chave: cfg.chave,
      recebedor: cfg.recebedor,
      cidade: cfg.cidade,
      valor: total,
      txid: 'CAFBALCAO'
    });

    if (!res.ok) {
      ultimoPayloadPixCarrinho = '';
      if (qrContainer) qrContainer.style.display = 'none';
      if (avisoSemChave) avisoSemChave.classList.remove('hidden');
    } else {
      ultimoPayloadPixCarrinho = res.payload;
      if (avisoSemChave) avisoSemChave.classList.add('hidden');
      if (qrContainer) {
        qrContainer.style.display = 'flex';
        qrContainer.innerHTML = window.cafeteriaPix.gerarQrSvg(res.payload, 3, 1);
      }
    }
  }

  document.getElementById('btn-pix-cart-copiar')?.addEventListener('click', function () {
    if (!ultimoPayloadPixCarrinho) {
      showToast('Configure a chave Pix no Admin primeiro.', 'warn');
      return;
    }
    window.cafeteriaPix?.copiarCodigoPix(ultimoPayloadPixCarrinho, this);
    showToast('Código Pix Copia e Cola copiado!', 'success');
  });

  document.getElementById('btn-pix-cart-fullscreen')?.addEventListener('click', () => {
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: ultimoTotalCarrinhoCalculado,
      txid: 'CAFBALCAO',
      subtitulo: mesaSelect?.value ? `Mesa ${mesaSelect.value}` : 'Pedido Balcão / Para Viagem'
    });
  });

  if (pedidoPagamento) {
    pedidoPagamento.addEventListener('change', () => {
      if (pedidoPagamento.value === 'pix') {
        atualizarPreviewPixCarrinho();
      } else {
        document.getElementById('pix-cart-preview')?.classList.add('hidden');
      }
    });
  }

  let isRenderingProducts = false;
  function syncProductCardsWithCart() {
    if (isRenderingProducts || !productsGrid || productsGrid.children.length === 0) return;
    isRenderingProducts = true;
    renderProducts();
    isRenderingProducts = false;
  }

  window.baristaUpdateQty = updateQuantity;
  window.baristaOpenObs = openItemObsModal;

  function checkFormValidity() {
    const hasMesa = mesaSelect.value !== '';
    const isParaViagem = pedidoParaViagem.checked;
    const hasNome = (pedidoClienteNome.value.trim() !== '') || (pedidoClienteId && pedidoClienteId.value !== '');
    const hasItems = cart.length > 0;
    
    // Pode enviar se tiver mesa selecionada OU se for para viagem/tiver nome (pois usaremos BALCAO).
    const canSend = (hasMesa || isParaViagem || hasNome) && hasItems;
    btnEnviarPedido.disabled = !canSend;
    atualizarModoConexaoCarrinho();
  }

  function formatarTelefoneExibicao(tel) {
    if (!tel) return '';
    let d = String(tel).replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 10) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return tel;
  }

  function selecionarCliente(cliente) {
    if (!cliente) return;
    selectedClienteObj = cliente;
    if (pedidoClienteId) pedidoClienteId.value = cliente.id;
    if (pedidoClienteNome) {
      pedidoClienteNome.value = cliente.nome;
      pedidoClienteNome.style.display = 'none';
    }
    if (clienteBadge && clienteBadgeNome) {
      clienteBadgeNome.textContent = cliente.nome;
      if (clienteBadgeTel) {
        clienteBadgeTel.textContent = cliente.telefone ? formatarTelefoneExibicao(cliente.telefone) : '';
      }
      if (clienteBadgeConta) {
        if (cliente.conta_habilitada) {
          const saldo = Number(cliente.saldo) || 0;
          const limiteDisp = Number(cliente.limite_disponivel) || 0;
          const saldoFmt = Math.abs(saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const dispFmt = limiteDisp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          if (saldo > 0) {
            clienteBadgeConta.innerHTML = `<span style="color:#15803d; font-weight:600;">💳 Créditos: +${saldoFmt}</span>`;
          } else if (saldo < 0) {
            clienteBadgeConta.innerHTML = `<span style="color:#b91c1c; font-weight:600;">💳 Fiado: ${saldoFmt} (Disp: ${dispFmt})</span>`;
          } else {
            clienteBadgeConta.innerHTML = `<span style="color:#475569; font-weight:600;">💳 Conta Habilitada (Disp: ${dispFmt})</span>`;
          }
        } else {
          clienteBadgeConta.innerHTML = '<span style="color:#64748b; font-size:11px;">Conta pós-pago: Desabilitada</span>';
        }
      }
      clienteBadge.style.display = 'flex';
    }
    if (sugestoesClientes) {
      sugestoesClientes.style.display = 'none';
      sugestoesClientes.innerHTML = '';
    }
    checkFormValidity();
    salvarRascunhoCarrinho();
  }

  function desvincularCliente() {
    selectedClienteObj = null;
    if (pedidoClienteId) pedidoClienteId.value = '';
    if (pedidoClienteNome) {
      pedidoClienteNome.value = '';
      pedidoClienteNome.style.display = '';
      pedidoClienteNome.focus();
    }
    if (clienteBadgeConta) clienteBadgeConta.innerHTML = '';
    if (clienteBadge) clienteBadge.style.display = 'none';
    if (sugestoesClientes) {
      sugestoesClientes.style.display = 'none';
      sugestoesClientes.innerHTML = '';
    }
    checkFormValidity();
    salvarRascunhoCarrinho();
  }

  if (btnDesvincularCliente) {
    btnDesvincularCliente.addEventListener('click', desvincularCliente);
  }

  function renderSugestoesClientes(lista, termo) {
    if (!sugestoesClientes) return;
    sugestoesClientes.innerHTML = '';

    if (!lista || lista.length === 0) {
      const itemVazio = document.createElement('div');
      itemVazio.style.padding = '8px 12px';
      itemVazio.style.fontSize = '13px';
      itemVazio.style.color = '#64748b';
      itemVazio.textContent = `Nenhum cliente cadastrado com "${termo}"`;
      sugestoesClientes.appendChild(itemVazio);
    } else {
      lista.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '13px';
        item.style.borderBottom = '1px solid #f1f5f9';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const telFmt = c.telefone ? formatarTelefoneExibicao(c.telefone) : '';
        item.innerHTML = `
          <div>
            <strong>${window.escapeHtml(c.nome)}</strong>
            ${telFmt ? `<span style="color:#64748b; font-size:12px; margin-left:6px;">${window.escapeHtml(telFmt)}</span>` : ''}
          </div>
          ${c.aceita_contato ? '<span title="Aceita contato via WhatsApp" style="font-size:14px;">💬</span>' : ''}
        `;
        item.addEventListener('mouseenter', () => item.style.background = '#f8fafc');
        item.addEventListener('mouseleave', () => item.style.background = '#fff');
        item.addEventListener('click', () => selecionarCliente(c));
        sugestoesClientes.appendChild(item);
      });
    }

    const itemNovo = document.createElement('div');
    itemNovo.style.padding = '8px 12px';
    itemNovo.style.cursor = 'pointer';
    itemNovo.style.fontSize = '13px';
    itemNovo.style.fontWeight = 'bold';
    itemNovo.style.color = '#15803d';
    itemNovo.style.background = '#f0fdf4';
    itemNovo.innerHTML = `➕ Cadastrar "<em>${window.escapeHtml(termo)}</em>"`;
    itemNovo.addEventListener('click', () => {
      sugestoesClientes.style.display = 'none';
      abrirModalCadastroCliente(termo);
    });
    sugestoesClientes.appendChild(itemNovo);

    sugestoesClientes.style.display = 'block';
  }

  function abrirModalCadastroCliente(nomePreenchido = '') {
    if (!modalCadastroCliente) return;
    if (cadClienteNome) cadClienteNome.value = nomePreenchido;
    if (cadClienteTel) cadClienteTel.value = '';
    if (cadClienteConsentimento) cadClienteConsentimento.checked = true;
    modalCadastroCliente.style.display = 'flex';
    if (nomePreenchido && cadClienteTel) {
      cadClienteTel.focus();
    } else if (cadClienteNome) {
      cadClienteNome.focus();
    }
  }

  function fecharModalCadastroCliente() {
    if (modalCadastroCliente) modalCadastroCliente.style.display = 'none';
  }

  if (btnAbrirCadastroCliente) {
    btnAbrirCadastroCliente.addEventListener('click', () => {
      const termoAtual = pedidoClienteNome ? pedidoClienteNome.value.trim() : '';
      abrirModalCadastroCliente(termoAtual);
    });
  }
  if (btnFecharModalCliente) btnFecharModalCliente.addEventListener('click', fecharModalCadastroCliente);
  if (btnCancelarCadastroCliente) btnCancelarCadastroCliente.addEventListener('click', fecharModalCadastroCliente);

  if (cadClienteTel) {
    cadClienteTel.addEventListener('input', (e) => {
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

  if (formCadastroClienteRapido) {
    formCadastroClienteRapido.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!navigator.onLine) {
        showToast('Cadastro de novos clientes requer conexão com a internet.', 'error');
        return;
      }
      const nome = cadClienteNome.value.trim();
      const tel = cadClienteTel.value.replace(/\D/g, '');
      const aceita = cadClienteConsentimento.checked;

      if (!nome) {
        showToast('Informe o nome do cliente.', 'error');
        return;
      }
      if (!tel || tel.length < 10) {
        showToast('Informe um telefone válido com DDD (mínimo 10 dígitos).', 'error');
        return;
      }

      try {
        const btnSalvar = formCadastroClienteRapido.querySelector('button[type="submit"]');
        if (btnSalvar) btnSalvar.disabled = true;

        const novo = await window.cafeteriaDB.clientes.create({
          nome: nome,
          telefone: tel,
          aceita_contato: aceita
        });

        showToast('Cliente cadastrado com sucesso!', 'success');
        fecharModalCadastroCliente();
        selecionarCliente(novo);
      } catch (err) {
        console.error('[PDV] Erro ao cadastrar cliente:', err);
        const msg = (err.message && err.message.includes('unique'))
          ? 'Este telefone já está cadastrado para outro cliente.'
          : 'Erro ao cadastrar cliente: ' + (err.message || 'tente novamente');
        showToast(msg, 'error');
      } finally {
        const btnSalvar = formCadastroClienteRapido.querySelector('button[type="submit"]');
        if (btnSalvar) btnSalvar.disabled = false;
      }
    });
  }
  
  let timerBuscaCliente = null;
  if (pedidoClienteNome) {
    pedidoClienteNome.addEventListener('input', () => {
      checkFormValidity();
      salvarRascunhoCarrinho();

      const termo = pedidoClienteNome.value.trim();
      clearTimeout(timerBuscaCliente);
      if (termo.length < 2) {
        if (sugestoesClientes) {
          sugestoesClientes.style.display = 'none';
          sugestoesClientes.innerHTML = '';
        }
        return;
      }

      timerBuscaCliente = setTimeout(async () => {
        try {
          if (!window.cafeteriaDB || !window.cafeteriaDB.clientes) return;
          const clientes = await window.cafeteriaDB.clientes.buscar(termo, 6);
          renderSugestoesClientes(clientes, termo);
        } catch (err) {
          console.warn('[PDV] Erro ao buscar clientes:', err);
        }
      }, 220);
    });

    document.addEventListener('click', (e) => {
      if (sugestoesClientes && !sugestoesClientes.contains(e.target) && e.target !== pedidoClienteNome) {
        sugestoesClientes.style.display = 'none';
      }
    });
  }
  if (pedidoParaViagem) {
    pedidoParaViagem.addEventListener('change', () => {
      if (pedidoParaViagem.checked) {
        if (mesaSelect) mesaSelect.value = '';
        if (navigator.vibrate) navigator.vibrate(12);
      }
      updateMesaTriggerUI();
      renderMesaSelectionGrid();
      checkFormValidity();
      salvarRascunhoCarrinho();
    });
  }
  if (pedidoPrioritario) {
    pedidoPrioritario.addEventListener('change', () => {
      if (boxMotivoPrioridade) {
        boxMotivoPrioridade.style.display = pedidoPrioritario.checked ? 'block' : 'none';
      }
      salvarRascunhoCarrinho();
    });
  }
  if (pedidoPrioridadeMotivo) {
    pedidoPrioridadeMotivo.addEventListener('change', () => {
      salvarRascunhoCarrinho();
    });
  }
  if (pedidoObs) {
    pedidoObs.addEventListener('input', () => {
      salvarRascunhoCarrinho();
    });
  }

  // -----------------------------------------------------
  // 5. ENVIAR PEDIDO (OPTIMISTIC UI, IDEMPOTÊNCIA & FILA OFFLINE) - CAF-000059 / CAF-000060
  // -----------------------------------------------------
  btnEnviarPedido.addEventListener('click', () => {
    if (btnEnviarPedido.disabled) return;
    
    const mesaCodigo = mesaSelect.value;
    const obsGeral = pedidoObs.value.trim();
    const clienteNome = pedidoClienteNome.value.trim();
    const paraViagem = pedidoParaViagem.checked;
    const checkIntervalo = document.getElementById('check-pedido-intervalo');
    const isIntervalo = checkIntervalo ? checkIntervalo.checked : false;
    const finalObsGeral = isIntervalo ? ((obsGeral ? obsGeral + ' ' : '') + '[🎭 Intervalo]').trim() : obsGeral;
    const prioridade = (pedidoPrioritario && pedidoPrioritario.checked) || isIntervalo ? 1 : 0;
    const prioridadeMotivo = prioridade === 1 ? (isIntervalo ? 'Espetáculo (Intervalo)' : (pedidoPrioridadeMotivo ? pedidoPrioridadeMotivo.value : 'Espetáculo')) : null;
    const formaPag = pedidoPagamento.value || null;
    const statusPag = (formaPag === 'conta_cliente' || pedidoPago.checked) ? 'pago' : 'pendente';

    if (!cart || cart.length === 0) {
      showToast('Adicione ao menos um item ao carrinho.', 'error');
      return;
    }
    if (!mesaCodigo && !paraViagem) {
      showToast('Por favor, selecione uma mesa para o pedido.', 'error');
      return;
    }

    const clienteId = pedidoClienteId && pedidoClienteId.value ? pedidoClienteId.value : null;

    if (formaPag === 'conta_cliente') {
      if (!clienteId) {
        showToast('Selecione um cliente cadastrado para lançar na conta corrente.', 'error');
        return;
      }
      if (selectedClienteObj && selectedClienteObj.conta_habilitada === false) {
        showToast('A conta corrente deste cliente não está habilitada para fiado/créditos.', 'error');
        return;
      }
      if (!navigator.onLine || !isPdvOnline) {
        showToast('Pagamento na conta corrente requer conexão ativa com a internet.', 'error');
        return;
      }
    }
    
    const total = cart.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0);

    // Gerar UUID de idempotência no aparelho (CAF-000018)
    const clientId = (window.crypto && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

    // Formatar itens para RPC
    const itensParaRpc = cart.map(item => ({
      produto_id: item.produto.id,
      quantidade: item.quantidade,
      observacoes: item.observacoes || null,
      adicionais: (item.adicionaisSelecionados || []).map(ad => ad.id),
      sabores: item.sabores || undefined,
      cortesia_de_item_index: item.cortesia_de_item_index !== undefined ? item.cortesia_de_item_index : null
    }));

    let retiradaEm = null;
    if (isIntervalo) {
      const horaInt = (typeof espetaculoHojeConfig !== 'undefined' && espetaculoHojeConfig?.espetaculo_horario_intervalo)
        || window.espetaculoHojeConfig?.espetaculo_horario_intervalo
        || '21:30';
      const hojeYmd = (window.datasSP && window.datasSP.hojeSP) ? window.datasSP.hojeSP() : new Date().toISOString().split('T')[0];
      retiradaEm = new Date(`${hojeYmd}T${horaInt}:00-03:00`).toISOString();
    }

    const payload = {
      client_id: clientId,
      mesa_codigo: mesaCodigo || (paraViagem ? 'BALCAO' : 'BALCAO'),
      observacoes: finalObsGeral,
      is_intervalo: isIntervalo,
      retirada_em: retiradaEm,
      cliente_nome: clienteNome,
      cliente_id: clienteId,
      para_viagem: paraViagem,
      prioridade: prioridade,
      prioridade_motivo: prioridadeMotivo,
      forma_pagamento: formaPag,
      status_pagamento: statusPag,
      pedido_origem_id: pedidoOrigemIdAdicao || null,
      is_adicional: Boolean(pedidoOrigemIdAdicao),
      itens: itensParaRpc
    };

    const itensResumo = cart.map(item => {
      let desc = `${item.quantidade}x ${item.produto.nome}`;
      if (item.adicionaisSelecionados && item.adicionaisSelecionados.length > 0) {
        desc += ` (+${item.adicionaisSelecionados.map(a => a.nome).join(', ')})`;
      }
      return desc;
    }).join(', ');

    const offlineOrderData = {
      client_id: clientId,
      mesa_codigo: mesaCodigo || (paraViagem ? 'BALCAO' : 'BALCAO'),
      cliente_nome: clienteNome,
      cliente_id: clienteId,
      para_viagem: paraViagem,
      prioridade: prioridade,
      prioridade_motivo: prioridadeMotivo,
      total_estimado: total,
      itens_resumo: itensResumo,
      payload: payload,
      status: 'aguardando_envio',
      created_at: new Date().toISOString(),
      tentativas: 0,
      ultimo_erro: null
    };

    const mesaIdentificador = mesaCodigo ? `Mesa ${mesaCodigo}` : (paraViagem ? 'Balcão / Viagem' : 'Balcão');
    const cartSnapshot = JSON.parse(JSON.stringify(cart));
    const formSnapshot = {
      mesaCodigo,
      obsGeral,
      clienteNome,
      clienteId,
      clienteTel: clienteBadgeTel ? clienteBadgeTel.textContent : '',
      paraViagem,
      prioridade,
      prioridadeMotivo,
      formaPag,
      statusPag
    };

    // 1. OTIMISMO TOTAL: FECHA E LIBERA CARRINHO IMEDIATAMENTE (0ms de espera para o garçom)
    if (typeof closeCartDrawer === 'function') {
      closeCartDrawer();
    }

    cart = [];
    limparRascunhoCarrinho();
    selectedClienteObj = null;
    pedidoObs.value = '';
    pedidoClienteNome.value = '';
    pedidoClienteNome.style.display = '';
    if (pedidoClienteId) pedidoClienteId.value = '';
    if (clienteBadgeConta) clienteBadgeConta.innerHTML = '';
    if (clienteBadge) clienteBadge.style.display = 'none';
    pedidoParaViagem.checked = false;
    if (pedidoPrioritario) pedidoPrioritario.checked = false;
    if (boxMotivoPrioridade) boxMotivoPrioridade.style.display = 'none';
    if (pedidoPrioridadeMotivo) pedidoPrioridadeMotivo.value = 'Espetáculo';
    pedidoPagamento.value = '';
    pedidoPago.checked = false;
    resetarModoAdicao();
    mesaSelect.value = '';
    renderCart();
    checkFormValidity();
    atualizarModoConexaoCarrinho();

    if (navigator.vibrate) navigator.vibrate(20);
    showToast(`Enviando pedido da ${mesaIdentificador}...`, 'info');

    // 2. DISPARO EM SEGUNDO PLANO (BACKGROUND PROMISE)
    (async () => {
      // Caso offline declarado: grava direto na fila local sem travar
      if (!navigator.onLine || !isPdvOnline) {
        await dbSalvarPedidoOffline(offlineOrderData);
        await atualizarContadorFilaOffline();
        showToast(`⚡ Pedido da ${mesaIdentificador} guardado na fila offline! Será enviado automaticamente.`, 'info');
        return;
      }

      // Caso online: tenta enviar para a RPC
      try {
        const { data: pedidoData, error: pedidoError } = await window.cafeteriaSupabase.rpc('criar_pedido', {
          p_payload: payload
        });

        if (pedidoError) {
          const isNetError = !navigator.onLine || (pedidoError.message && (
            pedidoError.message.includes('fetch') ||
            pedidoError.message.includes('network') ||
            pedidoError.message.includes('Failed') ||
            pedidoError.message.includes('timeout')
          ));

          if (isNetError) {
            await dbSalvarPedidoOffline(offlineOrderData);
            await atualizarContadorFilaOffline();
            showToast(`⚠️ Conexão oscilou. Pedido da ${mesaIdentificador} guardado na fila offline!`, 'warning');
            return;
          }

          showToast(`Erro ao registrar pedido da ${mesaIdentificador}: ${pedidoError.message}`, {
            tipo: 'error',
            acaoTexto: 'Restaurar',
            acaoCallback: () => {
              cart = cartSnapshot;
              mesaSelect.value = formSnapshot.mesaCodigo || '';
              pedidoObs.value = formSnapshot.obsGeral || '';
              pedidoClienteNome.value = formSnapshot.clienteNome || '';
              if (formSnapshot.clienteId && pedidoClienteId) {
                pedidoClienteId.value = formSnapshot.clienteId;
                if (clienteBadge && clienteBadgeNome) {
                  clienteBadgeNome.textContent = formSnapshot.clienteNome;
                  if (clienteBadgeTel) clienteBadgeTel.textContent = formSnapshot.clienteTel || '';
                  clienteBadge.style.display = 'flex';
                  pedidoClienteNome.style.display = 'none';
                }
              } else {
                if (pedidoClienteId) pedidoClienteId.value = '';
                if (clienteBadge) clienteBadge.style.display = 'none';
                pedidoClienteNome.style.display = '';
              }
              pedidoParaViagem.checked = !!formSnapshot.paraViagem;
              if (pedidoPrioritario) pedidoPrioritario.checked = formSnapshot.prioridade === 1;
              if (boxMotivoPrioridade) boxMotivoPrioridade.style.display = formSnapshot.prioridade === 1 ? 'block' : 'none';
              if (pedidoPrioridadeMotivo) pedidoPrioridadeMotivo.value = formSnapshot.prioridadeMotivo || 'Espetáculo';
              pedidoPagamento.value = formSnapshot.formaPag || '';
              pedidoPago.checked = formSnapshot.statusPag === 'pago';
              renderCart();
              checkFormValidity();
              atualizarModoConexaoCarrinho();
              if (typeof openCartDrawer === 'function') openCartDrawer();
              showToast('Carrinho restaurado para ajustes!', { tipo: 'info' });
            },
            duracaoMs: 8000
          });
          return;
        }

        // Sucesso de envio
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        showToast(`✓ Pedido da ${mesaIdentificador} enviado à cozinha com sucesso!`, 'success');
        await Promise.all([loadActivePedidos(), loadMesasOverview()]);
      } catch (err) {
        console.error('[PDV Enviar Otimista] Exceção:', err);
        await dbSalvarPedidoOffline(offlineOrderData);
        await atualizarContadorFilaOffline();
        showToast(`⚠️ Falha de comunicação. Pedido da ${mesaIdentificador} guardado na fila offline!`, 'warning');
      }
    })();
  });

  // -----------------------------------------------------
  // 6. MESAS & ACOMPANHAMENTO DE ENTREGAS
  // -----------------------------------------------------
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
        if (pedidosProntosNotificados.size > 0) {
          data.forEach(p => {
            if ((p.status === 'concluido' || p.status === 'pronto') && !pedidosProntosNotificados.has(p.id)) {
              notificarPedidoPronto(p);
            }
          });
        } else {
          data.forEach(p => {
            if (p.status === 'concluido' || p.status === 'pronto') {
              pedidosProntosNotificados.add(p.id);
            }
          });
        }
        activePedidos = data;
        localStorage.setItem('cafeteria_cache_pdv_active_pedidos', JSON.stringify(data));
        await loadCortesiasDisponiveis();
        renderMesasSection();
        renderPedidosCards();
        updateProntosBadge();
        updateMesaSelectOptions();
        await Promise.all([loadPedidosClienteAguardando(), loadChamadosMesa()]);
      }
    } catch (e) {
      console.warn('[PDV Cache] Falha ao carregar pedidos ativos:', e);
      const cached = localStorage.getItem('cafeteria_cache_pdv_active_pedidos');
      if (cached) {
        try {
          activePedidos = JSON.parse(cached);
          renderMesasSection();
          renderPedidosCards();
          updateProntosBadge();
          updateMesaSelectOptions();
        } catch {}
      }
    }
  }

  // -----------------------------------------------------
  // CAF-000037 & CAF-000038: FUNÇÕES DE TRIAGEM QR / ONLINE E CHAMADOS DE MESA
  // -----------------------------------------------------
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
          if (!pedidosClienteNotificados.has(p.id)) {
            pedidosClienteNotificados.add(p.id);
            temNovo = true;
          }
        });
        if (temNovo && pedidosClienteAguardando.length > 0) {
          tocarAlertaNovoPedidoCliente();
        }

        pedidosClienteAguardando = data;
        renderTriagemPedidosCliente();
      }
    } catch (e) {
      console.warn('Erro ao carregar pedidos aguardando aprovação:', e);
    }
  }

  async function loadChamadosMesa() {
    try {
      if (window.cafeteriaDB && window.cafeteriaDB.mesas) {
        const chamados = await window.cafeteriaDB.mesas.listarChamados(true);
        let temNovo = false;
        chamados.forEach(c => {
          if (!chamadosNotificados.has(c.id)) {
            chamadosNotificados.add(c.id);
            temNovo = true;
          }
        });
        if (temNovo && chamadosMesaPendentes.length > 0) {
          tocarAlertaNovoPedidoCliente();
        }
        chamadosMesaPendentes = chamados;
        renderChamadosMesa();
      }
    } catch (e) {
      console.warn('Erro ao carregar chamados de mesa:', e);
    }
  }

  function renderTriagemPedidosCliente() {
    const qtd = pedidosClienteAguardando.length;
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

    listaPedidosClienteAguardando.innerHTML = pedidosClienteAguardando.map(pedido => {
      const itensHtml = (pedido.pedido_itens || []).map(item => {
        const adics = (item.pedido_item_adicionais || []).map(a => `+ ${a.nome_adicional} (R$ ${Number(a.preco_unitario || 0).toFixed(2)})`).join(', ');
        return `
          <div style="padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.9rem;">
            <div style="display: flex; justify-content: space-between;">
              <span><strong>${item.quantidade}x</strong> ${item.nome_produto || 'Item'}</span>
              <span>R$ ${(item.subtotal || item.preco_unitario * item.quantidade || 0).toFixed(2)}</span>
            </div>
            ${item.observacoes ? `<div style="font-size: 0.8rem; color: #b45309; font-style: italic; margin-left: 12px;">Obs: ${item.observacoes}</div>` : ''}
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

      return `
        <div class="card-pedido-triagem" style="border: 1px solid ${isOnline ? '#86efac' : '#c7d2fe'}; border-left: 5px solid ${isOnline ? '#059669' : '#4f46e5'}; border-radius: 8px; padding: 14px; background: ${isOnline ? '#f0fdf4' : '#faf5ff'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap:wrap; gap:6px;">
            <div>
              <span style="background: ${isOnline ? '#059669' : '#4f46e5'}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85rem;">
                ${isOnline ? '🌐 Online / Encomenda' : `Mesa ${pedido.mesa_codigo}`}
              </span>
              <span style="font-weight: 600; margin-left: 8px; color: #1e293b;">
                ${pedido.cliente_nome || 'Cliente'} ${pedido.cliente_telefone ? `<small style="color:#475569;">(${pedido.cliente_telefone})</small>` : ''}
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

          ${(pedido.observacoes_gerais || pedido.observacoes) ? `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; color: #92400e; margin-bottom: 8px;">
              <strong>Observação:</strong> ${pedido.observacoes_gerais || pedido.observacoes}
            </div>
          ` : ''}

          <div style="background: white; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px;">
            ${itensHtml}
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn-recusar-pedido-cliente" data-id="${pedido.id}" style="background: #fff; border: 1px solid #fca5a5; color: #dc2626; padding: 7px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">
              ✕ Recusar
            </button>
            <button type="button" class="btn-aprovar-pedido-cliente" data-id="${pedido.id}" style="background: ${isOnline ? '#059669' : '#4f46e5'}; border: none; color: white; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
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

  async function aprovarPedidoCliente(pedidoId) {
    try {
      const pedidoAlvo = pedidosClienteAguardando.find(p => p.id === pedidoId);
      if (window.showToast) window.showToast('Aprovando pedido...', 'info');
      await window.cafeteriaDB.clientePedido.aprovar(pedidoId);
      if (window.showToast) window.showToast('Pedido aprovado com sucesso!', 'success');

      // CAF-000038: Se for pedido online com telefone, abre WhatsApp com mensagem de confirmação
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

      // Tentar auto-impressão da comanda se não for agendado distante
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
      await loadActivePedidos();
    } catch (err) {
      console.error('Erro ao aprovar pedido:', err);
      if (window.showToast) window.showToast('Erro ao aprovar pedido: ' + (err.message || err), { tipo: 'error' });
    }
  }

  async function recusarPedidoCliente(pedidoId) {
    const motivo = prompt('Informe o motivo da recusa (será exibido ao cliente no cardápio):', 'Cozinha com alta demanda no momento');
    if (motivo === null) return;
    try {
      await window.cafeteriaDB.clientePedido.recusar(pedidoId, motivo);
      if (window.showToast) window.showToast('Pedido recusado.', 'info');
      await loadPedidosClienteAguardando();
    } catch (err) {
      console.error('Erro ao recusar pedido:', err);
      if (window.showToast) window.showToast('Erro ao recusar pedido: ' + (err.message || err), { tipo: 'error' });
    }
  }

  function renderChamadosMesa() {
    const qtd = chamadosMesaPendentes.length;
    if (badgeChamadosMesa) badgeChamadosMesa.textContent = qtd;

    if (qtd > 0) {
      if (btnChamadosMesaNav) btnChamadosMesaNav.classList.remove('hidden');
      if (bannerChamadosMesaContainer) bannerChamadosMesaContainer.classList.remove('hidden');
      const primeiro = chamadosMesaPendentes[0];
      const tipoTxt = primeiro.tipo === 'conta' ? '🧾 Pedido de Conta' : '🙋 Chamado de Garçom';
      if (bannerChamadosMesaTexto) {
        bannerChamadosMesaTexto.textContent = `${tipoTxt} na Mesa ${primeiro.mesa_codigo}${qtd > 1 ? ` (+${qtd - 1} outros)` : ''}`;
      }
    } else {
      if (btnChamadosMesaNav) btnChamadosMesaNav.classList.add('hidden');
      if (bannerChamadosMesaContainer) bannerChamadosMesaContainer.classList.add('hidden');
    }
  }

  async function atenderChamadoMesa(chamadoId) {
    try {
      await window.cafeteriaDB.mesas.atenderChamado(chamadoId);
      if (window.showToast) window.showToast('Chamado marcado como atendido!', 'success');
      await loadChamadosMesa();
    } catch (err) {
      console.error('Erro ao atender chamado:', err);
      if (window.showToast) window.showToast('Erro ao atender chamado: ' + (err.message || err), { tipo: 'error' });
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

  async function loadCortesiasDisponiveis() {
    const { data } = await window.cafeteriaSupabase
      .from('v_cortesias_disponiveis')
      .select('*')
      .gt('saldo_disponivel', 0);
    if (data) cortesiasDisponiveis = data;
  }

  function updateProntosBadge() {
    const prontosCount = activePedidos.filter(p => p.status === 'concluido').length;
    if (prontosCount > 0) {
      badgeProntos.textContent = `${prontosCount} pronto${prontosCount > 1 ? 's' : ''}`;
      badgeProntos.classList.remove('hidden');
    } else {
      badgeProntos.classList.add('hidden');
    }
  }

  function renderMesasSection() {
    mesasGrid.innerHTML = '';
    
    mesas.forEach(mesa => {
      const pedidosMesa = activePedidos.filter(p => p.mesa_codigo === mesa.codigo);
      const ocupada = pedidosMesa.length > 0;
      const totalMesa = pedidosMesa.reduce((acc, p) => acc + Number(p.total || 0), 0);

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
          // Selecionar para novo pedido
          mesaSelect.value = mesa.codigo;
          cartMesaBadge.textContent = mesa.codigo;
          updateMesaTriggerUI();
          switchTab('novo');
        }
      };

      mesasGrid.appendChild(card);
    });
  }

  // Filtro de Escopo (Meus Pedidos vs Todos) - CAF-000059
  if (filtroEscopoChips && filtroEscopoChips.length > 0) {
    filtroEscopoChips.forEach(chip => {
      if (chip.dataset.scope === currentFilterScope) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }

      chip.addEventListener('click', () => {
        filtroEscopoChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilterScope = chip.dataset.scope;
        localStorage.setItem('cafeteria_pedidos_filtro_escopo', currentFilterScope);
        if (navigator.vibrate) navigator.vibrate(15);
        renderPedidosCards();
      });
    });
  }

  // Filtros de Pedidos Ativos (Status)
  filtroChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filtroChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilterStatus = chip.dataset.filter;
      renderPedidosCards();
    });
  });

  const viewMesas = document.getElementById('view-mesas-pedidos');
  const ptrIndicator = document.getElementById('ptr-indicator');
  let ptrStartY = 0;
  let ptrCurrentY = 0;
  let isPulling = false;

  if (viewMesas) {
    viewMesas.addEventListener('touchstart', (e) => {
      if (viewMesas.scrollTop > 0) return;
      ptrStartY = e.touches[0].clientY;
      isPulling = true;
    }, { passive: true });

    viewMesas.addEventListener('touchmove', (e) => {
      if (!isPulling) return;
      ptrCurrentY = e.touches[0].clientY;
      const dy = ptrCurrentY - ptrStartY;
      
      if (dy > 0 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'none';
          ptrIndicator.style.height = Math.min(dy * 0.5, 60) + 'px';
          ptrIndicator.style.opacity = Math.min(dy / 100, 1);
        }
      }
    }, { passive: true });

    viewMesas.addEventListener('touchend', async () => {
      if (!isPulling) return;
      isPulling = false;
      const dy = ptrCurrentY - ptrStartY;
      if (dy > 60 && viewMesas.scrollTop === 0) {
        if (ptrIndicator) {
          ptrIndicator.style.transition = 'height 0.2s, opacity 0.2s';
          ptrIndicator.style.height = '40px';
          ptrIndicator.innerHTML = '<span>↻ Atualizando...</span>';
        }
        await Promise.all([loadActivePedidos(), loadMesasOverview()]);
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

  function renderPedidosCards() {
    pedidosCardsGrid.innerHTML = '';

    let list = activePedidos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado');

    // Filtro de escopo (Meus Pedidos vs Todos) - CAF-000059
    if (currentFilterScope === 'meus') {
      const myId = currentUser ? currentUser.id : null;
      if (myId) {
        list = list.filter(p => p.usuario_id === myId || p.criado_por === myId);
      }
    }

    const agoraMs = Date.now();
    if (currentFilterStatus === 'agendado') {
      list = list.filter(p => p.retirada_em && (new Date(p.retirada_em).getTime() - agoraMs > 20 * 60 * 1000));
    } else if (currentFilterStatus !== 'todos') {
      list = list.filter(p => p.status === currentFilterStatus);
    }

    if (list.length === 0) {
      const msgVazio = currentFilterScope === 'meus'
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
                onclick="window.baristaTogglePrioridade(${pedido.id})" 
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
        ? `<button type="button" class="btn-ghost-small" style="background:#dcfce7; color:#166534; border:1px solid #86efac; padding:5px 8px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;" onclick="window.baristaAvisarWhatsAppPronto(${pedido.id})" title="Avisar cliente pelo WhatsApp">
            📲 WhatsApp
           </button>`
        : '';
      const btnNaoRetirado = isOnlineOuRetirada
        ? `<button type="button" class="btn-ghost-small" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:5px 8px; border-radius:6px; font-weight:600; font-size:11px; cursor:pointer;" onclick="window.baristaMarcarNaoRetirado(${pedido.id})" title="Marcar pedido como não retirado pelo cliente">
            🚫 Não retirado
           </button>`
        : '';

      let btnAcaoHtml = '';
      if (pedido.status === 'aguardando_pagamento') {
        btnAcaoHtml = `
          <div class="pedido-card-barista__actions" style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn-entregar" style="background:#0f766e;" onclick="window.baristaReceberPedidoTotem(${pedido.id})">
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
            <button class="btn-entregar" onclick="window.baristaMarcarEntregue(${pedido.id})">
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

      // CAF-000067 / CAF-000084: Gesto de deslizar para a direita para marcar como entregue no celular
      const podeEntregar = isPronto || pedido.status === 'pronto' || pedido.status === 'concluido';
      if (window.SwipeAction && typeof window.SwipeAction.bindSwipeRight === 'function' && podeEntregar) {
        window.SwipeAction.bindSwipeRight(card, () => {
          window.baristaMarcarEntregue(pedido.id);
        });
      }

      pedidosCardsGrid.appendChild(card);
    });
  }

  window.baristaAvisarWhatsAppPronto = function (pedidoId) {
    const pedido = activePedidos.find(p => p.id === pedidoId);
    if (!pedido || !pedido.cliente_telefone) return;
    const foneClean = String(pedido.cliente_telefone).replace(/\D/g, '');
    const numPed = pedido.numero_pedido || pedido.id;
    const isPronto = pedido.status === 'concluido' || pedido.status === 'pronto';
    const msg = isPronto
      ? `Olá, ${pedido.cliente_nome || 'Cliente'}! ☕🎉 Seu pedido #${numPed} já está PRONTO para retirada no balcão da Cafeteria do Teatro!`
      : `Olá, ${pedido.cliente_nome || 'Cliente'}! ☕ Sobre o seu pedido #${numPed} na Cafeteria do Teatro: `;
    window.open(`https://wa.me/${foneClean}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  window.baristaMarcarNaoRetirado = async function (pedidoId) {
    const pedido = activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const motivo = prompt('Confirmar que o cliente NÃO compareceu para retirar o pedido? Informe observação:', 'Não retirado pelo cliente no horário agendado');
    if (motivo === null) return;
    try {
      await window.cafeteriaDB.clientePedido.marcarNaoRetirado(pedidoId, motivo);
      showToast('Pedido marcado como não retirado e registrado no histórico do cliente.', 'info');
      await loadActivePedidos();
    } catch (err) {
      console.error('Erro ao marcar como não retirado:', err);
      showToast('Erro: ' + (err.message || err), 'error');
    }
  };

  window.baristaReceberPedidoTotem = async function (pedidoId) {
    const pedido = activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const numPed = pedido.numero_pedido || pedido.id;
    const valorNum = Number(pedido.total || 0);
    const forma = prompt(
      `Receber Pedido #${numPed} (${pedido.cliente_nome || 'Totem'}) — Total R$ ${valorNum.toFixed(2).replace('.', ',')}\nInforme a forma de pagamento (pix, dinheiro, cartao_debito, cartao_credito):`,
      pedido.forma_pagamento || 'pix'
    );
    if (!forma) return;
    const formaNorm = ['pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outros'].includes(forma.trim().toLowerCase())
      ? forma.trim().toLowerCase()
      : 'pix';

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
  };

  window.baristaTogglePrioridade = async function (pedidoId) {
    const pedido = activePedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const novaPrioridade = pedido.prioridade === 1 ? 0 : 1;
    let motivo = null;
    if (novaPrioridade === 1) {
      motivo = prompt('Motivo da prioridade (ex: Espetáculo, Refazer, Reclamação):', pedido.prioridade_motivo || 'Espetáculo');
      if (motivo === null) return; // Cancelou
      motivo = motivo.trim() || 'Espetáculo';
    }

    // Atualização otimista
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
        // Fallback update direto
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
      // Reverter se erro
      pedido.prioridade = novaPrioridade === 1 ? 0 : 1;
      renderPedidosCards();
    }
  };

  if (pedidosCardsGrid) {
    pedidosCardsGrid.addEventListener('click', (e) => {
      const btnChamar = e.target.closest('.btn-chamar-voz');
      if (!btnChamar) return;
      const pedidoId = Number(btnChamar.dataset.pedidoId);
      const pedido = activePedidos.find(p => p.id === pedidoId);
      if (pedido) {
        chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    });
  }

  window.baristaMarcarEntregue = async function (pedidoId) {
    const payload = {
      status: 'entregue',
      entregue_em: new Date().toISOString(),
      entregue_por: currentUser.id,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await window.cafeteriaSupabase
      .from('pedidos')
      .update(payload)
      .eq('id', pedidoId);

    if (error) {
      if (window.showToast) window.showToast("Erro ao marcar como entregue: " + error.message);
      return;
    }

    // Otimista (CAF-000084: armazena status anterior exato para restauração)
    const p = activePedidos.find(x => x.id === pedidoId);
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
          window.showToast("Erro ao desfazer: " + errRevert.message);
          return;
        }

        if (p) p.status = statusAnterior;
        renderPedidosCards();
        updateProntosBadge();
      }, 5000);
    }
  };

  // -----------------------------------------------------
  // 7. MODAL CONSUMO DA MESA & PRÉVIA DA CONTA
  // -----------------------------------------------------
  function abrirModalMesa(mesaCodigo, pedidosMesa) {
    currentSelectedMesaParaConta = { mesaCodigo, pedidosMesa };
    modalMesaTitle.textContent = `Consumo Atual: ${mesaCodigo}`;

    let total = 0;
    let html = '<div style="display:flex; flex-direction:column; gap:12px;">';

    pedidosMesa.forEach(p => {
      total += Number(p.total || 0);
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
        const disponiveis = cortesiasDisponiveis.filter(c => c.pedido_item_origem_id === it.id);
        if (disponiveis.length > 0) {
          disponiveis.forEach(d => {
            const prod = allProducts.find(pr => pr.id === d.produto_cortesia_id);
            if (prod) {
              cortesiaHtml += `<button class="btn-ghost-small" style="font-size:11px; padding:2px 6px; margin-left:8px;" onclick="window.baristaLancarCortesia(${p.id}, ${it.id}, decodeURIComponent('${encodeURIComponent(prod.id)}'))" title="Lançar ${window.escapeHtml(prod.nome)} como cortesia">🎁 ${window.escapeHtml(prod.nome)} (${d.saldo_disponivel})</button>`;
            }
          });
        }

        let cancelClass = it.cancelado ? 'style="text-decoration: line-through; color: #a0a0a0;"' : '';
        let cancelLabel = it.cancelado ? '<span style="color: #e74c3c; font-size:10px; font-weight:bold; margin-left:6px;">CANCELADO</span>' : '';
        let btnCancelarItemHtml = '';
        if (!it.cancelado && p.status !== 'concluido' && p.status !== 'cancelado') {
          btnCancelarItemHtml = `<button class="btn-ghost-small" style="color: #e74c3c; padding: 2px 6px; font-size: 11px; margin-left:8px;" onclick="window.baristaCancelarItem(${it.id}, ${p.id}, decodeURIComponent('${encodeURIComponent(currentSelectedMesaParaConta.mesaCodigo)}'))">✕ Cancelar</button>`;
        }
        
        let obsLabel = it.observacoes ? `<em style="color:#D97706">(${window.escapeHtml(it.observacoes)})</em>` : '';

        html += `<li ${cancelClass}>${it.quantidade}x ${window.escapeHtml(it.nome_produto)} ${obsLabel} — R$ ${(it.quantidade * it.preco_unitario).toFixed(2).replace('.', ',')} ${cancelLabel} ${btnCancelarItemHtml} ${adicText} ${cortesiaHtml}</li>`;
      });

      html += '</ul></div>';
    });

    html += `
      <div style="text-align:right; font-size:18px; font-weight:bold; margin-top:10px; color:var(--marrom-escuro);">
        TOTAL GERAL DA MESA: R$ ${total.toFixed(2).replace('.', ',')}
      </div>
    </div>`;

    modalMesaBody.innerHTML = html;
    modalMesa.classList.remove('hidden');
  }

  function fecharModalMesa() {
    modalMesa.classList.add('hidden');
    currentSelectedMesaParaConta = null;
  }

  [modalMesaClose, modalMesaFechar].forEach(b => b.addEventListener('click', fecharModalMesa));

  function resetarModoAdicao() {
    pedidoOrigemIdAdicao = null;
    if (mesaSelect) mesaSelect.disabled = false;
    if (bannerAdicionandoItens) bannerAdicionandoItens.classList.add('hidden');
    if (lblMesaAdicionando) lblMesaAdicionando.textContent = '';
    updateMesaTriggerUI();
  }

  if (btnCancelarAdicao) {
    btnCancelarAdicao.addEventListener('click', () => {
      cart = [];
      limparRascunhoCarrinho();
      renderCart();
      resetarModoAdicao();
      mesaSelect.value = '';
      updateMesaTriggerUI();
      checkFormValidity();
      switchTab('mesas');
    });
  }

  if (btnMesaAdicionarItens) {
    btnMesaAdicionarItens.addEventListener('click', () => {
      if (!currentSelectedMesaParaConta) return;
      const mesa = currentSelectedMesaParaConta.mesaCodigo;
      const pedidosMesa = currentSelectedMesaParaConta.pedidosMesa || [];
      const ultimoPedido = pedidosMesa.find(p => p.status !== 'cancelado') || pedidosMesa[0];
      pedidoOrigemIdAdicao = ultimoPedido ? (ultimoPedido.numero_pedido || ultimoPedido.id) : null;
      fecharModalMesa();
      
      switchTab('novo');
      mesaSelect.value = mesa;
      mesaSelect.disabled = true;
      lblMesaAdicionando.textContent = mesa;
      bannerAdicionandoItens.classList.remove('hidden');
      
      const badge = document.getElementById('cart-mesa-badge');
      if (badge) badge.textContent = mesa;
      
      updateMesaTriggerUI();
      checkFormValidity();
    });
  }

  if (btnMesaRepetirRodada) {
    btnMesaRepetirRodada.addEventListener('click', () => {
      if (!currentSelectedMesaParaConta || !currentSelectedMesaParaConta.pedidosMesa) return;
      const pedidosValidos = currentSelectedMesaParaConta.pedidosMesa.filter(p => p.status !== 'cancelado');
      if (pedidosValidos.length === 0) {
        showToast('Nenhum pedido anterior encontrado para repetir.', { tipo: 'warning' });
        return;
      }

      // Último pedido da mesa (mais recente)
      const ultimoPedido = pedidosValidos[0];
      if (!ultimoPedido.pedido_itens || ultimoPedido.pedido_itens.length === 0) {
        showToast('O último pedido não possui itens ativos.', { tipo: 'warning' });
        return;
      }

      const itensClonados = [];
      ultimoPedido.pedido_itens.forEach(it => {
        if (it.cancelado) return;
        const prod = allProducts.find(p => p.id === it.produto_id) || {
          id: it.produto_id,
          nome: it.nome_produto,
          preco: it.preco_unitario
        };

        const adicionais = (it.pedido_item_adicionais || []).map(ad => {
          return allAdicionais.find(a => a.id === ad.adicional_id) || {
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

      cart.push(...itensClonados);

      const mesa = currentSelectedMesaParaConta.mesaCodigo;
      fecharModalMesa();
      switchTab('novo');
      mesaSelect.value = mesa;
      mesaSelect.disabled = true;
      lblMesaAdicionando.textContent = mesa;
      bannerAdicionandoItens.classList.remove('hidden');

      const badge = document.getElementById('cart-mesa-badge');
      if (badge) badge.textContent = mesa;

      updateMesaTriggerUI();
      renderCart();
      if (typeof openCartDrawer === 'function') {
        openCartDrawer();
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([15, 60, 15]); } catch (_) {}
      }

      showToast(`Rodada da ${mesa} copiada para o carrinho!`, { tipo: 'success' });
    });
  }

  modalMesaPrint.addEventListener('click', () => {
    if (currentSelectedMesaParaConta && window.cafeteriaPrint) {
      window.cafeteriaPrint.printConferenciaMesa(
        currentSelectedMesaParaConta.mesaCodigo,
        currentSelectedMesaParaConta.pedidosMesa
      );
    }
  });

  // CAF-000066: Compartilhamento digital via WhatsApp e Web Share API
  function obterDadosComprovanteAtual(origem = 'mesa') {
    let mesa = null;
    let pedidos = [];
    let subtotal = 0;
    let desconto = 0;
    let taxa = 0;
    let total = 0;
    let divisaoPessoas = 1;
    let pagamentos = [];
    let clienteNome = null;
    let clienteTelefone = null;
    let pedidoId = null;

    if (origem === 'fechamento' && currentFechamento) {
      mesa = currentFechamento.mesaCodigo;
      pedidos = currentFechamento.pedidos || [];
      subtotal = currentFechamento.subtotal || 0;
      desconto = currentFechamento.descontoAplicado || 0;
      taxa = currentFechamento.taxaServico || 0;
      total = currentFechamento.totalConta || (subtotal - desconto + taxa);
      pagamentos = currentFechamento.pagamentos || [];
      if (fecharContaModo?.value === 'igual' && fecharContaNumPessoas) {
        divisaoPessoas = parseInt(fecharContaNumPessoas.value, 10) || 1;
      }
    } else if (currentSelectedMesaParaConta) {
      mesa = currentSelectedMesaParaConta.mesaCodigo;
      pedidos = currentSelectedMesaParaConta.pedidosMesa || [];
      subtotal = pedidos.reduce((sum, p) => sum + Number(p.total || 0), 0);
      total = subtotal;
    }

    const itensMap = new Map();
    pedidos.forEach(p => {
      if (!clienteNome && (p.cliente_nome || p.clientes?.nome)) {
        clienteNome = p.cliente_nome || p.clientes?.nome;
      }
      if (!clienteTelefone && (p.cliente_telefone || p.clientes?.telefone)) {
        clienteTelefone = p.cliente_telefone || p.clientes?.telefone;
      }
      if (!pedidoId && p.id) {
        pedidoId = p.id;
      }

      const itens = p.pedido_itens || p.itens || [];
      itens.forEach(it => {
        const nome = it.nome_produto || it.produtos?.nome || it.nome || 'Item';
        const preco = Number(it.preco_unitario || it.preco || 0);
        const qtd = Number(it.quantidade || 1);
        const key = `${nome}__${preco}`;
        if (!itensMap.has(key)) {
          itensMap.set(key, { nome, preco_unitario: preco, quantidade: 0, observacoes: it.observacoes });
        }
        itensMap.get(key).quantidade += qtd;
      });
    });

    return {
      mesaCodigo: mesa,
      clienteNome,
      clienteTelefone,
      itens: Array.from(itensMap.values()),
      subtotal,
      desconto,
      taxaServico: taxa,
      total,
      divisaoPessoas,
      formasPagamento: pagamentos,
      pedidoId
    };
  }

  function acaoEnviarWhatsAppComprovante(origem = 'mesa') {
    if (!window.ReceiptFormatter) return;
    const dados = obterDadosComprovanteAtual(origem);
    const texto = window.ReceiptFormatter.formatDigitalReceipt(dados);
    window.ReceiptFormatter.openWhatsAppReceipt(texto, dados.clienteTelefone);
  }

  async function acaoCompartilharComprovante(origem = 'mesa') {
    if (!window.ReceiptFormatter) return;
    const dados = obterDadosComprovanteAtual(origem);
    const texto = window.ReceiptFormatter.formatDigitalReceipt(dados);
    await window.ReceiptFormatter.shareOrCopyReceipt(texto, {
      title: `Comprovante Mesa ${dados.mesaCodigo || ''}`,
      onCopySuccess: (msg) => {
        if (window.showToast) window.showToast(msg, { tipo: 'success' });
      }
    });
  }

  document.getElementById('btn-mesa-whatsapp')?.addEventListener('click', () => acaoEnviarWhatsAppComprovante('mesa'));
  document.getElementById('btn-mesa-share')?.addEventListener('click', () => acaoCompartilharComprovante('mesa'));
  document.getElementById('btn-fechar-conta-whatsapp')?.addEventListener('click', () => acaoEnviarWhatsAppComprovante('fechamento'));
  document.getElementById('btn-fechar-conta-share')?.addEventListener('click', () => acaoCompartilharComprovante('fechamento'));

  // -----------------------------------------------------
  // 7.1. FLUXO DE FECHAMENTO DE CONTA DA MESA
  // -----------------------------------------------------

  modalMesaFecharConta.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalFecharConta(currentSelectedMesaParaConta.mesaCodigo, currentSelectedMesaParaConta.pedidosMesa);
  });

  // -----------------------------------------------------
  // 7.0. TRANSFERIR / JUNTAR MESAS
  // -----------------------------------------------------

  btnMesaTransferir.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalTransferencia('transferir', currentSelectedMesaParaConta.mesaCodigo);
  });

  btnMesaJuntar.addEventListener('click', () => {
    if (!currentSelectedMesaParaConta) return;
    abrirModalTransferencia('juntar', currentSelectedMesaParaConta.mesaCodigo);
  });

  async function abrirModalTransferencia(acao, mesaBase) {
    acaoTransferenciaAtiva = acao;
    mesaAlvoTransferencia = mesaBase;

    modalTransferirTitle.textContent = acao === 'transferir' 
      ? `Transferir pedidos da mesa ${mesaBase} para:` 
      : `Juntar pedidos de outra mesa à mesa ${mesaBase}:`;
    
    selectTransferirMesa.innerHTML = '<option value="">Carregando mesas...</option>';
    modalTransferirMesa.classList.remove('hidden');

    try {
      const { data: mesas, error } = await supabase
        .from('mesas')
        .select('codigo')
        .eq('ativo', true)
        .order('codigo');

      if (error) throw error;

      selectTransferirMesa.innerHTML = '<option value="">Selecione...</option>';
      mesas.forEach(m => {
        if (m.codigo !== mesaBase) {
          const opt = document.createElement('option');
          opt.value = m.codigo;
          opt.textContent = m.codigo;
          selectTransferirMesa.appendChild(opt);
        }
      });
    } catch (err) {
      console.error('Erro ao buscar mesas:', err);
      selectTransferirMesa.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  function fecharModalTransferencia() {
    modalTransferirMesa.classList.add('hidden');
    acaoTransferenciaAtiva = null;
    mesaAlvoTransferencia = null;
    selectTransferirMesa.value = '';
  }

  [btnTransferirClose, btnTransferirCancel].forEach(b => b.addEventListener('click', fecharModalTransferencia));

  btnTransferirConfirm.addEventListener('click', async () => {
    const mesaSelecionada = selectTransferirMesa.value;
    if (!mesaSelecionada) {
      showToast('Por favor, selecione uma mesa.', { tipo: 'warning' });
      return;
    }

    let pOrigem, pDestino;
    if (acaoTransferenciaAtiva === 'transferir') {
      pOrigem = mesaAlvoTransferencia;
      pDestino = mesaSelecionada;
    } else {
      pOrigem = mesaSelecionada;
      pDestino = mesaAlvoTransferencia;
    }

    try {
      btnTransferirConfirm.disabled = true;
      btnTransferirConfirm.textContent = 'Processando...';

      const { error } = await supabase.rpc('transferir_mesa', {
        p_origem: pOrigem,
        p_destino: pDestino
      });

      if (error) throw error;

      window.showToast('Operação realizada com sucesso!', { tipo: 'success' });
      fecharModalTransferencia();
      fecharModalMesa();
      loadPedidos(); // Recarrega os pedidos e mesas
    } catch (err) {
      console.error('Erro ao transferir:', err);
      showToast('Erro ao transferir pedidos: ' + err.message, { tipo: 'error' });
    } finally {
      btnTransferirConfirm.disabled = false;
      btnTransferirConfirm.textContent = 'Confirmar';
    }
  });


  let currentPartes = [];
  let parteAtivaId = null;

  function abrirModalFecharConta(mesaCodigo, pedidosMesa) {
    currentFechamento.mesaCodigo = mesaCodigo;
    currentFechamento.pedidos = pedidosMesa;
    currentFechamento.subtotal = 0;
    currentFechamento.descontoAplicado = 0;
    currentFechamento.descontoMotivo = '';
    currentFechamento.taxaServico = 0;
    currentFechamento.totalConta = 0;
    currentFechamento.jaPago = 0;
    currentFechamento.aPagar = 0;
    
    // Calcula subtotal e já pago
    pedidosMesa.forEach(p => {
      const valorPedido = Number(p.total || 0);
      currentFechamento.subtotal += valorPedido;
      if (p.status_pagamento === 'pago') {
        currentFechamento.jaPago += valorPedido;
      } else {
        // Iniciar pedidos com % de atribuição
        p._atribuicoes = []; // { parteId, perc }
      }
    });

    if (currentFechamento.subtotal - currentFechamento.jaPago <= 0) {
      showToast('Esta mesa não tem pedidos pendentes de pagamento.', 'info');
      return;
    }

    fecharContaTitle.textContent = `Fechar Conta: ${mesaCodigo}`;
    
    // Configura UI Taxa de Serviço
    if (configTaxaServico.ativa) {
      fecharContaDivTaxa.classList.remove('hidden');
      fecharContaTaxaCheck.checked = true;
      fecharContaTaxaPercLbl.textContent = `${configTaxaServico.percentual}%`;
    } else {
      fecharContaDivTaxa.classList.add('hidden');
      fecharContaTaxaCheck.checked = false;
    }

    // Configura UI Desconto Manual (CAF-000036)
    const temPermissaoDesconto = usuarioTemPermissao('pdv.desconto');
    const btnSolicitarDescontoContainer = document.getElementById('fechar-conta-btn-pedir-desconto-container');
    currentFechamento._supervisorDesconto = null;

    if (temPermissaoDesconto) {
      fecharContaDivDesconto.classList.remove('hidden');
      if (btnSolicitarDescontoContainer) btnSolicitarDescontoContainer.classList.add('hidden');
      fecharContaDescontoTipo.value = 'valor';
      fecharContaDescontoValor.value = '';
      fecharContaDescontoMotivo.value = '';
    } else {
      fecharContaDivDesconto.classList.add('hidden');
      if (btnSolicitarDescontoContainer) btnSolicitarDescontoContainer.classList.remove('hidden');
      fecharContaDescontoValor.value = '';
      fecharContaDescontoMotivo.value = '';
    }

    if (fecharContaCupomInput) fecharContaCupomInput.value = '';
    if (fecharContaCupomMsg) {
      fecharContaCupomMsg.style.display = 'none';
      fecharContaCupomMsg.textContent = '';
    }
    currentFechamento._cupomCampanhaId = null;
    currentFechamento._cupomCodigo = null;

    recalcularTotaisFechamento();
    
    // Reseta UI Divisão
    fecharContaModo.value = 'padrao';
    fecharContaModo.dispatchEvent(new Event('change'));
    
    modalMesa.classList.add('hidden');
    modalFecharConta.classList.remove('hidden');
    setFecharContaStep(1);
  }

  function recalcularTotaisFechamento() {
    let desconto = 0;
    if (fecharContaDescontoValor.value) {
      let val = Number(fecharContaDescontoValor.value);
      if (fecharContaDescontoTipo.value === 'percent') {
        desconto = (currentFechamento.subtotal * val) / 100;
      } else {
        desconto = val;
      }
    }
    
    // Limita desconto ao subtotal
    if (desconto > currentFechamento.subtotal) {
      desconto = currentFechamento.subtotal;
    }
    currentFechamento.descontoAplicado = desconto;
    currentFechamento.descontoMotivo = fecharContaDescontoMotivo.value.trim();

    let subtotalAposDesconto = currentFechamento.subtotal - desconto;
    let taxa = 0;
    if (configTaxaServico.ativa && fecharContaTaxaCheck.checked) {
      taxa = (subtotalAposDesconto * configTaxaServico.percentual) / 100;
    }
    currentFechamento.taxaServico = taxa;
    
    currentFechamento.totalConta = subtotalAposDesconto + taxa;
    currentFechamento.aPagar = currentFechamento.totalConta - currentFechamento.jaPago;
    
    fecharContaSubtotalLbl.textContent = `R$ ${currentFechamento.subtotal.toFixed(2).replace('.', ',')}`;
    fecharContaTaxaValLbl.textContent = `R$ ${currentFechamento.taxaServico.toFixed(2).replace('.', ',')}`;
    fecharContaTotalLbl.textContent = `R$ ${currentFechamento.totalConta.toFixed(2).replace('.', ',')}`;
    fecharContaJaPagoLbl.textContent = `R$ ${currentFechamento.jaPago.toFixed(2).replace('.', ',')}`;
    fecharContaAPagarLbl.textContent = `R$ ${currentFechamento.aPagar.toFixed(2).replace('.', ',')}`;
    
    // Recalcula divisões se necessário
    if (fecharContaModo.value === 'padrao') {
       if (currentPartes.length > 0) {
         currentPartes[0].valor_devido = currentFechamento.aPagar;
       }
    } else if (fecharContaModo.value === 'igual') {
       btnGerarPartesIgual.click(); // forca recalcular divisao igual
    }
    
    renderPartes();
    updateFecharContaFooterSummary();
  }

  fecharContaDescontoValor.addEventListener('input', recalcularTotaisFechamento);
  fecharContaDescontoTipo.addEventListener('change', recalcularTotaisFechamento);
  fecharContaDescontoMotivo.addEventListener('input', () => { currentFechamento.descontoMotivo = fecharContaDescontoMotivo.value.trim(); });
  fecharContaTaxaCheck.addEventListener('change', recalcularTotaisFechamento);

  if (btnFecharContaAplicarCupom) {
    btnFecharContaAplicarCupom.addEventListener('click', async () => {
      const code = (fecharContaCupomInput?.value || '').trim();
      if (!code) {
        if (fecharContaCupomMsg) {
          fecharContaCupomMsg.textContent = 'Informe o código do cupom.';
          fecharContaCupomMsg.style.color = '#dc2626';
          fecharContaCupomMsg.style.display = 'block';
        }
        return;
      }

      btnFecharContaAplicarCupom.disabled = true;
      btnFecharContaAplicarCupom.textContent = 'Validando...';

      const validator = window.couponValidator;
      const sb = window.cafeteriaSupabase || window.supabaseClient;
      const subtotal = currentFechamento ? currentFechamento.subtotal : 0;

      let res = null;
      if (validator && sb) {
        res = await validator.validateCouponWithSupabase(sb, code, subtotal);
      } else {
        res = { valid: false, message: 'Validador de cupons não disponível.' };
      }

      btnFecharContaAplicarCupom.disabled = false;
      btnFecharContaAplicarCupom.textContent = 'Aplicar';

      if (res && res.valid) {
        fecharContaDivDesconto.classList.remove('hidden');
        fecharContaDescontoTipo.value = (res.tipo_desconto === 'percentual' || res.tipo_desconto === 'percent') ? 'percent' : 'valor';
        fecharContaDescontoValor.value = res.valor_desconto;
        fecharContaDescontoMotivo.value = `Cupom: ${res.cupom_codigo}`;
        if (currentFechamento) {
          currentFechamento._cupomCampanhaId = res.campanha_id;
          currentFechamento._cupomCodigo = res.cupom_codigo;
        }

        if (fecharContaCupomMsg) {
          fecharContaCupomMsg.textContent = `✅ ${res.message} (- R$ ${res.desconto_calculado.toFixed(2).replace('.', ',')})`;
          fecharContaCupomMsg.style.color = '#15803d';
          fecharContaCupomMsg.style.display = 'block';
        }

        recalcularTotaisFechamento();
      } else {
        if (fecharContaCupomMsg) {
          fecharContaCupomMsg.textContent = `❌ ${res ? res.message : 'Cupom inválido.'}`;
          fecharContaCupomMsg.style.color = '#dc2626';
          fecharContaCupomMsg.style.display = 'block';
        }
      }
    });
  }

  const btnSolicitarDescontoPin = document.getElementById('btn-solicitar-desconto-pin');
  if (btnSolicitarDescontoPin) {
    btnSolicitarDescontoPin.addEventListener('click', async () => {
      const auth = await pedirAutorizacaoPin(
        'pdv.desconto',
        `Liberação de desconto para ${currentFechamento ? currentFechamento.mesaCodigo : 'a mesa'}`,
        { mesa_codigo: currentFechamento ? currentFechamento.mesaCodigo : null }
      );
      if (auth) {
        currentFechamento._supervisorDesconto = auth;
        fecharContaDivDesconto.classList.remove('hidden');
        document.getElementById('fechar-conta-btn-pedir-desconto-container')?.classList.add('hidden');
        if (auth.motivo && !fecharContaDescontoMotivo.value) {
          fecharContaDescontoMotivo.value = auth.motivo;
        }
        fecharContaDescontoValor.focus();
      }
    });
  }

  fecharContaModo.addEventListener('change', () => {
    const modo = fecharContaModo.value;
    fecharContaDivPessoas.classList.add('hidden');
    fecharContaDivAddParte.classList.add('hidden');
    
    currentPartes = [];
    parteAtivaId = null;
    
    if (modo === 'padrao') {
      currentPartes.push({
        id: 1,
        nome: 'Parte Única',
        valor_devido: currentFechamento.aPagar,
        pagamentos: [],
        dinheiro_recebido: 0
      });
      parteAtivaId = 1;
    } else if (modo === 'igual') {
      fecharContaDivPessoas.classList.remove('hidden');
    } else if (modo === 'item') {
      fecharContaDivAddParte.classList.remove('hidden');
      // Limpar atribuições dos pedidos
      currentFechamento.pedidos.forEach(p => { if (p._atribuicoes) p._atribuicoes = []; });
    }
    renderPartes();
    renderResumoItens();
  });

  btnGerarPartesIgual.addEventListener('click', () => {
    const num = Number(fecharContaNumPessoas.value);
    if (num < 2) return;
    currentPartes = [];
    
    const partesValores = window.cafeteriaDivisaoConta
      ? window.cafeteriaDivisaoConta.dividirConta(currentFechamento.aPagar, num)
      : [currentFechamento.aPagar];

    currentPartes = partesValores.map((valor, idx) => ({
      id: idx + 1,
      nome: `Parte ${idx + 1}`,
      valor_devido: valor,
      pagamentos: [],
      dinheiro_recebido: 0
    }));
    parteAtivaId = 1;
    renderPartes();
  });

  btnAddParteItem.addEventListener('click', () => {
    const nome = fecharContaNomeParte.value.trim() || `Parte ${currentPartes.length + 1}`;
    currentPartes.push({
      id: Date.now(),
      nome: nome,
      valor_devido: 0,
      pagamentos: [],
      dinheiro_recebido: 0
    });
    fecharContaNomeParte.value = '';
    renderPartes();
  });

  // Expor no window para usar no html gerado
  window.selecionarParte = function(id) {
    parteAtivaId = id;
    renderPartes();
    renderResumoItens();
  };

  window.atribuirItem = function(pedidoId, percent) {
    if (fecharContaModo.value !== 'item') return;
    if (!parteAtivaId) {
      showToast('Selecione uma parte primeiro!', 'warning');
      return;
    }
    
    const p = currentFechamento.pedidos.find(x => x.id === pedidoId);
    if (!p) return;
    
    // Remove se já existe essa atribuição para recalcular
    p._atribuicoes = p._atribuicoes.filter(a => a.parteId !== parteAtivaId);
    
    // Soma % atual (exceto a parte atual)
    let totalPerc = p._atribuicoes.reduce((sum, a) => sum + a.perc, 0);
    if (totalPerc + percent > 100) {
      showToast('O item não pode passar de 100% de atribuição.', 'error');
      return;
    }
    
    if (percent > 0) {
      p._atribuicoes.push({ parteId: parteAtivaId, perc: percent });
    }
    
    recalcularValorDevidoItemMode();
    renderResumoItens();
    renderPartes();
  };

  function recalcularValorDevidoItemMode() {
    currentPartes.forEach(pt => pt.valor_devido = 0);
    
    currentFechamento.pedidos.forEach(p => {
      if (p.status_pagamento === 'pago') return;
      if (!p._atribuicoes) return;
      
      const valorPedido = Number(p.total || 0);
      p._atribuicoes.forEach(a => {
        const pt = currentPartes.find(x => x.id === a.parteId);
        if (pt) {
          pt.valor_devido += (valorPedido * (a.perc / 100));
        }
      });
    });
  }

  function renderResumoItens() {
    let htmlResumo = '<ul style="padding-left:16px; margin:0; list-style-type:none;">';
    
    currentFechamento.pedidos.forEach(p => {
      const valorPedido = Number(p.total || 0);
      let statusHtml = '';
      if (p.status_pagamento === 'pago') {
        statusHtml = '<span style="color:green; font-weight:bold;">(Pago)</span>';
      }
      
      htmlResumo += `<li style="margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Pedido #${p.numero_pedido || p.id} ${statusHtml}</span>
          <strong>R$ ${valorPedido.toFixed(2).replace('.', ',')}</strong>
        </div>`;
        
      if (fecharContaModo.value === 'item' && p.status_pagamento !== 'pago') {
        let atribuido = 0;
        let badges = '';
        if (p._atribuicoes) {
          p._atribuicoes.forEach(a => {
            atribuido += a.perc;
            const pt = currentPartes.find(x => x.id === a.parteId);
            if (pt) {
              badges += `<span style="font-size:10px; background:#ddd; padding:2px 4px; border-radius:4px; margin-right:4px;">${window.escapeHtml(pt.nome)} (${a.perc}%)</span>`;
            }
          });
        }
        
        let botoesAtrib = '';
        if (atribuido < 100 && parteAtivaId) {
          let faltante = 100 - atribuido;
          botoesAtrib = `
            <div style="margin-top: 4px;">
              ${faltante === 100 ? `<button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, 100)">Atribuir 100%</button>` : ''}
              <button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, 50)">+50%</button>
              <button class="btn-ghost-small" style="font-size:11px;" onclick="window.atribuirItem(${p.id}, ${faltante})">Restante (${faltante}%)</button>
            </div>
          `;
        }
        
        htmlResumo += `<div>${badges}${botoesAtrib}</div>`;
      }
      
      htmlResumo += `</li>`;
    });
    htmlResumo += '</ul>';
    fecharContaResumo.innerHTML = htmlResumo;
  }

  function renderPartes() {
    let totalPagoAll = 0;
    
    let htmlPartes = '';
    currentPartes.forEach(pt => {
      let totalPagoParte = pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);
      totalPagoAll += totalPagoParte;
      
      let faltaParte = pt.valor_devido - totalPagoParte;
      if (faltaParte < 0) faltaParte = 0;
      
      let statusColor = faltaParte > 0 ? '#D97706' : 'green';
      if (pt.valor_devido === 0 && fecharContaModo.value === 'item') statusColor = '#999';
      
      let isActive = pt.id === parteAtivaId;
      const nomeSeguro = window.escapeHtml(pt.nome || '');
      
      htmlPartes += `
        <div onclick="window.selecionarParte(${pt.id})" style="border: 2px solid ${isActive ? 'var(--marrom)' : '#E5E5E5'}; padding: 8px 12px; border-radius: 8px; cursor: pointer; background: ${isActive ? '#fdf7f1' : '#fff'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color: ${isActive ? 'var(--marrom-escuro)' : '#333'}">${nomeSeguro}</strong>
            <span style="font-size:12px; font-weight:bold; color: ${statusColor}">
              ${faltaParte > 0 ? 'Falta: R$ ' + faltaParte.toFixed(2).replace('.', ',') : (pt.valor_devido > 0 ? 'Pago!' : '')}
            </span>
          </div>
          <div style="font-size: 12px; color: #555;">
            Devido: R$ ${pt.valor_devido.toFixed(2).replace('.', ',')} | Pago: R$ ${totalPagoParte.toFixed(2).replace('.', ',')}
          </div>
        </div>
      `;
    });
    
    fecharContaListaPartes.innerHTML = htmlPartes;
    
    const faltaTotal = currentFechamento.aPagar - totalPagoAll;
    fecharContaFaltaLbl.textContent = `R$ ${(faltaTotal > 0 ? faltaTotal : 0).toFixed(2).replace('.', ',')}`;
    
    if (faltaTotal <= 0.05 && totalPagoAll > 0 && currentPartes.length > 0) {
      fecharContaConfirmar.disabled = false;
      fecharContaFaltaLbl.style.color = 'green';
    } else {
      fecharContaConfirmar.disabled = true;
      fecharContaFaltaLbl.style.color = 'red';
    }

    renderPainelPagamento();
    updateFecharContaFooterSummary();
  }

  function renderTrocoChips(valorBase, pt) {
    if (!containerTrocoChips) return;
    containerTrocoChips.innerHTML = '';
    if (!valorBase || valorBase <= 0) return;

    const sugestoes = new Set();
    sugestoes.add(Number(valorBase.toFixed(2))); // Valor exato

    // Próxima dezena redonda (ex: 26 -> 30, 34 -> 40)
    const proxDezena = Math.ceil(valorBase / 10) * 10;
    if (proxDezena > valorBase && proxDezena <= 200) {
      sugestoes.add(proxDezena);
    }

    // Próximas notas comerciais comuns do Real
    const notasComuns = [5, 10, 20, 50, 100, 200];
    for (const nota of notasComuns) {
      if (nota > valorBase && sugestoes.size < 5) {
        sugestoes.add(nota);
      }
    }

    const valoresOrdenados = Array.from(sugestoes).sort((a, b) => a - b);
    const atualRecebido = Number(inputDinheiroRecebido.value) || 0;

    valoresOrdenados.forEach(val => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isExato = Math.abs(val - valorBase) < 0.005;
      const isSelected = Math.abs(val - atualRecebido) < 0.005;
      btn.className = `btn-troco-chip ${isExato ? 'btn-troco-chip--exato' : ''} ${isSelected ? 'selected' : ''}`;
      
      btn.textContent = isExato
        ? `Exato (R$ ${val.toFixed(2).replace('.', ',')})`
        : `R$ ${val.toFixed(0)}`;

      btn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(15);
        inputDinheiroRecebido.value = val.toFixed(2);
        pt.dinheiro_recebido = val;

        if (fecharContaForma.value !== 'dinheiro') {
          fecharContaForma.value = 'dinheiro';
          divDinheiroRecebido.classList.remove('hidden');
        }

        if (!fecharContaValor.value || Number(fecharContaValor.value) <= 0) {
          fecharContaValor.value = valorBase.toFixed(2);
        }

        renderPainelPagamento();
      });

      containerTrocoChips.appendChild(btn);
    });
  }

  function renderPainelPagamento() {
    if (!parteAtivaId) {
      fecharContaPainelPagamento.classList.add('hidden');
      return;
    }
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (!pt) return;
    
    fecharContaPainelPagamento.classList.remove('hidden');
    tituloPagamentoParte.textContent = `Pagamentos - ${pt.nome}`;
    
    inputDinheiroRecebido.value = pt.dinheiro_recebido || '';
    
    let totalPagoParte = 0;
    let htmlLista = '';
    const formasNomes = { 'pix': 'PIX', 'dinheiro': 'Dinheiro', 'cartao_debito': 'Cartão de Débito', 'cartao_credito': 'Cartão de Crédito', 'outros': 'Outros' };

    pt.pagamentos.forEach(pag => {
      totalPagoParte += pag.valor;
      const isPix = pag.forma === 'pix';
      const txidPag = `CAF${String(currentFechamento?.mesaCodigo || '').replace(/[^A-Za-z0-9]/g, '')}P${pt.id}`;
      const botoesPixHtml = isPix
        ? `<button type="button" class="btn-ghost-small" style="color:#047857; padding:2px 6px; font-weight:700;" onclick="window.mostrarQrPixPagamento(${pag.valor}, '${txidPag}', decodeURIComponent('${encodeURIComponent(pt.nome)}'))">📱 QR Pix</button>`
        : '';
      htmlLista += `
        <div style="display:flex; justify-content: space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:6px; border-radius:4px; margin-bottom:4px; font-size:13px; gap:6px;">
          <span>${formasNomes[pag.forma] || pag.forma}: <strong>R$ ${pag.valor.toFixed(2).replace('.', ',')}</strong></span>
          <div style="display:flex; align-items:center; gap:4px;">
            ${botoesPixHtml}
            <button type="button" class="btn-ghost-small" style="color:red; padding:2px 6px;" onclick="window.removerPagamentoFechamento(${pag.id})">X</button>
          </div>
        </div>
      `;
    });
    fecharContaLista.innerHTML = htmlLista;
    
    const faltaParte = pt.valor_devido - totalPagoParte;
    if (faltaParte > 0 && !fecharContaValor.value) {
      fecharContaValor.value = faltaParte.toFixed(2);
    } else if (faltaParte <= 0) {
      fecharContaValor.value = '';
    }

    let valorDinheiroLancado = pt.pagamentos.filter(pag => pag.forma === 'dinheiro').reduce((sum, pag) => sum + pag.valor, 0);
    const valorBaseParaTroco = valorDinheiroLancado > 0 
      ? valorDinheiroLancado 
      : (Number(fecharContaValor.value) || faltaParte || 0);

    renderTrocoChips(valorBaseParaTroco, pt);

    let recebido = Number(inputDinheiroRecebido.value) || 0;
    if (recebido > 0 && valorBaseParaTroco > 0) {
      let troco = recebido - valorBaseParaTroco;
      if (troco < 0) troco = 0;
      fecharContaTrocoLbl.textContent = `R$ ${troco.toFixed(2).replace('.', ',')}`;
    } else {
      fecharContaTrocoLbl.textContent = `R$ 0,00`;
    }

    atualizarPixFechamentoBox(pt, faltaParte);
  }

  let ultimoPixFechamentoState = { payload: '', valor: 0, txid: '', subtitulo: '' };

  async function atualizarPixFechamentoBox(pt, faltaParte) {
    const divPix = document.getElementById('div-pix-fechamento');
    if (!divPix) return;

    if (fecharContaForma.value !== 'pix' || !pt) {
      divPix.classList.add('hidden');
      return;
    }

    const valorDigitado = Number(fecharContaValor.value) || 0;
    const valorPix =
      valorDigitado > 0
        ? valorDigitado
        : faltaParte > 0
        ? faltaParte
        : pt.valor_devido || 0;

    if (valorPix <= 0) {
      divPix.classList.add('hidden');
      return;
    }

    divPix.classList.remove('hidden');
    const lblVal = document.getElementById('fechar-conta-pix-valor-lbl');
    const qrBox = document.getElementById('fechar-conta-pix-qr');
    const avisoSemChave = document.getElementById('fechar-conta-pix-sem-chave');
    if (lblVal) lblVal.textContent = `R$ ${valorPix.toFixed(2).replace('.', ',')}`;

    const mesaCod = currentFechamento?.mesaCodigo || 'MESA';
    const numPed = currentFechamento?.pedidos?.[0]?.numero_pedido || currentFechamento?.pedidos?.[0]?.id || '';
    const txid = `CAF${String(numPed || mesaCod).replace(/[^A-Za-z0-9]/g, '')}P${pt.id}`;
    const subtitulo = `Mesa ${mesaCod} · ${pt.nome}`;

    if (!window.cafeteriaPix) return;
    const cfg = await window.cafeteriaPix.obterConfigPix();
    const res = window.cafeteriaPix.gerarPayloadPix({
      chave: cfg.chave,
      recebedor: cfg.recebedor,
      cidade: cfg.cidade,
      valor: valorPix,
      txid
    });

    ultimoPixFechamentoState = {
      payload: res.ok ? res.payload : '',
      valor: valorPix,
      txid,
      subtitulo
    };

    if (!res.ok) {
      if (qrBox) qrBox.style.display = 'none';
      if (avisoSemChave) avisoSemChave.classList.remove('hidden');
    } else {
      if (avisoSemChave) avisoSemChave.classList.add('hidden');
      if (qrBox) {
        qrBox.style.display = 'flex';
        qrBox.innerHTML = window.cafeteriaPix.gerarQrSvg(res.payload, 3, 1);
      }
    }
  }

  window.mostrarQrPixPagamento = function (valor, txid, parteNome) {
    const mesaCod = currentFechamento?.mesaCodigo || '';
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: Number(valor || 0),
      txid: txid || 'CAFMESA',
      subtitulo: `Mesa ${mesaCod} · ${parteNome || ''}`
    });
  };

  document.getElementById('btn-fechar-pix-copiar')?.addEventListener('click', function () {
    if (!ultimoPixFechamentoState.payload) {
      showToast('Chave Pix não configurada no Admin.', 'warn');
      return;
    }
    window.cafeteriaPix?.copiarCodigoPix(ultimoPixFechamentoState.payload, this);
    showToast('Código Pix Copia e Cola copiado!', 'success');
  });

  document.getElementById('btn-fechar-pix-fullscreen')?.addEventListener('click', () => {
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: ultimoPixFechamentoState.valor,
      txid: ultimoPixFechamentoState.txid,
      subtitulo: ultimoPixFechamentoState.subtitulo
    });
  });

  fecharContaValor.addEventListener('input', () => {
    if (fecharContaForma.value === 'pix' && parteAtivaId) {
      const pt = currentPartes.find(x => x.id === parteAtivaId);
      if (pt) {
        const pago = pt.pagamentos.reduce((s, p) => s + p.valor, 0);
        atualizarPixFechamentoBox(pt, pt.valor_devido - pago);
      }
    }
  });

  fecharContaForma.addEventListener('change', () => {
    if (fecharContaForma.value === 'dinheiro') {
      divDinheiroRecebido.classList.remove('hidden');
      document.getElementById('div-pix-fechamento')?.classList.add('hidden');
      renderPainelPagamento();
    } else {
      divDinheiroRecebido.classList.add('hidden');
      renderPainelPagamento();
    }
  });

  inputDinheiroRecebido.addEventListener('input', () => {
    if (parteAtivaId) {
      const pt = currentPartes.find(x => x.id === parteAtivaId);
      if (pt) {
        pt.dinheiro_recebido = Number(inputDinheiroRecebido.value) || 0;
        renderPainelPagamento();
      }
    }
  });

  btnAddPagamento.addEventListener('click', () => {
    if (!parteAtivaId) return;
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (!pt) return;

    const forma = fecharContaForma.value;
    const valor = Number(fecharContaValor.value);
    
    if (!valor || valor <= 0) {
      showToast('Digite um valor válido para o pagamento.', 'error');
      return;
    }

    if (forma === 'conta_cliente') {
      const clienteId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || currentFechamento.clienteId;
      if (!clienteId) {
        showToast('É necessário vincular um cliente cadastrado à mesa para pagar com Conta do Cliente.', 'warning');
        return;
      }
    }

    pt.pagamentos.push({
      id: Date.now(),
      forma: forma,
      valor: valor
    });

    fecharContaValor.value = '';
    renderPartes();
  });

  window.removerPagamentoFechamento = function(id) {
    if (!parteAtivaId) return;
    const pt = currentPartes.find(x => x.id === parteAtivaId);
    if (pt) {
      pt.pagamentos = pt.pagamentos.filter(p => p.id !== id);
      renderPartes();
    }
  };

  function fecharModalFecharConta() {
    modalFecharConta.classList.add('hidden');
    if (currentSelectedMesaParaConta) {
      abrirModalMesa(currentSelectedMesaParaConta.mesaCodigo, currentSelectedMesaParaConta.pedidosMesa);
    }
  }

  [fecharContaClose, fecharContaCancelar].forEach(b => b.addEventListener('click', fecharModalFecharConta));

  fecharContaConfirmar.addEventListener('click', async () => {
    // Coleta todos pagamentos de todas as partes
    let todosPagamentos = [];
    currentPartes.forEach(pt => {
      pt.pagamentos.forEach(pag => {
        todosPagamentos.push({ forma: pag.forma, valor: pag.valor, parteNome: pt.nome });
      });
    });

    let totalPagamentos = todosPagamentos.reduce((sum, p) => sum + p.valor, 0);
    
    if (totalPagamentos < currentFechamento.aPagar - 0.05) {
      showToast('O valor dos pagamentos é menor que o total a pagar!', 'error');
      return;
    }

    if (todosPagamentos.length === 0) {
      showToast('Adicione pelo menos uma forma de pagamento.', 'error');
      return;
    }

    // Validação de Conta do Cliente (CAF-000083 / CA02, CA03)
    const pagtoContaCliente = todosPagamentos.find(p => p.forma === 'conta_cliente');
    if (pagtoContaCliente) {
      const clienteId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || currentFechamento.clienteId;
      if (!clienteId) {
        showToast('Erro: mesa sem cliente vinculado para pagamento via Conta do Cliente.', 'error');
        return;
      }
    }

    // Verificação de permissão para desconto (CAF-000036)
    if (currentFechamento.descontoAplicado > 0 && !usuarioTemPermissao('pdv.desconto') && !currentFechamento._supervisorDesconto) {
      const auth = await pedirAutorizacaoPin(
        'pdv.desconto',
        `Aprovar desconto de R$ ${currentFechamento.descontoAplicado.toFixed(2)} no fechamento da mesa ${currentFechamento.mesaCodigo}`,
        { mesa_codigo: currentFechamento.mesaCodigo, desconto: currentFechamento.descontoAplicado }
      );
      if (!auth) {
        showToast('Desconto não autorizado por supervisor.', { tipo: 'warning' });
        return;
      }
      currentFechamento._supervisorDesconto = auth;
    }

    fecharContaConfirmar.disabled = true;
    fecharContaConfirmar.textContent = 'Fechando...';

    try {
      if (pagtoContaCliente) {
        const clienteId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || currentFechamento.clienteId;
        if (window.cafeteriaDB && window.cafeteriaDB.clientes && window.cafeteriaDB.clientes.lancarMovimento) {
          const resDebito = await window.cafeteriaDB.clientes.lancarMovimento(
            clienteId,
            'consumo',
            -Math.abs(pagtoContaCliente.valor),
            currentFechamento.pedidos[0]?.id || null,
            null,
            'conta_cliente',
            `Fechamento Mesa ${currentFechamento.mesaCodigo}`
          );
          if (resDebito && !resDebito.sucesso) {
            showToast(`Débito na conta recusado: ${resDebito?.mensagem || 'Saldo/limite insuficiente.'}`, 'error');
            fecharContaConfirmar.disabled = false;
            fecharContaConfirmar.textContent = 'Confirmar Fechamento';
            return;
          }
        }
      }
      const pagamentosPayload = todosPagamentos.map(p => ({
        forma: p.forma,
        valor: p.valor
      }));

      const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      const { data, error } = await window.cafeteriaSupabase.rpc('fechar_conta_mesa', {
        p_mesa_codigo: currentFechamento.mesaCodigo,
        p_pagamentos: pagamentosPayload,
        p_taxa_servico: Number(currentFechamento.taxaServico || 0),
        p_desconto_manual: Number(currentFechamento.descontoAplicado || 0),
        p_desconto_motivo: currentFechamento.descontoMotivo || null,
        p_idempotency_key: idempotencyKey,
        p_cupom_codigo: currentFechamento.cupomCodigo || null,
        p_campanha_id: currentFechamento._cupomCampanhaId || null
      });

      if (error) throw error;

      if (currentFechamento._cupomCampanhaId && window.couponValidator) {
        try {
          const primeiroPedidoId = currentFechamento.pedidos[0]?.id;
          await window.couponValidator.registerCouponUsage(
            window.cafeteriaSupabase || window.supabaseClient,
            currentFechamento._cupomCampanhaId,
            primeiroPedidoId
          );
        } catch (couponErr) {
          console.warn('[Fechamento] Falha ao registrar estatística do cupom:', couponErr);
          if (typeof showToast === 'function') {
            showToast('Aviso: conta fechada, mas não foi possível registrar estatística do cupom.', 'warning');
          }
        }
      }

      // CAF-000063 / CAF-000076: Fidelidade e Cashback Automático (Desativado por padrão, ativo apenas se configurado)
      if (window.cafeteriaCashback) {
        try {
          const sbClient = window.cafeteriaSupabase || window.supabaseClient;
          const cbConfig = await (window.cafeteriaCashback.loadCashbackConfig
            ? window.cafeteriaCashback.loadCashbackConfig(sbClient)
            : Promise.resolve(null));

          if (window.cafeteriaCashback.isCashbackActive(cbConfig)) {
            const clienteComId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || null;
            if (clienteComId) {
              const valorElegivel = window.cafeteriaCashback.calculateEligiblePaymentAmount(todosPagamentos);
              if (valorElegivel > 0) {
                const cbResult = await window.cafeteriaCashback.processOrderCashback(
                  sbClient,
                  currentFechamento.pedidos[0]?.id || null,
                  clienteComId,
                  valorElegivel
                );
                if (cbResult && cbResult.creditado && cbResult.valor_cashback > 0) {
                  const msg = window.cafeteriaCashback.formatCashbackNotification(
                    cbResult.valor_cashback,
                    cbResult.novo_saldo
                  );
                  showToast(msg || `🎁 Cashback de R$ ${Number(cbResult.valor_cashback).toFixed(2).replace('.', ',')} creditado!`, 'info');
                }
              }
            }
          }
        } catch (cbErr) {
          console.warn('[Cashback] Erro ao processar:', cbErr);
        }
      }

      showToast(`Conta da mesa ${currentFechamento.mesaCodigo} fechada com sucesso!`, 'success');
      
      if (fecharContaImprimirCupom.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoContaMultiPartes) {
        window.cafeteriaPrint.printFechamentoContaMultiPartes(
          currentFechamento.mesaCodigo,
          currentFechamento.pedidos,
          currentPartes,
          currentFechamento.aPagar,
          data.troco || 0,
          currentFechamento.subtotal,
          currentFechamento.descontoAplicado,
          currentFechamento.taxaServico
        );
      } else if (fecharContaImprimirCupom.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoConta) {
        window.cafeteriaPrint.printFechamentoConta(
          currentFechamento.mesaCodigo,
          currentFechamento.pedidos,
          todosPagamentos,
          currentFechamento.aPagar,
          data.troco || 0,
          currentFechamento.subtotal,
          currentFechamento.descontoAplicado,
          currentFechamento.taxaServico
        );
      }

      currentSelectedMesaParaConta = null;
      modalFecharConta.classList.add('hidden');
      loadActivePedidos();

    } catch (err) {
      console.error(err);
      showToast('Erro ao fechar conta: ' + err.message, 'error');
    } finally {
      fecharContaConfirmar.disabled = false;
      fecharContaConfirmar.textContent = 'Confirmar Fechamento';
    }
  });

  // -----------------------------------------------------
  // CAF-000054: CONTROLE DO FLUXO DE FECHAMENTO EM ETAPAS
  // -----------------------------------------------------
  function setFecharContaStep(step) {
    currentFecharContaStep = Math.max(1, Math.min(3, step));
    
    // 1. Alternar visibilidade das etapas
    if (stepFecharConsumo) stepFecharConsumo.classList.toggle('is-active', currentFecharContaStep === 1);
    if (stepFecharAjustes) stepFecharAjustes.classList.toggle('is-active', currentFecharContaStep === 2);
    if (stepFecharPagamento) stepFecharPagamento.classList.toggle('is-active', currentFecharContaStep === 3);

    // 2. Botão voltar e subtítulo
    if (btnFecharContaVoltar) {
      btnFecharContaVoltar.classList.toggle('hidden', currentFecharContaStep === 1);
    }
    
    if (fecharContaStepSub) {
      const stepNames = {
        1: 'Passo 1 de 3: Consumo da Mesa',
        2: 'Passo 2 de 3: Ajustes e Divisão',
        3: 'Passo 3 de 3: Formas de Pagamento'
      };
      fecharContaStepSub.textContent = stepNames[currentFecharContaStep] || '';
    }

    // 3. Marcadores visuais do stepper
    const tabs = document.querySelectorAll('.fechar-conta-step-tab');
    tabs.forEach(tab => {
      const s = Number(tab.getAttribute('data-step'));
      tab.classList.toggle('active', s === currentFecharContaStep);
      tab.classList.toggle('completed', s < currentFecharContaStep);
    });

    // 4. Botões de avanço no rodapé
    if (btnFecharContaNext1) btnFecharContaNext1.classList.toggle('hidden', currentFecharContaStep !== 1);
    if (btnFecharContaNext2) btnFecharContaNext2.classList.toggle('hidden', currentFecharContaStep !== 2);
    if (fecharContaConfirmar) fecharContaConfirmar.classList.toggle('hidden', currentFecharContaStep !== 3);

    // 5. Atualizar resumo do rodapé
    updateFecharContaFooterSummary();

    // 6. Rolar para o topo suavemente
    const modalBody = document.querySelector('.fechar-conta-body');
    if (modalBody) modalBody.scrollTop = 0;
  }

  function updateFecharContaFooterSummary() {
    if (!fecharContaFooterLabel || !fecharContaFooterVal) return;
    if (currentFecharContaStep === 1) {
      fecharContaFooterLabel.textContent = 'Subtotal Itens:';
      fecharContaFooterVal.textContent = `R$ ${currentFechamento.subtotal.toFixed(2).replace('.', ',')}`;
      fecharContaFooterVal.style.color = 'var(--marrom-escuro)';
    } else if (currentFecharContaStep === 2) {
      fecharContaFooterLabel.textContent = 'Total c/ Ajustes:';
      fecharContaFooterVal.textContent = `R$ ${currentFechamento.totalConta.toFixed(2).replace('.', ',')}`;
      fecharContaFooterVal.style.color = 'var(--marrom-escuro)';
    } else {
      let totalPagoAll = 0;
      currentPartes.forEach(pt => {
        totalPagoAll += pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);
      });
      const faltaTotal = currentFechamento.aPagar - totalPagoAll;
      if (faltaTotal <= 0.05 && totalPagoAll > 0 && currentPartes.length > 0) {
        fecharContaFooterLabel.textContent = 'Status:';
        fecharContaFooterVal.textContent = 'Total Pago ✓';
        fecharContaFooterVal.style.color = 'var(--verde-ok)';
      } else {
        fecharContaFooterLabel.textContent = 'Falta Pagar:';
        fecharContaFooterVal.textContent = `R$ ${(faltaTotal > 0 ? faltaTotal : 0).toFixed(2).replace('.', ',')}`;
        fecharContaFooterVal.style.color = 'var(--vermelho-erro)';
      }
    }
  }

  if (btnFecharContaNext1) {
    btnFecharContaNext1.addEventListener('click', () => {
      setFecharContaStep(2);
    });
  }
  if (btnFecharContaNext2) {
    btnFecharContaNext2.addEventListener('click', () => {
      setFecharContaStep(3);
    });
  }
  if (btnFecharContaVoltar) {
    btnFecharContaVoltar.addEventListener('click', () => {
      setFecharContaStep(currentFecharContaStep - 1);
    });
  }
  document.querySelectorAll('.fechar-conta-step-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const step = Number(tab.getAttribute('data-step'));
      if (step) setFecharContaStep(step);
    });
  });

  // -----------------------------------------------------
  // 8. REALTIME (NOTIFICAÇÃO QUANDO PEDIDO FICA PRONTO)
  // -----------------------------------------------------
  // CAF-000030: Debounce individual por pedido (300ms) no PDV
  const pendingPdvPedidoFetches = new Map();

  function schedulePdvIncrementalFetch(pedidoId) {
    if (!pedidoId) return;
    if (pendingPdvPedidoFetches.has(pedidoId)) {
      clearTimeout(pendingPdvPedidoFetches.get(pedidoId));
    }
    const timerId = setTimeout(() => {
      pendingPdvPedidoFetches.delete(pedidoId);
      fetchPdvPedidoIncremental(pedidoId);
    }, 300);
    pendingPdvPedidoFetches.set(pedidoId, timerId);
  }

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

      const idx = activePedidos.findIndex(p => p.id === pedidoId);

      if (!deveEstarAtivo) {
        if (idx >= 0) {
          activePedidos.splice(idx, 1);
        }
      } else {
        if (idx >= 0) {
          activePedidos[idx] = data;
        } else {
          activePedidos.unshift(data);
        }
        activePedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if ((data.status === 'concluido' || data.status === 'pronto') && !pedidosProntosNotificados.has(data.id)) {
          notificarPedidoPronto(data);
        }
      }

      localStorage.setItem('cafeteria_cache_pdv_active_pedidos', JSON.stringify(activePedidos));
      renderMesasSection();
      renderPedidosCards();
      updateProntosBadge();
      updateMesaSelectOptions();
    } catch (err) {
      console.warn('[PDV Incremental] Falha:', err);
    }
  }

  let fetchTimeout = null;
  function debouncedLoadActivePedidos() {
    if (fetchTimeout) clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => {
      loadActivePedidos();
    }, 300);
  }

  let wasOffline = false;
  let onlineToastTimeout = null;

  function updateConnectionStatus(isConnected) {
    isPdvOnline = isConnected;
    const indicator = document.getElementById('conn-status-indicator') || document.querySelector('.status-indicator');
    const dot = document.getElementById('conn-pulse-dot') || (indicator ? indicator.querySelector('.pulse-dot') : null);
    const text = document.getElementById('conn-status-text') || (indicator ? indicator.querySelector('.status-text') : null);
    
    const banner = document.getElementById('banner-offline-alert');
    const bannerIcon = document.getElementById('banner-offline-icon');
    const bannerText = document.getElementById('banner-offline-text');

    if (isConnected) {
      if (dot) dot.style.backgroundColor = '#4CAF50';
      if (text) { text.textContent = 'Conectado'; text.style.color = '#fff'; }

      if (wasOffline && banner) {
        if (onlineToastTimeout) clearTimeout(onlineToastTimeout);
        banner.classList.remove('hidden', 'offline');
        banner.classList.add('online');
        if (bannerIcon) bannerIcon.textContent = '✓';
        if (bannerText) bannerText.textContent = 'Conexão restabelecida. Sincronizando pedidos pendentes...';

        onlineToastTimeout = setTimeout(() => {
          banner.classList.add('hidden');
          banner.classList.remove('online');
        }, 4000);
      } else if (banner && !wasOffline) {
        banner.classList.add('hidden');
        banner.classList.remove('offline', 'online');
      }
      wasOffline = false;
    } else {
      wasOffline = true;
      if (onlineToastTimeout) clearTimeout(onlineToastTimeout);
      if (dot) dot.style.backgroundColor = '#e74c3c';
      if (text) { text.textContent = 'Modo Offline'; text.style.color = '#e74c3c'; }

      if (banner) {
        banner.classList.remove('hidden', 'online');
        banner.classList.add('offline');
        if (bannerIcon) bannerIcon.textContent = '⚡';
        if (bannerText) bannerText.textContent = 'Sem internet. O sistema continua operando offline e salvará seus pedidos.';
      }
    }
    atualizarModoConexaoCarrinho();
  }

  // -----------------------------------------------------
  // CAF-000053: SISTEMA MULTISSENSORIAL DE PEDIDO PRONTO
  // -----------------------------------------------------
  function isSomAtivo() {
    return localStorage.getItem('cafeteria_pdv_som_ativo') !== 'false';
  }

  function setSomAtivo(ativo) {
    localStorage.setItem('cafeteria_pdv_som_ativo', ativo ? 'true' : 'false');
    updateSoundToggleUI();
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
        // Padrão multissensorial distintivo: 200ms vibra, 80ms pausa, 200ms vibra, 80ms pausa, 300ms vibra
        navigator.vibrate([200, 80, 200, 80, 300]);
      } catch (e) {
        console.debug('[PDV Vibrate]', e);
      }
    }
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

  function focarPedidoPronto(pedido) {
    if (!pedido) return;
    if (navBtnMesas) navBtnMesas.click();

    // Se houver filtro ativo que oculte os prontos, alternar para todos
    if (currentFilterStatus !== 'todos' && currentFilterStatus !== 'concluido') {
      currentFilterStatus = 'todos';
      if (filtroChips) {
        filtroChips.forEach(chip => {
          chip.classList.toggle('active', chip.dataset.filter === 'todos');
        });
      }
      renderPedidosCards();
    }

    // Se estiver filtrando por 'meus' e o pedido for de outro garçom, alternar escopo para 'todos' (CAF-000059)
    if (currentFilterScope === 'meus') {
      const myId = currentUser ? currentUser.id : null;
      const isMeu = myId && (pedido.criado_por === myId || pedido.usuario_id === myId);
      if (!isMeu) {
        currentFilterScope = 'todos';
        localStorage.setItem('cafeteria_pedidos_filtro_escopo', 'todos');
        if (filtroEscopoChips) {
          filtroEscopoChips.forEach(c => c.classList.toggle('active', c.dataset.scope === 'todos'));
        }
        renderPedidosCards();
      }
    }

    setTimeout(() => {
      // 1. Procurar card específico do pedido
      const card = document.querySelector(`.pedido-card-barista[data-pedido-id="${pedido.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('destaque-pronto-pulse');
        setTimeout(() => card.classList.remove('destaque-pronto-pulse'), 3500);
        return;
      }

      // 2. Procurar card da mesa na seção de mesas
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

  function exibirToastPedidoPronto(pedido) {
    if (!alertaProntoTop || !alertaProntoTitulo) return;
    if (alertaProntoTimeout) clearTimeout(alertaProntoTimeout);

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

    alertaProntoTimeout = setTimeout(() => {
      alertaProntoTop.classList.add('hidden');
    }, 12000);
  }

  function notificarPedidoPronto(pedido) {
    if (!pedido || !pedido.id) return;
    if (pedidosProntosNotificados.has(pedido.id)) return;
    pedidosProntosNotificados.add(pedido.id);

    // 1. Vibração tátil
    dispararVibracaoTatil();

    // 2. Alerta sonoro / chamada por voz (se não for modo silencioso)
    if (isSomAtivo()) {
      tocarAlertaPronto();
      chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
    } else {
      console.log('[PDV] Modo Silencioso ativo: som suprimido para pedido #', pedido.numero_pedido || pedido.id);
    }

    // 3. Banner / Toast flutuante no topo interativo
    exibirToastPedidoPronto(pedido);

    // 4. Notificação nativa se a tela estiver oculta
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
          if (window.showToast) window.showToast('🔔 Som ativado para alertas de pedidos prontos');
        } else {
          if (window.showToast) window.showToast('🔕 Modo Silencioso ativado (vibração e alertas visuais mantidos)');
        }
        solicitarPermissaoNotificacao();
      });
    }

    // Solicitar permissão de forma não intrusiva na primeira interação
    document.addEventListener('click', () => {
      solicitarPermissaoNotificacao();
    }, { once: true });

    // CAF-000064: Controle de tela sempre ligada (Wake Lock) no PDV Mobile
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

    // CAF-000067: Ditado por voz na observação do pedido/item
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
          if (isProntoAgora && !eraProntoAntes && !pedidosProntosNotificados.has(payload.new.id)) {
            notificarPedidoPronto(payload.new);
          }
        }
        if (payload.eventType === 'DELETE') {
          const pId = payload.old && payload.old.id;
          if (pId) {
            const idx = activePedidos.findIndex(p => p.id === pId);
            if (idx >= 0) {
              activePedidos.splice(idx, 1);
              renderMesasSection();
              renderPedidosCards();
              updateProntosBadge();
              updateMesaSelectOptions();
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produtos' }, payload => {
        loadProdutos();
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
    debouncedLoadActivePedidos();
    loadInitialData();
    processarFilaOffline();
  });
  window.addEventListener('offline', () => {
    updateConnectionStatus(false);
  });

  // Lidar com repouso/troca de aba (CAF-000030: recarga completa apenas se ficou oculta > 60 segundos)
  let lastPdvHiddenTime = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastPdvHiddenTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      const ocultaMs = lastPdvHiddenTime ? (Date.now() - lastPdvHiddenTime) : 0;
      if (ocultaMs > 60000) {
        debouncedLoadActivePedidos();
      }
      if (navigator.onLine) processarFilaOffline();
    }
  });

  function tocarAlertaPronto() {
    if (!isSomAtivo()) return;
    try {
      if (audioPronto) {
        audioPronto.currentTime = 0;
        audioPronto.play().catch(e => console.log('Autoplay bloqueado:', e));
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

  window.baristaChamarPedido = function(numeroOuId, mesaCodigo, clienteNome, paraViagem) {
    if (!isSomAtivo()) {
      if (window.showToast) window.showToast('🔕 Modo silencioso ativo. Ative o som no topo para chamar por voz.');
      return;
    }
    if (typeof numeroOuId === 'number' && !mesaCodigo && !clienteNome) {
      const pedido = activePedidos.find(p => p.id === numeroOuId);
      if (pedido) {
        return chamarPedidoVoz(pedido.numero_pedido || pedido.id, pedido.mesa_codigo, pedido.cliente_nome, pedido.para_viagem);
      }
    }
    chamarPedidoVoz(numeroOuId, mesaCodigo, clienteNome, paraViagem);
  };

  async function loadConfiguracoes() {
    try {
      if (window.cafeteriaDB && window.cafeteriaDB.settings) {
        const settings = await window.cafeteriaDB.settings.all();
        if (settings && settings.taxa_servico_ativa !== undefined) {
          configTaxaServico.ativa = String(settings.taxa_servico_ativa) === 'true';
          configTaxaServico.percentual = parseFloat(settings.taxa_servico_percentual) || 10;
        }
      } else if (window.cafeteriaSupabase) {
        const { data } = await window.cafeteriaSupabase.from('site_settings').select('*');
        if (data) {
          const map = data.reduce((acc, curr) => { acc[curr.key] = curr.value; return acc; }, {});
          if (map.taxa_servico_ativa !== undefined) {
            configTaxaServico.ativa = String(map.taxa_servico_ativa) === 'true';
            configTaxaServico.percentual = parseFloat(map.taxa_servico_percentual) || 10;
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações de taxa:', e);
    }
  }

  // CAF-000037: Listeners da triagem de pedidos de clientes e chamados
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
      if (chamadosMesaPendentes.length > 0) {
        atenderChamadoMesa(chamadosMesaPendentes[0].id);
      }
    });
  }

  if (btnChamadosMesaNav) {
    btnChamadosMesaNav.addEventListener('click', async () => {
      if (chamadosMesaPendentes.length > 0) {
        const primeiro = chamadosMesaPendentes[0];
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

  // Inicializar
  updateConnectionStatus(navigator.onLine);
  atualizarContadorFilaOffline();
  initSoundAndNotificationSystem();
  checkSession();
  loadConfiguracoes();

})();
