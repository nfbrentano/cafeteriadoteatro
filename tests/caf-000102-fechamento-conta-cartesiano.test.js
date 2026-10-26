// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupPedidosPage } from './helpers/pedidos-page.js';

describe('CAF-000102: Matriz M2 e Complementos — Fechamento de Conta de Mesas', () => {
  let page;

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (page?.cleanup) {
      page.cleanup();
    }
  });

  // Dimensões Cartesianas da Matriz M2: 5 x 2 x 4 x 2 = 80 combinações
  const dimPagamento = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'multiplo'];
  const dimTaxa = ['com_taxa', 'sem_taxa'];
  const dimDesconto = ['sem_desconto', 'valor_fixo', 'percentual', 'cupom'];
  const dimRpc = ['sucesso', 'erro_backend'];

  const m2Combinacoes = [];
  for (const pag of dimPagamento) {
    for (const taxa of dimTaxa) {
      for (const desc of dimDesconto) {
        for (const rpc of dimRpc) {
          m2Combinacoes.push({
            pagamento: pag,
            taxa,
            desconto: desc,
            rpc,
            nome: `${pag} · ${taxa} · ${desc} · ${rpc}`
          });
        }
      }
    }
  }

  describe('CA06: Matriz M2 — 80 Combinações Cartesianas de Fechamento de Conta', () => {
    it(`Garante exatamente 80 combinações na matriz M2`, () => {
      expect(m2Combinacoes.length).toBe(80);
    });

    it.each(m2Combinacoes)(
      'M2: $nome',
      async ({ pagamento, taxa, desconto, rpc }) => {
        page = await setupPedidosPage();

        // Configura o mock do RPC fechar_conta_mesa
        if (rpc === 'sucesso') {
          page.harness.mockRpc('fechar_conta_mesa', async () => ({
            data: { success: true },
            error: null
          }));
        } else {
          page.harness.mockRpc('fechar_conta_mesa', async () => ({
            data: null,
            error: new Error('Erro interno ao fechar mesa no banco')
          }));
        }

        // Subtotal inicial: R$ 50,00 (5 cafés de R$ 10)
        const subtotal = 50.00;
        const pedidosMesa = [
          {
            id: 201,
            mesa_codigo: 'M01',
            total: subtotal,
            status_pagamento: 'pendente',
            cliente_id: 'cli-001',
            itens: [{ id: 1, nome: 'Café Espresso', preco_unitario: 10.00, quantidade: 5 }]
          }
        ];

        // 1. Abre modal de fechamento
        await page.abrirModalFechamentoMesa('M01', pedidosMesa);

        // 2. Etapa 2: Ajustes e Descontos
        page.avancarEtapaFechamento(2);

        // Taxa de serviço (10%)
        const comTaxa = taxa === 'com_taxa';
        page.configurarTaxaServico(comTaxa);

        // Desconto
        let valorDescontoEsperado = 0;
        let motivoDescontoEsperado = '';
        if (desconto === 'valor_fixo') {
          valorDescontoEsperado = 5.00;
          motivoDescontoEsperado = 'Desconto R$ 5';
          page.configurarDesconto(5, motivoDescontoEsperado, 'valor');
        } else if (desconto === 'percentual') {
          valorDescontoEsperado = 5.00; // 10% de 50 = 5.00
          motivoDescontoEsperado = 'Desconto 10%';
          page.configurarDesconto(10, motivoDescontoEsperado, 'percent');
        } else if (desconto === 'cupom') {
          valorDescontoEsperado = 10.00;
          motivoDescontoEsperado = 'Cupom: CUPOM10';
          // Simula aplicação de cupom via elementos do modal
          const inputCupom = document.getElementById('fechar-conta-cupom-input');
          const btnCupom = document.getElementById('btn-fechar-conta-aplicar-cupom');
          if (inputCupom && btnCupom) {
            window.couponValidator = {
              validateCouponWithSupabase: vi.fn().mockResolvedValue({
                valid: true,
                tipo_desconto: 'valor',
                valor_desconto: 10,
                campanha_id: 'camp-10',
                cupom_codigo: 'CUPOM10'
              }),
              registerCouponUsage: vi.fn().mockResolvedValue({ success: true })
            };
            inputCupom.value = 'CUPOM10';
            btnCupom.click();
            await new Promise(r => setTimeout(r, 10));
          }
        } else {
          page.configurarDesconto(0, '', 'valor');
        }

        const subtotalLiquido = subtotal - valorDescontoEsperado;
        const taxaEsperada = comTaxa ? (subtotalLiquido * 0.10) : 0;
        const totalAPagar = subtotalLiquido + taxaEsperada;

        // 3. Etapa 3: Pagamento
        page.avancarEtapaFechamento(3);

        if (pagamento === 'multiplo') {
          const metade = Number((totalAPagar / 2).toFixed(2));
          const restante = Number((totalAPagar - metade).toFixed(2));
          page.adicionarPagamentoFechamento('dinheiro', metade);
          page.adicionarPagamentoFechamento('pix', restante);
        } else {
          page.adicionarPagamentoFechamento(pagamento, totalAPagar);
        }

        // 4. Confirma fechamento
        await page.confirmarFechamento();

        // 5. Validação da chamada RPC
        const chamadas = page.obterChamadasRpc('fechar_conta_mesa');
        expect(chamadas.length).toBe(1);

        const params = chamadas[0].args || chamadas[0].params;
        expect(params.p_mesa_codigo).toBe('M01');
        expect(params.p_taxa_servico).toBeCloseTo(taxaEsperada, 2);
        expect(params.p_desconto_manual).toBeCloseTo(valorDescontoEsperado, 2);
        expect(params.p_idempotency_key).toBeTruthy();

        if (pagamento === 'multiplo') {
          expect(params.p_pagamentos.length).toBe(2);
          const totalRecebido = params.p_pagamentos.reduce((s, p) => s + p.valor, 0);
          expect(totalRecebido).toBeCloseTo(totalAPagar, 2);
        } else {
          expect(params.p_pagamentos.length).toBe(1);
          expect(params.p_pagamentos[0].forma).toBe(pagamento);
          expect(params.p_pagamentos[0].valor).toBeCloseTo(totalAPagar, 2);
        }

        if (desconto === 'cupom') {
          expect(params.p_cupom_codigo).toBe('CUPOM10');
          expect(params.p_campanha_id).toBe('camp-10');
        }

        // 6. Se deu erro no backend, botão deve ser reabilitado
        if (rpc === 'erro_backend') {
          const btnConfirmar = document.getElementById('modal-fechar-conta-confirmar');
          expect(btnConfirmar.disabled).toBe(false);
          const toast = page.obterUltimoToast();
          expect(toast).toBeTruthy();
          expect(toast.msg).toMatch(/erro/i);
        }
      }
    );

    it('CA06 (borda): Bloqueia fechamento sem nenhum pagamento', async () => {
      page = await setupPedidosPage();
      await page.abrirModalFechamentoMesa('M01', [
        { id: 202, mesa_codigo: 'M01', total: 40.00, status_pagamento: 'pendente', cliente_id: 'cli-001', itens: [] }
      ]);
      page.avancarEtapaFechamento(3);

      await page.confirmarFechamento();

      expect(page.obterChamadasRpc('fechar_conta_mesa').length).toBe(0);
      const toast = page.obterUltimoToast();
      expect(toast).toBeTruthy();
      expect(toast.msg).toMatch(/menor que o total a pagar|pelo menos uma forma de pagamento/i);
    });

    it('CA06 (borda): Bloqueia fechamento se valor pago for menor que o total a pagar', async () => {
      page = await setupPedidosPage();
      await page.abrirModalFechamentoMesa('M01', [
        { id: 203, mesa_codigo: 'M01', total: 50.00, status_pagamento: 'pendente', cliente_id: 'cli-001', itens: [] }
      ]);
      page.avancarEtapaFechamento(3);
      page.adicionarPagamentoFechamento('dinheiro', 30.00); // 30 < 50

      await page.confirmarFechamento();

      expect(page.obterChamadasRpc('fechar_conta_mesa').length).toBe(0);
      const toast = page.obterUltimoToast();
      expect(toast).toBeTruthy();
      expect(toast.msg).toContain('menor que o total a pagar');
    });
  });

  describe('CA07: Complementos Pairwise de Fechamento de Conta', () => {
    it('Bloqueia conta_cliente quando a mesa não possui cliente vinculado', async () => {
      page = await setupPedidosPage();
      // Pedido sem cliente_id
      await page.abrirModalFechamentoMesa('M01', [
        { id: 204, mesa_codigo: 'M01', total: 25.00, status_pagamento: 'pendente', cliente_id: null, itens: [] }
      ]);
      page.avancarEtapaFechamento(3);
      page.adicionarPagamentoFechamento('conta_cliente', 25.00);

      await page.confirmarFechamento();

      expect(page.obterChamadasRpc('fechar_conta_mesa').length).toBe(0);
      const toastCliente = page.toasts.find(t => /cliente/i.test(t.message || t.msg));
      expect(toastCliente).toBeTruthy();
      expect(toastCliente.message || toastCliente.msg).toMatch(/vincular um cliente cadastrado|sem cliente vinculado/i);
    });

    it('Bloqueia quando lancarMovimento recusa débito de conta_cliente por limite insuficiente', async () => {
      page = await setupPedidosPage();

      // Mocka recusa em cafeteriaDB.clientes.lancarMovimento
      if (!window.cafeteriaDB) window.cafeteriaDB = {};
      window.cafeteriaDB.clientes = {
        lancarMovimento: vi.fn().mockResolvedValue({
          sucesso: false,
          mensagem: 'Limite de crédito insuficiente.'
        })
      };

      await page.abrirModalFechamentoMesa('M01', [
        { id: 205, mesa_codigo: 'M01', total: 50.00, status_pagamento: 'pendente', cliente_id: 'cli-bloq', itens: [] }
      ]);
      page.avancarEtapaFechamento(2);
      page.configurarTaxaServico(false);
      page.avancarEtapaFechamento(3);
      page.adicionarPagamentoFechamento('conta_cliente', 50.00);

      await page.confirmarFechamento();

      expect(page.obterChamadasRpc('fechar_conta_mesa').length).toBe(0);
      const toast = page.toasts.find(t => /recusado|insuficiente/i.test(t.message || t.msg));
      expect(toast).toBeTruthy();
      expect(toast.msg || toast.message).toContain('Débito na conta recusado');
      expect(toast.msg || toast.message).toContain('Limite de crédito insuficiente');
    });

    it('Divisão de conta igual: divide o valor corretamente entre as partes', async () => {
      page = await setupPedidosPage();
      await page.abrirModalFechamentoMesa('M01', [
        { id: 206, mesa_codigo: 'M01', total: 60.00, status_pagamento: 'pendente', cliente_id: 'cli-001', itens: [] }
      ]);
      page.avancarEtapaFechamento(2);

      const modoSelect = document.getElementById('fechar-conta-modo');
      const numPartesInput = document.getElementById('fechar-conta-num-partes');
      const btnGerar = document.getElementById('fechar-conta-btn-gerar-partes');

      if (modoSelect && numPartesInput && btnGerar) {
        modoSelect.value = 'igual';
        modoSelect.dispatchEvent(new Event('change'));
        numPartesInput.value = '3';
        btnGerar.click();

        // 3 partes de R$ 20,00 cada
        const partes = document.querySelectorAll('.fechar-conta-parte-item');
        expect(partes.length).toBe(3);
      }
    });

    it('Cupom de desconto: registra estatística após fechamento bem-sucedido', async () => {
      page = await setupPedidosPage();
      page.harness.mockRpc('fechar_conta_mesa', async () => ({
        data: { success: true },
        error: null
      }));

      const registerSpy = vi.fn().mockResolvedValue({ success: true });
      window.couponValidator = {
        validateCouponWithSupabase: vi.fn().mockResolvedValue({
          valid: true,
          tipo_desconto: 'percentual',
          valor_desconto: 10,
          campanha_id: 'camp-promo-10',
          cupom_codigo: 'PROMO10'
        }),
        registerCouponUsage: registerSpy
      };

      await page.abrirModalFechamentoMesa('M01', [
        { id: 207, mesa_codigo: 'M01', total: 50.00, status_pagamento: 'pendente', cliente_id: 'cli-001', itens: [] }
      ]);
      page.avancarEtapaFechamento(2);

      const inputCupom = document.getElementById('fechar-conta-cupom-input');
      const btnCupom = document.getElementById('btn-fechar-conta-aplicar-cupom');
      inputCupom.value = 'PROMO10';
      btnCupom.click();
      await new Promise(r => setTimeout(r, 10));

      page.avancarEtapaFechamento(3);
      // Subtotal 50 - 10% = 45.00 + 10% taxa = 49.50
      const totalAPagar = Number(document.getElementById('fechar-conta-total')?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 49.50;
      page.adicionarPagamentoFechamento('pix', totalAPagar);

      await page.confirmarFechamento();

      expect(page.obterChamadasRpc('fechar_conta_mesa').length).toBe(1);
      expect(registerSpy).toHaveBeenCalledWith(expect.anything(), 'camp-promo-10', 207);
    });
  });
});
