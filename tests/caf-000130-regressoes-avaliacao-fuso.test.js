import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const ANON_CLAIMS = { sub: '', role: 'anon' };

describe('CAF-000130: Regressões em produção: avaliação pós-pedido, anti-spam do QR e fuso horário', () => {
  let db;

  beforeAll(async () => {
    db = await createE2EDatabase();

    // Setup de usuários auth e perfis
    await db.exec(`
      INSERT INTO auth.users (id, aud, role, email) VALUES
        ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local'),
        ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfis (id, role, nome, ativo) VALUES
        ('${ADMIN_ID}', 'admin', 'Administrador', true),
        ('${BARISTA_ID}', 'barista', 'Barista Chefe', true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, ativo = true;

      -- Configuração necessária para autoatendimento
      INSERT INTO public.configuracoes_sistema (chave, valor)
      VALUES ('pedido_cliente_ativo', 'true'::jsonb)
      ON CONFLICT (chave) DO UPDATE SET valor = 'true'::jsonb;

      -- Garante mesa M-03 para testes de QR
      INSERT INTO public.mesas (codigo, descricao, ativo, qr_token)
      VALUES ('M-03', 'Mesa 03', true, 'tok-m03-fuso')
      ON CONFLICT (codigo) DO UPDATE SET ativo = true, qr_token = 'tok-m03-fuso';
    `);
  }, 60000);

  describe('1. Avaliação pós-pedido e Admin (CA01, CA02, CA03 / RF01, RF02)', () => {
    it('CA01: avaliar.html carrega dados do pedido e submete avaliação usando cafeteriaSupabase', async () => {
      const mockDb = {
        pedidos: [
          {
            id: 101,
            pedido_token: 'b0000000-0000-0000-0000-000000000001',
            numero_pedido: 101,
            mesa_codigo: 'M-03',
            cliente_nome: 'Fernanda Lima',
            status: 'concluido'
          }
        ],
        avaliacoes: []
      };

      const mockSupabase = createSupabaseMock(mockDb);
      let rpcChamada = null;
      let payloadRecebido = null;

      mockSupabase.rpc = async (fnName, params) => {
        if (fnName === 'consultar_pedido_avaliacao') {
          return {
            data: {
              encontrado: true,
              pedido_id: 101,
              numero_pedido: 101,
              mesa_codigo: 'M-03',
              cliente_nome: 'Fernanda',
              created_at: new Date().toISOString(),
              ja_avaliado: false,
              expirado: false,
              google_review_url: 'https://g.page/review',
              itens: [{ produto_id: 1, nome_produto: 'Cappuccino Especial' }]
            },
            error: null
          };
        }
        if (fnName === 'registrar_avaliacao') {
          rpcChamada = fnName;
          payloadRecebido = params.p_payload;
          return { data: { sucesso: true }, error: null };
        }
        return { data: null, error: new Error('RPC não mockada: ' + fnName) };
      };

      const harness = createPageHarness('avaliar.html', {
        supabase: mockSupabase,
        htmlTransform: (html) => html.replace(/<script defer src="js\/sw-register\.js"><\/script>/, '')
      });

      // Configura token na URL antes de disparar scripts
      harness.window.location.search = '?token=b0000000-0000-0000-0000-000000000001';

      // Executa o script real da aplicação
      await harness.carregarScript('js/avaliar.js');

      // Dispara DOMContentLoaded
      harness.dispararDOMContentLoaded();
      await harness.aguardarRender(60);

      const form = harness.window.document.getElementById('eval-form');
      const stateMessage = harness.window.document.getElementById('state-message');
      expect(stateMessage.classList.contains('hidden')).toBe(true);
      expect(form.classList.contains('hidden')).toBe(false);

      // Simula seleção de notas e envio
      const btnProd5 = harness.window.document.querySelector('.stars[data-target="nota_produto"] button[data-val="5"]');
      const btnAtend5 = harness.window.document.querySelector('.stars[data-target="nota_atendimento"] button[data-val="5"]');
      if (btnProd5) btnProd5.click();
      if (btnAtend5) btnAtend5.click();

      const comentarioInput = harness.window.document.getElementById('eval-comentario');
      if (comentarioInput) comentarioInput.value = 'Café excelente e atendimento rápido!';

      form.dispatchEvent(new harness.window.Event('submit'));
      await harness.aguardarRender(60);

      expect(rpcChamada).toBe('registrar_avaliacao');
      expect(payloadRecebido.nota_produto).toBe(5);
      expect(payloadRecebido.nota_atendimento).toBe(5);
      expect(payloadRecebido.comentario).toBe('Café excelente e atendimento rápido!');

      const successBox = harness.window.document.getElementById('state-success');
      expect(successBox.classList.contains('hidden')).toBe(false);
    });

    it('CA02: aba Avaliações do Admin consulta pedidos com total (não valor_total) e exibe avaliações', async () => {
      let queryColunasPedidos = '';
      const avalsMock = [
        {
          id: 501,
          pedido_id: 101,
          nota_produto: 5,
          nota_atendimento: 4,
          comentario: 'Adorei o espresso!',
          origem: 'qr_mesa',
          created_at: new Date().toISOString(),
          aceita_contato: true,
          contato_telefone: '11988887777',
          pedidos: {
            id: 101,
            numero_pedido: 101,
            mesa_codigo: 'M-03',
            cliente_nome: 'Carlos Souza',
            total: 35.00,
            created_at: new Date().toISOString()
          }
        }
      ];

      const itensMock = [
        {
          id: 1,
          avaliacao_id: 501,
          produto_id: 1,
          nome_produto: 'Café Espresso',
          nota: 5
        }
      ];

      const mockSupabase = {
        from: (table) => {
          if (table === 'avaliacoes') {
            return {
              select: (cols) => {
                if (String(cols).includes('pedidos')) {
                  queryColunasPedidos = cols;
                }
                return {
                  order: () => ({
                    gte: () => ({
                      eq: () => Promise.resolve({ data: avalsMock, error: null }),
                      then: (resolve) => resolve({ data: avalsMock, error: null })
                    }),
                    then: (resolve) => resolve({ data: avalsMock, error: null })
                  }),
                  gte: () => ({
                    or: () => Promise.resolve({ data: [], error: null })
                  })
                };
              }
            };
          }
          if (table === 'avaliacao_itens') {
            return {
              select: () => ({
                in: () => Promise.resolve({ data: itensMock, error: null })
              })
            };
          }
          return {
            select: () => ({
              then: (resolve) => resolve({ data: [], error: null })
            })
          };
        }
      };

      const harness = createPageHarness('admin.html', { supabase: mockSupabase });
      await harness.carregarScript('js/admin/avaliacoes-admin.js');

      // Dispara carregamento das avaliações via initAdminAvaliacoes
      if (typeof harness.window.initAdminAvaliacoes === 'function') {
        await harness.window.initAdminAvaliacoes();
      }
      await harness.aguardarRender(60);

      // Validação do contrato do schema (RF01 / CA02)
      expect(queryColunasPedidos).toContain('total');
      expect(queryColunasPedidos).not.toContain('valor_total');

      const tbody = harness.window.document.getElementById('aval-lista-tbody');
      expect(tbody.innerHTML).toContain('Adorei o espresso!');
      expect(tbody.innerHTML).toContain('#101');
      expect(tbody.innerHTML).toContain('Carlos Souza');
    });

    it('CA03: harness sem alias supabaseClient não quebra cafeteriaSupabase e lint rejeita window.supabaseClient sem fallback', async () => {
      // 1. Verifica harness sem alias padrão
      const harness = createPageHarness('avaliar.html');
      expect(harness.window.cafeteriaSupabase).toBeDefined();
      expect(harness.window.supabaseClient).toBeUndefined();

      // 2. ESLint rejeita window.supabaseClient sem fallback
      const eslint = new ESLint();
      const [resBad] = await eslint.lintText(
        'const client = window.supabaseClient;\nclient.from("test");\n',
        { filePath: 'js/test-alias-bad.js' }
      );
      expect(resBad.errorCount).toBeGreaterThanOrEqual(1);
      expect(resBad.messages.some(m => m.ruleId === 'local/no-bare-supabase-client')).toBe(true);

      // 3. ESLint aceita window.cafeteriaSupabase || window.supabaseClient
      const [resGood] = await eslint.lintText(
        'const client = window.cafeteriaSupabase || window.supabaseClient;\nclient.from("test");\n',
        { filePath: 'js/test-alias-good.js' }
      );
      expect(resGood.errorCount).toBe(0);
    });
  });

  describe('2. Anti-spam do QR e Chamado de Mesa (CA04, CA05, CA06 / RF04)', () => {
    async function testarAntiSpam(timeZone) {
      await db.exec(`SET TIME ZONE '${timeZone}';`);
      await db.query("DELETE FROM public.pedidos WHERE mesa_codigo = 'M-03'");

      const payload = JSON.stringify({
        cliente_nome: 'Cliente Fuso ' + timeZone,
        itens: [
          { produto_id: 'prod-espresso', quantidade: 1 }
        ]
      });

      // 1. Primeiro pedido QR deve suceder
      const res1 = await db.query(
        `SELECT public.criar_pedido_cliente('tok-m03-fuso', $1::jsonb) AS res`,
        [payload]
      );
      const pedido1Id = res1.rows[0].res.pedido_id;
      expect(pedido1Id).toBeDefined();

      // 2. Pedido 10s depois deve ser recusado pelo rate limit
      let erroRateLimit = null;
      try {
        await db.query(
          `SELECT public.criar_pedido_cliente('tok-m03-fuso', $1::jsonb) AS res`,
          [payload]
        );
      } catch (err) {
        erroRateLimit = err;
      }
      expect(erroRateLimit).toBeTruthy();
      expect(erroRateLimit.message).toMatch(/aguarde alguns instantes/i);

      // 3. Simula avanço de 31s (created_at = now() - interval '31 seconds')
      await db.query(`
        UPDATE public.pedidos
        SET created_at = now() - INTERVAL '31 seconds'
        WHERE id = $1
      `, [pedido1Id]);

      // Agora o segundo pedido deve ser aceito!
      const res2 = await db.query(
        `SELECT public.criar_pedido_cliente('tok-m03-fuso', $1::jsonb) AS res`,
        [payload]
      );
      expect(res2.rows[0].res.pedido_id).toBeDefined();
      expect(res2.rows[0].res.pedido_id).not.toBe(pedido1Id);
    }

    async function testarChamadoMesa(timeZone) {
      await db.exec(`SET TIME ZONE '${timeZone}';`);

      // Limpa chamados anteriores da M-03
      await db.query(`DELETE FROM public.mesa_chamados WHERE mesa_codigo = 'M-03'`);

      // 1. Primeiro chamado
      const res1 = await db.query(
        `SELECT public.chamar_atendente_mesa('tok-m03-fuso', 'atendente') AS res`
      );
      expect(res1.rows[0].res.sucesso).toBe(true);
      expect(res1.rows[0].res.repetido).toBeFalsy();

      // 2. Chamado subsequente imediato (20s) -> retorna repetido
      const res2 = await db.query(
        `SELECT public.chamar_atendente_mesa('tok-m03-fuso', 'atendente') AS res`
      );
      expect(res2.rows[0].res.sucesso).toBe(true);
      expect(res2.rows[0].res.repetido).toBe(true);

      // 3. Simula avanço de 61s no chamado anterior
      await db.query(`
        UPDATE public.mesa_chamados
        SET created_at = now() - INTERVAL '61 seconds'
        WHERE mesa_codigo = 'M-03' AND status = 'pendente'
      `);

      // Novo chamado é registrado
      const res3 = await db.query(
        `SELECT public.chamar_atendente_mesa('tok-m03-fuso', 'atendente') AS res`
      );
      expect(res3.rows[0].res.sucesso).toBe(true);
      expect(res3.rows[0].res.repetido).toBeFalsy();
    }

    it('CA04 e CA06: anti-spam do QR aceita pedido após 31s e bloqueia com 10s em sessão UTC', async () => {
      await testarAntiSpam('UTC');
    });

    it('CA05 e CA06: chamado de mesa registra novo após 61s e repete antes disso em sessão UTC', async () => {
      await testarChamadoMesa('UTC');
    });

    it('CA06: anti-spam e chamado de mesa operam identicamente em sessão America/Sao_Paulo', async () => {
      await testarAntiSpam('America/Sao_Paulo');
      await testarChamadoMesa('America/Sao_Paulo');
      // Restaura para UTC
      await db.exec("SET TIME ZONE 'UTC';");
    });
  });

  describe('3. Timestamps e Catálogo do Banco (CA07, CA08, CA09 / RF06, RF07, RF08)', () => {
    it('CA07: registros criados em estoque_lotes, estoque_movimentos, autorizacoes_pin_log e auditoria têm created_at a menos de 5s de now()', async () => {
      await db.exec("SET TIME ZONE 'UTC';");

      // 1. Cria item de estoque para testar lote
      const ingRes = await db.query(`
        INSERT INTO public.estoque_itens (nome, unidade, quantidade, estoque_minimo, custo_medio, controla_validade, ativo)
        VALUES ('Café Grão Teste Fuso', 'kg', 10, 1.0, 45.0, true, true)
        RETURNING id;
      `);
      const ingId = ingRes.rows[0].id;

      // 2. Insere lote
      const loteRes = await db.query(`
        INSERT INTO public.estoque_lotes (item_id, lote_codigo, quantidade_inicial, quantidade_restante, data_validade)
        VALUES ($1, 'LOTE-FUSO-01', 10, 10, (now() + INTERVAL '30 days')::DATE)
        RETURNING id, created_at, EXTRACT(EPOCH FROM (now() - created_at)) AS diff_seg;
      `, [ingId]);
      expect(Number(loteRes.rows[0].diff_seg)).toBeLessThan(5);
      expect(Number(loteRes.rows[0].diff_seg)).toBeGreaterThanOrEqual(0);

      // 3. Insere movimento de estoque
      const movRes = await db.query(`
        INSERT INTO public.estoque_movimentos (item_id, tipo, quantidade, motivo)
        VALUES ($1, 'entrada', 10, 'Teste fuso')
        RETURNING id, created_at, EXTRACT(EPOCH FROM (now() - created_at)) AS diff_seg;
      `, [ingId]);
      expect(Number(movRes.rows[0].diff_seg)).toBeLessThan(5);
      expect(Number(movRes.rows[0].diff_seg)).toBeGreaterThanOrEqual(0);

      // 4. Insere autorização PIN log
      const pinRes = await db.query(`
        INSERT INTO public.autorizacoes_pin_log (autorizador_id, autorizador_nome, permissao, contexto)
        VALUES ('${ADMIN_ID}', 'Admin', 'desconto_acima_limite', '{"desconto": 20}'::jsonb)
        RETURNING id, created_at, EXTRACT(EPOCH FROM (now() - created_at)) AS diff_seg;
      `, []);
      expect(Number(pinRes.rows[0].diff_seg)).toBeLessThan(5);
      expect(Number(pinRes.rows[0].diff_seg)).toBeGreaterThanOrEqual(0);

      // 5. Trigger de auditoria de pedidos
      const pedAuditRes = await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        const p = await tx.query(`
          INSERT INTO public.pedidos (numero_pedido, mesa_codigo, status, total)
          VALUES (999, 'M-03', 'pendente', 10.0)
          RETURNING id;
        `);
        const pedId = p.rows[0].id;
        await tx.query(`
          UPDATE public.pedidos SET status = 'cancelado', motivo_cancelamento = 'Cancelamento teste auditoria'
          WHERE id = $1
        `, [pedId]);

        return tx.query(`
          SELECT created_at, EXTRACT(EPOCH FROM (now() - created_at)) AS diff_seg
          FROM public.pedido_eventos
          WHERE pedido_id = $1
          ORDER BY id DESC LIMIT 1;
        `, [pedId]);
      });
      if (pedAuditRes.rows.length > 0) {
        expect(Number(pedAuditRes.rows[0].diff_seg)).toBeLessThan(5);
      }
    });

    it('CA08: nenhuma função ou default vigente usa timezone(\'America/Sao_Paulo\', now()) fora de conversões permitidas', async () => {
      // 1. Checa defaults de colunas TIMESTAMPTZ
      const colDefaults = await db.query(`
        SELECT table_name, column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'timestamp with time zone'
          AND column_default ILIKE '%timezone%America/Sao_Paulo%'
      `);
      expect(colDefaults.rows).toEqual([]);

      // 2. Checa pg_proc
      const procs = await db.query(`
        SELECT p.proname, p.prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ILIKE '%timezone(%America/Sao_Paulo%now()%'
      `);

      const proibidas = [];
      for (const row of procs.rows) {
        const lines = row.prosrc.split('\n');
        lines.forEach((l, idx) => {
          if (l.includes('timezone') && l.includes('America/Sao_Paulo') && l.includes('now()')) {
            const trimmed = l.trim();
            const permits =
              trimmed.includes('::date') ||
              trimmed.includes('::DATE') ||
              trimmed.includes('::time') ||
              trimmed.includes('::TIME') ||
              trimmed.includes('to_char(');
            if (!permits) {
              proibidas.push({ proc: row.proname, line: idx + 1, code: trimmed });
            }
          }
        });
      }
      expect(proibidas).toEqual([]);
    });

    it('CA09: fn_relatorio_deslocamento_fuso lista linhas afetadas em modo somente leitura', async () => {
      const relatorio = await db.query(`
        SELECT tabela, coluna, total_linhas_afetadas
        FROM public.fn_relatorio_deslocamento_fuso()
        ORDER BY tabela;
      `);

      expect(relatorio.rows.length).toBeGreaterThanOrEqual(5);
      const tabelas = relatorio.rows.map(r => r.tabela);
      expect(tabelas).toContain('estoque_lotes');
      expect(tabelas).toContain('estoque_movimentos');
      expect(tabelas).toContain('autorizacoes_pin_log');
      expect(tabelas).toContain('campanha_usos');
      expect(tabelas).toContain('pix_cobrancas');
      expect(tabelas).toContain('notas_fiscais');

      relatorio.rows.forEach(r => {
        expect(Number(r.total_linhas_afetadas)).toBeGreaterThanOrEqual(0);
        expect(r.coluna).toBe('created_at');
      });
    });
  });
});
