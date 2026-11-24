import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import 'fake-indexeddb/auto';

import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { setupPedidosPage, getDefaultMockData } from './helpers/pedidos-page.js';
import { estadoPDV, resetarEstadoPDV } from '../js/pdv/estado.js';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';
const ANON_ID = '00000000-0000-0000-0000-000000000099';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const ANON_CLAIMS = { sub: ANON_ID, role: 'anon', email: 'anon@e2e.local' };

describe('CAF-000159: Correção da RPC criar_pedido (coluna p.estacao inexistente -> c.estacao)', () => {
  let db;
  let categoriaBarId;
  let categoriaCozinhaId;
  let produtoBarId;
  let produtoCozinhaId;
  let produtoSemCategoriaId;
  let produtoEsgotadoId;

  beforeAll(async () => {
    // Inicializa o banco PGlite com todas as migrations canônicas (incluindo 159)
    db = await createE2EDatabase();

    // Setup de usuários auth e perfis
    await db.exec(`
      INSERT INTO auth.users (id, aud, role, email) VALUES
        ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local'),
        ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      DO $$
      DECLARE
        v_admin_cargo_id UUID;
        v_barista_cargo_id UUID;
      BEGIN
        SELECT id INTO v_admin_cargo_id FROM public.cargos WHERE nome = 'Administrador' LIMIT 1;
        SELECT id INTO v_barista_cargo_id FROM public.cargos WHERE nome = 'Barista' LIMIT 1;

        INSERT INTO public.perfis (id, nome, role, ativo, cargo_id, pode_dar_desconto) VALUES
          ('${ADMIN_ID}', 'Admin Geral', 'admin', true, v_admin_cargo_id, true),
          ('${BARISTA_ID}', 'Barista Beto', 'barista', true, v_barista_cargo_id, false)
        ON CONFLICT (id) DO UPDATE SET
          role = EXCLUDED.role,
          ativo = EXCLUDED.ativo,
          cargo_id = EXCLUDED.cargo_id;
      END $$;
    `);

    // Criar categorias com diferentes estações
    const catBarRes = await db.query(`
      INSERT INTO public.categorias (id, nome, estacao, ativo, ordem)
      VALUES ('cat_bar', 'Bebidas e Coquetéis', 'bar', true, 10)
      RETURNING id
    `);
    categoriaBarId = catBarRes.rows[0].id;

    const catCozRes = await db.query(`
      INSERT INTO public.categorias (id, nome, estacao, ativo, ordem)
      VALUES ('cat_cozinha', 'Pratos Quentes', 'cozinha', true, 20)
      RETURNING id
    `);
    categoriaCozinhaId = catCozRes.rows[0].id;

    // Criar produtos para testes
    const prodBarRes = await db.query(`
      INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo, disponivel)
      VALUES ('prod_bar', 'Espresso Tônica Bar', 15.00, $1, true, true)
      RETURNING id
    `, [categoriaBarId]);
    produtoBarId = prodBarRes.rows[0].id;

    const prodCozRes = await db.query(`
      INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo, disponivel)
      VALUES ('prod_coz', 'Sanduíche Especial Cozinha', 25.00, $1, true, true)
      RETURNING id
    `, [categoriaCozinhaId]);
    produtoCozinhaId = prodCozRes.rows[0].id;

    const prodSemCatRes = await db.query(`
      INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo, disponivel)
      VALUES ('prod_sem_cat', 'Água Mineral Sem Categoria', 5.00, NULL, true, true)
      RETURNING id
    `);
    produtoSemCategoriaId = prodSemCatRes.rows[0].id;

    const prodEsgRes = await db.query(`
      INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo, disponivel)
      VALUES ('prod_esgotado', 'Croissant de Amêndoas Esgotado', 22.00, $1, true, false)
      RETURNING id
    `, [categoriaCozinhaId]);
    produtoEsgotadoId = prodEsgRes.rows[0].id;
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetarEstadoPDV();
  });

  // ---------------------------------------------------------------------------
  // Execução no Banco PostgreSQL real (PGlite WASM) com todas as migrações
  // ---------------------------------------------------------------------------
  describe('1. Execução Real no PostgreSQL (CA01, CA02, CA03, CA04)', () => {
    it('CA01: criar_pedido executa com sucesso sem erro 42703 (p.estacao não existe)', async () => {
      const clientId = '11111111-1111-4111-8111-111111111111';
      const payload = {
        client_id: clientId,
        mesa_codigo: 'BALCAO',
        forma_pagamento: 'dinheiro',
        status_pagamento: 'pago',
        itens: [
          {
            produto_id: produtoBarId,
            quantidade: 2,
            observacoes: 'Pouco gelo'
          }
        ]
      };

      const res = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        return await tx.query(`SELECT public.criar_pedido($1) AS resultado`, [JSON.stringify(payload)]);
      });

      expect(res.rows.length).toBe(1);
      const resultado = res.rows[0].resultado;
      expect(resultado).toBeDefined();
      expect(resultado.id).toBeGreaterThan(0);
      expect(resultado.total).toBe(30.00); // 2 * 15.00
      expect(resultado.idempotent).toBe(false);
    });

    it('CA02: itens com categorias estacao="bar" e estacao="cozinha" recebem estacao correta em pedido_itens', async () => {
      const clientId = '22222222-2222-4222-8222-222222222222';
      const payload = {
        client_id: clientId,
        mesa_codigo: 'BALCAO',
        forma_pagamento: 'pix',
        status_pagamento: 'pago',
        itens: [
          { produto_id: produtoBarId, quantidade: 1, observacoes: 'Estação Bar' },
          { produto_id: produtoCozinhaId, quantidade: 1, observacoes: 'Estação Cozinha' }
        ]
      };

      const res = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        return await tx.query(`SELECT public.criar_pedido($1) AS resultado`, [JSON.stringify(payload)]);
      });

      const pedidoId = res.rows[0].resultado.id;
      const itensRes = await db.query(
        `SELECT produto_id, nome_produto, estacao, quantidade, preco_unitario 
         FROM public.pedido_itens 
         WHERE pedido_id = $1 
         ORDER BY id ASC`,
        [pedidoId]
      );

      expect(itensRes.rows.length).toBe(2);
      expect(itensRes.rows[0].produto_id).toBe(produtoBarId);
      expect(itensRes.rows[0].estacao).toBe('bar');

      expect(itensRes.rows[1].produto_id).toBe(produtoCozinhaId);
      expect(itensRes.rows[1].estacao).toBe('cozinha');
    });

    it('CA03: fallback para "cozinha" quando o produto não possui categoria (categoria_id IS NULL)', async () => {
      const clientId = '33333333-3333-4333-8333-333333333333';
      const payload = {
        client_id: clientId,
        mesa_codigo: 'BALCAO',
        forma_pagamento: 'cartao_credito',
        itens: [
          { produto_id: produtoSemCategoriaId, quantidade: 1 }
        ]
      };

      const res = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        return await tx.query(`SELECT public.criar_pedido($1) AS resultado`, [JSON.stringify(payload)]);
      });

      const pedidoId = res.rows[0].resultado.id;
      const itensRes = await db.query(
        `SELECT produto_id, estacao FROM public.pedido_itens WHERE pedido_id = $1 ORDER BY id ASC`,
        [pedidoId]
      );

      expect(itensRes.rows.length).toBe(1);
      // Produto sem categoria (categoria_id IS NULL) -> fallback 'cozinha'
      expect(itensRes.rows[0].produto_id).toBe(produtoSemCategoriaId);
      expect(itensRes.rows[0].estacao).toBe('cozinha');
    });

    it('CA04 (caso negativo): produto esgotado (disponivel = false) lança erro e cancela transação', async () => {
      const clientId = '44444444-4444-4444-8444-444444444444';
      const payload = {
        client_id: clientId,
        mesa_codigo: 'BALCAO',
        itens: [{ produto_id: produtoEsgotadoId, quantidade: 1 }]
      };

      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          return await tx.query(`SELECT public.criar_pedido($1) AS resultado`, [JSON.stringify(payload)]);
        })
      ).rejects.toThrow(/Produto não encontrado, inativo ou esgotado/);

      // Garante que o pedido não foi gravado
      const pedRes = await db.query(`SELECT id FROM public.pedidos WHERE client_id = $1`, [clientId]);
      expect(pedRes.rows.length).toBe(0);
    });

    it('CA04 (limite de quantidade): quantidade menor que 1 ou maior que 99 lança erro', async () => {
      const payloadQtd0 = {
        client_id: '55555555-5555-4555-8555-555555555555',
        mesa_codigo: 'BALCAO',
        itens: [{ produto_id: produtoBarId, quantidade: 0 }]
      };

      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          return await tx.query(`SELECT public.criar_pedido($1)`, [JSON.stringify(payloadQtd0)]);
        })
      ).rejects.toThrow(/Quantidade do item deve estar entre 1 e 99/);

      const payloadQtd100 = {
        client_id: '66666666-6666-4666-8666-666666666666',
        mesa_codigo: 'BALCAO',
        itens: [{ produto_id: produtoBarId, quantidade: 100 }]
      };

      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          return await tx.query(`SELECT public.criar_pedido($1)`, [JSON.stringify(payloadQtd100)]);
        })
      ).rejects.toThrow(/Quantidade do item deve estar entre 1 e 99/);
    });

    it('CA01 / Segurança: usuário anônimo não tem permissão para executar criar_pedido', async () => {
      const payload = {
        client_id: '77777777-7777-4777-8777-777777777777',
        mesa_codigo: 'BALCAO',
        itens: [{ produto_id: produtoBarId, quantidade: 1 }]
      };

      await expect(
        db.withJwtClaims(ANON_CLAIMS, async (tx) => {
          return await tx.query(`SELECT public.criar_pedido($1)`, [JSON.stringify(payload)]);
        })
      ).rejects.toThrow(/permission denied/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Execução no Frontend do PDV via código real da aplicação (pedidos-page.js)
  // ---------------------------------------------------------------------------
  describe('2. Execução Funcional no PDV com Código Real da Aplicação (CA01, CA02, CA06)', () => {
    it('CA01 & CA06: Envio de pedido pelo PDV chama criar_pedido com sucesso e limpa o carrinho', async () => {
      let rpcChamada = false;
      let payloadEnviado = null;

      const page = await setupPedidosPage({
        rpcHandlers: {
          criar_pedido: async (args) => {
            rpcChamada = true;
            payloadEnviado = args.p_payload;
            return {
              data: { id: 701, total: 24.00, idempotent: false },
              error: null
            };
          }
        }
      });

      const mockData = getDefaultMockData();
      // Adiciona 3 espressos (R$ 8 cada = R$ 24)
      page.adicionarItemAoCarrinho(mockData.produtos[0], 3);
      expect(estadoPDV.cart.length).toBe(1);

      const mesaSelect = page.harness.document.getElementById('mesa-select');
      mesaSelect.value = '01';
      page.harness.document.getElementById('btn-enviar-pedido').disabled = false;

      // Clica em enviar pedido
      page.harness.document.getElementById('btn-enviar-pedido').click();
      await new Promise(r => setTimeout(r, 80));

      expect(rpcChamada).toBe(true);
      expect(payloadEnviado).toBeDefined();
      expect(payloadEnviado.itens.length).toBe(1);
      expect(payloadEnviado.itens[0].quantidade).toBe(3);
      expect(payloadEnviado.mesa_codigo).toBe('01');
      // Carrinho deve ter sido limpo com sucesso
      expect(estadoPDV.cart.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Validação Estática da Migração e Rollback 159 (CA05)
  // ---------------------------------------------------------------------------
  describe('3. Validação Estática da Migration e Rollback 159 (CA05)', () => {
    it('CA05: migration_caf_000159 existe, usa COALESCE(c.estacao, "cozinha") e não referencia p.estacao', () => {
      const migPath = path.resolve('supabase/migration_caf_000159_correcao_criar_pedido_estacao.sql');
      expect(fs.existsSync(migPath)).toBe(true);

      const sql = fs.readFileSync(migPath, 'utf8');
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.criar_pedido");
      expect(sql).toContain("COALESCE(c.estacao, 'cozinha') AS estacao");
      const sqlSemComentarios = sql.replace(/--.*$/gm, '');
      expect(sqlSemComentarios).not.toContain("p.estacao");
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.criar_pedido(JSONB) FROM anon, PUBLIC;");
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.criar_pedido(JSONB) TO authenticated, service_role;");
      expect(sql).toContain("INSERT INTO public.app_migrations");
      expect(sql).toContain("'159'");
    });

    it('CA05: rollback_caf_000159 existe e reverte migração 159', () => {
      const rbPath = path.resolve('supabase/rollback/rollback_caf_000159.sql');
      expect(fs.existsSync(rbPath)).toBe(true);

      const sql = fs.readFileSync(rbPath, 'utf8');
      expect(sql).toContain("DELETE FROM public.app_migrations WHERE versao = '159'");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.criar_pedido");
    });

    it('CA05: migrations.manifest.json contém registro da migração 159 com checksum correto', () => {
      const manifestPath = path.resolve('supabase/migrations.manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const entry159 = manifest.migrations.find(m => m.versao === '159');
      expect(entry159).toBeDefined();
      expect(entry159.arquivo).toBe('migration_caf_000159_correcao_criar_pedido_estacao.sql');
      expect(entry159.rollback).toBe('rollback_caf_000159.sql');
      expect(entry159.checksum).toBe('3f22e972ae5abe9b5efdc655486a5af514fdaed53538eb6114e2039d7f6d506d');
    });
  });
});
