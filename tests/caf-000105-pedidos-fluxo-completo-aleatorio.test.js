import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupPedidosPage } from './helpers/pedidos-page.js';
import {
  createPrng,
  CATALOGO_TESTE,
  gerarPedidoAleatorio,
  MOTIVOS_PRIORIDADE,
  FORMAS_PAGAMENTO
} from './helpers/random-order-generator.js';

describe('CAF-000105: Suíte de Testes Automatizados de Fluxo Completo de Pedidos com Variações Aleatórias', () => {
  let page;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (page?.cleanup) {
      page.cleanup();
    }
  });

  /**
   * Helper para montar e submeter um pedido gerado pelo oráculo no DOM real.
   */
  async function executarFluxoPedidoNoDom(page, pedido) {
    page.limparCarrinho();
    page.limparChamadasRpc();

    // 1. Adicionar cada item ao carrinho
    for (const item of pedido.itens) {
      page.adicionarItemAoCarrinho(item.produto, item.quantidade, item.adicionais);
    }

    // 2. Destino do Pedido (Levar vs. Mesa)
    if (pedido.paraViagem) {
      page.marcarParaViagem(true);
      page.selecionarMesa('');
    } else {
      page.marcarParaViagem(false);
      page.selecionarMesa(pedido.mesaCodigo);
    }

    // 3. Prioridade e Intervalo
    if (pedido.isIntervalo) {
      page.marcarPrioritario(false);
      page.marcarIntervalo(true);
    } else if (pedido.prioridadeTipo === 'prioritario') {
      page.marcarIntervalo(false);
      page.marcarPrioritario(true, pedido.motivoPrioridade);
    } else {
      page.marcarIntervalo(false);
      page.marcarPrioritario(false);
    }

    // 4. Cliente e Pagamento
    page.selecionarCliente(pedido.cliente);
    page.selecionarPagamento(pedido.formaPagamento, pedido.pago);

    // 5. Observação
    page.definirObservacao(pedido.observacao);

    // 6. Validação do total calculado no DOM antes do envio
    const totalFormatado = pedido.totalEsperado.toFixed(2).replace('.', ',');
    const cartTotalElem = document.getElementById('cart-total-value');
    expect(cartTotalElem.textContent).toContain(totalFormatado);

    // 7. Submissão do Pedido
    await page.submeterPedido();
    await new Promise(r => setTimeout(r, 20));

    // 8. Validação da RPC criar_pedido
    const rpcCalls = page.obterChamadasRpc('criar_pedido');
    expect(rpcCalls.length).toBe(1);

    const payload = rpcCalls[0].args.p_payload;

    expect(payload.mesa_codigo).toBe(pedido.mesaCodigo);
    expect(payload.para_viagem).toBe(pedido.paraViagem);
    expect(payload.prioridade).toBe(pedido.prioridadeFlag);
    expect(payload.prioridade_motivo).toBe(pedido.motivoPrioridade);
    expect(payload.is_intervalo).toBe(pedido.isIntervalo);
    expect(payload.forma_pagamento).toBe(pedido.formaPagamento);
    expect(payload.status_pagamento).toBe(pedido.statusPagamento);
    
    // Validação de quantidade total de itens enviados na RPC
    const totalQtdEsperada = pedido.itens.reduce((acc, it) => acc + it.quantidade, 0);
    const totalQtdRpc = payload.itens.reduce((acc, it) => acc + it.quantidade, 0);
    expect(totalQtdRpc).toBe(totalQtdEsperada);

    // 9. Validação pós-envio: carrinho esvaziado
    const cartItems = document.querySelectorAll('.cart-item');
    expect(cartItems.length).toBe(0);

    return payload;
  }

  describe('Módulo 1: Fluxo Completo "Para Levar" (Takeout) com Variações Aleatórias (CA01)', () => {
    it('CA01: Executa 5 fluxos completos de pedidos para levar com produtos e pagamentos aleatórios', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(101);

      for (let i = 0; i < 5; i++) {
        const pedido = gerarPedidoAleatorio({ forcarDestino: 'levar' }, rng);
        expect(pedido.paraViagem).toBe(true);
        expect(pedido.mesaCodigo).toBe('BALCAO');

        const payload = await executarFluxoPedidoNoDom(page, pedido);
        expect(payload.para_viagem).toBe(true);
        expect(payload.mesa_codigo).toBe('BALCAO');
      }
    });
  });

  describe('Módulo 2: Fluxo Completo "Comer na Mesa" com Seleção Dinâmica de Mesas (CA02)', () => {
    it('CA02: Executa 5 fluxos completos com mesas diferentes (01 a 05) e produtos aleatórios', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(202);

      for (let i = 0; i < 5; i++) {
        const pedido = gerarPedidoAleatorio({ forcarDestino: 'mesa' }, rng);
        expect(pedido.paraViagem).toBe(false);
        expect(pedido.mesaCodigo).toMatch(/0[1-5]/);

        const payload = await executarFluxoPedidoNoDom(page, pedido);
        expect(payload.para_viagem).toBe(false);
        expect(payload.mesa_codigo).toBe(pedido.mesaCodigo);
      }
    });
  });

  describe('Módulo 3: Fluxo Completo com Prioridades, Motivos e Intervalo (CA03)', () => {
    it('CA03 - Caso A: Executa pedidos com cada um dos motivos de prioridade possíveis', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(303);

      for (const motivo of MOTIVOS_PRIORIDADE) {
        const pedido = gerarPedidoAleatorio({
          forcarPrioridade: 'prioritario',
          motivoPrioridade: motivo
        }, rng);

        const payload = await executarFluxoPedidoNoDom(page, pedido);
        expect(payload.prioridade).toBe(1);
        expect(payload.prioridade_motivo).toBe(motivo);
      }
    });

    it('CA03 - Caso B: Executa pedido com intervalo de espetáculo e verifica retirada_em', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(404);

      const pedido = gerarPedidoAleatorio({ forcarPrioridade: 'intervalo' }, rng);
      const payload = await executarFluxoPedidoNoDom(page, pedido);

      expect(payload.prioridade).toBe(1);
      expect(payload.prioridade_motivo).toBe('Espetáculo (Intervalo)');
      expect(payload.is_intervalo).toBe(true);
      expect(payload.observacoes).toContain('[🎭 Intervalo]');
      expect(typeof payload.retirada_em).toBe('string');
    });

    it('CA03 - Caso C: Pedido normal sem prioridade envia prioridade 0 e motivo nulo', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(505);

      const pedido = gerarPedidoAleatorio({ forcarPrioridade: 'normal' }, rng);
      const payload = await executarFluxoPedidoNoDom(page, pedido);

      expect(payload.prioridade).toBe(0);
      expect(payload.prioridade_motivo).toBeNull();
      expect(payload.is_intervalo).toBe(false);
    });
  });

  describe('Módulo 4: Bateria Randômica Estendida de 30 Pedidos E2E (CA04, CA05, CA06)', () => {
    it('CA04, CA05, CA06: Executa 30 ciclos de pedidos aleatórios com seed determinístico', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      const rng = createPrng(999);

      for (let ciclo = 1; ciclo <= 30; ciclo++) {
        const pedido = gerarPedidoAleatorio({}, rng);
        const payload = await executarFluxoPedidoNoDom(page, pedido);

        // Verifica integridade do payload
        expect(payload.client_id).toBeDefined();
        expect(payload.itens.length).toBeGreaterThanOrEqual(1);

        // Verifica que todos os itens têm produto_id válido do catálogo
        for (const it of payload.itens) {
          expect(CATALOGO_TESTE.produtos.some(p => p.id === it.produto_id)).toBe(true);
        }

        // Verifica que o carrinho foi limpo (itens zerados e estado vazio exibido)
        expect(document.querySelectorAll('.cart-item').length).toBe(0);
        expect(document.querySelector('.cart-empty')).toBeTruthy();
      }
    });
  });

  describe('Módulo 5: Bloqueios de Validação e Casos Negativos (CA07)', () => {
    it('CA07 - Caso 1: Bloqueia envio se o carrinho estiver vazio', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      page.limparCarrinho();
      page.limparChamadasRpc();

      page.marcarParaViagem(true);
      await page.submeterPedido();

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
      const toast = page.toasts.find(t => t.message.includes('Adicione ao menos um item'));
      expect(toast).toBeDefined();
    });

    it('CA07 - Caso 2: Bloqueia envio se nenhuma mesa nem "para viagem" for informada', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      page.limparCarrinho();
      page.limparChamadasRpc();

      const prod = CATALOGO_TESTE.produtos[0];
      page.adicionarItemAoCarrinho(prod, 1);
      page.selecionarMesa('');
      page.marcarParaViagem(false);

      await page.submeterPedido();

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
      const toast = page.toasts.find(t => t.message.includes('selecione uma mesa'));
      expect(toast).toBeDefined();
    });

    it('CA07 - Caso 3: Bloqueia pagamento "conta_cliente" sem cliente cadastrado selecionado', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      page.limparCarrinho();
      page.limparChamadasRpc();

      const prod = CATALOGO_TESTE.produtos[0];
      page.adicionarItemAoCarrinho(prod, 1);
      page.marcarParaViagem(true);
      page.selecionarCliente(null);
      page.selecionarPagamento('conta_cliente', false);

      await page.submeterPedido();

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
      const toast = page.toasts.find(t => t.message.includes('Selecione um cliente cadastrado'));
      expect(toast).toBeDefined();
    });

    it('CA07 - Caso 4: Bloqueia pagamento "conta_cliente" se a conta do cliente estiver desabilitada', async () => {
      page = await setupPedidosPage({ initialData: CATALOGO_TESTE });
      page.limparCarrinho();
      page.limparChamadasRpc();

      const prod = CATALOGO_TESTE.produtos[0];
      const clienteDesabilitado = CATALOGO_TESTE.clientes.find(c => !c.conta_habilitada);

      page.adicionarItemAoCarrinho(prod, 1);
      page.marcarParaViagem(true);
      page.selecionarCliente(clienteDesabilitado);
      page.selecionarPagamento('conta_cliente', false);

      await page.submeterPedido();

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
      const toast = page.toasts.find(t => t.message.includes('não está habilitada'));
      expect(toast).toBeDefined();
    });
  });
});
