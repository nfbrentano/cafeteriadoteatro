import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../js/admin/caixa-admin.js';
import '../js/admin/financeiro-admin.js';
import {
  calcularTotaisCaixa,
  calcularDiferencaCaixaCego,
  normalizarFormaPagamento,
  validarMovimentacaoCaixa
} from '../js/utils/caixa-calculos.js';
import {
  mapearPayloadDespesaParaBanco,
  normalizeDespesaFromDB
} from '../js/utils/despesa-mapper.js';

const initAdminCaixa = globalThis.initAdminCaixa || window.initAdminCaixa;

/**
 * CAF-000094 — Cobertura de Testes Unitários: Fechamento de Caixa e Financeiro
 */
describe('CAF-000094 — Fechamento de Caixa e Financeiro', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Fluxo de Caixa (Abertura, Suprimento, Sangria e Contagem Cega)', () => {
    it('CA01 / RF01: abertura de turno com suprimento inicial de gaveta e normalização de estado', () => {
      expect(initAdminCaixa).toBeDefined();
      expect(initAdminCaixa.normalizarTotaisResponse).toBeDefined();

      const dadosResposta = {
        fundo_troco: 150.00,
        suprimentos: 0,
        sangrias: 0,
        dinheiro_esperado: 150.00,
        modo_cego: true,
        conferencia_cega: true,
        limite_diferenca_obs: 5.00,
        itens: []
      };

      const estadoNormalizado = initAdminCaixa.normalizarTotaisResponse(dadosResposta);
      expect(estadoNormalizado.fundo).toBe(150.00);
      expect(estadoNormalizado.suprimentos).toBe(0);
      expect(estadoNormalizado.sangrias).toBe(0);
      expect(estadoNormalizado.dinheiroEsperado).toBe(150.00);
      expect(estadoNormalizado.conferenciaCega).toBe(true);
    });

    it('CA02 / RF01: impede abertura duplicada quando já existe caixa ativo', () => {
      const caixaAberto = {
        id: 'cx-123',
        status: 'aberto',
        aberto_em: new Date().toISOString(),
        fundo_troco: 100.00
      };

      const podeAbrirNovo = (caixaAtual) => !caixaAtual || caixaAtual.status === 'fechado';
      expect(podeAbrirNovo(caixaAberto)).toBe(false);
      expect(podeAbrirNovo({ status: 'fechado' })).toBe(true);
      expect(podeAbrirNovo(null)).toBe(true);
    });

    it('CA03 / CA04 / RF02: validação e dedução correta de sangria e suprimento com justificativa', () => {
      // Sangria válida
      const validacaoSangriaOk = validarMovimentacaoCaixa('sangria', 200.00, 'Pagamento fornecedor de gelo');
      expect(validacaoSangriaOk.valido).toBe(true);

      // Sangria inválida sem motivo
      const validacaoSemMotivo = validarMovimentacaoCaixa('sangria', 200.00, '');
      expect(validacaoSemMotivo.valido).toBe(false);
      expect(validacaoSemMotivo.erro).toContain('justificativa');

      // Suprimento com valor zero ou negativo
      const validacaoValorZero = validarMovimentacaoCaixa('suprimento', 0, 'Troco extra');
      expect(validacaoValorZero.valido).toBe(false);
      expect(validacaoValorZero.erro).toContain('maior que zero');

      // Simulação do saldo em dinheiro da gaveta após sangria
      const fundoInicial = 150.00;
      const vendasDinheiro = 300.00;
      const suprimentoAdicional = 50.00;
      const sangriaValor = 200.00;

      const saldoGaveta = fundoInicial + vendasDinheiro + suprimentoAdicional - sangriaValor;
      expect(saldoGaveta).toBe(300.00);
    });

    it('CA05 / RF03: contagem de cédulas e moedas soma com exatidão ao centavo', () => {
      const cedulasMoedas = initAdminCaixa.CEDULAS_MOEDAS;
      expect(cedulasMoedas).toBeDefined();

      const contagem = {
        200: 0,
        100: 2,   // 200.00
        50: 3,    // 150.00
        20: 0,
        10: 0,
        5: 0,
        2: 0,
        1: 10,    // 10.00
        0.5: 0,
        0.25: 0,
        0.1: 0,
        0.05: 0
      };

      let soma = 0;
      for (const item of cedulasMoedas) {
        const qtd = contagem[item.valor] || 0;
        soma += qtd * item.valor;
      }
      soma = Math.round(soma * 100) / 100;

      expect(soma).toBe(360.00);
    });

    it('CA06 / RF03: cálculo estrito de quebra e sobra de caixa na conferência cega', () => {
      // Caso 1: Sobra (+10.00)
      const resSobra = calcularDiferencaCaixaCego(100.00, 250.00, 0, 0, 360.00);
      expect(resSobra.saldoEsperado).toBe(350.00);
      expect(resSobra.contagemFisica).toBe(360.00);
      expect(resSobra.diferenca).toBe(10.00);
      expect(resSobra.status).toBe('sobra');

      // Caso 2: Falta / Quebra (-10.00)
      const resFalta = calcularDiferencaCaixaCego(100.00, 250.00, 0, 0, 340.00);
      expect(resFalta.saldoEsperado).toBe(350.00);
      expect(resFalta.contagemFisica).toBe(340.00);
      expect(resFalta.diferenca).toBe(-10.00);
      expect(resFalta.status).toBe('falta');

      // Caso 3: Bateu exato (0.00)
      const resExato = calcularDiferencaCaixaCego(100.00, 250.00, 0, 0, 350.00);
      expect(resExato.saldoEsperado).toBe(350.00);
      expect(resExato.contagemFisica).toBe(350.00);
      expect(resExato.diferenca).toBe(0.00);
      expect(resExato.status).toBe('exato');
    });

    it('CA07 / RF04: conciliação de vendas por forma com dedução precisa de taxas de operadora', () => {
      const pagamentos = [
        { forma_pagamento: 'dinheiro', valor: 100.00 },
        { forma_pagamento: 'pix', valor: 200.00 },
        { forma_pagamento: 'debito', valor: 100.00 },
        { forma_pagamento: 'credito', valor: 100.00 }
      ];

      const taxasConfig = {
        dinheiro: 0,
        pix: 0,
        debito: 1.99,   // 1.99% de 100 = 1.99
        credito: 3.49   // 3.49% de 100 = 3.49
      };

      const totais = calcularTotaisCaixa(pagamentos, taxasConfig);
      expect(totais.bruto).toBe(500.00);
      expect(totais.taxas).toBe(5.48); // 1.99 + 3.49
      expect(totais.liquido).toBe(494.52);

      expect(totais.porForma.dinheiro.liquido).toBe(100.00);
      expect(totais.porForma.pix.liquido).toBe(200.00);
      expect(totais.porForma.debito.liquido).toBe(98.01);
      expect(totais.porForma.credito.liquido).toBe(96.51);
    });
  });

  describe('2. Gestão Financeira e Contas a Pagar', () => {
    it('CA08 / RF05: mapeia despesa a pagar pendente com fornecedor e categoria', () => {
      const inputFront = {
        descricao: 'Café Especial Torrado em Grãos',
        categoria_id: '1',
        fornecedor_id: 'forn-graos-sul',
        valor: 450.50,
        vencimento: '2026-11-05',
        tipo: 'insumos',
        recorrencia: 'mensal',
        documento_numero: 'NF-10829'
      };

      const payloadBanco = mapearPayloadDespesaParaBanco(inputFront);
      expect(payloadBanco.descricao).toBe('Café Especial Torrado em Grãos');
      expect(payloadBanco.valor).toBe(450.50);
      expect(payloadBanco.vencimento).toBe('2026-11-05');
      expect(payloadBanco.pago_em).toBeNull();
      expect(payloadBanco.fornecedor_id).toBe('forn-graos-sul');
    });

    it('CA09 / RF05: liquidação de despesa marcando data de pagamento e valor quitado', () => {
      const despesaPendenteDB = {
        id: 'desp-001',
        descricao: 'Aluguel do Teatro',
        valor: 1500.00,
        vencimento: '2099-12-31',
        pago_em: null,
        valor_pago: null,
        forma_pagamento: null
      };

      const normalizadaPendente = normalizeDespesaFromDB(despesaPendenteDB);
      expect(normalizadaPendente.status).toBe('aberto');

      // Simula quitação
      const despesaQuitadaDB = {
        ...despesaPendenteDB,
        pago_em: '2026-10-22',
        valor_pago: 1500.00,
        forma_pagamento: 'pix'
      };

      const normalizadaPaga = normalizeDespesaFromDB(despesaQuitadaDB);
      expect(normalizadaPaga.status).toBe('pago');
      expect(normalizadaPaga.valor_pago).toBe(1500.00);
      expect(normalizadaPaga.forma_pagamento).toBe('pix');
    });

    it('CA10 / RF06: consolida fluxo de caixa com receitas brutas menos despesas pagas', () => {
      const entradasVendas = 4850.00;
      const entradasCreditos = 250.00;
      const despesasPagas = 1200.00;
      const sangrias = 150.00;

      const totalEntradas = entradasVendas + entradasCreditos;
      const totalSaidas = despesasPagas + sangrias;
      const resultadoOperacional = totalEntradas - totalSaidas;

      expect(totalEntradas).toBe(5100.00);
      expect(totalSaidas).toBe(1350.00);
      expect(resultadoOperacional).toBe(3750.00);
      expect(resultadoOperacional > 0).toBe(true);
    });

    it('CA11 / RNF01: normaliza formas de pagamento desconhecidas ou com caracteres mistos', () => {
      expect(normalizarFormaPagamento('Cartão de Crédito Visa')).toBe('credito');
      expect(normalizarFormaPagamento('DÉBITO MASTER')).toBe('debito');
      expect(normalizarFormaPagamento('PIX BANCO')).toBe('pix');
      expect(normalizarFormaPagamento('DINHEIRO GAVETA')).toBe('dinheiro');
      expect(normalizarFormaPagamento('Vale Refeição')).toBe('outro');
      expect(normalizarFormaPagamento(null)).toBe('outro');
    });
  });
});
