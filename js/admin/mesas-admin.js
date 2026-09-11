/**
 * js/admin/mesas-admin.js
 * Lógica para CRUD de Mesas na tela de Admin.
 */
(function() {
  const pageMesas = document.getElementById('page-mesas');
  if (!pageMesas) return;

  const tbody = document.getElementById('mesas-table-body');
  const btnNovaMesa = document.getElementById('btn-nova-mesa');

  // Modal
  const modalOverlay = document.getElementById('modal-mesa-overlay');
  const btnClose = document.getElementById('modal-mesa-close');
  const btnCancel = document.getElementById('modal-mesa-cancel');
  const formMesa = document.getElementById('form-mesa');
  const btnSalvar = document.getElementById('btn-salvar-mesa');

  const inputId = document.getElementById('mesa-id');
  const inputCodigo = document.getElementById('mesa-codigo');
  const inputDescricao = document.getElementById('mesa-descricao');
  const inputAtivo = document.getElementById('mesa-ativo');

  function openModal(mesa = null) {
    if (mesa) {
      document.getElementById('modal-mesa-title').textContent = 'Editar Mesa';
      inputId.value = mesa.codigo; // Usaremos o código original para update
      // Guardar o código original num data attribute para o update
      inputId.dataset.original = mesa.codigo;
      inputCodigo.value = mesa.codigo;
      inputDescricao.value = mesa.descricao || '';
      inputAtivo.checked = mesa.ativo;
    } else {
      document.getElementById('modal-mesa-title').textContent = 'Nova Mesa';
      formMesa.reset();
      inputId.value = '';
      inputId.dataset.original = '';
      inputAtivo.checked = true;
    }
    modalOverlay.style.display = 'flex';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
  }

  [btnClose, btnCancel].forEach(el => el && el.addEventListener('click', closeModal));
  btnNovaMesa.addEventListener('click', () => openModal());

  async function loadMesas() {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
    
    const { data, error } = await window.cafeteriaSupabase
      .from('mesas')
      .select('*')
      .order('codigo');

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma mesa cadastrada.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(mesa => {
      const dataCriacao = new Date(mesa.created_at).toLocaleString('pt-BR');
      const statusHtml = mesa.ativo 
        ? '<span class="status status--active">Ativa</span>' 
        : '<span class="status status--inactive">Inativa</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${mesa.codigo}</strong></td>
        <td>${mesa.descricao || '—'}</td>
        <td>${statusHtml}</td>
        <td>${dataCriacao}</td>
        <td class="table-actions">
          <button class="btn btn--outline-dark btn-small btn-edit" title="Editar">✏️</button>
          <button class="btn btn--danger btn-small btn-delete" title="Excluir">🗑</button>
        </td>
      `;
      
      tr.querySelector('.btn-edit').addEventListener('click', () => openModal(mesa));
      tr.querySelector('.btn-delete').addEventListener('click', () => deleteMesa(mesa));
      
      tbody.appendChild(tr);
    });
  }

  formMesa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!inputId.value;
    const codigoOriginal = inputId.dataset.original;
    
    const payload = {
      codigo: inputCodigo.value.trim().toUpperCase(),
      descricao: inputDescricao.value.trim(),
      ativo: inputAtivo.checked
    };

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';

    let error;
    
    if (isEdit) {
      const res = await window.cafeteriaSupabase
        .from('mesas')
        .update(payload)
        .eq('codigo', codigoOriginal);
      error = res.error;
    } else {
      const res = await window.cafeteriaSupabase
        .from('mesas')
        .insert([payload]);
      error = res.error;
    }

    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Mesa';

    if (error) {
      if (error.code === '23505') {
        alert('Já existe uma mesa com este código.');
      } else {
        alert('Erro ao salvar mesa: ' + error.message);
      }
      return;
    }

    window.showToast('Mesa salva com sucesso!');
    closeModal();
    loadMesas();
  });

  async function deleteMesa(mesa) {
    // Para simplificar, excluímos direto (confirm modal já existe no admin.html mas vamos usar nativo aqui por rapidez)
    if (!confirm(`Tem certeza que deseja EXCLUIR a mesa ${mesa.codigo}?\nIsso pode falhar se houver pedidos vinculados.`)) return;

    const { error } = await window.cafeteriaSupabase
      .from('mesas')
      .delete()
      .eq('codigo', mesa.codigo);

    if (error) {
      if (error.code === '23503') {
        alert('Não é possível excluir esta mesa pois existem pedidos vinculados a ela. Em vez disso, inative a mesa.');
      } else {
        alert('Erro ao excluir: ' + error.message);
      }
      return;
    }

    window.showToast('Mesa excluída.');
    loadMesas();
  }

  // Expor init
  window.initAdminMesas = loadMesas;

})();
