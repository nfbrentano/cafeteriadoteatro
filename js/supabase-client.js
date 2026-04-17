/* =========================================================
   SUPABASE-CLIENT.JS — Inicialização do Cliente
   ========================================================= */

// Credenciais dinâmicas enviadas pelo usuário
const SUPABASE_URL = 'https://nyretgvzbnbtiyeioeju.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bnPDU7PdZ7kufQZwJw6tnA_yHqL0XmJ';

// Inicializar cliente global (window.supabase vem do SDK via CDN)
if (!window.supabase) {
  console.error('Supabase SDK não carregado! Verifique a conexão com a CDN.');
}

const _supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar para uso global
window.cafeteriaSupabase = _supabaseInstance;
