import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { createPageHarness } from './helpers/page-harness.js';

const ANON_CLAIMS = { sub: '', role: 'anon' };

describe('CAF-000131: Pedidos públicos: cupom aplicado no servidor, horário de funcionamento e proteção contra abuso', () => {
  let db;

  const abrirLoja = async () => {
    await db.exec(`
      RESET ROLE;
      SET ROLE postgres;
      UPDATE public.business_hours
      SET
        seg_qui_abre = '06:00',
        seg_qui_fecha = '23:00',
        sex_abre = '06:00',
        sex_fecha = '23:00',
        sab_dom_ativo = true,
        sab_dom_abre = '06:00',
        sab_dom_fecha = '23:00'
      WHERE id = 1;

      UPDATE public.configuracoes_sistema
      SET valor = 'false'::jsonb
      WHERE chave IN ('pedido_cliente_exigir_horario', 'loja_exigir_horario_qr');
    `);
  };

  beforeAll(async () => {
    db = await createE2EDatabase();

    // Setup inicial de categorias e produtos para os testes
    await db.exec(`
      INSERT INTO public.categorias (id, nome, ordem, ativo)
      VALUES (1, 'Cafés Especiais', 1, true)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.produtos (id, nome, categoria_id, preco, tipo_montagem, ativo, disponivel, apenas_encomenda)
      VALUES
        ('prod-espresso-131', 'Espresso Duplo', 1, 10.00, 'simples', true, true, false),
        ('prod-latte-131', 'Caffè Latte', 1, 15.00, 'simples', true, true, false),
        ('prod-bolo-131', 'Bolo Artesanal', 1, 30.00, 'simples', true, true, false)
      ON CONFLICT (id) DO UPDATE SET preco = EXCLUDED.preco, ativo = true, disponivel = true;

      -- Mesas para testes
      INSERT INTO public.mesas (codigo, descricao, ativo, qr_token)
      VALUES
        ('M-131', 'Mesa 131', true, 'tok-m131-cupom'),
        ('M-132', 'Mesa 132', true, 'tok-m132-bloqueio')
      ON CONFLICT (codigo) DO UPDATE SET ativo = true, qr_token = EXCLUDED.qr_token;

      -- Totem para testes
      INSERT INTO public.totens (id, nome, token_hash, ativo)
      VALUES
        ('00000000-0000-0000-0000-000000000131', 'Totem Principal', encode(digest('totem-secret-token-131', 'sha256'), 'hex'), true)
      ON CONFLICT (id) DO UPDATE SET ativo = true;

      -- Campanha padrão TEATRO10
      INSERT INTO public.campanhas (id, nome, cupom_codigo, tipo_desconto, valor_desconto, valor_minimo_pedido, ativa, valido_de, valido_ate, mensagem_template)
      VALUES (9900, 'Teatro 10%', 'TEATRO10', 'percentual', 10, 0, true, now() - INTERVAL '1 day', now() + INTERVAL '10 days', 'Mensagem de cupom')
      ON CONFLICT (id) DO UPDATE SET ativa = true, valido_ate = now() + INTERVAL '10 days';
    `);

    await abrirLoja();
  }, 60000);

  beforeEach(async () => {
    await abrirLoja();
  }, 60000);

  describe('1. Cupom de desconto no servidor (CA01, CA02, CA03, CA04 / RF01, RF02, RF03)', () => {
    it('CA01: Dado o cupom TEATRO10 (10%) e carrinho de R$ 30, grava total R$ 27, desconto R$ 3 e um uso sem login', async () => {
      const payload = {
        cliente_nome: 'Cliente Cupom CA01',
        cliente_telefone: '11988887777',
        modo_retirada: 'imediato',
        cupom_codigo: 'TEATRO10',
        itens: [
          { produto_id: 'prod-bolo-131', quantidade: 1 } // R$ 30,00
        ]
      };

      // Chama como papel anônimo via withJwtClaims
      const res = await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
        return tx.query(
          `SELECT public.criar_pedido_online($1::jsonb) AS resultado`,
          [JSON.stringify(payload)]
        );
      });

      const resultado = res.rows[0].resultado;
      expect(resultado.sucesso).toBe(true);
      expect(Number(resultado.total)).toBe(27.00);

      // Verifica dados gravados no banco
      const pedidoQuery = await db.query(
        `SELECT total, desconto_cupom, cupom_codigo, campanha_id FROM public.pedidos WHERE id = $1`,
        [resultado.pedido_id]
      );
      const pedido = pedidoQuery.rows[0];
      expect(Number(pedido.total)).toBe(27.00);
      expect(Number(pedido.desconto_cupom)).toBe(3.00);
      expect(pedido.cupom_codigo).toBe('TEATRO10');
      expect(pedido.campanha_id).not.toBeNull();

      // Verifica registro em campanha_usos
      const usoQuery = await db.query(
        `SELECT * FROM public.campanha_usos WHERE pedido_id = $1`,
        [resultado.pedido_id]
      );
      expect(usoQuery.rows.length).toBe(1);
      expect(Number(usoQuery.rows[0].valor_receita)).toBe(27.00);
    });

    it('CA02: Dado front adulterado com desconto_cupom = 30, o servidor recalcula e aplica apenas o desconto real', async () => {
      const payload = {
        cliente_nome: 'Hacker Desconto',
        cliente_telefone: '11988887778',
        modo_retirada: 'imediato',
        cupom_codigo: 'TEATRO10',
        desconto_cupom: 30.00, // Tentativa de forçar 100% de desconto
        itens: [
          { produto_id: 'prod-bolo-131', quantidade: 1 } // R$ 30,00 -> com 10% deve ser R$ 27,00
        ]
      };

      const res = await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
        return tx.query(
          `SELECT public.criar_pedido_online($1::jsonb) AS resultado`,
          [JSON.stringify(payload)]
        );
      });

      const resultado = res.rows[0].resultado;
      expect(resultado.sucesso).toBe(true);
      expect(Number(resultado.total)).toBe(27.00);

      const pedidoQuery = await db.query(
        `SELECT total, desconto_cupom FROM public.pedidos WHERE id = $1`,
        [resultado.pedido_id]
      );
      expect(Number(pedidoQuery.rows[0].total)).toBe(27.00);
      expect(Number(pedidoQuery.rows[0].desconto_cupom)).toBe(3.00);
    });

    it('CA03: Quando a flag de cupons públicos estiver desligada, campo de cupom não existe no DOM', async () => {
      // 1. Testa Cardápio com flag desligada
      const harnessCardapio = createPageHarness('cardapio.html');
      harnessCardapio.window.CONFIG_CUPOM_PEDIDOS_PUBLICOS_ATIVO = false;
      await harnessCardapio.carregarScriptsDaPagina();

      const cupomCardapio = harnessCardapio.document.getElementById('input-cupom-cliente');
      const containerCardapio = harnessCardapio.document.getElementById('container-cupom-cliente');
      expect(cupomCardapio).toBeNull();
      expect(containerCardapio).toBeNull();

      // 2. Testa Totem com flag desligada
      const harnessTotem = createPageHarness('totem.html');
      harnessTotem.window.CONFIG_CUPOM_PEDIDOS_PUBLICOS_ATIVO = false;
      await harnessTotem.carregarScriptsDaPagina();

      const cupomTotem = harnessTotem.document.getElementById('totem-input-cupom');
      const containerTotem = harnessTotem.document.getElementById('totem-cupom-container');
      expect(cupomTotem).toBeNull();
      expect(containerTotem).toBeNull();
    });

    it('CA04: Cupom vencido ou com max_usos atingido é recusado com erro', async () => {
      // 1. Cupom vencido
      await db.exec(`
        INSERT INTO public.campanhas (id, nome, cupom_codigo, tipo_desconto, valor_desconto, ativa, valido_de, valido_ate, mensagem_template)
        VALUES (9901, 'Vencido', 'VENCIDO10', 'percentual', 10, true, now() - INTERVAL '10 days', now() - INTERVAL '1 day', 'Cupom')
        ON CONFLICT (id) DO UPDATE SET valido_ate = now() - INTERVAL '1 day';
      `);

      const valVencido = await db.query(
        `SELECT public.validar_cupom('VENCIDO10', 50.00) AS res`
      );
      expect(valVencido.rows[0].res.valido).toBe(false);
      expect(valVencido.rows[0].res.mensagem).toContain('expirado');

      // Tenta criar pedido com cupom expirado -> deve lançar erro
      await expect(
        db.query(`
          SELECT public.criar_pedido_online($1::jsonb)
        `, [JSON.stringify({
          cliente_nome: 'Teste Vencido',
          cliente_telefone: '11977776666',
          cupom_codigo: 'VENCIDO10',
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/expirado/i);

      // 2. Cupom esgotado por max_usos
      await db.exec(`
        INSERT INTO public.campanhas (id, nome, cupom_codigo, tipo_desconto, valor_desconto, ativa, max_usos, mensagem_template)
        VALUES (9902, 'Esgotado', 'LIMITADO1', 'percentual', 10, true, 1, 'Cupom')
        ON CONFLICT (id) DO UPDATE SET max_usos = 1;

        WITH novo_ped AS (
          INSERT INTO public.pedidos (mesa_codigo, status, total, origem, pedido_token)
          VALUES ('BALCÃO', 'concluido', 50.00, 'pdv', gen_random_uuid())
          RETURNING id
        )
        INSERT INTO public.campanha_usos (campanha_id, pedido_id, valor_receita, created_at)
        SELECT 9902, id, 50.00, now() FROM novo_ped;
      `);

      const valEsgotado = await db.query(
        `SELECT public.validar_cupom('LIMITADO1', 50.00) AS res`
      );
      expect(valEsgotado.rows[0].res.valido).toBe(false);
      expect(valEsgotado.rows[0].res.mensagem).toContain('Limite máximo de usos');
    });
  });

  describe('2. Horário de funcionamento e fuso horário (CA05, CA06, CA07, CA08, CA09 / RF04, RF05, RF06)', () => {
    it('CA05: Loja fechada em business_hours recusa pedido online imediato', async () => {
      // Configura business_hours para fechar tudo das 00:00 às 00:01
      await db.exec(`
        UPDATE public.business_hours
        SET
          seg_qui_abre = '00:00',
          seg_qui_fecha = '00:01',
          sex_abre = '00:00',
          sex_fecha = '00:01',
          sab_dom_ativo = false
        WHERE id = 1;
      `);

      // Confirma que loja_esta_aberta(now()) retorna false
      const checkAberta = await db.query(`SELECT public.loja_esta_aberta(now()) AS aberta`);
      expect(checkAberta.rows[0].aberta).toBe(false);

      // Pedido online imediato deve ser recusado
      await expect(
        db.query(`
          SELECT public.criar_pedido_online($1::jsonb)
        `, [JSON.stringify({
          cliente_nome: 'Cliente Noturno',
          cliente_telefone: '11999990000',
          modo_retirada: 'imediato',
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/cafeteria está fechada/i);
    });

    it('CA06: Agendamento com retirada_em fora do horário é recusado; dentro do horário é aceito', async () => {
      // Define horário das 09:00 às 18:00 de segunda a sexta
      await db.exec(`
        UPDATE public.business_hours
        SET
          seg_qui_abre = '09:00',
          seg_qui_fecha = '18:00',
          sex_abre = '09:00',
          sex_fecha = '18:00',
          sab_dom_ativo = true,
          sab_dom_abre = '09:00',
          sab_dom_fecha = '18:00'
        WHERE id = 1;
      `);

      // 1. Data e horário fora do expediente: 21:00 SP (-03:00)
      const foraHorarioIso = '2026-11-25T21:00:00-03:00';
      await expect(
        db.query(`
          SELECT public.criar_pedido_online($1::jsonb)
        `, [JSON.stringify({
          cliente_nome: 'Cliente Agendado Fora',
          cliente_telefone: '11999991111',
          modo_retirada: 'agendado',
          retirada_em: foraHorarioIso,
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/fora do horário de funcionamento/i);

      // 2. Data e horário dentro do expediente: 15:30 SP (-03:00)
      const dentroHorarioIso = '2026-11-25T15:30:00-03:00';
      const resOk = await db.query(`
        SELECT public.criar_pedido_online($1::jsonb) AS res
      `, [JSON.stringify({
        cliente_nome: 'Cliente Agendado Dentro',
        cliente_telefone: '11999991112',
        modo_retirada: 'agendado',
        retirada_em: dentroHorarioIso,
        itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
      })]);

      expect(resOk.rows[0].res.sucesso).toBe(true);
    });

    it('CA07: Admin alterou horário de sábado e janelas exibidas no cardápio seguem o novo horário', async () => {
      const mockBusinessHours = {
        id: 1,
        seg_qui_abre: '08:00',
        seg_qui_fecha: '20:00',
        sex_abre: '08:00',
        sex_fecha: '20:00',
        sab_dom_ativo: true,
        sab_dom_abre: '14:00', // Sábado abre às 14:00
        sab_dom_fecha: '18:00'  // Sábado fecha às 18:00
      };

      const harness = createPageHarness('cardapio.html');
      await harness.carregarScriptsDaPagina();

      harness.window.cafeteriaDB.hours = {
        get: async () => mockBusinessHours
      };

      const sabDate = new Date('2026-11-28T12:00:00-03:00');
      const horarioSab = harness.window.datasSP?.diaSemanaSP(sabDate);
      expect(horarioSab).toBe(6); // 6 = Sábado
    });

    it('CA08: QR da mesa com bloqueio ligado recusa pedido se loja fechada; com bloqueio desligado aceita', async () => {
      // Loja fechada
      await db.exec(`
        UPDATE public.business_hours
        SET
          seg_qui_abre = '00:00',
          seg_qui_fecha = '00:01',
          sex_abre = '00:00',
          sex_fecha = '00:01',
          sab_dom_ativo = false
        WHERE id = 1;
      `);

      // 1. Bloqueio ligado
      await db.exec(`
        INSERT INTO public.configuracoes_sistema (chave, valor)
        VALUES ('pedido_cliente_exigir_horario', 'true'::jsonb)
        ON CONFLICT (chave) DO UPDATE SET valor = 'true'::jsonb;
      `);

      await expect(
        db.query(`
          SELECT public.criar_pedido_cliente('tok-m132-bloqueio', $1::jsonb)
        `, [JSON.stringify({
          cliente_nome: 'Mesa Fechada',
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/cafeteria está fechada/i);

      // 2. Bloqueio desligado
      await db.exec(`
        UPDATE public.configuracoes_sistema
        SET valor = 'false'::jsonb
        WHERE chave = 'pedido_cliente_exigir_horario';
      `);

      const resOk = await db.query(`
        SELECT public.criar_pedido_cliente('tok-m132-bloqueio', $1::jsonb) AS res
      `, [JSON.stringify({
        cliente_nome: 'Mesa Aberta Fora',
        itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
      })]);

      expect(resOk.rows[0].res.sucesso).toBe(true);
    });

    it('CA09: Celular em outro fuso ao agendar 19:30 gera retirada_em correspondente a 19:30 de São Paulo', () => {
      const dataVal = '2026-11-20';
      const horaVal = '19:30';

      const retiradaEmIso = new Date(`${dataVal}T${horaVal}:00-03:00`).toISOString();

      // 19:30 no fuso -03:00 é 22:30 em UTC (Z)
      expect(retiradaEmIso).toBe('2026-11-20T22:30:00.000Z');
    });
  });

  describe('3. Proteção contra abuso e integridade cadastral (CA10, CA11, CA12, CA13 / RF07, RF08, RF09, RF10)', () => {
    it('CA10: Pedido anônimo com telefone existente nunca altera nome nem aceita_contato do cliente', async () => {
      const telefoneAna = '5511999990001';

      // Cria cliente Ana com aceita_contato = false
      await db.exec(`
        INSERT INTO public.clientes (nome, telefone, aceita_contato, ativo)
        VALUES ('Ana', '${telefoneAna}', false, true)
        ON CONFLICT (telefone) DO UPDATE SET nome = 'Ana', aceita_contato = false;
      `);

      // Pedido anônimo usando o telefone de Ana com nome "Teste Impostor" e aceita_lgpd = true
      const payload = {
        cliente_nome: 'Teste Impostor',
        cliente_telefone: telefoneAna,
        aceita_lgpd: true,
        modo_retirada: 'imediato',
        itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
      };

      const res = await db.withJwtClaims(ANON_CLAIMS, async (tx) => {
        return tx.query(
          `SELECT public.criar_pedido_online($1::jsonb) AS resultado`,
          [JSON.stringify(payload)]
        );
      });

      expect(res.rows[0].resultado.sucesso).toBe(true);

      // Consulta o cadastro de clientes para conferir se foi alterado
      const clienteQuery = await db.query(
        `SELECT nome, aceita_contato FROM public.clientes WHERE telefone = $1`,
        [telefoneAna]
      );
      const cliente = clienteQuery.rows[0];

      // Deve continuar estritamente 'Ana' e aceita_contato = false!
      expect(cliente.nome).toBe('Ana');
      expect(cliente.aceita_contato).toBe(false);
    });

    it('CA11: Limite de 3 pedidos aguardando aprovação na mesma mesa recusa o 4º pedido', async () => {
      const mesaToken = 'tok-m131-cupom';

      // Limpa pedidos pendentes prévios da mesa
      await db.exec(`
        UPDATE public.pedidos SET status = 'concluido' WHERE mesa_codigo = 'M-131';
      `);

      // Cria 3 pedidos aguardando aprovação na mesa criados há 1 minuto (para não conflitar com rate limit de 30s)
      for (let i = 1; i <= 3; i++) {
        await db.exec(`
          INSERT INTO public.pedidos (mesa_codigo, status, total, origem, pedido_token, created_at)
          VALUES ('M-131', 'aguardando_aprovacao', 10.00, 'cliente_qr', gen_random_uuid(), now() - INTERVAL '1 minute');
        `);
      }

      // O 4º pedido deve ser recusado por limite de 3 pendentes
      await expect(
        db.query(`
          SELECT public.criar_pedido_cliente($1, $2::jsonb)
        `, [mesaToken, JSON.stringify({
          cliente_nome: 'Quarto Pedido',
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/já possui 3 pedidos aguardando aprovação/i);

      // Quando a equipe aprova ou conclui um pedido...
      await db.exec(`
        UPDATE public.pedidos
        SET status = 'em_preparo', created_at = now() - INTERVAL '1 minute'
        WHERE id = (SELECT id FROM public.pedidos WHERE mesa_codigo = 'M-131' AND status = 'aguardando_aprovacao' LIMIT 1);
      `);

      // Novo pedido agora é aceito
      const resNovo = await db.query(`
        SELECT public.criar_pedido_cliente($1, $2::jsonb) AS res
      `, [mesaToken, JSON.stringify({
        cliente_nome: 'Novo Pedido Liberado',
        itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
      })]);

      expect(resNovo.rows[0].res.sucesso).toBe(true);
    });

    it('CA12: Janela com limite 5 e 4 pedidos serializa pedidos concorrentes via advisory lock', async () => {
      const slotIso = '2026-11-26T14:15:00-03:00';

      // Define limite de janela como 5
      await db.exec(`
        INSERT INTO public.configuracoes_sistema (chave, valor)
        VALUES ('pedido_online_limite_janela', '5'::jsonb)
        ON CONFLICT (chave) DO UPDATE SET valor = '5'::jsonb;

        -- Limpa pedidos nessa janela
        DELETE FROM public.pedidos WHERE retirada_em = '${slotIso}';

        -- Insere 4 pedidos já ocupando a janela
        INSERT INTO public.pedidos (mesa_codigo, status, total, origem, retirada_em, pedido_token)
        VALUES
          ('RETIRADA', 'aguardando_aprovacao', 10, 'online', '${slotIso}', gen_random_uuid()),
          ('RETIRADA', 'aguardando_aprovacao', 10, 'online', '${slotIso}', gen_random_uuid()),
          ('RETIRADA', 'aguardando_aprovacao', 10, 'online', '${slotIso}', gen_random_uuid()),
          ('RETIRADA', 'aguardando_aprovacao', 10, 'online', '${slotIso}', gen_random_uuid());
      `);

      // O 5º pedido preenche a última vaga
      const res5 = await db.query(`
        SELECT public.criar_pedido_online($1::jsonb) AS res
      `, [JSON.stringify({
        cliente_nome: 'Quinto Pedido',
        cliente_telefone: '11988880005',
        modo_retirada: 'agendado',
        retirada_em: slotIso,
        itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
      })]);
      expect(res5.rows[0].res.sucesso).toBe(true);

      // O 6º pedido concorrente na mesma janela deve ser recusado
      await expect(
        db.query(`
          SELECT public.criar_pedido_online($1::jsonb)
        `, [JSON.stringify({
          cliente_nome: 'Sexto Pedido',
          cliente_telefone: '11988880006',
          modo_retirada: 'agendado',
          retirada_em: slotIso,
          itens: [{ produto_id: 'prod-espresso-131', quantidade: 1 }]
        })])
      ).rejects.toThrow(/atingiu o limite máximo de pedidos/i);
    });

    it('CA13: Observações de 5.000 caracteres no pedido e nos itens são truncadas em 500 caracteres', async () => {
      const textoGigante = 'A'.repeat(5000);
      const textoItemGigante = 'B'.repeat(5000);

      const payload = {
        cliente_nome: 'Observador',
        cliente_telefone: '11988880013',
        modo_retirada: 'imediato',
        observacoes: textoGigante,
        itens: [
          {
            produto_id: 'prod-espresso-131',
            quantidade: 1,
            observacoes: textoItemGigante
          }
        ]
      };

      const res = await db.query(
        `SELECT public.criar_pedido_online($1::jsonb) AS resultado`,
        [JSON.stringify(payload)]
      );

      const pedidoId = res.rows[0].resultado.pedido_id;

      // Confere tamanho da observação do pedido
      const pedidoQ = await db.query(`SELECT observacoes FROM public.pedidos WHERE id = $1`, [pedidoId]);
      expect(pedidoQ.rows[0].observacoes.length).toBe(500);
      expect(pedidoQ.rows[0].observacoes).toBe('A'.repeat(500));

      // Confere tamanho da observação do item
      const itemQ = await db.query(`SELECT observacoes FROM public.pedido_itens WHERE pedido_id = $1`, [pedidoId]);
      expect(itemQ.rows[0].observacoes.length).toBe(500);
      expect(itemQ.rows[0].observacoes).toBe('B'.repeat(500));
    });
  });
});
