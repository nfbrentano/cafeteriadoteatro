import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BARISTA_ID = '00000000-0000-0000-0000-000000000002';

const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const BARISTA_CLAIMS = { sub: BARISTA_ID, role: 'authenticated', email: 'barista@e2e.local' };

describe('CAF-000129: Saldo da mesa com fonte única e débitos/créditos do cliente atômicos e idempotentes', () => {
  let db;
  let produtoId;
  let clienteAId;
  let clienteBId;
  let clienteCId;

  beforeAll(async () => {
    db = await createE2EDatabase();

    // 1. Setup de usuários auth e perfis
    await db.exec(`
      INSERT INTO auth.users (id, aud, role, email) VALUES
        ('${ADMIN_ID}', 'authenticated', 'authenticated', 'admin@e2e.local'),
        ('${BARISTA_ID}', 'authenticated', 'authenticated', 'barista@e2e.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfis (id, nome, role, ativo, pode_dar_desconto) VALUES
        ('${ADMIN_ID}', 'Admin Geral', 'admin', true, true),
        ('${BARISTA_ID}', 'Barista Beto', 'barista', true, true)
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, ativo = true;

      -- Garantir um caixa aberto
      INSERT INTO public.caixas (aberto_por, fundo_troco, aberto_em)
      SELECT '${ADMIN_ID}', 100.00, now()
      WHERE NOT EXISTS (SELECT 1 FROM public.caixas WHERE fechado_em IS NULL);
    `);

    // 2. Produto para pedidos
    const prodRes = await db.query(`SELECT id FROM public.produtos WHERE ativo = true AND disponivel = true LIMIT 1`);
    if (prodRes.rows.length === 0) {
      const insProd = await db.query(`
        INSERT INTO public.produtos (nome, preco, ativo, disponivel)
        VALUES ('Café Especial E2E', 10.00, true, true)
        RETURNING id
      `);
      produtoId = insProd.rows[0].id;
    } else {
      produtoId = prodRes.rows[0].id;
    }

    // 3. Cadastrar clientes para fiado e cashback
    const cARes = await db.query(`
      INSERT INTO public.clientes (nome, telefone, conta_habilitada, limite_credito, saldo_conta)
      VALUES ('Cliente Alice', '11999990001', true, 100.00, 0.00)
      RETURNING id
    `);
    clienteAId = cARes.rows[0].id;

    const cBRes = await db.query(`
      INSERT INTO public.clientes (nome, telefone, conta_habilitada, limite_credito, saldo_conta)
      VALUES ('Cliente Bob', '11999990002', true, 100.00, 0.00)
      RETURNING id
    `);
    clienteBId = cBRes.rows[0].id;

    const cCRes = await db.query(`
      INSERT INTO public.clientes (nome, telefone, conta_habilitada, limite_credito, saldo_conta)
      VALUES ('Cliente Carlos', '11999990003', true, 100.00, 0.00)
      RETURNING id
    `);
    clienteCId = cCRes.rows[0].id;
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  // Helper para criar mesa e pedido
  async function criarPedidoMesa(mesaCodigo, qtd = 10, preco = 10.00, clienteId = null) {
    await db.query(`
      INSERT INTO public.mesas (codigo, descricao, ativo)
      VALUES ($1, 'Mesa Teste', true)
      ON CONFLICT (codigo) DO NOTHING
    `, [mesaCodigo]);

    const res = await db.query(`
      INSERT INTO public.pedidos (mesa_codigo, total, status, status_pagamento, cliente_id, criado_por, criado_por_nome)
      VALUES ($1, $2, 'pendente', 'pendente', $3, '${ADMIN_ID}', 'Admin')
      RETURNING id
    `, [mesaCodigo, (qtd * preco).toFixed(2), clienteId]);

    const pedidoId = res.rows[0].id;

    const itemRes = await db.query(`
      INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_base, preco_unitario)
      VALUES ($1, $2, 'Café Especial E2E', $3, $4, $4)
      RETURNING id
    `, [pedidoId, produtoId, qtd, preco]);

    return { pedidoId, itemId: itemRes.rows[0].id };
  }

  describe('RF01, RF02 / CA01: Abatimento por valor livre e saldo devedor exato', () => {
    it('CA01: Mesa de R$ 100 com abatimento de R$ 30 por valor resulta em saldo restante de R$ 70 (+ taxa) sem troco indevido', async () => {
      const mesa = 'MESA_CA01';
      await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      // Registrar pagamento parcial por valor: R$ 30 abatidos
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const parcialRes = await tx.query(`
          SELECT public.registrar_pagamento_parcial_mesa(
            $1, $2, $3, $4, $5, $6
          ) AS resultado
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 30.00 }]),
          JSON.stringify([]),
          30.00, // p_valor_abatimento
          0.00,  // p_taxa_servico
          'IDEMP_CA01_PARCIAL'
        ]);

        const parcialData = parcialRes.rows[0].resultado;
        expect(parcialData.total_pago).toBe(30.00);
        expect(parcialData.saldo_restante).toBe(70.00);
        expect(parcialData.troco).toBe(0.00);
      });

      // Verificar obter_resumo_conta_mesa e v_saldo_mesa
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const resumoRes = await tx.query(`SELECT public.obter_resumo_conta_mesa($1) AS resumo`, [mesa]);
        const resumo = resumoRes.rows[0].resumo;
        expect(Number(resumo.subtotal_geral)).toBe(100.00);
        expect(Number(resumo.ja_pago)).toBe(30.00);
        expect(Number(resumo.saldo_restante)).toBe(70.00);

        const viewRes = await tx.query(`SELECT * FROM public.v_saldo_mesa WHERE mesa_codigo = $1`, [mesa]);
        expect(viewRes.rows.length).toBe(1);
        expect(Number(viewRes.rows[0].subtotal_geral)).toBe(100.00);
        expect(Number(viewRes.rows[0].ja_pago)).toBe(30.00);
        expect(Number(viewRes.rows[0].saldo_restante)).toBe(70.00);
      });

      // Fechar a mesa com saldo restante R$ 70 + taxa de 10% (R$ 7.00) = R$ 77.00
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const fechaRes = await tx.query(`
          SELECT public.fechar_conta_mesa(
            $1, $2, $3, $4, $5, $6
          ) AS resultado
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 77.00 }]),
          7.00, // taxa_servico 10% sobre 70
          0.00,
          null,
          'IDEMP_CA01_FINAL'
        ]);

        const fechaData = fechaRes.rows[0].resultado;
        expect(Number(fechaData.total)).toBe(77.00);
        expect(Number(fechaData.troco)).toBe(0.00);
        expect(fechaData.idempotent).toBe(false);
      });

      // Confirmar que valor_abatido no fechamento final foi gravado como 70.00
      const fechFinal = await db.query(`
        SELECT valor_abatido, total_conta, taxa_servico FROM public.fechamentos
        WHERE idempotency_key = 'IDEMP_CA01_FINAL'
      `);
      expect(Number(fechFinal.rows[0].valor_abatido)).toBe(70.00);
      expect(Number(fechFinal.rows[0].total_conta)).toBe(77.00);
    });
  });

  describe('RF01 / CA02: Taxa de serviço no parcial não amortiza principal', () => {
    it('CA02: Parcial de R$ 50 em itens + R$ 5 de taxa amortiza R$ 50; saldo restante da mesa de R$ 100 é R$ 50', async () => {
      const mesa = 'MESA_CA02';
      const { itemId } = await criarPedidoMesa(mesa, 10, 10.00); // 10 itens = R$ 100

      // Pagar 5 itens (R$ 50) + R$ 5 de taxa de serviço = R$ 55
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const parcialRes = await tx.query(`
          SELECT public.registrar_pagamento_parcial_mesa(
            $1, $2, $3, $4, $5, $6
          ) AS resultado
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 55.00 }]),
          JSON.stringify([{ pedido_item_id: itemId, quantidade: 5 }]),
          0.00,
          5.00, // taxa_servico
          'IDEMP_CA02_PARCIAL'
        ]);

        const data = parcialRes.rows[0].resultado;
        expect(Number(data.total_pago)).toBe(55.00);
        expect(Number(data.saldo_restante)).toBe(50.00); // 100 - 50 = 50
        expect(Number(data.troco)).toBe(0.00);
      });

      // Verificar que fechamentos.valor_abatido é 50.00 e taxa_servico é 5.00
      const fechParcial = await db.query(`
        SELECT valor_abatido, taxa_servico, total_conta FROM public.fechamentos
        WHERE idempotency_key = 'IDEMP_CA02_PARCIAL'
      `);
      expect(Number(fechParcial.rows[0].valor_abatido)).toBe(50.00);
      expect(Number(fechParcial.rows[0].taxa_servico)).toBe(5.00);
      expect(Number(fechParcial.rows[0].total_conta)).toBe(55.00);

      // Obter resumo da mesa
      const resumoRes = await db.query(`SELECT public.obter_resumo_conta_mesa($1) AS resumo`, [mesa]);
      const resumo = resumoRes.rows[0].resumo;
      expect(Number(resumo.subtotal_geral)).toBe(100.00);
      expect(Number(resumo.ja_pago)).toBe(50.00);
      expect(Number(resumo.saldo_restante)).toBe(50.00);

      // Fechar a mesa pagando exatamente R$ 50 + R$ 5 de taxa = R$ 55
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const fechaRes = await tx.query(`
          SELECT public.fechar_conta_mesa(
            $1, $2, $3, $4, $5, $6
          ) AS resultado
        `, [
          mesa,
          JSON.stringify([{ forma: 'cartao_credito', valor: 55.00 }]),
          5.00, // taxa sobre os 50 restantes
          0.00,
          null,
          'IDEMP_CA02_FINAL'
        ]);

        const fechaData = fechaRes.rows[0].resultado;
        expect(Number(fechaData.total)).toBe(55.00);
        expect(Number(fechaData.troco)).toBe(0.00);
      });
    });
  });

  describe('RF01 / CA03: Excedente em dinheiro (troco no parcial) não reduz saldo da mesa', () => {
    it('CA03: Cliente entrega R$ 60 para conta parcial de R$ 55 (R$ 5 de troco); o saldo da mesa não é reduzido pelo troco', async () => {
      const mesa = 'MESA_CA03';
      await criarPedidoMesa(mesa, 10, 10.00); // R$ 100

      // Parcial de R$ 50 (abatimento por valor) + R$ 5 de taxa = R$ 55 total_a_pagar. Cliente paga R$ 60 em dinheiro.
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const parcialRes = await tx.query(`
          SELECT public.registrar_pagamento_parcial_mesa(
            $1, $2, $3, $4, $5, $6
          ) AS resultado
        `, [
          mesa,
          JSON.stringify([{ forma: 'dinheiro', valor: 60.00 }]),
          JSON.stringify([]),
          50.00, // valor_abatimento
          5.00,  // taxa_servico
          'IDEMP_CA03_PARCIAL'
        ]);

        const data = parcialRes.rows[0].resultado;
        expect(Number(data.total_pago)).toBe(55.00);
        expect(Number(data.troco)).toBe(5.00);
        expect(Number(data.saldo_restante)).toBe(50.00);
      });

      // Conferir que fechamento_pagamentos gravou 60 mas fechamentos.valor_abatido gravou 50
      const fpRes = await db.query(`
        SELECT fp.valor, f.valor_abatido, f.troco
        FROM public.fechamento_pagamentos fp
        JOIN public.fechamentos f ON f.id = fp.fechamento_id
        WHERE f.idempotency_key = 'IDEMP_CA03_PARCIAL'
      `);
      expect(Number(fpRes.rows[0].valor)).toBe(60.00);
      expect(Number(fpRes.rows[0].valor_abatido)).toBe(50.00);
      expect(Number(fpRes.rows[0].troco)).toBe(5.00);

      // Resumo da conta deve reportar ja_pago = 50.00 e saldo_restante = 50.00 (e NÃO 60.00 nem 55.00)
      const resumoRes = await db.query(`SELECT public.obter_resumo_conta_mesa($1) AS resumo`, [mesa]);
      const resumo = resumoRes.rows[0].resumo;
      expect(Number(resumo.ja_pago)).toBe(50.00);
      expect(Number(resumo.saldo_restante)).toBe(50.00);
    });
  });

  describe('RF02 / CA04: Consistência entre view v_saldo_mesa, RPC obter_resumo_conta_mesa e fechar_conta_mesa', () => {
    it('CA04: As três fontes retornam exatamente o mesmo saldo consolidado para mesa com parciais múltiplos', async () => {
      const mesa = 'MESA_CA04';
      await criarPedidoMesa(mesa, 15, 10.00); // R$ 150

      // Dois pagamentos parciais: R$ 30 e R$ 40
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        await tx.query(`
          SELECT public.registrar_pagamento_parcial_mesa($1, $2, $3, $4, $5, $6)
        `, [mesa, JSON.stringify([{ forma: 'pix', valor: 30.00 }]), '[]', 30.00, 0, 'IDEMP_CA04_P1']);

        await tx.query(`
          SELECT public.registrar_pagamento_parcial_mesa($1, $2, $3, $4, $5, $6)
        `, [mesa, JSON.stringify([{ forma: 'pix', valor: 40.00 }]), '[]', 40.00, 0, 'IDEMP_CA04_P2']);
      });

      // 1. View v_saldo_mesa
      const viewRes = await db.query(`SELECT * FROM public.v_saldo_mesa WHERE mesa_codigo = $1`, [mesa]);
      expect(viewRes.rows.length).toBe(1);
      expect(Number(viewRes.rows[0].subtotal_geral)).toBe(150.00);
      expect(Number(viewRes.rows[0].ja_pago)).toBe(70.00);
      expect(Number(viewRes.rows[0].saldo_restante)).toBe(80.00);

      // 2. RPC obter_resumo_conta_mesa
      const rpcRes = await db.query(`SELECT public.obter_resumo_conta_mesa($1) AS resumo`, [mesa]);
      const rpc = rpcRes.rows[0].resumo;
      expect(Number(rpc.subtotal_geral)).toBe(150.00);
      expect(Number(rpc.ja_pago)).toBe(70.00);
      expect(Number(rpc.saldo_restante)).toBe(80.00);

      // Ambos são estritamente idênticos
      expect(Number(viewRes.rows[0].saldo_restante)).toBe(Number(rpc.saldo_restante));
    });
  });

  describe('RF03, RF04 / CA05: Transação atômica no fiado (sem débito órfão se RPC falhar)', () => {
    it('CA05: Falha na RPC por limite insuficiente não lança nenhum débito e mantém a mesa aberta', async () => {
      const mesa = 'MESA_CA05';
      // Cliente A tem limite 100.00. Vamos criar pedido de R$ 150.00
      await criarPedidoMesa(mesa, 15, 10.00, clienteAId);

      // Saldo antes
      const movAntes = await db.query(`
        SELECT COUNT(*) as count FROM public.cliente_conta_movimentos WHERE cliente_id = $1
      `, [clienteAId]);
      const countAntes = Number(movAntes.rows[0].count);

      // Tentativa de fechar conta cobrando R$ 150 via conta_cliente (excede limite de R$ 100)
      let erroCapturado = null;
      try {
        await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
          await tx.query(`
            SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6)
          `, [
            mesa,
            JSON.stringify([{ forma: 'conta_cliente', valor: 150.00, cliente_id: clienteAId }]),
            0.00, 0.00, null, 'IDEMP_CA05_FAIL'
          ]);
        });
      } catch (err) {
        erroCapturado = err;
      }

      expect(erroCapturado).not.toBeNull();
      expect(erroCapturado.message).toContain('Limite de crédito excedido');

      // Verificar que nenhum débito foi gravado no extrato do cliente
      const movDepois = await db.query(`
        SELECT COUNT(*) as count FROM public.cliente_conta_movimentos WHERE cliente_id = $1
      `, [clienteAId]);
      expect(Number(movDepois.rows[0].count)).toBe(countAntes);

      // Verificar que o pedido e a mesa continuam abertos
      const pedRes = await db.query(`
        SELECT status, status_pagamento FROM public.pedidos WHERE mesa_codigo = $1
      `, [mesa]);
      expect(pedRes.rows[0].status_pagamento).toBe('pendente');
    });
  });

  describe('RF04 / CA06: Idempotência do débito de fiado vinculado a fechamento_mesa_id', () => {
    it('CA06: Fechamento com fiado chamado duas vezes com a mesma chave gera exatamente 1 débito ligado ao fechamento', async () => {
      const mesa = 'MESA_CA06';
      await criarPedidoMesa(mesa, 4, 10.00, clienteBId); // R$ 40

      let fechamentoId1 = null;

      // 1ª chamada
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6) AS r
        `, [
          mesa,
          JSON.stringify([{ forma: 'conta_cliente', valor: 40.00, cliente_id: clienteBId }]),
          0.00, 0.00, null, 'IDEMP_CA06_KEY'
        ]);
        fechamentoId1 = res.rows[0].r.fechamento_id;
        expect(res.rows[0].r.idempotent).toBe(false);
      });

      // 2ª chamada (repetição com a mesma chave)
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res2 = await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6) AS r
        `, [
          mesa,
          JSON.stringify([{ forma: 'conta_cliente', valor: 40.00, cliente_id: clienteBId }]),
          0.00, 0.00, null, 'IDEMP_CA06_KEY'
        ]);
        expect(res2.rows[0].r.idempotent).toBe(true);
        expect(res2.rows[0].r.fechamento_id).toBe(fechamentoId1);
      });

      // Verificar no banco: exatamente 1 débito de fiado ligado a fechamentoId1
      const debitos = await db.query(`
        SELECT id, valor, fechamento_mesa_id, tipo
        FROM public.cliente_conta_movimentos
        WHERE cliente_id = $1 AND fechamento_mesa_id = $2
      `, [clienteBId, fechamentoId1]);

      expect(debitos.rows.length).toBe(1);
      expect(Number(debitos.rows[0].valor)).toBe(-40.00);
      expect(debitos.rows[0].tipo).toBe('consumo');
    });
  });

  describe('RF04 / CA07: Remoção da heurística frágil de 10 minutos', () => {
    it('CA07: Dois fechamentos de mesmo valor (R$ 25 cada) para o mesmo cliente em menos de 10 minutos geram 2 débitos distintos', async () => {
      const mesa1 = 'MESA_CA07_1';
      const mesa2 = 'MESA_CA07_2';

      await criarPedidoMesa(mesa1, 1, 25.00, clienteCId); // R$ 25
      await criarPedidoMesa(mesa2, 1, 25.00, clienteCId); // R$ 25

      // Fechar mesa 1
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6)
        `, [
          mesa1,
          JSON.stringify([{ forma: 'conta_cliente', valor: 25.00, cliente_id: clienteCId }]),
          0.00, 0.00, null, 'IDEMP_CA07_M1'
        ]);
      });

      // Fechar mesa 2 imediatamente (mesmo cliente, mesmo valor de R$ 25)
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6)
        `, [
          mesa2,
          JSON.stringify([{ forma: 'conta_cliente', valor: 25.00, cliente_id: clienteCId }]),
          0.00, 0.00, null, 'IDEMP_CA07_M2'
        ]);
      });

      // Extrato do cliente C deve conter exatamente 2 débitos de -25.00
      const extrato = await db.query(`
        SELECT id, valor, fechamento_mesa_id, motivo
        FROM public.cliente_conta_movimentos
        WHERE cliente_id = $1 AND tipo = 'consumo'
        ORDER BY created_at ASC
      `, [clienteCId]);

      const debitos25 = extrato.rows.filter(r => Number(r.valor) === -25.00);
      expect(debitos25.length).toBe(2);
      expect(debitos25[0].fechamento_mesa_id).not.toBe(debitos25[1].fechamento_mesa_id);
    });
  });

  describe('RF06 / CA09: Cashback blindado contra cliente divergente', () => {
    it('CA09: Pedido do cliente A com cashback solicitado para cliente B é recusado sem creditar B', async () => {
      const mesa = 'MESA_CA09';
      const { pedidoId } = await criarPedidoMesa(mesa, 5, 10.00, clienteAId); // R$ 50, cliente A

      // Ativar cashback
      await db.query(`
        INSERT INTO public.configuracoes_sistema (chave, valor)
        VALUES ('cashback_ativo', 'true')
        ON CONFLICT (chave) DO UPDATE SET valor = 'true';
      `);

      // Marcar pedido como pago
      await db.query(`
        UPDATE public.pedidos SET status_pagamento = 'pago', forma_pagamento = 'pix' WHERE id = $1
      `, [pedidoId]);

      // Tenta chamar cashback passando cliente B
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.processar_cashback_pedido($1, $2) AS r
        `, [pedidoId, clienteBId]);

        const result = res.rows[0].r;
        expect(result.creditado).toBe(false);
        expect(result.motivo).toContain('Cliente informado diverge do cliente do pedido');
      });

      // Nenhum movimento de cashback gravado para cliente B
      const movB = await db.query(`
        SELECT COUNT(*) as count FROM public.cliente_conta_movimentos
        WHERE cliente_id = $1 AND pedido_id = $2
      `, [clienteBId, pedidoId]);
      expect(Number(movB.rows[0].count)).toBe(0);
    });
  });

  describe('RF06 / CA10: Cashback recusado para pedido pendente', () => {
    it('CA10: Pedido ainda não pago é recusado para cashback', async () => {
      const mesa = 'MESA_CA10';
      const { pedidoId } = await criarPedidoMesa(mesa, 5, 10.00, clienteAId); // R$ 50, pendente

      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.processar_cashback_pedido($1, $2) AS r
        `, [pedidoId, clienteAId]);

        const result = res.rows[0].r;
        expect(result.creditado).toBe(false);
        expect(result.motivo).toContain('Pedido ainda não pago');
      });
    });
  });

  describe('RF06 / CA11: Concorrência e idempotência atômica no cashback', () => {
    it('CA11: Duas chamadas simultâneas de cashback para o mesmo pedido pago geram exatamente 1 crédito', async () => {
      const mesa = 'MESA_CA11';
      const { pedidoId } = await criarPedidoMesa(mesa, 6, 10.00, clienteAId); // R$ 60

      await db.query(`
        UPDATE public.pedidos SET status_pagamento = 'pago', forma_pagamento = 'pix' WHERE id = $1
      `, [pedidoId]);

      // Primeira chamada: sucesso
      let r1;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`SELECT public.processar_cashback_pedido($1) AS r`, [pedidoId]);
        r1 = res.rows[0].r;
      });
      expect(r1.creditado).toBe(true);
      expect(r1.valor_cashback).toBeGreaterThan(0);

      // Segunda chamada (tentativa concorrente / replay)
      let r2;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`SELECT public.processar_cashback_pedido($1) AS r`, [pedidoId]);
        r2 = res.rows[0].r;
      });
      expect(r2.creditado).toBe(false);
      expect(r2.motivo).toContain('Cashback já creditado para este pedido');

      // Verifica no banco: exatamente 1 depósito de cashback para o pedido
      const creditos = await db.query(`
        SELECT COUNT(*) as count FROM public.cliente_conta_movimentos
        WHERE pedido_id = $1 AND tipo = 'deposito' AND forma_pagamento = 'cashback'
      `, [pedidoId]);
      expect(Number(creditos.rows[0].count)).toBe(1);
    });
  });

  describe('RF07 / CA12: Cashback creditado atomicamente dentro de fechar_conta_mesa', () => {
    it('CA12: Fechar mesa com cliente vinculado e cashback ativo credita cashback na mesma transação', async () => {
      const mesa = 'MESA_CA12';
      // Mesa com R$ 80, cliente C vinculado
      const { pedidoId } = await criarPedidoMesa(mesa, 8, 10.00, clienteCId);

      // Configurar cashback de 10%
      await db.query(`
        INSERT INTO public.configuracoes_sistema (chave, valor)
        VALUES ('cashback_percentual', '10.0'), ('cashback_valor_minimo', '10.0')
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
      `);

      let fecharResultado;
      await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6) AS r
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 80.00 }]),
          0.00, 0.00, null, 'IDEMP_CA12'
        ]);
        fecharResultado = res.rows[0].r;
      });

      // O cashback deve vir preenchido diretamente na resposta da RPC
      expect(fecharResultado.cashback).not.toBeNull();
      expect(fecharResultado.cashback.creditado).toBe(true);
      expect(Number(fecharResultado.cashback.valor_cashback)).toBe(8.00); // 10% de R$ 80

      // Conferir no banco se o registro já existe
      const cbMov = await db.query(`
        SELECT valor, motivo, forma_pagamento
        FROM public.cliente_conta_movimentos
        WHERE pedido_id = $1 AND tipo = 'deposito' AND forma_pagamento = 'cashback'
      `, [pedidoId]);

      expect(cbMov.rows.length).toBe(1);
      expect(Number(cbMov.rows[0].valor)).toBe(8.00);
      expect(cbMov.rows[0].forma_pagamento).toBe('cashback');
    });
  });

  describe('RF05 / CA08: Idempotency Key preservada na tentativa de fechamento', () => {
    it('CA08: Reenvio da mesma idempotency_key após falha ou retry mantém fechamento único', async () => {
      const mesa = 'MESA_CA08';
      await criarPedidoMesa(mesa, 5, 10.00); // R$ 50

      const keyTentativa = 'KEY_RETRY_CA08';

      // 1ª tentativa
      const r1 = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6) AS r
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 50.00 }]),
          0.00, 0.00, null, keyTentativa
        ]);
        return res.rows[0].r;
      });
      expect(r1.idempotent).toBe(false);

      // 2ª tentativa com a mesma chave (ex: retry por timeout ou reabertura de modal)
      const r2 = await db.withJwtClaims(BARISTA_CLAIMS, async (tx) => {
        const res = await tx.query(`
          SELECT public.fechar_conta_mesa($1, $2, $3, $4, $5, $6) AS r
        `, [
          mesa,
          JSON.stringify([{ forma: 'pix', valor: 50.00 }]),
          0.00, 0.00, null, keyTentativa
        ]);
        return res.rows[0].r;
      });
      expect(r2.idempotent).toBe(true);
      expect(r2.fechamento_id).toBe(r1.fechamento_id);

      // Apenas 1 fechamento gravado na tabela
      const fechs = await db.query(`SELECT COUNT(*) as count FROM public.fechamentos WHERE idempotency_key = $1`, [keyTentativa]);
      expect(Number(fechs.rows[0].count)).toBe(1);
    });
  });
});
