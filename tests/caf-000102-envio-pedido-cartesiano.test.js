import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPedidosPage } from './helpers/pedidos-page.js';
import { gerarProdutoCartesiano } from './helpers/pairwise-generator.js';

describe('CAF-000102: Matriz M1 e M1b — Envio de Pedidos no PDV (360 Combinações Cartesianas)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('CA03: Executa todas as 360 combinações de envio do pedido contra a tabela de decisão (Oráculo M1)', async () => {
    const page = await setupPedidosPage();
    const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

    const dimensoes = {
      destino: ['mesa', 'para_viagem', 'nenhum'],
      cliente: ['nenhum', 'nome_livre', 'cadastrado_habilitado', 'cadastrado_desabilitado'],
      pagamento: ['', 'dinheiro', 'pix', 'cartao_debito', 'conta_cliente'],
      pago: [true, false],
      prioridade: ['normal', 'prioritario', 'intervalo']
    };

    const todasCombinacoes = gerarProdutoCartesiano(dimensoes);
    expect(todasCombinacoes.length).toBe(3 * 4 * 5 * 2 * 3); // 360 combinações

    // Cliente mapping
    const clienteMap = {
      nenhum: null,
      nome_livre: 'Roberta Silva',
      cadastrado_habilitado: { id: 'c_hab', nome: 'Carlos Habilitado', conta_habilitada: true },
      cadastrado_desabilitado: { id: 'c_des', nome: 'Daniela Desabilitada', conta_habilitada: false }
    };

    // Garante que o produto está no carrinho inicialmente
    page.adicionarItemAoCarrinho(produto, 1);

    for (let i = 0; i < todasCombinacoes.length; i++) {
      const combo = todasCombinacoes[i];
      const clienteObj = clienteMap[combo.cliente];

      // Garante item no carrinho para esta iteração
      if (!document.getElementById('cart-items')?.querySelector('.cart-item')) {
        page.adicionarItemAoCarrinho(produto, 1);
      }

      // Configura os campos no DOM
      page.selecionarMesa(combo.destino === 'mesa' ? '01' : '');
      page.marcarParaViagem(combo.destino === 'para_viagem');
      page.selecionarCliente(clienteObj);
      page.selecionarPagamento(combo.pagamento, combo.pago);
      page.marcarPrioritario(combo.prioridade === 'prioritario', 'Refazer');
      page.marcarIntervalo(combo.prioridade === 'intervalo');
      page.definirObservacao('');

      page.limparChamadasRpc();
      page.toasts.length = 0;

      await page.submeterPedido();

      // Oráculo de Decisão:
      if (combo.destino === 'nenhum') {
        // Bloqueio 2: Sem mesa e sem para viagem
        expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
        const errToast = page.toasts.find(t => t.message.includes('selecione uma mesa'));
        expect(errToast).toBeDefined();
      } else if (combo.pagamento === 'conta_cliente' && (!clienteObj || typeof clienteObj === 'string')) {
        // Bloqueio 3: conta_cliente sem cliente cadastrado
        expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
        const errToast = page.toasts.find(t => t.message.includes('Selecione um cliente cadastrado'));
        expect(errToast).toBeDefined();
      } else if (combo.pagamento === 'conta_cliente' && clienteObj?.conta_habilitada === false) {
        // Bloqueio 4: conta_cliente com conta desabilitada
        expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
        const errToast = page.toasts.find(t => t.message.includes('não está habilitada'));
        expect(errToast).toBeDefined();
      } else {
        // Sucesso: 1 chamada à RPC com payload rigoroso
        const rpcCalls = page.obterChamadasRpc('criar_pedido');
        expect(rpcCalls.length).toBe(1);
        const payload = rpcCalls[0].args.p_payload;

        expect(payload.mesa_codigo).toBe(combo.destino === 'mesa' ? '01' : 'BALCAO');
        expect(payload.para_viagem).toBe(combo.destino === 'para_viagem');
        expect(payload.cliente_id).toBe(typeof clienteObj === 'object' && clienteObj ? clienteObj.id : null);
        expect(payload.cliente_nome).toBe(
          typeof clienteObj === 'string'
            ? clienteObj
            : (clienteObj?.nome || '')
        );
        expect(payload.forma_pagamento).toBe(combo.pagamento || null);
        expect(payload.status_pagamento).toBe(
          (combo.pagamento === 'conta_cliente' || combo.pago) ? 'pago' : 'pendente'
        );
        expect(payload.prioridade).toBe(
          (combo.prioridade === 'prioritario' || combo.prioridade === 'intervalo') ? 1 : 0
        );
        expect(payload.prioridade_motivo).toBe(
          combo.prioridade === 'intervalo'
            ? 'Espetáculo (Intervalo)'
            : (combo.prioridade === 'prioritario' ? 'Refazer' : null)
        );
        expect(payload.is_intervalo).toBe(combo.prioridade === 'intervalo');
        if (combo.prioridade === 'intervalo') {
          expect(typeof payload.retirada_em).toBe('string');
          expect(payload.observacoes).toContain('[🎭 Intervalo]');
        }
        expect(typeof payload.client_id).toBe('string');
        expect(payload.client_id.length).toBeGreaterThanOrEqual(10);
        expect(Array.isArray(payload.itens)).toBe(true);
        expect(payload.itens.length).toBe(1);
      }
    }
  }, 25000);

  it('CA03 (borda): Carrinho vazio bloqueia o envio imediatamente sem chamar RPC', async () => {
    const page = await setupPedidosPage();
    page.limparCarrinho();
    page.selecionarMesa('01');
    page.limparChamadasRpc();
    page.toasts.length = 0;

    await page.submeterPedido();

    expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
    const toast = page.toasts.find(t => t.message.includes('Adicione ao menos um item ao carrinho'));
    expect(toast).toBeDefined();
  });

  it('CA04: Após envio válido, limpa carrinho, observações, cliente, pagamento e rascunho', async () => {
    const page = await setupPedidosPage();
    const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

    page.adicionarItemAoCarrinho(produto, 1);
    page.selecionarMesa('01');
    page.definirObservacao('Com pouco açúcar');
    page.selecionarCliente('Cliente Teste');
    page.selecionarPagamento('pix', true);
    page.marcarPrioritario(true, 'VIP');

    // Simula rascunho salvo
    localStorage.setItem('cafeteria_pdv_carrinho_rascunho', JSON.stringify({ cart: [{ id: 'p1' }] }));

    await page.submeterPedido();

    expect(page.obterChamadasRpc('criar_pedido').length).toBe(1);

    // Valida limpeza total do formulário e estado
    expect(document.getElementById('cart-items')?.textContent).toContain('Nenhum item adicionado');
    expect(document.getElementById('pedido-obs')?.value).toBe('');
    expect(document.getElementById('pedido-cliente-nome')?.value).toBe('');
    expect(document.getElementById('pedido-pagamento')?.value).toBe('');
    expect(document.getElementById('pedido-pago')?.checked).toBe(false);
    expect(document.getElementById('pedido-para-viagem')?.checked).toBe(false);
    expect(document.getElementById('pedido-prioritario')?.checked).toBe(false);
    expect(document.getElementById('mesa-select')?.value).toBe('');
    expect(localStorage.getItem('cafeteria_pdv_carrinho_rascunho')).toBeNull();
  });

  describe('CA05: M1b — Resultados de Conexão e Fila Offline', () => {
    it('Modo 1: Online e RPC ok -> toast de sucesso e nenhum item na fila offline', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('01');
      await page.submeterPedido();

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(1);
      const queueCount = document.getElementById('offline-queue-count');
      expect(!queueCount || queueCount.textContent === '' || queueCount.textContent === '0').toBe(true);
    });

    it('Modo 2: Online com erro de negócio -> toast de erro com ação "Restaurar", que devolve carrinho e form', async () => {
      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: () => ({ data: null, error: { message: 'Limite de crédito excedido no fechamento.' } })
        }
      });
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('01');
      page.definirObservacao('Sem açúcar');
      page.selecionarCliente('Marcos Vinicius');

      await page.submeterPedido();

      // Encontra o toast de erro com a ação Restaurar
      const errToast = page.toasts.find(t => t.acaoTexto === 'Restaurar');
      expect(errToast).toBeDefined();

      // Carrinho foi limpo otimisticamente
      expect(document.getElementById('pedido-obs')?.value).toBe('');

      // Executa a restauração
      errToast.acaoCb();

      // Verifica se os dados anteriores foram recompostos
      expect(document.getElementById('mesa-select')?.value).toBe('01');
      expect(document.getElementById('pedido-obs')?.value).toBe('Sem açúcar');
      expect(document.getElementById('pedido-cliente-nome')?.value).toBe('Marcos Vinicius');
      expect(document.getElementById('cart-items')?.textContent).toContain('Espresso');
    });

    it('Modo 3: Online com erro de rede/timeout -> pedido guardado na fila offline', async () => {
      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: () => ({ data: null, error: { message: 'Failed to fetch network timeout' } })
        }
      });
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('01');

      await page.submeterPedido();
      for (let i = 0; i < 30; i++) {
        if (page.toasts.some(t => t.message.includes('guardado na fila offline') || t.message.includes('offline'))) break;
        await new Promise(r => setTimeout(r, 10));
      }

      const warningToast = page.toasts.find(t => t.message.includes('guardado na fila offline') || t.message.includes('offline'));
      expect(warningToast).toBeDefined();
    });

    it('Modo 4: Offline (navigator.onLine=false) -> salva direto na fila; conta_cliente offline é bloqueado', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      // Mock offline
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));

      // Subcenário A: Pedido normal offline vai para a fila
      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('01');
      page.limparChamadasRpc();
      page.toasts.length = 0;

      await page.submeterPedido();
      await new Promise(r => setTimeout(r, 50));

      expect(page.obterChamadasRpc('criar_pedido').length).toBe(0);
      const offlineToast = page.toasts.find(t => t.message.includes('guardado na fila offline'));
      expect(offlineToast).toBeDefined();

      // Subcenário B: conta_cliente em modo offline é estritamente bloqueado
      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('01');
      page.selecionarCliente({ id: 'c_hab', nome: 'Carlos Habilitado', conta_habilitada: true });
      page.selecionarPagamento('conta_cliente', false);
      page.toasts.length = 0;

      await page.submeterPedido();

      const blockedToast = page.toasts.find(t => t.message.includes('requer conexão ativa com a internet'));
      expect(blockedToast).toBeDefined();
    });
  });
});
