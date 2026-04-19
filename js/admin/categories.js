/* =========================================================
   ADMIN/CATEGORIES.JS — Gestão de Categorias
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;

  function catEls() {
    return {
      container: document.getElementById('cat-list-container'),
      modal:     'modal-cat-overlay',
      form:      document.getElementById('form-categoria'),
      btnSave:   document.getElementById('btn-salvar-categoria'),
      btnNew:    document.getElementById('btn-nova-categoria')
    };
  }

  window.renderCategorias = function() {
    const el = catEls();
    const cats = admin.appData.categorias;

    if (cats.length === 0) {
      el.container.innerHTML = `<div class="empty-state">🏷️<br>Nenhuma categoria encontrada</div>`;
      return;
    }

    el.container.innerHTML = cats.map((c, i) => `
      <div class="cat-item" data-id="${c.id}" data-index="${i}" draggable="true">
        <div class="cat-item__drag">⠿</div>
        <div class="cat-item__icon">${c.icone}</div>
        <div class="cat-item__info">
          <div class="cat-item__name">${c.nome}</div>
          <div class="cat-item__meta">${c.descricao || 'Sem descrição'}</div>
        </div>
        ${c.ativo ? '<span class="status-pill status-pill--ativo">Ativa</span>' : '<span class="status-pill status-pill--inativo">Inativa</span>'}
        <div class="cat-item__actions">
          <button class="btn btn--icon btn--ghost" onclick="window.openCatModal('${c.id}')">✏️</button>
          <button class="btn btn--icon btn--danger" onclick="window.deleteCategoria('${c.id}')">🗑️</button>
        </div>
      </div>`).join('');

    setupDragAndDrop();
  };

  window.openCatModal = function(id) {
    const el = catEls();
    const isEdit = !!id;
    document.getElementById('modal-cat-title').textContent = isEdit ? 'Editar Categoria' : 'Nova Categoria';
    document.getElementById('cat-id').value = id || '';
    el.form.reset();
    
    if (isEdit) {
      const c = admin.appData.categorias.find(x => x.id === id);
      if (c) {
        document.getElementById('cat-nome').value = c.nome;
        document.getElementById('cat-icone').value = c.icone;
        document.getElementById('cat-icone-preview').textContent = c.icone;
        document.getElementById('cat-descricao').value = c.descricao || '';
        document.getElementById('cat-ativo').checked = !!c.ativo;
      }
    } else {
      document.getElementById('cat-icone').value = '☕';
      document.getElementById('cat-icone-preview').textContent = '☕';
    }
    
    admin.openModal(el.modal);
  };

  async function saveCategoria() {
    const el = catEls();
    const editId = document.getElementById('cat-id').value;
    const nome = document.getElementById('cat-nome').value.trim();
    const icone = document.getElementById('cat-icone').value;
    const descricao = document.getElementById('cat-descricao').value;
    const ativo = document.getElementById('cat-ativo').checked;

    if (!nome) return admin.toast('Erro', 'Nome é obrigatório', 'error');

    el.btnSave.disabled = true;
    el.btnSave.textContent = 'Salvando...';

    try {
      const id = editId || admin.slugify(nome) || crypto.randomUUID();
      const ordem = editId 
        ? admin.appData.categorias.find(c => c.id === editId).ordem 
        : admin.appData.categorias.length;

      await window.cafeteriaDB.categories.upsert({
        id, nome, icone, descricao, ativo, ordem,
        updated_at: new Date().toISOString()
      });

      admin.toast('Sucesso', 'Categoria salva.', 'success');
      admin.closeModal(el.modal);
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao salvar categoria.', 'error');
    } finally {
      el.btnSave.disabled = false;
      el.btnSave.textContent = 'Salvar Categoria';
    }
  }

  window.deleteCategoria = async function(id) {
    const c = admin.appData.categorias.find(x => x.id === id);
    if (!c) return;
    const hasProducts = admin.appData.produtos.some(p => (p.categoria_id || p.categoriaId) === id);
    if (hasProducts) return admin.toast('Erro', 'Esta categoria possui produtos vinculados.', 'error');

    const ok = await admin.confirm({ title: 'Excluir?', msg: `Deseja remover "${c.nome}"?` });
    if (!ok) return;

    try {
      await window.cafeteriaDB.categories.delete(id);
      admin.toast('Sucesso', 'Categoria removida.', 'info');
      await admin.loadData();
    } catch (err) {
      console.error(err);
      admin.toast('Erro', 'Falha ao excluir.', 'error');
    }
  };

  function setupDragAndDrop() {
    const container = catEls().container;
    const items = container.querySelectorAll('.cat-item');
    let draggedItem = null;

    items.forEach(item => {
      item.addEventListener('dragstart', () => {
        draggedItem = item;
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', async () => {
        item.classList.remove('dragging');
        const newOrder = Array.from(container.querySelectorAll('.cat-item')).map((el, i) => {
          const cat = admin.appData.categorias.find(c => c.id === el.dataset.id);
          return { ...cat, ordem: i };
        });
        
        try {
          await Promise.all(newOrder.map(c => window.cafeteriaDB.categories.upsert(c)));
          admin.toast('Ordenado', 'Nova ordem salva.', 'success', 1500);
          await admin.loadData();
        } catch (err) {
          console.error(err);
          admin.toast('Erro', 'Falha ao salvar ordenação.', 'error');
        }
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(draggedItem);
        } else {
          container.insertBefore(draggedItem, afterElement);
        }
      });
    });
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.cat-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Bind Events
  document.addEventListener('DOMContentLoaded', () => {
    const els = catEls();
    if (!els.container) return;

    els.btnNew.addEventListener('click', () => window.openCatModal());
    els.btnSave.addEventListener('click', saveCategoria);

    // Emoji Picker
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        document.getElementById('cat-icone').value = emoji;
        document.getElementById('cat-icone-preview').textContent = emoji;
      });
    });
  });

})();
