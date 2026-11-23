import { criarCobrancaNoPsp, gerarTxidDinamico } from '../_shared/pix-psp.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

export function createPixCriarCobrancaHandler({ envGet, supabaseClient, fetchImpl } = {}) {
  return async function handleCriarCobrancaPix(req) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
      const body = await req.json();
      const provedor = String(
        body?.provedor || envGet?.('PIX_PSP_PROVIDER') || 'sandbox'
      ).trim().toLowerCase();
      const accessToken = envGet?.('PIX_PSP_ACCESS_TOKEN') || '';
      const txid = body?.txid || gerarTxidDinamico({
        pedidoId: body?.pedido_id,
        mesaCodigo: body?.mesa_codigo,
        canal: body?.canal || 'totem'
      });

      const expiracaoMin = Number(body?.expiracao_min) || (body?.canal === 'online' ? 30 : 10);

      const pspRes = await criarCobrancaNoPsp({
        provedor,
        accessToken,
        valor: body?.valor,
        txid,
        descricao: body?.descricao || 'Cafeteria do Teatro',
        expiracaoMin,
        brcodeFallback: body?.brcode_fallback || '',
        fetchImpl
      });

      const { data, error } = await supabaseClient.rpc('criar_cobranca_pix', {
        p_pedido_id: body?.pedido_id ?? null,
        p_mesa_codigo: body?.mesa_codigo ?? null,
        p_valor: Number(body?.valor || 0),
        p_canal: body?.canal || 'totem',
        p_txid: pspRes.txid,
        p_brcode: pspRes.brcode,
        p_provedor: pspRes.provedor,
        p_expiracao_min: expiracaoMin,
        p_parte_nome: body?.parte_nome ?? null,
        p_fechamento_payload: body?.fechamento_payload ?? null,
        p_psp_transacao_id: pspRes.pspTransacaoId,
        p_qr_code_base64: pspRes.qrCodeBase64
      });

      if (error) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: error.message }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      return new Response(JSON.stringify(data), { status: 200, headers: CORS_HEADERS });
    } catch (err) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: err?.message || 'Erro ao criar cobrança Pix' }),
        { status: 502, headers: CORS_HEADERS }
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
    const handler = createPixCriarCobrancaHandler({
      envGet: (name) => globalThis.Deno.env.get(name),
      supabaseClient,
      fetchImpl: fetch
    });
    return handler(req);
  });
}
