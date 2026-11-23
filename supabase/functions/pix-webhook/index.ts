import { extrairEventoWebhookPsp, validarAssinaturaWebhookPsp } from '../_shared/pix-psp.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

export function createPixWebhookHandler({ envGet, supabaseClient } = {}) {
  return async function handlePixWebhook(req) {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ erro: 'Method not allowed' }), {
        status: 405,
        headers: JSON_HEADERS
      });
    }

    const rawBody = await req.text();
    let parsedBody = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      return new Response(JSON.stringify({ erro: 'JSON inválido' }), {
        status: 400,
        headers: JSON_HEADERS
      });
    }

    const url = new URL(req.url, 'http://localhost');
    const provedor = String(
      url.searchParams.get('provedor') ||
      parsedBody?.provedor ||
      envGet?.('PIX_PSP_PROVIDER') ||
      'mercadopago'
    ).trim().toLowerCase();

    const secret = envGet?.('PIX_PSP_WEBHOOK_SECRET') || '';
    const authCheck = await validarAssinaturaWebhookPsp({
      provedor,
      headers: req.headers,
      rawBody,
      parsedBody,
      secret
    });

    if (!authCheck.valido) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: authCheck.motivo || 'Assinatura inválida' }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    const evento = extrairEventoWebhookPsp({ provedor, body: parsedBody });
    if (!evento.txid) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'txid ausente na notificação' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!evento.pagoConfirmado) {
      return new Response(
        JSON.stringify({ sucesso: true, ignorado: true, motivo: 'Evento não representa quitação confirmada.' }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    const { data, error } = await supabaseClient.rpc('processar_webhook_pix', {
      p_txid: evento.txid,
      p_psp_transacao_id: evento.pspTransacaoId || null,
      p_valor_pago: evento.valorPago,
      p_taxa_psp: evento.taxaPsp,
      p_provedor: evento.provedor,
      p_payload: parsedBody
    });

    if (error) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: error.message }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
  };
}

if (typeof globalThis.Deno !== 'undefined' && typeof globalThis.Deno.serve === 'function') {
  globalThis.Deno.serve(async (req) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = globalThis.Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = globalThis.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    const handler = createPixWebhookHandler({
      envGet: (name) => globalThis.Deno.env.get(name),
      supabaseClient
    });
    return handler(req);
  });
}
