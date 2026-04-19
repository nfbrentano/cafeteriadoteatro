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
    const cats = admin.appData.categorias;
    el.filterCat.innerHTML = '<option value="">Todas as categorias</option>' + 
      cats.map(c => `<option value="${c.id}" ${cur === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`).join('');
    
    // Além do filtro, popular o select do modal
    const modalSelect = document.getElementById('produto-categoria');
    if (modalSelect) {
      const curModal = modalSelect.value;
      modalSelect.innerHTML = '<option value="">Selecione...</option>' + 
        cats.map(c => `<option value="${c.id}" ${curModal === c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>`).join('');
    }
  }

  function renderTable() {
    const el = productsEls();
    const catF    = el.filterCat.value;
    const statusF = el.filterStatus.value;
    const search  = (el.search.value || '').toLowerCase();

    const filtered = admin.appData.produtos.filter(p => {
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

    el.tableBody.innerHTML = filtered.map(p => {
      const pCatId = p.categoria_id || p.categoriaId;
      const cat = admin.appData.categorias.find(c => c.id === pCatId);
      const preco = Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const badgesHTML = (p.badges || []).map(b => `<span class="badge-mini badge-mini--${b}">${b}</span>`).join(' ');

      return `
        <tr>
          <td class="td-name">${p.nome}</td>
          <td><span style="color:var(--admin-text-dim)">${cat ? cat.icone + ' ' + cat.nome : pCatId}</span></td>
          <td class="td-price">R$ ${preco}</td>
          <td><div class="td-badges">${badgesHTML || '—'}</div></td>
          <td>${p.ativo ? '<span class="status-pill status-pill--ativo">Ativo</span>' : '<span class="status-pill status-pill--inativo">Inativo</span>'}</td>
          <td>
            <div class="td-actions">
              <button class="btn btn--icon btn--ghost" onclick="window.openProdutoModal('${p.id}')">✏️</button>
              <button class="btn btn--icon btn--danger" onclick="window.deleteProduto('${p.id}')">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // --- Modal e CRUD ---
  window.openProdutoModal = function(id) {
    const el = productsEls();
    const isEdit = !!id;
    document.getElementById('modal-produto-title').textContent = isEdit ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('produto-id').value = id || '';
    el.form.reset();
    resetUploadUI();
    populateFilters(); // Para garantir categorias atualizadas no select

    if (isEdit) {
      const p = admin.appData.produtos.find(x => x.id === id);
      if (p) {
        document.getElementById('produto-nome').value = p.nome;
        document.getElementById('produto-categoria').value = p.categoria_id || p.categoriaId;
        document.getElementById('produto-preco').value = p.preco;
        document.getElementById('produto-descricao').value = p.descricao || '';
        document.getElementById('produto-ativo').checked = !!p.ativo;
        
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
    }
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
        id, nome, categoria_id, preco, descricao, ativo, badges,
        imagem_url: isNewImage ? null : dataUrl,
        updated_at: new Date().toISOString()
      }, imageBlob);
      
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

  function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > MAX_SIDE || h > MAX_SIDE) {
          const ratio = Math.min(MAX_SIDE / w, MAX_SIDE / h);
          w *= ratio; h *= ratio;
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/webp', WEBP_QUAL);
        showPreview(dataUrl);
        // Stats resumido
        const el = productsEls();
        el.infoDims.textContent = `${Math.round(w)} x ${Math.round(h)}px`;
        el.infoSize.textContent = `WebP Otimizado`;
        el.info.style.display = 'flex';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
  });

})();
