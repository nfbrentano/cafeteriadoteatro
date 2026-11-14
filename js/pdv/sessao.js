/* =========================================================
   PDV — AUTENTICAÇÃO, PERMISSÕES, NAVEGAÇÃO, TOASTS & AÇÕES
   ========================================================= */

import { estadoPDV, definirGlobalPDV } from './estado.js';

export function registrarSessaoPDV() {
  function showToast(message, optionsOrActionText = null, actionCallback = null, duracaoMs = 4000) {
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
  }

  function showConfirmBottomSheet(opts) {
    const argFallback = arguments[1] || '';
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
      modal.style.zIndex = '10020';

      const titulo = typeof opts === 'string' ? opts : (opts && opts.titulo ? opts.titulo : 'Confirmar');
      const mensagem = typeof opts === 'object' && opts !== null ? (opts.mensagem || '') : argFallback;
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
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          close(false);
        }
      };

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

      document.addEventListener('keydown', onKeyDown);

      modal.classList.remove('hidden');
    });
  }

  function showConfirm(title, msg) {
    return window.showConfirmBottomSheet({ titulo: title, mensagem: msg });
  }

  // CAF-000109: Bottom Sheet com chips rápidos e input para substituir prompt() nativo
  function showPromptBottomSheet(opts = {}) {
    return new Promise((resolve) => {
      let modal = document.getElementById('modal-prompt-sheet');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-prompt-sheet';
        modal.className = 'modal-overlay hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
          <div class="modal-card" style="max-width:460px;width:92%;padding:1.25rem;">
            <h3 id="modal-prompt-title" style="margin:0 0 0.5rem;font-size:1.15rem;">Informar Motivo</h3>
            <p id="modal-prompt-msg" style="margin:0 0 0.85rem;color:var(--text-muted, #666);font-size:0.95rem;"></p>
            <div id="modal-prompt-chips" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.85rem;"></div>
            <input type="text" id="modal-prompt-input" class="form-input" style="width:100%;min-height:48px;padding:0.65rem 0.85rem;margin-bottom:1rem;border-radius:8px;border:1px solid #ccc;font-size:1rem;" />
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
              <button type="button" id="modal-prompt-cancel" class="btn-secondary">Cancelar</button>
              <button type="button" id="modal-prompt-ok" class="btn-primary">Confirmar</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }
      modal.style.zIndex = '10020';

      const titleEl = modal.querySelector('#modal-prompt-title');
      const msgEl = modal.querySelector('#modal-prompt-msg');
      const chipsEl = modal.querySelector('#modal-prompt-chips');
      const inputEl = modal.querySelector('#modal-prompt-input');
      const btnCancel = modal.querySelector('#modal-prompt-cancel');
      const btnOk = modal.querySelector('#modal-prompt-ok');

      const titulo = opts.titulo || 'Informar Motivo';
      const mensagem = opts.mensagem || '';
      const opcoesRapidas = Array.isArray(opts.opcoesRapidas) ? opts.opcoesRapidas : [];
      const valorPadrao = opts.valorPadrao !== undefined && opts.valorPadrao !== null ? String(opts.valorPadrao) : '';
      const placeholder = opts.placeholder || 'Digite ou selecione uma opção acima...';

      titleEl.textContent = titulo;
      msgEl.textContent = mensagem;
      inputEl.value = valorPadrao;
      inputEl.placeholder = placeholder;
      btnOk.textContent = opts.textoConfirmar || 'Confirmar';
      btnCancel.textContent = opts.textoCancelar || 'Cancelar';

      chipsEl.innerHTML = '';
      opcoesRapidas.forEach((op) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'prompt-chip';
        chip.dataset.chipVal = op;
        chip.textContent = op;
        chip.style.cssText = 'min-height:48px;padding:0.45rem 0.85rem;border-radius:999px;border:1px solid var(--border-color, #d4c4b0);background:var(--surface-elevated, #f7f2eb);cursor:pointer;font-size:0.9rem;font-weight:600;';
        chip.onclick = () => {
          inputEl.value = op;
          inputEl.focus();
        };
        chipsEl.appendChild(chip);
      });

      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter' && document.activeElement === inputEl) {
          e.preventDefault();
          btnOk.click();
        }
      };

      const cleanup = () => {
        modal.classList.add('hidden');
        document.removeEventListener('keydown', onKey);
        btnCancel.onclick = null;
        btnOk.onclick = null;
        modal.onclick = null;
      };

      const close = (val) => {
        cleanup();
        resolve(val);
      };

      btnCancel.onclick = () => close(null);
      btnOk.onclick = () => {
        const val = inputEl.value.trim();
        if (opts.obrigatorio !== false && !val) {
          inputEl.focus();
          return;
        }
        close(val);
      };
      modal.onclick = (e) => {
        if (e.target === modal) close(null);
      };

      document.addEventListener('keydown', onKey);
      modal.classList.remove('hidden');
      setTimeout(() => inputEl.focus(), 10);
    });
  }

  // CAF-000109: Modal / Bottom Sheet com 4 botões de pagamento para recebimento de pedido do Totem
  function showSelecionarPagamentoTotemSheet(opts = {}) {
    return new Promise((resolve) => {
      let modal = document.getElementById('modal-receber-totem');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-receber-totem';
        modal.className = 'modal-overlay hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
          <div class="modal-card" style="max-width:460px;width:92%;padding:1.25rem;">
            <h3 id="modal-receber-totem-title" style="margin:0 0 0.4rem;font-size:1.2rem;">Receber Pedido do Totem</h3>
            <p id="modal-receber-totem-msg" style="margin:0 0 1rem;color:var(--text-muted, #666);font-size:0.95rem;"></p>
            <div id="modal-receber-totem-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
              <button type="button" class="btn-pagto-totem" data-forma="pix">⚡ Pix</button>
              <button type="button" class="btn-pagto-totem" data-forma="cartao_debito">💳 Cartão Débito</button>
              <button type="button" class="btn-pagto-totem" data-forma="cartao_credito">💳 Cartão Crédito</button>
              <button type="button" class="btn-pagto-totem" data-forma="dinheiro">💵 Dinheiro</button>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button type="button" id="modal-receber-totem-cancel" class="btn-secondary">Cancelar</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      const titleEl = modal.querySelector('#modal-receber-totem-title');
      const msgEl = modal.querySelector('#modal-receber-totem-msg');
      const btnCancel = modal.querySelector('#modal-receber-totem-cancel');
      const btnsForma = Array.from(modal.querySelectorAll('.btn-pagto-totem'));

      const numPed = opts.numeroPedido || '';
      const clienteNome = opts.clienteNome || 'Totem';
      const valorNum = Number(opts.valor || 0);
      const sugerida = String(opts.formaSugerida || 'pix').trim().toLowerCase();

      titleEl.textContent = `Receber Pedido #${numPed} (${clienteNome})`;
      msgEl.textContent = `Total: R$ ${valorNum.toFixed(2).replace('.', ',')} — Selecione a forma de pagamento recebida no balcão:`;

      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
      };

      const cleanup = () => {
        modal.classList.add('hidden');
        document.removeEventListener('keydown', onKey);
        btnCancel.onclick = null;
        modal.onclick = null;
        btnsForma.forEach(b => { b.onclick = null; });
      };

      const close = (formaEscolhida) => {
        cleanup();
        resolve(formaEscolhida);
      };

      btnsForma.forEach((btn) => {
        const f = btn.dataset.forma;
        const isDestaque = f === sugerida;
        btn.classList.toggle('sugerida', isDestaque);
        btn.style.borderColor = isDestaque ? 'var(--primary, #8b4513)' : '#ccc';
        btn.style.background = isDestaque ? 'rgba(139, 69, 19, 0.12)' : '#fff';
        btn.onclick = () => close(f);
      });

      btnCancel.onclick = () => close(null);
      modal.onclick = (e) => {
        if (e.target === modal) close(null);
      };

      document.addEventListener('keydown', onKey);
      modal.classList.remove('hidden');
    });
  }

  function usuarioTemPermissao(permissao) {
    const currentUser = estadoPDV.currentUser;
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

  function switchTab(tabName) {
    const { navBtnNovo, navBtnMesas, viewNovoPedido, viewMesasPedidos } = estadoPDV.refs;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch (_) {}
    }
    if (tabName === 'novo') {
      navBtnNovo?.classList.add('active');
      navBtnMesas?.classList.remove('active');
      viewNovoPedido?.classList.remove('hidden');
      viewMesasPedidos?.classList.add('hidden');
    } else {
      navBtnNovo?.classList.remove('active');
      navBtnMesas?.classList.add('active');
      viewNovoPedido?.classList.add('hidden');
      viewMesasPedidos?.classList.remove('hidden');
      estadoPDV.fn.loadActivePedidos?.();
    }
  }

  async function loadInitialData() {
    await Promise.all([
      estadoPDV.fn.loadMesas?.(),
      estadoPDV.fn.loadProdutos?.(),
      estadoPDV.fn.loadAdicionais?.(),
      estadoPDV.fn.loadActivePedidos?.(),
      estadoPDV.fn.loadPromocoes?.()
    ]);
    estadoPDV.fn.restaurarRascunhoCarrinho?.();
  }

  async function loadProfile(user) {
    const { loginScreen, app } = estadoPDV.refs;
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

    estadoPDV.currentUser = {
      ...user,
      perfil,
      cargo_nome: permissoesInfo?.cargo_nome,
      permissoes: permissoes,
      is_admin: isAdmin
    };
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = perfil.nome;

    loginScreen?.classList.add('hidden');
    app?.classList.remove('hidden');

    estadoPDV.fn.atualizarModoConexaoCarrinho?.();
    await estadoPDV.fn.atualizarContadorFilaOffline?.();
    await loadInitialData();
    estadoPDV.fn.setupRealtime?.();
    estadoPDV.fn.processarFilaOffline?.();
  }

  async function checkSession() {
    const { loginScreen, app } = estadoPDV.refs;
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data && data.session) {
      await loadProfile(data.session.user);
    } else {
      if (loginScreen) loginScreen.classList.remove('hidden');
      if (app) app.classList.add('hidden');
    }
  }

  async function loadConfiguracoes() {
    try {
      if (window.cafeteriaDB && window.cafeteriaDB.settings) {
        const settings = await window.cafeteriaDB.settings.all();
        if (settings && settings.taxa_servico_ativa !== undefined) {
          estadoPDV.configTaxaServico.ativa = String(settings.taxa_servico_ativa) === 'true';
          estadoPDV.configTaxaServico.percentual = parseFloat(settings.taxa_servico_percentual) || 10;
        }
      } else if (window.cafeteriaSupabase) {
        const { data } = await window.cafeteriaSupabase.from('site_settings').select('*');
        if (data) {
          const map = data.reduce((acc, curr) => { acc[curr.key] = curr.value; return acc; }, {});
          if (map.taxa_servico_ativa !== undefined) {
            estadoPDV.configTaxaServico.ativa = String(map.taxa_servico_ativa) === 'true';
            estadoPDV.configTaxaServico.percentual = parseFloat(map.taxa_servico_percentual) || 10;
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações de taxa:', e);
    }
  }

  const { loginForm, loginError, btnLogout, navBtnNovo, navBtnMesas } = estadoPDV.refs;

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-pass').value;
      const btn = document.getElementById('login-btn');

      btn.disabled = true;
      btn.textContent = 'Autenticando...';
      if (loginError) loginError.textContent = '';

      const { data, error } = await window.cafeteriaSupabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (loginError) loginError.textContent = 'E-mail ou senha incorretos.';
        btn.disabled = false;
        btn.textContent = 'Entrar';
        return;
      }

      await loadProfile(data.user);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await window.cafeteriaSupabase.auth.signOut();
      window.location.reload();
    });
  }

  if (navBtnNovo) navBtnNovo.addEventListener('click', () => switchTab('novo'));
  if (navBtnMesas) navBtnMesas.addEventListener('click', () => switchTab('mesas'));

  // CAF-000117: Delegação de eventos centralizada para eliminar onclicks inline e atender CSP sem unsafe-inline
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btn-abrir-cadastro-cliente')) {
      if (typeof window.baristaAbrirCadastroCliente === 'function') {
        window.baristaAbrirCadastroCliente();
      }
      return;
    }

    const btnObsSugestao = event.target.closest('[data-obs-sugestao]');
    if (btnObsSugestao) {
      const input = document.getElementById('modal-montagem-obs');
      if (input) {
        input.value += btnObsSugestao.getAttribute('data-obs-sugestao');
      }
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');
    switch (action) {
      case 'barista-retry-offline': {
        const id = actionEl.getAttribute('data-client-id');
        if (id && typeof window.baristaReenviarPedidoOffline === 'function') window.baristaReenviarPedidoOffline(id);
        break;
      }
      case 'barista-discard-offline': {
        const id = actionEl.getAttribute('data-client-id');
        if (id && typeof window.baristaDescartarPedidoOffline === 'function') window.baristaDescartarPedidoOffline(id);
        break;
      }
      case 'barista-open-obs': {
        const idx = Number(actionEl.getAttribute('data-index'));
        if (!isNaN(idx) && typeof window.baristaOpenObs === 'function') window.baristaOpenObs(idx);
        break;
      }
      case 'barista-update-qty': {
        const idx = Number(actionEl.getAttribute('data-index'));
        const delta = Number(actionEl.getAttribute('data-delta'));
        if (!isNaN(idx) && !isNaN(delta) && typeof window.baristaUpdateQty === 'function') window.baristaUpdateQty(idx, delta);
        break;
      }
      case 'barista-toggle-prioridade': {
        const id = Number(actionEl.getAttribute('data-pedido-id'));
        if (!isNaN(id) && typeof window.baristaTogglePrioridade === 'function') window.baristaTogglePrioridade(id);
        break;
      }
      case 'barista-whatsapp-pronto': {
        const id = Number(actionEl.getAttribute('data-pedido-id'));
        if (!isNaN(id) && typeof window.baristaAvisarWhatsAppPronto === 'function') window.baristaAvisarWhatsAppPronto(id);
        break;
      }
      case 'barista-nao-retirado': {
        const id = Number(actionEl.getAttribute('data-pedido-id'));
        if (!isNaN(id) && typeof window.baristaMarcarNaoRetirado === 'function') window.baristaMarcarNaoRetirado(id);
        break;
      }
      case 'barista-receber-totem': {
        const id = Number(actionEl.getAttribute('data-pedido-id'));
        if (!isNaN(id) && typeof window.baristaReceberPedidoTotem === 'function') window.baristaReceberPedidoTotem(id);
        break;
      }
      case 'barista-marcar-entregue': {
        const id = Number(actionEl.getAttribute('data-pedido-id'));
        if (!isNaN(id) && typeof window.baristaMarcarEntregue === 'function') window.baristaMarcarEntregue(id);
        break;
      }
      case 'barista-lancar-cortesia': {
        const pId = Number(actionEl.getAttribute('data-pedido-id'));
        const itId = Number(actionEl.getAttribute('data-item-id'));
        const prodId = actionEl.getAttribute('data-produto-id');
        if (pId && itId && prodId && typeof window.baristaLancarCortesia === 'function') {
          window.baristaLancarCortesia(pId, itId, prodId);
        }
        break;
      }
      case 'barista-cancelar-item': {
        const itId = Number(actionEl.getAttribute('data-item-id'));
        const pId = Number(actionEl.getAttribute('data-pedido-id'));
        const mesa = actionEl.getAttribute('data-mesa-codigo');
        if (itId && pId && typeof window.baristaCancelarItem === 'function') {
          window.baristaCancelarItem(itId, pId, mesa);
        }
        break;
      }
      case 'barista-atribuir-item': {
        const pId = Number(actionEl.getAttribute('data-pedido-item-id'));
        const perc = Number(actionEl.getAttribute('data-percentual'));
        if (pId && !isNaN(perc) && typeof window.atribuirItem === 'function') {
          window.atribuirItem(pId, perc);
        }
        break;
      }
      case 'barista-selecionar-parte': {
        const parteId = Number(actionEl.getAttribute('data-parte-id'));
        if (parteId && typeof window.selecionarParte === 'function') {
          window.selecionarParte(parteId);
        }
        break;
      }
      case 'barista-mostrar-qr-pix': {
        const valor = Number(actionEl.getAttribute('data-valor'));
        const txid = actionEl.getAttribute('data-txid');
        const nome = actionEl.getAttribute('data-parte-nome');
        if (typeof window.mostrarQrPixPagamento === 'function') {
          window.mostrarQrPixPagamento(valor, txid, nome);
        }
        break;
      }
      case 'barista-remover-pagamento': {
        const pagId = Number(actionEl.getAttribute('data-pagamento-id'));
        if (pagId && typeof window.removerPagamentoFechamento === 'function') {
          window.removerPagamentoFechamento(pagId);
        }
        break;
      }
    }
  });

  definirGlobalPDV('showToast', showToast);
  definirGlobalPDV('showConfirmBottomSheet', showConfirmBottomSheet);
  definirGlobalPDV('showConfirm', showConfirm);
  definirGlobalPDV('showPromptBottomSheet', showPromptBottomSheet);
  definirGlobalPDV('showSelecionarPagamentoTotemSheet', showSelecionarPagamentoTotemSheet);
  definirGlobalPDV('baristaCheckSession', checkSession);

  estadoPDV.fn.showToast = showToast;
  estadoPDV.fn.showConfirmBottomSheet = showConfirmBottomSheet;
  estadoPDV.fn.showConfirm = showConfirm;
  estadoPDV.fn.usuarioTemPermissao = usuarioTemPermissao;
  estadoPDV.fn.pedirAutorizacaoPin = pedirAutorizacaoPin;
  estadoPDV.fn.switchTab = switchTab;
  estadoPDV.fn.loadInitialData = loadInitialData;
  estadoPDV.fn.loadProfile = loadProfile;
  estadoPDV.fn.checkSession = checkSession;
  estadoPDV.fn.loadConfiguracoes = loadConfiguracoes;
}
