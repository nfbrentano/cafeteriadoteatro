/**
 * js/admin/caixa-admin.js
 * Lógica para a aba Caixa do Dia no painel de administração.
 */

window.initAdminCaixa = async function() {
  const admin = window.cafeteriaAdmin;
  const supabase = window.cafeteriaSupabase;
  let currentCaixa = null;

  // DOM Elements
  const divFechado = document.getElementById('caixa-estado-fechado');
  const divAberto = document.getElementById('caixa-estado-aberto');
  const btnAbrirCaixa = document.getElementById('btn-abrir-caixa');
  const btnFecharCaixaHeader = document.getElementById('btn-fechar-caixa');
  
  const statStatus = document.getElementById('stat-caixa-status');
  const statData = document.getElementById('stat-caixa-data');
  const statFundo = document.getElementById('stat-caixa-fundo');
  const statEntradas = document.getElementById('stat-caixa-entradas');
  const statSaidas = document.getElementById('stat-caixa-saidas');
  const tbodyResumo = document.getElementById('caixa-resumo-table-body');

  const btnSuprimento = document.getElementById('btn-suprimento');
  const btnSangria = document.getElementById('btn-sangria');

  // Load state on init
  await loadCaixaState();

  async function loadCaixaState() {
    try {
      const { data, error } = await supabase.rpc('get_caixa_atual');
      
      if (error) throw error;

      if (!data || data.length === 0) {
        // No open caixa
        currentCaixa = null;
        divFechado.style.display = 'block';
        divAberto.style.display = 'none';
        btnFecharCaixaHeader.style.display = 'none';
      } else {
        // Open caixa exists
        currentCaixa = data[0];
        divFechado.style.display = 'none';
        divAberto.style.display = 'block';
        btnFecharCaixaHeader.style.display = 'block';
        renderCaixaAberto();
      }
    } catch (err) {
      console.error('Erro ao carregar caixa', err);
      admin.toast('Erro', 'Não foi possível carregar o status do caixa.', 'error');
    }
  }

  async function renderCaixaAberto() {
    if (!currentCaixa) return;

    // Format numbers
    const fmt = val => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Set header stats
    const dateObj = new Date(currentCaixa.aberto_em);
    statData.textContent = `Desde ${dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
    statFundo.textContent = fmt(currentCaixa.fundo_troco);
    statEntradas.textContent = fmt(currentCaixa.total_entradas);
    statSaidas.textContent = fmt(currentCaixa.total_saidas);

    // Fetch totals including sales
    try {
      const { data, error } = await supabase.rpc('get_totais_caixa', {
        p_caixa_id: currentCaixa.id
      });
      if (error) throw error;
      
      tbodyResumo.innerHTML = '';
      let hasData = false;

      if (data && data.length > 0) {
        // Calculate totals dynamically from orders + fundo + suprimentos - sangrias
        // The get_totais_caixa RPC returns faturamento per payment method
        
        let totalDinheiroVendas = 0;
        
        data.forEach(row => {
          if (row.metodo === 'dinheiro') {
             totalDinheiroVendas += Number(row.total);
          }
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.metodo.toUpperCase()} (Vendas)</td>
            <td>${fmt(row.total)}</td>
          `;
          tbodyResumo.appendChild(tr);
          hasData = true;
        });

        // Add row for Dinheiro Total (Fundo + Suprimento - Sangria + Vendas)
        const totalDinheiroGeral = Number(currentCaixa.fundo_troco) 
                                 + Number(currentCaixa.total_entradas) 
                                 - Number(currentCaixa.total_saidas) 
                                 + totalDinheiroVendas;
        
        const trTotal = document.createElement('tr');
        trTotal.style.fontWeight = 'bold';
        trTotal.style.backgroundColor = 'var(--bg-card)';
        trTotal.innerHTML = `
          <td>Dinheiro Total Esperado (Gaveta)</td>
          <td>${fmt(totalDinheiroGeral)}</td>
        `;
        tbodyResumo.appendChild(trTotal);

      } 
      
      if (!hasData) {
        tbodyResumo.innerHTML = '<tr><td colspan="2" class="text-center">Nenhuma venda registrada ainda.</td></tr>';
      }

    } catch (err) {
      console.error('Erro ao carregar totais', err);
      tbodyResumo.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Erro ao carregar totais</td></tr>';
    }
  }

  // EVENT LISTENERS

  // ABRIR CAIXA
  btnAbrirCaixa?.addEventListener('click', async () => {
    const fundoInput = document.getElementById('caixa-fundo-troco').value;
    const fundo = parseFloat(fundoInput) || 0;

    btnAbrirCaixa.disabled = true;
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user.id;

      const { error } = await supabase.from('caixas').insert([{
        aberto_por: userId,
        fundo_troco: fundo
      }]);
      
      if (error) throw error;
      
      admin.toast('Sucesso', 'Caixa aberto com sucesso!');
      await loadCaixaState();
    } catch (err) {
      console.error('Erro ao abrir caixa', err);
      admin.toast('Erro', err.message, 'error');
    } finally {
      btnAbrirCaixa.disabled = false;
    }
  });

  // SANGRIA / SUPRIMENTO
  function abrirModalMovimento(tipo) {
    document.getElementById('movimento-tipo').value = tipo;
    document.getElementById('modal-movimento-caixa-title').textContent = tipo === 'entrada' ? 'Novo Suprimento' : 'Nova Sangria';
    document.getElementById('form-movimento-caixa').reset();
    admin.openModal('modal-movimento-caixa-overlay');
  }

  btnSuprimento?.addEventListener('click', () => abrirModalMovimento('entrada'));
  btnSangria?.addEventListener('click', () => abrirModalMovimento('saida'));

  document.getElementById('form-movimento-caixa')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCaixa) return;

    const tipo = document.getElementById('movimento-tipo').value;
    const valor = parseFloat(document.getElementById('movimento-valor').value);
    const motivo = document.getElementById('movimento-motivo').value;

    if (!valor || valor <= 0) {
      admin.toast('Aviso', 'Valor inválido', 'warn');
      return;
    }

    const btnSalvar = document.getElementById('btn-salvar-movimento');
    btnSalvar.disabled = true;

    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user.id;

      const { error } = await supabase.from('caixa_movimentos').insert([{
        caixa_id: currentCaixa.id,
        tipo: tipo,
        valor: valor,
        motivo: motivo,
        registrado_por: userId
      }]);

      if (error) throw error;

      admin.toast('Sucesso', 'Movimento registrado!');
      admin.closeModal('modal-movimento-caixa-overlay');
      await loadCaixaState();
    } catch(err) {
      console.error('Erro movimento', err);
      admin.toast('Erro', 'Erro ao registrar', 'error');
    } finally {
      btnSalvar.disabled = false;
    }
  });

  // FECHAR CAIXA
  btnFecharCaixaHeader?.addEventListener('click', async () => {
    if (!currentCaixa) return;
    
    // Check for open orders
    const qtdMesasAbertasEl = document.getElementById('qtd-mesas-abertas');
    const alertaMesasAbertas = document.getElementById('alerta-mesas-abertas');
    
    try {
      const { count, error } = await supabase
        .from('pedidos')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aberto');
        
      if (!error && count > 0) {
        qtdMesasAbertasEl.textContent = count;
        alertaMesasAbertas.style.display = 'flex';
      } else {
        alertaMesasAbertas.style.display = 'none';
      }
    } catch(e) { console.error(e); }

    // Load totals for the modal
    const tbody = document.getElementById('fechar-caixa-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';
    admin.openModal('modal-fechar-caixa-overlay');

    try {
      const { data, error } = await supabase.rpc('get_totais_caixa', { p_caixa_id: currentCaixa.id });
      if (error) throw error;
      
      tbody.innerHTML = '';
      
      const metodosEsperados = ['dinheiro', 'pix', 'credito', 'debito'];
      const totaisMap = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };
      
      if (data) {
        data.forEach(d => {
          if (totaisMap[d.metodo] !== undefined) totaisMap[d.metodo] = Number(d.total);
        });
      }

      // Adjust dinheiro
      const totalDinheiroGeral = Number(currentCaixa.fundo_troco) 
                               + Number(currentCaixa.total_entradas) 
                               - Number(currentCaixa.total_saidas) 
                               + totaisMap['dinheiro'];
      totaisMap['dinheiro'] = totalDinheiroGeral;

      metodosEsperados.forEach(m => {
        const esperado = totaisMap[m];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${m.toUpperCase()}</td>
          <td>R$ ${esperado.toFixed(2)}</td>
          <td>
            <input type="number" class="field__input form-contado" data-metodo="${m}" data-esperado="${esperado}" step="0.01" value="${esperado.toFixed(2)}" style="width: 100px; padding: 4px;">
          </td>
          <td class="td-diferenca">R$ 0.00</td>
        `;
        tbody.appendChild(tr);

        // Auto update diff
        const input = tr.querySelector('.form-contado');
        const tdDif = tr.querySelector('.td-diferenca');
        input.addEventListener('input', () => {
          const val = parseFloat(input.value) || 0;
          const dif = val - esperado;
          tdDif.textContent = `R$ ${dif.toFixed(2)}`;
          tdDif.style.color = dif < 0 ? 'var(--danger)' : (dif > 0 ? 'var(--success)' : 'inherit');
        });
      });

    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar</td></tr>';
    }
  });

  document.getElementById('btn-confirmar-fechar-caixa')?.addEventListener('click', async () => {
    if (!currentCaixa) return;

    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user.id;

    // Collect conferencias
    const inputs = document.querySelectorAll('.form-contado');
    const observacoes = document.getElementById('fechar-caixa-observacoes').value;
    
    // We can't pass arrays of objects easily to RPC unless we define a type or pass JSON.
    // get_totais_caixa and fechar_caixa RPC takes standard args.
    // The RPC `fechar_caixa` we created takes p_caixa_id, p_fechado_por, p_observacoes.
    // And it doesn't take the arrays of counted values directly in the SQL provided.
    // WAIT, let me check the migration script to see how fechar_caixa is defined.
    // Ah, the RPC fechar_caixa only closes the caixa. The conferencias need to be inserted into caixa_conferencia table directly.

    const conferencias = Array.from(inputs).map(inp => {
      const val = parseFloat(inp.value) || 0;
      const esperado = parseFloat(inp.getAttribute('data-esperado')) || 0;
      return {
        caixa_id: currentCaixa.id,
        metodo_pagamento: inp.getAttribute('data-metodo'),
        valor_informado: val,
        valor_sistema: esperado,
        diferenca: val - esperado
      };
    });

    const btnConfirmar = document.getElementById('btn-confirmar-fechar-caixa');
    btnConfirmar.disabled = true;

    try {
      // Insert conferencias
      const { error: confError } = await supabase.from('caixa_conferencia').insert(conferencias);
      if (confError) throw confError;

      // Call RPC to close
      const { error: closeError } = await supabase.rpc('fechar_caixa', {
        p_caixa_id: currentCaixa.id,
        p_fechado_por: userId,
        p_observacoes: observacoes
      });
      if (closeError) throw closeError;

      admin.toast('Sucesso', 'Caixa fechado com sucesso!');
      admin.closeModal('modal-fechar-caixa-overlay');
      await loadCaixaState();
    } catch(err) {
      console.error(err);
      admin.toast('Erro', err.message, 'error');
    } finally {
      btnConfirmar.disabled = false;
    }
  });
};
