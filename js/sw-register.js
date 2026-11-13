/**
 * SW-REGISTER.JS — Cafeteria do Teatro
 * CAF-000117 / CAF-000118: Registro do Service Worker, detecção de atualização e versionamento PWA.
 * 
 * Regras:
 * - CA04: Registro em todas as telas (Totem, Retirada, Admin, PDV, KDS, Cardápio, Avaliar, Home, 404).
 * - CA05: Exibe aviso de "Nova versão disponível — Atualizar" (toast próprio, sem dialog nativo confirm).
 * - CA06: Bloqueia recarga automática enquanto houver carrinho com itens ou fechamento de conta aberto.
 * - CA07: Disponibiliza a versão em window.APP_VERSION e renderiza no rodapé do Admin.
 */

(function () {
  'use strict';

  // 1. Inicialização de Versionamento (CA07)
  async function initAppVersion() {
    try {
      const resp = await fetch('./version.json', { cache: 'no-cache' });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.version) {
          window.APP_VERSION = data.version;
          try {
            localStorage.setItem('cafeteria_app_version', data.version);
          } catch (_) {}
        }
      }
    } catch (_) {
      // Fallback para cache local caso esteja offline
      try {
        window.APP_VERSION = localStorage.getItem('cafeteria_app_version') || 'v-prod';
      } catch (_) {
        window.APP_VERSION = 'v-prod';
      }
    }

    renderAppVersionInDom();
  }

  function renderAppVersionInDom() {
    if (!window.APP_VERSION) return;
    const versionDisplays = document.querySelectorAll('#app-version-val, [data-app-version]');
    versionDisplays.forEach((el) => {
      el.textContent = window.APP_VERSION;
    });

    window.dispatchEvent(
      new CustomEvent('app-version-ready', { detail: { version: window.APP_VERSION } })
    );
  }

  // 2. Detecção de Operação Crítica em Andamento (CA06)
  function hasActiveCriticalOperation() {
    try {
      // A. Fechamento de conta de mesa no PDV (pedidos.html)
      if (window.isFechamentoEmAndamento === true) return true;
      const modalFecharConta = document.getElementById('modal-fechar-conta') || document.getElementById('modal-fechamento');
      if (modalFecharConta && !modalFecharConta.classList.contains('hidden') && modalFecharConta.style.display !== 'none') {
        return true;
      }

      // B. Itens no carrinho do PDV (pedidos.html)
      if (typeof window.temItensNoCarrinho === 'function' && window.temItensNoCarrinho()) {
        return true;
      }
      if (Array.isArray(window.pedidoAtualItens) && window.pedidoAtualItens.length > 0) {
        return true;
      }
      const cartItemsEl = document.getElementById('cart-items');
      if (cartItemsEl && cartItemsEl.querySelector('.cart-item, [data-cart-item]')) {
        return true;
      }

      // C. Itens no carrinho do Totem (totem.html)
      if (Array.isArray(window.totemCarrinho) && window.totemCarrinho.length > 0) {
        return true;
      }
      const totemCart = document.getElementById('totem-cart-items') || document.getElementById('totem-carrinho-lista');
      if (totemCart && totemCart.children && totemCart.children.length > 0 && !totemCart.querySelector('.empty-state, .totem-empty-cart')) {
        return true;
      }

      // D. Itens no carrinho do cliente no Cardápio (cardapio.html)
      if (Array.isArray(window.cardapioClienteCarrinho) && window.cardapioClienteCarrinho.length > 0) {
        return true;
      }
      const cardapioCart = document.getElementById('cardapio-cart-items');
      if (cardapioCart && cardapioCart.children && cardapioCart.children.length > 0) {
        return true;
      }
    } catch (e) {
      console.warn('[SW Register] Erro ao checar operação ativa:', e);
    }
    return false;
  }

  // 3. Notificação Amigável de Nova Versão (CA05 / CA06)
  function showUpdateToast(worker) {
    if (document.getElementById('sw-update-toast')) return;

    const toast = document.createElement('div');
    toast.id = 'sw-update-toast';
    toast.className = 'sw-update-toast';
    toast.setAttribute('role', 'alert');

    // Estilos inline isolados para garantir renderização consistente em qualquer tela
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '99999';
    toast.style.background = '#1e293b';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.35)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    toast.style.fontSize = '14px';
    toast.style.border = '1px solid #334155';

    toast.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:18px;">🚀</span>
        <span><strong>Nova versão disponível</strong></span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button type="button" id="btn-sw-atualizar" style="background:#22c55e; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:700; cursor:pointer; font-size:13px;">
          Atualizar
        </button>
        <button type="button" id="btn-sw-dispensar" aria-label="Dispensar aviso" style="background:transparent; color:#94a3b8; border:none; padding:4px 8px; cursor:pointer; font-size:16px;">
          ✕
        </button>
      </div>
    `;

    document.body.appendChild(toast);

    const btnAtualizar = document.getElementById('btn-sw-atualizar');
    const btnDispensar = document.getElementById('btn-sw-dispensar');

    if (btnAtualizar) {
      btnAtualizar.addEventListener('click', () => {
        btnAtualizar.disabled = true;
        btnAtualizar.textContent = 'Atualizando...';
        if (worker) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
        // Se após 800ms não disparar controllerchange, recarrega forçadamente
        setTimeout(() => {
          window.location.reload();
        }, 800);
      });
    }

    if (btnDispensar) {
      btnDispensar.addEventListener('click', () => {
        toast.remove();
      });
    }
  }

  // 4. Registro e Ciclo de Vida do Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      initAppVersion();

      navigator.serviceWorker
        .register('./sw.js')
        .then((registration) => {
          // Se já houver um worker aguardando ativação
          if (registration.waiting) {
            showUpdateToast(registration.waiting);
            return;
          }

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Nova versão instalada e pronta
                showUpdateToast(newWorker);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[SW Register] Falha ao registrar Service Worker:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        // Se houver pedido ou fechamento em andamento, suspende recarga arbitrária (CA06)
        if (hasActiveCriticalOperation()) {
          console.log('[SW Register] Recarga automática evitada devido a operação crítica ativa.');
          return;
        }
        refreshing = true;
        window.location.reload();
      });
    });
  } else {
    // Mesmo sem suporte a SW, executa inicialização de versão
    window.addEventListener('DOMContentLoaded', initAppVersion);
  }

  // Expor utilitários para integração e testes automatizados
  window.__swRegister = {
    initAppVersion,
    renderAppVersionInDom,
    hasActiveCriticalOperation,
    showUpdateToast
  };
})();
