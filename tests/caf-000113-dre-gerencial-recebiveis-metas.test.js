import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPageHarness } from './helpers/page-harness.js';
import {
  formatarMoeda,
  formatarData,
  calcularDRE,
  projetarRecebiveis,
  calcularProgressoMeta,
  gerarCSVDRE
} from '../js/utils/dre-calculos.js';

describe('CAF-000113: DRE Gerencial Automático, Conciliação de Recebíveis e Metas de Venda', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Cálculos do DRE Gerencial e Análise Vertical (CA01 / CA02)', () => {
    it('CA01: calcula exatamente Receita Líquida (R$ 9.620,00), Margem (65,0%) e Lucro Líquido (25,0%)', () => {
      const resultado = calcularDRE({
        faturamentoBruto: 10000.00,
        descontos: 200.00,
        taxasPagamento: 180.00,
        cmvItens: 3000.00,
        perdasEstoque: 120.00,
        despesas: [
          { nome: 'Aluguel', tipo: 'fixa', total: 2500.00 },
          { nome: 'Energia Elétrica', tipo: 'fixa', total: 1000.00 },
          { nome: 'Manutenção', tipo: 'variavel', total: 500.00 }
        ]
      });

      // Receita Líquida = 10000 - 200 - 180 = 9620.00 (96.2%)
      expect(resultado.receitaLiquida).toBe(9620.00);
      expect(resultado.receitaLiquidaPct).toBe(96.2);

      // CMV Total = 3000 + 120 = 3120.00 (31.2%)
      expect(resultado.cmvTotal).toBe(3120.00);
      expect(resultado.cmvTotalPct).toBe(31.2);

      // Margem de Contribuição = 9620 - 3120 = 6500.00 (65.0%)
      expect(resultado.margemContribuicao).toBe(6500.00);
      expect(resultado.margemContribuicaoPct).toBe(65.0);

      // Despesas Operacionais = 2500 + 1000 + 500 = 4000.00 (40.0%)
      expect(resultado.despesasTotal).toBe(4000.00);
      expect(resultado.despesasTotalPct).toBe(40.0);
      expect(resultado.despesasFixas).toBe(3500.00);
      expect(resultado.despesasVariaveis).toBe(500.00);

      // Resultado Operacional Líquido = 6500 - 4000 = 2500.00 (25.0%)
      expect(resultado.resultadoLiquido).toBe(2500.00);
      expect(resultado.resultadoLiquidoPct).toBe(25.0);
    });

    it('CA02: ignora taxas automáticas de cartão na linha de despesas operacionais para evitar dupla contagem', () => {
      const resultado = calcularDRE({
        faturamentoBruto: 5000.00,
        descontos: 0,
        taxasPagamento: 150.00,
        cmvItens: 1000.00,
        perdasEstoque: 0,
        despesas: [
          { nome: 'Taxas de Cartão / Meios de Pagamento', tipo: 'variavel', total: 150.00 },
          { nome: 'Taxa maquininha Stone', tipo: 'variavel', total: 50.00 },
          { nome: 'Internet', tipo: 'fixa', total: 200.00 }
        ]
      });

      // As despesas com nome de taxa não são somadas em despesasTotal
      expect(resultado.despesasTotal).toBe(200.00);
      expect(resultado.despesasFixas).toBe(200.00);
      expect(resultado.despesasVariaveis).toBe(0.00);
      // Receita Líquida = 5000 - 150 = 4850
      expect(resultado.receitaLiquida).toBe(4850.00);
      // Margem = 4850 - 1000 = 3850
      expect(resultado.margemContribuicao).toBe(3850.00);
      // Lucro Líquido = 3850 - 200 = 3650
      expect(resultado.resultadoLiquido).toBe(3650.00);
    });
  });

  describe('2. Projeção de Recebíveis e Conciliação de Prazos (CA03)', () => {
    it('CA03: projeta recebimento líquido de R$ 96,90 para D+30 em venda de R$ 100 no Crédito com taxa 3,10%', () => {
      const pagamentos = [
        {
          data_venda: '2026-11-01',
          forma: 'cartao_credito',
          valor: 100.00,
          taxa_valor: 3.10,
          valor_liquido: 96.90
        }
      ];

      const projecao = projetarRecebiveis(pagamentos, {}, '2026-11-01');

      expect(projecao.recebiveis).toHaveLength(1);
      const item = projecao.recebiveis[0];
      expect(item.forma).toBe('cartao_credito');
      expect(item.prazoDias).toBe(30);
      expect(item.dataVenda).toBe('2026-11-01');
      expect(item.dataPrevista).toBe('2026-12-01');
      expect(item.valorBruto).toBe(100.00);
      expect(item.taxaValor).toBe(3.10);
      expect(item.valorLiquido).toBe(96.90);

      // Deve estar somado no total de 30 dias
      expect(projecao.total30dias).toBe(96.90);
    });

    it('projeta corretamente pagamentos em Pix (D+0) e Débito (D+1)', () => {
      const pagamentos = [
        { data_venda: '2026-11-01', forma: 'pix', valor: 50.00, taxa_valor: 0, valor_liquido: 50.00 },
        { data_venda: '2026-11-01', forma: 'cartao_debito', valor: 100.00, taxa_valor: 1.20, valor_liquido: 98.80 }
      ];

      const projecao = projetarRecebiveis(pagamentos, {}, '2026-11-01');

      expect(projecao.totalHoje).toBe(50.00); // Pix D+0
      expect(projecao.total7dias).toBe(148.80); // 50 (Pix) + 98.80 (Débito D+1)
      expect(projecao.recebiveis).toHaveLength(2);
    });
  });

  describe('3. Meta de Faturamento Diário (CA04)', () => {
    it('CA04: calcula 50% de atingimento quando hoje é Dia de Espetáculo (meta R$ 3.000,00) e vendas somam R$ 1.500,00', () => {
      const progresso = calcularProgressoMeta({
        vendasHoje: 1500.00,
        metaNormal: 1500.00,
        metaEspetaculo: 3000.00,
        isEspetaculo: true
      });

      expect(progresso.isEspetaculo).toBe(true);
      expect(progresso.metaValor).toBe(3000.00);
      expect(progresso.vendasHoje).toBe(1500.00);
      expect(progresso.percentualAtingido).toBe(50.0);
      expect(progresso.faltaParaMeta).toBe(1500.00);
    });

    it('calcula 100% de atingimento em Dia Normal (meta R$ 1.500,00) com vendas de R$ 1.500,00', () => {
      const progresso = calcularProgressoMeta({
        vendasHoje: 1500.00,
        metaNormal: 1500.00,
        metaEspetaculo: 3000.00,
        isEspetaculo: false
      });

      expect(progresso.isEspetaculo).toBe(false);
      expect(progresso.metaValor).toBe(1500.00);
      expect(progresso.percentualAtingido).toBe(100.0);
      expect(progresso.faltaParaMeta).toBe(0.00);
    });
  });

  describe('4. Exportação do DRE em CSV com UTF-8 BOM (CA05)', () => {
    it('CA05: gera arquivo CSV estruturado iniciando com BOM UTF-8 e valores com vírgula', () => {
      const dreMock = {
        faturamentoBruto: 10000.00,
        faturamentoBrutoPct: 100.0,
        descontos: 200.00,
        descontosPct: 2.0,
        taxasPagamento: 180.00,
        taxasPagamentoPct: 1.8,
        receitaLiquida: 9620.00,
        receitaLiquidaPct: 96.2,
        cmvItens: 3000.00,
        cmvPerdas: 120.00,
        cmvTotal: 3120.00,
        cmvTotalPct: 31.2,
        margemContribuicao: 6500.00,
        margemContribuicaoPct: 65.0,
        despesasTotal: 4000.00,
        despesasTotalPct: 40.0,
        despesasFixas: 3500.00,
        despesasFixasPct: 35.0,
        despesasVariaveis: 500.00,
        despesasVariaveisPct: 5.0,
        despesasCategorias: [
          { nome: 'Aluguel', tipo: 'fixa', total: 3500.00, percentual: 35.0 }
        ],
        resultadoLiquido: 2500.00,
        resultadoLiquidoPct: 25.0
      };

      const csv = gerarCSVDRE(dreMock);

      // Deve começar com BOM UTF-8
      expect(csv.startsWith('\uFEFF')).toBe(true);
      // Deve conter as linhas chave
      expect(csv).toContain('Faturamento Bruto');
      expect(csv).toContain('Receita Operacional Líquida');
      expect(csv).toContain('Margem de Contribuição Bruta');
      expect(csv).toContain('Resultado Operacional Líquido');
      // Valores formatados em padrão brasileiro
      expect(csv).toContain('9620,00');
      expect(csv).toContain('6500,00');
      expect(csv).toContain('2500,00');
      expect(csv).toContain('65,0%');
      expect(csv).toContain('25,0%');
    });
  });

  describe('5. Integração com a Tela Admin (Happy DOM + RPCs reais mockadas)', () => {
    it('carrega tela financeiro, atualiza DRE, calcula totais e permite navegação de abas', async () => {
      const mockDre = {
        faturamento_bruto: 10000.00,
        faturamento_bruto_pct: 100.0,
        descontos: 200.00,
        descontos_pct: 2.0,
        taxas_pagamento: 180.00,
        taxas_pagamento_pct: 1.8,
        receita_liquida: 9620.00,
        receita_liquida_pct: 96.2,
        cmv_itens: 3000.00,
        cmv_perdas: 120.00,
        cmv_total: 3120.00,
        cmv_total_pct: 31.2,
        margem_contribuicao: 6500.00,
        margem_contribuicao_pct: 65.0,
        despesas_fixas: 3500.00,
        despesas_fixas_pct: 35.0,
        despesas_variaveis: 500.00,
        despesas_variaveis_pct: 5.0,
        despesas_total: 4000.00,
        despesas_total_pct: 40.0,
        despesas_categorias: [
          { categoria: 'Aluguel', tipo: 'fixa', total: 3500.00, percentual_receita: 35.0 },
          { categoria: 'Manutenção', tipo: 'variavel', total: 500.00, percentual_receita: 5.0 }
        ],
        resultado_liquido: 2500.00,
        resultado_liquido_pct: 25.0
      };

      const mockRecebiveis = {
        total_hoje: 50.00,
        total_7dias: 148.80,
        total_30dias: 245.70,
        recebiveis: [
          {
            data_prevista: '2026-12-01',
            data_venda: '2026-11-01',
            forma: 'cartao_credito',
            prazo_dias: 30,
            valor_bruto: 100.00,
            taxa_valor: 3.10,
            valor_liquido: 96.90
          }
        ]
      };

      const mockMeta = {
        data: '2026-11-06',
        is_espetaculo: true,
        meta_valor: 3000.00,
        vendas_hoje: 1500.00,
        percentual_atingido: 50.0,
        falta_para_meta: 1500.00
      };

      const harness = createPageHarness('admin.html', {
        rpcHandlers: {
          obter_dre_gerencial: () => ({ data: mockDre, error: null }),
          obter_previsao_recebiveis: () => ({ data: mockRecebiveis, error: null }),
          obter_meta_progresso_dia: () => ({ data: mockMeta, error: null }),
          get_resumo_financeiro: () => ({ data: {}, error: null })
        }
      });

      // Configura mocks e inicializa banco
      window.cafeteriaDB = {
        financeiro: {
          obterDRE: async (ini, fim, reg) => mockDre,
          obterPrevisaoRecebiveis: async () => mockRecebiveis,
          obterMetaProgressoDia: async () => mockMeta,
          getResumo: async () => ({})
        }
      };

      // Importa e executa o módulo financeiro
      await import('../js/admin/financeiro-admin.js');
      expect(window.initAdminFinanceiro).toBeDefined();

      await window.initAdminFinanceiro();

      // Valida banner da meta diária
      const badgeMeta = document.getElementById('meta-diaria-badge');
      expect(badgeMeta?.textContent).toContain('Espetáculo');
      const textoMeta = document.getElementById('meta-diaria-progresso-texto');
      expect(textoMeta?.textContent).toContain('50%');

      // Alterna para sub-aba de Resultado DRE
      const btnTabResultado = document.getElementById('btn-tab-resultado');
      btnTabResultado?.click();

      // Força recálculo do DRE
      const btnRecarregar = document.getElementById('btn-recarregar-resultado');
      btnRecarregar?.click();
      await new Promise(r => setTimeout(r, 50));

      const elReceitaLiq = document.getElementById('dre-faturamento-liquido');
      expect(elReceitaLiq?.textContent).toContain('9.620,00');

      const elMargem = document.getElementById('dre-margem-contribuicao');
      expect(elMargem?.textContent).toContain('6.500,00');

      const elResultado = document.getElementById('dre-resultado-final');
      expect(elResultado?.textContent).toContain('2.500,00');

      const elResultadoPct = document.getElementById('dre-resultado-final-pct');
      expect(elResultadoPct?.textContent).toContain('25.0%');

      // Alterna para sub-aba de Recebíveis
      const btnTabRecebiveis = document.getElementById('btn-tab-recebiveis');
      btnTabRecebiveis?.click();
      await new Promise(r => setTimeout(r, 50));

      const el30d = document.getElementById('kpi-recebiveis-30d');
      expect(el30d?.textContent).toContain('245,70');

      const tbody = document.getElementById('tbody-recebiveis');
      expect(tbody?.innerHTML).toContain('CARTAO CREDITO');
      expect(tbody?.innerHTML).toContain('96,90');

      // Testa clique em exportar CSV
      let csvBaixado = null;
      window.cafeteriaAdmin = {
        downloadCSV: (nome, content) => {
          csvBaixado = { nome, content };
        },
        showToast: () => {}
      };

      const btnExportarDRE = document.getElementById('btn-exportar-dre-csv');
      btnExportarDRE?.click();

      expect(csvBaixado).not.toBeNull();
      expect(csvBaixado.nome).toContain('dre_gerencial_');
      expect(csvBaixado.content).toContain('9620,00');
    });
  });
});

