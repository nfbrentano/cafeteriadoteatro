/**
 * CAF-000088 / CAF-000028: Trava de Impressão Automática por Pedido e Estação
 */

export class ImpressaoTrava {
  constructor() {
    this.impressos = new Set();
  }

  chave(pedidoId, estacao = 'geral') {
    return `${pedidoId}:${estacao}`;
  }

  deveImprimirAutomatico(pedidoId, estacao = 'geral', forceManual = false) {
    if (forceManual) return true;
    const k = this.chave(pedidoId, estacao);
    if (this.impressos.has(k)) {
      return false; // Já impresso automaticamente
    }
    this.impressos.add(k);
    return true;
  }

  limpar(pedidoId = null, estacao = null) {
    if (pedidoId && estacao) {
      this.impressos.delete(this.chave(pedidoId, estacao));
    } else if (pedidoId) {
      for (const k of Array.from(this.impressos)) {
        if (k.startsWith(`${pedidoId}:`)) this.impressos.delete(k);
      }
    } else {
      this.impressos.clear();
    }
  }

  estaImpresso(pedidoId, estacao = 'geral') {
    return this.impressos.has(this.chave(pedidoId, estacao));
  }
}

export const impressaoTravaPadrao = new ImpressaoTrava();

export default {
  ImpressaoTrava,
  impressaoTravaPadrao
};
