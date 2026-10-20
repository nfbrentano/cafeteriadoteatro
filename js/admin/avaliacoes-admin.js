/* =========================================================
   ADMIN/AVALIACOES-ADMIN.JS — Gestão de Avaliações (CAF-000042)
   ========================================================= */

(function () {
  'use strict';

  let avaliacoesCache = [];
  let itensAvaliadosCache = [];
  let listenersBound = false;

  const ORIGEM_LABELS = {
    cupom: '🧾 Cupom',
    qr_mesa: '🪑 QR Mesa',
    online: '🛍️ Online',
    totem: '🖥️ Totem'
  };

  function renderStarsHtml(score) {
    const n = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
    const color = n <= 2 ? '#ef4444' : n === 3 ? '#f59e0b' : '#eab308';
    return `<span style="color:${color}; font-weight:700; letter-spacing:1px;">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span> <strong style="font-size:12px;">(${Number(score).toFixed(1).replace('.0', '')})</strong>`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function carregarDadosAvaliacoes() {
    const sb = window.supabaseClient;
    if (!sb) return;

    const periodoVal = document.getElementById('aval-filtro-periodo')?.value || '30';
    const origemVal = document.getElementById('aval-filtro-origem')?.value || 'todas';

    let query = sb
      .from('avaliacoes')
      .select('*, pedidos(id, numero_pedido, mesa_codigo, cliente_nome, valor_total, created_at)')
      .order('created_at', { ascending: false });

    if (periodoVal !== 'todos') {
      const dias = parseInt(periodoVal, 10) || 30;
      const dtInicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', dtInicio);
    }

    if (origemVal !== 'todas') {
      query = query.eq('origem', origemVal);
    }

    const { data: avals, error } = await query;
    if (error) {
      console.error('Erro ao carregar avaliações:', error);
      return;
    }

    avaliacoesCache = avals || [];

    // Busca avaliações por item correspondentes
    const avalIds = avaliacoesCache.map(a => a.id);
    if (avalIds.length > 0) {
      const { data: itens } = await sb
        .from('avaliacao_itens')
        .select('*')
        .in('avaliacao_id', avalIds);
      itensAvaliadosCache = itens || [];
    } else {
      itensAvaliadosCache = [];
    }

    atualizarAlertasHoje();
    renderizarPainelAvaliacoes();
  }

  async function verificarAlertaAvaliacoesHoje() {
    const sb = window.supabaseClient;
    if (!sb) return;

    try {
      const inicioHoje = new Date();
      inicioHoje.setHours(0, 0, 0, 0);

      const { data: baixasHoje, error } = await sb
        .from('avaliacoes')
        .select('id, nota_produto, nota_atendimento, comentario, created_at')
        .gte('created_at', inicioHoje.toISOString())
        .or('nota_produto.lte.2,nota_atendimento.lte.2');

      if (error) return;

      const qtd = (baixasHoje || []).length;
      const badgeSidebar = document.getElementById('nav-avaliacoes-badge');
      const dashAlerta = document.getElementById('dash-alerta-avaliacoes');
      const dashTexto = document.getElementById('dash-alerta-avaliacoes-texto');
      const pageAlerta = document.getElementById('aval-alerta-hoje');
      const pageTexto = document.getElementById('aval-alerta-hoje-texto');

      if (qtd > 0) {
        const msg = qtd === 1
          ? '1 avaliação crítica (≤ 2 estrelas) recebida hoje!'
          : `${qtd} avaliações críticas (≤ 2 estrelas) recebidas hoje!`;

        if (badgeSidebar) {
          badgeSidebar.textContent = String(qtd);
          badgeSidebar.style.display = 'inline-block';
        }
        if (dashAlerta && dashTexto) {
          dashTexto.innerHTML = `<strong>Atenção:</strong> ${msg}`;
          dashAlerta.style.display = 'flex';
        }
        if (pageAlerta && pageTexto) {
          pageTexto.innerHTML = `<strong>Alerta do Dia:</strong> ${msg}`;
          pageAlerta.style.display = 'flex';
        }
      } else {
        if (badgeSidebar) badgeSidebar.style.display = 'none';
        if (dashAlerta) dashAlerta.style.display = 'none';
        if (pageAlerta) pageAlerta.style.display = 'none';
      }
    } catch (e) {
      // Silencioso caso a tabela ainda não tenha sido migrada
    }
  }

  function atualizarAlertasHoje() {
    verificarAlertaAvaliacoesHoje();
  }

  function renderizarPainelAvaliacoes() {
    const total = avaliacoesCache.length;
    const kpiProd = document.getElementById('aval-kpi-produto');
    const kpiAtend = document.getElementById('aval-kpi-atendimento');
    const kpiTotal = document.getElementById('aval-kpi-total');
    const kpiSat = document.getElementById('aval-kpi-satisfacao');

    if (kpiTotal) kpiTotal.textContent = String(total);

    if (total === 0) {
      if (kpiProd) kpiProd.textContent = '—';
      if (kpiAtend) kpiAtend.textContent = '—';
      if (kpiSat) kpiSat.textContent = '0%';
    } else {
      const somaProd = avaliacoesCache.reduce((acc, a) => acc + (Number(a.nota_produto) || 0), 0);
      const somaAtend = avaliacoesCache.reduce((acc, a) => acc + (Number(a.nota_atendimento) || 0), 0);
      const satisfeitos = avaliacoesCache.filter(a => a.nota_produto >= 4 && a.nota_atendimento >= 4).length;

      if (kpiProd) kpiProd.textContent = `${(somaProd / total).toFixed(2)} ★`;
      if (kpiAtend) kpiAtend.textContent = `${(somaAtend / total).toFixed(2)} ★`;
      if (kpiSat) kpiSat.textContent = `${Math.round((satisfeitos / total) * 100)}%`;
    }

    renderizarDistribuicao();
    renderizarRankingProdutos();
    renderizarListaComentarios();
  }

  function renderizarDistribuicao() {
    const container = document.getElementById('aval-distribuicao-bars');
    if (!container) return;

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    avaliacoesCache.forEach(a => {
      const media = Math.round(((Number(a.nota_produto) || 0) + (Number(a.nota_atendimento) || 0)) / 2);
      if (counts[media] !== undefined) counts[media]++;
    });

    const total = avaliacoesCache.length || 1;
    container.innerHTML = [5, 4, 3, 2, 1].map(star => {
      const qtd = counts[star];
      const pct = avaliacoesCache.length ? Math.round((qtd / total) * 100) : 0;
      const barColor = star >= 4 ? '#22c55e' : star === 3 ? '#f59e0b' : '#ef4444';
      return `
        <div style="display:flex; align-items:center; gap:10px; font-size:13px;">
          <span style="width:45px; font-weight:600; color:#475569;">${star} ★</span>
          <div style="flex:1; height:10px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:999px;"></div>
          </div>
          <span style="width:70px; text-align:right; color:#64748b; font-size:12px;">${qtd} (${pct}%)</span>
        </div>
      `;
    }).join('');
  }

  function renderizarRankingProdutos() {
    const tbody = document.getElementById('aval-ranking-produtos-tbody');
    if (!tbody) return;

    if (!itensAvaliadosCache.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:16px; color:#64748b;">Nenhuma avaliação individual por produto no período.</td></tr>';
      return;
    }

    const map = {};
    itensAvaliadosCache.forEach(it => {
      const key = it.produto_id || it.nome_produto;
      if (!map[key]) {
        map[key] = { nome: it.nome_produto || it.produto_id, qtd: 0, soma: 0 };
      }
      map[key].qtd += 1;
      map[key].soma += Number(it.nota) || 0;
    });

    const ranking = Object.values(map)
      .map(r => ({ ...r, media: r.soma / r.qtd }))
      .sort((a, b) => b.media - a.media || b.qtd - a.qtd);

    tbody.innerHTML = ranking.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.nome)}</strong></td>
        <td>${item.qtd} aval.</td>
        <td>${renderStarsHtml(item.media)}</td>
      </tr>
    `).join('');
  }

  function renderizarListaComentarios() {
    const tbody = document.getElementById('aval-lista-tbody');
    if (!tbody) return;

    const filtroNota = document.getElementById('aval-filtro-nota')?.value || 'todas';
    const ordem = document.getElementById('aval-ordem')?.value || 'baixas_primeiro';

    let lista = avaliacoesCache.filter(a => {
      const menorNota = Math.min(Number(a.nota_produto) || 5, Number(a.nota_atendimento) || 5);
      const media = ((Number(a.nota_produto) || 0) + (Number(a.nota_atendimento) || 0)) / 2;
      if (filtroNota === 'baixas') return menorNota <= 2;
      if (filtroNota === 'neutras') return menorNota === 3 && media < 4;
      if (filtroNota === 'altas') return media >= 4 && menorNota >= 3;
      return true;
    });

    lista.sort((a, b) => {
      if (ordem === 'baixas_primeiro') {
        const minA = Math.min(Number(a.nota_produto) || 5, Number(a.nota_atendimento) || 5);
        const minB = Math.min(Number(b.nota_produto) || 5, Number(b.nota_atendimento) || 5);
        if (minA !== minB) return minA - minB;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">Nenhuma avaliação encontrada com os filtros selecionados.</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map(a => {
      const dt = new Date(a.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const numPedido = a.pedidos?.numero_pedido || a.pedido_id;
      const clienteNome = a.pedidos?.cliente_nome || 'Cliente';
      const menorNota = Math.min(Number(a.nota_produto) || 5, Number(a.nota_atendimento) || 5);
      const rowBg = menorNota <= 2 ? 'style="background:rgba(239, 68, 68, 0.06);"' : '';

      let contatoHtml = '';
      if (a.aceita_contato && a.contato_telefone) {
        const foneLimpo = String(a.contato_telefone).replace(/\D/g, '');
        const waUrl = foneLimpo ? `https://wa.me/55${foneLimpo.replace(/^55/, '')}` : '#';
        contatoHtml = `
          <div style="margin-top:6px;">
            <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="padding:3px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
              💬 Contatar cliente (${escapeHtml(a.contato_telefone)})
            </a>
          </div>
        `;
      }

      return `
        <tr ${rowBg}>
          <td style="white-space:nowrap; font-size:12px;">${dt}</td>
          <td>
            <button type="button" class="btn btn--ghost btn--sm btn-ver-pedido-aval" data-pedido-id="${a.pedido_id}" style="padding:2px 8px; font-size:12px;">
              #${escapeHtml(numPedido)}
            </button>
            <div style="font-size:11px; color:#64748b; margin-top:2px;">${escapeHtml(clienteNome)}</div>
          </td>
          <td><span class="badge">${ORIGEM_LABELS[a.origem] || escapeHtml(a.origem)}</span></td>
          <td>${renderStarsHtml(a.nota_produto)}</td>
          <td>${renderStarsHtml(a.nota_atendimento)}</td>
          <td style="max-width:340px;">
            ${a.comentario ? `<div style="font-size:13px; line-height:1.4;">"${escapeHtml(a.comentario)}"</div>` : '<span style="color:#94a3b8; font-size:12px;">Sem comentário</span>'}
            ${contatoHtml}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-ver-pedido-aval').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.admin && typeof window.admin.navigateTo === 'function') {
          window.admin.navigateTo('pedidos');
        }
      });
    });
  }

  function bindEvents() {
    if (listenersBound) return;
    listenersBound = true;

    ['aval-filtro-periodo', 'aval-filtro-origem'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', carregarDadosAvaliacoes);
    });

    ['aval-filtro-nota', 'aval-ordem'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', renderizarListaComentarios);
    });

    const btnRefresh = document.getElementById('btn-atualizar-avaliacoes');
    if (btnRefresh) btnRefresh.addEventListener('click', carregarDadosAvaliacoes);

    const btnFiltrarBaixas = document.getElementById('btn-filtrar-baixas-hoje');
    if (btnFiltrarBaixas) {
      btnFiltrarBaixas.addEventListener('click', () => {
        const selNota = document.getElementById('aval-filtro-nota');
        if (selNota) {
          selNota.value = 'baixas';
          renderizarListaComentarios();
        }
      });
    }

    const btnDashIr = document.getElementById('btn-dash-ir-avaliacoes');
    if (btnDashIr) {
      btnDashIr.addEventListener('click', () => {
        if (window.admin && typeof window.admin.navigateTo === 'function') {
          window.admin.navigateTo('avaliacoes');
        }
      });
    }
  }

  window.initAdminAvaliacoes = function () {
    bindEvents();
    carregarDadosAvaliacoes();
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    setTimeout(verificarAlertaAvaliacoesHoje, 1500);
  });
})();
