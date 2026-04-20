/* =========================================================
   SUPABASE-CLIENT.JS — Inicialização do Cliente
   ========================================================= */

// Credenciais dinâmicas enviadas pelo usuário
const SUPABASE_URL = 'https://nyretgvzbnbtiyeioeju.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55cmV0Z3Z6Ym5idGl5ZWlvZWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDMyNjUsImV4cCI6MjA5MjAxOTI2NX0.095yucTEyF_aZx9BnWDkGKT6439r_S8PCPmJt_TlP3Q';

// Inicializar cliente global (window.supabase vem do SDK via CDN)
if (!window.supabase) {
  console.error('Supabase SDK não carregado! Verifique a conexão com a CDN.');
}

const _supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso global
window.cafeteriaSupabase = _supabaseInstance;
