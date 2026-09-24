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
        renderRelatorio(data);
      }
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
      alert('Erro ao carregar dados do relatório.');
    } finally {
      btnGerar.disabled = false;
      btnGerar.textContent = 'Gerar';
    }
  }

  function renderRelatorio(data) {
    // 1. KPIs
    document.getElementById('relatorio-faturamento').textContent = formatarDinheiro(data.resumo?.faturamento_total || 0);
    document.getElementById('relatorio-ticket').textContent = formatarDinheiro(data.resumo?.ticket_medio || 0);
    document.getElementById('relatorio-fila').textContent = data.tempo_preparo?.media_fila_minutos ? Math.round(data.tempo_preparo.media_fila_minutos) + ' min' : '0 min';
    document.getElementById('relatorio-preparo').textContent = data.tempo_preparo?.media_preparo_minutos ? Math.round(data.tempo_preparo.media_preparo_minutos) + ' min' : '0 min';

    // 2. Charts
    renderChartHorariosHora(data.horarios_pico_hora);
    renderChartHorariosDia(data.horarios_pico_dia);
    renderChartPagamentos(data.pagamentos);

    // 3. Tables
    renderTableMaisVendidos(data.mais_vendidos);
    renderTableCortesias(data.cortesias);
    renderTablePromocoes(data.promocoes);
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
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Sem dados</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.produto_liberador_nome}</td>
        <td>${d.quantidade}</td>
        <td>${formatarDinheiro(d.valor_abonado)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderTablePromocoes(dados) {
    const tbody = document.getElementById('relatorio-promocoes');
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Sem dados</td></tr>';
      return;
    }
    dados.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.promocao_nome}</td>
        <td>${d.aplicacoes}</td>
        <td>${formatarDinheiro(d.desconto_total)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
});
