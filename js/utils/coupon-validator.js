/**
 * CAF-000061 — Validação e Aplicação de Cupons de Desconto
 * Utilitário compartilhado para Cardápio Público, Totem e PDV Barista
 */

export function normalizeCouponCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

export function calculateDiscount(tipo, valor, subtotal) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const val = Math.max(0, Number(valor) || 0);
  const tipoLimpo = String(tipo || 'percentual').toLowerCase();

  let desconto = 0;
  if (tipoLimpo === 'percentual' || tipoLimpo === 'percent' || tipoLimpo === '%') {
    desconto = (sub * val) / 100.0;
  } else {
    desconto = val;
  }

  // Desconto não pode ultrapassar o subtotal
  if (desconto > sub) {
    desconto = sub;
  }

  return Math.round((desconto + Number.EPSILON) * 100) / 100;
}

export function validateCouponLocally(coupon, subtotal) {
  const sub = Math.max(0, Number(subtotal) || 0);

  if (!coupon || typeof coupon !== 'object') {
    return { valid: false, message: 'Cupom inválido ou não informado.' };
  }

  if (coupon.ativa === false) {
    return { valid: false, message: 'Este cupom não está mais ativo.' };
  }

  const minimo = Math.max(0, Number(coupon.valor_minimo_pedido) || 0);
  if (sub < minimo) {
    const minFormatado = minimo.toFixed(2).replace('.', ',');
    const subFormatado = sub.toFixed(2).replace('.', ',');
    return {
      valid: false,
      message: `Pedido mínimo de R$ ${minFormatado} para este cupom (subtotal atual: R$ ${subFormatado}).`
    };
  }

  const desconto = calculateDiscount(
    coupon.tipo_desconto,
    coupon.valor_desconto,
    sub
  );

  return {
    valid: true,
    message: 'Cupom aplicado com sucesso!',
    campanha_id: coupon.id || null,
    campanha_nome: coupon.nome || 'Campanha',
    cupom_codigo: normalizeCouponCode(coupon.cupom_codigo),
    tipo_desconto: coupon.tipo_desconto || 'percentual',
    valor_desconto: Number(coupon.valor_desconto) || 0,
    desconto_calculado: desconto,
    total_com_desconto: Math.max(0, Math.round((sub - desconto + Number.EPSILON) * 100) / 100)
  };
}

export async function validateCouponWithSupabase(supabaseClient, couponCode, subtotal) {
  const code = normalizeCouponCode(couponCode);
  const sub = Math.max(0, Number(subtotal) || 0);

  if (!code) {
    return { valid: false, message: 'Informe o código do cupom.' };
  }

  if (!supabaseClient) {
    return { valid: false, message: 'Banco de dados não disponível no momento.' };
  }

  try {
    // 1. Tenta chamar via RPC seguro
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc('validar_cupom', {
      p_cupom_codigo: code,
      p_subtotal: sub
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && rpcData.valido !== undefined) {
        return {
          valid: Boolean(rpcData.valido),
          message: rpcData.mensagem || '',
          campanha_id: rpcData.campanha_id || null,
          campanha_nome: rpcData.campanha_nome || '',
          cupom_codigo: rpcData.cupom_codigo || code,
          tipo_desconto: rpcData.tipo_desconto || 'percentual',
          valor_desconto: Number(rpcData.valor_desconto) || 0,
          desconto_calculado: Number(rpcData.desconto_calculado) || 0,
          total_com_desconto: Math.max(0, sub - (Number(rpcData.desconto_calculado) || 0))
        };
      }
    }

    // 2. Fallback caso RPC não esteja disponível ainda
    const { data: campanhas, error: campError } = await supabaseClient
      .from('campanhas')
      .select('id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa')
      .ilike('cupom_codigo', code)
      .limit(1);

    if (campError || !campanhas || !campanhas.length) {
      return { valid: false, message: 'Cupom inválido ou não encontrado.' };
    }

    const camp = campanhas[0];
    return validateCouponLocally(camp, sub);
  } catch (err) {
    return { valid: false, message: 'Erro ao validar cupom: ' + (err.message || 'tente novamente.') };
  }
}

export async function registerCouponUsage(supabaseClient, campanhaId, valorPedido) {
  if (!supabaseClient || !campanhaId) return;

  try {
    const { error } = await supabaseClient.rpc('registrar_uso_cupom', {
      p_campanha_id: campanhaId,
      p_valor_pedido: Number(valorPedido) || 0
    });

    if (error) {
      // Fallback update
      const { data: c } = await supabaseClient
        .from('campanhas')
        .select('usos_registrados, receita_atribuida')
        .eq('id', campanhaId)
        .single();

      if (c) {
        await supabaseClient
          .from('campanhas')
          .update({
            usos_registrados: (c.usos_registrados || 0) + 1,
            receita_atribuida: (Number(c.receita_atribuida) || 0) + Math.max(0, Number(valorPedido) || 0)
          })
          .eq('id', campanhaId);
      }
    }
  } catch (e) {
    console.warn('[CouponValidator] Erro ao registrar uso do cupom:', e);
  }
}

// Suporte para browser global se necessário
if (typeof window !== 'undefined') {
  window.couponValidator = {
    normalizeCouponCode,
    calculateDiscount,
    validateCouponLocally,
    validateCouponWithSupabase,
    registerCouponUsage
  };
}
