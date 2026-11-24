/**
 * js/cookie-consent.js
 * CAF-000132: Banner de Consentimento de Cookies (Consent Mode v2 / LGPD)
 * - Botões Aceitar e Recusar de mesmo peso visual (WCAG 2.1 AA)
 * - Não bloqueia o conteúdo da página
 * - Sem scripts inline (compatível com CSP)
 * - Permite alteração posterior via link no rodapé
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'cafeteria_consent_analytics';

  function atualizarConsentimento(granted) {
    const status = granted ? 'granted' : 'denied';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, status);
      }
    } catch (e) {
      console.warn('Não foi possível gravar preferência de consentimento:', e);
    }

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'analytics_storage': status
      });
    }
  }

  function fecharBanner() {
    const banner = document.getElementById('cafeteria-cookie-banner');
    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(20px)';
      banner.style.transition = 'all 0.25s ease';
      setTimeout(() => banner.remove(), 260);
    }
  }

  function renderizarBanner() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('cafeteria-cookie-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'cafeteria-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Consentimento de Cookies e Privacidade');
    banner.className = 'cookie-banner-container';

    banner.innerHTML = `
      <div class="cookie-banner-content">
        <p class="cookie-banner-text">
          🍪 Utilizamos cookies essenciais para o funcionamento do site e métricas anônimas para aprimorar sua experiência. 
          Você pode escolher aceitar ou recusar a coleta de métricas analíticas. Saiba mais em nossa 
          <a href="/privacidade.html" target="_blank" rel="noopener" class="cookie-banner-link">Política de Privacidade</a>.
        </p>
        <div class="cookie-banner-actions">
          <button type="button" id="btn-cookie-recusar" class="cookie-banner-btn cookie-banner-btn-secondary" aria-label="Recusar cookies analíticos">
            Recusar
          </button>
          <button type="button" id="btn-cookie-aceitar" class="cookie-banner-btn cookie-banner-btn-primary" aria-label="Aceitar cookies analíticos">
            Aceitar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    const btnRecusar = document.getElementById('btn-cookie-recusar');
    const btnAceitar = document.getElementById('btn-cookie-aceitar');

    if (btnRecusar) {
      btnRecusar.addEventListener('click', () => {
        atualizarConsentimento(false);
        fecharBanner();
      });
    }

    if (btnAceitar) {
      btnAceitar.addEventListener('click', () => {
        atualizarConsentimento(true);
        fecharBanner();
      });
    }
  }

  function init() {
    function bindFooterButtons() {
      document.querySelectorAll('.btn-footer-cookie-pref').forEach(btn => {
        btn.addEventListener('click', () => {
          renderizarBanner();
        });
      });
    }

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindFooterButtons);
      } else {
        bindFooterButtons();
      }
    }

    if (typeof localStorage === 'undefined') return;
    let consentSalvo = null;
    try {
      consentSalvo = localStorage.getItem(STORAGE_KEY);
    } catch (e) {}

    if (!consentSalvo) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderizarBanner);
      } else {
        renderizarBanner();
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.abrirPreferenciasPrivacidade = function () {
      renderizarBanner();
    };

    window.cafeteriaConsent = {
      atualizarConsentimento,
      abrirPreferenciasPrivacidade: window.abrirPreferenciasPrivacidade,
      getConsentimento() {
        try {
          return localStorage.getItem(STORAGE_KEY) || 'denied';
        } catch (e) {
          return 'denied';
        }
      }
    };
  }

  init();
})();
