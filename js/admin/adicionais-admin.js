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
      btnNew:  document.getElementById('btn-novo-adicional')
    };
  }

  window.renderAdicionais = function() {
    const el = adicEls();
    const adicionais = admin.appData.adicionais || [];

    if (adicionais.length === 0) {
      el.tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum adicional cadastrado.</td></tr>`;
      return;
    }

    el.tbody.innerHTML = adicionais.map((a, i) => {
      const statusPill = a.ativo 
        ? '<span class="status-pill status-pill--ativo">Ativo</span>' 
        : '<span class="status-pill status-pill--inativo">Inativo</span>';
      
      const precoFmt = `R$ ${Number(a.preco).toFixed(2).replace('.', ',')}`;

      return `
        <tr>
          <td><strong>${window.escapeHtml(a.id)}</strong></td>
          <td>${window.escapeHtml(a.nome)}</td>
          <td>${precoFmt}</td>
          <td>${a.ordem}</td>
          <td>${statusPill}</td>
          <td>
            <button class="btn btn--icon btn--ghost" onclick="window.openAdicionalModal('${a.id}')" title="Editar">✏️</button>
            <button class="btn btn--icon btn--danger" onclick="window.deleteAdicional('${a.id}')" title="Excluir">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  window.openAdicionalModal = function(id) {
    const el = adicEls();
    const isEdit = !!id;
    document.getElementById('modal-adicional-title').textContent = isEdit ? 'Editar Adicional' : 'Novo Adicional';
    document.getElementById('adicional-id').value = id || '';
    el.form.reset();
    
    if (isEdit) {
      const a = (admin.appData.adicionais || []).find(x => x.id === id);
      if (a) {
        document.getElementById('adicional-nome').value = a.nome;
        document.getElementById('adicional-preco').value = Number(a.preco).toFixed(2);
        document.getElementById('adicional-ativo').checked = !!a.ativo;
      }
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
      const data = await window.cafeteriaDB.adicionais.all();
      admin.appData.adicionais = data;
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
