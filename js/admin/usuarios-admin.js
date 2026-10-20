/**
 * js/admin/usuarios-admin.js
 * Gestão de Colaboradores, Cargos, Permissões Granulares e PIN de Supervisor (CAF-000036)
 */
(function() {
  'use strict';

  const pageUsuarios = document.getElementById('page-usuarios');
  if (!pageUsuarios) return;

  // Sub-abas
  const btnTabColabs = document.getElementById('btn-tab-usuarios-colabs');
  const btnTabCargos = document.getElementById('btn-tab-usuarios-cargos');
  const subtabColabs = document.getElementById('subtab-usuarios-colabs');
  const subtabCargos = document.getElementById('subtab-usuarios-cargos');

  // Botões do Topo
  const btnNovoUsuario = document.getElementById('btn-novo-usuario');
  const btnNovoCargo = document.getElementById('btn-novo-cargo');

  // Tabelas
  const tbodyUsuarios = document.getElementById('usuarios-table-body');
  const tbodyCargos = document.getElementById('cargos-table-body');

  // Modal Novo / Editar Usuário
  const modalUsuarioOverlay = document.getElementById('modal-usuario-overlay');
  const modalUsuarioTitle = document.getElementById('modal-usuario-title');
  const modalUsuarioClose = document.getElementById('modal-usuario-close');
  const modalUsuarioCancel = document.getElementById('modal-usuario-cancel');
  const formUsuario = document.getElementById('form-usuario');
  const inputNome = document.getElementById('usuario-nome');
  const inputEmail = document.getElementById('usuario-email');
  const inputSenha = document.getElementById('usuario-senha');
  const selectCargo = document.getElementById('usuario-cargo');
  const inputPin = document.getElementById('usuario-pin');
  const btnSalvarUsuario = document.getElementById('btn-salvar-usuario');

  // Modal Cargo & Permissões
  const modalCargoOverlay = document.getElementById('modal-cargo-overlay');
  const modalCargoTitle = document.getElementById('modal-cargo-title');
  const modalCargoClose = document.getElementById('modal-cargo-close');
  const modalCargoCancel = document.getElementById('modal-cargo-cancel');
  const formCargo = document.getElementById('form-cargo');
  const formCargoId = document.getElementById('form-cargo-id');
  const formCargoNome = document.getElementById('form-cargo-nome');
  const formCargoDesc = document.getElementById('form-cargo-desc');
  const cargoSistemaAviso = document.getElementById('cargo-sistema-aviso');
  const chkPermAdminUsuarios = document.getElementById('chk-perm-admin-usuarios');
  const btnSalvarCargo = document.getElementById('btn-salvar-cargo');

  // Modal PIN Supervisor
  const modalPinOverlay = document.getElementById('modal-pin-usuario-overlay');
  const modalPinClose = document.getElementById('modal-pin-usuario-close');
  const modalPinCancel = document.getElementById('modal-pin-usuario-cancel');
  const formPinUserId = document.getElementById('form-pin-user-id');
  const formPinUserNome = document.getElementById('form-pin-user-nome');
  const formPinNovo = document.getElementById('form-pin-novo');
  const btnSalvarPin = document.getElementById('btn-salvar-pin-usuario');

  // Caches
  let cargosCache = [];
  let usuariosCache = [];
  let initialized = false;

  function showToast(msg, tipo = 'info') {
    if (window.cafeteriaAdmin && typeof window.cafeteriaAdmin.showToast === 'function') {
      window.cafeteriaAdmin.showToast(msg, tipo);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, tipo);
    } else {
      console.log(`[${tipo.toUpperCase()}] ${msg}`);
    }
  }

  // --- Sub-abas Navigation ---
  function switchSubtab(aba) {
    if (aba === 'colabs') {
      btnTabColabs.classList.add('active');
      btnTabColabs.style.background = '#fff';
      btnTabColabs.style.color = '#1e293b';
      btnTabCargos.classList.remove('active');
      btnTabCargos.style.background = '#f8fafc';
      btnTabCargos.style.color = '#64748b';

      subtabColabs.style.display = 'block';
      subtabCargos.style.display = 'none';
      if (btnNovoUsuario) btnNovoUsuario.style.display = 'inline-block';
      if (btnNovoCargo) btnNovoCargo.style.display = 'none';
    } else {
      btnTabCargos.classList.add('active');
      btnTabCargos.style.background = '#fff';
      btnTabCargos.style.color = '#1e293b';
      btnTabColabs.classList.remove('active');
      btnTabColabs.style.background = '#f8fafc';
      btnTabColabs.style.color = '#64748b';

      subtabColabs.style.display = 'none';
      subtabCargos.style.display = 'block';
      if (btnNovoUsuario) btnNovoUsuario.style.display = 'none';
      if (btnNovoCargo) btnNovoCargo.style.display = 'inline-block';
      renderCargos();
    }
  }

  // --- Inicialização ---
  window.loadUsuarios = async function() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    await carregarCargos();
    await carregarUsuarios();
  };

  function bindEvents() {
    if (btnTabColabs) btnTabColabs.addEventListener('click', () => switchSubtab('colabs'));
    if (btnTabCargos) btnTabCargos.addEventListener('click', () => switchSubtab('cargos'));

    // Modal Usuário
    if (btnNovoUsuario) btnNovoUsuario.addEventListener('click', () => abrirModalUsuario());
    if (modalUsuarioClose) modalUsuarioClose.addEventListener('click', fecharModalUsuario);
    if (modalUsuarioCancel) modalUsuarioCancel.addEventListener('click', fecharModalUsuario);
    if (modalUsuarioOverlay) {
      modalUsuarioOverlay.addEventListener('click', e => {
        if (e.target === modalUsuarioOverlay) fecharModalUsuario();
      });
    }
    if (formUsuario) {
      formUsuario.addEventListener('submit', e => {
        e.preventDefault();
        salvarUsuario();
      });
    }
    if (btnSalvarUsuario) btnSalvarUsuario.addEventListener('click', salvarUsuario);

    // Modal Cargo
    if (btnNovoCargo) btnNovoCargo.addEventListener('click', () => abrirModalCargo());
    if (modalCargoClose) modalCargoClose.addEventListener('click', fecharModalCargo);
    if (modalCargoCancel) modalCargoCancel.addEventListener('click', fecharModalCargo);
    if (modalCargoOverlay) {
      modalCargoOverlay.addEventListener('click', e => {
        if (e.target === modalCargoOverlay) fecharModalCargo();
      });
    }
    if (btnSalvarCargo) btnSalvarCargo.addEventListener('click', salvarCargo);

    // Modal PIN
    if (modalPinClose) modalPinClose.addEventListener('click', fecharModalPin);
    if (modalPinCancel) modalPinCancel.addEventListener('click', fecharModalPin);
    if (modalPinOverlay) {
      modalPinOverlay.addEventListener('click', e => {
        if (e.target === modalPinOverlay) fecharModalPin();
      });
    }
    if (btnSalvarPin) btnSalvarPin.addEventListener('click', salvarPin);
  }

  // --- Carregamento de Cargos ---
  async function carregarCargos() {
    try {
      const db = window.cafeteriaDB?.cargos;
      if (!db) return;
      cargosCache = await db.all();

      // Popula select de cargos no modal de usuário
      if (selectCargo) {
        selectCargo.innerHTML = '<option value="">Selecione um cargo...</option>' +
          cargosCache.map(c => `<option value="${c.id}">${c.nome} ${c.sistema ? '(Sistema)' : ''}</option>`).join('');
      }

      renderCargos();
    } catch (err) {
      console.error('Erro ao carregar cargos:', err);
    }
  }

  function renderCargos() {
    if (!tbodyCargos) return;

    if (cargosCache.length === 0) {
      tbodyCargos.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">Nenhum cargo cadastrado.</td></tr>`;
      return;
    }

    tbodyCargos.innerHTML = cargosCache.map(c => {
      const permissoes = (c.cargo_permissoes || []).map(cp => cp.permissao);
      const isSistema = Boolean(c.sistema);

      const tipoBadge = isSistema
        ? `<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">🔒 Sistema</span>`
        : `<span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:12px; font-size:11px;">Custom</span>`;

      // Formata tags de permissões
      const permsBadge = c.nome === 'Admin'
        ? `<span style="font-size:12px; color:#15803d; font-weight:600;">⭐ Acesso Total (Todas as Permissões)</span>`
        : permissoes.length > 0
          ? `<div style="display:flex; flex-wrap:wrap; gap:4px; max-width:400px;">
              ${permissoes.map(p => `<span style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:2px 6px; font-size:10px; color:#334155;">${p}</span>`).join('')}
             </div>`
          : `<span style="font-size:12px; color:#94a3b8; font-style:italic;">Nenhuma permissão vinculada</span>`;

      const btnEditar = `<button class="btn btn--ghost btn-sm btn-editar-cargo" data-id="${c.id}" title="Editar permissões do cargo" style="padding:4px 8px; font-size:12px;">✏️ Permissões</button>`;
      const btnExcluir = !isSistema
        ? `<button class="btn btn--ghost btn-sm btn-excluir-cargo" data-id="${c.id}" title="Excluir cargo" style="padding:4px 8px; font-size:12px; color:#dc2626;">🗑️</button>`
        : '';

      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 12px; font-weight:600; color:#1e293b;">${c.nome}</td>
          <td style="padding:10px 12px; font-size:13px; color:#475569;">${c.descricao || '--'}</td>
          <td style="padding:10px 12px; text-align:center;">${tipoBadge}</td>
          <td style="padding:10px 12px;">${permsBadge}</td>
          <td style="padding:10px 12px; text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
              ${btnEditar}
              ${btnExcluir}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbodyCargos.querySelectorAll('.btn-editar-cargo').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cargo = cargosCache.find(c => c.id === id);
        if (cargo) abrirModalCargo(cargo);
      });
    });

    tbodyCargos.querySelectorAll('.btn-excluir-cargo').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        excluirCargo(id);
      });
    });
  }

  // --- Carregamento de Usuários ---
  async function carregarUsuarios() {
    if (!tbodyUsuarios) return;
    tbodyUsuarios.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Carregando colaboradores...</td></tr>';

    try {
      const { data, error } = await window.cafeteriaSupabase
        .from('perfis')
        .select('*, cargo:cargos(id, nome, sistema)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      usuariosCache = data || [];
      renderUsuarios();
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      tbodyUsuarios.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Erro ao carregar colaboradores: ${err.message}</td></tr>`;
    }
  }

  function renderUsuarios() {
    if (!tbodyUsuarios) return;

    if (usuariosCache.length === 0) {
      tbodyUsuarios.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    tbodyUsuarios.innerHTML = usuariosCache.map(u => {
      const cargoNome = u.cargo?.nome || (u.role ? u.role.toUpperCase() : 'Sem Cargo');
      const dataCriacao = new Date(u.created_at).toLocaleDateString('pt-BR');

      // Badge Cargo
      let badgeCor = '#f1f5f9';
      let textoCor = '#334155';
      if (cargoNome.toLowerCase().includes('admin')) {
        badgeCor = '#dcfce7'; textoCor = '#15803d';
      } else if (cargoNome.toLowerCase().includes('gerente')) {
        badgeCor = '#e0e7ff'; textoCor = '#3730a3';
      } else if (cargoNome.toLowerCase().includes('barista') || cargoNome.toLowerCase().includes('atendente')) {
        badgeCor = '#ffedd5'; textoCor = '#c2410c';
      } else if (cargoNome.toLowerCase().includes('cozinha')) {
        badgeCor = '#fef3c7'; textoCor = '#b45309';
      }

      const cargoBadge = `<span style="background:${badgeCor}; color:${textoCor}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">${cargoNome}</span>`;

      // PIN Status
      const pinBadge = u.pin_hash
        ? `<span style="color:#15803d; font-size:12px; font-weight:600;" title="PIN configurado para liberação">🔑 Ativo</span>`
        : `<span style="color:#94a3b8; font-size:12px;">⚪ Sem PIN</span>`;

      // Status Ativo
      const statusBadge = u.ativo
        ? `<span style="background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Ativo</span>`
        : `<span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Inativo</span>`;

      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 12px; font-weight:600; color:#1e293b;">${u.nome}</td>
          <td style="padding:10px 12px; font-size:13px; color:#64748b;"><em>Registrado no Auth</em></td>
          <td style="padding:10px 12px;">${cargoBadge}</td>
          <td style="padding:10px 12px; text-align:center;">${pinBadge}</td>
          <td style="padding:10px 12px; text-align:center;">${statusBadge}</td>
          <td style="padding:10px 12px; font-size:12px; color:#64748b;">${dataCriacao}</td>
          <td style="padding:10px 12px; text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center; align-items:center;">
              <button class="btn btn--ghost btn-sm btn-definir-pin" data-id="${u.id}" data-nome="${u.nome}" title="Configurar PIN de Supervisor" style="padding:4px 8px; font-size:12px;">🔑 PIN</button>
              <button class="btn btn--ghost btn-sm btn-alterar-cargo" data-id="${u.id}" data-cargo="${u.cargo_id || ''}" title="Alterar Cargo do Colaborador" style="padding:4px 8px; font-size:12px;">🛡️ Cargo</button>
              <button class="btn btn--ghost btn-sm btn-toggle-ativo" data-id="${u.id}" data-ativo="${u.ativo}" title="Alternar Status" style="padding:4px 8px; font-size:12px; color:${u.ativo ? '#b91c1c' : '#15803d'};">
                ${u.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbodyUsuarios.querySelectorAll('.btn-definir-pin').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const nome = btn.getAttribute('data-nome');
        abrirModalPin(id, nome);
      });
    });

    tbodyUsuarios.querySelectorAll('.btn-alterar-cargo').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cargoAtual = btn.getAttribute('data-cargo');
        alterarCargoUsuario(id, cargoAtual);
      });
    });

    tbodyUsuarios.querySelectorAll('.btn-toggle-ativo').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const ativo = btn.getAttribute('data-ativo') === 'true';
        alternarStatusUsuario(id, !ativo);
      });
    });
  }

  // --- Modal Novo Usuário ---
  function abrirModalUsuario() {
    if (!modalUsuarioOverlay) return;
    formUsuario.reset();
    if (modalUsuarioTitle) modalUsuarioTitle.textContent = 'Novo Usuário';
    if (inputEmail) inputEmail.disabled = false;
    modalUsuarioOverlay.classList.add('open');
    if (inputNome) inputNome.focus();
  }

  function fecharModalUsuario() {
    if (modalUsuarioOverlay) modalUsuarioOverlay.classList.remove('open');
  }

  async function salvarUsuario() {
    const nome = inputNome.value.trim();
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;
    const cargoId = selectCargo.value;
    const pin = inputPin.value.trim();

    if (!nome) {
      showToast('Por favor, preencha o nome do colaborador.', 'warning');
      inputNome.focus();
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('Por favor, informe um e-mail válido.', 'warning');
      inputEmail.focus();
      return;
    }
    if (!senha || senha.length < 6) {
      showToast('A senha deve conter no mínimo 6 caracteres.', 'warning');
      inputSenha.focus();
      return;
    }
    if (!cargoId) {
      showToast('Selecione um cargo para o colaborador.', 'warning');
      selectCargo.focus();
      return;
    }

    if (pin && (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin))) {
      showToast('O PIN de supervisor deve conter entre 4 e 8 dígitos numéricos.', 'warning');
      inputPin.focus();
      return;
    }

    // Identifica role compatível com base no cargo
    const cargoObj = cargosCache.find(c => c.id === cargoId);
    let roleCompativel = 'barista';
    if (cargoObj) {
      const nomeLower = cargoObj.nome.toLowerCase();
      if (nomeLower.includes('admin')) roleCompativel = 'admin';
      else if (nomeLower.includes('cozinha')) roleCompativel = 'cozinha';
    }

    const originalText = btnSalvarUsuario.textContent;
    btnSalvarUsuario.textContent = 'Criando Usuário...';
    btnSalvarUsuario.disabled = true;

    try {
      const { data, error } = await window.cafeteriaSupabase.rpc('admin_create_user', {
        email: email,
        password: senha,
        nome: nome,
        role_param: roleCompativel,
        pode_dar_desconto_param: true
      });

      if (error) throw error;

      const newUserId = data.id;

      // Atualiza o cargo_id na tabela perfis
      const { error: updErr } = await window.cafeteriaSupabase
        .from('perfis')
        .update({ cargo_id: cargoId })
        .eq('id', newUserId);

      if (updErr) console.warn('Aviso ao vincular cargo:', updErr);

      // Define PIN se informado
      if (pin) {
        await window.cafeteriaDB.cargos.setPin(newUserId, pin);
      }

      showToast(`Colaborador ${nome} criado com sucesso!`, 'success');
      fecharModalUsuario();
      await carregarUsuarios();
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
      showToast('Erro ao criar usuário: ' + (err.message || err), 'error');
    } finally {
      btnSalvarUsuario.textContent = originalText;
      btnSalvarUsuario.disabled = false;
    }
  }

  // --- Modal Cargo & Permissões ---
  function abrirModalCargo(cargo = null) {
    if (!modalCargoOverlay) return;
    formCargo.reset();

    const checkboxes = modalCargoOverlay.querySelectorAll('.cargo-perm-chk');
    checkboxes.forEach(chk => {
      chk.checked = false;
      chk.disabled = false;
    });

    if (cargo) {
      modalCargoTitle.textContent = `Editar Cargo: ${cargo.nome}`;
      formCargoId.value = cargo.id;
      formCargoNome.value = cargo.nome;
      formCargoDesc.value = cargo.descricao || '';

      const perms = (cargo.cargo_permissoes || []).map(cp => cp.permissao);
      checkboxes.forEach(chk => {
        if (perms.includes(chk.value) || cargo.nome === 'Admin') {
          chk.checked = true;
        }
      });

      if (cargo.sistema) {
        formCargoNome.disabled = true;
        if (cargoSistemaAviso) cargoSistemaAviso.style.display = 'block';
        if (cargo.nome === 'Admin' && chkPermAdminUsuarios) {
          chkPermAdminUsuarios.disabled = true;
          chkPermAdminUsuarios.checked = true;
        }
      } else {
        formCargoNome.disabled = false;
        if (cargoSistemaAviso) cargoSistemaAviso.style.display = 'none';
      }
    } else {
      modalCargoTitle.textContent = 'Novo Cargo';
      formCargoId.value = '';
      formCargoNome.disabled = false;
      if (cargoSistemaAviso) cargoSistemaAviso.style.display = 'none';
    }

    modalCargoOverlay.classList.add('open');
    if (formCargoNome) formCargoNome.focus();
  }

  function fecharModalCargo() {
    if (modalCargoOverlay) modalCargoOverlay.classList.remove('open');
  }

  async function salvarCargo() {
    const id = formCargoId.value;
    const nome = formCargoNome.value.trim();
    const descricao = formCargoDesc.value.trim();

    if (!nome) {
      showToast('O nome do cargo é obrigatório.', 'warning');
      formCargoNome.focus();
      return;
    }

    const checkboxes = modalCargoOverlay.querySelectorAll('.cargo-perm-chk:checked');
    const permissoes = Array.from(checkboxes).map(c => c.value);

    // Proteção Admin
    const cargoExistente = cargosCache.find(c => c.id === id);
    if (cargoExistente && cargoExistente.nome === 'Admin') {
      if (!permissoes.includes('admin.usuarios')) {
        permissoes.push('admin.usuarios');
      }
    }

    try {
      const db = window.cafeteriaDB?.cargos;
      if (!db) return;

      if (id) {
        await db.update(id, { nome, descricao, permissoes });
        showToast('Cargo e permissões atualizados!', 'success');
      } else {
        await db.create({ nome, descricao, permissoes });
        showToast('Novo cargo criado com sucesso!', 'success');
      }

      fecharModalCargo();
      await carregarCargos();
    } catch (err) {
      console.error('Erro ao salvar cargo:', err);
      showToast('Erro ao salvar cargo: ' + (err.message || err), 'error');
    }
  }

  async function excluirCargo(id) {
    const cargo = cargosCache.find(c => c.id === id);
    if (!cargo) return;

    if (cargo.sistema) {
      showToast('Cargos padrão do sistema não podem ser excluídos.', 'warning');
      return;
    }

    const conf = confirm(`Deseja realmente excluir o cargo "${cargo.nome}"? Usuários vinculados a ele ficarão sem cargo definido.`);
    if (!conf) return;

    try {
      await window.cafeteriaDB.cargos.delete(id);
      showToast('Cargo excluído com sucesso.', 'success');
      await carregarCargos();
      await carregarUsuarios();
    } catch (err) {
      showToast('Erro ao excluir cargo: ' + err.message, 'error');
    }
  }

  // --- Modal PIN Supervisor ---
  function abrirModalPin(userId, userNome) {
    if (!modalPinOverlay) return;
    formPinUserId.value = userId;
    formPinUserNome.textContent = userNome;
    formPinNovo.value = '';
    modalPinOverlay.classList.add('open');
    formPinNovo.focus();
  }

  function fecharModalPin() {
    if (modalPinOverlay) modalPinOverlay.classList.remove('open');
  }

  async function salvarPin() {
    const userId = formPinUserId.value;
    const pin = formPinNovo.value.trim();

    if (pin && (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin))) {
      showToast('O PIN deve conter entre 4 e 8 dígitos numéricos.', 'warning');
      formPinNovo.focus();
      return;
    }

    try {
      await window.cafeteriaDB.cargos.setPin(userId, pin);
      showToast(pin ? 'PIN configurado com sucesso!' : 'PIN removido.', 'success');
      fecharModalPin();
      await carregarUsuarios();
    } catch (err) {
      console.error('Erro ao salvar PIN:', err);
      showToast('Erro ao salvar PIN: ' + err.message, 'error');
    }
  }

  // --- Alterar Cargo Rápido do Usuário ---
  async function alterarCargoUsuario(userId, cargoAtualId) {
    const cargoNomePrompt = prompt(
      'Selecione o novo cargo digitando o NOME exato:\n' +
      cargosCache.map(c => `• ${c.nome}`).join('\n')
    );
    if (!cargoNomePrompt) return;

    const cargoAlvo = cargosCache.find(c => c.nome.toLowerCase() === cargoNomePrompt.trim().toLowerCase());
    if (!cargoAlvo) {
      showToast(`Cargo "${cargoNomePrompt}" não encontrado.`, 'warning');
      return;
    }

    try {
      const { error } = await window.cafeteriaSupabase
        .from('perfis')
        .update({ cargo_id: cargoAlvo.id })
        .eq('id', userId);

      if (error) throw error;
      showToast(`Cargo atualizado para "${cargoAlvo.nome}"!`, 'success');
      await carregarUsuarios();
    } catch (err) {
      showToast('Erro ao alterar cargo: ' + err.message, 'error');
    }
  }

  // --- Alternar Ativo/Inativo ---
  async function alternarStatusUsuario(userId, novoStatus) {
    const acao = novoStatus ? 'ativar' : 'desativar';
    if (!confirm(`Deseja realmente ${acao} este colaborador?`)) return;

    try {
      const { error } = await window.cafeteriaSupabase
        .from('perfis')
        .update({ ativo: novoStatus })
        .eq('id', userId);

      if (error) throw error;
      showToast(`Colaborador ${novoStatus ? 'ativado' : 'desativado'}.`, 'success');
      await carregarUsuarios();
    } catch (err) {
      showToast('Erro ao atualizar status: ' + err.message, 'error');
    }
  }

  // Carrega se estiver na página
  window.loadUsuarios();

})();
