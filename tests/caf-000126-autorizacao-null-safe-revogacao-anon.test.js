import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';
const INACTIVE_ID = '00000000-0000-0000-0000-000000000003';
const NOPROFILE_ID = '00000000-0000-0000-0000-000000000004';
const CLIENTE_ID = '00000000-0000-0000-0000-000000000010';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const INACTIVE_CLAIMS = { sub: INACTIVE_ID, role: 'authenticated', email: 'inactive@e2e.local' };
const NOPROFILE_CLAIMS = { sub: NOPROFILE_ID, role: 'authenticated', email: 'noprofile@e2e.local' };
const ANON_CLAIMS = { sub: '', role: 'anon' };

const PUBLIC_ALLOWLIST = [
  'criar_pedido_cliente',
  'consultar_status_pedido_cliente',
  'chamar_atendente_mesa',
  'criar_pedido_online',
  'consultar_janelas_ocupadas_online',
  'parear_totem',
  'validar_sessao_totem',
  'criar_pedido_totem',
  'consultar_pedido_avaliacao',
  'registrar_avaliacao',
  'validar_cupom',
  'validar_e_calcular_combo',
  'registrar_erro_cliente',
  'registrar_evento_cardapio',
  'get_user_role',
  'tem_permissao',
  'consolidar_contador_dia_anterior',
  'criar_cobranca_pix'
];

describe('CAF-000126: Autorização NULL-safe e revogação de anon nas RPCs SECURITY DEFINER', () => {
  let db;

  beforeAll(async () => {
    db = await createE2EDatabase();

    // 1. Seed de usuários para testes de autorização
    await db.exec(`
      -- Admin
      INSERT INTO auth.users (id, aud, role, email)
      VALUES ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfis (id, nome, role, ativo, pode_dar_desconto)
      VALUES ('${ADMIN_ID}', 'Administrador Teste', 'admin', true, true)
      ON CONFLICT (id) DO UPDATE SET role = 'admin', ativo = true, pode_dar_desconto = true;

      -- Barista
      INSERT INTO auth.users (id, aud, role, email)
      VALUES ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfis (id, nome, role, ativo, pode_dar_desconto)
      VALUES ('${BARISTA_ID}', 'Barista Teste', 'barista', true, false)
      ON CONFLICT (id) DO UPDATE SET role = 'barista', ativo = true, pode_dar_desconto = false;

      -- Usuário inativo
      INSERT INTO auth.users (id, aud, role, email)
      VALUES ('${INACTIVE_ID}', 'authenticated', 'authenticated', 'inactive@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfis (id, nome, role, ativo, pode_dar_desconto)
      VALUES ('${INACTIVE_ID}', 'Usuário Inativo', 'barista', false, false)
      ON CONFLICT (id) DO UPDATE SET role = 'barista', ativo = false, pode_dar_desconto = false;

      -- Usuário sem perfil
      INSERT INTO auth.users (id, aud, role, email)
      VALUES ('${NOPROFILE_ID}', 'authenticated', 'authenticated', 'noprofile@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      DELETE FROM public.perfis WHERE id = '${NOPROFILE_ID}';

      -- Cliente para testes de conta e limite
      INSERT INTO public.clientes (id, nome, telefone, conta_habilitada, limite_credito)
      VALUES ('${CLIENTE_ID}', 'Cliente Teste Fiado', '51999999999', true, 50.00)
      ON CONFLICT (id) DO UPDATE SET conta_habilitada = true, limite_credito = 50.00;
    `);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('CA01: Rejeição de chamadas não autenticadas (anon / auth.uid() IS NULL)', () => {
    it('anon chamando get_resumo_financeiro é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) => tx.query('SELECT public.get_resumo_financeiro()'))
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('anon chamando obter_ficha_cliente é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.obter_ficha_cliente($1)', [CLIENTE_ID])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('anon chamando lancar_movimento_conta é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.lancar_movimento_conta($1, $2, $3)', [CLIENTE_ID, 'consumo', 10.0])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('anon chamando criar_pedido é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.criar_pedido($1)', [JSON.stringify({ itens: [] })])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('anon chamando toggle_produto_disponivel é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.toggle_produto_disponivel($1, $2)', ['prod_teste', false])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('CA02: Rejeição de chamadas com perfil inexistente ou inativo', () => {
    it('usuário autenticado sem registro em perfis é rejeitado com 42501 em criar_pedido', async () => {
      await expect(
        db.withJwtClaims(NOPROFILE_CLAIMS, (tx) =>
          tx.query('SELECT public.criar_pedido($1)', [JSON.stringify({ itens: [] })])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('usuário autenticado com perfil inativo (ativo = false) é rejeitado com 42501 em fechar_caixa', async () => {
      await expect(
        db.withJwtClaims(INACTIVE_CLAIMS, (tx) =>
          tx.query('SELECT public.fechar_caixa($1, $2)', [
            '00000000-0000-0000-0000-000000000099',
            JSON.stringify({})
          ])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('usuário sem perfil chamando fechar_conta_mesa é rejeitado com 42501', async () => {
      await expect(
        db.withJwtClaims(NOPROFILE_CLAIMS, (tx) =>
          tx.query('SELECT public.fechar_conta_mesa($1, $2)', ['M01', JSON.stringify([])])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('usuário com perfil inativo chamando obter_extrato_cliente é rejeitado com 42501', async () => {
      await expect(
        db.withJwtClaims(INACTIVE_CLAIMS, (tx) =>
          tx.query('SELECT public.obter_extrato_cliente($1)', [CLIENTE_ID])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('CA03: Controle estrito de p_bypass_limite em lancar_movimento_conta', () => {
    it('barista tentando p_bypass_limite = true é estritamente rejeitado com erro 42501', async () => {
      // Cliente tem limite de 50.00. Tentativa de débito de 100.00 excede o limite.
      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, (tx) =>
          tx.query(
            `SELECT public.lancar_movimento_conta(
              p_cliente_id => $1,
              p_tipo => $2,
              p_valor => $3,
              p_bypass_limite => true
            )`,
            [CLIENTE_ID, 'consumo', 100.0]
          )
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('admin com p_bypass_limite = true tem a operação autorizada com sucesso', async () => {
      const { rows } = await db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `SELECT public.lancar_movimento_conta(
            p_cliente_id => $1,
            p_tipo => $2,
            p_valor => $3,
            p_bypass_limite => true
          ) AS res`,
          [CLIENTE_ID, 'consumo', 100.0]
        )
      );

      expect(rows[0]?.res?.sucesso).toBe(true);
      expect(Number(rows[0]?.res?.novo_saldo)).toBe(-100.0);
    });

    it('admin com p_bypass_limite = false respeita o limite e lança erro de limite excedido', async () => {
      await expect(
        db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
          tx.query(
            `SELECT public.lancar_movimento_conta(
              p_cliente_id => $1,
              p_tipo => $2,
              p_valor => $3,
              p_bypass_limite => false
            )`,
            [CLIENTE_ID, 'consumo', 50.0]
          )
        )
      ).rejects.toThrow(/Limite de crédito excedido/);
    });
  });

  describe('CA04 & CA05: Verificação do catálogo pg_proc e search_path', () => {
    it('CA04: 100% das funções SECURITY DEFINER em public possuem search_path fixado', async () => {
      const { rows } = await db.query(`
        SELECT p.proname, p.oid::regprocedure::text AS sig, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true;
      `);

      expect(rows.length).toBeGreaterThan(0);

      const semSearchPath = rows.filter((r) => {
        const config = r.proconfig || [];
        return !config.some((c) => c.startsWith('search_path='));
      });

      expect(semSearchPath).toEqual([]);
    });

    it('CA05: nenhuma função SECURITY DEFINER fora da allowlist possui permissão de EXECUTE para anon', async () => {
      const { rows } = await db.query(`
        SELECT p.proname, p.oid::regprocedure::text AS sig,
               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode_executar
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
        ORDER BY p.proname;
      `);

      const violacoes = rows.filter(
        (r) => r.anon_pode_executar && !PUBLIC_ALLOWLIST.includes(r.proname)
      );

      expect(violacoes).toEqual([]);
    });
  });

  describe('CA06: Allowlist pública permanece acessível para anon', () => {
    it('funções permitidas da allowlist possuem has_function_privilege = true para anon', async () => {
      for (const fn of PUBLIC_ALLOWLIST) {
        const { rows } = await db.query(`
          SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1
          LIMIT 1;
        `, [fn]);

        if (rows.length > 0) {
          expect(rows[0].anon_exec).toBe(true);
        }
      }
    });

    it('anon pode executar validar_cupom sem erro de autorização', async () => {
      const { rows } = await db.withJwtClaims(ANON_CLAIMS, (tx) =>
        tx.query('SELECT public.validar_cupom($1, $2) AS res', ['CUPOM_INEXISTENTE', 100.0])
      );
      expect(rows[0]?.res?.valido).toBe(false);
    });

    it('anon pode consultar status de pedido de cliente', async () => {
      const dummyId = '00000000-0000-0000-0000-000000000999';
      const { rows } = await db.withJwtClaims(ANON_CLAIMS, (tx) =>
        tx.query('SELECT public.consultar_status_pedido_cliente($1::uuid) AS res', [dummyId])
      );
      expect(rows[0]?.res?.encontrado).toBe(false);
    });
  });

  describe('CA07: Eliminação do overload legado e proteção de admin_create_user', () => {
    it('admin_create_user com 4 parâmetros foi removido e não existe no catálogo', async () => {
      const { rows } = await db.query(`
        SELECT p.proname, p.pronargs
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_create_user'
          AND p.pronargs = 4;
      `);

      expect(rows.length).toBe(0);
    });

    it('admin_create_user com 5 parâmetros existe e é único', async () => {
      const { rows } = await db.query(`
        SELECT p.proname, p.pronargs
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_create_user';
      `);

      expect(rows.length).toBe(1);
      expect(rows[0].pronargs).toBe(5);
    });

    it('anon chamando admin_create_user é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query(
            'SELECT public.admin_create_user($1, $2, $3, $4, $5)',
            ['novo@teste.com', 'senha123', 'Novo', 'barista', false]
          )
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('barista chamando admin_create_user é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, (tx) =>
          tx.query(
            'SELECT public.admin_create_user($1, $2, $3, $4, $5)',
            ['novo@teste.com', 'senha123', 'Novo', 'barista', false]
          )
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('admin cria novo usuário com sucesso e atualiza seu perfil com a role especificada', async () => {
      const newEmail = `atendente_${Date.now()}@e2e.local`;
      const { rows } = await db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          'SELECT public.admin_create_user($1, $2, $3, $4, $5) AS res',
          [newEmail, 'senhaForte123!', 'Atendente Especial', 'cozinha', false]
        )
      );

      const createdId = rows[0]?.res?.id;
      expect(createdId).toBeDefined();

      const { rows: perfilRows } = await db.query(
        'SELECT role, pode_dar_desconto, nome FROM public.perfis WHERE id = $1',
        [createdId]
      );

      expect(perfilRows[0]?.role).toBe('cozinha');
      expect(perfilRows[0]?.pode_dar_desconto).toBe(false);
      expect(perfilRows[0]?.nome).toBe('Atendente Especial');
    });
  });

  describe('CA08: Hardening de signup e handle_new_user', () => {
    it('signup padrão ignorando metadados forjados: role forçada para barista e sem desconto', async () => {
      const maliciousUserId = '00000000-0000-0000-0000-000000000777';
      const maliciousEmail = 'hacker@e2e.local';

      await db.query(`
        INSERT INTO auth.users (
          id, aud, role, email, raw_user_meta_data
        ) VALUES (
          '${maliciousUserId}',
          'authenticated',
          'authenticated',
          '${maliciousEmail}',
          '{"nome": "Tentativa Hacker", "role": "admin", "pode_dar_desconto": true}'::jsonb
        );
      `);

      const { rows } = await db.query(
        'SELECT role, pode_dar_desconto FROM public.perfis WHERE id = $1',
        [maliciousUserId]
      );

      expect(rows[0]?.role).toBe('barista');
      expect(rows[0]?.pode_dar_desconto).toBe(false);
    });
  });

  describe('CA09: Validação e autorização em dar_baixa_lote_vencido', () => {
    let loteValidoId;
    let loteVencidoId;

    beforeAll(async () => {
      // Inserir item de estoque e lotes
      const { rows: itemRows } = await db.query(`
        INSERT INTO public.estoque_itens (nome, unidade, estoque_minimo, custo_medio)
        VALUES ('Café Especial Grãos 1kg', 'kg', 5, 45.00)
        RETURNING id;
      `);
      const itemId = itemRows[0].id;

      // Lote com validade futura (+30 dias)
      const { rows: loteFuturoRows } = await db.query(`
        INSERT INTO public.estoque_lotes (item_id, lote_codigo, data_validade, quantidade_inicial, quantidade_restante, custo_unitario, ativo)
        VALUES ($1, 'LOTE-FUTURO', (CURRENT_DATE + interval '30 days')::DATE, 10, 10, 45.00, true)
        RETURNING id;
      `, [itemId]);
      loteValidoId = loteFuturoRows[0].id;

      // Lote vencido (-5 dias)
      const { rows: loteVencidoRows } = await db.query(`
        INSERT INTO public.estoque_lotes (item_id, lote_codigo, data_validade, quantidade_inicial, quantidade_restante, custo_unitario, ativo)
        VALUES ($1, 'LOTE-VENCIDO', (CURRENT_DATE - interval '5 days')::DATE, 10, 10, 45.00, true)
        RETURNING id;
      `, [itemId]);
      loteVencidoId = loteVencidoRows[0].id;
    });

    it('rejeita baixa de lote com data de validade futura', async () => {
      await expect(
        db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
          tx.query('SELECT public.dar_baixa_lote_vencido($1)', [loteValidoId])
        )
      ).rejects.toThrow(/ainda não está vencido/);
    });

    it('rejeita usuário não autenticado (anon) com 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.dar_baixa_lote_vencido($1)', [loteVencidoId])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('permite baixa de lote realmente vencido por operador autorizado', async () => {
      const { rows } = await db.withJwtClaims(BARISTA_CLAIMS, (tx) =>
        tx.query('SELECT public.dar_baixa_lote_vencido($1) AS res', [loteVencidoId])
      );

      expect(rows[0]?.res?.sucesso).toBe(true);
      expect(Number(rows[0]?.res?.quantidade_baixada)).toBe(10);
    });
  });

  describe('CA10: Autorização de cargo/permissão em processar_cashback_pedido', () => {
    it('anon chamando processar_cashback_pedido é rejeitado com erro 42501', async () => {
      await expect(
        db.withJwtClaims(ANON_CLAIMS, (tx) =>
          tx.query('SELECT public.processar_cashback_pedido($1, $2, $3)', [
            123,
            CLIENTE_ID,
            50.0
          ])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('usuário sem perfil chamando processar_cashback_pedido é rejeitado com 42501', async () => {
      await expect(
        db.withJwtClaims(NOPROFILE_CLAIMS, (tx) =>
          tx.query('SELECT public.processar_cashback_pedido($1, $2, $3)', [
            123,
            CLIENTE_ID,
            50.0
          ])
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('barista/admin autorizado tem a permissão validada pelo guard', async () => {
      // Pedido inexistente retorna erro de negócio, não 42501
      const { rows } = await db.withJwtClaims(BARISTA_CLAIMS, (tx) =>
        tx.query('SELECT public.processar_cashback_pedido($1, $2, $3) AS res', [
          null,
          CLIENTE_ID,
          50.0
        ])
      );
      expect(rows[0]?.res?.creditado).toBe(false);
      expect(rows[0]?.res?.motivo).toContain('p_pedido_id é obrigatório');
    });
  });

  describe('CA11 & Helper Functions Unit Checks', () => {
    it('public.exigir_cargo retorna o cargo do usuário quando autorizado', async () => {
      const { rows } = await db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query("SELECT public.exigir_cargo('admin', 'barista') AS role")
      );
      expect(rows[0].role).toBe('admin');
    });

    it('public.exigir_cargo rejeita com 42501 quando cargo não corresponde', async () => {
      await expect(
        db.withJwtClaims(BARISTA_CLAIMS, (tx) =>
          tx.query("SELECT public.exigir_cargo('admin')")
        )
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('public.exigir_permissao valida permissões customizadas de cargo_permissoes', async () => {
      // Admin possui acesso total via tem_permissao
      await expect(
        db.withJwtClaims(ADMIN_CLAIMS, (tx) =>
          tx.query("SELECT public.exigir_permissao('caixa.abrir_fechar')")
        )
      ).resolves.toBeDefined();
    });
  });
});
