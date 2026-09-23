document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('promocoes-table-body');
  const btnNova = document.getElementById('btn-nova-promocao');
  
  const modal = document.getElementById('modal-promocao');
  const overlay = document.getElementById('modal-promocao-overlay');
  const btnClose = document.getElementById('modal-promocao-close');
  const btnCancel = document.getElementById('modal-promocao-cancel');
  
  const form = document.getElementById('form-promocao');
  const inId = document.getElementById('promo-id');
  const inNome = document.getElementById('promo-nome');
  const inDesc = document.getElementById('promo-descricao');
  const inTipo = document.getElementById('promo-tipo');
  const inPercent = document.getElementById('promo-percentual');
  const inQtdCompra = document.getElementById('promo-qtd-compra');
  const inQtdLeva = document.getElementById('promo-qtd-leva');
  
  const wrapPercent = document.getElementById('promo-percentual-wrap');
  const wrapLeve = document.getElementById('promo-leve-wrap');
  
  const inAplicarTipo = document.getElementById('promo-aplicar-tipo');
  const inAplicarAlvo = document.getElementById('promo-aplicar-alvo');
  
  const diasCheckbox = document.querySelectorAll('.promo-dia');
  const inInicio = document.getElementById('promo-inicio');
  const inFim = document.getElementById('promo-fim');
  const inAtivo = document.getElementById('promo-ativo');
  
  let currentPromocoes = [];
  let produtos = [];
  let categorias = [];

  // Listen for navigation
  document.getElementById('nav-promocoes').addEventListener('click', () => {
    loadPromocoes();
    loadAlvos();
  });

  btnNova.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  inTipo.addEventListener('change', () => {
    const v = inTipo.value;
    if (v === 'percentual' || v === 'segunda_unidade') {
      wrapPercent.classList.remove('hidden');
      wrapLeve.classList.add('hidden');
      inPercent.required = true;
      inQtdCompra.required = false;
      inQtdLeva.required = false;
    } else if (v === 'compre_leve') {
      wrapPercent.classList.add('hidden');
      wrapLeve.classList.remove('hidden');
      inPercent.required = false;
      inQtdCompra.required = true;
      inQtdLeva.required = true;
    }
  });

  inAplicarTipo.addEventListener('change', () => {
    renderAlvos();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    // gather data
    const dias_semana = Array.from(diasCheckbox).filter(cb => cb.checked).map(cb => parseInt(cb.value));
    if (dias_semana.length === 0) {
      window.cafeteriaToast.show('Selecione pelo menos um dia da semana.', 'error');
      return;
    }

    const payload = {
      nome: inNome.value,
      descricao: inDesc.value,
      tipo: inTipo.value,
      percentual: (inTipo.value === 'percentual' || inTipo.value === 'segunda_unidade') ? Number(inPercent.value) : null,
      qtd_compra: (inTipo.value === 'compre_leve') ? Number(inQtdCompra.value) : null,
      qtd_leva: (inTipo.value === 'compre_leve') ? Number(inQtdLeva.value) : null,
      dias_semana: dias_semana,
      vigencia_inicio: inInicio.value || null,
      vigencia_fim: inFim.value || null,
      ativo: inAtivo.checked
    };

    const alvoTipo = inAplicarTipo.value;
    const alvoId = inAplicarAlvo.value;
    
    if (!alvoId) {
      window.cafeteriaToast.show('Selecione um alvo (produto ou categoria).', 'error');
      return;
    }

    const btn = document.getElementById('btn-salvar-promocao');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      let promoId = inId.value;
      if (promoId) {
        // Update
        const { error } = await window.cafeteriaSupabase
          .from('promocoes')
          .update(payload)
          .eq('id', promoId);
        
        if (error) throw error;
        
        // delete and re-insert items
        await window.cafeteriaSupabase.from('promocao_itens').delete().eq('promocao_id', promoId);
      } else {
        // Insert
        const { data, error } = await window.cafeteriaSupabase
          .from('promocoes')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        promoId = data.id;
      }
      
      const itemPayload = { promocao_id: promoId };
      if (alvoTipo === 'produto') itemPayload.produto_id = alvoId;
      else itemPayload.categoria_id = alvoId;
      
      const { error: errItem } = await window.cafeteriaSupabase.from('promocao_itens').insert([itemPayload]);
      if (errItem) throw errItem;
      
      window.cafeteriaToast.show('Promoção salva com sucesso!');
      closeModal();
      loadPromocoes();
      
    } catch(err) {
      console.error(err);
      window.cafeteriaToast.show('Erro ao salvar promoção.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar Promoção';
    }
  });

  async function loadPromocoes() {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('promocoes')
        .select(`
          *,
          promocao_itens (
            produto_id,
            categoria_id,
            produtos (nome),
            categorias (nome)
          )
        `)
        .order('id', { ascending: false });
        
      if (error) throw error;
      currentPromocoes = data;
      renderTable(data);
    } catch(err) {
      console.error(err);
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Erro ao carregar</td></tr>';
    }
  }

  function renderTable(data) {
    if (!data.length) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma promoção cadastrada</td></tr>';
      return;
    }
    
    tableBody.innerHTML = '';
    const diasStr = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    
    data.forEach(promo => {
      let cond = '';
      if (promo.tipo === 'percentual') cond = `${promo.percentual}% OFF`;
      else if (promo.tipo === 'segunda_unidade') cond = `2ª un ${promo.percentual}% OFF`;
      else if (promo.tipo === 'compre_leve') cond = `Compre ${promo.qtd_compra} Leve ${promo.qtd_leva}`;
      
      const diasTxt = promo.dias_semana.map(d => diasStr[d]).join(', ');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${promo.id}</td>
        <td><strong>${window.escapeHtml(promo.nome)}</strong></td>
        <td>${formatTipo(promo.tipo)}</td>
        <td>${cond}</td>
        <td><div style="font-size:12px;">${diasTxt}</div></td>
        <td>
          <span class="status-badge ${promo.ativo ? 'status-ativo' : 'status-inativo'}">
            ${promo.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td class="table-actions text-right">
          <button class="btn btn--ghost btn-small btn-edit">✏️</button>
          <button class="btn btn--danger btn-small btn-del" style="padding: 4px 8px;">🗑️</button>
        </td>
      `;
      
      tr.querySelector('.btn-edit').addEventListener('click', () => editPromo(promo));
      tr.querySelector('.btn-del').addEventListener('click', () => deletePromo(promo.id));
      
      tableBody.appendChild(tr);
    });
  }

  async function loadAlvos() {
    try {
      const pRes = await window.cafeteriaSupabase.from('produtos').select('id, nome').order('nome');
      if (pRes.data) produtos = pRes.data;
      
      const cRes = await window.cafeteriaSupabase.from('categorias').select('id, nome').order('ordem');
      if (cRes.data) categorias = cRes.data;
      
      renderAlvos();
    } catch(err) {
      console.error(err);
    }
  }

  function renderAlvos() {
    const tipo = inAplicarTipo.value;
    inAplicarAlvo.innerHTML = '';
    
    if (tipo === 'produto') {
      produtos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nome;
        inAplicarAlvo.appendChild(opt);
      });
    } else {
      categorias.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        inAplicarAlvo.appendChild(opt);
      });
    }
  }

  function editPromo(promo) {
    inId.value = promo.id;
    inNome.value = promo.nome;
    inDesc.value = promo.descricao || '';
    inTipo.value = promo.tipo;
    inPercent.value = promo.percentual || '';
    inQtdCompra.value = promo.qtd_compra || '';
    inQtdLeva.value = promo.qtd_leva || '';
    
    if (promo.vigencia_inicio) inInicio.value = promo.vigencia_inicio;
    else inInicio.value = '';
    
    if (promo.vigencia_fim) inFim.value = promo.vigencia_fim;
    else inFim.value = '';
    
    inAtivo.checked = promo.ativo;
    
    diasCheckbox.forEach(cb => {
      cb.checked = promo.dias_semana.includes(parseInt(cb.value));
    });
    
    inTipo.dispatchEvent(new Event('change'));
    
    if (promo.promocao_itens && promo.promocao_itens.length > 0) {
      const item = promo.promocao_itens[0];
      if (item.produto_id) {
        inAplicarTipo.value = 'produto';
        renderAlvos();
        inAplicarAlvo.value = item.produto_id;
      } else if (item.categoria_id) {
        inAplicarTipo.value = 'categoria';
        renderAlvos();
        inAplicarAlvo.value = item.categoria_id;
      }
    }
    
    document.getElementById('modal-promocao-title').textContent = 'Editar Promoção';
    openModal(null, true);
  }

  async function deletePromo(id) {
    if (confirm('Tem certeza que deseja excluir esta promoção?')) {
      try {
        const { error } = await window.cafeteriaSupabase.from('promocoes').delete().eq('id', id);
        if (error) throw error;
        window.cafeteriaToast.show('Promoção excluída!');
        loadPromocoes();
      } catch(err) {
        console.error(err);
        window.cafeteriaToast.show('Erro ao excluir', 'error');
      }
    }
  }

  function openModal(e, isEdit = false) {
    if (!isEdit) {
      form.reset();
      inId.value = '';
      inTipo.dispatchEvent(new Event('change'));
      renderAlvos();
      diasCheckbox.forEach(cb => cb.checked = true); // select all by default
      document.getElementById('modal-promocao-title').textContent = 'Nova Promoção';
    }
    modal.classList.add('active');
    overlay.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    overlay.classList.remove('active');
  }

  function formatTipo(tipo) {
    if (tipo === 'percentual') return 'Desconto';
    if (tipo === 'compre_leve') return 'Compre X, Leve Y';
    if (tipo === 'segunda_unidade') return '2ª Unidade';
    return tipo;
  }
});
