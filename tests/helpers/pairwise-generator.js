/**
 * Gerador Determinístico de Combinações Cartesiano e Pairwise (All-Pairs)
 * CAF-000102 — Suíte Combinatória da Tela de Pedidos
 */

/**
 * Gera o produto cartesiano completo de um dicionário de dimensões.
 * @param {Record<string, Array<any>>} dimensoes Ex: { cor: ['azul', 'vermelho'], tam: ['P', 'M'] }
 * @returns {Array<Record<string, any>>}
 */
export function gerarProdutoCartesiano(dimensoes) {
  const keys = Object.keys(dimensoes);
  if (keys.length === 0) return [];

  function helper(index) {
    if (index === keys.length) return [{}];
    const key = keys[index];
    const values = dimensoes[key] || [];
    const rest = helper(index + 1);
    const result = [];
    for (const val of values) {
      for (const r of rest) {
        result.push({ [key]: val, ...r });
      }
    }
    return result;
  }

  return helper(0);
}

/**
 * Cria identificador único e canônico para um par chave-valor.
 */
function makePairId(k1, v1, k2, v2) {
  return `${k1}:::${String(v1)}|||${k2}:::${String(v2)}`;
}

/**
 * Constrói todos os pares possíveis entre pares de dimensões.
 * @param {Record<string, Array<any>>} dimensoes
 * @returns {Set<string>}
 */
export function obterTodosOsPares(dimensoes) {
  const keys = Object.keys(dimensoes);
  const pares = new Set();

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const k1 = keys[i];
      const k2 = keys[j];
      const vals1 = dimensoes[k1] || [];
      const vals2 = dimensoes[k2] || [];

      for (const v1 of vals1) {
        for (const v2 of vals2) {
          pares.add(makePairId(k1, v1, k2, v2));
        }
      }
    }
  }

  return pares;
}

/**
 * Gera uma suíte Pairwise determinística cobrindo 100% dos pares de 2 a 2.
 * Utiliza o algoritmo guloso determinístico (Greedy Coverage com semente garantida).
 * @param {Record<string, Array<any>>} dimensoes
 * @returns {Array<Record<string, any>>}
 */
export function gerarPairwise(dimensoes) {
  const keys = Object.keys(dimensoes);
  if (keys.length === 0) return [];
  if (keys.length === 1) {
    const k = keys[0];
    return (dimensoes[k] || []).map(v => ({ [k]: v }));
  }

  // Lista estruturada de todos os pares para poder semear cada caso
  const todosParesList = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const k1 = keys[i];
      const k2 = keys[j];
      for (const v1 of dimensoes[k1] || []) {
        for (const v2 of dimensoes[k2] || []) {
          todosParesList.push({ k1, v1, k2, v2, id: makePairId(k1, v1, k2, v2) });
        }
      }
    }
  }

  const paresFaltantesMap = new Map();
  for (const p of todosParesList) {
    paresFaltantesMap.set(p.id, p);
  }

  const casos = [];

  while (paresFaltantesMap.size > 0) {
    // Semeia o caso com o primeiro par ainda não coberto (garante progresso estrito e término)
    const seedPair = paresFaltantesMap.values().next().value;
    const caso = {
      [seedPair.k1]: seedPair.v1,
      [seedPair.k2]: seedPair.v2
    };

    // Para as demais dimensões ainda não preenchidas, escolhe o valor que cobre o maior número de pares faltantes
    for (const k of keys) {
      if (k in caso) continue;
      const vals = dimensoes[k] || [];
      if (vals.length === 0) continue;

      let melhorVal = vals[0];
      let maxParesCobertos = -1;

      for (const v of vals) {
        let cobertosCount = 0;
        for (const prevKey of Object.keys(caso)) {
          const prevVal = caso[prevKey];
          const [k1, v1, k2, v2] = keys.indexOf(prevKey) < keys.indexOf(k)
            ? [prevKey, prevVal, k, v]
            : [k, v, prevKey, prevVal];

          const pairId = makePairId(k1, v1, k2, v2);
          if (paresFaltantesMap.has(pairId)) {
            cobertosCount++;
          }
        }

        if (cobertosCount > maxParesCobertos) {
          maxParesCobertos = cobertosCount;
          melhorVal = v;
        }
      }

      caso[k] = melhorVal;
    }

    // Remove todos os pares cobertos por este caso
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const k1 = keys[i];
        const k2 = keys[j];
        const pairId = makePairId(k1, caso[k1], k2, caso[k2]);
        paresFaltantesMap.delete(pairId);
      }
    }

    casos.push(caso);
  }

  return casos;
}

/**
 * Valida se um conjunto de casos cobre todos os pares possíveis das dimensões.
 * @param {Record<string, Array<any>>} dimensoes
 * @param {Array<Record<string, any>>} casos
 * @returns {{ coberto: boolean, totalPares: number, paresNaoCobertos: string[] }}
 */
export function verificarCoberturaPares(dimensoes, casos) {
  const todosPares = obterTodosOsPares(dimensoes);
  const paresNaoCobertos = new Set(todosPares);
  const keys = Object.keys(dimensoes);

  for (const caso of casos) {
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const k1 = keys[i];
        const k2 = keys[j];
        const pairId = makePairId(k1, caso[k1], k2, caso[k2]);
        paresNaoCobertos.delete(pairId);
      }
    }
  }

  return {
    coberto: paresNaoCobertos.size === 0,
    totalPares: todosPares.size,
    paresNaoCobertos: Array.from(paresNaoCobertos)
  };
}
