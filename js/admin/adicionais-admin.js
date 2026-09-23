/* =========================================================
   ADMIN/ADICIONAIS-ADMIN.JS — Gestão de Adicionais
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;

  function adicEls() {
    return {
      tbody:   document.getElementById('tbody-adicionais'),
      modal:   'modal-adicional-overlay',
      form:    document.getElementById('form-adicional'),
      btnSave: document.getElementById('btn-salvar-adicional'),
      btnNew:  document.getElementById('btn-novo-adicional'),
      catWrap: document.getElementById('adicional-categorias-wrap'),
      prodWrap: document.getElementById('adicional-produtos-wrap')
    };
  }

  window.renderAdicionais = function() {
    const el = adicEls();
    const adicionais = admin.appData.adicionais || [];
    const vinculosAll = admin.appData.vinculos_adicionais || [];

    if (adicionais.length === 0) {
      el.tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">Nenhum adicional cadastrado.</td></tr>`;
      return;
    }

    el.tbody.innerHTML = adicionais.map((a, i) => {
      const statusPill = a.ativo 
        ? '<span class="status-pill status-pill--ativo">Ativo</span>' 
        : '<span class="status-pill status-pill--inativo">Inativo</span>';
      
      const precoFmt = `R$ ${Number(a.preco).toFixed(2).replace('.', ',')}`;

      const vinculos = vinculosAll.filter(v => v.adicional_id === a.id);
      const catCount = vinculos.filter(v => v.categoria_id).length;
      const prodCount = vinculos.filter(v => v.produto_id).length;
      let vinculadoA = [];
      if (catCount) vinculadoA.push(`${catCount} categorias`);
      if (prodCount) vinculadoA.push(`${prodCount} produtos`);
      const vinculadoText = vinculadoA.length ? vinculadoA.join(' &middot; ') : '-';

      return `
        <tr>
          <td><strong>${window.escapeHtml(a.id)}</strong></td>
          <td>${window.escapeHtml(a.nome)}</td>
          <td>${precoFmt}</td>
          <td>${a.ordem}</td>
          <td style="font-size: 0.9em; color: var(--text-muted);">${vinculadoText}</td>
          <td>${statusPill}</td>
          <td>
            <button class="btn btn--icon btn--ghost" onclick="window.openAdicionalModal('${a.id}')" title="Editar">✏️</button>
            <button class="btn btn--icon btn--danger" onclick="window.deleteAdicional('${a.id}')" title="Excluir">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  window.openAdicionalModal = async function(id) {
    const el = adicEls();
    const isEdit = !!id;
    document.getElementById('modal-adicional-title').textContent = isEdit ? 'Editar Adicional' : 'Novo Adicional';
    document.getElementById('adicional-id').value = id || '';
    el.form.reset();
    
    // Assegura que categorias e produtos estejam carregados para a lista de checkbox
    if (!admin.appData.categorias || admin.appData.categorias.length === 0) {
      try { admin.appData.categorias = await window.cafeteriaDB.categories.all(); } catch(e){}
    }
    if (!admin.appData.produtos || admin.appData.produtos.length === 0) {
      try { admin.appData.produtos = await window.cafeteriaDB.products.all(); } catch(e){}
    }

    const cats = admin.appData.categorias || [];
    const prods = admin.appData.produtos || [];
    
    let vinculosDoAdicional = [];
    if (isEdit) {
      const a = (admin.appData.adicionais || []).find(x => x.id === id);
      if (a) {
        document.getElementById('adicional-nome').value = a.nome;
        document.getElementById('adicional-preco').value = Number(a.preco).toFixed(2);
        document.getElementById('adicional-ativo').checked = !!a.ativo;
      }
      vinculosDoAdicional = (admin.appData.vinculos_adicionais || []).filter(v => v.adicional_id === id);
    }
    
    // Renderiza checkboxes categorias
    if (el.catWrap) {
      el.catWrap.innerHTML = cats.map(c => {
        const checked = vinculosDoAdicional.some(v => v.categoria_id === c.id) ? 'checked' : '';
        return `
          <label class="badge-check" style="display: block; margin-bottom: 4px;">
            <input type="checkbox" name="vinculo_categoria" value="${c.id}" ${checked}>
            ${window.escapeHtml(c.nome)}
          </label>
        `;
      }).join('');
    }

    // Renderiza checkboxes produtos
    if (el.prodWrap) {
      el.prodWrap.innerHTML = prods.map(p => {
        const checked = vinculosDoAdicional.some(v => v.produto_id === p.id) ? 'checked' : '';
        return `
          <label class="badge-check" style="display: block; margin-bottom: 4px;">
            <input type="checkbox" name="vinculo_produto" value="${p.id}" ${checked}>
            ${window.escapeHtml(p.nome)}
          </label>
        `;
      }).join('');
    }

    admin.openModal(el.modal);
  };

  async function saveAdicional() {
    const el = adicEls();
    const editId = document.getElementById('adicional-id').value;
    const nome = document.getElementById('adicional-nome').value.trim();
    const preco = parseFloat(document.getElementById('adicional-preco').value);
    const ativo = document.getElementById('adicional-ativo').checked;

    if (!nome) return admin.toast('Erro', 'Nome é obrigatório', 'error');
    if (isNaN(preco) || preco < 0) return admin.toast('Erro', 'Preço inválido', 'error');

    el.btnSave.disabled = true;
    el.btnSave.textContent = 'Salvando...';

    try {
      const id = editId || admin.slugify(nome);
      const ordem = editId 
        ? (admin.appData.adicionais || []).find(a => a.id === editId)?.ordem || 0
        : (admin.appData.adicionais || []).length;

      await window.cafeteriaDB.adicionais.upsert({
        id, nome, preco, ativo, ordem
      });

      // Salva os vínculos
      const vinculos = [];
      document.querySelectorAll('input[name="vinculo_categoria"]:checked').forEach(chk => {
        vinculos.push({ adicional_id: id, categoria_id: chk.value });
      });
      document.querySelectorAll('input[name="vinculo_produto"]:checked').forEach(chk => {
        vinculos.push({ adicional_id: id, produto_id: chk.value });
      });
      
      await window.cafeteriaDB.adicionais.upsertVinculos(id, vinculos);

      admin.toast('Sucesso', 'Adicional salvo.', 'success');
      admin.closeModal(el.modal);
      await loadAdicionaisData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar adicional.', 'error');
    } finally {
      el.btnSave.disabled = false;
      el.btnSave.textContent = 'Salvar Adicional';
    }
  }

  window.deleteAdicional = async function(id) {
    if (!confirm('Excluir este adicional?')) return;
    
    try {
      await window.cafeteriaDB.adicionais.delete(id);
      admin.toast('Sucesso', 'Adicional excluído.', 'success');
      await loadAdicionaisData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao excluir.', 'error');
    }
  };

  async function loadAdicionaisData() {
    try {
      const [data, vinculos] = await Promise.all([
        window.cafeteriaDB.adicionais.all(),
        window.cafeteriaDB.adicionais.vinculos()
      ]);
      admin.appData.adicionais = data;
      admin.appData.vinculos_adicionais = vinculos;
      window.renderAdicionais();
    } catch (err) {
      console.error('Erro ao recarregar adicionais:', err);
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    const el = adicEls();
    if (el.btnNew) el.btnNew.addEventListener('click', () => window.openAdicionalModal());
    if (document.getElementById('modal-adicional-cancel')) {
      document.getElementById('modal-adicional-cancel').addEventListener('click', (e) => {
        e.preventDefault();
        admin.closeModal(el.modal);
      });
    }
    if (document.getElementById('modal-adicional-close')) {
      document.getElementById('modal-adicional-close').addEventListener('click', () => admin.closeModal(el.modal));
    }
    if (el.form) {
      el.form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveAdicional();
      });
    }
    if (el.btnSave) {
      el.btnSave.addEventListener('click', (e) => {
        e.preventDefault();
        if (el.form.checkValidity()) saveAdicional();
        else el.form.reportValidity();
      });
    }
  });

})();
