document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.cafeteriaSupabase;

  // --- Elementos DOM ---
  const tbodyUsuarios = document.getElementById('usuarios-table-body');
  
  const btnNovoUsuario = document.getElementById('btn-novo-usuario');
  const modalUsuario = document.getElementById('modal-usuario-overlay');
  const btnCloseModal = document.getElementById('modal-usuario-close');
  const btnCancelModal = document.getElementById('modal-usuario-cancel');
  
  const formUsuario = document.getElementById('form-usuario');
  const inputNome = document.getElementById('usuario-nome');
  const inputEmail = document.getElementById('usuario-email');
  const inputSenha = document.getElementById('usuario-senha');
  const selectRole = document.getElementById('usuario-role');
  const btnSalvarUsuario = document.getElementById('btn-salvar-usuario');

  // --- Funções de Modal ---
  function openModal() {
    formUsuario.reset();
    inputEmail.disabled = false;
    modalUsuario.classList.add('active');
  }

  function closeModal() {
    modalUsuario.classList.remove('active');
  }

  btnNovoUsuario?.addEventListener('click', openModal);
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);

  // Fecha modal ao clicar fora
  modalUsuario?.addEventListener('click', (e) => {
    if (e.target === modalUsuario) closeModal();
  });

  // --- Buscar e Renderizar Usuários ---
  async function loadUsuarios() {
    if (!tbodyUsuarios) return;
    
    tbodyUsuarios.innerHTML = '<tr><td colspan="5" style="text-align:center">Carregando usuários...</td></tr>';
    
    try {
      const { data, error } = await supabase
        .from('perfis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbodyUsuarios.innerHTML = '<tr><td colspan="5" style="text-align:center">Nenhum usuário cadastrado.</td></tr>';
        return;
      }

      renderTable(data);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      tbodyUsuarios.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red">Erro ao carregar usuários.</td></tr>';
      if (window.showToast) window.showToast('Erro ao carregar usuários', 'error');
    }
  }

  function renderTable(usuarios) {
    tbodyUsuarios.innerHTML = '';
    
    usuarios.forEach(user => {
      const dataCriacao = new Date(user.created_at).toLocaleDateString('pt-BR');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${user.nome}</strong></td>
        <td style="opacity:0.7"><em>Oculto (protegido por lei de dados)</em></td>
        <td><span class="badge" style="text-transform: capitalize">${user.role}</span></td>
        <td>${user.ativo ? '<span style="color:green">Ativo</span>' : '<span style="color:red">Inativo</span>'}</td>
        <td>${dataCriacao}</td>
      `;
      tbodyUsuarios.appendChild(tr);
    });
  }

  // --- Salvar Novo Usuário ---
  formUsuario?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formUsuario.checkValidity()) {
      formUsuario.classList.add('was-validated');
      return;
    }

    const btnOriginalText = btnSalvarUsuario.innerHTML;
    btnSalvarUsuario.innerHTML = 'Salvando...';
    btnSalvarUsuario.disabled = true;

    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        email: inputEmail.value.trim(),
        password: inputSenha.value,
        nome: inputNome.value.trim(),
        role_param: selectRole.value
      });

      if (error) throw error;

      if (window.showToast) window.showToast('Usuário criado com sucesso!', 'success');
      closeModal();
      loadUsuarios();
      
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
      if (window.showToast) window.showToast('Erro ao criar usuário: ' + err.message, 'error');
    } finally {
      btnSalvarUsuario.innerHTML = btnOriginalText;
      btnSalvarUsuario.disabled = false;
    }
  });

  // Exportar para que main.js chame
  window.loadUsuarios = loadUsuarios;
  
  // Inicializar localmente tb
  loadUsuarios();
});
