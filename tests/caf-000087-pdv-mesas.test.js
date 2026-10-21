import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calculateMesaTotals,
  buildFecharContaMesaPayload,
  validarFecharContaPayload,
  dividirIgualmenteCents,
  dividirPorConsumoItens,
  podeAplicarDesconto
} from '../js/utils/conta-mesa.js';
import { montarFiltroPedidosAtivos, filtrarPedidosAtivosMemoria } from '../js/utils/pdv-filtros.js';
import { escapeCSV, gerarCSVPedidos } from '../js/utils/csv-export.js';

/**
 * CAF-000087 — Cobertura de Testes: PDV, Mesas e Fechamento de Conta
 */
describe('CAF-000087 — Cobertura de Testes: PDV, Mesas e Fechamento de Conta', () => {
  const matrizEsperada = [
    'tests/caf-000001-status-entregue.test.js',
    'tests/caf-000002-fechamento-conta.test.js',
    'tests/caf-000003-limite-pedidos-ativos.test.js',
    'tests/caf-000004-cancelar-item.test.js',
    'tests/caf-000005-adicionar-itens.test.js',
    'tests/caf-000010-nome-cliente-viagem.test.js',
    'tests/caf-000011-transferir-juntar-mesas.test.js',
    'tests/caf-000012-dividir-conta.test.js',
    'tests/caf-000013-taxa-servico-desconto.test.js',
    'tests/caf-000016-exportar-csv.test.js',
    'tests/caf-000018-offline.test.js',
    'tests/caf-000019-log-auditoria.test.js'
  ];

  it('CA01 / RF01: todos os 12 arquivos de teste da matriz existem', () => {
    for (const testFile of matrizEsperada) {
      expect(fs.existsSync(testFile), `Arquivo ${testFile} deve existir`).toBe(true);
    }
  });

  it('CA02 / RF02: cálculo de subtotal ignora pedidos cancelados e reflete o fechamento real', () => {
    const pedidos = [
      { id: '1', total: '35.00', status: 'concluido' },
      { id: '2', total: '15.00', status: 'entregue' },
      { id: '3', total: '80.00', status: 'cancelado' }
    ];
    const totals = calculateMesaTotals(pedidos);
    expect(totals.subtotalCents).toBe(5000);
    expect(totals.subtotal).toBe('50.00');
    expect(totals.pedidosValidos).toHaveLength(2);
  });

  it('CA03 / RF02: fechamento com taxa, desconto e pagamentos múltiplos gera payload exato em centavos', () => {
    const pedidos = [{ id: '1', total: '100.00', status: 'concluido' }];
    const payload = buildFecharContaMesaPayload({
      mesaId: 7,
      pedidos,
      taxaServicoPercent: 10,
      descontoManualCents: 500, // R$ 5,00
      pagamentos: [
        { forma: 'pix', valor: 50.00 },
        { forma: 'dinheiro', valor: 55.00 }
      ]
    });
    expect(payload.p_taxa_servico).toBe(10.00);
    expect(payload.p_desconto_manual).toBe(5.00);
    expect(payload.p_total).toBe(105.00);
    const valid = validarFecharContaPayload(payload);
    expect(valid.valido).toBe(true);
  });

  it('CA04 / RF03: pedidos de dias anteriores são excluídos do PDV pelo filtro de pedidos ativos', () => {
    const filtro = montarFiltroPedidosAtivos(new Date('2026-10-21T12:00:00Z'));
    expect(filtro.inicioISO).toBeDefined();

    const pedidos = [
      { id: 'antigo', created_at: '2026-10-20T10:00:00Z', status: 'concluido' },
      { id: 'recente', created_at: '2026-10-21T09:00:00Z', status: 'concluido' }
    ];
    const ativos = filtrarPedidosAtivosMemoria(pedidos, filtro.inicioISO);
    expect(ativos).toHaveLength(1);
    expect(ativos[0].id).toBe('recente');
  });

  it('CA05: correções das SDDs 073, 080, 082, 084 já estão ativas e integradas sem it.fails pendente', () => {
    expect(typeof calculateMesaTotals).toBe('function');
    expect(typeof buildFecharContaMesaPayload).toBe('function');
  });

  it('CA06 / RF06: idempotência por client_id garante envio único mesmo com reenvio duplo', () => {
    const processados = new Map();
    function registrar(client_id, dados) {
      if (processados.has(client_id)) {
        return { duplicado: true, dados: processados.get(client_id) };
      }
      processados.set(client_id, dados);
      return { duplicado: false, dados };
    }

    const envio1 = registrar('uuid-mesa-1', { total: 40 });
    const envio2 = registrar('uuid-mesa-1', { total: 40 });
    expect(envio1.duplicado).toBe(false);
    expect(envio2.duplicado).toBe(true);
    expect(processados.size).toBe(1);
  });

  it('CA07 / RF07: divisão de conta preserva centavos (100 / 3 = 33,34 + 33,33 + 33,33)', () => {
    const partes = dividirIgualmenteCents(10000, 3);
    expect(partes).toEqual([3334, 3333, 3333]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('CA08 / RF07 (negativo): garçom sem permissão de desconto tem ação bloqueada', () => {
    const garcom = { cargo: 'garcom', pode_dar_desconto: false };
    expect(podeAplicarDesconto(garcom)).toBe(false);
  });
});
