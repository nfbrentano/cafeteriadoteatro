/* =========================================================
   AVALIAR.JS — Avaliação de Pedido e Atendimento (CAF-000042)
   ========================================================= */

(function () {
  'use strict';

  const state = {
    token: null,
    nota_produto: 0,
    nota_atendimento: 0,
    notas_itens: {}, // produto_id -> { nome_produto, nota }
    googleUrl: 'https://g.page/r/Cbcr-OkxGJmNEBM/review'
  };

  const els = {
    badge: document.getElementById('eval-order-badge'),
    loading: document.getElementById('state-loading'),
    messageBox: document.getElementById('state-message'),
    msgIcon: document.getElementById('msg-icon'),
    msgTitle: document.getElementById('msg-title'),
    msgText: document.getElementById('msg-text'),
    form: document.getElementById('eval-form'),
    error: document.getElementById('eval-error'),
    itemsWrap: document.getElementById('eval-items-wrap'),
    itemsList: document.getElementById('eval-items-list'),
    lowScoreBox: document.getElementById('low-score-contact'),
    telefone: document.getElementById('eval-telefone'),
    aceitaContato: document.getElementById('eval-aceita-contato'),
    comentario: document.getElementById('eval-comentario'),
    charCount: document.getElementById('eval-char-count'),
    submitBtn: document.getElementById('btn-submit-eval'),
    successBox: document.getElementById('state-success'),
    googleInviteBox: document.getElementById('google-invite-box'),
    googleBtn: document.getElementById('btn-google-review')
  };

  function showMessage(icon, title, text) {
    els.loading.classList.add('hidden');
    els.form.classList.add('hidden');
    els.successBox.classList.add('hidden');
    els.msgIcon.textContent = icon;
    els.msgTitle.textContent = title;
    els.msgText.textContent = text;
    els.messageBox.classList.remove('hidden');
  }

  function showError(msg) {
    if (!els.error) return;
    els.error.textContent = msg;
    els.error.style.display = 'block';
  }

  function hideError() {
    if (!els.error) return;
    els.error.style.display = 'none';
  }

  function checkLowScoreVisibility() {
    const p = state.nota_produto;
    const a = state.nota_atendimento;
    const hasLow = (p > 0 && p <= 2) || (a > 0 && a <= 2);
    if (hasLow) {
      els.lowScoreBox.classList.remove('hidden');
    } else {
      els.lowScoreBox.classList.add('hidden');
    }
  }

  function bindStarGroup(container, onSelect) {
    const buttons = Array.from(container.querySelectorAll('.star-btn'));
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val, 10) || 0;
        buttons.forEach(b => {
          const bVal = parseInt(b.dataset.val, 10) || 0;
          b.classList.toggle('active', bVal <= val);
        });
        onSelect(val);
      });
    });
  }

  function renderOrderItems(itens) {
    if (!Array.isArray(itens) || itens.length === 0) {
      els.itemsWrap.classList.add('hidden');
      return;
    }

    els.itemsList.innerHTML = '';
    itens.forEach(item => {
      if (!item.produto_id) return;
      const row = document.createElement('div');
      row.className = 'item-eval-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'item-eval-row__name';
      nameEl.textContent = item.nome_produto || 'Item';

      const starsWrap = document.createElement('div');
      starsWrap.className = 'stars stars--sm';
      for (let i = 1; i <= 5; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'star-btn';
        b.dataset.val = String(i);
        b.textContent = '★';
        b.setAttribute('aria-label', `${i} estrelas para ${item.nome_produto}`);
        starsWrap.appendChild(b);
      }

      bindStarGroup(starsWrap, (val) => {
        state.notas_itens[item.produto_id] = {
          produto_id: item.produto_id,
          nome_produto: item.nome_produto || 'Produto',
          nota: val
        };
      });

      row.appendChild(nameEl);
      row.appendChild(starsWrap);
      els.itemsList.appendChild(row);
    });

    els.itemsWrap.classList.remove('hidden');
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const token = (params.get('t') || params.get('token') || '').trim();

    if (!token) {
      showMessage('🔗', 'Link de avaliação inválido', 'Utilize o QR Code impresso no seu comprovante ou o botão de avaliação na tela do seu pedido.');
      return;
    }

    state.token = token;

    // Bind stars principais
    document.querySelectorAll('.stars[data-target]').forEach(group => {
      const target = group.dataset.target;
      bindStarGroup(group, (val) => {
        state[target] = val;
        hideError();
        checkLowScoreVisibility();
      });
    });

    // Contador de caracteres
    if (els.comentario && els.charCount) {
      els.comentario.addEventListener('input', () => {
        els.charCount.textContent = `${els.comentario.value.length}/500`;
      });
    }

    const sb = window.supabaseClient;
    if (!sb) {
      showMessage('⚠️', 'Serviço indisponível', 'Não foi possível conectar ao servidor no momento. Tente novamente em instantes.');
      return;
    }

    try {
      const { data, error } = await sb.rpc('consultar_pedido_avaliacao', { p_token: token });
      if (error || !data || !data.encontrado) {
        showMessage('🔍', 'Pedido não encontrado', 'Este link de avaliação é inválido ou não corresponde a um pedido ativo.');
        return;
      }

      if (data.google_review_url) {
        state.googleUrl = data.google_review_url;
        if (els.googleBtn) els.googleBtn.href = data.google_review_url;
      }

      // Exibe badge do pedido
      if (els.badge) {
        const parts = [`Pedido #${data.numero_pedido || data.pedido_id}`];
        if (data.cliente_nome) parts.push(`• Olá, ${data.cliente_nome}!`);
        els.badge.textContent = parts.join(' ');
        els.badge.classList.remove('hidden');
      }

      if (data.ja_avaliado) {
        showMessage('✅', 'Avaliação já registrada, obrigado!', 'Este pedido já foi avaliado anteriormente. Agradecemos imensamente sua participação!');
        return;
      }

      if (data.expirado) {
        showMessage('⌛', 'Prazo de avaliação encerrado', 'O link de avaliação fica disponível por até 48 horas após a realização do pedido.');
        return;
      }

      renderOrderItems(data.itens || []);
      els.loading.classList.add('hidden');
      els.form.classList.remove('hidden');
    } catch (err) {
      console.error('Erro ao consultar pedido para avaliação:', err);
      showMessage('⚠️', 'Erro ao carregar', 'Não foi possível validar o link de avaliação. Tente novamente.');
    }
  }

  if (els.form) {
    els.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      if (state.nota_produto < 1 || state.nota_atendimento < 1) {
        showError('Por favor, selecione de 1 a 5 estrelas para os Produtos e para o Atendimento.');
        return;
      }

      const telefoneVal = (els.telefone?.value || '').trim();
      const aceitaVal = Boolean(els.aceitaContato?.checked);
      if (telefoneVal && !aceitaVal && !els.lowScoreBox.classList.contains('hidden')) {
        showError('Para que possamos entrar em contato pelo telefone informado, marque a caixa de autorização.');
        return;
      }

      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Enviando...';

      try {
        const payload = {
          nota_produto: state.nota_produto,
          nota_atendimento: state.nota_atendimento,
          comentario: (els.comentario?.value || '').trim(),
          aceita_contato: aceitaVal,
          contato_telefone: aceitaVal ? telefoneVal : '',
          itens: Object.values(state.notas_itens)
        };

        const { error } = await window.supabaseClient.rpc('registrar_avaliacao', {
          p_token: state.token,
          p_payload: payload
        });

        if (error) {
          const msg = error.message || '';
          if (msg.includes('AVALIACAO_DUPLICADA')) {
            showMessage('✅', 'Avaliação já registrada, obrigado!', 'Este pedido já havia sido avaliado.');
            return;
          }
          if (msg.includes('TOKEN_EXPIRADO')) {
            showMessage('⌛', 'Prazo expirado', 'O prazo de 48 horas para avaliar este pedido expirou.');
            return;
          }
          throw error;
        }

        els.form.classList.add('hidden');
        els.successBox.classList.remove('hidden');

        // Convite para o Google quando a experiência foi boa (média >= 4 e nenhuma nota <= 2)
        const media = (state.nota_produto + state.nota_atendimento) / 2;
        if (media >= 4 && state.nota_produto >= 4 && state.nota_atendimento >= 4) {
          els.googleInviteBox.classList.remove('hidden');
        } else {
          els.googleInviteBox.classList.add('hidden');
        }
      } catch (err) {
        console.error('Erro ao registrar avaliação:', err);
        showError(err.message || 'Erro ao enviar avaliação. Tente novamente.');
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = 'Enviar Avaliação';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
