/**
 * js/admin/caixa-admin.js
 * Lógica para a aba Caixa do Dia no painel de administração (CAF-000015 + CAF-000044).
 * Suporta conferência cega, contagem por cédulas/moedas, cálculo estrito no banco e histórico auditável.
 */

export const CEDULAS_MOEDAS = [
  { valor: 200, label: 'R$ 200' },
  { valor: 100, label: 'R$ 100' },
  { valor: 50, label: 'R$ 50' },
  { valor: 20, label: 'R$ 20' },
  { valor: 10, label: 'R$ 10' },
  { valor: 5, label: 'R$ 5' },
  { valor: 2, label: 'R$ 2' },
  { valor: 1, label: 'R$ 1,00' },
  { valor: 0.5, label: 'R$ 0,50' },
  { valor: 0.25, label: 'R$ 0,25' },
  { valor: 0.1, label: 'R$ 0,10' },
  { valor: 0.05, label: 'R$ 0,05' }
];

export function normalizarTotaisResponse(data, caixaFallback) {
  const fundo = Number(data?.fundo_troco ?? caixaFallback?.fundo_troco ?? 0);
  const suprimentos = Number(
    data?.suprimentos ?? caixaFallback?.total_suprimentos ?? caixaFallback?.total_entradas ?? 0
  );
  const sangrias = Number(
    data?.sangrias ?? caixaFallback?.total_sangrias ?? caixaFallback?.total_saidas ?? 0
  );
  const modoCego = Boolean(data?.modo_cego);
  const conferenciaCega =
    data?.conferencia_cega !== undefined
      ? Boolean(data.conferencia_cega)
      : Boolean(caixaFallback?.conferencia_cega ?? true);
  const limiteObs = Number(
    data?.limite_diferenca_obs ?? caixaFallback?.limite_diferenca_obs ?? 5.0
  );

  const mapaVendas = {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    outros: 0,
    conta_cliente: 0
  };
  const mapaTaxas = {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    outros: 0,
    conta_cliente: 0
  };
  const mapaLiquido = {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    outros: 0,
    conta_cliente: 0
  };

  if (Array.isArray(data)) {
    data.forEach((row) => {
      const raw = row.forma || row.metodo || 'outros';
      const key =
        raw === 'credito' ? 'cartao_credito' : raw === 'debito' ? 'cartao_debito' : raw;
      if (mapaVendas[key] !== undefined) {
        const bruto = Number(row.total_vendas ?? row.total ?? 0);
        const taxa = Number(row.total_taxas ?? row.total_taxa ?? 0);
        const liq = row.total_liquido !== undefined ? Number(row.total_liquido) : bruto - taxa;
        mapaVendas[key] += bruto;
        mapaTaxas[key] += taxa;
        mapaLiquido[key] += liq;
      }
    });
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.itens)) {
      data.itens.forEach((row) => {
        const raw = row.forma || row.metodo || 'outros';
        const key =
          raw === 'credito' ? 'cartao_credito' : raw === 'debito' ? 'cartao_debito' : raw;
        if (mapaVendas[key] !== undefined) {
          const bruto = Number(row.total_vendas ?? row.total ?? 0);
          const taxa = Number(row.total_taxas ?? row.total_taxa ?? 0);
          const liq = row.total_liquido !== undefined ? Number(row.total_liquido) : bruto - taxa;
          mapaVendas[key] = bruto;
          mapaTaxas[key] = taxa;
          mapaLiquido[key] = liq;
        }
      });
    } else if (data.pagamentos && typeof data.pagamentos === 'object') {
      Object.entries(data.pagamentos).forEach(([raw, val]) => {
        const key =
          raw === 'credito' ? 'cartao_credito' : raw === 'debito' ? 'cartao_debito' : raw;
        if (mapaVendas[key] !== undefined) {
          const bruto = Number(val || 0);
          mapaVendas[key] += bruto;
          mapaLiquido[key] += bruto;
        }
      });
    }
  }

  const dinheiroEsperado =
    data?.dinheiro_esperado !== undefined && data?.dinheiro_esperado !== null
      ? Number(data.dinheiro_esperado)
      : Math.round((fundo + suprimentos - sangrias + mapaVendas.dinheiro) * 100) / 100;

  return {
    modoCego,
    conferenciaCega,
    limiteObs,
    fundo,
    suprimentos,
    sangrias,
    dinheiroEsperado,
    mapaVendas,
    mapaTaxas,
    mapaLiquido
  };
}

window.initAdminCaixa = async function () {
  const admin = window.cafeteriaAdmin;
  const supabase = window.cafeteriaSupabase;
  let currentCaixa = null;
  let ultimoResultadoFechamento = null;

  const FORMAS_OFICIAIS = [
    { codigo: 'dinheiro', label: 'Dinheiro (Gaveta)' },
    { codigo: 'pix', label: 'PIX' },
    { codigo: 'cartao_credito', label: 'Cartão de Crédito' },
    { codigo: 'cartao_debito', label: 'Cartão de Débito' },
    { codigo: 'outros', label: 'Outros' }
  ];

  const LABELS_FORMA = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartão de Crédito',
    credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito',
    debito: 'Cartão de Débito',
    outros: 'Outros',
    conta_cliente: 'Conta do Cliente (Fiado / A Receber)'
  };

  const fmt = (val) =>
    Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const fmtDateTime = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  // DOM Elements
  const divFechado = document.getElementById('caixa-estado-fechado');
  const divAberto = document.getElementById('caixa-estado-aberto');
  const btnAbrirCaixa = document.getElementById('btn-abrir-caixa');
  const btnFecharCaixaHeader = document.getElementById('btn-fechar-caixa');
  const btnHistoricoCaixas = document.getElementById('btn-historico-caixas');
  const btnAtualizarHistorico = document.getElementById('btn-atualizar-historico-caixas');
  const sectionHistorico = document.getElementById('caixa-historico-section');
  const tbodyHistorico = document.getElementById('caixa-historico-tbody');

  const statData = document.getElementById('stat-caixa-data');
  const statFundo = document.getElementById('stat-caixa-fundo');
  const statEntradas = document.getElementById('stat-caixa-entradas');
  const statSaidas = document.getElementById('stat-caixa-saidas');
  const tbodyResumo = document.getElementById('caixa-resumo-table-body');
  const badgeModoCaixa = document.getElementById('badge-modo-caixa');

  const btnSuprimento = document.getElementById('btn-suprimento');
  const btnSangria = document.getElementById('btn-sangria');

  // Inicializar grade de cédulas
  initCedulasGrid();

  // Carregar estado inicial
  await loadCaixaState();

  function initCedulasGrid() {
    const grid = document.getElementById('cedulas-grid');
    if (!grid) return;

    grid.innerHTML = CEDULAS_MOEDAS.map(
      (c) => `
      <div style="display:flex; flex-direction:column; gap:3px; background:#fff; border:1px solid var(--border); border-radius:6px; padding:6px 8px;">
        <label style="font-size:11px; font-weight:700; color:var(--text-sec);">${c.label}</label>
        <input
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          class="field__input input-cedula-qtd"
          data-valor="${c.valor}"
          placeholder="0"
          style="padding:4px 6px; font-size:13px;"
        />
      </div>
    `
    ).join('');

    grid.querySelectorAll('.input-cedula-qtd').forEach((inp) => {
      inp.addEventListener('input', recalcularCedulas);
    });

    document.getElementById('btn-limpar-cedulas')?.addEventListener('click', () => {
      grid.querySelectorAll('.input-cedula-qtd').forEach((inp) => {
        inp.value = '';
      });
      recalcularCedulas();
    });
  }

  function recalcularCedulas() {
    const grid = document.getElementById('cedulas-grid');
    const badge = document.getElementById('cedulas-soma-badge');
    if (!grid) return;

    let soma = 0;
    let temAlguma = false;
    grid.querySelectorAll('.input-cedula-qtd').forEach((inp) => {
      const qtd = parseInt(inp.value, 10) || 0;
      const val = parseFloat(inp.getAttribute('data-valor')) || 0;
      if (qtd > 0) {
        temAlguma = true;
        soma += qtd * val;
      }
    });

    soma = Math.round(soma * 100) / 100;
    if (badge) {
      badge.textContent = `Total: ${fmt(soma)}`;
    }

    const inputDinheiro = document.querySelector('.form-contado[data-forma="dinheiro"]');
    if (inputDinheiro && temAlguma) {
      inputDinheiro.value = soma.toFixed(2);
      inputDinheiro.dispatchEvent(new Event('input'));
    }
  }

  async function loadCaixaState() {
    try {
      const { data, error } = await supabase.rpc('get_caixa_atual');
      if (error) throw error;

      if (!data || data.length === 0) {
        currentCaixa = null;
        divFechado.style.display = 'block';
        divAberto.style.display = 'none';
        btnFecharCaixaHeader.style.display = 'none';
      } else {
        currentCaixa = data[0];
        divFechado.style.display = 'none';
        divAberto.style.display = 'block';
        btnFecharCaixaHeader.style.display = 'inline-flex';
        await renderCaixaAberto();
      }
    } catch (err) {
      console.error('Erro ao carregar caixa:', err);
      admin.toast('Erro', 'Não foi possível carregar o status do caixa.', 'error');
    }
  }

  async function renderCaixaAberto() {
    if (!currentCaixa) return;

    const dateObj = new Date(currentCaixa.aberto_em);
    const operadorTxt = currentCaixa.aberto_por_nome ? ` · ${currentCaixa.aberto_por_nome}` : '';
    statData.textContent = `Desde ${dateObj.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })}${operadorTxt}`;

    const suprimentosVal = Number(
      currentCaixa.total_suprimentos ?? currentCaixa.total_entradas ?? 0
    );
    const sangriasVal = Number(currentCaixa.total_sangrias ?? currentCaixa.total_saidas ?? 0);

    statFundo.textContent = fmt(currentCaixa.fundo_troco);
    statEntradas.textContent = fmt(suprimentosVal);
    statSaidas.textContent = fmt(sangriasVal);

    if (badgeModoCaixa) {
      badgeModoCaixa.style.display =
        currentCaixa.conferencia_cega !== false ? 'inline-flex' : 'none';
    }

    try {
      const { data, error } = await supabase.rpc('get_totais_caixa', {
        p_caixa_id: currentCaixa.id
      });
      if (error) throw error;

      const parsed = normalizarTotaisResponse(data, currentCaixa);
      tbodyResumo.innerHTML = '';

      if (parsed.modoCego) {
        tbodyResumo.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center; padding:18px; color:var(--text-sec);">
              🔒 <strong>Conferência Cega ativa para operadores.</strong><br>
              Os valores esperados por forma de pagamento ficam ocultos até a confirmação do fechamento de caixa.
            </td>
          </tr>
        `;
        return;
      }

      FORMAS_OFICIAIS.forEach((f) => {
        const valor = parsed.mapaVendas[f.codigo] || 0;
        const taxa = parsed.mapaTaxas[f.codigo] || 0;
        const liquido = parsed.mapaLiquido[f.codigo] !== undefined ? parsed.mapaLiquido[f.codigo] : valor - taxa;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${LABELS_FORMA[f.codigo]} (Vendas)</td>
          <td>${fmt(valor)}</td>
          <td style="color:${taxa > 0 ? '#dc2626' : 'var(--text-sec)'};">${taxa > 0 ? `- ${fmt(taxa)}` : fmt(0)}</td>
          <td style="font-weight:600; color:#15803d;">${fmt(liquido)}</td>
        `;
        tbodyResumo.appendChild(tr);
      });

      if (parsed.mapaVendas.conta_cliente > 0) {
        const trConta = document.createElement('tr');
        trConta.style.color = '#b45309';
        trConta.innerHTML = `
          <td>${LABELS_FORMA.conta_cliente}</td>
          <td>${fmt(parsed.mapaVendas.conta_cliente)}</td>
          <td>—</td>
          <td>${fmt(parsed.mapaVendas.conta_cliente)}</td>
        `;
        tbodyResumo.appendChild(trConta);
      }

      const trTotal = document.createElement('tr');
      trTotal.style.fontWeight = 'bold';
      trTotal.style.backgroundColor = 'var(--bg-card)';
      trTotal.innerHTML = `
        <td colspan="3">Dinheiro Total Esperado na Gaveta (Fundo + Suprimentos − Sangrias + Vendas em Dinheiro)</td>
        <td>${fmt(parsed.dinheiroEsperado)}</td>
      `;
      tbodyResumo.appendChild(trTotal);
    } catch (err) {
      console.error('Erro ao carregar totais do caixa:', err);
      tbodyResumo.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar totais do caixa</td></tr>';
    }
  }

  // ABRIR CAIXA
  btnAbrirCaixa?.addEventListener('click', async () => {
    const fundoInput = document.getElementById('caixa-fundo-troco').value;
    const fundo = parseFloat(fundoInput) || 0;

    btnAbrirCaixa.disabled = true;
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user.id;

      const { error } = await supabase.from('caixas').insert([
        {
          aberto_por: userId,
          fundo_troco: fundo
        }
      ]);

      if (error) throw error;

      admin.toast('Sucesso', 'Caixa aberto com sucesso!');
      await loadCaixaState();
    } catch (err) {
      console.error('Erro ao abrir caixa:', err);
      admin.toast('Erro', err.message || 'Erro ao abrir caixa', 'error');
    } finally {
      btnAbrirCaixa.disabled = false;
    }
  });

  // SANGRIA / SUPRIMENTO
  function abrirModalMovimento(tipo) {
    document.getElementById('movimento-tipo').value = tipo;
    document.getElementById('modal-movimento-caixa-title').textContent =
      tipo === 'suprimento' ? 'Novo Suprimento (Entrada)' : 'Nova Sangria (Retirada)';
    document.getElementById('form-movimento-caixa').reset();
    document.getElementById('movimento-tipo').value = tipo;
    admin.openModal('modal-movimento-caixa-overlay');
  }

  btnSuprimento?.addEventListener('click', () => abrirModalMovimento('suprimento'));
  btnSangria?.addEventListener('click', () => abrirModalMovimento('sangria'));

  document.getElementById('form-movimento-caixa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCaixa) return;

    const rawTipo = document.getElementById('movimento-tipo').value;
    const tipo =
      rawTipo === 'entrada' ? 'suprimento' : rawTipo === 'saida' ? 'sangria' : rawTipo;
    const valor = parseFloat(document.getElementById('movimento-valor').value);
    const motivo = document.getElementById('movimento-motivo').value.trim();

    if (!valor || valor <= 0) {
      admin.toast('Aviso', 'Informe um valor válido maior que zero.', 'warn');
      return;
    }

    const btnSalvar = document.getElementById('btn-salvar-movimento');
    btnSalvar.disabled = true;

    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user.id;

      const { error } = await supabase.from('caixa_movimentos').insert([
        {
          caixa_id: currentCaixa.id,
          tipo: tipo,
          valor: valor,
          motivo: motivo,
          criado_por: userId
        }
      ]);

      if (error) throw error;

      admin.toast('Sucesso', 'Movimento registrado com sucesso!');
      admin.closeModal('modal-movimento-caixa-overlay');
      await loadCaixaState();
    } catch (err) {
      console.error('Erro ao registrar movimento:', err);
      admin.toast('Erro', err.message || 'Erro ao registrar movimento', 'error');
    } finally {
      btnSalvar.disabled = false;
    }
  });

  document.getElementById('btn-salvar-movimento')?.addEventListener('click', () => {
    document.getElementById('form-movimento-caixa')?.requestSubmit();
  });

  // FECHAR CAIXA — Abrir Modal
  btnFecharCaixaHeader?.addEventListener('click', async () => {
    if (!currentCaixa) return;

    // Resetar etapas do modal
    document.getElementById('fechar-caixa-step-contagem').style.display = 'block';
    document.getElementById('fechar-caixa-step-resultado').style.display = 'none';
    document.getElementById('fechar-caixa-footer-contagem').style.display = 'flex';
    document.getElementById('fechar-caixa-footer-resultado').style.display = 'none';
    document.getElementById('modal-fechar-caixa-title').textContent = 'Fechamento de Caixa';
    document.getElementById('fechar-caixa-observacoes').value = '';
    document.getElementById('fechar-caixa-observacoes').style.borderColor = '';

    // Limpar calculadora de cédulas
    const gridCedulas = document.getElementById('cedulas-grid');
    if (gridCedulas) {
      gridCedulas.querySelectorAll('.input-cedula-qtd').forEach((inp) => {
        inp.value = '';
      });
    }
    const badgeCedulas = document.getElementById('cedulas-soma-badge');
    if (badgeCedulas) badgeCedulas.textContent = 'Total: R$ 0,00';
    const detailsCedulas = document.getElementById('detalhes-contagem-cedulas');
    if (detailsCedulas) detailsCedulas.open = false;

    // Verificar pedidos com pagamento pendente (CAF-000083 / CA05)
    const qtdMesasAbertasEl = document.getElementById('qtd-mesas-abertas');
    const alertaMesasAbertas = document.getElementById('alerta-mesas-abertas');
    const listaMesasDetalhes = document.getElementById('lista-mesas-abertas-detalhes');

    try {
      const { data: pedidosAbertos, error } = await supabase
        .from('pedidos')
        .select('id, mesa_codigo, total, created_at, cliente_nome')
        .neq('status', 'cancelado')
        .neq('status_pagamento', 'pago')
        .order('created_at', { ascending: true })
        .limit(20);

      if (!error && pedidosAbertos && pedidosAbertos.length > 0) {
        qtdMesasAbertasEl.textContent = pedidosAbertos.length;
        alertaMesasAbertas.style.display = 'flex';

        if (listaMesasDetalhes) {
          const agora = Date.now();
          let html = '<div style="margin-top: 8px; font-size: 13px; max-height: 120px; overflow-y: auto;">';
          pedidosAbertos.forEach(p => {
            const criadoEm = new Date(p.created_at).getTime();
            const min = Math.max(0, Math.floor((agora - criadoEm) / 60000));
            const tempoTxt = min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
            const mesaTxt = p.mesa_codigo ? `Mesa ${p.mesa_codigo}` : 'Balcão';
            const valTxt = Number(p.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            html += `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed #fecaca;">
              <span><strong>${mesaTxt}</strong> (${tempoTxt} aberta)</span>
              <span>${valTxt}</span>
            </div>`;
          });
          html += `<div style="margin-top: 6px;"><a href="pedidos.html" target="_blank" style="color: #b91c1c; font-weight: bold; text-decoration: underline;">👉 Abrir PDV para fechar contas</a></div>`;
          html += '</div>';
          listaMesasDetalhes.innerHTML = html;
        }
      } else {
        alertaMesasAbertas.style.display = 'none';
        if (listaMesasDetalhes) listaMesasDetalhes.innerHTML = '';
      }
    } catch (e) {
      console.error(e);
    }

    const tbody = document.getElementById('fechar-caixa-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Preparando conferência...</td></tr>';
    admin.openModal('modal-fechar-caixa-overlay');

    try {
      // Verifica se a conferência cega está ligada
      const conferenciaCega = currentCaixa.conferencia_cega !== false;
      const avisoCego = document.getElementById('fechar-caixa-aviso-cego');
      const colsSistema = document.querySelectorAll('.col-sistema-fechamento, .col-diferenca-fechamento');

      let parsed = null;
      if (!conferenciaCega) {
        const { data, error } = await supabase.rpc('get_totais_caixa', {
          p_caixa_id: currentCaixa.id
        });
        if (error) throw error;
        parsed = normalizarTotaisResponse(data, currentCaixa);
      }

      const usarModoCegoNaTela = conferenciaCega || parsed?.modoCego;
      if (avisoCego) {
        avisoCego.style.display = usarModoCegoNaTela ? 'block' : 'none';
      }
      colsSistema.forEach((col) => {
        col.style.display = usarModoCegoNaTela ? 'none' : '';
      });

      const limiteObs = Number(
        parsed?.limiteObs ?? currentCaixa.limite_diferenca_obs ?? 5.0
      );
      const labelObs = document.getElementById('label-fechar-caixa-obs');
      if (labelObs) {
        labelObs.textContent = `Observações (Obrigatório se houver diferença acima de ${fmt(limiteObs)})`;
      }

      tbody.innerHTML = '';

      FORMAS_OFICIAIS.forEach((f) => {
        const esperado = usarModoCegoNaTela
          ? null
          : f.codigo === 'dinheiro'
          ? parsed.dinheiroEsperado
          : parsed.mapaVendas[f.codigo] || 0;

        const tr = document.createElement('tr');
        if (usarModoCegoNaTela) {
          tr.innerHTML = `
            <td><strong>${f.label}</strong></td>
            <td>
              <input
                type="number"
                inputmode="decimal"
                class="field__input form-contado"
                data-forma="${f.codigo}"
                step="0.01"
                min="0"
                placeholder="0,00"
                value=""
                style="max-width: 160px; padding: 6px 10px;"
              />
            </td>
          `;
        } else {
          tr.innerHTML = `
            <td><strong>${f.label}</strong></td>
            <td>${fmt(esperado)}</td>
            <td>
              <input
                type="number"
                inputmode="decimal"
                class="field__input form-contado"
                data-forma="${f.codigo}"
                data-esperado="${esperado}"
                step="0.01"
                min="0"
                placeholder="0,00"
                value=""
                style="max-width: 140px; padding: 6px 10px;"
              />
            </td>
            <td class="td-diferenca" style="color:var(--text-sec);">Informe o valor</td>
          `;

          const input = tr.querySelector('.form-contado');
          const tdDif = tr.querySelector('.td-diferenca');
          input.addEventListener('input', () => {
            if (input.value === '') {
              tdDif.textContent = 'Informe o valor';
              tdDif.style.color = 'var(--text-sec)';
              return;
            }
            const val = parseFloat(input.value) || 0;
            const dif = Math.round((val - esperado) * 100) / 100;
            tdDif.textContent = `${dif > 0 ? '+' : ''}${fmt(dif)}`;
            tdDif.style.color =
              dif < 0 ? 'var(--danger)' : dif > 0 ? 'var(--success)' : 'inherit';
          });
        }

        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Erro ao preparar fechamento:', err);
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-danger">Erro ao preparar conferência</td></tr>';
    }
  });

  // Confirmar Fechamento de Caixa (envia apenas valores contados para cálculo no banco)
  document.getElementById('btn-confirmar-fechar-caixa')?.addEventListener('click', async () => {
    if (!currentCaixa) return;

    const inputs = document.querySelectorAll('.form-contado');
    const obsInput = document.getElementById('fechar-caixa-observacoes');
    const observacoes = obsInput.value.trim();

    const contagem = Array.from(inputs).map((inp) => ({
      forma: inp.getAttribute('data-forma'),
      valor_informado: parseFloat(inp.value) || 0
    }));

    const btnConfirmar = document.getElementById('btn-confirmar-fechar-caixa');
    btnConfirmar.disabled = true;
    const originalText = btnConfirmar.textContent;
    btnConfirmar.textContent = 'Processando...';

    try {
      const { data, error } = await supabase.rpc('fechar_caixa', {
        p_caixa_id: currentCaixa.id,
        p_valores_informados: contagem,
        p_observacoes: observacoes || null
      });

      if (error) throw error;

      ultimoResultadoFechamento = data;
      exibirResultadoFechamento(data);
      admin.toast('Sucesso', 'Caixa fechado e conferido com sucesso!');
      await loadCaixaState();
      if (sectionHistorico && sectionHistorico.style.display !== 'none') {
        await loadHistoricoCaixas();
      }
    } catch (err) {
      console.error('Erro ao fechar caixa:', err);
      if (err.message && err.message.toLowerCase().includes('observa')) {
        obsInput.style.borderColor = 'var(--danger)';
        obsInput.focus();
      }
      admin.toast('Atenção', err.message || 'Erro ao fechar o caixa.', 'error');
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = originalText;
    }
  });

  function exibirResultadoFechamento(res) {
    document.getElementById('fechar-caixa-step-contagem').style.display = 'none';
    document.getElementById('fechar-caixa-footer-contagem').style.display = 'none';
    document.getElementById('fechar-caixa-step-resultado').style.display = 'block';
    document.getElementById('fechar-caixa-footer-resultado').style.display = 'flex';
    document.getElementById('modal-fechar-caixa-title').textContent =
      'Resultado da Conferência de Caixa';

    const banner = document.getElementById('fechar-caixa-resultado-banner');
    const tbody = document.getElementById('fechar-caixa-resultado-tbody');
    const obsEl = document.getElementById('fechar-caixa-resultado-obs');

    const totalDif = Number(res?.total_diferenca || 0);
    const limiteExcedido = Boolean(res?.limite_excedido);

    if (Math.abs(totalDif) < 0.01 && !limiteExcedido) {
      banner.style.background = '#dcfce7';
      banner.style.border = '1px solid #86efac';
      banner.style.color = '#166534';
      banner.innerHTML = '✅ <strong>Caixa bateu exatamente!</strong> Nenhuma divergência encontrada.';
    } else if (limiteExcedido) {
      banner.style.background = '#fee2e2';
      banner.style.border = '1px solid #fca5a5';
      banner.style.color = '#991b1b';
      banner.innerHTML = `⚠️ <strong>Divergência acima do limite (${fmt(res.limite_diferenca_obs || 5)}):</strong> Diferença líquida total de <strong>${totalDif > 0 ? '+' : ''}${fmt(totalDif)}</strong> registrada em auditoria.`;
    } else {
      banner.style.background = '#fef3c7';
      banner.style.border = '1px solid #fde68a';
      banner.style.color = '#92400e';
      banner.innerHTML = `ℹ️ <strong>Caixa fechado com pequena diferença:</strong> Diferença líquida total de <strong>${totalDif > 0 ? '+' : ''}${fmt(totalDif)}</strong>.`;
    }

    const itensConf = Array.isArray(res?.conferencia) ? res.conferencia : [];
    tbody.innerHTML = itensConf
      .map((item) => {
        const dif = Number(item.diferenca || 0);
        const corDif =
          dif < -0.009 ? 'var(--danger)' : dif > 0.009 ? 'var(--success)' : 'inherit';
        const sinal = dif > 0.009 ? '+' : '';
        return `
          <tr>
            <td><strong>${LABELS_FORMA[item.forma] || item.forma}</strong></td>
            <td>${fmt(item.valor_sistema)}</td>
            <td>${fmt(item.valor_informado)}</td>
            <td style="font-weight:700; color:${corDif};">${sinal}${fmt(dif)}</td>
          </tr>
        `;
      })
      .join('');

    if (obsEl) {
      obsEl.innerHTML = res?.observacoes
        ? `<strong>Observações registradas:</strong> ${res.observacoes}`
        : '';
    }
  }

  document.getElementById('btn-concluir-fechar-caixa')?.addEventListener('click', () => {
    admin.closeModal('modal-fechar-caixa-overlay');
  });

  document.getElementById('btn-imprimir-resumo-caixa')?.addEventListener('click', () => {
    if (ultimoResultadoFechamento) {
      imprimirResumoCaixa(ultimoResultadoFechamento);
    }
  });

  // HISTÓRICO DE CAIXAS
  btnHistoricoCaixas?.addEventListener('click', async () => {
    if (!sectionHistorico) return;
    const isHidden = sectionHistorico.style.display === 'none';
    sectionHistorico.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      await loadHistoricoCaixas();
      sectionHistorico.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  btnAtualizarHistorico?.addEventListener('click', loadHistoricoCaixas);

  async function loadHistoricoCaixas() {
    if (!tbodyHistorico) return;
    tbodyHistorico.innerHTML =
      '<tr><td colspan="8" class="text-center">Carregando histórico de caixas...</td></tr>';

    try {
      const { data, error } = await supabase.rpc('get_historico_caixas', { p_limite: 30 });
      if (error) throw error;

      const lista = Array.isArray(data) ? data : [];
      if (lista.length === 0) {
        tbodyHistorico.innerHTML =
          '<tr><td colspan="8" class="text-center">Nenhum registro de caixa encontrado.</td></tr>';
        return;
      }

      window._historicoCaixasCache = lista;

      tbodyHistorico.innerHTML = lista
        .map((cx, idx) => {
          const isAberto = !cx.fechado_em;
          const dif = Number(cx.total_diferenca || 0);
          const corDif =
            dif < -0.009 ? 'var(--danger)' : dif > 0.009 ? 'var(--success)' : 'inherit';
          const bgRow = cx.limite_excedido ? 'background:#fff1f2;' : '';

          const detalhesFormas = Array.isArray(cx.conferencia)
            ? cx.conferencia
                .map((cf) => {
                  const d = Number(cf.diferenca || 0);
                  const dTxt =
                    Math.abs(d) > 0.009 ? ` (dif: ${d > 0 ? '+' : ''}${fmt(d)})` : '';
                  return `<span style="display:inline-block; margin-right:8px; font-size:11px;"><strong>${
                    LABELS_FORMA[cf.forma] || cf.forma
                  }:</strong> Esp ${fmt(cf.valor_sistema)} / Cont ${fmt(cf.valor_informado)}${dTxt}</span>`;
                })
                .join('<br>')
            : '-';

          return `
            <tr style="${bgRow}">
              <td style="font-size:12px;">
                <div><strong>Ab:</strong> ${fmtDateTime(cx.aberto_em)}</div>
                <div><strong>Fe:</strong> ${
                  isAberto
                    ? '<span class="status-pill status-pill--ativo">Aberto</span>'
                    : fmtDateTime(cx.fechado_em)
                }</div>
              </td>
              <td style="font-size:12px;">
                <div><strong>Ab:</strong> ${cx.aberto_por_nome || '-'}</div>
                <div><strong>Fe:</strong> ${cx.fechado_por_nome || '-'}</div>
              </td>
              <td style="font-size:12px;">
                <div>Fundo: ${fmt(cx.fundo_troco)}</div>
                <div style="color:var(--success);">+Sup: ${fmt(cx.suprimentos)}</div>
                <div style="color:var(--danger);">-San: ${fmt(cx.sangrias)}</div>
              </td>
              <td>${isAberto ? '-' : fmt(cx.total_esperado)}</td>
              <td>${isAberto ? '-' : fmt(cx.total_informado)}</td>
              <td style="font-weight:700; color:${corDif};">
                ${isAberto ? '-' : `${dif > 0.009 ? '+' : ''}${fmt(dif)}`}
                ${
                  cx.limite_excedido
                    ? '<div style="font-size:10px; color:#be123c; font-weight:700;">⚠️ Acima do limite</div>'
                    : ''
                }
              </td>
              <td style="font-size:12px; max-width:280px;">
                <div>${detalhesFormas || '-'}</div>
                ${
                  cx.observacoes
                    ? `<div style="margin-top:4px; color:#475569; font-style:italic;">Obs: ${cx.observacoes}</div>`
                    : ''
                }
              </td>
              <td>
                ${
                  !isAberto
                    ? `<button type="button" class="btn btn--ghost" style="padding:4px 8px; font-size:12px;" onclick="window.imprimirCaixaHistorico(${idx})">🖨️</button>`
                    : ''
                }
                ${
                  !isAberto && idx === 0 && (!currentCaixa || currentCaixa.status === 'fechado')
                    ? `<button type="button" class="btn btn--danger" style="padding:4px 8px; font-size:12px; margin-left:4px;" title="Reabrir Caixa" onclick="window.reabrirCaixaAdmin('${cx.id}')">🔄 Reabrir</button>`
                    : ''
                }
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      console.error('Erro ao carregar histórico de caixas:', err);
      tbodyHistorico.innerHTML =
        '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar histórico de caixas.</td></tr>';
    }
  }

  window.reabrirCaixaAdmin = async function (caixaId) {
    if (!caixaId) return;
    const motivo = prompt('Digite o motivo obrigatório para reabrir este caixa:');
    if (!motivo || motivo.trim().length < 5) {
      admin.toast('Erro', 'O motivo deve conter no mínimo 5 caracteres.', 'warning');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('reabrir_caixa', {
        p_caixa_id: caixaId,
        p_motivo: motivo.trim()
      });

      if (error) throw error;

      admin.toast('Sucesso', 'Caixa reaberto com sucesso!', 'success');
      await Promise.all([initCaixa(), loadHistoricoCaixas()]);
    } catch (err) {
      console.error('Erro ao reabrir caixa:', err);
      admin.toast('Erro', err.message || 'Falha ao reabrir caixa.', 'error');
    }
  };

  window.imprimirCaixaHistorico = function (idx) {
    const cx = window._historicoCaixasCache?.[idx];
    if (cx) {
      imprimirResumoCaixa(cx);
    }
  };

  function imprimirResumoCaixa(cx) {
    const itens = Array.isArray(cx.conferencia) ? cx.conferencia : [];
    const linhasHtml = itens
      .map((item) => {
        const dif = Number(item.diferenca || 0);
        return `
          <tr>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc;">${
              LABELS_FORMA[item.forma] || item.forma
            }</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; text-align:right;">${fmt(
              item.valor_sistema
            )}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; text-align:right;">${fmt(
              item.valor_informado
            )}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; text-align:right; font-weight:bold;">${
              dif > 0 ? '+' : ''
            }${fmt(dif)}</td>
          </tr>
        `;
      })
      .join('');

    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Fechamento de Caixa</title>
        <style>
          body { font-family: monospace; font-size: 12px; padding: 12px; max-width: 320px; margin: 0 auto; color: #000; }
          h2, h3 { text-align: center; margin: 4px 0; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 4px; }
        </style>
      </head>
      <body>
        <h2>CAFETERIA DO TEATRO</h2>
        <h3>FECHAMENTO DE CAIXA</h3>
        <div class="line"></div>
        <div><strong>Abertura:</strong> ${fmtDateTime(cx.aberto_em)} (${cx.aberto_por_nome || '-'})</div>
        <div><strong>Fechamento:</strong> ${fmtDateTime(cx.fechado_em)} (${cx.fechado_por_nome || '-'})</div>
        <div class="line"></div>
        <div>Fundo de Troco: ${fmt(cx.fundo_troco)}</div>
        <div>(+) Suprimentos: ${fmt(cx.suprimentos)}</div>
        <div>(-) Sangrias: ${fmt(cx.sangrias)}</div>
        <div class="line"></div>
        <table>
          <thead>
            <tr>
              <th>Forma</th>
              <th style="text-align:right;">Esp.</th>
              <th style="text-align:right;">Cont.</th>
              <th style="text-align:right;">Dif.</th>
            </tr>
          </thead>
          <tbody>
            ${linhasHtml}
          </tbody>
        </table>
        <div class="line"></div>
        <div style="font-weight:bold; font-size:13px;">
          Diferença Total: ${Number(cx.total_diferenca || 0) > 0 ? '+' : ''}${fmt(cx.total_diferenca)}
        </div>
        ${cx.observacoes ? `<div style="margin-top:6px;"><strong>Obs:</strong> ${cx.observacoes}</div>` : ''}
        <div class="line"></div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }
};

window.initAdminCaixa.CEDULAS_MOEDAS = CEDULAS_MOEDAS;
window.initAdminCaixa.normalizarTotaisResponse = normalizarTotaisResponse;

if (typeof globalThis !== 'undefined') {
  globalThis.initAdminCaixa = window.initAdminCaixa;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initAdminCaixa: window.initAdminCaixa,
    CEDULAS_MOEDAS,
    normalizarTotaisResponse
  };
}
