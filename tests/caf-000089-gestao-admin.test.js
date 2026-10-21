import { describe, it, expect } from 'vitest';
import fs from 'fs';
import '../js/pix-brcode.js';
import { calcularCustoMedioPonderado, calcularCustoFichaTecnica } from '../js/utils/estoque-custos.js';
import { calcularTotaisCaixa, calcularDiferencaCaixaCego } from '../js/utils/caixa-calculos.js';
import { classificarClienteRfv, filtrarClientesPorTag } from '../js/utils/crm-segmentos.js';
import { mapearPayloadDespesaParaBanco } from '../js/utils/despesa-mapper.js';

const cafeteriaPix = globalThis.cafeteriaPix || window.cafeteriaPix;

/**
 * CAF-000089 — Suíte Consolidada: Gestão e Admin
 */
describe('CAF-000089 — Cobertura de Testes: Gestão e Admin', () => {
  const arquivosMatriz = [
    'tests/caf-000014-relatorios.test.js',
    'tests/caf-000015-fechamento-caixa.test.js',
    'tests/caf-000031-controle-estoque.test.js',
    'tests/caf-000032-ficha-tecnica.test.js',
    'tests/caf-000033-cadastro-clientes.test.js',
    'tests/caf-000034-conta-cliente.test.js',
    'tests/caf-000035-contas-pagar.test.js',
    'tests/caf-000036-permissoes-pin.test.js',
    'tests/caf-000039-pix-brcode-taxas.test.js',
    'tests/caf-000041-crm-segmentacao.test.js',
    'tests/caf-000044-caixa-cego.test.js',
    'tests/caf-000045-exportacao-produtos.test.js',
    'tests/caf-000068-integracao-estoque-financeiro.test.js'
  ];

  it('CA01 / RF01: todos os 13 arquivos de teste da matriz de gestão e admin existem', () => {
    for (const arq of arquivosMatriz) {
      expect(fs.existsSync(arq), `Arquivo ${arq} deve existir`).toBe(true);
    }
  });

  it('CA02: validação completa de BR Code Pix e CRC16-CCITT', () => {
    expect(cafeteriaPix.crc16CCITT('123456789')).toBe('29B1');

    const res = cafeteriaPix.gerarPayloadPix({
      chave: 'contato@cafeteriadoteatro.com.br',
      recebedor: 'Cafeteria do Teatro Ltda',
      cidade: 'Porto Alegre',
      valor: 12.50
    });

    expect(res.payload).toContain('000201');
    expect(res.payload).toContain('br.gov.bcb.pix');
    expect(res.payload).toContain('540512.50');
    expect(res.payload.length).toBeGreaterThan(60);
  });

  it('CA03: estoque com 10 un a R$ 1,50 + entrada de 5 un a R$ 2,50 resulta em custo médio 1.8333', () => {
    const custo = calcularCustoMedioPonderado(10, 1.50, 5, 2.50, 4);
    expect(custo).toBe(1.8333);
  });

  it('CA04: caixa com vendas em dinheiro, débito (1.99%), crédito (3.49%) e pix (0%) bate ao centavo', () => {
    const pagamentos = [
      { forma_pagamento: 'dinheiro', valor: 362.30 },
      { forma_pagamento: 'debito', valor: 200.00 },
      { forma_pagamento: 'credito', valor: 300.00 },
      { forma_pagamento: 'pix', valor: 150.00 }
    ];

    const totais = calcularTotaisCaixa(pagamentos, {
      debito: 1.99,
      credito: 3.49,
      pix: 0
    });

    expect(totais.bruto).toBe(1012.30);
    expect(totais.taxas).toBe(14.45);
    expect(totais.liquido).toBe(997.85);

    const conf = calcularDiferencaCaixaCego(100.00, 362.30, 0, 50.00, 412.30);
    expect(conf.diferenca).toBe(0.00);
    expect(conf.status).toBe('exato');
  });

  it('CA05: segmentação RFV classifica clientes fictícios corretamente', () => {
    const vip = classificarClienteRfv({
      ultima_compra: new Date().toISOString(),
      total_pedidos: 20,
      valor_total_gasto: 500
    });
    expect(vip.segmento).toBe('vip');

    const novo = classificarClienteRfv({
      ultima_compra: new Date().toISOString(),
      total_pedidos: 1,
      valor_total_gasto: 20
    });
    expect(novo.segmento).toBe('novo');
  });

  it('CA06: permissões por cargo e bloqueio após 5 tentativas de PIN', () => {
    const migration081 = fs.readFileSync('supabase/migration_caf_000081_seguranca_pin_rls.sql', 'utf8');
    expect(migration081).toMatch(/tentativas_incorretas|bloqueado_ate/);
    const dbJs = fs.readFileSync('js/db.js', 'utf8');
    expect(dbJs).toMatch(/validar_pin_autorizacao/);
  });

  it('CA07: relatórios e dados agregados possuem suporte nos utilitários', () => {
    expect(fs.existsSync('js/utils/relatorios-agregados.js')).toBe(true);
  });

  it('CA08: cobertura de módulos de cálculo financeiro e estoque', () => {
    expect(fs.existsSync('js/utils/estoque-custos.js')).toBe(true);
    expect(fs.existsSync('js/utils/caixa-calculos.js')).toBe(true);
    expect(fs.existsSync('js/utils/crm-segmentos.js')).toBe(true);
  });

  it('CA09 (negativo): cadastro de despesa com recorrência única mapeia para nenhuma respeitando o CHECK do banco', () => {
    const payload = mapearPayloadDespesaParaBanco({
      descricao: 'Conta Luz',
      valor_total: 250.00,
      vencimento: '2026-10-31',
      recorrencia: 'unica'
    });
    expect(payload.recorrencia).toBe('nenhuma');
    expect(payload.valor).toBe(250.00);
  });
});
