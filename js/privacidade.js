/**
 * js/privacidade.js
 * CAF-000132: Lógica da Página de Política de Privacidade e Canal do Titular LGPD
 */

(function () {
  'use strict';

  function init() {
    const anoEl = document.getElementById('ano-footer');
    if (anoEl) {
      anoEl.textContent = new Date().getFullYear();
    }

    const btnCookies = document.getElementById('btn-abrir-cookies');
    if (btnCookies) {
      btnCookies.addEventListener('click', () => {
        if (typeof window.abrirPreferenciasPrivacidade === 'function') {
          window.abrirPreferenciasPrivacidade();
        }
      });
    }

    const form = document.getElementById('form-canal-titular');
    const feedbackEl = document.getElementById('titular-feedback');
    const btnSubmit = document.getElementById('btn-enviar-titular');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = document.getElementById('titular-nome')?.value?.trim();
        const telefone = document.getElementById('titular-telefone')?.value?.trim();
        const tipo = document.getElementById('titular-tipo')?.value;
        const motivo = document.getElementById('titular-motivo')?.value?.trim();

        if (!nome || !telefone || !tipo) {
          mostrarFeedback('Por favor, preencha todos os campos obrigatórios (*).', 'erro');
          return;
        }

        const digits = telefone.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 13) {
          mostrarFeedback('Por favor, informe um WhatsApp válido com DDD (ex: 51 99999-9999).', 'erro');
          return;
        }

        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.textContent = 'Registrando...';
        }

        try {
          if (!window.cafeteriaDB?.titular?.solicitar) {
            throw new Error('Serviço de atendimento LGPD temporariamente indisponível.');
          }

          const res = await window.cafeteriaDB.titular.solicitar({
            nome,
            telefone,
            tipo,
            motivo
          });

          if (res && res.sucesso) {
            mostrarFeedback(`✅ ${res.mensagem || 'Solicitação registrada com sucesso!'} Protocolo: <strong>${res.protocolo || 'LGPD-CONFIRMADO'}</strong>`, 'sucesso');
            form.reset();
          } else {
            mostrarFeedback(res?.mensagem || 'Não foi possível registrar sua solicitação. Tente novamente mais tarde.', 'erro');
          }
        } catch (err) {
          console.error('[Privacidade][CanalTitular]', err);
          mostrarFeedback(err.message || 'Erro ao comunicar com o servidor. Tente novamente.', 'erro');
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Registrar Solicitação';
          }
        }
      });
    }

    function mostrarFeedback(mensagem, tipo) {
      if (!feedbackEl) return;
      feedbackEl.className = `feedback-box ${tipo}`;
      feedbackEl.innerHTML = mensagem;
      feedbackEl.classList.remove('hidden');
      feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
