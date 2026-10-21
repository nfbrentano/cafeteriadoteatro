/**
 * CAF-000088 / CAF-000025 / CAF-000007 / CAF-000026: Regras de Negócio do KDS
 */

export function calcularSemaforo(createdAt, tempoAlvoMin = 15, options = {}) {
  const { agora = Date.now(), desvioRelogioMs = 0 } = options;
  const createdTime = new Date(createdAt).getTime() + desvioRelogioMs;
  const decorridoMin = Math.max(0, (agora - createdTime) / 60000);
  const alvo = Math.max(1, Number(tempoAlvoMin) || 15);

  if (decorridoMin < alvo * 0.7) {
    return { cor: 'verde', decorridoMin: Math.round(decorridoMin), alvo, atrasado: false };
  } else if (decorridoMin <= alvo) {
    return { cor: 'amarelo', decorridoMin: Math.round(decorridoMin), alvo, atrasado: false };
  } else {
    return { cor: 'vermelho', decorridoMin: Math.round(decorridoMin), alvo, atrasado: true };
  }
}

export function ordenarFilaKDS(pedidos = []) {
  if (!Array.isArray(pedidos)) return [];
  return [...pedidos].sort((a, b) => {
    // 1. Prioridade alta primeiro
    const prioA = a.prioridade ? 1 : 0;
    const prioB = b.prioridade ? 1 : 0;
    if (prioB !== prioA) return prioB - prioA;

    // 2. Pedidos com itens adicionados depois (selo NOVO) vêm antes
    const novosA = a.novosPendentesCount || 0;
    const novosB = b.novosPendentesCount || 0;
    if (novosB !== novosA) return novosB - novosA;

    // 3. Mais antigos primeiro (FIFO)
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    return tA - tB;
  });
}

export function agruparPorEstacao(itens = []) {
  const bar = [];
  const cozinha = [];

  for (const item of itens) {
    if (!item) continue;
    const estacao = String(item.estacao || (item.categoria && item.categoria.estacao) || '').toLowerCase();
    if (estacao === 'bar') {
      bar.push(item);
    } else {
      cozinha.push(item);
    }
  }

  return { bar, cozinha };
}

export function verificarConclusaoEstacoes(pedido = {}, estacoesNecessarias = []) {
  const concluidas = new Set(pedido.estacoes_concluidas || []);
  for (const est of estacoesNecessarias) {
    if (!concluidas.has(est)) return false;
  }
  return true;
}

export function consolidarProducao(pedidos = []) {
  const consolidado = new Map();

  for (const p of pedidos) {
    if (!p || p.status === 'cancelado' || p.status === 'concluido' || p.status === 'entregue') continue;
    const itens = p.itens || p.pedido_itens || [];
    for (const item of itens) {
      if (item.cancelado || item.pronto_em) continue;
      const chave = item.produto_nome || item.nome || `Item ${item.id}`;
      const qtd = Number(item.quantidade) || 1;
      const atual = consolidado.get(chave) || { nome: chave, quantidade: 0, pedidos: [] };
      atual.quantidade += qtd;
      if (p.id && !atual.pedidos.includes(p.id)) atual.pedidos.push(p.id);
      consolidado.set(chave, atual);
    }
  }

  return Array.from(consolidado.values()).sort((a, b) => b.quantidade - a.quantidade);
}

export default {
  calcularSemaforo,
  ordenarFilaKDS,
  agruparPorEstacao,
  verificarConclusaoEstacoes,
  consolidarProducao
};
