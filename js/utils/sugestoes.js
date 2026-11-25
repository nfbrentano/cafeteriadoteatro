/**
 * js/utils/sugestoes.js
 * CAF-000150: Motor Centralizado de Sugestões de Itens (Upsell)
 * Usado pelo Totem, Cardápio Online / QR da mesa e PDV (Balcão).
 */

export const CHAVE_STORAGE_SUGESTOES_DISMISSED = 'cafeteria_sugestoes_dismissed';

/**
 * Normaliza os IDs de produtos presentes no carrinho.
 */
export function extrairIdsDoCarrinho(carrinho = []) {
  if (!Array.isArray(carrinho)) return [];
  const ids = [];
  for (const item of carrinho) {
    if (!item) continue;
    const pId = item.produto?.id || item.produto_id || item.id;
    if (pId) ids.push(String(pId));
  }
  return ids;
}

/**
 * Normaliza as categorias dos produtos presentes no carrinho.
 */
export function extrairCategoriasDoCarrinho(carrinho = [], produtosMap = null) {
  if (!Array.isArray(carrinho)) return [];
  const cats = [];
  for (const item of carrinho) {
    if (!item) continue;
    let catId = item.produto?.categoria_id || item.categoria_id;
    if (!catId && produtosMap) {
      const pId = item.produto?.id || item.produto_id || item.id;
      const p = produtosMap.get(String(pId));
      if (p) catId = p.categoria_id;
    }
    if (catId) cats.push(String(catId));
  }
  return cats;
}

/**
 * Verifica se um produto pode ser sugerido (RF03 / CA04).
 */
export function isProdutoValidoParaSugestao(prod, idsNoCarrinhoSet, filtrosAlergias = []) {
  if (!prod || !prod.id) return false;
  if (idsNoCarrinhoSet.has(String(prod.id))) return false;
  if (prod.ativo === false) return false;
  if (prod.disponivel === false) return false;

  // Filtro de alergênicos e restrições (CAF-000152)
  if (Array.isArray(filtrosAlergias) && filtrosAlergias.length > 0) {
    if (typeof window !== 'undefined' && window.AlergenicosUtils?.produtoAtendeFiltro) {
      const atende = window.AlergenicosUtils.produtoAtendeFiltro(prod, prod.alergenicos, filtrosAlergias);
      if (!atende) return false;
    }
  }

  return true;
}

/**
 * Verifica se o carrinho pode ser transformado em combo com economia (RF08 / CA10).
 */
export function verificarUpgradeCombo(carrinho = [], combos = [], produtos = []) {
  if (!Array.isArray(carrinho) || carrinho.length < 2 || !Array.isArray(combos) || combos.length === 0) {
    return null;
  }

  const produtosMap = new Map();
  if (Array.isArray(produtos)) {
    produtos.forEach(p => produtosMap.set(String(p.id), p));
  }

  const idsNoCarrinho = extrairIdsDoCarrinho(carrinho);
  const contagemCarrinho = {};
  for (const id of idsNoCarrinho) {
    contagemCarrinho[id] = (contagemCarrinho[id] || 0) + 1;
  }

  for (const combo of combos) {
    if (!combo || combo.ativo === false || combo.disponivel === false) continue;
    const grupos = combo.grupos || combo.grupos_escolha || [];
    if (!Array.isArray(grupos) || grupos.length === 0) continue;

    // Verifica se para cada grupo do combo existe um item correspondente no carrinho
    const itensCandidatos = [];
    const contagemTemp = { ...contagemCarrinho };
    let grupoAtendido = true;

    for (const g of grupos) {
      const opcoes = (g.opcoes || []).filter(op => op.ativo !== false);
      const opcaoEncontrada = opcoes.find(op => {
        const prodId = String(op.produto_item_id || op.produto_id || '');
        return contagemTemp[prodId] > 0;
      });

      if (opcaoEncontrada) {
        const prodId = String(opcaoEncontrada.produto_item_id || opcaoEncontrada.produto_id || '');
        contagemTemp[prodId]--;
        const pObj = produtosMap.get(prodId) || { id: prodId, nome: opcaoEncontrada.nome, preco: opcaoEncontrada.preco || 0 };
        itensCandidatos.push(pObj);
      } else {
        grupoAtendido = false;
        break;
      }
    }

    if (grupoAtendido && itensCandidatos.length >= 2) {
      const precoItensAvulsos = itensCandidatos.reduce((sum, it) => sum + (Number(it.preco) || 0), 0);
      const precoCombo = Number(combo.preco) || 0;
      const economia = precoItensAvulsos - precoCombo;

      if (economia > 0.05) {
        return {
          combo,
          itensSubstituidos: itensCandidatos,
          precoItensAvulsos,
          precoCombo,
          economia,
          frase: `Leve como combo e economize R$ ${economia.toFixed(2).replace('.', ',')}`
        };
      }
    }
  }

  return null;
}

/**
 * Motor central de cálculo de sugestões (RF01 / RF02 / RF03 / RF07 / CA01-CA04 / CA09).
 */
export function obterSugestoesCarrinho({
  carrinho = [],
  regras = [],
  produtos = [],
  canal = 'todos',
  limite = 3,
  paresMaisVendidos = [],
  combos = [],
  filtrosAlergias = []
} = {}) {
  const inicioTempo = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (!Array.isArray(carrinho) || carrinho.length === 0) {
    return { itens: [], frase: '', upgradeCombo: null, duracaoMs: 0 };
  }

  const produtosMap = new Map();
  const produtosLista = Array.isArray(produtos) ? produtos : [];
  produtosLista.forEach(p => {
    if (p && p.id) produtosMap.set(String(p.id), p);
  });

  const idsNoCarrinho = extrairIdsDoCarrinho(carrinho);
  const idsNoCarrinhoSet = new Set(idsNoCarrinho);
  const catsNoCarrinho = extrairCategoriasDoCarrinho(carrinho, produtosMap);
  const catsNoCarrinhoSet = new Set(catsNoCarrinho);

  const sugeridos = [];
  const sugeridosIdsSet = new Set();
  let fraseCustom = 'Combina perfeitamente com seu pedido:';
  let regraAplicadaId = null;

  // 1. Regras configuradas (sugestoes_regras / totem_sugestoes)
  // Ordena por prioridade DESC, ordem ASC
  const regrasOrdenadas = [...(regras || [])].sort((a, b) => {
    const prioA = Number(a.prioridade) || 1;
    const prioB = Number(b.prioridade) || 1;
    if (prioB !== prioA) return prioB - prioA;
    return (Number(a.ordem) || 1) - (Number(b.ordem) || 1);
  });

  for (const regra of regrasOrdenadas) {
    if (sugeridos.length >= limite) break;
    if (regra.ativo === false) continue;

    // Filtro por canal (CA03)
    if (regra.canal && regra.canal !== 'todos' && canal !== 'todos' && regra.canal !== canal) {
      continue;
    }

    const bateCategoria = !regra.gatilho_categoria_id || catsNoCarrinhoSet.has(String(regra.gatilho_categoria_id));
    const bateProduto = !regra.gatilho_produto_id || idsNoCarrinhoSet.has(String(regra.gatilho_produto_id));

    if (bateCategoria && bateProduto && regra.produto_sugerido_id) {
      const pIdStr = String(regra.produto_sugerido_id);
      if (!idsNoCarrinhoSet.has(pIdStr) && !sugeridosIdsSet.has(pIdStr)) {
        const prod = produtosMap.get(pIdStr);
        if (prod && isProdutoValidoParaSugestao(prod, idsNoCarrinhoSet, filtrosAlergias)) {
          sugeridos.push({
            ...prod,
            _regraId: regra.id || null,
            _motivo: 'regra'
          });
          sugeridosIdsSet.add(pIdStr);
          if (regra.frase_destaque) {
            fraseCustom = regra.frase_destaque;
          }
          if (!regraAplicadaId && regra.id) {
            regraAplicadaId = regra.id;
          }
        }
      }
    }
  }

  // 2. Fallback por Pares Mais Vendidos (RF07 / CA09)
  if (sugeridos.length < limite && Array.isArray(paresMaisVendidos) && paresMaisVendidos.length > 0) {
    for (const par of paresMaisVendidos) {
      if (sugeridos.length >= limite) break;
      const pIdStr = String(par.produto_id);
      if (!idsNoCarrinhoSet.has(pIdStr) && !sugeridosIdsSet.has(pIdStr)) {
        const prod = produtosMap.get(pIdStr);
        if (prod && isProdutoValidoParaSugestao(prod, idsNoCarrinhoSet, filtrosAlergias)) {
          sugeridos.push({
            ...prod,
            _regraId: null,
            _motivo: 'pares_mais_vendidos'
          });
          sugeridosIdsSet.add(pIdStr);
        }
      }
    }
  }

  // 3. Fallback inteligente de catálogo: produtos de outras categorias
  if (sugeridos.length < limite) {
    const candidatos = produtosLista.filter(p => 
      isProdutoValidoParaSugestao(p, idsNoCarrinhoSet, filtrosAlergias) && !sugeridosIdsSet.has(String(p.id))
    );
    const outraCat = candidatos.filter(p => !catsNoCarrinhoSet.has(String(p.categoria_id)));
    const pool = outraCat.length > 0 ? outraCat : candidatos;

    for (const p of pool) {
      if (sugeridos.length >= limite) break;
      sugeridos.push({
        ...p,
        _regraId: null,
        _motivo: 'fallback_catalogo'
      });
      sugeridosIdsSet.add(String(p.id));
    }
  }

  // 4. Verificação de Upgrade para Combo (RF08 / CA10)
  const upgradeCombo = verificarUpgradeCombo(carrinho, combos, produtosLista);

  const fimTempo = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const duracaoMs = Math.round((fimTempo - inicioTempo) * 100) / 100;

  return {
    itens: sugeridos.slice(0, limite),
    frase: fraseCustom,
    regraId: regraAplicadaId,
    upgradeCombo,
    duracaoMs
  };
}

/**
 * Gestão de dismiss do bloco de sugestões na sessão (CA06).
 */
export function isSugestoesDismissed() {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  return window.sessionStorage.getItem(CHAVE_STORAGE_SUGESTOES_DISMISSED) === 'true';
}

export function dismissSugestoes() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.setItem(CHAVE_STORAGE_SUGESTOES_DISMISSED, 'true');
}

export function resetSugestoesDismissed() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(CHAVE_STORAGE_SUGESTOES_DISMISSED);
}

/**
 * Registro de eventos de exibição e aceite no Analytics (RF06 / CA08).
 */
export async function registrarEventoExibicao(canal, itensSugeridos = [], regraId = null) {
  if (typeof window === 'undefined' || !window.cafeteriaSupabase || !Array.isArray(itensSugeridos)) return;
  for (const item of itensSugeridos) {
    if (!item?.id) continue;
    try {
      await window.cafeteriaSupabase.rpc('registrar_evento_cardapio', {
        p_canal: canal || 'geral',
        p_tipo_evento: 'sugestao_exibida',
        p_produto_id: String(item.id),
        p_regra_id: item._regraId || regraId || null
      });
    } catch (e) {
      console.warn('[sugestoes] Falha ao registrar sugestao_exibida:', e);
    }
  }
}

export async function registrarEventoAceite(canal, produtoId, regraId = null) {
  if (typeof window === 'undefined' || !window.cafeteriaSupabase || !produtoId) return;
  try {
    await window.cafeteriaSupabase.rpc('registrar_evento_cardapio', {
      p_canal: canal || 'geral',
      p_tipo_evento: 'sugestao_aceita',
      p_produto_id: String(produtoId),
      p_regra_id: regraId || null
    });
  } catch (e) {
    console.warn('[sugestoes] Falha ao registrar sugestao_aceita:', e);
  }
}

// Expõe globalmente para navegadores e testes legados
if (typeof window !== 'undefined') {
  window.SugestoesUtils = {
    CHAVE_STORAGE_SUGESTOES_DISMISSED,
    extrairIdsDoCarrinho,
    extrairCategoriasDoCarrinho,
    isProdutoValidoParaSugestao,
    verificarUpgradeCombo,
    obterSugestoesCarrinho,
    isSugestoesDismissed,
    dismissSugestoes,
    resetSugestoesDismissed,
    registrarEventoExibicao,
    registrarEventoAceite
  };
}
