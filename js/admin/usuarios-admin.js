/**
 * js/admin/usuarios-admin.js
 * Lógica para listagem e criação de usuários (equipe) na tela de Admin.
 */
(function() {
  const pageUsuarios = document.getElementById('page-usuarios');
  if (!pageUsuarios) return;

  const tbodyUsuarios = document.getElementById('usuarios-table-body');
  const btnNovoUsuario = document.getElementById('btn-novo-usuario');
  const modalOverlay = document.getElementById('modal-usuario-overlay');
  const btnCloseModal = document.getElementById('modal-usuario-close');
  const btnCancelModal = document.getElementById('modal-usuario-cancel');
  
  const formUsuario = document.getElementById('form-usuario');
  const inputNome = document.getElementById('usuario-nome');
  const inputEmail = document.getElementById('usuario-email');
  const inputSenha = document.getElementById('usuario-senha');
  const selectRole = document.getElementById('usuario-role');
  const btnSalvarUsuario = document.getElementById('btn-salvar-usuario');

  // --- Funções do Modal ---
  function openModal() {
    if (formUsuario) formUsuario.reset();
    if (inputEmail) inputEmail.disabled = false;
    if (modalOverlay) {
      modalOverlay.classList.add('open');
      modalOverlay.style.display = 'flex';
      modalOverlay.style.opacity = '1';
      modalOverlay.style.pointerEvents = 'all';
    }
    document.body.style.overflow = 'hidden';
    if (inputNome) inputNome.focus();
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove('open');
      modalOverlay.style.display = 'none';
      modalOverlay.style.opacity = '';
      modalOverlay.style.pointerEvents = '';
    }
    document.body.style.overflow = '';
  }

  if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', openModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  // Fecha ao clicar no fundo escuro
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // --- Carregar e Renderizar Usuários ---
  async function loadUsuarios() {
    if (!tbodyUsuarios) return;
    
    tbodyUsuarios.innerHTML = '<tr><td colspan="5" class="text-center">Carregando usuários...</td></tr>';
    
    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('perfis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        tbodyUsuarios.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum usuário cadastrado.</td></tr>';
        return;
      }

      renderTable(data);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      tbodyUsuarios.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red">Erro ao carregar usuários: ${err.message}</td></tr>`;
      if (window.showToast) window.showToast('Erro ao carregar usuários', 'error');
    }
  }

  function renderTable(usuarios) {
    tbodyUsuarios.innerHTML = '';
    
    usuarios.forEach(user => {
      const dataCriacao = new Date(user.created_at).toLocaleDateString('pt-BR');
      
      const roleMap = {
        'barista': '<span class="badge" style="background:#FFF3E0; color:#E65100; font-weight:bold;">☕ Barista</span>',
        'cozinha': '<span class="badge" style="background:#E3F2FD; color:#1565C0; font-weight:bold;">🍳 Cozinha</span>',
        'admin': '<span class="badge" style="background:#E8F5E9; color:#2E7D32; font-weight:bold;">🛡️ Admin</span>'
      };

      const roleBadge = roleMap[user.role] || user.role;
      const statusBadge = user.ativo 
        ? '<span class="status status--active">Ativo</span>' 
        : '<span class="status status--inactive">Inativo</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${user.nome}</strong></td>
        <td style="color:#666;"><em>Registrado no Auth</em></td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>${dataCriacao}</td>
      `;
      tbodyUsuarios.appendChild(tr);
    });
  }

  // --- Salvar Novo Usuário ---
  async function salvarUsuario() {
    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    const role = selectRole.value;

    if (!nome) {
      alert('Por favor, preencha o nome do colaborador.');
      inputNome.focus();
      return;
    }

    if (!email || !email.includes('@')) {
      alert('Por favor, informe um e-mail válido.');
      inputEmail.focus();
      return;
    }

    if (!senha || senha.length < 6) {
      alert('A senha deve conter no mínimo 6 caracteres.');
      inputSenha.focus();
      return;
    }

    const originalText = btnSalvarUsuario.textContent;
    btnSalvarUsuario.textContent = 'Criando Usuário...';
    btnSalvarUsuario.disabled = true;

    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('admin_create_user', {
        email: email,
        password: senha,
        nome: nome,
        role_param: role
      });

      if (error) {
        throw error;
      }

      if (window.showToast) {
        window.showToast(`Usuário ${nome} (${role}) criado com sucesso!`, 'success');
      } else {
        alert(`Usuário ${nome} (${role}) criado com sucesso!`);
      }

      closeModal();
      loadUsuarios();
      
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
      alert('Erro ao criar usuário: ' + (err.message || err.error_description || JSON.stringify(err)));
    } finally {
      btnSalvarUsuario.textContent = originalText;
      btnSalvarUsuario.disabled = false;
    }
  }

  if (btnSalvarUsuario) {
    btnSalvarUsuario.addEventListener('click', salvarUsuario);
  }

  if (formUsuario) {
    formUsuario.addEventListener('submit', (e) => {
      e.preventDefault();
      salvarUsuario();
    });
  }

  // Exportar para que main.js chame na navegação
  window.loadUsuarios = loadUsuarios;

  // Carrega se estiver na página
  loadUsuarios();

})();
