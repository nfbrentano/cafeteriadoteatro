/* =========================================================
   ADMIN/PRODUCTS.JS — Gestão de Produtos
   ========================================================= */

(function () {
  'use strict';

  // --- Constantes de Processamento de Imagem ---
  const MAX_SIDE   = 1080;
  const WEBP_QUAL  = 0.85;

  const admin = window.cafeteriaAdmin;

  function productsEls() {
    return {
      tableBody:   document.getElementById('produtos-table-body'),
      filterCat:   document.getElementById('filter-categoria'),
      filterStatus: document.getElementById('filter-status'),
      search:      document.getElementById('search-produto'),
      btnNew:      document.getElementById('btn-novo-produto'),
      modal:       'modal-produto-overlay',
      form:        document.getElementById('form-produto'),
      btnSave:     document.getElementById('btn-salvar-produto'),
      // Upload
      zone:        document.getElementById('upload-zone'),
      fileInput:   document.getElementById('produto-imagem-file'),
      idle:        document.getElementById('upload-idle'),
      previewWrap: document.getElementById('upload-preview-wrap'),
      previewImg:  document.getElementById('upload-preview-img'),
      info:        document.getElementById('upload-info'),
      infoDims:    document.getElementById('upload-info-dims'),
      infoSize:    document.getElementById('upload-info-size'),
      infoSaving:  document.getElementById('upload-info-saving'),
      dataInput:   document.getElementById('produto-imagem-data'),
      urlInput:    document.getElementById('produto-imagem'),
      btnChange:   document.getElementById('btn-change-img'),
      btnRemove:   document.getElementById('btn-remove-img'),
      // Adicionais
      cbPermiteAdd: document.getElementById('produto-ativo-adicionais'),
      fieldVinculos: document.getElementById('field-produto-vinculos-adicionais'),
      wrapAdicionais: document.getElementById('produto-adicionais-wrap'),
      selectCategoria: document.getElementById('produto-categoria')
    };
  }

  // --- Renderização ---
  window.renderProdutos = function() {
    populateFilters();
    renderTable();
  };

  function populateFilters() {
    const el = productsEls();
    const cur = el.filterCat.value;
    const cats = admin.appData.categorias || [];
    el.filterCat.innerHTML = '<option value="">Todas as categorias</option>' + 
      cats.map(c => `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`).join('');
    
    // Além do filtro, popular o select do modal
    if (el.selectCategoria) {
      const curModal = el.selectCategoria.value;
      el.selectCategoria.innerHTML = '<option value="">Selecione...</option>' + 
        cats.map(c => `<option value="${c.id}" ${curModal === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`).join('');
    }
  }

  function renderTable() {
    const el = productsEls();
    const catF    = el.filterCat.value;
    const statusF = el.filterStatus.value;
    const search  = (el.search.value || '').toLowerCase();

    const produtos = admin.appData.produtos || [];
    const filtered = produtos.filter(p => {
      const pCatId = p.categoria_id || p.categoriaId; // Compatibilidade
      if (catF    && pCatId !== catF) return false;
      if (statusF === 'ativo' && !p.ativo)  return false;
      if (statusF === 'inativo' && p.ativo) return false;
      if (search  && !p.nome.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filtered.length === 0) {
      el.tableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">🍽️<br>Nenhum produto encontrado</div></td></tr>`;
      return;
    }

    const cats = admin.appData.categorias || [];
    el.tableBody.innerHTML = filtered.map(p => {
      const pCatId = p.categoria_id || p.categoriaId;
      const cat = cats.find(c => c.id === pCatId);
      const preco = Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const badgesHTML = (p.badges || []).map(b => `<span class="badge-mini badge-mini--${b}">${b}</span>`).join(' ');

      return `
        <tr>
          <td class="td-name">${p.nome}</td>
          <td><span style="color:var(--admin-text-dim)">${cat ? cat.icone + ' ' + cat.nome : pCatId}</span></td>
          <td class="td-price">R$ ${preco}</td>
          <td><div class="td-badges">${badgesHTML || '—'}</div></td>
          <td>${p.ativo ? '<span class="status-pill status-pill--ativo">Ativo</span>' : '<span class="status-pill status-pill--inativo">Inativo</span>'} ${p.disponivel === false ? '<span class="status-pill" style="background:#e74c3c;color:white;font-size:0.7em;">Esgotado</span>' : ''}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn--icon btn--ghost" onclick="window.openProdutoModal('${p.id}')">✏️</button>
              <button class="btn btn--icon btn--danger" onclick="window.deleteProduto('${p.id}')">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // --- Adicionais ---
  async function renderAdicionaisCheckboxes(produtoId) {
    const el = productsEls();
    if (!el.wrapAdicionais) return;

    // Assegurar dados
    if (!admin.appData.adicionais || admin.appData.adicionais.length === 0) {
      try { admin.appData.adicionais = await window.cafeteriaDB.adicionais.all(); } catch(e){}
    }
    if (!admin.appData.vinculos_adicionais || admin.appData.vinculos_adicionais.length === 0) {
      try { admin.appData.vinculos_adicionais = await window.cafeteriaDB.adicionais.vinculos(); } catch(e){}
    }

    const allAds = admin.appData.adicionais || [];
    const allVincs = admin.appData.vinculos_adicionais || [];
    
    const catId = el.selectCategoria.value;
    
    // Adicionais herdados da categoria
    const inheritedAddons = allVincs.filter(v => v.categoria_id === catId).map(v => v.adicional_id);
    // Adicionais marcados diretamente no produto
    const directAddons = allVincs.filter(v => v.produto_id === produtoId).map(v => v.adicional_id);

    el.wrapAdicionais.innerHTML = allAds.map(a => {
      const isInherited = inheritedAddons.includes(a.id);
      const isDirect = directAddons.includes(a.id);
      
      let checked = '';
      let disabled = '';
      let title = '';
      let style = 'display: block; margin-bottom: 4px;';
      let extraText = '';

      if (isInherited) {
        checked = 'checked';
        disabled = 'disabled';
        title = 'Herdado da categoria';
        style += ' opacity: 0.7;';
        extraText = ' <span style="font-size:0.8em; color:var(--text-muted)">(Herdado)</span>';
      } else if (isDirect) {
        checked = 'checked';
      }

      return `
        <label class="badge-check" style="${style}" title="${title}">
          <input type="checkbox" name="vinculo_adicional_produto" value="${a.id}" ${checked} ${disabled}>
          ${window.escapeHtml(a.nome)} ${extraText}
        </label>
      `;
    }).join('');
  }

  // --- Modal e CRUD ---
  window.openProdutoModal = async function(id) {
    const el = productsEls();
    const isEdit = !!id;
    document.getElementById('modal-produto-title').textContent = isEdit ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('produto-id').value = id || '';
    el.form.reset();
    resetUploadUI();
    populateFilters(); // Para garantir categorias atualizadas no select

    let p = null;
    if (isEdit) {
      p = admin.appData.produtos.find(x => x.id === id);
      if (p) {
        document.getElementById('produto-nome').value = p.nome;
        document.getElementById('produto-categoria').value = p.categoria_id || p.categoriaId;
        document.getElementById('produto-preco').value = p.preco;
        document.getElementById('produto-descricao').value = p.descricao || '';
        document.getElementById('produto-ativo').checked = !!p.ativo;
        document.getElementById('produto-disponivel').checked = p.disponivel !== false;
        if (el.cbPermiteAdd) el.cbPermiteAdd.checked = !!p.permite_adicionais;
        
        // Badges
        (p.badges || []).forEach(b => {
          const cb = document.getElementById('badge-' + b);
          if (cb) cb.checked = true;
        });

        // Imagem
        if (p.imagem_url) {
          if (p.imagem_url.startsWith('data:')) {
            showPreview(p.imagem_url);
          } else {
            el.urlInput.value = p.imagem_url;
            el.dataInput.value = p.imagem_url;
          }
        }
      }
    } else {
      if (el.cbPermiteAdd) el.cbPermiteAdd.checked = false;
    }

    if (el.cbPermiteAdd) {
      el.cbPermiteAdd.dispatchEvent(new Event('change'));
    }

    await renderAdicionaisCheckboxes(id);

    admin.openModal(el.modal);
  };

  async function saveProduto() {
    const el = productsEls();
    const id = document.getElementById('produto-id').value || crypto.randomUUID();
    const nome = document.getElementById('produto-nome').value.trim();
    const categoria_id = document.getElementById('produto-categoria').value;
    const preco = parseFloat(document.getElementById('produto-preco').value);
    const descricao = document.getElementById('produto-descricao').value;
    const ativo = document.getElementById('produto-ativo').checked;
    const disponivel = document.getElementById('produto-disponivel').checked;
    const permite_adicionais = el.cbPermiteAdd ? el.cbPermiteAdd.checked : false;
    
    if (!nome || !categoria_id || isNaN(preco)) {
      return admin.toast('Erro', 'Preencha os campos obrigatórios (*)', 'error');
    }

    const badges = Array.from(document.querySelectorAll('input[name="badges"]:checked')).map(cb => cb.value);
    const dataUrl = el.dataInput.value;
    const isNewImage = dataUrl.startsWith('data:');
    const imageBlob = isNewImage ? admin.dataURLtoBlob(dataUrl) : null;

    el.btnSave.disabled = true;
    el.btnSave.textContent = 'Salvando...';

    try {
      await window.cafeteriaDB.products.upsert({
        id, nome, categoria_id, preco, descricao, ativo, badges, disponivel,
        permite_adicionais,
        imagem_url: isNewImage ? null : dataUrl,
        updated_at: new Date().toISOString()
      }, imageBlob);
      
      // Salva Vínculos de Adicionais Diretos
      if (permite_adicionais && el.wrapAdicionais) {
        const directVinculos = [];
        const checkboxes = el.wrapAdicionais.querySelectorAll('input[name="vinculo_adicional_produto"]:checked:not(:disabled)');
        checkboxes.forEach(chk => {
          directVinculos.push({ adicional_id: chk.value, produto_id: id });
        });
        await window.cafeteriaDB.products.upsertAdicionaisVinculos(id, directVinculos);
        
        // Atualiza cache de vinculos
        try { admin.appData.vinculos_adicionais = await window.cafeteriaDB.adicionais.vinculos(); } catch(e){}
      }

      admin.toast('Sucesso', 'Produto salvo com sucesso.', 'success');
      admin.closeModal(el.modal);
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar produto.', 'error');
    } finally {
      el.btnSave.disabled = false;
      el.btnSave.textContent = 'Salvar Produto';
    }
  }

  window.deleteProduto = async function(id) {
    const p = admin.appData.produtos.find(x => x.id === id);
    if (!p) return;
    const ok = await admin.confirm({ title: 'Excluir?', msg: `Deseja remover "${p.nome}"?`, okLabel: 'Excluir' });
    if (!ok) return;

    try {
      await window.cafeteriaDB.products.delete(id);
      admin.toast('Removido', 'Produto excluído.', 'info');
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao excluir.', 'error');
    }
  };

  // --- Upload Helpers ---
  function resetUploadUI() {
    const el = productsEls();
    el.idle.classList.remove('hidden');
    el.previewWrap.classList.add('hidden');
    el.info.style.display = 'none';
    el.dataInput.value = '';
    el.urlInput.value = '';
    el.fileInput.value = '';
  }

  function showPreview(dataUrl) {
    const el = productsEls();
    el.previewImg.src = dataUrl;
    el.idle.classList.add('hidden');
    el.previewWrap.classList.remove('hidden');
    el.dataInput.value = dataUrl;
  }

  async function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const el = productsEls();
    try {
      const result = await admin.compressImage(file, 'product');
      showPreview(result.dataUrl);
      if (el.infoDims) el.infoDims.textContent = `${result.width} × ${result.height}px`;
      if (el.infoSize) el.infoSize.textContent = `${result.format} • ${result.formattedOptimizedSize}`;
      if (el.infoSaving) {
        el.infoSaving.textContent = result.savedPercentage;
        el.infoSaving.style.display = result.originalSizeBytes > result.optimizedSizeBytes ? 'inline-block' : 'none';
      }
      if (el.info) el.info.style.display = 'flex';
    } catch (err) {
      console.error('Erro ao processar imagem do produto:', err);
      admin.toast('Erro', 'Não foi possível processar a imagem.', 'error');
    }
  }

  // --- Event Bindings ---
  document.addEventListener('DOMContentLoaded', () => {
    const els = productsEls();
    if (!els.tableBody) return;

    els.filterCat.addEventListener('change', renderTable);
    els.filterStatus.addEventListener('change', renderTable);
    els.search.addEventListener('input', renderTable);
    els.btnNew.addEventListener('click', () => window.openProdutoModal());
    els.btnSave.addEventListener('click', saveProduto);
    
    if (els.cbPermiteAdd && els.fieldVinculos) {
      els.cbPermiteAdd.addEventListener('change', (e) => {
        els.fieldVinculos.style.display = e.target.checked ? 'block' : 'none';
      });
    }

    if (els.selectCategoria) {
      els.selectCategoria.addEventListener('change', () => {
        const pId = document.getElementById('produto-id').value;
        renderAdicionaisCheckboxes(pId);
      });
    }

    // Upload zone
    els.zone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', (e) => processFile(e.target.files[0]));
    els.btnRemove.addEventListener('click', (e) => { e.stopPropagation(); resetUploadUI(); });
    els.urlInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        els.dataInput.value = url;
        els.idle.classList.remove('hidden');
        els.previewWrap.classList.add('hidden');
      }
    });

    // Drag-drop
    els.zone.addEventListener('dragover', (e) => { e.preventDefault(); els.zone.classList.add('drag-over'); });
    els.zone.addEventListener('dragleave', () => els.zone.classList.remove('drag-over'));
    els.zone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.zone.classList.remove('drag-over');
      processFile(e.dataTransfer.files[0]);
    });

    const btnExportProdutos = document.getElementById('btn-export-produtos');
    if (btnExportProdutos) {
      btnExportProdutos.addEventListener('click', () => {
        const el = productsEls();
        const catF    = el.filterCat.value;
        const statusF = el.filterStatus.value;
        const search  = (el.search.value || '').toLowerCase();

        const produtos = admin.appData.produtos || [];
        const filtered = produtos.filter(p => {
          const pCatId = p.categoria_id || p.categoriaId; // Compatibilidade
          if (catF    && pCatId !== catF) return false;
          if (statusF === 'ativo' && !p.ativo)  return false;
          if (statusF === 'inativo' && p.ativo) return false;
          if (search  && !p.nome.toLowerCase().includes(search)) return false;
          return true;
        });

        if (filtered.length === 0) {
          admin.toast('Aviso', 'Nenhum produto para exportar com os filtros atuais.', 'warn');
          return;
        }

        const cats = admin.appData.categorias || [];
        const escapeCSV = (val) => {
          if (val === null || val === undefined) return '""';
          const str = String(val);
          if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        const linhas = [];
        // Cabeçalho
        linhas.push(['ID', 'Nome', 'Categoria', 'Preço', 'Ativo', 'Disponível', 'Descrição'].join(';'));
        
        filtered.forEach(p => {
          const pCatId = p.categoria_id || p.categoriaId;
          const cat = cats.find(c => c.id === pCatId);
          const catName = cat ? cat.nome : pCatId;
          const preco = Number(p.preco || 0).toFixed(2).replace('.', ',');
          
          linhas.push([
            escapeCSV(p.id),
            escapeCSV(p.nome),
            escapeCSV(catName),
            escapeCSV(preco),
            escapeCSV(p.ativo ? 'Sim' : 'Não'),
            escapeCSV(p.disponivel !== false ? 'Sim' : 'Não'),
            escapeCSV(p.descricao || '')
          ].join(';'));
        });

        const dataHoje = new Date().toISOString().split('T')[0];
        admin.downloadCSV(`produtos_${dataHoje}.csv`, linhas.join('\n'));
      });
    }
  });

})();
