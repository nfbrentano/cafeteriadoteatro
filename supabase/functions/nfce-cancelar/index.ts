const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

export function createNfceCancelarHandler({ envGet, supabaseClient, fetchImpl = globalThis.fetch } = {}) {
  return async function handleNfceCancelar(req) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
      const body = await req.json();
      const notaId = body?.nota_id;
      const motivo = String(body?.motivo || '').trim();
      const pin = body?.pin || null;

      if (!notaId) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: 'Parâmetro nota_id é obrigatório.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (motivo.length < 15) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: 'O motivo de cancelamento deve conter no mínimo 15 caracteres.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Executa o cancelamento no banco via RPC com verificação de permissão e PIN (CA08)
      const { data, error } = await supabaseClient.rpc('cancelar_nfce', {
        p_nota_id: notaId,
        p_motivo: motivo,
        p_pin: pin
      });

      if (error) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: error.message }),
          { status: error.message.includes('Permissão') ? 403 : 400, headers: CORS_HEADERS }
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: err?.message || 'Erro ao cancelar NFC-e' }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  };
}

if (typeof globalThis.Deno !== 'undefined' && typeof globalThis.Deno.serve === 'function') {
  globalThis.Deno.serve(async (req) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = globalThis.Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = globalThis.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const handler = createNfceCancelarHandler({
      envGet: (name) => globalThis.Deno.env.get(name),
      supabaseClient,
      fetchImpl: fetch
    });
    return handler(req);
  });
}
