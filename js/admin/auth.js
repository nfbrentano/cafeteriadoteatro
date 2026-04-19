/* =========================================================
   ADMIN/AUTH.JS — Lógica de Autenticação
   ========================================================= */

(function () {
  'use strict';

  const loginScreen = document.getElementById('login-screen');
  const adminApp    = document.getElementById('admin-app');
  const loginForm   = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');

  // Listeners de Login
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-user').value.trim();
      const pass  = document.getElementById('login-pass').value;
      const btn   = document.getElementById('login-btn');
      
      const admin = window.cafeteriaAdmin;
      admin.clearFieldError('login-user', 'err-login-user');
      admin.clearFieldError('login-pass', 'err-login-pass');

      if (!email) return admin.showFieldError('login-user', 'err-login-user', 'Digite seu e-mail.');
      if (!pass) return admin.showFieldError('login-pass', 'err-login-pass', 'Digite sua senha.');

      btn.disabled = true;
      btn.textContent = 'Autenticando...';

      const { data, error } = await window.cafeteriaSupabase.auth.signInWithPassword({
        email,
        password: pass
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = 'Entrar no Painel';
        loginError.textContent = error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message;
        loginError.classList.add('visible');
        return;
      }

      // Sucesso
      admin.session.isLoggedIn = true;
      admin.session.user = data.user;
      showApp();
    });
  }

  async function logout() {
    await window.cafeteriaSupabase.auth.signOut();
    window.location.reload(); // Simplifica o reset de estado
  }

  function showApp() {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    
    const user = window.cafeteriaAdmin.session.user;
    document.getElementById('user-name-display').textContent = user.email.split('@')[0];
    document.getElementById('user-avatar').textContent = user.email[0].toUpperCase();

    window.cafeteriaAdmin.loadData();
    window.cafeteriaAdmin.navigateTo('dashboard');
    
    // Subscribe to realtime changes
    window.cafeteriaDB.subscribeToChanges(() => window.cafeteriaAdmin.loadData());
  }

  // Verificar sessão ao carregar
  (async function checkSession() {
    const { data } = await window.cafeteriaSupabase.auth.getSession();
    if (data.session) {
      window.cafeteriaAdmin.session.isLoggedIn = true;
      window.cafeteriaAdmin.session.user = data.session.user;
      showApp();
    }
  })();

  // Expor logout globalmente para o botão no HTML
  document.getElementById('btn-logout')?.addEventListener('click', logout);
  document.getElementById('btn-logout-topbar')?.addEventListener('click', logout);

})();
