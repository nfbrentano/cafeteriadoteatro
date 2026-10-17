/**
 * js/admin/relatorios-admin.js
 * Lógica para a aba de relatórios no painel de administração.
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnNav = document.getElementById('nav-relatorios');
  const section = document.getElementById('page-relatorios');
  const btnGerar = document.getElementById('btn-gerar-relatorio');
  
  if (!btnNav || !section || !btnGerar) return;

  // Chart instances
  let chartHorariosHora = null;
  let chartHorariosDia = null;
  let chartPagamentos = null;

  // Carregar Categorias para o filtro
  carregarCategorias();

  btnGerar.addEventListener('click', carregarRelatorio);

  document.getElementById('filter-relatorio-periodo').addEventListener('change', (e) => {
    const customDiv = document.getElementById('relatorio-datas-custom');
    if (e.target.value === 'personalizado') {
      customDiv.style.display = 'flex';
    } else {
      customDiv.style.display = 'none';
    }
  });

  document.getElementById('filter-relatorio-categoria').addEventListener('change', carregarRelatorio);

  async function carregarCategorias() {
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('categorias')
        .select('id, nome')
        .order('nome');
      if (!error && data) {
        const select = document.getElementById('filter-relatorio-categoria');
        data.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.nome;
          select.appendChild(opt);
        });
      }
    } catch(err) {
      console.error('Erro ao carregar categorias', err);
    }
  }

  function formatarDinheiro(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getDates() {
    const p = document.getElementById('filter-relatorio-periodo').value;
    const now = new Date();
    let p_start, p_end;
    
    // Configura os horários limites no fuso America/Sao_Paulo localmente convertidos
    now.setHours(23,59,59,999);
    p_end = new Date(now).toISOString();

    if (p === 'hoje') {
      const start = new Date();
      start.setHours(0,0,0,0);
      p_start = start.toISOString();
    } else if (p === 'ontem') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(0,0,0,0);
      p_start = start.toISOString();
      const end = new Date(start);
      end.setHours(23,59,59,999);
      p_end = end.toISOString();
    } else if (p === '7dias') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0,0,0,0);
      p_start = start.toISOString();
    } else if (p === 'mes') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      p_start = start.toISOString();
    } else if (p === 'personalizado') {
      const s = document.getElementById('relatorio-data-inicio').value;
      const e = document.getElementById('relatorio-data-fim').value;
      if (s) p_start = new Date(s + 'T00:00:00').toISOString();
      if (e) p_end = new Date(e + 'T23:59:59').toISOString();
    }

    return { p_start, p_end };
  }

  async function carregarRelatorio() {
    const { p_start, p_end } = getDates();
    if (!p_start) return;

    btnGerar.disabled = true;
    btnGerar.textContent = 'Carregando...';

    const p_categoria_id = document.getElementById('filter-relatorio-categoria').value || null;

    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('get_admin_reports', {
        p_inicio: p_start,
        p_fim: p_end,
        p_categoria_id: p_categoria_id
      });

      if (error) throw error;
      if (data) {
        renderRelatorio(data, p_start, p_end);
      }
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
      alert('Erro ao carregar dados do relatório.');
    } finally {
      btnGerar.disabled = false;
      btnGerar.textContent = 'Gerar';
    }
  }

  let ultimosDadosMargem = [];

  function renderRelatorio(data, p_start, p_end) {
    // 1. KPIs Operacionais
    document.getElementById('relatorio-faturamento').textContent = formatarDinheiro(data.resumo?.faturamento_total || 0);
    document.getElementById('relatorio-ticket').textContent = formatarDinheiro(data.resumo?.ticket_medio || 0);
    document.getElementById('relatorio-fila').textContent = data.tempo_preparo?.media_fila_minutos ? Math.round(data.tempo_preparo.media_fila_minutos) + ' min' : '0 min';
    document.getElementById('relatorio-preparo').textContent = data.tempo_preparo?.media_preparo_minutos ? Math.round(data.tempo_preparo.media_preparo_minutos) + ' min' : '0 min';

    // 2. KPIs Financeiros e CMV (CAF-000032)
    const cmv = data.cmv_resumo || {};
    const elCmvTotal = document.getElementById('relatorio-cmv-total');
    const elCmvPct = document.getElementById('relatorio-cmv-pct');
    const elLucroBruto = document.getElementById('relatorio-lucro-bruto');
    const elMargemMedia = document.getElementById('relatorio-margem-media');
    const elCustoCortesias = document.getElementById('relatorio-custo-cortesias');

    if (elCmvTotal) elCmvTotal.textContent = formatarDinheiro(cmv.cmv_total || 0);
    if (elCmvPct) elCmvPct.textContent = `${Number(cmv.cmv_percentual || 0).toFixed(1)}%`;
    if (elLucroBruto) elLucroBruto.textContent = formatarDinheiro(cmv.lucro_bruto_total || 0);
    if (elMargemMedia) elMargemMedia.textContent = `${Number(cmv.margem_media_percentual || 0).toFixed(1)}%`;
    if (elCustoCortesias) elCustoCortesias.textContent = formatarDinheiro(cmv.custo_cortesias || 0);

    // 3. Charts
    renderChartHorariosHora(data.horarios_pico_hora || []);
    renderChartHorariosDia(data.horarios_pico_dia || []);
    renderChartPagamentos(data.pagamentos || []);

    // 4. Tables
    ultimosDadosMargem = data.margem_produtos || [];
    renderTableMargemProdutos(ultimosDadosMargem);
    renderTableMaisVendidos(data.mais_vendidos);
    renderTableCortesias(data.cortesias);
    renderTablePromocoes(data.promocoes);
    renderTableTempoCategorias(data.tempo_por_categoria);
    renderClientesRelatorio(p_start, p_end);
  }

  function renderTableMargemProdutos(dados) {
    const tbody = document.getElementById('relatorio-margem-produtos');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--admin-text-sub);">Sem produtos vendidos no período selecionado.</td></tr>';
      return;
    }

    dados.forEach(d => {
      const margem = Number(d.margem_percentual || 0);
      let badgeClass = 'badge-estoque--ok';
      if (margem < 40) badgeClass = 'badge-estoque--critico';
      else if (margem < 55) badgeClass = 'badge-estoque--alerta';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${window.escapeHtml(d.nome_produto || 'Produto')}</td>
        <td style="text-align:right;">${d.quantidade_vendida}</td>
        <td style="text-align:right;">${formatarDinheiro(d.faturamento)}</td>
        <td style="text-align:right; color:var(--admin-text-sub);">${formatarDinheiro(d.custo_total)}</td>
        <td style="text-align:right; font-weight:600; color:#10b981;">${formatarDinheiro(d.lucro_bruto)}</td>
        <td style="text-align:center;">
          <span class="badge-estoque ${badgeClass}">${margem.toFixed(1)}%</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Exportar Margens em CSV
  const btnExportMargens = document.getElementById('btn-exportar-margens-csv');
  if (btnExportMargens) {
    btnExportMargens.addEventListener('click', () => {
      if (!ultimosDadosMargem || ultimosDadosMargem.length === 0) {
        return alert('Nenhum dado para exportar no período atual.');
      }
      const headers = ['Produto', 'Quantidade Vendida', 'Faturamento', 'Custo Total', 'Lucro Bruto', 'Margem Percentual'];
      const rows = ultimosDadosMargem.map(d => [
        `"${(d.nome_produto || '').replace(/"/g, '""')}"`,
        d.quantidade_vendida,
        Number(d.faturamento || 0).toFixed(2),
        Number(d.custo_total || 0).toFixed(2),
        Number(d.lucro_bruto || 0).toFixed(2),
        `${Number(d.margem_percentual || 0).toFixed(1)}%`
      ].join(';'));

      const csvContent = [headers.join(';'), ...rows].join('\r\n');
      if (window.cafeteriaAdmin && window.cafeteriaAdmin.downloadCSV) {
        window.cafeteriaAdmin.downloadCSV(`relatorio_margens_cmv_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
      }
    });
  }

  function renderChartHorariosHora(dados) {
    const ctx = document.getElementById('chartHorariosHora').getContext('2d');
    if (chartHorariosHora) chartHorariosHora.destroy();

    const horasMap = {};
    for(let i=0; i<24; i++) horasMap[i] = 0;
    dados.forEach(d => { horasMap[d.hora] = Number(d.faturamento); });

    chartHorariosHora = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(horasMap).map(h => h.padStart(2, '0') + 'h'),
        datasets: [{
          label: 'Faturamento (R$)',
          data: Object.values(horasMap),
          backgroundColor: '#a37153'
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderChartHorariosDia(dados) {
    const ctx = document.getElementById('chartHorariosDia').getContext('2d');
    if (chartHorariosDia) chartHorariosDia.destroy();

    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const diasMap = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    dados.forEach(d => { diasMap[d.dia] = Number(d.faturamento); });

    chartHorariosDia = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dias,
        datasets: [{
          label: 'Faturamento (R$)',
          data: Object.values(diasMap),
          backgroundColor: '#9fa353'
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderChartPagamentos(dados) {
    const ctx = document.getElementById('chartPagamentos').getContext('2d');
    if (chartPagamentos) chartPagamentos.destroy();

    const labels = dados.map(d => String(d.metodo).toUpperCase());
    const valores = dados.map(d => Number(d.total));

    chartPagamentos = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: valores,
          backgroundColor: ['#a37153', '#53a38a', '#5365a3', '#a3536b', '#c2c2c2']
        }]
      },
      options: { responsive: true }
    });
  }

  function renderTableMaisVendidos(dados) {
    const tbody = document.getElementById('relatorio-mais-vendidos');
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Sem dados</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.produto_nome}</td>
        <td>${d.quantidade}</td>
        <td>${formatarDinheiro(d.faturamento)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderTableCortesias(dados) {
    const tbody = document.getElementById('relatorio-cortesias');
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${window.escapeHtml(d.prato_liberador || d.produto_liberador_nome || 'Cortesia')}</td>
        <td style="text-align:right;">${d.total_cortesias || d.quantidade || 0}</td>
        <td style="text-align:right;">${formatarDinheiro(d.valor_abonado)}</td>
        <td style="text-align:right; color:#ef4444; font-weight:600;">${formatarDinheiro(d.custo_cortesias || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderTablePromocoes(dados) {
    const tbody = document.getElementById('relatorio-promocoes');
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sem dados</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${window.escapeHtml(d.promocao_nome || 'Promoção')}</td>
        <td style="text-align:right;">${d.vezes_aplicada || d.aplicacoes || 0}</td>
        <td style="text-align:right; color:#f59e0b;">${formatarDinheiro(d.desconto_total)}</td>
        <td style="text-align:right;">${formatarDinheiro(d.faturamento || 0)}</td>
        <td style="text-align:right; color:var(--admin-text-sub);">${formatarDinheiro(d.custo_total || 0)}</td>
        <td style="text-align:right; font-weight:600; color:#10b981;">${formatarDinheiro(d.lucro_com_desconto || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderTableTempoCategorias(dados) {
    const tbody = document.getElementById('relatorio-tempo-categorias');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Sem itens finalizados no período</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      const media = Number(d.media_preparo_minutos || 0);
      const alvo = Number(d.tempo_alvo_min || 15);
      const ratio = alvo > 0 ? (media / alvo) : 0;
      
      let statusHtml = '';
      if (ratio <= 0.7) {
        statusHtml = '<span class="status-pill status-pill--ativo" style="background:#27ae60;color:#fff;">🟢 No Prazo</span>';
      } else if (ratio <= 1.0) {
        statusHtml = '<span class="status-pill" style="background:#f39c12;color:#fff;">🟡 Próximo ao Limite</span>';
      } else {
        const excesso = (media - alvo).toFixed(1);
        statusHtml = `<span class="status-pill" style="background:#e74c3c;color:#fff;">🔴 Acima da Meta (+${excesso} min)</span>`;
      }

      const icone = d.categoria_icone || '🏷️';
      const nome = d.categoria_nome || d.categoria_id;

      tr.innerHTML = `
        <td><strong>${icone} ${nome}</strong></td>
        <td>⏱️ ${alvo} min</td>
        <td><strong>${media.toFixed(1)} min</strong></td>
        <td>${statusHtml}</td>
        <td>${d.total_itens_concluidos} item(ns)</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Análise e Ranking de Clientes no Período (CAF-000033)
  async function renderClientesRelatorio(p_start, p_end) {
    const elNovos = document.getElementById('relatorio-clientes-novos');
    const elRecorrentes = document.getElementById('relatorio-clientes-recorrentes');
    const elTaxa = document.getElementById('relatorio-clientes-taxa-recorrencia');
    const tbody = document.getElementById('relatorio-ranking-clientes');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:15px;">Carregando análise de clientes...</td></tr>';

    try {
      const { data: pedidosPeriodo, error: errPeriodo } = await window.cafeteriaSupabase
        .from('pedidos')
        .select('cliente_id, cliente_nome, total, created_at')
        .not('cliente_id', 'is', null)
        .neq('status', 'cancelado')
        .gte('created_at', p_start)
        .lte('created_at', p_end);

      if (errPeriodo) throw errPeriodo;

      if (!pedidosPeriodo || pedidosPeriodo.length === 0) {
        if (elNovos) elNovos.textContent = '0';
        if (elRecorrentes) elRecorrentes.textContent = '0';
        if (elTaxa) elTaxa.textContent = '0%';
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:15px; color:#64748b;">Nenhum cliente identificado realizou pedidos no período.</td></tr>';
        return;
      }

      const clientesNoPeriodo = new Map();
      pedidosPeriodo.forEach(p => {
        const item = clientesNoPeriodo.get(p.cliente_id) || {
          cliente_id: p.cliente_id,
          nome: p.cliente_nome,
          pedidosCount: 0,
          totalGasto: 0
        };
        item.pedidosCount += 1;
        item.totalGasto += (Number(p.total) || 0);
        clientesNoPeriodo.set(p.cliente_id, item);
      });

      const clientIds = Array.from(clientesNoPeriodo.keys());

      const { data: clientesCad, error: errCad } = await window.cafeteriaSupabase
        .from('clientes')
        .select('id, nome, telefone')
        .in('id', clientIds);

      const cadMap = new Map();
      if (!errCad && clientesCad) {
        clientesCad.forEach(c => cadMap.set(c.id, c));
      }

      const { data: primeirosPedidos, error: errPrim } = await window.cafeteriaSupabase
        .from('pedidos')
        .select('cliente_id, created_at')
        .in('cliente_id', clientIds)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: true });

      const primeiroPedidoMap = new Map();
      if (!errPrim && primeirosPedidos) {
        primeirosPedidos.forEach(p => {
          if (!primeiroPedidoMap.has(p.cliente_id)) {
            primeiroPedidoMap.set(p.cliente_id, p.created_at);
          }
        });
      }

      let novosCount = 0;
      let recorrentesCount = 0;
      const pStartDate = new Date(p_start);

      clientIds.forEach(cid => {
        const prim = primeiroPedidoMap.get(cid);
        if (prim && new Date(prim) < pStartDate) {
          recorrentesCount++;
        } else {
          novosCount++;
        }
      });

      const totalIdentificados = novosCount + recorrentesCount;
      const taxaRec = totalIdentificados > 0 ? Math.round((recorrentesCount / totalIdentificados) * 100) : 0;

      if (elNovos) elNovos.textContent = novosCount;
      if (elRecorrentes) elRecorrentes.textContent = recorrentesCount;
      if (elTaxa) elTaxa.textContent = `${taxaRec}%`;

      const ranking = Array.from(clientesNoPeriodo.values())
        .sort((a, b) => b.totalGasto - a.totalGasto);

      tbody.innerHTML = '';
      ranking.forEach((item, index) => {
        const cad = cadMap.get(item.cliente_id) || {};
        const nomeFinal = cad.nome || item.nome || 'Cliente';
        const telFmt = cad.telefone ? formatarTelefoneAdmin(cad.telefone) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align:center; font-weight:bold; color:#64748b;">${index + 1}º</td>
          <td><strong>${window.escapeHtml(nomeFinal)}</strong></td>
          <td style="color:#64748b; font-size:13px;">${telFmt}</td>
          <td style="text-align:center; font-weight:600;">${item.pedidosCount}</td>
          <td style="text-align:right; font-weight:bold; color:#15803d;">${formatarDinheiro(item.totalGasto)}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.warn('[Relatorios] Erro ao carregar análise de clientes:', err);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:15px; color:#c62828;">Falha ao carregar métricas de clientes.</td></tr>';
    }
  }

  function formatarTelefoneAdmin(tel) {
    if (!tel) return '-';
    let d = String(tel).replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 10) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return tel;
  }
});
