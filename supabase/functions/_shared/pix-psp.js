/**
 * Adaptador Multi-PSP Compartilhado para Edge Functions Pix (CAF-000123)
 * Suporta: mercadopago, asaas e sandbox (homologação).
 * Compatível com Deno Edge Runtime e Node.js (Web Crypto API).
 */

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualStr(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (s1.length === 0 || s1.length !== s2.length) return false;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) {
    diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  }
  return diff === 0;
}

export async function calcularHmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
  return toHex(sig);
}

export function getHeaderInsensitive(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return headers.get(name) || headers.get(name.toLowerCase()) || '';
  }
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return String(v ?? '');
  }
  return '';
}

export function gerarTxidDinamico({ pedidoId = null, mesaCodigo = '', canal = 'totem' } = {}) {
  const prefix = canal === 'pdv' ? 'PDV' : canal === 'online' ? 'ONL' : 'TOT';
  const refPart = pedidoId
    ? String(pedidoId).replace(/[^A-Za-z0-9]/g, '')
    : String(mesaCodigo || 'CAF').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'CAF';
  const randBytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(randBytes);
  const randHex = Array.from(randBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `${prefix}${refPart}${randHex}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
}

export async function criarCobrancaNoPsp({
  provedor = 'sandbox',
  accessToken = '',
  valor,
  txid,
  descricao = 'Cafeteria do Teatro',
  expiracaoMin = 10,
  brcodeFallback = '',
  fetchImpl = globalThis.fetch
} = {}) {
  const psp = String(provedor || 'sandbox').trim().toLowerCase();
  const numValor = Number(Number(valor || 0).toFixed(2));
  if (!(numValor > 0)) {
    throw new Error('Valor inválido para cobrança Pix.');
  }

  const txidClean = String(txid || gerarTxidDinamico()).replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  const expMinutes = Math.max(1, Number(expiracaoMin || 10));
  const expDateIso = new Date(Date.now() + expMinutes * 60 * 1000).toISOString();

  if (psp === 'sandbox') {
    const brcode = brcodeFallback || `00020126360014br.gov.bcb.pix0114sandboxcafet25${txidClean}520400005303986540${numValor.toFixed(2)}5802BR5919CAFETERIA DO TEATRO6007LAJEADO62${String(txidClean.length + 4).padStart(2, '0')}05${String(txidClean.length).padStart(2, '0')}${txidClean}6304ABCD`;
    return {
      ok: true,
      provedor: 'sandbox',
      txid: txidClean,
      pspTransacaoId: `sbx_${txidClean}`,
      brcode,
      qrCodeBase64: null,
      expiraEm: expDateIso
    };
  }

  if (!accessToken) {
    throw new Error(`Credencial de acesso do PSP "${psp}" não configurada no servidor.`);
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Cliente HTTP (fetch) indisponível para comunicação com o PSP.');
  }

  if (psp === 'mercadopago') {
    const response = await fetchImpl('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': txidClean
      },
      body: JSON.stringify({
        transaction_amount: numValor,
        description: String(descricao || `Pedido ${txidClean}`).slice(0, 120),
        payment_method_id: 'pix',
        external_reference: txidClean,
        date_of_expiration: expDateIso,
        payer: {
          email: 'pagamentos@cafeteriadoteatro.com.br'
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || `Mercado Pago retornou HTTP ${response.status}`);
    }

    const txData = data?.point_of_interaction?.transaction_data || {};
    const brcode = txData.qr_code || brcodeFallback;
    if (!brcode) {
      throw new Error('Mercado Pago não retornou código Pix copia e cola.');
    }

    return {
      ok: true,
      provedor: 'mercadopago',
      txid: txidClean,
      pspTransacaoId: data?.id ? String(data.id) : `mp_${txidClean}`,
      brcode,
      qrCodeBase64: txData.qr_code_base64 || null,
      expiraEm: expDateIso
    };
  }

  if (psp === 'asaas') {
    const expFormatted = expDateIso.replace('T', ' ').slice(0, 19);
    const response = await fetchImpl('https://api.asaas.com/v3/pix/qrCodes/static', {
      method: 'POST',
      headers: {
        access_token: accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: numValor,
        description: String(descricao || `Pedido ${txidClean}`).slice(0, 100),
        format: 'ALL',
        expirationDate: expFormatted,
        externalReference: txidClean
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = data?.errors?.[0]?.description || `Asaas retornou HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    const brcode = data?.payload || brcodeFallback;
    if (!brcode) {
      throw new Error('Asaas não retornou payload Pix.');
    }

    return {
      ok: true,
      provedor: 'asaas',
      txid: txidClean,
      pspTransacaoId: data?.id ? String(data.id) : `asaas_${txidClean}`,
      brcode,
      qrCodeBase64: data?.encodedImage || null,
      expiraEm: expDateIso
    };
  }

  throw new Error(`Provedor Pix não suportado: ${psp}`);
}

export async function validarAssinaturaWebhookPsp({
  provedor = 'mercadopago',
  headers,
  rawBody = '',
  parsedBody = null,
  secret = ''
} = {}) {
  const psp = String(provedor || 'mercadopago').trim().toLowerCase();
  if (!secret) {
    return { valido: false, motivo: 'SECRET_NAO_CONFIGURADO' };
  }

  if (psp === 'asaas') {
    const token = getHeaderInsensitive(headers, 'asaas-access-token');
    if (!timingSafeEqualStr(token, secret)) {
      return { valido: false, motivo: 'TOKEN_ASAAS_INVALIDO' };
    }
    return { valido: true };
  }

  if (psp === 'mercadopago') {
    const xSignature = getHeaderInsensitive(headers, 'x-signature');
    const xRequestId = getHeaderInsensitive(headers, 'x-request-id');

    if (xSignature && xSignature.includes('v1=')) {
      const parts = {};
      for (const seg of xSignature.split(',')) {
        const [k, v] = seg.split('=').map((s) => s.trim());
        if (k && v) parts[k] = v;
      }
      const dataId = parsedBody?.data?.id || parsedBody?.id || '';
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts || ''};`;
      const esperadoManifest = await calcularHmacSha256Hex(secret, manifest);
      const esperadoRaw = await calcularHmacSha256Hex(secret, rawBody || '');
      if (timingSafeEqualStr(parts.v1, esperadoManifest) || timingSafeEqualStr(parts.v1, esperadoRaw)) {
        return { valido: true };
      }
      return { valido: false, motivo: 'ASSINATURA_MERCADOPAGO_INVALIDA' };
    }
  }

  const genericSig =
    getHeaderInsensitive(headers, 'x-pix-signature') ||
    getHeaderInsensitive(headers, 'x-signature');

  if (!genericSig) {
    return { valido: false, motivo: 'ASSINATURA_AUSENTE' };
  }

  const cleanSig = genericSig.replace(/^sha256=/i, '').trim();
  const expectedHex = await calcularHmacSha256Hex(secret, rawBody || '');
  if (!timingSafeEqualStr(cleanSig, expectedHex)) {
    return { valido: false, motivo: 'ASSINATURA_INVALIDA' };
  }

  return { valido: true };
}

export function extrairEventoWebhookPsp({ provedor = 'mercadopago', body = {} } = {}) {
  const psp = String(provedor || 'mercadopago').trim().toLowerCase();

  if (psp === 'asaas') {
    const payment = body?.payment || body;
    const statusStr = String(body?.event || payment?.status || '').toUpperCase();
    const valorBruto = Number(payment?.value || 0);
    const valorLiquido = payment?.netValue !== undefined ? Number(payment.netValue) : valorBruto;
    const taxaPsp = Math.max(0, Number((valorBruto - valorLiquido).toFixed(2)));
    return {
      provedor: 'asaas',
      txid: String(payment?.externalReference || payment?.txid || '').toUpperCase().trim(),
      pspTransacaoId: payment?.id ? String(payment.id) : '',
      valorPago: valorBruto,
      taxaPsp,
      pagoConfirmado: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'RECEIVED', 'CONFIRMED'].includes(statusStr)
    };
  }

  if (psp === 'mercadopago') {
    const pay = body?.data?.object || body?.data || body;
    const feeDetails = Array.isArray(pay?.fee_details) ? pay.fee_details : [];
    const taxaPsp = feeDetails.reduce((sum, f) => sum + Number(f?.amount || 0), 0);
    const statusStr = String(pay?.status || body?.action || '').toLowerCase();
    return {
      provedor: 'mercadopago',
      txid: String(pay?.external_reference || body?.external_reference || pay?.txid || body?.txid || '').toUpperCase().trim(),
      pspTransacaoId: pay?.id ? String(pay.id) : (body?.id ? String(body.id) : ''),
      valorPago: Number(pay?.transaction_amount ?? pay?.valor_pago ?? body?.transaction_amount ?? 0),
      taxaPsp: Number(taxaPsp.toFixed(2)),
      pagoConfirmado: ['approved', 'payment.updated', 'paid', 'pago'].includes(statusStr)
    };
  }

  // sandbox / genérico
  const statusStr = String(body?.status || 'pago').toLowerCase();
  return {
    provedor: psp,
    txid: String(body?.txid || body?.external_reference || '').toUpperCase().trim(),
    pspTransacaoId: String(body?.psp_transacao_id || body?.transaction_id || body?.id || ''),
    valorPago: Number(body?.valor_pago ?? body?.valor ?? 0),
    taxaPsp: body?.taxa_psp !== undefined && body?.taxa_psp !== null ? Number(body.taxa_psp) : null,
    pagoConfirmado: ['pago', 'paid', 'approved', 'confirmed'].includes(statusStr)
  };
}
