/* =========================================================
   PDV — CARRINHO, RASCUNHO, MONTAGEM, DRAWER & ENVIO OTIMISTA
   ========================================================= */

import { estadoPDV, escapeHtml, definirGlobalPDV } from './estado.js';

// CAF-000057: Rascunho Persistente do Carrinho (LocalStorage)
const RASCUNHO_CARRINHO_KEY = 'cafeteria_pdv_carrinho_rascunho';
const RASCUNHO_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

export function registrarCarrinhoPDV() {
  const {
    mesaSelect,
    pedidoClienteNome,
    pedidoClienteId,
    clienteBadge,
    clienteBadgeNome,
    clienteBadgeTel,
    clienteBadgeConta,
    pedidoParaViagem,
    pedidoPrioritario,
    boxMotivoPrioridade,
    pedidoPrioridadeMotivo,
    pedidoObs,
    pedidoPagamento,
    pedidoPago,
    cartItemsContainer,
    cartTotalValue,
    mobileCartBar,
    mobileCartCount,
    mobileCartTotal,
    btnOpenMobileCart,
    btnCloseCartDrawer,
    cartPanel,
    cartBackdrop,
    btnEnviarPedido,
    modalObs,
    modalObsTitle,
    modalObsInput,
    modalObsSave,
    modalObsClose,
    modalObsCancel,
    modalMontagem,
    modalMontagemTitle,
    modalMontagemList,
    modalMontagemObs,
    modalMontagemTotal,
    modalMontagemCancel,
    modalMontagemSave,
    modalMontagemClose
  } = estadoPDV.refs;

  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);

  function salvarRascunhoCarrinho() {
    if (estadoPDV.timers.saveDraft) clearTimeout(estadoPDV.timers.saveDraft);
    estadoPDV.timers.saveDraft = setTimeout(() => {
      try {
        if (!estadoPDV.cart || estadoPDV.cart.length === 0) {
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
          pedidoEmEdicaoId: estadoPDV.pedidoEmEdicaoId || null,
          cart: estadoPDV.cart.map(item => ({
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
    if (estadoPDV.timers.saveDraft) clearTimeout(estadoPDV.timers.saveDraft);
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

      const restoredCart = [];
      rascunho.cart.forEach(rawItem => {
        const prod = estadoPDV.allProducts.find(p => p.id === rawItem.produtoId);
        if (!prod) return;

        const adicionais = (rawItem.adicionaisIds || [])
          .map(id => estadoPDV.allAdicionais.find(a => a.id === id))
          .filter(Boolean);

        const sabores = (rawItem.saboresIds || []).map(pId => {
          const sProd = estadoPDV.allProducts.find(p => p.id === pId);
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

      estadoPDV.cart = restoredCart;

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
        estadoPDV.pedidoEmEdicaoId = rascunho.pedidoEmEdicaoId;
      }

      estadoPDV.fn.updateMesaTriggerUI?.();
      renderCart();

      const totalQtd = estadoPDV.cart.reduce((acc, i) => acc + i.quantidade, 0);
      showToast(`Rascunho recuperado (${totalQtd} ${totalQtd === 1 ? 'item' : 'itens'})`, {
        tipo: 'info',
        acaoTexto: 'Limpar',
        duracaoMs: 6000,
        acaoCallback: () => {
          estadoPDV.cart = [];
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

  function updateMontagemTotal() {
    if (!estadoPDV.activeMontagemItem) return;
    let total = 0;

    if (estadoPDV.activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
      const selectDoce = document.getElementById('modal-montagem-sabor-doce');
      const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
      const optDoce = selectDoce?.options[selectDoce.selectedIndex];
      const optSalgado = selectSalgado?.options[selectSalgado.selectedIndex];

      if (optDoce && optSalgado) {
        total = (parseFloat(optDoce.dataset.preco) * 0.5) + (parseFloat(optSalgado.dataset.preco) * 0.5);
      }
    } else {
      total = Number(estadoPDV.activeMontagemItem.produto.preco);
    }

    const chks = modalMontagemList?.querySelectorAll('.chk-adicional:checked') || [];
    chks.forEach(chk => {
      total += parseFloat(chk.dataset.preco);
    });
    if (modalMontagemTotal) {
      modalMontagemTotal.textContent = `Total: R$ ${total.toFixed(2).replace('.', ',')}`;
    }
  }

  function openMontagemModal(produto) {
    estadoPDV.activeMontagemItem = {
      produto: produto,
      adicionaisSelecionados: [],
      sabores: null,
      observacoes: ''
    };

    if (modalMontagemTitle) modalMontagemTitle.textContent = produto.nome;
    if (modalMontagemObs) modalMontagemObs.value = '';

    const saboresContainer = document.getElementById('montagem-sabores-container');
    const selectDoce = document.getElementById('modal-montagem-sabor-doce');
    const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');

    if (produto.tipo_montagem === 'meio_a_meio') {
      saboresContainer?.classList.remove('hidden');

      const doces = estadoPDV.allProducts.filter(p => p.categoria_id === 'crepes-doces' && p.tipo_montagem !== 'meio_a_meio');
      const salgados = estadoPDV.allProducts.filter(p => p.categoria_id === 'crepes-salgados' && p.tipo_montagem !== 'meio_a_meio');

      if (selectDoce) {
        selectDoce.innerHTML = doces.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
        selectDoce.onchange = updateMontagemTotal;
      }
      if (selectSalgado) {
        selectSalgado.innerHTML = salgados.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (R$ ${Number(p.preco).toFixed(2).replace('.', ',')})</option>`).join('');
        selectSalgado.onchange = updateMontagemTotal;
      }
    } else {
      saboresContainer?.classList.add('hidden');
      if (selectDoce) selectDoce.innerHTML = '';
      if (selectSalgado) selectSalgado.innerHTML = '';
    }

    const adsDoProduto = estadoPDV.allVinculosProduto
      .filter(v => v.produto_id === produto.id)
      .map(v => ({ id: v.adicional_id, nome: v.nome, preco: v.preco, ordem: v.ordem }))
      .sort((a, b) => a.ordem - b.ordem);

    if (modalMontagemList) {
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

        const chks = modalMontagemList.querySelectorAll('.chk-adicional');
        chks.forEach(chk => {
          chk.addEventListener('change', updateMontagemTotal);
        });
      }
    }

    updateMontagemTotal();
    modalMontagem?.classList.remove('hidden');
  }

  function closeMontagemModal() {
    modalMontagem?.classList.add('hidden');
    estadoPDV.activeMontagemItem = null;
  }

  if (modalMontagemClose) modalMontagemClose.addEventListener('click', closeMontagemModal);
  if (modalMontagemCancel) modalMontagemCancel.addEventListener('click', closeMontagemModal);
  if (modalMontagemSave) {
    modalMontagemSave.addEventListener('click', () => {
      if (!estadoPDV.activeMontagemItem) return;

      const chks = modalMontagemList?.querySelectorAll('.chk-adicional:checked') || [];
      estadoPDV.activeMontagemItem.adicionaisSelecionados = Array.from(chks).map(chk => ({
        id: chk.value,
        nome: chk.dataset.nome,
        preco: parseFloat(chk.dataset.preco)
      }));

      if (estadoPDV.activeMontagemItem.produto.tipo_montagem === 'meio_a_meio') {
        const selectDoce = document.getElementById('modal-montagem-sabor-doce');
        const selectSalgado = document.getElementById('modal-montagem-sabor-salgado');
        estadoPDV.activeMontagemItem.sabores = [
          { lado: 'doce', produto_id: selectDoce.value },
          { lado: 'salgado', produto_id: selectSalgado.value }
        ];
      }

      estadoPDV.activeMontagemItem.observacoes = escapeHtml((modalMontagemObs?.value || '').trim());

      addToCartFromMontagem(estadoPDV.activeMontagemItem);
      closeMontagemModal();
    });
  }

  function addToCartFromMontagem(item) {
    const hasAdicionais = item.adicionaisSelecionados.length > 0;
    const hasObs = item.observacoes.length > 0;

    let existingIndex = -1;

    if (!hasAdicionais && !hasObs && (!item.sabores || item.sabores.length === 0)) {
      existingIndex = estadoPDV.cart.findIndex(c => c.produto.id === item.produto.id && c.adicionaisSelecionados.length === 0 && !c.observacoes && (!c.sabores || c.sabores.length === 0));
    }

    if (existingIndex > -1) {
      estadoPDV.cart[existingIndex].quantidade += 1;
    } else {
      estadoPDV.cart.push({
        produto: item.produto,
        quantidade: 1,
        observacoes: item.observacoes,
        adicionaisSelecionados: item.adicionaisSelecionados,
        sabores: item.sabores,
        cortesia_de_item_index: item.cortesia_de_item_index
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
    if (!estadoPDV.cart[index]) return;

    if (delta === -999) {
      const removedItem = estadoPDV.cart.splice(index, 1)[0];
      renderCart();
      const nomeItem = removedItem.produto?.nome || 'Item';
      showToast(`"${nomeItem}" removido do carrinho`, {
        tipo: 'info',
        acaoTexto: 'Desfazer',
        duracaoMs: 5000,
        acaoCallback: () => {
          estadoPDV.cart.splice(index, 0, removedItem);
          renderCart();
        }
      });
      return;
    }

    estadoPDV.cart[index].quantidade += delta;
    if (estadoPDV.cart[index].quantidade <= 0) {
      const removedItem = estadoPDV.cart.splice(index, 1)[0];
      renderCart();
      const nomeItem = removedItem.produto?.nome || 'Item';
      showToast(`"${nomeItem}" removido do carrinho`, {
        tipo: 'info',
        acaoTexto: 'Desfazer',
        duracaoMs: 5000,
        acaoCallback: () => {
          removedItem.quantidade = 1;
          estadoPDV.cart.splice(index, 0, removedItem);
          renderCart();
        }
      });
      return;
    }
    renderCart();
  }

  function openItemObsModal(index) {
    estadoPDV.activeObsCartIndex = index;
    const item = estadoPDV.cart[index];
    if (!item) return;

    if (modalObsTitle) modalObsTitle.textContent = `Observação: ${item.produto.nome}`;
    if (modalObsInput) modalObsInput.value = item.observacoes || '';
    modalObs?.classList.remove('hidden');
    modalObsInput?.focus();
  }

  function closeItemObsModal() {
    modalObs?.classList.add('hidden');
    estadoPDV.activeObsCartIndex = null;
  }

  if (modalObsSave) {
    modalObsSave.addEventListener('click', () => {
      if (estadoPDV.activeObsCartIndex !== null && estadoPDV.cart[estadoPDV.activeObsCartIndex]) {
        estadoPDV.cart[estadoPDV.activeObsCartIndex].observacoes = escapeHtml((modalObsInput?.value || '').trim());
        renderCart();
      }
      closeItemObsModal();
    });
  }

  [modalObsClose, modalObsCancel].filter(Boolean).forEach(b => b.addEventListener('click', closeItemObsModal));

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

  if (cartPanel) {
    cartPanel.addEventListener('touchstart', e => {
      const itemsContainer = e.target.closest('.cart-items');
      if (itemsContainer && itemsContainer.scrollTop > 0) return;
      estadoPDV.touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    cartPanel.addEventListener('touchmove', e => {
      if (!estadoPDV.touchStartY) return;
      const currentY = e.changedTouches[0].screenY;
      const diff = currentY - estadoPDV.touchStartY;
      if (diff > 50) {
        closeCartDrawer();
        estadoPDV.touchStartY = 0;
      }
    }, { passive: true });

    cartPanel.addEventListener('touchend', () => {
      estadoPDV.touchStartY = 0;
    });
  }

  if (btnOpenMobileCart) btnOpenMobileCart.addEventListener('click', openCartDrawer);
  if (btnCloseCartDrawer) btnCloseCartDrawer.addEventListener('click', closeCartDrawer);
  if (cartBackdrop) cartBackdrop.addEventListener('click', closeCartDrawer);

  async function atualizarPreviewPixCarrinho(totalForcado) {
    const box = document.getElementById('pix-cart-preview');
    if (!box) return;
    const total = totalForcado !== undefined ? totalForcado : estadoPDV.ultimoTotalCarrinhoCalculado;

    if (!pedidoPagamento || pedidoPagamento.value !== 'pix' || estadoPDV.cart.length === 0 || total <= 0) {
      box.classList.add('hidden');
      estadoPDV.ultimoPayloadPixCarrinho = '';
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
      estadoPDV.ultimoPayloadPixCarrinho = '';
      if (qrContainer) qrContainer.style.display = 'none';
      if (avisoSemChave) avisoSemChave.classList.remove('hidden');
    } else {
      estadoPDV.ultimoPayloadPixCarrinho = res.payload;
      if (avisoSemChave) avisoSemChave.classList.add('hidden');
      if (qrContainer) {
        qrContainer.style.display = 'flex';
        qrContainer.innerHTML = window.cafeteriaPix.gerarQrSvg(res.payload, 3, 1);
      }
    }
  }

  function checkFormValidity() {
    if (!btnEnviarPedido) return;
    const hasMesa = mesaSelect ? mesaSelect.value !== '' : false;
    const isParaViagem = pedidoParaViagem ? pedidoParaViagem.checked : false;
    const hasNome = (pedidoClienteNome && pedidoClienteNome.value.trim() !== '') || (pedidoClienteId && pedidoClienteId.value !== '');
    const hasItems = estadoPDV.cart.length > 0;

    const canSend = (hasMesa || isParaViagem || hasNome) && hasItems;
    btnEnviarPedido.disabled = !canSend;
    estadoPDV.fn.atualizarModoConexaoCarrinho?.();
  }

  function renderCart() {
    const { cart, allProducts, activePromos } = estadoPDV;
    if (!cartItemsContainer || !cartTotalValue) return;

    if (cart.length === 0) {
      document.body.classList.remove('has-cart-bar');
      cartItemsContainer.innerHTML = '<div class="cart-empty">Nenhum item adicionado.</div>';
      cartTotalValue.textContent = 'R$ 0,00';
      estadoPDV.ultimoTotalCarrinhoCalculado = 0;
      document.getElementById('pix-cart-preview')?.classList.add('hidden');
      if (mobileCartBar) mobileCartBar.classList.add('hidden');
      closeCartDrawer();
      checkFormValidity();
      estadoPDV.fn.syncProductCardsWithCart?.();
      return;
    }
    document.body.classList.add('has-cart-bar');

    cartItemsContainer.innerHTML = '';
    let total = 0;

    const groupedProduct = {};
    const groupedCategory = {};

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

    const promoLabels = {};
    const promoDiscounts = {};

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
          const gratis = Math.floor(g.qtd / promo.qtd_leva) * (promo.qtd_leva - promo.qtd_compra);
          desc = gratis * g.precoBase;
          label = `Promo: Leve ${promo.qtd_leva} Pague ${promo.qtd_compra}`;
        } else if (promo.tipo === 'segunda_unidade') {
          desc = Math.floor(g.qtd / 2) * g.precoBase * (promo.percentual / 100.0);
          label = `Promo: 2ª unid. ${promo.percentual}% off`;
        }

        if (desc > 0) {
          const targetIdx = g.indices[0];
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
          adicHtml += `<div style="font-size:12px; color:#666;">+ ${escapeHtml(ad.nome)} (R$ ${ad.preco.toFixed(2).replace('.', ',')})</div>`;
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
        saboresHtml = `<div style="font-size:12px; color:#aaa;">½ ${escapeHtml(nomeDoce)} / ½ ${escapeHtml(nomeSalgado)}</div>`;
      }

      const precoUnitario = precoBase + adicTotal;
      const subtotal = precoUnitario * item.quantidade;
      total += subtotal;

      let promoHtml = '';
      if (promoDiscounts[index]) {
        total -= promoDiscounts[index];
        promoHtml = `<div style="font-size:12px; color:#e74c3c; margin-top: 4px;">↳ ${escapeHtml(promoLabels[index])} (- R$ ${promoDiscounts[index].toFixed(2).replace('.', ',')})</div>`;
      }

      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.produto.nome)}</div>
            ${saboresHtml}
            <div class="cart-item-price">R$ ${precoUnitario.toFixed(2).replace('.', ',')}</div>
            ${adicHtml}
            <div class="cart-item-obs-box"></div>
            ${promoHtml}
          </div>
          <div class="cart-item-actions">
            <button class="cart-btn obs-btn" title="Adicionar/Editar Observação" data-action="barista-open-obs" data-index="${index}">
              ${item.observacoes ? 'Editar obs' : '+ Obs'}
            </button>
            <button class="cart-btn" data-action="barista-update-qty" data-index="${index}" data-delta="-1">-</button>
            <span class="cart-qty">${Number(item.quantidade)}</span>
            <button class="cart-btn" data-action="barista-update-qty" data-index="${index}" data-delta="1">+</button>
            <button class="cart-btn remove" data-action="barista-update-qty" data-index="${index}" data-delta="-999">🗑</button>
          </div>
        </div>
      `;

      if (item.observacoes) {
        const obsEl = document.createElement('div');
        obsEl.className = 'cart-item-obs';
        obsEl.textContent = `↳ Obs: ${item.observacoes}`;
        div.querySelector('.cart-item-obs-box')?.appendChild(obsEl);
      }

      cartItemsContainer.appendChild(div);
    });

    cartTotalValue.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    estadoPDV.ultimoTotalCarrinhoCalculado = total;
    atualizarPreviewPixCarrinho(total);

    const totalItens = cart.reduce((acc, item) => acc + item.quantidade, 0);
    if (mobileCartCount) mobileCartCount.textContent = `${totalItens} ${totalItens === 1 ? 'item' : 'itens'}`;
    if (mobileCartTotal) mobileCartTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    if (mobileCartBar) mobileCartBar.classList.remove('hidden');

    checkFormValidity();
    salvarRascunhoCarrinho();
    estadoPDV.fn.syncProductCardsWithCart?.();
  }

  document.getElementById('btn-pix-cart-copiar')?.addEventListener('click', function () {
    if (!estadoPDV.ultimoPayloadPixCarrinho) {
      showToast('Configure a chave Pix no Admin primeiro.', 'warn');
      return;
    }
    window.cafeteriaPix?.copiarCodigoPix(estadoPDV.ultimoPayloadPixCarrinho, this);
    showToast('Código Pix Copia e Cola copiado!', 'success');
  });

  document.getElementById('btn-pix-cart-fullscreen')?.addEventListener('click', () => {
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: estadoPDV.ultimoTotalCarrinhoCalculado,
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

  // ENVIO OTIMISTA & FILA OFFLINE - CAF-000059 / CAF-000060
  if (btnEnviarPedido) {
    btnEnviarPedido.addEventListener('click', () => {
      if (btnEnviarPedido.dataset.sending === 'true') return;

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

      if (!estadoPDV.cart || estadoPDV.cart.length === 0) {
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
        if (estadoPDV.selectedClienteObj && estadoPDV.selectedClienteObj.conta_habilitada === false) {
          showToast('A conta corrente deste cliente não está habilitada para fiado/créditos.', 'error');
          return;
        }
        if (!navigator.onLine || !estadoPDV.isPdvOnline) {
          showToast('Pagamento na conta corrente requer conexão ativa com a internet.', 'error');
          return;
        }
      }

      const total = estadoPDV.cart.reduce((acc, item) => acc + (item.produto.preco * item.quantidade), 0);

      const clientId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });

      const itensParaRpc = estadoPDV.cart.map(item => ({
        produto_id: item.produto.id,
        quantidade: item.quantidade,
        observacoes: item.observacoes || null,
        adicionais: (item.adicionaisSelecionados || []).map(ad => ad.id),
        sabores: item.sabores || undefined,
        cortesia_de_item_index: item.cortesia_de_item_index !== undefined ? item.cortesia_de_item_index : null
      }));

      let retiradaEm = null;
      if (isIntervalo) {
        const horaInt = window.espetaculoHojeConfig?.espetaculo_horario_intervalo || '21:30';
        const hojeYmd = (window.datasSP && window.datasSP.hojeSP) ? window.datasSP.hojeSP() : new Date().toISOString().split('T')[0];
        retiradaEm = new Date(`${hojeYmd}T${horaInt}:00-03:00`).toISOString();
      }

      const { pedidoOrigemIdAdicao } = estadoPDV;
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

      const itensResumo = estadoPDV.cart.map(item => {
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
      const cartSnapshot = JSON.parse(JSON.stringify(estadoPDV.cart));
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

      // 1. OTIMISMO TOTAL: FECHA E LIBERA CARRINHO IMEDIATAMENTE
      closeCartDrawer();

      estadoPDV.cart = [];
      limparRascunhoCarrinho();
      estadoPDV.selectedClienteObj = null;
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
      estadoPDV.fn.resetarModoAdicao?.();
      mesaSelect.value = '';
      renderCart();
      checkFormValidity();
      estadoPDV.fn.atualizarModoConexaoCarrinho?.();

      if (navigator.vibrate) navigator.vibrate(20);
      showToast(`Enviando pedido da ${mesaIdentificador}...`, 'info');

      // 2. DISPARO EM SEGUNDO PLANO
      (async () => {
        if (!navigator.onLine || !estadoPDV.isPdvOnline) {
          await estadoPDV.fn.dbSalvarPedidoOffline?.(offlineOrderData);
          await estadoPDV.fn.atualizarContadorFilaOffline?.();
          showToast(`⚡ Pedido da ${mesaIdentificador} guardado na fila offline! Será enviado automaticamente.`, 'info');
          return;
        }

        try {
          const { error: pedidoError } = await window.cafeteriaSupabase.rpc('criar_pedido', {
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
              await estadoPDV.fn.dbSalvarPedidoOffline?.(offlineOrderData);
              await estadoPDV.fn.atualizarContadorFilaOffline?.();
              showToast(`⚠️ Conexão oscilou. Pedido da ${mesaIdentificador} guardado na fila offline!`, 'warning');
              return;
            }

            showToast(`Erro ao registrar pedido da ${mesaIdentificador}: ${pedidoError.message}`, {
              tipo: 'error',
              acaoTexto: 'Restaurar',
              acaoCallback: () => {
                estadoPDV.cart = cartSnapshot;
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
                estadoPDV.fn.atualizarModoConexaoCarrinho?.();
                openCartDrawer();
                showToast('Carrinho restaurado para ajustes!', { tipo: 'info' });
              },
              duracaoMs: 8000
            });
            return;
          }

          if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
          showToast(`✓ Pedido da ${mesaIdentificador} enviado à cozinha com sucesso!`, 'success');
          await Promise.all([
            estadoPDV.fn.loadActivePedidos?.(),
            estadoPDV.fn.loadMesas?.()
          ]);
        } catch (err) {
          console.error('[PDV Enviar Otimista] Exceção:', err);
          await estadoPDV.fn.dbSalvarPedidoOffline?.(offlineOrderData);
          await estadoPDV.fn.atualizarContadorFilaOffline?.();
          showToast(`⚠️ Falha de comunicação. Pedido da ${mesaIdentificador} guardado na fila offline!`, 'warning');
        }
      })();
    });
  }

  definirGlobalPDV('baristaUpdateQty', updateQuantity);
  definirGlobalPDV('baristaOpenObs', openItemObsModal);
  definirGlobalPDV('baristaLimparCarrinho', function () {
    estadoPDV.cart = [];
    limparRascunhoCarrinho();
    renderCart();
  });

  estadoPDV.fn.salvarRascunhoCarrinho = salvarRascunhoCarrinho;
  estadoPDV.fn.limparRascunhoCarrinho = limparRascunhoCarrinho;
  estadoPDV.fn.restaurarRascunhoCarrinho = restaurarRascunhoCarrinho;
  estadoPDV.fn.openMontagemModal = openMontagemModal;
  estadoPDV.fn.closeMontagemModal = closeMontagemModal;
  estadoPDV.fn.updateMontagemTotal = updateMontagemTotal;
  estadoPDV.fn.addToCartFromMontagem = addToCartFromMontagem;
  estadoPDV.fn.updateQuantity = updateQuantity;
  estadoPDV.fn.openItemObsModal = openItemObsModal;
  estadoPDV.fn.openCartDrawer = openCartDrawer;
  estadoPDV.fn.closeCartDrawer = closeCartDrawer;
  estadoPDV.fn.renderCart = renderCart;
  estadoPDV.fn.atualizarPreviewPixCarrinho = atualizarPreviewPixCarrinho;
  estadoPDV.fn.checkFormValidity = checkFormValidity;
}
