import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROD_PROJECT_REF,
  validarAmbienteSeguroE2E,
  getOrderedE2EMigrationEntries,
  createE2EDatabase
} from '../scripts/e2e-db.mjs';
import { transformHtmlForE2E } from '../scripts/e2e-server.mjs';
import { carregarManifesto } from '../scripts/db-migrate.mjs';
import playwrightConfig from '../playwright.config.js';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { setupPedidosPage, setupAuthMock } from './helpers/pedidos-page.js';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';
const COZINHA_ID = '00000000-0000-0000-0000-000000000003';

const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const COZINHA_CLAIMS = { sub: COZINHA_ID, role: 'authenticated', email: 'cozinha@e2e.local' };
const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const ANON_CLAIMS = { sub: '', role: 'anon' };

async function callRpc(db, claims, fnName, argValues = []) {
  const placeholders = argValues.map((_, idx) => `$${idx + 1}`).join(', ');
  const { rows } = await db.withJwtClaims(claims, (tx) =>
    tx.query(`SELECT public.${fnName}(${placeholders}) AS res`, argValues)
  );
  return rows[0]?.res;
}

describe('CAF-000120: Testes E2E em Navegador Real, PGlite Isolado e Correções de Integração', () => {
  let e2eDb;
  const origSetInterval = globalThis.setInterval;
  const trackedTimers = [];
  const origSearch = typeof window !== 'undefined' ? window.location.search : '';

  function trackIntervals() {
    globalThis.setInterval = (...args) => {
      const id = origSetInterval(...args);
      trackedTimers.push(id);
      return id;
    };
  }

  beforeAll(async () => {
    e2eDb = await createE2EDatabase({ env: {} });
  }, 60000);

  afterAll(async () => {
    if (e2eDb) {
      await e2eDb.close();
    }
  });

  afterEach(async () => {
    while (trackedTimers.length > 0) {
      clearInterval(trackedTimers.pop());
    }
    globalThis.setInterval = origSetInterval;
    if (typeof window !== 'undefined') {
      delete window.__CAFETERIA_E2E_CONFIG__;
      delete window.baristaAbrirModalFecharConta;
      delete window.showConfirmBottomSheet;
      delete window.showPromptBottomSheet;
      if (window.location.search !== origSearch && window.history?.replaceState) {
        window.history.replaceState({}, '', `${window.location.pathname}${origSearch}`);
      }
    }
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('CA01: Banco isolado PGlite, manifesto canônico, bloqueio de produção e override de cliente', () => {
    it('validarAmbienteSeguroE2E permite ambiente local e bloqueia qualquer variável apontando para produção', () => {
      expect(validarAmbienteSeguroE2E({})).toBe(true);
      expect(
        validarAmbienteSeguroE2E({
          DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
        })
      ).toBe(true);

      const envKeys = ['TEST_DATABASE_URL', 'DATABASE_URL', 'SUPABASE_DB_URL', 'E2E_DATABASE_URL'];
      for (const key of envKeys) {
        expect(() =>
          validarAmbienteSeguroE2E({
            [key]: `postgresql://postgres:secret@db.${PROD_PROJECT_REF}.supabase.co:5432/postgres`
          })
        ).toThrow(PROD_PROJECT_REF);
      }
    });

    it('getOrderedE2EMigrationEntries preserva ordem canônica com pré-requisitos antes das demais migrations', () => {
      const manifest = carregarManifesto();
      const ordered = getOrderedE2EMigrationEntries(manifest);
      const manifestItems = ordered.filter((m) => m.isManifest);

      expect(manifestItems).toHaveLength(manifest.migrations.length);
      expect(ordered[0].arquivo).toBe('pedidos_schema.sql');
      expect(ordered[1].arquivo).toBe('migration_CAF-000001.sql');
      expect(ordered[2].arquivo).toBe('migration_fase2.sql');
      expect(ordered[3].arquivo).toBe('migration_fase3_final.sql');
      expect(ordered[ordered.length - 1].arquivo).toBe(
        manifest.migrations[manifest.migrations.length - 1].arquivo
      );
    });

    it('createE2EDatabase aplica migrations do manifesto, seed sintético mínimo e restaura estado limpo via reset()', async () => {
      const manifest = carregarManifesto();
      const appliedCount = await e2eDb.getAppliedMigrationsCount();
      expect(appliedCount).toBeGreaterThanOrEqual(manifest.migrations.length);
      expect(e2eDb.migrationStats.manifestTotal).toBe(manifest.migrations.length);
      expect(e2eDb.getAppliedMigrationFiles()).toHaveLength(manifest.migrations.length);

      const { rows: [counts] } = await e2eDb.query(`
        SELECT
          (SELECT COUNT(*)::int FROM public.categorias) AS categorias,
          (SELECT COUNT(*)::int FROM public.produtos) AS produtos,
          (SELECT COUNT(*)::int FROM public.mesas) AS mesas,
          (SELECT COUNT(*)::int FROM auth.users) AS users,
          (SELECT COUNT(*)::int FROM public.perfis) AS perfis,
          (SELECT COUNT(*)::int FROM public.pedidos) AS pedidos,
          (SELECT COUNT(*)::int FROM public.clientes) AS clientes
      `);
      expect(counts.categorias).toBe(3);
      expect(counts.produtos).toBeGreaterThanOrEqual(5);
      expect(counts.mesas).toBeGreaterThanOrEqual(5);
      expect(counts.users).toBe(3);
      expect(counts.perfis).toBe(3);
      expect(counts.pedidos).toBe(0);
      expect(counts.clientes).toBe(0);

      // Muta dados e valida restauração por snapshot em reset()
      await e2eDb.query("DELETE FROM public.mesas WHERE codigo = 'M-04'");
      const { rows: afterDelete } = await e2eDb.query("SELECT * FROM public.mesas WHERE codigo = 'M-04'");
      expect(afterDelete).toHaveLength(0);

      await e2eDb.reset();
      const { rows: afterReset } = await e2eDb.query("SELECT codigo, qr_token FROM public.mesas WHERE codigo = 'M-04'");
      expect(afterReset).toHaveLength(1);
      expect(afterReset[0].qr_token).toBe('tok-e2e-m04');
    });

    it('transformHtmlForE2E substitui SDK CDN pelo shim E2E local e remove scripts/links externos de produção', () => {
      const htmlOrig = fs.readFileSync(path.resolve(process.cwd(), 'cardapio.html'), 'utf8');
      const transformed = transformHtmlForE2E(htmlOrig);

      expect(transformed).toContain('<script src="/e2e/supabase-shim.js"></script>');
      expect(transformed).not.toContain('cdn.jsdelivr.net/npm/@supabase/supabase-js');
      expect(transformed).not.toMatch(/<script[^>]*www\.googletagmanager\.com/i);
      expect(transformed).not.toMatch(/<link[^>]*href=["']https:\/\/fonts\.googleapis\.com/i);
      expect(transformed).not.toMatch(/<link[^>]*href=["']https:\/\/fonts\.gstatic\.com/i);
      expect(transformed).not.toMatch(/<link[^>]*href=["']https:\/\/nyretgvzbnbtiyeioeju\.supabase\.co/i);
    });

    it('js/supabase-client.js respeita override window.__CAFETERIA_E2E_CONFIG__ no carregamento real', async () => {
      const harness = createPageHarness('pedidos.html');
      try {
        const fakeClient = { from: vi.fn(), rpc: vi.fn() };
        const createClientSpy = vi.fn(() => fakeClient);
        harness.window.__CAFETERIA_E2E_CONFIG__ = {
          url: 'http://127.0.0.1:4173',
          anonKey: 'e2e-anon-key-local',
          createClient: createClientSpy
        };
        harness.window.cafeteriaSupabase = null;
        harness.window.supabaseClient = null;
        harness.window.supabase = { createClient: createClientSpy };

        await harness.carregarScript('js/supabase-client.js');

        expect(createClientSpy).toHaveBeenCalledTimes(1);
        expect(createClientSpy).toHaveBeenCalledWith('http://127.0.0.1:4173', 'e2e-anon-key-local');
        expect(harness.window.cafeteriaSupabase).toBe(fakeClient);
      } finally {
        harness.cleanup();
      }
    });
  });

  describe('CA02 & CA03: Fluxo PDV → KDS (bar × cozinha) e trigger Realtime no PostgreSQL real', () => {
    it('cria pedido com múltiplas estações, garante idempotência e conclui bar + cozinha até concluido', async () => {
      await e2eDb.reset();

      const clientId = '11111111-1111-4111-8111-111111111111';
      const payload = {
        client_id: clientId,
        mesa_codigo: 'M-01',
        cliente_nome: 'Mesa M-01',
        observacoes: 'Sem açúcar',
        para_viagem: false,
        status_pagamento: 'pendente',
        forma_pagamento: null,
        total: 22.00,
        itens: [
          {
            produto_id: 'prod-espresso',
            nome_produto: 'Café Espresso',
            quantidade: 1,
            preco_unitario: 10.00,
            observacoes: null,
            adicionais: []
          },
          {
            produto_id: 'prod-pao-queijo',
            nome_produto: 'Pão de Queijo Artesanal',
            quantidade: 1,
            preco_unitario: 12.00,
            observacoes: null,
            adicionais: []
          }
        ]
      };

      const pedRes = await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [JSON.stringify(payload)]);
      expect(pedRes.id).toBeGreaterThan(0);
      expect(Number(pedRes.total)).toBe(22);

      // Reenvio com mesmo client_id deve ser idempotente (não duplica)
      const pedIdemp = await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [JSON.stringify(payload)]);
      expect(pedIdemp.idempotent).toBe(true);
      expect(pedIdemp.id).toBe(pedRes.id);

      const { rows: itens } = await e2eDb.query(
        'SELECT estacao FROM public.pedido_itens WHERE pedido_id = $1 ORDER BY id',
        [pedRes.id]
      );
      expect(itens.map((i) => i.estacao).sort()).toEqual(['bar', 'cozinha']);

      // Estação bar inicia e conclui; pedido permanece em_preparo até a cozinha concluir
      await callRpc(e2eDb, COZINHA_CLAIMS, 'iniciar_estacao', [pedRes.id, 'bar']);
      const barDone = await callRpc(e2eDb, COZINHA_CLAIMS, 'concluir_estacao', [pedRes.id, 'bar']);
      expect(barDone.status).toBe('em_preparo');

      await callRpc(e2eDb, COZINHA_CLAIMS, 'iniciar_estacao', [pedRes.id, 'cozinha']);
      const cozDone = await callRpc(e2eDb, COZINHA_CLAIMS, 'concluir_estacao', [pedRes.id, 'cozinha']);
      expect(cozDone.status).toBe('concluido');

      const { rows: [pedDb] } = await e2eDb.query(
        'SELECT status FROM public.pedidos WHERE id = $1',
        [pedRes.id]
      );
      expect(pedDb.status).toBe('concluido');

      // Publicação supabase_realtime deve incluir pedidos e pedido_itens no PostgreSQL
      const { rows: pubTables } = await e2eDb.query(
        "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('pedidos', 'pedido_itens')"
      );
      expect(pubTables.map((r) => r.tablename).sort()).toEqual(['pedido_itens', 'pedidos']);
    }, 30000);
  });

  describe('CA04 & CA05: Fechamento completo, parcial (CAF-000112) e correções reais de js/pedidos.js', () => {
    it('executa fechamento completo em dois meios e pagamento parcial sem dupla cobrança nem subpagamento', async () => {
      await e2eDb.reset();

      // 1. Fechamento completo da mesa M-01 com PIX (10) + Dinheiro (12)
      const pedFull = await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [
        JSON.stringify({
          client_id: '22222222-2222-4222-8222-222222222222',
          mesa_codigo: 'M-01',
          status_pagamento: 'pendente',
          forma_pagamento: null,
          total: 22.00,
          itens: [
            { produto_id: 'prod-espresso', nome_produto: 'Café Espresso', quantidade: 1, preco_unitario: 10.00 },
            { produto_id: 'prod-pao-queijo', nome_produto: 'Pão de Queijo Artesanal', quantidade: 1, preco_unitario: 12.00 }
          ]
        })
      ]);

      const fechaRes = await callRpc(e2eDb, BARISTA_CLAIMS, 'fechar_conta_mesa', [
        'M-01',
        JSON.stringify([
          { forma: 'pix', valor: 10 },
          { forma: 'dinheiro', valor: 12 }
        ]),
        0,
        0,
        null,
        '33333333-3333-4333-8333-333333333333',
        null,
        null
      ]);
      expect(Number(fechaRes.total)).toBe(22);

      const { rows: pagsFull } = await e2eDb.query(
        'SELECT forma, valor::numeric::float8 AS valor FROM public.fechamento_pagamentos WHERE fechamento_id = $1 ORDER BY forma',
        [fechaRes.fechamento_id]
      );
      expect(pagsFull).toEqual([
        { forma: 'dinheiro', valor: 12 },
        { forma: 'pix', valor: 10 }
      ]);

      // 2. Pagamento parcial por item na M-02 (2x Espresso = 20 + 1x Pão de Queijo = 12; total 32)
      const pedParcial = await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [
        JSON.stringify({
          client_id: '44444444-4444-4444-8444-444444444444',
          mesa_codigo: 'M-02',
          status_pagamento: 'pendente',
          forma_pagamento: null,
          total: 32.00,
          itens: [
            { produto_id: 'prod-espresso', nome_produto: 'Café Espresso', quantidade: 2, preco_unitario: 10.00 },
            { produto_id: 'prod-pao-queijo', nome_produto: 'Pão de Queijo Artesanal', quantidade: 1, preco_unitario: 12.00 }
          ]
        })
      ]);
      const { rows: itensM02 } = await e2eDb.query(
        "SELECT id FROM public.pedido_itens WHERE pedido_id = $1 AND produto_id = 'prod-espresso'",
        [pedParcial.id]
      );

      const parcialRes = await callRpc(e2eDb, BARISTA_CLAIMS, 'registrar_pagamento_parcial_mesa', [
        'M-02',
        JSON.stringify([{ forma: 'pix', valor: 10 }]),
        JSON.stringify([{ pedido_item_id: itensM02[0].id, quantidade: 1 }]),
        0,
        0,
        '55555555-5555-4555-8555-555555555555'
      ]);
      expect(Number(parcialRes.total_pago)).toBe(10);
      expect(Number(parcialRes.saldo_restante)).toBe(22);

      // Caso negativo: pagamento insuficiente no saldo restante (R$ 10 vs R$ 22) deve ser rejeitado
      await expect(
        callRpc(e2eDb, BARISTA_CLAIMS, 'fechar_conta_mesa', [
          'M-02',
          JSON.stringify([{ forma: 'dinheiro', valor: 10 }]),
          0,
          0,
          null,
          '66666666-6666-4666-8666-666666666666',
          null,
          null
        ])
      ).rejects.toThrow();

      // Quitar saldo restante exato (R$ 22) sem dupla cobrança
      const quitacao = await callRpc(e2eDb, BARISTA_CLAIMS, 'fechar_conta_mesa', [
        'M-02',
        JSON.stringify([{ forma: 'dinheiro', valor: 22 }]),
        0,
        0,
        null,
        '77777777-7777-4777-8777-777777777777',
        null,
        null
      ]);
      expect(Number(quitacao.total)).toBe(22);

      const { rows: [somaM02] } = await e2eDb.query(
        `SELECT SUM(fp.valor)::numeric::float8 AS total_pago
         FROM public.fechamento_pagamentos fp
         JOIN public.fechamento_pedidos fped ON fped.fechamento_id = fp.fechamento_id
         WHERE fped.pedido_id = $1`,
        [pedParcial.id]
      );
      expect(somaM02.total_pago).toBe(32);
      expect(pedFull.id).not.toBe(pedParcial.id);
    }, 30000);

    it('js/pedidos.js calcula saldo de mesas pós-pagamento parcial, reseta _idempotencyKey entre fechamentos e aplica zIndex 10020 nos modais de confirmação/prompt', async () => {
      trackIntervals();
      const page = await setupPedidosPage({
        initialData: {
          mesas: [
            { id: 'm1', codigo: 'M-01', status: 'livre', ativo: true },
            { id: 'm2', codigo: 'M-02', status: 'livre', ativo: true }
          ],
          pedidos: [
            {
              id: 201,
              numero_pedido: 'PED-201',
              mesa_codigo: 'M-01',
              status: 'pendente',
              status_pagamento: 'pago',
              total: 20.00,
              created_at: new Date().toISOString(),
              pedido_itens: [
                { id: 1, produto_id: 'p1', nome_produto: 'Espresso', preco_unitario: 10.00, quantidade: 2, quantidade_paga: 2, cancelado: false }
              ]
            },
            {
              id: 202,
              numero_pedido: 'PED-202',
              mesa_codigo: 'M-02',
              status: 'pendente',
              status_pagamento: 'parcial',
              total: 30.00,
              created_at: new Date().toISOString(),
              pedido_itens: [
                { id: 2, produto_id: 'p1', nome_produto: 'Espresso', preco_unitario: 10.00, quantidade: 3, quantidade_paga: 1, cancelado: false }
              ]
            }
          ]
        },
        rpcHandlers: {
          obter_resumo_conta_mesa: () => ({
            data: {
              mesa_codigo: 'M-02',
              subtotal_geral: 30,
              ja_pago: 10,
              saldo_restante: 20,
              itens: [
                { pedido_item_id: 2, nome_produto: 'Espresso', quantidade: 3, quantidade_paga: 1, quantidade_restante: 2, preco_unitario: 10 }
              ],
              pagamentos_parciais: [{ forma: 'pix', valor: 10 }]
            },
            error: null
          })
        }
      });

      try {
        await page.harness.aguardarRender(60);
        document.getElementById('nav-btn-mesas').click();
        await page.harness.aguardarRender(40);

        const cardM01 = Array.from(document.querySelectorAll('#mesas-grid .mesa-card')).find((el) =>
          el.textContent.includes('M-01')
        );
        const cardM02 = Array.from(document.querySelectorAll('#mesas-grid .mesa-card')).find((el) =>
          el.textContent.includes('M-02')
        );

        // M-01 totalmente quitado volta a ficar livre; M-02 exibe saldo restante R$ 20,00
        expect(cardM01.classList.contains('livre')).toBe(true);
        expect(cardM02.classList.contains('ocupada')).toBe(true);
        expect(cardM02.textContent).toContain('20,00');

        // Abertura 1: fechamento completo/parcial gera primeira idempotency key
        page.limparChamadasRpc();
        await page.abrirModalFechamentoMesa('M-02', [
          {
            id: 202,
            mesa_codigo: 'M-02',
            total: 30,
            status_pagamento: 'parcial',
            pedido_itens: [
              { id: 2, nome_produto: 'Espresso', preco_unitario: 10, quantidade: 3, quantidade_paga: 1, cancelado: false }
            ]
          }
        ]);
        await page.harness.aguardarRender(40);
        page.avancarEtapaFechamento(2);
        page.configurarTaxaServico(false);
        page.avancarEtapaFechamento(3);
        page.adicionarPagamentoFechamento('dinheiro', 20);
        await page.confirmarFechamento();

        // Abertura 2: nova abertura do modal não reutiliza a idempotency key anterior
        await page.abrirModalFechamentoMesa('M-02', [
          {
            id: 202,
            mesa_codigo: 'M-02',
            total: 30,
            status_pagamento: 'parcial',
            pedido_itens: [
              { id: 2, nome_produto: 'Espresso', preco_unitario: 10, quantidade: 3, quantidade_paga: 1, cancelado: false }
            ]
          }
        ]);
        await page.harness.aguardarRender(40);
        page.avancarEtapaFechamento(2);
        page.configurarTaxaServico(false);
        page.avancarEtapaFechamento(3);
        page.adicionarPagamentoFechamento('pix', 20);
        await page.confirmarFechamento();

        const chamadasFechar = page.obterChamadasRpc('fechar_conta_mesa');
        expect(chamadasFechar.length).toBeGreaterThanOrEqual(2);
        expect(chamadasFechar[0].args.p_idempotency_key).toBeTruthy();
        expect(chamadasFechar[1].args.p_idempotency_key).toBeTruthy();
        expect(chamadasFechar[0].args.p_idempotency_key).not.toBe(
          chamadasFechar[1].args.p_idempotency_key
        );

        // Modais prompt/confirm devem ter z-index 10020 acima de #modal-pedidos-cliente-triagem (9999)
        const triagemOverlay = document.getElementById('modal-pedidos-cliente-triagem');
        expect(Number.parseInt(triagemOverlay.style.zIndex, 10)).toBe(9999);

        const promptPromise = window.showPromptBottomSheet({ titulo: 'Recusar', mensagem: 'Motivo' });
        const promptModal = document.getElementById('modal-prompt-sheet');
        expect(Number.parseInt(promptModal.style.zIndex, 10)).toBe(10020);
        document.getElementById('modal-prompt-input').value = 'Teste z-index';
        document.getElementById('modal-prompt-ok').click();
        expect(await promptPromise).toBe('Teste z-index');
      } finally {
        page.harness.cleanup();
      }
    }, 20000);
  });

  describe('CA06: Fechamento de caixa cego (p_contagem), get_totais_caixa e correções em admin', () => {
    it('reconcilia caixa com get_totais_caixa e fechar_caixa(p_contagem), exigindo obs em divergência', async () => {
      await e2eDb.reset();

      const { rows: [caixaAberto] } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.caixas (aberto_por, fundo_troco)
           VALUES ($1, 100.00)
           RETURNING id`,
          [ADMIN_ID]
        )
      );

      // Venda em dinheiro no balcão (R$ 12,00) + mesa PIX (R$ 10,00)
      await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [
        JSON.stringify({
          client_id: '88888888-8888-4888-8888-888888888888',
          mesa_codigo: 'BALCAO',
          status_pagamento: 'pago',
          forma_pagamento: 'dinheiro',
          total: 12.00,
          itens: [
            { produto_id: 'prod-pao-queijo', nome_produto: 'Pão de Queijo Artesanal', quantidade: 1, preco_unitario: 12.00 }
          ]
        })
      ]);
      await callRpc(e2eDb, BARISTA_CLAIMS, 'criar_pedido', [
        JSON.stringify({
          client_id: '99999999-9999-4999-8999-999999999999',
          mesa_codigo: 'M-01',
          status_pagamento: 'pendente',
          forma_pagamento: null,
          total: 10.00,
          itens: [
            { produto_id: 'prod-espresso', nome_produto: 'Café Espresso', quantidade: 1, preco_unitario: 10.00 }
          ]
        })
      ]);
      await callRpc(e2eDb, BARISTA_CLAIMS, 'fechar_conta_mesa', [
        'M-01',
        JSON.stringify([{ forma: 'pix', valor: 10 }]),
        0,
        0,
        null,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        null,
        null
      ]);

      const totais = await callRpc(e2eDb, ADMIN_CLAIMS, 'get_totais_caixa', [caixaAberto.id]);
      expect(Number(totais.dinheiro_esperado)).toBe(112);

      // Caso negativo: divergência grande sem observações é bloqueada pelo banco
      await expect(
        callRpc(e2eDb, ADMIN_CLAIMS, 'fechar_caixa', [
          caixaAberto.id,
          JSON.stringify([
            { forma: 'dinheiro', valor_informado: 50 },
            { forma: 'pix', valor_informado: 10 }
          ]),
          null
        ])
      ).rejects.toThrow(/observa/i);

      // Fechamento correto com p_contagem reconciliada (Dinheiro 112, PIX 10)
      const fechamento = await callRpc(e2eDb, ADMIN_CLAIMS, 'fechar_caixa', [
        caixaAberto.id,
        JSON.stringify([
          { forma: 'dinheiro', valor_informado: 112 },
          { forma: 'pix', valor_informado: 10 }
        ]),
        null
      ]);
      expect(Number(fechamento.total_diferenca)).toBe(0);
      expect(fechamento.limite_excedido).toBe(false);

      const { rows: confs } = await e2eDb.query(
        `SELECT forma_pagamento, valor_sistema::numeric::float8 AS sistema, valor_informado::numeric::float8 AS informado, diferenca::numeric::float8 AS diferenca
         FROM public.caixa_conferencia WHERE caixa_id = $1`,
        [caixaAberto.id]
      );
      expect(confs.find((c) => c.forma_pagamento === 'dinheiro')).toMatchObject({
        sistema: 112,
        informado: 112,
        diferenca: 0
      });
      expect(confs.find((c) => c.forma_pagamento === 'pix')).toMatchObject({
        sistema: 10,
        informado: 10,
        diferenca: 0
      });
    }, 30000);

    it('js/admin/main.js interpreta get_minhas_permissoes() como objeto e caixa-admin.js envia p_contagem em fechar_caixa', async () => {
      trackIntervals();
      const caixaId = 'cx-e2e-001';
      let fecharArgsRecebidos = null;

      const mockSupabase = setupAuthMock(
        createSupabaseMock(
          {
            perfis: [{ id: 'admin-1', nome: 'Admin E2E', email: 'admin@e2e.local', role: 'admin', ativo: true }],
            caixas: [{ id: caixaId, aberto_em: new Date().toISOString(), fundo_troco: 100 }],
            pedidos: [],
            formas_pagamento_taxas: []
          },
          {
            rpcHandlers: {
              get_minhas_permissoes: () => ({
                data: { is_admin: true, permissoes: ['caixa.abrir_fechar'] },
                error: null
              }),
              get_caixa_atual: () => ({
                data: [{ id: caixaId, aberto_em: new Date().toISOString(), fundo_troco: 100 }],
                error: null
              }),
              get_totais_caixa: () => ({
                data: {
                  fundo_troco: 100,
                  sangrias: 0,
                  suprimentos: 0,
                  dinheiro_esperado: 112,
                  itens: [
                    { forma: 'dinheiro', label: 'Dinheiro', valor_esperado: 112 },
                    { forma: 'pix', label: 'PIX', valor_esperado: 10 }
                  ]
                },
                error: null
              }),
              get_historico_caixas: () => ({ data: [], error: null }),
              fechar_caixa: (args) => {
                fecharArgsRecebidos = args;
                return {
                  data: {
                    caixa_id: caixaId,
                    total_diferenca: 0,
                    limite_excedido: false,
                    conferencia: [
                      { forma: 'dinheiro', valor_sistema: 112, valor_informado: 112, diferenca: 0 },
                      { forma: 'pix', valor_sistema: 10, valor_informado: 10, diferenca: 0 }
                    ]
                  },
                  error: null
                };
              }
            }
          }
        ),
        { id: 'admin-1', email: 'admin@e2e.local' }
      );

      const harness = createPageHarness('admin.html', { supabase: mockSupabase });
      try {
        await harness.carregarScript('js/db.js');
        await harness.carregarScript('js/admin/main.js');
        await harness.carregarScript('js/admin/caixa-admin.js');

        harness.window.cafeteriaAdmin.session = {
          isLoggedIn: true,
          user: { id: 'admin-1', email: 'admin@e2e.local' },
          perfil: { id: 'admin-1', role: 'admin', nome: 'Admin E2E' },
          isAdmin: false
        };

        await harness.window.cafeteriaAdmin.carregarPermissoes();
        expect(harness.window.cafeteriaAdmin.podeAcessarPagina('caixa')).toBe(true);
        const navCaixa = harness.document.getElementById('nav-caixa');
        expect(navCaixa.style.display).not.toBe('none');

        await harness.window.initAdminCaixa();
        await harness.aguardarRender(40);

        harness.document.getElementById('btn-fechar-caixa').click();
        await harness.aguardarRender(50);

        const inpDinheiro = harness.document.querySelector('.form-contado[data-forma="dinheiro"]');
        const inpPix = harness.document.querySelector('.form-contado[data-forma="pix"]');
        expect(inpDinheiro).not.toBeNull();
        expect(inpPix).not.toBeNull();
        inpDinheiro.value = '112';
        inpPix.value = '10';

        harness.document.getElementById('btn-confirmar-fechar-caixa').click();
        await harness.aguardarRender(60);

        expect(fecharArgsRecebidos).toBeTruthy();
        expect(fecharArgsRecebidos.p_caixa_id).toBe(caixaId);
        expect(fecharArgsRecebidos.p_contagem).toEqual(
          expect.arrayContaining([
            { forma: 'dinheiro', valor_informado: 112 },
            { forma: 'pix', valor_informado: 10 }
          ])
        );
        expect(fecharArgsRecebidos).not.toHaveProperty('p_valores_informados');
        expect(harness.document.getElementById('fechar-caixa-resultado-banner').textContent).toContain(
          'Caixa bateu exatamente'
        );
      } finally {
        harness.cleanup();
      }
    }, 20000);
  });

  describe('CA07: Pedido QR do cliente (aprovação, recusa, anti-spam e leitura de ?t=/?token=)', () => {
    it('executa ciclo completo de criar_pedido_cliente, aprovar_pedido_cliente, anti-spam, recusar_pedido_cliente e token inválido', async () => {
      await e2eDb.reset();

      // Token inválido rejeitado
      await expect(
        callRpc(e2eDb, ANON_CLAIMS, 'criar_pedido_cliente', [
          'token-inexistente',
          JSON.stringify({ cliente_nome: 'Invalido', itens: [{ produto_id: 'prod-espresso', quantidade: 1 }] }),
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        ])
      ).rejects.toThrow();

      // 1. Primeiro pedido QR válido -> aguardando_aprovacao -> aprovado -> pendente
      const qr1 = await callRpc(e2eDb, ANON_CLAIMS, 'criar_pedido_cliente', [
        'tok-e2e-m03',
        JSON.stringify({
          cliente_nome: 'Cliente QR Aprovado',
          itens: [{ produto_id: 'prod-espresso', quantidade: 1 }]
        }),
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      ]);
      expect(qr1.status).toBe('aguardando_aprovacao');

      const aprovado = await callRpc(e2eDb, BARISTA_CLAIMS, 'aprovar_pedido_cliente', [qr1.pedido_id]);
      expect(aprovado.status).toBe('pendente');

      // Anti-spam imediato bloqueia pedido consecutivo dentro da janela
      await expect(
        callRpc(e2eDb, ANON_CLAIMS, 'criar_pedido_cliente', [
          'tok-e2e-m03',
          JSON.stringify({
            cliente_nome: 'Cliente QR Bloqueado',
            itens: [{ produto_id: 'prod-espresso', quantidade: 1 }]
          }),
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        ])
      ).rejects.toThrow(/aguarde/i);

      // Avança janela e cria segundo pedido para recusa pelo barista
      await e2eDb.query("UPDATE public.pedidos SET created_at = created_at - interval '4 hours' WHERE mesa_codigo = 'M-03'");
      const qr2 = await callRpc(e2eDb, ANON_CLAIMS, 'criar_pedido_cliente', [
        'tok-e2e-m03',
        JSON.stringify({
          cliente_nome: 'Cliente QR Recusado',
          itens: [{ produto_id: 'prod-espresso', quantidade: 1 }]
        }),
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      ]);
      const recusado = await callRpc(e2eDb, BARISTA_CLAIMS, 'recusar_pedido_cliente', [
        qr2.pedido_id,
        'Sem estoque no momento'
      ]);
      expect(recusado.status).toBe('cancelado');

      const { rows: [pedRecusado] } = await e2eDb.query(
        'SELECT status, motivo_cancelamento FROM public.pedidos WHERE id = $1',
        [qr2.pedido_id]
      );
      expect(pedRecusado.status).toBe('cancelado');
      expect(pedRecusado.motivo_cancelamento).toBe('Sem estoque no momento');
    }, 30000);

    it('js/cardapio-cliente-pedido.js reconhece parâmetro curto ?t= em URL de QR Code', async () => {
      trackIntervals();
      window.history.replaceState({}, '', '/cardapio.html?mesa=M-03&t=tok-e2e-m03');

      const mockSupabase = createSupabaseMock({
        mesas: [{ id: 'm3', codigo: 'M-03', qr_token: 'tok-e2e-m03', ativo: true, descricao: 'Mesa 03' }],
        configuracoes_sistema: [{ chave: 'pedido_cliente_ativo', valor: true }],
        produtos: [],
        adicionais: [],
        v_adicionais_produto: [],
        business_hours: []
      });

      const harness = createPageHarness('cardapio.html', { supabase: mockSupabase });
      const getByQrToken = vi.fn().mockResolvedValue({ id: 'm3', codigo: 'M-03', qr_token: 'tok-e2e-m03', ativo: true });
      harness.window.cafeteriaDB = {
        mesas: { getByQrToken },
        clientePedido: { consultarJanelasOnline: vi.fn().mockResolvedValue({ janelas: [] }) }
      };

      try {
        await harness.carregarScript('js/cardapio-cliente-pedido.js');
        harness.document.dispatchEvent(new Event('DOMContentLoaded'));
        await harness.aguardarRender(80);

        expect(getByQrToken).toHaveBeenCalledWith('tok-e2e-m03');
        expect(harness.document.body.textContent).toContain('M-03');
      } finally {
        harness.cleanup();
      }
    });
  });

  describe('CA08: Configuração Playwright e integração no workflow de CI', () => {
    it('playwright.config.js e package.json configuram Chromium, 1 worker, SW bloqueado e scripts E2E', () => {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
      expect(pkg.scripts['test:e2e']).toBe('playwright test');
      expect(pkg.scripts['lint:e2e']).toContain('eslint');

      expect(playwrightConfig.testDir).toBe('./e2e');
      expect(playwrightConfig.workers).toBe(1);
      expect(playwrightConfig.use.serviceWorkers).toBe('block');
      expect(playwrightConfig.use.baseURL).toBe('http://127.0.0.1:4173');
      expect(playwrightConfig.webServer.command).toBe('node scripts/e2e-server.mjs');
    });

    it('.github/workflows/deploy.yml executa lint:e2e, instala Chromium, roda test:e2e e publica artefato em falha', () => {
      const yml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
      const idxLint = yml.indexOf('npm run lint:e2e');
      const idxInstall = yml.indexOf('playwright install --with-deps chromium');
      const idxE2e = yml.indexOf('npm run test:e2e');
      const idxUpload = yml.indexOf('if: failure()');

      expect(idxLint).toBeGreaterThan(-1);
      expect(idxInstall).toBeGreaterThan(idxLint);
      expect(idxE2e).toBeGreaterThan(idxInstall);
      expect(idxUpload).toBeGreaterThan(idxE2e);
    });
  });
});
