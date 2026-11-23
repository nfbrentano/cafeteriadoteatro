import {
  validarDadosFiscaisItens,
  despacharNfceParaProvedor,
  limparDigitos
} from '../_shared/nfce-provider.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

export function createNfceEmitirHandler({ envGet, supabaseClient, fetchImpl = globalThis.fetch } = {}) {
  return async function handleNfceEmitir(req) {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
      const body = await req.json();
      const fechamentoId = body?.fechamento_id;
      if (!fechamentoId) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: 'Parâmetro fechamento_id é obrigatório.' }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const cpfCnpjLimpo = limparDigitos(body?.consumidor_cpf_cnpj || '');
      const consumidorNome = body?.consumidor_nome || null;

      // 1. Obter dados do fechamento e validar cadastro fiscal dos produtos (CA01)
      const { data: dadosFiscais, error: fiscalErr } = await supabaseClient
        .rpc('obter_dados_fiscais_fechamento', { p_fechamento_id: fechamentoId });

      if (fiscalErr) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: fiscalErr.message }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (dadosFiscais?.incompleto) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            erro: 'Produtos sem dados fiscais obrigatórios (NCM ou CFOP).',
            produtos_incompletos: dadosFiscais.produtos_incompletos || []
          }),
          { status: 422, headers: CORS_HEADERS }
        );
      }

      // Validação adicional dos itens montados
      const validacaoItens = validarDadosFiscaisItens(dadosFiscais?.itens || []);
      if (!validacaoItens.valido) {
        return new Response(
          JSON.stringify({
            sucesso: false,
            erro: 'Itens com dados fiscais incompletos.',
            produtos_incompletos: validacaoItens.produtosIncompletos
          }),
          { status: 422, headers: CORS_HEADERS }
        );
      }

      const provedor = String(
        body?.provedor || envGet?.('NFCE_PROVIDER') || 'sandbox'
      ).trim().toLowerCase();
      const apiKey = envGet?.('NFCE_API_KEY') || '';
      const ambiente = String(envGet?.('NFCE_AMBIENTE') || 'homologacao').toLowerCase();

      // 2. Preparar payload para o provedor
      const payloadEnvio = {
        fechamentoId,
        consumidorCpfCnpj: cpfCnpjLimpo || null,
        consumidorNome,
        itens: dadosFiscais.itens,
        formasPagamento: dadosFiscais.formas_pagamento,
        total: dadosFiscais.total_conta,
        desconto: dadosFiscais.desconto_manual,
        simularRejeicao: Boolean(body?.simular_rejeicao),
        simularTimeout: Boolean(body?.simular_timeout),
        contingencia: Boolean(body?.contingencia)
      };

      let resProvedor;
      let statusNota = 'autorizada';
      let motivoStatus = 'Autorizado o uso da NFC-e';

      try {
        resProvedor = await despacharNfceParaProvedor({
          provedor,
          apiKey,
          ambiente,
          notaPayload: payloadEnvio,
          fetchImpl
        });

        if (!resProvedor.sucesso && resProvedor.status === 'rejeitada') {
          statusNota = 'rejeitada';
          motivoStatus = resProvedor.motivo;
        } else if (resProvedor.status === 'contingencia') {
          statusNota = 'contingencia';
          motivoStatus = 'Emitida em contingência offline';
        }
      } catch (timeoutErr) {
        // CA09: Provedor indisponível / timeout -> não quebra a venda, registra contingência
        statusNota = 'contingencia';
        motivoStatus = `Provedor indisponível: ${timeoutErr?.message || 'Timeout'}. Salvo em contingência.`;
        resProvedor = {
          sucesso: false,
          status: 'contingencia',
          motivo: motivoStatus,
          chaveAcesso: null,
          protocolo: null,
          qrCodeUrl: null
        };
      }

      // 3. Registrar nota fiscal no banco via RPC idempotente (CA03, CA04, CA07, CA09)
      const { data: notaRegistrada, error: regErr } = await supabaseClient.rpc(
        'registrar_emissao_nfce',
        {
          p_fechamento_id: fechamentoId,
          p_consumidor_cpf_cnpj: cpfCnpjLimpo || null,
          p_consumidor_nome: consumidorNome,
          p_itens: dadosFiscais.itens,
          p_formas_pagamento: dadosFiscais.formas_pagamento,
          p_chave_acesso: resProvedor?.chaveAcesso || null,
          p_numero: null,
          p_serie: 1,
          p_status: statusNota,
          p_protocolo: resProvedor?.protocolo || null,
          p_motivo_status: motivoStatus,
          p_qr_code_url: resProvedor?.qrCodeUrl || null,
          p_danfe_url: resProvedor?.danfeUrl || null,
          p_xml_url: resProvedor?.xmlUrl || null,
          p_ambiente: ambiente,
          p_provedor: provedor,
          p_payload_envio: payloadEnvio,
          p_resposta_provedor: resProvedor
        }
      );

      if (regErr) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: regErr.message }),
          { status: 500, headers: CORS_HEADERS }
        );
      }

      if (statusNota === 'rejeitada') {
        // CA07: Venda concluída, mas nota pendente com aviso de rejeição
        return new Response(
          JSON.stringify({
            sucesso: false,
            status: 'rejeitada',
            motivo: motivoStatus,
            fechamento_fechado: true,
            nota: notaRegistrada?.nota
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({
          sucesso: true,
          status: statusNota,
          ja_emitida: Boolean(notaRegistrada?.ja_emitida),
          nota: notaRegistrada?.nota
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: err?.message || 'Erro inesperado na emissão de NFC-e' }),
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
    const handler = createNfceEmitirHandler({
      envGet: (name) => globalThis.Deno.env.get(name),
      supabaseClient,
      fetchImpl: fetch
    });
    return handler(req);
  });
}
