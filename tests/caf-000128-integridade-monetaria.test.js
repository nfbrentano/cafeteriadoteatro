import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';
const GERENTE_ID = '00000000-0000-0000-0000-000000000004';
const SUPERVISOR_ID = '00000000-0000-0000-0000-000000000006';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };
const GERENTE_CLAIMS = { sub: GERENTE_ID, role: 'authenticated', email: 'gerente@e2e.local' };
const SUPERVISOR_CLAIMS = { sub: SUPERVISOR_ID, role: 'authenticated', email: 'supervisor@e2e.local' };

describe('CAF-000128: Integridade monetária no servidor: sinais, limites, desconto por cargo e PIN', () => {
  let db;
  let produtoId;
  let caixaId;
  let campanha10Id;
  let campanhaInativaId;

  beforeAll(async () => {
    db = await createE2EDatabase();

    // 1. Setup de usuários auth e perfis
    await db.exec(`
      INSERT INTO auth.users (id, aud, role, email) VALUES
        ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local'),
        ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local'),
        ('${GERENTE_ID}', 'authenticated', 'authenticated', 'gerente@e2e.local'),
        ('${SUPERVISOR_ID}', 'authenticated', 'authenticated', 'supervisor@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      -- Garantir cargos
      INSERT INTO public.cargos (nome, sistema) VALUES
        ('Gerente', false),
        ('Supervisor', false)
      ON CONFLICT (nome) DO NOTHING;

      DO $$
      DECLARE
        v_admin_cargo_id UUID;
        v_barista_cargo_id UUID;
        v_gerente_cargo_id UUID;
        v_supervisor_cargo_id UUID;
      BEGIN
        SELECT id INTO v_admin_cargo_id FROM public.cargos WHERE nome = 'Administrador' LIMIT 1;
        SELECT id INTO v_barista_cargo_id FROM public.cargos WHERE nome = 'Barista' LIMIT 1;
        SELECT id INTO v_gerente_cargo_id FROM public.cargos WHERE nome = 'Gerente' LIMIT 1;
        SELECT id INTO v_supervisor_cargo_id FROM public.cargos WHERE nome = 'Supervisor' LIMIT 1;

        -- Permissões de Gerente: pdv.fechar_conta e pdv.desconto
        INSERT INTO public.cargo_permissoes (cargo_id, permissao) VALUES
          (v_gerente_cargo_id, 'pdv.desconto'),
          (v_gerente_cargo_id, 'pdv.fechar_conta'),
          (v_gerente_cargo_id, 'pdv.vender'),
          (v_supervisor_cargo_id, 'pdv.desconto'),
          (v_supervisor_cargo_id, 'pdv.fechar_conta'),
          (v_supervisor_cargo_id, 'pdv.vender')
        ON CONFLICT DO NOTHING;

        -- Perfis:
        -- BARISTA: role 'barista', pode_dar_desconto = false, sem permissão no cargo
        -- GERENTE: role 'barista', pode_dar_desconto = false, MAS cargo_id tem pdv.desconto
        -- SUPERVISOR: role 'admin', pode_dar_desconto = true, com PIN '1234'
        INSERT INTO public.perfis (id, nome, role, ativo, cargo_id, pode_dar_desconto) VALUES
          ('${ADMIN_ID}', 'Admin Geral', 'admin', true, v_admin_cargo_id, true),
          ('${BARISTA_ID}', 'Barista Beto', 'barista', true, v_barista_cargo_id, false),
          ('${GERENTE_ID}', 'Gerente Gustavo', 'barista', true, v_gerente_cargo_id, false),
          ('${SUPERVISOR_ID}', 'Supervisor Silvio', 'admin', true, v_supervisor_cargo_id, true)
        ON CONFLICT (id) DO UPDATE SET
          role = EXCLUDED.role,
          ativo = EXCLUDED.ativo,
          cargo_id = EXCLUDED.cargo_id,
          pode_dar_desconto = EXCLUDED.pode_dar_desconto;
      END $$;
    `);

    // 2. Definir PIN do supervisor
    await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
      await tx.query(`SELECT public.set_usuario_pin($1, $2)`, [SUPERVISOR_ID, '1234']);
    });

    // 3. Obter um produto existente para os testes
    const prodRes = await db.query(`SELECT id, preco FROM public.produtos WHERE ativo = true AND disponivel = true LIMIT 1`);
    if (prodRes.rows.length === 0) {
      const insProd = await db.query(`
        INSERT INTO public.produtos (nome, preco, ativo, disponivel)
        VALUES ('Café Espresso Especial', 10.00, true, true)
        RETURNING id
      `);
      produtoId = insProd.rows[0].id;
    } else {
      produtoId = prodRes.rows[0].id;
    }

    // 4. Garantir um caixa aberto para movimentações
    const caixaRes = await db.query(`SELECT id FROM public.caixas WHERE fechado_em IS NULL LIMIT 1`);
    if (caixaRes.rows.length === 0) {
      const insCaixa = await db.query(`
        INSERT INTO public.caixas (aberto_por, fundo_troco, aberto_em)
        VALUES ('${ADMIN_ID}', 100.00, now())
        RETURNING id
      `);
      caixaId = insCaixa.rows[0].id;
    } else {
      caixaId = caixaRes.rows[0].id;
    }

    // 5. Cadastrar cupons de teste (um ativo de 10% e um inativo)
    const c10Res = await db.query(`
      INSERT INTO public.campanhas (
        nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa, mensagem_template
      ) VALUES (
        'Campanha 10%', 'PROMO10', 'percentual', 10, 0, true, 'Desconto 10%'
      ) RETURNING id
    `);
    campanha10Id = c10Res.rows[0].id;

    const cInativaRes = await db.query(`
      INSERT INTO public.campanhas (
        nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa, mensagem_template
      ) VALUES (
        'Campanha Inativa', 'EXPIRADO', 'percentual', 20, 0, false, 'Inativo'
      ) RETURNING id
    `);
    campanhaInativaId = cInativaRes.rows[0].id;
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  // Helper para criar um pedido simples de teste para uma mesa
  async function criarPedidoMesa(mesaCodigo, qtd = 10, preco = 10.00) {
    await db.query(`
      INSERT INTO public.mesas (codigo, descricao, ativo)
      VALUES ($1, 'Mesa Teste', true)
      ON CONFLICT (codigo) DO NOTHING
    `, [mesaCodigo]);

    const res = await db.query(`
      INSERT INTO public.pedidos (mesa_codigo, total, status, status_pagamento, criado_por, criado_por_nome)
      VALUES ($1, $2, 'pendente', 'pendente', '${ADMIN_ID}', 'Admin')
      RETURNING id
    `, [mesaCodigo, (qtd * preco).toFixed(2)]);

    const pedidoId = res.rows[0].id;

    await db.query(`
      INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario)
      VALUES ($1, $2, 'Café Teste', $3, $4, $4)
    `, [pedidoId, produtoId, qtd, preco]);

    return pedidoId;
  }

  describe('RF01 / CA01: Recusa de taxa de serviço negativa e conservação da mesa aberta', () => {
    it('CA01: fechar_conta_mesa com taxa negativa (-20) é recusado e a mesa permanece aberta', async () => {
      const mesa = 'MESA_CA01';
      const pedidoId = await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_taxa_servico := -20.00,
              p_desconto_manual := 0.00,
              p_desconto_motivo := NULL
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 80.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Taxa de serviço não pode ser negativa.');

      // Verifica se a mesa continua aberta e o pedido continua pendente
      const pedCheck = await db.query(`SELECT status_pagamento FROM public.pedidos WHERE id = $1`, [pedidoId]);
      expect(pedCheck.rows[0].status_pagamento).toBe('pendente');

      // Nenhum fechamento gravado
      const fechCheck = await db.query(`SELECT id FROM public.fechamentos WHERE mesa_codigo = $1`, [mesa]);
      expect(fechCheck.rows.length).toBe(0);
    });

    it('RF01: registrar_pagamento_parcial_mesa com taxa negativa (-5) é recusado', async () => {
      const mesa = 'MESA_CA01_PARCIAL';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.registrar_pagamento_parcial_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_valor_abatimento := 20.00,
              p_taxa_servico := -5.00
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 20.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Taxa de serviço não pode ser negativa.');
    });
  });

  describe('RF01 / CA02: Recusa de pagamentos com valor <= 0', () => {
    it('CA02: Pagamentos [{dinheiro, 200}, {pix, -100}] são recusados e nada é gravado em fechamento_pagamentos', async () => {
      const mesa = 'MESA_CA02';
      await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      const pagamentosInvalidos = [
        { forma: 'dinheiro', valor: 200.00 },
        { forma: 'pix', valor: -100.00 }
      ];

      const countAntes = await db.query(`SELECT count(*) as total FROM public.fechamento_pagamentos`);

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_taxa_servico := 0.00
            )
          `, [mesa, JSON.stringify(pagamentosInvalidos)]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Valor de pagamento deve ser maior que zero.');

      const countDepois = await db.query(`SELECT count(*) as total FROM public.fechamento_pagamentos`);
      expect(countDepois.rows[0].total).toBe(countAntes.rows[0].total);
    });

    it('RF01: registrar_pagamento_parcial_mesa com valor_abatimento <= 0 é recusado', async () => {
      const mesa = 'MESA_CA02_ABAT';
      await criarPedidoMesa(mesa, 5, 10.00);

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.registrar_pagamento_parcial_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_valor_abatimento := -10.00
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 20.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Valor a pagar deve ser maior que zero.');
    });
  });

  describe('RF01 / CA03: Recusa de formas de pagamento inválidas', () => {
    it('CA03: Pagamento com forma "vale" em fechar_conta_mesa é recusado com as formas válidas listadas', async () => {
      const mesa = 'MESA_CA03_FECH';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_taxa_servico := 0.00
            )
          `, [mesa, JSON.stringify([{ forma: 'vale', valor: 50.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Forma de pagamento inválida: vale');
      expect(erro.message).toContain('pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente');
    });

    it('CA03: Pagamento com forma "vale" em registrar_pagamento_parcial_mesa é recusado com a lista', async () => {
      const mesa = 'MESA_CA03_PARC';
      await criarPedidoMesa(mesa, 5, 10.00);

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.registrar_pagamento_parcial_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_valor_abatimento := 20.00
            )
          `, [mesa, JSON.stringify([{ forma: 'vale', valor: 20.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Forma de pagamento inválida: vale');
      expect(erro.message).toContain('pix, dinheiro, cartao_credito, cartao_debito, outros, conta_cliente');
    });
  });

  describe('RF02 / CA04: Teto da taxa de serviço (máximo 20% do subtotal restante)', () => {
    it('CA04: Taxa de 20.01% (R$ 20.01 em conta de R$ 100) é recusada', async () => {
      const mesa = 'MESA_CA04_EXC';
      await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_taxa_servico := 20.05
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 120.05 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Taxa de serviço não pode ultrapassar 20% do subtotal restante.');
    });

    it('CA04: Taxa exatamente igual a 20% (R$ 20.00 em conta de R$ 100) é aceita', async () => {
      const mesa = 'MESA_CA04_OK';
      await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      let res = null;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const queryRes = await tx.query(`
          SELECT public.fechar_conta_mesa(
            p_mesa_codigo := $1,
            p_pagamentos := $2::jsonb,
            p_taxa_servico := 20.00
          ) as resultado
        `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 120.00 }])]);
        res = queryRes.rows[0].resultado;
      });

      expect(res).not.toBeNull();
      expect(Number(res.total)).toBe(120.00);

      const fech = await db.query(`SELECT taxa_servico, total_conta FROM public.fechamentos WHERE id = $1`, [res.fechamento_id]);
      expect(Number(fech.rows[0].taxa_servico)).toBe(20.00);
      expect(Number(fech.rows[0].total_conta)).toBe(120.00);
    });
  });

  describe('RF03 / CA05: CHECK constraints no banco rejeitam novos registros inválidos', () => {
    it('CA05: fechamentos.taxa_servico < 0 é barrado por constraint', async () => {
      let erro = null;
      try {
        await db.query(`
          INSERT INTO public.fechamentos (mesa_codigo, total_conta, criado_por, taxa_servico)
          VALUES ('TESTE_CHK', 50.00, '${ADMIN_ID}', -10.00)
        `);
      } catch (err) {
        erro = err;
      }
      expect(erro).not.toBeNull();
      expect(erro.message).toContain('chk_fechamentos_taxa_servico_positiva');
    });

    it('CA05: fechamentos.desconto_manual < 0 é barrado por constraint', async () => {
      let erro = null;
      try {
        await db.query(`
          INSERT INTO public.fechamentos (mesa_codigo, total_conta, criado_por, desconto_manual)
          VALUES ('TESTE_CHK', 50.00, '${ADMIN_ID}', -5.00)
        `);
      } catch (err) {
        erro = err;
      }
      expect(erro).not.toBeNull();
      expect(erro.message).toContain('chk_fechamentos_desconto_manual_positivo');
    });

    it('CA05: fechamento_pagamentos.valor <= 0 é barrado por constraint', async () => {
      const fRes = await db.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta, criado_por)
        VALUES ('TESTE_CHK_PAG', 50.00, '${ADMIN_ID}')
        RETURNING id
      `);
      const fechId = fRes.rows[0].id;

      let erro = null;
      try {
        await db.query(`
          INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
          VALUES ($1, 'pix', 0.00)
        `, [fechId]);
      } catch (err) {
        erro = err;
      }
      expect(erro).not.toBeNull();
      expect(erro.message).toContain('chk_fechamento_pagamentos_valor_positivo');
    });

    it('CA05: fechamento_pagamentos.forma inválida é barrada por constraint', async () => {
      const fRes = await db.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta, criado_por)
        VALUES ('TESTE_CHK_FORMA', 50.00, '${ADMIN_ID}')
        RETURNING id
      `);
      const fechId = fRes.rows[0].id;

      let erro = null;
      try {
        await db.query(`
          INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
          VALUES ($1, 'vale_alimentacao', 50.00)
        `, [fechId]);
      } catch (err) {
        erro = err;
      }
      expect(erro).not.toBeNull();
      expect(erro.message).toContain('chk_fechamento_pagamentos_forma_valida');
    });

    it('CA05: pedido_itens.quantidade <= 0 é barrada por constraint', async () => {
      const ped = await criarPedidoMesa('MESA_CHK_ITEM', 1, 10.00);

      let erro = null;
      try {
        await db.query(`
          INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario)
          VALUES ($1, $2, 'Item Invalido', 0, 10.00, 10.00)
        `, [ped, produtoId]);
      } catch (err) {
        erro = err;
      }
      expect(erro).not.toBeNull();
      expect(erro.message).toContain('chk_pedido_itens_quantidade_positiva');
    });
  });

  describe('RF04 / CA06: Limite de quantidade (1..99) em criar_pedido e adicionar_itens_pedido', () => {
    it('CA06: criar_pedido com quantidade 0 ou -1 é recusado e nenhum movimento de estoque é criado', async () => {
      const movAntes = await db.query(`SELECT count(*) as total FROM public.estoque_movimentos`);

      // Qtd 0
      let err0 = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.criar_pedido($1::jsonb)
          `, [JSON.stringify({
            mesa_codigo: 'BALCAO',
            itens: [{ produto_id: produtoId, quantidade: 0 }]
          })]);
        });
      } catch (err) {
        err0 = err;
      }
      expect(err0).not.toBeNull();
      expect(err0.message).toContain('Quantidade do item deve estar entre 1 e 99.');

      // Qtd -1
      let errNeg = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.criar_pedido($1::jsonb)
          `, [JSON.stringify({
            mesa_codigo: 'BALCAO',
            itens: [{ produto_id: produtoId, quantidade: -1 }]
          })]);
        });
      } catch (err) {
        errNeg = err;
      }
      expect(errNeg).not.toBeNull();
      expect(errNeg.message).toContain('Quantidade do item deve estar entre 1 e 99.');

      // Qtd 100 (> 99)
      let err100 = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.criar_pedido($1::jsonb)
          `, [JSON.stringify({
            mesa_codigo: 'BALCAO',
            itens: [{ produto_id: produtoId, quantidade: 100 }]
          })]);
        });
      } catch (err) {
        err100 = err;
      }
      expect(err100).not.toBeNull();
      expect(err100.message).toContain('Quantidade do item deve estar entre 1 e 99.');

      // Movimentos de estoque inalterados
      const movDepois = await db.query(`SELECT count(*) as total FROM public.estoque_movimentos`);
      expect(movDepois.rows[0].total).toBe(movAntes.rows[0].total);
    });

    it('CA06: adicionar_itens_pedido com quantidade fora de 1..99 é recusado', async () => {
      const pedidoId = await criarPedidoMesa('MESA_ADIC_QTD', 1, 10.00);

      let err0 = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.adicionar_itens_pedido($1, $2::jsonb)
          `, [pedidoId, JSON.stringify([{ produto_id: produtoId, quantidade: 0 }])]);
        });
      } catch (err) {
        err0 = err;
      }
      expect(err0).not.toBeNull();
      expect(err0.message).toContain('Quantidade do item deve estar entre 1 e 99.');

      let errNeg = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.adicionar_itens_pedido($1, $2::jsonb)
          `, [pedidoId, JSON.stringify([{ produto_id: produtoId, quantidade: -5 }])]);
        });
      } catch (err) {
        errNeg = err;
      }
      expect(errNeg).not.toBeNull();
      expect(errNeg.message).toContain('Quantidade do item deve estar entre 1 e 99.');
    });
  });

  describe('RF05 / CA07: Gerente por cargo com pdv.desconto e pode_dar_desconto = false', () => {
    it('CA07: Gerente Gustavo aplica desconto manual com motivo e fechamento é aceito', async () => {
      const mesa = 'MESA_CA07';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      let res = null;
      await db.withJwtClaims(GERENTE_CLAIMS, async (tx) => {
        const queryRes = await tx.query(`
          SELECT public.fechar_conta_mesa(
            p_mesa_codigo := $1,
            p_pagamentos := $2::jsonb,
            p_taxa_servico := 0.00,
            p_desconto_manual := 10.00,
            p_desconto_motivo := 'Desconto Gerência Fidelidade'
          ) as resultado
        `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 40.00 }])]);
        res = queryRes.rows[0].resultado;
      });

      expect(res).not.toBeNull();
      expect(Number(res.total)).toBe(40.00);

      const fech = await db.query(`SELECT desconto_manual, desconto_motivo, desconto_por FROM public.fechamentos WHERE id = $1`, [res.fechamento_id]);
      expect(Number(fech.rows[0].desconto_manual)).toBe(10.00);
      expect(fech.rows[0].desconto_motivo).toBe('Desconto Gerência Fidelidade');
      expect(fech.rows[0].desconto_por).toBe(GERENTE_ID);
    });

    it('RF05: Barista sem permissão e sem PIN tenta desconto manual e é barrado', async () => {
      const mesa = 'MESA_BARISTA_DESC';
      await criarPedidoMesa(mesa, 5, 10.00);

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_desconto_manual := 5.00,
              p_desconto_motivo := 'Desconto Amigo'
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 45.00 }])]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Usuário sem permissão para aplicar desconto manual.');
    });
  });

  describe('RF06, RF08 / CA08: Barista com PIN de supervisor fecha mesa com desconto', () => {
    it('CA08: Supervisor valida PIN para R$ 10 na mesa 5 e barista fecha com autorizacao_id', async () => {
      const mesa = 'MESA_5';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      // 1. Validar PIN do supervisor
      let pinRes = null;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const q = await tx.query(`
          SELECT public.validar_pin_autorizacao(
            p_pin := '1234',
            p_permissao_necessaria := 'pdv.desconto',
            p_motivo := 'Autorização mesa 5',
            p_contexto := $1::jsonb,
            p_autorizador_id := $2
          ) as res
        `, [JSON.stringify({ mesa_codigo: mesa, valor: 10.00 }), SUPERVISOR_ID]);
        pinRes = q.rows[0].res;
      });

      expect(pinRes).not.toBeNull();
      expect(pinRes.autorizado).toBe(true);
      expect(pinRes.autorizacao_id).toBeDefined();

      const autorizacaoId = pinRes.autorizacao_id;

      // 2. Barista fecha a conta enviando autorizacao_id
      let fechRes = null;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const q = await tx.query(`
          SELECT public.fechar_conta_mesa(
            p_mesa_codigo := $1,
            p_pagamentos := $2::jsonb,
            p_desconto_manual := 10.00,
            p_desconto_motivo := 'Autorizado por supervisor',
            p_autorizacao_id := $3
          ) as res
        `, [mesa, JSON.stringify([{ forma: 'pix', valor: 40.00 }]), autorizacaoId]);
        fechRes = q.rows[0].res;
      });

      expect(fechRes).not.toBeNull();
      expect(Number(fechRes.total)).toBe(40.00);

      // 3. Verifica se supervisor ficou gravado em fechamentos.desconto_por (RF08)
      const fech = await db.query(`SELECT desconto_manual, desconto_por FROM public.fechamentos WHERE id = $1`, [fechRes.fechamento_id]);
      expect(fech.rows[0].desconto_por).toBe(SUPERVISOR_ID);

      // 4. Verifica se o token foi marcado como usado (RF06)
      const token = await db.query(`SELECT usado, usado_em FROM public.autorizacoes_pin_tokens WHERE id = $1`, [autorizacaoId]);
      expect(token.rows[0].usado).toBe(true);
      expect(token.rows[0].usado_em).not.toBeNull();
    });
  });

  describe('RF06 / CA09: Recusa de autorizacao_id usado, vencido, de outra mesa ou com valor menor', () => {
    it('CA09: Token já usado é recusado', async () => {
      const mesa = 'MESA_CA09_REUSO';
      await criarPedidoMesa(mesa, 5, 10.00);

      // Gera e usa token
      const tokenRes = await db.query(`
        INSERT INTO public.autorizacoes_pin_tokens (
          autorizador_id, permissao, mesa_codigo, valor_limite, usado, usado_em
        ) VALUES (
          '${SUPERVISOR_ID}', 'pdv.desconto', '${mesa}', 10.00, true, now()
        ) RETURNING id
      `);
      const tokenId = tokenRes.rows[0].id;

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_desconto_manual := 10.00,
              p_desconto_motivo := 'Tentativa reuso',
              p_autorizacao_id := $3
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 40.00 }]), tokenId]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Autorização por PIN já utilizada.');
    });

    it('CA09: Token vencido é recusado', async () => {
      const mesa = 'MESA_CA09_EXP';
      await criarPedidoMesa(mesa, 5, 10.00);

      const tokenRes = await db.query(`
        INSERT INTO public.autorizacoes_pin_tokens (
          autorizador_id, permissao, mesa_codigo, valor_limite, usado, expira_em
        ) VALUES (
          '${SUPERVISOR_ID}', 'pdv.desconto', '${mesa}', 10.00, false, now() - interval '1 minute'
        ) RETURNING id
      `);
      const tokenId = tokenRes.rows[0].id;

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_desconto_manual := 10.00,
              p_desconto_motivo := 'Tentativa expirado',
              p_autorizacao_id := $3
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 40.00 }]), tokenId]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Autorização por PIN expirada.');
    });

    it('CA09: Token gerado para mesa A usado na mesa B é recusado', async () => {
      const mesaA = 'MESA_A';
      const mesaB = 'MESA_B';
      await criarPedidoMesa(mesaB, 5, 10.00);

      const tokenRes = await db.query(`
        INSERT INTO public.autorizacoes_pin_tokens (
          autorizador_id, permissao, mesa_codigo, valor_limite, usado
        ) VALUES (
          '${SUPERVISOR_ID}', 'pdv.desconto', '${mesaA}', 10.00, false
        ) RETURNING id
      `);
      const tokenId = tokenRes.rows[0].id;

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_desconto_manual := 10.00,
              p_desconto_motivo := 'Mesa trocada',
              p_autorizacao_id := $3
            )
          `, [mesaB, JSON.stringify([{ forma: 'dinheiro', valor: 40.00 }]), tokenId]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Autorização por PIN é para outra mesa');
      expect(erro.message).toContain('MESA_A <> MESA_B');
    });

    it('CA09: Desconto solicitado (R$ 15) maior que valor limite autorizado (R$ 10) é recusado', async () => {
      const mesa = 'MESA_CA09_VALOR';
      await criarPedidoMesa(mesa, 5, 10.00);

      const tokenRes = await db.query(`
        INSERT INTO public.autorizacoes_pin_tokens (
          autorizador_id, permissao, mesa_codigo, valor_limite, usado
        ) VALUES (
          '${SUPERVISOR_ID}', 'pdv.desconto', '${mesa}', 10.00, false
        ) RETURNING id
      `);
      const tokenId = tokenRes.rows[0].id;

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_desconto_manual := 15.00,
              p_desconto_motivo := 'Desconto inflado',
              p_autorizacao_id := $3
            )
          `, [mesa, JSON.stringify([{ forma: 'dinheiro', valor: 35.00 }]), tokenId]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Desconto solicitado (R$ 15.00) excede o valor autorizado pelo supervisor (R$ 10.00).');
    });
  });

  describe('RF07 / CA10: Recálculo de cupom no servidor ignora valor enviado pelo PDV', () => {
    it('CA10: Cupom de 10% numa conta de R$ 80 com desconto enviado de R$ 50 resulta em R$ 8 aplicados', async () => {
      const mesa = 'MESA_CA10';
      await criarPedidoMesa(mesa, 8, 10.00); // R$ 80

      let res = null;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const q = await tx.query(`
          SELECT public.fechar_conta_mesa(
            p_mesa_codigo := $1,
            p_pagamentos := $2::jsonb,
            p_taxa_servico := 0.00,
            p_desconto_manual := 50.00,
            p_desconto_motivo := 'Cupom PROMO10',
            p_campanha_id := $3
          ) as resultado
        `, [mesa, JSON.stringify([{ forma: 'pix', valor: 72.00 }]), campanha10Id]);
        res = q.rows[0].resultado;
      });

      expect(res).not.toBeNull();
      expect(Number(res.total)).toBe(72.00);

      // Desconto real recalculado no servidor = 8.00 (10% de 80.00)
      const fech = await db.query(`SELECT total_conta, desconto_manual, cupom_codigo FROM public.fechamentos WHERE id = $1`, [res.fechamento_id]);
      expect(Number(fech.rows[0].desconto_manual)).toBe(8.00);
      expect(Number(fech.rows[0].total_conta)).toBe(72.00);
      expect(fech.rows[0].cupom_codigo).toBe('PROMO10');
    });
  });

  describe('RF07 / CA11: Barista sem permissão aplica cupom válido sem PIN; cupom inativo é recusado', () => {
    it('CA11: Barista Beto fecha mesa com cupom válido sem pedir PIN', async () => {
      const mesa = 'MESA_CA11_VALIDO';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      let res = null;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const q = await tx.query(`
          SELECT public.fechar_conta_mesa(
            p_mesa_codigo := $1,
            p_pagamentos := $2::jsonb,
            p_taxa_servico := 0.00,
            p_desconto_manual := 0.00,
            p_cupom_codigo := 'PROMO10'
          ) as resultado
        `, [mesa, JSON.stringify([{ forma: 'pix', valor: 45.00 }])]);
        res = q.rows[0].resultado;
      });

      expect(res).not.toBeNull();
      expect(Number(res.total)).toBe(45.00);

      const fech = await db.query(`SELECT desconto_manual FROM public.fechamentos WHERE id = $1`, [res.fechamento_id]);
      expect(Number(fech.rows[0].desconto_manual)).toBe(5.00);
    });

    it('CA11: Tentativa de usar cupom inativo é recusada', async () => {
      const mesa = 'MESA_CA11_INATIVO';
      await criarPedidoMesa(mesa, 5, 10.00);

      let erro = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa(
              p_mesa_codigo := $1,
              p_pagamentos := $2::jsonb,
              p_cupom_codigo := 'EXPIRADO',
              p_campanha_id := $3
            )
          `, [mesa, JSON.stringify([{ forma: 'pix', valor: 40.00 }]), campanhaInativaId]);
        });
      } catch (err) {
        erro = err;
      }

      expect(erro).not.toBeNull();
      expect(erro.message).toContain('Cupom inativo ou fora da validade.');
    });
  });
});
