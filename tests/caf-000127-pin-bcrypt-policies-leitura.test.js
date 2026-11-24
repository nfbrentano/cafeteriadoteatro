import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';
const COZINHA_ID = '00000000-0000-0000-0000-000000000003';
const GERENTE_ID = '00000000-0000-0000-0000-000000000004';
const GERENTE2_ID = '00000000-0000-0000-0000-000000000005';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const COZINHA_CLAIMS = { sub: COZINHA_ID, role: 'authenticated', email: 'cozinha@e2e.local' };
const GERENTE_CLAIMS = { sub: GERENTE_ID, role: 'authenticated', email: 'gerente@e2e.local' };
const ANON_CLAIMS = { sub: '', role: 'anon' };

describe('CAF-000127: Dados sensíveis legíveis: pin_hash com bcrypt e policies de leitura restritas', () => {
  let db;

  beforeAll(async () => {
    db = await createE2EDatabase();

    // Setup de usuários, cargos e permissões
    await db.exec(`
      -- Inserir usuários auth
      INSERT INTO auth.users (id, aud, role, email) VALUES
        ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local'),
        ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local'),
        ('${COZINHA_ID}', 'authenticated', 'authenticated', 'cozinha@e2e.local'),
        ('${GERENTE_ID}', 'authenticated', 'authenticated', 'gerente@e2e.local'),
        ('${GERENTE2_ID}', 'authenticated', 'authenticated', 'gerente2@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      -- Garantir cargo Gerente se não existir
      INSERT INTO public.cargos (nome, sistema)
      VALUES ('Gerente', false)
      ON CONFLICT (nome) DO NOTHING;

      -- Obter IDs dos cargos
      DO $$
      DECLARE
        v_admin_cargo_id UUID;
        v_barista_cargo_id UUID;
        v_cozinha_cargo_id UUID;
        v_gerente_cargo_id UUID;
      BEGIN
        SELECT id INTO v_admin_cargo_id FROM public.cargos WHERE nome = 'Administrador' LIMIT 1;
        SELECT id INTO v_barista_cargo_id FROM public.cargos WHERE nome = 'Barista' LIMIT 1;
        SELECT id INTO v_cozinha_cargo_id FROM public.cargos WHERE nome = 'Cozinha' LIMIT 1;
        SELECT id INTO v_gerente_cargo_id FROM public.cargos WHERE nome = 'Gerente' LIMIT 1;

        -- Associar permissões ao cargo de gerente
        INSERT INTO public.cargo_permissoes (cargo_id, permissao) VALUES
          (v_gerente_cargo_id, 'pdv.desconto'),
          (v_gerente_cargo_id, 'caixa.abrir_fechar'),
          (v_gerente_cargo_id, 'pdv.vender'),
          (v_gerente_cargo_id, 'admin.financeiro'),
          (v_gerente_cargo_id, 'estoque.visualizar'),
          (v_gerente_cargo_id, 'estoque.gerenciar')
        ON CONFLICT DO NOTHING;

        -- Perfis
        INSERT INTO public.perfis (id, nome, role, ativo, cargo_id, pode_dar_desconto) VALUES
          ('${ADMIN_ID}', 'Admin Geral', 'admin', true, v_admin_cargo_id, true),
          ('${BARISTA_ID}', 'Barista Beto', 'barista', true, v_barista_cargo_id, false),
          ('${COZINHA_ID}', 'Cozinheira Clara', 'cozinha', true, v_cozinha_cargo_id, false),
          ('${GERENTE_ID}', 'Gerente Gustavo', 'barista', true, v_gerente_cargo_id, true),
          ('${GERENTE2_ID}', 'Gerente Gabriela', 'barista', true, v_gerente_cargo_id, true)
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          role = EXCLUDED.role,
          ativo = EXCLUDED.ativo,
          cargo_id = EXCLUDED.cargo_id,
          pode_dar_desconto = EXCLUDED.pode_dar_desconto;
      END $$;
    `);
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  describe('RF01 / RF02 / CA01 / CA02 — Restrição de Leitura de Colunas de PIN em perfis e tem_pin', () => {
    it('CA01: Cozinha não consegue ler pin_hash nem SELECT * de perfis (erro 42501)', async () => {
      // SELECT pin_hash deve falhar com permissão negada
      let errPinHash = null;
      try {
        await db.withJwtClaims(COZINHA_CLAIMS, async (tx) => {
          await tx.query('SELECT pin_hash FROM public.perfis WHERE id = $1', [GERENTE_ID]);
        });
      } catch (err) {
        errPinHash = err;
      }
      expect(errPinHash).not.toBeNull();
      expect(errPinHash.code).toBe('42501');

      // SELECT * também deve falhar com 42501 porque inclui colunas protegidas
      let errSelectAll = null;
      try {
        await db.withJwtClaims(COZINHA_CLAIMS, async (tx) => {
          await tx.query('SELECT * FROM public.perfis');
        });
      } catch (err) {
        errSelectAll = err;
      }
      expect(errSelectAll).not.toBeNull();
      expect(errSelectAll.code).toBe('42501');

      // SELECT com colunas públicas explícitas deve funcionar
      await db.withJwtClaims(COZINHA_CLAIMS, async (tx) => {
        const { rows } = await tx.query(
          'SELECT id, nome, role, ativo, tem_pin FROM public.perfis WHERE id = $1',
          [GERENTE_ID]
        );
        expect(rows.length).toBe(1);
        expect(rows[0].nome).toBe('Gerente Gustavo');
        expect(rows[0]).not.toHaveProperty('pin_hash');
      });
    });

    it('CA02: Consulta do admin utiliza tem_pin sem trafegar pin_hash na resposta', async () => {
      // Define PIN para GERENTE_ID e remove de BARISTA_ID
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        await tx.query(`SELECT public.set_usuario_pin($1, '4821')`, [GERENTE_ID]);
        await tx.query(`SELECT public.set_usuario_pin($1, NULL)`, [BARISTA_ID]);
      });

      // Admin busca lista de usuários com as colunas do front (usuarios-admin.js)
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        const { rows } = await tx.query(`
          SELECT id, nome, role, ativo, created_at, cargo_id, pode_dar_desconto, tem_pin
          FROM public.perfis
          ORDER BY created_at DESC
        `);

        expect(rows.length).toBeGreaterThan(0);
        const gerente = rows.find(r => r.id === GERENTE_ID);
        const semPin = rows.find(r => r.id === BARISTA_ID);

        expect(gerente).toBeDefined();
        expect(gerente.tem_pin).toBe(true);
        expect(gerente).not.toHaveProperty('pin_hash');

        expect(semPin).toBeDefined();
        expect(semPin.tem_pin).toBe(false);
        expect(semPin).not.toHaveProperty('pin_hash');

        // Simula renderização do selo de PIN como em usuarios-admin.js:287
        const getPinBadge = (u) => (u.tem_pin ?? Boolean(u.pin_hash))
          ? '🔑 Ativo'
          : '⚪ Sem PIN';

        expect(getPinBadge(gerente)).toBe('🔑 Ativo');
        expect(getPinBadge(semPin)).toBe('⚪ Sem PIN');
      });
    });
  });

  describe('RF03 / RF04 / RF05 / CA03 / CA04 / CA05 — Bcrypt, Sal por Usuário e Validação com Bloqueio', () => {
    it('CA04: Dois usuários com o mesmo PIN gravam hashes bcrypt diferentes iniciados em $2', async () => {
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        await tx.query(`SELECT public.set_usuario_pin($1, '4821')`, [GERENTE_ID]);
        await tx.query(`SELECT public.set_usuario_pin($1, '4821')`, [GERENTE2_ID]);
      });

      // Consulta hashes via superuser (para inspeção de teste)
      const { rows } = await db.query(
        `SELECT id, pin_hash FROM public.perfis WHERE id IN ($1, $2)`,
        [GERENTE_ID, GERENTE2_ID]
      );

      expect(rows.length).toBe(2);
      const hash1 = rows.find(r => r.id === GERENTE_ID).pin_hash;
      const hash2 = rows.find(r => r.id === GERENTE2_ID).pin_hash;

      expect(hash1).toMatch(/^\$2/);
      expect(hash2).toMatch(/^\$2/);
      expect(hash1).not.toBe(hash2); // Sais distintos garantem hashes distintos!
    });

    it('CA03: Validar PIN 4821 autoriza; PIN incorreto recusa e incrementa tentativas', async () => {
      // 1. PIN correto com autorizador informado
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const { rows: resCorreto } = await tx.query(`
          SELECT public.validar_pin_autorizacao(
            p_pin := '4821',
            p_permissao_necessaria := 'pdv.desconto',
            p_motivo := 'Desconto comercial 10%',
            p_contexto := NULL,
            p_autorizador_id := $1
          ) AS resultado
        `, [GERENTE_ID]);

        const dataCorreta = resCorreto[0].resultado;
        expect(dataCorreta.autorizado).toBe(true);
        expect(dataCorreta.supervisor_nome).toBe('Gerente Gustavo');
      });

      // 2. PIN incorreto
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const { rows: resIncorreto } = await tx.query(`
          SELECT public.validar_pin_autorizacao(
            p_pin := '4822',
            p_permissao_necessaria := 'pdv.desconto',
            p_motivo := 'Desconto 10%',
            p_contexto := NULL,
            p_autorizador_id := $1
          ) AS resultado
        `, [GERENTE_ID]);

        const dataIncorreta = resIncorreto[0].resultado;
        expect(dataIncorreta.autorizado).toBe(false);
        expect(dataIncorreta.mensagem).toMatch(/inválido|bloqueado/i);
      });

      // Verifica tentativas erradas incrementadas
      const { rows: checkTentativas } = await db.query(
        `SELECT pin_tentativas_erradas FROM public.perfis WHERE id = $1`,
        [GERENTE_ID]
      );
      expect(checkTentativas[0].pin_tentativas_erradas).toBe(1);

      // 3. Força mais 4 erros para testar bloqueio temporário
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        for (let i = 0; i < 4; i++) {
          await tx.query(`
            SELECT public.validar_pin_autorizacao(
              p_pin := '4822',
              p_permissao_necessaria := 'pdv.desconto',
              p_motivo := 'Tentativa erro',
              p_contexto := NULL,
              p_autorizador_id := $1
            )
          `, [GERENTE_ID]);
        }
      });

      const { rows: checkBloqueio } = await db.query(
        `SELECT pin_tentativas_erradas, pin_bloqueado_ate FROM public.perfis WHERE id = $1`,
        [GERENTE_ID]
      );
      expect(checkBloqueio[0].pin_tentativas_erradas).toBe(5);
      expect(checkBloqueio[0].pin_bloqueado_ate).not.toBeNull();

      // Tentativa mesmo com PIN certo agora é recusada por bloqueio temporário
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const { rows: resBloqueado } = await tx.query(`
          SELECT public.validar_pin_autorizacao(
            p_pin := '4821',
            p_permissao_necessaria := 'pdv.desconto',
            p_motivo := 'Desbloqueio teste',
            p_contexto := NULL,
            p_autorizador_id := $1
          ) AS resultado
        `, [GERENTE_ID]);

        expect(resBloqueado[0].resultado.autorizado).toBe(false);
        expect(resBloqueado[0].resultado.mensagem).toMatch(/bloqueado/i);
      });

      // Limpa bloqueio para próximos testes
      await db.exec(`
        UPDATE public.perfis
        SET pin_tentativas_erradas = 0, pin_bloqueado_ate = NULL
        WHERE id = '${GERENTE_ID}';
      `);
    });

    it('CA05: Hashes sha256 são anulados pela migration e perfis sem bcrypt mostram tem_pin = false', async () => {
      // Insere propositalmente um hash sha256 legado
      const legacySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      await db.exec(`
        UPDATE public.perfis
        SET pin_hash = '${legacySha256}'
        WHERE id = '${BARISTA_ID}';
      `);

      // Aplica a limpeza da migration
      await db.exec(`
        UPDATE public.perfis
        SET pin_hash = NULL
        WHERE pin_hash IS NOT NULL AND pin_hash !~ '^\\$2';
      `);

      const { rows } = await db.query(
        `SELECT id, pin_hash, tem_pin FROM public.perfis WHERE id = $1`,
        [BARISTA_ID]
      );
      expect(rows[0].pin_hash).toBeNull();
      expect(rows[0].tem_pin).toBe(false);
    });

    it('CA06 / RNF01: Validação de PIN responde em menos de 500 ms com até 20 perfis com PIN', async () => {
      // Cria 20 perfis com PIN
      const userIds = [];
      for (let i = 1; i <= 20; i++) {
        const uid = `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`;
        userIds.push(uid);
      }

      await db.exec(`
        INSERT INTO auth.users (id, aud, role, email)
        SELECT u::uuid, 'authenticated', 'authenticated', 'operador_' || u || '@e2e.local'
        FROM unnest(ARRAY[${userIds.map(id => `'${id}'`).join(',')}]) AS u
        ON CONFLICT (id) DO NOTHING;

        DO $$
        DECLARE
          v_hash TEXT := public.fn_hash_pin('1234');
          v_gerente_id UUID;
        BEGIN
          SELECT id INTO v_gerente_id FROM public.cargos WHERE nome = 'Gerente' LIMIT 1;

          INSERT INTO public.perfis (id, nome, role, ativo, cargo_id, pode_dar_desconto, pin_hash)
          SELECT u::uuid, 'Operador ' || u, 'barista', true, v_gerente_id, true, v_hash
          FROM unnest(ARRAY[${userIds.map(id => `'${id}'`).join(',')}]) AS u
          ON CONFLICT (id) DO UPDATE SET
            cargo_id = v_gerente_id,
            pode_dar_desconto = true,
            pin_hash = v_hash,
            ativo = true;
        END $$;
      `);

      // Mede tempo de validação com supervisor especificado (padrão do PDV)
      const targetSupervisor = userIds[10];
      const t0 = performance.now();
      const { rows } = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        return tx.query(`
          SELECT public.validar_pin_autorizacao(
            p_pin := '1234',
            p_permissao_necessaria := 'pdv.desconto',
            p_motivo := 'Desconto velocidade',
            p_contexto := NULL,
            p_autorizador_id := $1
          ) AS resultado
        `, [targetSupervisor]);
      });
      const t1 = performance.now();
      const durationMs = t1 - t0;

      expect(rows[0].resultado.autorizado).toBe(true);
      expect(durationMs).toBeLessThan(500);
    });
  });

  describe('RF06 / RF07 / CA07 / CA08 / CA09 / CA10 — Policies Restritas em Financeiro, Caixa e Estoque', () => {
    beforeAll(async () => {
      // Inserir dados de teste para fechamentos, caixa e estoque
      await db.exec(`
        -- Fechamento de teste
        INSERT INTO public.fechamentos (id, mesa_codigo, total_conta, troco, criado_por)
        VALUES ('f0000000-0000-0000-0000-000000000001', 'M01', 150.00, 0, '${BARISTA_ID}')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.fechamento_pagamentos (id, fechamento_id, forma, valor)
        VALUES (99901, 'f0000000-0000-0000-0000-000000000001', 'dinheiro', 150.00)
        ON CONFLICT (id) DO NOTHING;

        -- Caixa aberto e movimento
        INSERT INTO public.caixas (id, aberto_por, fundo_troco)
        VALUES ('c0000000-0000-0000-0000-000000000001', '${BARISTA_ID}', 100.00)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.caixa_movimentos (caixa_id, tipo, valor, motivo, criado_por)
        VALUES ('c0000000-0000-0000-0000-000000000001', 'sangria', 50.00, 'Sangria de teste', '${BARISTA_ID}');

        -- Estoque item, movimento e lote
        INSERT INTO public.estoque_itens (id, nome, unidade, quantidade)
        VALUES (88801, 'Café em Grãos Especial', 'kg', 10.5)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.estoque_movimentos (item_id, tipo, quantidade)
        VALUES (88801, 'entrada', 10.5);

        INSERT INTO public.estoque_lotes (item_id, quantidade_inicial, quantidade_restante, data_validade)
        VALUES (88801, 10.5, 10.5, CURRENT_DATE + interval '30 days');
      `);
    });

    it('CA07: Sessão anon recebe 0 linhas ou erro de permissão nas 7 tabelas', async () => {
      const tabelas = [
        'public.fechamentos',
        'public.fechamento_pagamentos',
        'public.fechamento_pedidos',
        'public.caixa_movimentos',
        'public.estoque_itens',
        'public.estoque_movimentos',
        'public.estoque_lotes'
      ];

      for (const tabela of tabelas) {
        let rowsCount = 0;
        let blockedByPermission = false;
        try {
          await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
            const { rows } = await tx.query(`SELECT * FROM ${tabela} LIMIT 5`);
            rowsCount = rows.length;
          });
        } catch (err) {
          if (err.code === '42501' || err.message?.includes('permission denied')) {
            blockedByPermission = true;
          } else {
            throw err;
          }
        }

        expect(
          rowsCount === 0 || blockedByPermission,
          `Tabela ${tabela} permitiu leitura por anon (${rowsCount} linhas retornadas)`
        ).toBe(true);
      }
    });

    it('CA08: Barista logado lê dados operacionais de PDV / Fechamentos / Caixa / Estoque normalmente', async () => {
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const { rows: fech } = await tx.query('SELECT id, total_conta FROM public.fechamentos');
        expect(fech.length).toBeGreaterThan(0);

        const { rows: mov } = await tx.query('SELECT id, valor FROM public.caixa_movimentos');
        expect(mov.length).toBeGreaterThan(0);

        const { rows: est } = await tx.query('SELECT id, nome FROM public.estoque_itens');
        expect(est.length).toBeGreaterThan(0);
      });
    });

    it('CA09: Cozinha logada lê estoque, mas recebe 0 linhas em fechamentos e caixa_movimentos', async () => {
      await db.withJwtClaims(COZINHA_CLAIMS, async (tx) => {
        // Cozinha NÃO deve ver fechamentos financeiros nem movimentações de caixa
        const { rows: fech } = await tx.query('SELECT * FROM public.fechamentos');
        expect(fech.length).toBe(0);

        const { rows: mov } = await tx.query('SELECT * FROM public.caixa_movimentos');
        expect(mov.length).toBe(0);

        // Mas cozinha DEVE ver estoque para operar
        const { rows: est } = await tx.query('SELECT id, nome FROM public.estoque_itens');
        expect(est.length).toBeGreaterThan(0);
      });
    });

    it('CA10 / RNF02: TV de retirada (v_painel_retirada) continua funcionando sem login (anon)', async () => {
      // Insere pedido concluído (pronto para retirada) para hoje
      await db.exec(`
        INSERT INTO public.pedidos (numero_pedido, mesa_codigo, status, cliente_nome, pronto_em, created_at)
        VALUES (998, 'BALCAO', 'concluido', 'Carlos Silva', now(), now());
      `);

      await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
        const { rows } = await tx.query(`
          SELECT * FROM public.v_painel_retirada
          WHERE status = 'concluido'
          ORDER BY pronto_em DESC
          LIMIT 10
        `);

        expect(rows).toBeDefined();
        expect(Array.isArray(rows)).toBe(true);
        const pedido = rows.find(r => r.numero_pedido === 998 || String(r.numero_pedido) === '998');
        expect(pedido).toBeDefined();
        expect(pedido.status).toBe('concluido');
      });
    });
  });
});
