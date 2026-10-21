/**
 * CAF-000088 / CAF-000030: Cálculo de Diff Incremental de Cards do KDS
 */

export function calcularDiffKDS(pedidosAntigos = [], pedidosNovos = []) {
  const mapaAntigos = new Map(pedidosAntigos.map(p => [String(p.id), p]));
  const mapaNovos = new Map(pedidosNovos.map(p => [String(p.id), p]));

  const inseridos = [];
  const atualizados = [];
  const removidos = [];

  for (const [id, novo] of mapaNovos.entries()) {
    if (!mapaAntigos.has(id)) {
      inseridos.push(novo);
    } else {
      const antigo = mapaAntigos.get(id);
      // Checa se houve alteração relevante
      const mudouStatus = antigo.status !== novo.status;
      const mudouItens = (antigo.itens?.length || 0) !== (novo.itens?.length || 0);
      const mudouNovos = (antigo.novosPendentesCount || 0) !== (novo.novosPendentesCount || 0);
      const mudouPrio = Boolean(antigo.prioridade) !== Boolean(novo.prioridade);

      if (mudouStatus || mudouItens || mudouNovos || mudouPrio) {
        atualizados.push({ id, antigo, novo });
      }
    }
  }

  for (const [id, antigo] of mapaAntigos.entries()) {
    if (!mapaNovos.has(id)) {
      removidos.push(antigo);
    }
  }

  return {
    inseridos,
    atualizados,
    removidos,
    totalSemMudanca: pedidosNovos.length - inseridos.length - atualizados.length
  };
}

export default {
  calcularDiffKDS
};
