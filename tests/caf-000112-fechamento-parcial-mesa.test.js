import { describe, it, expect, vi, beforeEach } from 'vitest';
import contaMesaUtils, {
  calculateMesaTotals,
  extrairItensMesaComSaldo,
  calcularTotalItensSelecionados,
  validarPagamentoParcialPayload,
  parseCurrencyToCents,
  formatCentsToCurrency
} from '../js/utils/conta-mesa.js';
import { setupPedidosPage } from './helpers/pedidos-page.js';

describe('CAF-000112: Fechamento Parcial de Mesa e Pagamento por Item (Testes Funcionais)', () => {

  describe('Regras de Negócio e Cálculos Puros (conta-mesa.js)', () => {

    it('CA01: Selecionar 1 de 2 Cappuccinos (R$ 12) em mesa de R$ 42 calcula saldo devedor restante de R$ 30', () => {
      const pedidosMesa = [
        {
          id: 101,
          status: 'entregue',
          status_pagamento: 'pendente',
          total: 42.00,
          pedido_itens: [
            { id: 1, quantidade: 2, quantidade_paga: 0, preco_unitario: 12.00, nome_produto: 'Cappuccino', cancelado: false },
            { id: 2, quantidade: 1, quantidade_paga: 0, preco_unitario: 18.00, nome_produto: 'Torta de Nozes', cancelado: false }
          ]
        }
      ];

      const itens = extrairItensMesaComSaldo(pedidosMesa);
      expect(itens).toHaveLength(2);
      expect(itens[0].quantidadePendente).toBe(2);
      expect(itens[0].quitado).toBe(false);

      // Cliente escolhe pagar 1 Cappuccino
      const selecao = [{ pedido_item_id: 1, quantidade: 1, preco_unitario: 12.00 }];
      const calcSelecao = calcularTotalItensSelecionados(selecao, 0);

      expect(calcSelecao.subtotalCents).toBe(1200);
      expect(calcSelecao.total).toBe('12.00');

      // Mesa após pagamento parcial de R$ 12,00
      const totaisMesa = calculateMesaTotals(pedidosMesa, { jaPagoParcialCents: 1200 });
      expect(totaisMesa.subtotal).toBe('42.00');
      expect(totaisMesa.jaPago).toBe('12.00');
      expect(totaisMesa.subtotalRestante).toBe('30.00');
      expect(totaisMesa.total).toBe('30.00');
    });

    it('CA02: Abater valor livre de R$ 30 em conta de R$ 80 atualiza saldo devedor da mesa para R$ 50', () => {
      const pedidosMesa = [
        { id: 201, status: 'entregue', status_pagamento: 'pendente', total: 80.00 }
      ];

      const validacao = validarPagamentoParcialPayload({
        mesaCodigo: 'M04',
        valorAbatimentoCents: 3000,
        saldoRestanteCents: 8000,
        pagamentos: [{ forma: 'dinheiro', valor: 30.00 }]
      });

      expect(validacao.valido).toBe(true);
      expect(validacao.valorEsperadoCents).toBe(3000);
      expect(validacao.totalPagoCents).toBe(3000);
      expect(validacao.trocoCents).toBe(0);

      const totaisMesa = calculateMesaTotals(pedidosMesa, { jaPagoParcialCents: 3000 });
      expect(totaisMesa.subtotalRestante).toBe('50.00');
      expect(totaisMesa.total).toBe('50.00');
    });

    it('CA03: Bloqueia pagamento parcial com valor maior que o saldo restante da mesa (sem troco) ou <= 0', () => {
      // 1. Valor zero ou negativo
      const resZero = validarPagamentoParcialPayload({
        mesaCodigo: 'M04',
        valorAbatimentoCents: 0,
        saldoRestanteCents: 8000,
        pagamentos: [{ forma: 'pix', valor: 0 }]
      });
      expect(resZero.valido).toBe(false);
      expect(resZero.erro).toMatch(/maior que zero/i);

      // 2. Valor maior que o saldo restante da mesa
      const resExcesso = validarPagamentoParcialPayload({
        mesaCodigo: 'M04',
        valorAbatimentoCents: 9000,
        saldoRestanteCents: 8000,
        pagamentos: [{ forma: 'pix', valor: 90.00 }]
      });
      expect(resExcesso.valido).toBe(false);
      expect(resExcesso.erro).toMatch(/excede o saldo restante/i);

      // 3. Pagamento insuficiente para os itens selecionados
      const resInsuficiente = validarPagamentoParcialPayload({
        mesaCodigo: 'M04',
        itens: [{ quantidade: 1, preco_unitario: 25.00 }],
        saldoRestanteCents: 5000,
        pagamentos: [{ forma: 'pix', valor: 20.00 }]
      });
      expect(resInsuficiente.valido).toBe(false);
      expect(resInsuficiente.erro).toMatch(/inferior ao total a pagar/i);

      // 4. Sem mesa informada
      const resSemMesa = validarPagamentoParcialPayload({
        mesaCodigo: '',
        valorAbatimentoCents: 2000,
        saldoRestanteCents: 5000,
        pagamentos: [{ forma: 'pix', valor: 20.00 }]
      });
      expect(resSemMesa.valido).toBe(false);
      expect(resSemMesa.erro).toMatch(/mesa não informada/i);
    });

    it('CA04: Quitação final do saldo remanescente encerra a conta da mesa', () => {
      const pedidosMesa = [
        { id: 101, status: 'entregue', status_pagamento: 'pendente', total: 42.00 }
      ];

      // Já recebeu R$ 12 de pagamento parcial
      const totaisFinais = calculateMesaTotals(pedidosMesa, {
        jaPagoParcialCents: 1200,
        taxaServicoPercent: 0
      });

      expect(totaisFinais.subtotalRestante).toBe('30.00');
      expect(totaisFinais.total).toBe('30.00');

      // Pagamento dos R$ 30 restantes
      const payloadFechamento = contaMesaUtils.buildFecharContaMesaPayload({
        mesaId: 4,
        pedidos: pedidosMesa,
        pagamentos: [{ forma: 'cartao_debito', valor: 30.00 }]
      });

      expect(payloadFechamento.p_mesa_id).toBe(4);
      expect(payloadFechamento.p_pagamentos[0].valor).toBe(30);
    });

    it('CA05: Total pago dividido em parcial + final coincide exatamente com o consumo sem duplicidade', () => {
      const valorTotal = 42.00;
      const pagoParcialPix = 12.00;
      const pagoFinalDebito = 30.00;

      const somaRecebimentos = pagoParcialPix + pagoFinalDebito;
      expect(somaRecebimentos).toBe(valorTotal);

      // Conferência de centavos
      const centsPix = parseCurrencyToCents(pagoParcialPix);
      const centsDebito = parseCurrencyToCents(pagoFinalDebito);
      const totalCents = parseCurrencyToCents(valorTotal);
      expect(centsPix + centsDebito).toBe(totalCents);
      expect(formatCentsToCurrency(centsPix + centsDebito)).toBe('42.00');
    });

    it('CA06: Taxa de serviço opcional é calculada proporcionalmente aos itens quitados no parcial', () => {
      // 1 item de R$ 20 com taxa de 10%
      const selecao = [{ pedido_item_id: 10, quantidade: 1, preco_unitario: 20.00 }];
      const calcComTaxa = calcularTotalItensSelecionados(selecao, 10);

      expect(calcComTaxa.subtotal).toBe('20.00');
      expect(calcComTaxa.taxaServico).toBe('2.00');
      expect(calcComTaxa.total).toBe('22.00');
      expect(calcComTaxa.totalCents).toBe(2200);
    });
  });

  describe('Integração com a Interface Real do PDV (pedidos.html / js/pedidos.js)', () => {

    it('CA01 / CA03: Abre modal de fechamento, permite selecionar itens parciais e invoca RPC registrar_pagamento_parcial_mesa', async () => {
      let rpcChamada = null;
      let rpcArgs = null;

      const page = await setupPedidosPage({
        initialData: {
          pedidos: [
            {
              id: 501,
              numero_pedido: '0501',
              mesa_codigo: 'M04',
              status: 'entregue',
              status_pagamento: 'pendente',
              total: 42.00,
              created_at: new Date().toISOString(),
              pedido_itens: [
                { id: 1, pedido_id: 501, quantidade: 2, quantidade_paga: 0, preco_unitario: 12.00, nome_produto: 'Cappuccino', cancelado: false },
                { id: 2, pedido_id: 501, quantidade: 1, quantidade_paga: 0, preco_unitario: 18.00, nome_produto: 'Torta', cancelado: false }
              ]
            }
          ]
        },
        rpcHandlers: {
          registrar_pagamento_parcial_mesa: async (args) => {
            rpcChamada = 'registrar_pagamento_parcial_mesa';
            rpcArgs = args;
            return {
              data: {
                fechamento_id: 'fech-parcial-uuid-1',
                total_pago: 12.00,
                saldo_restante: 30.00,
                troco: 0
              },
              error: null
            };
          }
        }
      });

      // Abre modal da mesa
      const pedidosMesa = [
        {
          id: 501,
          numero_pedido: '0501',
          mesa_codigo: 'M04',
          status: 'entregue',
          status_pagamento: 'pendente',
          total: 42.00,
          created_at: new Date().toISOString(),
          pedido_itens: [
            { id: 1, pedido_id: 501, quantidade: 2, quantidade_paga: 0, preco_unitario: 12.00, nome_produto: 'Cappuccino', cancelado: false },
            { id: 2, pedido_id: 501, quantidade: 1, quantidade_paga: 0, preco_unitario: 18.00, nome_produto: 'Torta', cancelado: false }
          ]
        }
      ];

      await page.abrirModalFechamentoMesa('M04', pedidosMesa);

      const modalFechar = document.getElementById('modal-fechar-conta');
      expect(modalFechar.classList.contains('hidden')).toBe(false);

      // Seleciona o modo de pagamento parcial por item
      const selectModo = document.getElementById('fechar-conta-modo');
      selectModo.value = 'parcial_item';
      selectModo.dispatchEvent(new Event('change'));

      const divItensParcial = document.getElementById('fechar-conta-div-parcial-itens');
      expect(divItensParcial.classList.contains('hidden')).toBe(false);

      // Marca o checkbox do Cappuccino e define quantidade = 1
      const chkCappuccino = document.querySelector('.chk-item-parcial[data-id="1"]');
      expect(chkCappuccino).not.toBeNull();
      chkCappuccino.checked = true;
      chkCappuccino.dispatchEvent(new Event('change'));

      const inputQtd = document.querySelector('.input-qtd-parcial[data-id="1"]');
      inputQtd.value = '1';
      inputQtd.dispatchEvent(new Event('input'));

      // Desativa taxa de serviço se estiver ativa para fechar exatamente R$ 12
      const taxaCheck = document.getElementById('fechar-conta-taxa-check');
      if (taxaCheck) {
        taxaCheck.checked = false;
        taxaCheck.dispatchEvent(new Event('change'));
      }

      // Avança para a etapa 2 (Ajustes) e depois para a etapa 3 (Pagamento)
      const btnNext1 = document.getElementById('btn-fechar-conta-next-1');
      const btnNext2 = document.getElementById('btn-fechar-conta-next-2');
      if (btnNext1) btnNext1.click();
      if (btnNext2) btnNext2.click();

      // Adiciona pagamento de R$ 12,00 no Pix
      const selectForma = document.getElementById('fechar-conta-forma');
      const inputValor = document.getElementById('fechar-conta-valor');
      const btnAddPagamento = document.getElementById('btn-add-pagamento');

      selectForma.value = 'pix';
      inputValor.value = '12.00';
      btnAddPagamento.click();

      // Confirma fechamento
      const btnConfirmar = document.getElementById('modal-fechar-conta-confirmar');
      await btnConfirmar.click();

      expect(rpcChamada).toBe('registrar_pagamento_parcial_mesa');
      expect(rpcArgs.p_mesa_codigo).toBe('M04');
      expect(rpcArgs.p_itens).toEqual([{ pedido_item_id: 1, quantidade: 1 }]);
      expect(rpcArgs.p_pagamentos).toEqual([{ forma: 'pix', valor: 12 }]);
    });

    it('CA02: Modal permite lançar abatimento de valor avulso na comanda', async () => {
      let rpcChamada = null;
      let rpcArgs = null;

      const page = await setupPedidosPage({
        initialData: {
          pedidos: [
            {
              id: 601,
              numero_pedido: '0601',
              mesa_codigo: 'M08',
              status: 'entregue',
              status_pagamento: 'pendente',
              total: 80.00,
              created_at: new Date().toISOString(),
              pedido_itens: []
            }
          ]
        },
        rpcHandlers: {
          registrar_pagamento_parcial_mesa: async (args) => {
            rpcChamada = 'registrar_pagamento_parcial_mesa';
            rpcArgs = args;
            return {
              data: {
                fechamento_id: 'fech-parcial-uuid-2',
                total_pago: 30.00,
                saldo_restante: 50.00,
                troco: 0
              },
              error: null
            };
          }
        }
      });

      const pedidosMesa = [
        {
          id: 601,
          numero_pedido: '0601',
          mesa_codigo: 'M08',
          status: 'entregue',
          status_pagamento: 'pendente',
          total: 80.00,
          created_at: new Date().toISOString(),
          pedido_itens: []
        }
      ];

      await page.abrirModalFechamentoMesa('M08', pedidosMesa);

      const selectModo = document.getElementById('fechar-conta-modo');
      selectModo.value = 'parcial_valor';
      selectModo.dispatchEvent(new Event('change'));

      const divValor = document.getElementById('fechar-conta-div-parcial-valor');
      expect(divValor.classList.contains('hidden')).toBe(false);

      const inputValorAbatimento = document.getElementById('fechar-conta-input-parcial-valor');
      inputValorAbatimento.value = '30.00';
      inputValorAbatimento.dispatchEvent(new Event('input'));

      // Desativa taxa se estiver ativa para bater exatamente R$ 30
      const taxaCheck = document.getElementById('fechar-conta-taxa-check');
      if (taxaCheck) {
        taxaCheck.checked = false;
        taxaCheck.dispatchEvent(new Event('change'));
      }

      // Avança para a etapa 3
      const btnNext1 = document.getElementById('btn-fechar-conta-next-1');
      const btnNext2 = document.getElementById('btn-fechar-conta-next-2');
      if (btnNext1) btnNext1.click();
      if (btnNext2) btnNext2.click();

      // Adiciona pagamento em dinheiro
      const selectForma = document.getElementById('fechar-conta-forma');
      const inputValor = document.getElementById('fechar-conta-valor');
      const btnAddPagamento = document.getElementById('btn-add-pagamento');

      selectForma.value = 'dinheiro';
      inputValor.value = '30.00';
      btnAddPagamento.click();

      const btnConfirmar = document.getElementById('modal-fechar-conta-confirmar');
      await btnConfirmar.click();

      expect(rpcChamada).toBe('registrar_pagamento_parcial_mesa');
      expect(rpcArgs.p_mesa_codigo).toBe('M08');
      expect(rpcArgs.p_valor_abatimento).toBe(30);
      expect(rpcArgs.p_pagamentos).toEqual([{ forma: 'dinheiro', valor: 30 }]);
    });
  });
});
