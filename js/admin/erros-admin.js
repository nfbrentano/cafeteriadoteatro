/* =========================================================
   ADMIN/ERROS-ADMIN.JS — Painel de Saúde & Observabilidade (CAF-000115)
   Monitoramento de erros de front-end e falhas de RPC em produção.
   ========================================================= */

(function () {
  'use strict';

  let resumoCache = null;
  let listenersBound = false;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatarDataHora(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  function getBadgeTipo(tipo, rpcNome) {
    if (rpcNome || tipo === 'rpc_error') {
      return `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700; padding:2px 8px; border-radius:6px; font-size:11px;">⚡ RPC: ${escapeHtml(rpcNome || 'falha')}</span>`;
    }
    if (tipo === 'unhandled_rejection') {
      return `<span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700; padding:2px 8px; border-radius:6px; font-size:11px;">⚠️ Promise Rejeitada</span>`;
    }
    return `<span class="badge" style="background:#f1f5f9; color:#475569; font-weight:700; padding:2px 8px; border-radius:6px; font-size:11px;">🐞 Erro JS</span>`;
  }

  function getBadgeContagem(total) {
    const n = Number(total) || 1;
    let bg = '#e0f2fe';
    let text = '#0369a1';
    if (n >= 10) {
      bg = '#fee2e2';
      text = '#b91c1c';
    } else if (n >= 3) {
      bg = '#fef3c7';
      text = '#b45309';
    }
    return `<span class="badge" style="background:${bg}; color:${text}; font-weight:800; padding:3px 10px; border-radius:999px; font-size:12px;">${n}x</span>`;
  }

  async function carregarResumoErros() {
    const container = document.getElementById('erros-tabela-body');
    const loadingEl = document.getElementById('erros-loading');
    const emptyEl = document.getElementById('erros-empty');

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    const periodoVal = parseInt(document.getElementById('erros-filtro-periodo')?.value || '24', 10);
    const telaVal = document.getElementById('erros-filtro-tela')?.value || 'todas';

    try {
      const db = window.cafeteriaDB;
      if (!db || !db.erros) {
        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }

      const resumo = await db.erros.obterResumo(periodoVal, telaVal === 'todas' ? null : telaVal);
      resumoCache = resumo;

      atualizarCardsKPIs(resumo);
      renderizarTabela(resumo?.grupos || []);
    } catch (err) {
      console.error('[ErrosAdmin] Falha ao carregar erros:', err);
      if (window.admin?.toast) {
        window.admin.toast('Erro', 'Não foi possível carregar os registros de observabilidade.', 'error');
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function atualizarCardsKPIs(resumo = {}) {
    const totalEl = document.getElementById('kpi-erros-total');
    const telasEl = document.getElementById('kpi-erros-telas');
    const rpcEl = document.getElementById('kpi-erros-rpcs');

    const totalErros = resumo?.total_erros || 0;
    const telasAfetadas = resumo?.telas_afetadas || 0;

    let rpcsCount = 0;
    if (Array.isArray(resumo?.grupos)) {
      rpcsCount = resumo.grupos
        .filter(g => g.rpc_nome || g.tipo === 'rpc_error')
        .reduce((acc, g) => acc + (Number(g.total_ocorrencias) || 1), 0);
    }

    if (totalEl) totalEl.textContent = String(totalErros);
    if (telasEl) telasEl.textContent = String(telasAfetadas);
    if (rpcEl) rpcEl.textContent = String(rpcsCount);
  }

  function renderizarTabela(grupos = []) {
    const tbody = document.getElementById('erros-tabela-body');
    const emptyEl = document.getElementById('erros-empty');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!Array.isArray(grupos) || grupos.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    grupos.forEach((grupo, idx) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #f1f5f9';

      const stackEscapada = escapeHtml(grupo.stack_recente || 'Sem stack disponível');
      const stackId = `stack-detalhe-${idx}`;

      tr.innerHTML = `
        <td style="padding:12px; text-align:center;">
          ${getBadgeContagem(grupo.total_ocorrencias)}
        </td>
        <td style="padding:12px; font-weight:600; color:#334155;">
          ${escapeHtml(grupo.tela || '—')}
          <div style="font-size:11px; color:#94a3b8; font-weight:400;">v${escapeHtml(grupo.versao_app || '1.0.0')}</div>
        </td>
        <td style="padding:12px;">
          ${getBadgeTipo(grupo.tipo, grupo.rpc_nome)}
        </td>
        <td style="padding:12px; max-width:420px;">
          <div style="font-weight:600; color:#1e293b; word-break:break-word;">
            ${escapeHtml(grupo.mensagem || '—')}
          </div>
          <button type="button" class="btn-toggle-stack" data-target="${stackId}" style="background:none; border:none; color:#2563eb; font-size:11px; cursor:pointer; padding:0; margin-top:4px; text-decoration:underline;">
            Ver stack trace
          </button>
          <pre id="${stackId}" style="display:none; margin:8px 0 0 0; padding:8px; background:#0f172a; color:#f8fafc; font-size:10px; border-radius:6px; max-height:160px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">${stackEscapada}</pre>
        </td>
        <td style="padding:12px; font-size:12px; color:#64748b; white-space:nowrap;">
          <div><strong>Última:</strong> ${formatarDataHora(grupo.ultima_ocorrencia)}</div>
          <div style="font-size:11px; color:#94a3b8;">Primeira: ${formatarDataHora(grupo.primeira_ocorrencia)}</div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Delegar expansão de stack trace
    tbody.querySelectorAll('.btn-toggle-stack').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const pre = document.getElementById(targetId);
        if (pre) {
          const visivel = pre.style.display !== 'none';
          pre.style.display = visivel ? 'none' : 'block';
          e.currentTarget.textContent = visivel ? 'Ver stack trace' : 'Ocultar stack trace';
        }
      });
    });
  }

  async function limparErrosAntigos() {
    if (!window.admin?.confirm) return;
    const ok = await window.admin.confirm({
      icon: '🧹',
      title: 'Limpar Logs Antigos',
      msg: 'Deseja expurgar todos os registros de erro com mais de 30 dias?',
      okLabel: 'Limpar Registros',
      okClass: 'btn--danger'
    });

    if (!ok) return;

    try {
      const removidos = await window.cafeteriaDB.erros.limparAntigos(30);
      if (window.admin?.toast) {
        window.admin.toast('Limpeza Concluída', `${removidos} registro(s) com mais de 30 dias foram removidos com sucesso.`, 'success');
      }
      await carregarResumoErros();
    } catch (err) {
      console.error('[ErrosAdmin] Erro ao limpar:', err);
      if (window.admin?.toast) {
        window.admin.toast('Erro', 'Falha ao expurgar registros antigos.', 'error');
      }
    }
  }

  function bindEvents() {
    if (listenersBound) return;

    const btnAtualizar = document.getElementById('btn-atualizar-erros');
    if (btnAtualizar) {
      btnAtualizar.addEventListener('click', () => carregarResumoErros());
    }

    const btnLimpar = document.getElementById('btn-limpar-erros-antigos');
    if (btnLimpar) {
      btnLimpar.addEventListener('click', () => limparErrosAntigos());
    }

    const filtroPeriodo = document.getElementById('erros-filtro-periodo');
    if (filtroPeriodo) {
      filtroPeriodo.addEventListener('change', () => carregarResumoErros());
    }

    const filtroTela = document.getElementById('erros-filtro-tela');
    if (filtroTela) {
      filtroTela.addEventListener('change', () => carregarResumoErros());
    }

    listenersBound = true;
  }

  function initAdminErros() {
    bindEvents();
    carregarResumoErros();
  }

  // Exportar para o escopo global
  window.initAdminErros = initAdminErros;
  window.carregarResumoErros = carregarResumoErros;
})();

