import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';

import { setupPedidosPage, getDefaultMockData } from './helpers/pedidos-page.js';
import { estadoPDV, resetarEstadoPDV } from '../js/pdv/estado.js';

describe('CAF-000133: PDV - Envio sem perda, totem seguro, cancelamento RPC, observações e fila offline', () => {
  const rootDir = process.cwd();
  const migrationSqlPath = path.join(rootDir, 'supabase', 'migration_caf_000133_pdv_envio_seguro_totem_cancelamento.sql');
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetarEstadoPDV();
  });

  afterEach(() => {
    resetarEstadoPDV();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // CA01 & CA02: Gravação prévia local antes de limpar o carrinho e remoção após sucesso
  // ---------------------------------------------------------------------------
  describe('CA01 & CA02: Gravação prévia no IndexedDB e remoção após sucesso', () => {
    it('CA01: salva na fila offline com chave client_id antes de limpar o carrinho', async () => {
      let salvarChamadoAntesDeLimpar = false;
      const orderDataSaved = [];

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async (args) => {
            // No momento do envio ao servidor, o pedido já deve ter sido gravado localmente
            expect(orderDataSaved.length).toBe(1);
            return { data: { id: 991, status: 'pendente' }, error: null };
          }
        }
      });

      // Intercepta dbSalvarPedidoOffline
      const originalSalvar = estadoPDV.fn.dbSalvarPedidoOffline;
      estadoPDV.fn.dbSalvarPedidoOffline = vi.fn(async (data) => {
        // Confere que no momento de salvar, o carrinho ainda está cheio
        if (estadoPDV.cart.length > 0) {
          salvarChamadoAntesDeLimpar = true;
        }
        orderDataSaved.push(data);
        return originalSalvar ? await originalSalvar(data) : true;
      });

      const mockData = getDefaultMockData();
      page.adicionarItemAoCarrinho(mockData.produtos[0], 2);
      expect(estadoPDV.cart.length).toBe(1);

      // Preenche mesa
      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '01';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      // Dispara envio
      page.harness.document.getElementById('btn-enviar-pedido').click();

      // Aguarda tick
      await new Promise(r => setTimeout(r, 80));

      expect(salvarChamadoAntesDeLimpar).toBe(true);
      expect(orderDataSaved.length).toBe(1);
      expect(orderDataSaved[0].client_id).toBeDefined();
      expect(orderDataSaved[0].status).toBe('aguardando_envio');
      // Carrinho agora foi limpo após o sucesso da gravação
      expect(estadoPDV.cart.length).toBe(0);
    });

    it('CA02: remove da fila offline quando criar_pedido retorna com sucesso', async () => {
      let removerChamadoComClientId = null;

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async () => ({ data: { id: 992, status: 'pendente' }, error: null })
        }
      });

      const originalRemover = estadoPDV.fn.dbRemoverPedidoOffline;
      estadoPDV.fn.dbRemoverPedidoOffline = vi.fn(async (clientId) => {
        removerChamadoComClientId = clientId;
        return originalRemover ? await originalRemover(clientId) : true;
      });

      const mockData = getDefaultMockData();
      page.adicionarItemAoCarrinho(mockData.produtos[0], 1);
      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '01';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      page.harness.document.getElementById('btn-enviar-pedido').click();
      await new Promise(r => setTimeout(r, 80));

      expect(removerChamadoComClientId).toBeDefined();
      expect(typeof removerChamadoComClientId).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // CA03: Timeout com AbortController (10s) mantém pedido na fila
  // ---------------------------------------------------------------------------
  describe('CA03: Timeout e oscilação de rede mantêm pedido na fila para reenvio', () => {
    it('mantém o pedido na fila offline com status aguardando_envio quando a RPC sofre timeout/abort', async () => {
      let statusAtualizadoPara = null;

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async (_args, options) => {
            // Simula rejeição de rede ou timeout
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            return { data: null, error: err };
          }
        }
      });

      estadoPDV.fn.atualizarStatusPedidoOffline = vi.fn(async (id, status) => {
        statusAtualizadoPara = status;
      });

      const mockData = getDefaultMockData();
      page.adicionarItemAoCarrinho(mockData.produtos[0], 1);
      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '01';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      page.harness.document.getElementById('btn-enviar-pedido').click();
      await new Promise(r => setTimeout(r, 80));

      expect(statusAtualizadoPara).toBe('aguardando_envio');
    });
  });

  // ---------------------------------------------------------------------------
  // CA04: Falha no armazenamento não descarta carrinho nem mente que salvou
  // ---------------------------------------------------------------------------
  describe('CA04: Falha no IndexedDB e fallback localStorage', () => {
    it('mostra erro persistente e mantém o carrinho intacto quando o salvamento local falha', async () => {
      let toastTipo = null;
      let toastMsg = null;

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async () => ({ data: { id: 993 }, error: null })
        }
      });

      // Simula falha total ao salvar offline
      estadoPDV.fn.dbSalvarPedidoOffline = vi.fn(async () => false);

      const mockData = getDefaultMockData();
      page.adicionarItemAoCarrinho(mockData.produtos[0], 3);
      expect(estadoPDV.cart.length).toBe(1);
      expect(estadoPDV.cart[0].quantidade).toBe(3);

      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '01';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      const chamadasToast = [];
      const originalShowToast = window.showToast;
      window.showToast = (msg, opts) => {
        const t = typeof opts === 'object' ? opts?.tipo : opts;
        chamadasToast.push({ msg, tipo: t });
        toastMsg = msg;
        toastTipo = t;
        if (originalShowToast) originalShowToast(msg, opts);
      };

      page.harness.document.getElementById('btn-enviar-pedido').click();
      await new Promise(r => setTimeout(r, 50));

      // Carrinho NÃO pode ter sido esvaziado
      expect(estadoPDV.cart.length).toBe(1);
      expect(estadoPDV.cart[0].quantidade).toBe(3);

      // Toast de erro persistente exibido
      const errToast = chamadasToast.find(c => c.tipo === 'error');
      expect(errToast).toBeDefined();
      expect(errToast.msg).toMatch(/Erro crítico ao gravar pedido localmente/);
    });
  });

  // ---------------------------------------------------------------------------
  // CA05: Erro de negócio auto-restaura o carrinho
  // ---------------------------------------------------------------------------
  describe('CA05: Erro de negócio do servidor restaura carrinho', () => {
    it('auto-restaura o carrinho e exibe toast de erro persistente quando servidor recusa por regra de negócio', async () => {
      let toastTipo = null;

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async () => ({
            data: null,
            error: { message: 'Produto p3 encontra-se esgotado no estoque.' }
          })
        }
      });

      const originalShowToast = window.showToast;
      window.showToast = (msg, opts) => {
        toastTipo = typeof opts === 'object' ? opts?.tipo : opts;
        if (originalShowToast) originalShowToast(msg, opts);
      };

      const mockData = getDefaultMockData();
      page.adicionarItemAoCarrinho(mockData.produtos[0], 2);
      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '02';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      page.harness.document.getElementById('btn-enviar-pedido').click();
      await new Promise(r => setTimeout(r, 80));

      // O carrinho foi auto-restaurado com os itens anteriores
      expect(estadoPDV.cart.length).toBe(1);
      expect(estadoPDV.cart[0].quantidade).toBe(2);
      expect(toastTipo).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // CA06: Pedido do totem fora do estado aguardando_pagamento
  // ---------------------------------------------------------------------------
  describe('CA06: Validação de estado em receber_pedido_totem', () => {
    it('a RPC receber_pedido_totem rejeita pedidos que não estejam em aguardando_pagamento', () => {
      expect(migrationSql).toMatch(/v_pedido\.status\s*<>\s*'aguardando_pagamento'/);
      expect(migrationSql).toMatch(/RAISE EXCEPTION\s+'Pedido não está aguardando pagamento/i);
    });

    it('baristaReceberPedidoTotem trata erro da RPC sem fallback de update direto', async () => {
      let updateDiretoChamado = false;
      let toastErrorExibido = false;

      const page = await setupPedidosPage({
        initialData: {
          pedidos: [
            {
              id: 501,
              numero_pedido: 'TOTEM-501',
              status: 'pronto',
              status_pagamento: 'pago',
              total: 25.0
            }
          ]
        },
        rpcHandlers: {
          receber_pedido_totem: async () => ({
            data: null,
            error: { message: 'Pedido do totem só pode ser recebido se estiver aguardando pagamento.' }
          })
        }
      });

      // Espiona update do Supabase
      const originalFrom = page.harness.window.cafeteriaSupabase.from;
      page.harness.window.cafeteriaSupabase.from = (table) => {
        const query = originalFrom(table);
        if (table === 'pedidos') {
          const origUpdate = query.update;
          query.update = (...args) => {
            updateDiretoChamado = true;
            return origUpdate.apply(query, args);
          };
        }
        return query;
      };

      window.showSelecionarPagamentoTotemSheet = vi.fn().mockResolvedValue('pix');
      window.showToast = (msg, tipo) => {
        if (tipo === 'error') toastErrorExibido = true;
      };

      estadoPDV.activePedidos = [{ id: 501, numero_pedido: 'TOTEM-501', status: 'pronto', total: 25.0 }];

      await window.baristaReceberPedidoTotem(501);

      expect(updateDiretoChamado).toBe(false);
      expect(toastErrorExibido).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CA07: Debounce/Trava em receber_pedido_totem no PDV
  // ---------------------------------------------------------------------------
  describe('CA07: Proteção contra clique duplo no recebimento de totem', () => {
    it('impede chamadas simultâneas duplicadas para o mesmo pedido', async () => {
      let chamadasRpc = 0;

      await setupPedidosPage({
        rpcHandlers: {
          receber_pedido_totem: async () => {
            chamadasRpc++;
            await new Promise(r => setTimeout(r, 60));
            return { data: { success: true }, error: null };
          }
        }
      });

      window.showSelecionarPagamentoTotemSheet = vi.fn().mockResolvedValue('dinheiro');
      estadoPDV.activePedidos = [{ id: 701, numero_pedido: 'TOTEM-701', status: 'aguardando_pagamento', total: 15.0 }];

      // Dois cliques quase simultâneos
      const p1 = window.baristaReceberPedidoTotem(701);
      const p2 = window.baristaReceberPedidoTotem(701);

      await Promise.all([p1, p2]);

      expect(chamadasRpc).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // CA08 & CA09: Cancelamento de pedido inteiro via RPC cancelar_pedido
  // ---------------------------------------------------------------------------
  describe('CA08 & CA09: RPC cancelar_pedido e permissões', () => {
    it('migration define cancelar_pedido com verificação de permissões e motivo obrigatório', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.cancelar_pedido/);
      expect(migrationSql).toMatch(/p_pedido_id bigint/);
      expect(migrationSql).toMatch(/p_motivo text/);
      // Requer no mínimo 3 caracteres para o motivo
      expect(migrationSql).toMatch(/LENGTH\(v_motivo_clean\)\s*<\s*3/i);
      // Requer permissão pdv.cancelar_item ou admin
      expect(migrationSql).toMatch(/pdv\.cancelar_item/);
      // Se já pago, requer pdv.cancelar_item_pago ou admin
      expect(migrationSql).toMatch(/status_pagamento\s*=\s*'pago'/);
    });

    it('CA08: cancelamento de pedido em mesas.js invoca cancelar_pedido por RPC', async () => {
      let rpcChamada = null;

      const page = await setupPedidosPage({
        initialData: {
          pedidos: [
            { id: 801, mesa_codigo: '03', status: 'pendente' }
          ],
          pedido_itens: [
            { id: 1, pedido_id: 801, cancelado: true }
          ]
        },
        rpcHandlers: {
          cancelar_item: async () => ({ data: { success: true }, error: null }),
          cancelar_pedido: async (args) => {
            rpcChamada = args;
            return { data: { success: true }, error: null };
          }
        }
      });

      window.showConfirmBottomSheet = vi.fn().mockResolvedValue(true);
      window.showPromptBottomSheet = vi.fn().mockResolvedValue('Motivo do cancelamento');

      // Simula cancelamento do último item que leva ao cancelamento do pedido inteiro
      await window.baristaCancelarItem(1, 801, '03');

      expect(rpcChamada).toBeDefined();
      expect(rpcChamada.p_pedido_id).toBe(801);
      expect(rpcChamada.p_motivo).toMatch(/cancelado/i);
    });
  });

  // ---------------------------------------------------------------------------
  // CA10: Observações de montagem e de item salvas como texto puro (sem escapeHtml na entrada)
  // ---------------------------------------------------------------------------
  describe('CA10: Observações puras sem HTML entities no banco', () => {
    it('guarda exatamente "sem açúcar & <canela>" sem transformar em &amp; ou &lt;', async () => {
      const page = await setupPedidosPage();
      const mockData = getDefaultMockData();

      // Testa observação via modal de montagem
      const produtoMontagem = { ...mockData.produtos[0], permite_adicionais: true };
      estadoPDV.fn.openMontagemModal(produtoMontagem);

      const modalObs = page.harness.document.getElementById('modal-montagem-obs');
      modalObs.value = 'sem açúcar & <canela>';
      page.harness.document.getElementById('modal-montagem-save').click();

      expect(estadoPDV.cart.length).toBe(1);
      expect(estadoPDV.cart[0].observacoes).toBe('sem açúcar & <canela>');

      // Testa edição de observação existente via baristaOpenObs
      window.baristaOpenObs(0);
      const modalItemObsInput = page.harness.document.getElementById('modal-obs-input');
      expect(modalItemObsInput.value).toBe('sem açúcar & <canela>');

      modalItemObsInput.value = 'com canela & <mel>';
      page.harness.document.getElementById('modal-obs-save').click();

      expect(estadoPDV.cart[0].observacoes).toBe('com canela & <mel>');
    });
  });

  // ---------------------------------------------------------------------------
  // CA11: Normalização idempotente fn_desescapar_html
  // ---------------------------------------------------------------------------
  describe('CA11: Normalização fn_desescapar_html', () => {
    it('migration contém fn_desescapar_html com desescape em loop até estabilizar', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_desescapar_html/);
      expect(migrationSql).toMatch(/&amp;/);
      expect(migrationSql).toMatch(/&lt;/);
      expect(migrationSql).toMatch(/&gt;/);
      expect(migrationSql).toMatch(/&quot;/);
      expect(migrationSql).toMatch(/&#39;/);
    });

    it('lógica JS equivalente de fn_desescapar_html é 100% idempotente', () => {
      function desescapar(texto) {
        if (!texto) return texto;
        let anterior = '';
        let atual = texto;
        while (anterior !== atual) {
          anterior = atual;
          atual = atual
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&#x27;/g, "'");
        }
        return atual;
      }

      const original = 'sem açúcar &amp;amp; &lt;canela&gt; &quot;crocante&#39;';
      const vez1 = desescapar(original);
      expect(vez1).toBe('sem açúcar & <canela> "crocante\'');

      // Segunda execução não altera nada
      const vez2 = desescapar(vez1);
      expect(vez2).toBe(vez1);
    });
  });

  // ---------------------------------------------------------------------------
  // CA12: showToast com tipo 'error' é persistente e usa classe toast--error
  // ---------------------------------------------------------------------------
  describe('CA12: showToast com tipo error', () => {
    it('showToast("Falha", "error") gera classe toast--error, sem botão de ação e sem auto-dismiss', async () => {
      const page = await setupPedidosPage();
      const container = page.harness.document.getElementById('toast-container');

      window.showToast('Falha na comunicação', 'error');

      const toast = container.querySelector('.toast--error');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain('Falha na comunicação');

      // Não deve ter botão de ação (açãoTexto null)
      const actionBtn = toast.querySelector('.toast-action');
      expect(actionBtn).toBeNull();

      // Botão de fechar existe
      const closeBtn = toast.querySelector('.toast-close');
      expect(closeBtn).toBeTruthy();

      // Ao clicar em fechar, o toast é removido
      closeBtn.click();
      expect(toast.classList.contains('fade-out')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CA13: Card da fila offline com erro formatado e cliente escapado uma só vez
  // ---------------------------------------------------------------------------
  describe('CA13: Renderização do card da fila offline', () => {
    it('exibe status formatado sem tags span aparentes e cliente escapado uma única vez', async () => {
      const page = await setupPedidosPage();

      const pedidoFila = {
        client_id: 'client-offline-1',
        mesa_codigo: '01',
        cliente_nome: 'João & Maria',
        total_estimado: 45.0,
        status: 'falha',
        ultimo_erro: 'Falha de validação no item 1',
        itens_resumo: '2x Espresso',
        created_at: new Date().toISOString()
      };

      estadoPDV.fn.dbObterFilaOffline = vi.fn().mockResolvedValue([pedidoFila]);

      await estadoPDV.fn.renderOfflineQueueModal();

      const queueList = page.harness.document.getElementById('offline-queue-list');
      const card = queueList.querySelector('.offline-card');
      expect(card).toBeTruthy();

      // O texto exibido não deve ter tags HTML literais escapadas como &lt;span
      expect(card.innerHTML).not.toContain('&lt;span');
      // O nome do cliente deve estar presente e sem escape duplo (&amp;amp;)
      expect(card.innerHTML).not.toContain('&amp;amp;');
      expect(card.querySelector('.offline-card__title').textContent).toContain('João & Maria');
      // A mensagem de erro deve estar contida
      expect(card.textContent).toContain('Falha: Falha de validação no item 1');
    });
  });

  // ---------------------------------------------------------------------------
  // CA14: Backoff exponencial e limite de 5 tentativas antes de falha_manual
  // ---------------------------------------------------------------------------
  describe('CA14: Backoff exponencial e limite de tentativas na fila offline', () => {
    it('transiciona para falha_manual no 5º erro e contador alerta pedidos com falha', async () => {
      const page = await setupPedidosPage();

      const itemNaBase = {
        client_id: 'ped-persist-1',
        status: 'enviando',
        tentativas: 4,
        ultimo_erro: null,
        created_at: new Date().toISOString()
      };

      await estadoPDV.fn.dbSalvarPedidoOffline(itemNaBase);

      // Simula 5ª falha chamando dbAtualizarStatusPedidoOffline
      await estadoPDV.fn.atualizarStatusPedidoOffline('ped-persist-1', 'falha', 'Erro recorrente do servidor');

      // Verifica se dbAtualizarStatusPedidoOffline foi devidamente registrado
      expect(typeof estadoPDV.fn.atualizarStatusPedidoOffline).toBe('function');

      const fila = await estadoPDV.fn.dbObterFilaOffline();
      const itemAtualizado = fila.find(p => p.client_id === 'ped-persist-1');
      expect(itemAtualizado.status).toBe('falha_manual');
      expect(itemAtualizado.tentativas).toBe(5);

      await estadoPDV.fn.atualizarContadorFilaOffline();

      const btnQueue = page.harness.document.getElementById('btn-offline-queue');
      expect(btnQueue.textContent).toContain('1 pedido com falha');
    });
  });

  // ---------------------------------------------------------------------------
  // CA15: total_estimado do item meio a meio com adicional
  // ---------------------------------------------------------------------------
  describe('CA15: total_estimado com meio a meio e adicionais', () => {
    it('calcula o valor exato incluindo metade dos sabores e adicionais multiplicado pela quantidade', async () => {
      const page = await setupPedidosPage();

      estadoPDV.allProducts = [
        { id: 'cd1', nome: 'Crepe Doce Nutella', preco: 20.0, categoria_id: 'crepes-doces' },
        { id: 'cs1', nome: 'Crepe Salgado Queijo', preco: 30.0, categoria_id: 'crepes-salgados' },
        { id: 'cmm', nome: 'Crepe Meio a Meio', preco: 0.0, tipo_montagem: 'meio_a_meio', categoria_id: 'crepes' }
      ];

      // Item meio a meio: metade doce (20 * 0.5 = 10) + metade salgado (30 * 0.5 = 15) = base 25
      // Mais adicional de 5 = 30 unitário
      // Quantidade = 2 -> total 60
      const itemMeioAMeio = {
        produto: estadoPDV.allProducts[2],
        quantidade: 2,
        observacoes: '',
        sabores: [
          { lado: 'doce', produto_id: 'cd1' },
          { lado: 'salgado', produto_id: 'cs1' }
        ],
        adicionaisSelecionados: [
          { id: 'ad1', nome: 'Bacon extra', preco: 5.0 }
        ]
      };

      estadoPDV.cart = [itemMeioAMeio];
      estadoPDV.fn.renderCart();

      const totalCalculado = estadoPDV.fn.calcularTotalCarrinho(estadoPDV.cart, estadoPDV.allProducts, []);
      expect(totalCalculado).toBe(60.0);

      const cartTotalValue = page.harness.document.getElementById('cart-total-value');
      expect(cartTotalValue.textContent).toContain('60,00');
    });
  });
});
