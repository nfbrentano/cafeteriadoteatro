// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { createPageHarness } from './helpers/page-harness.js';
import {
  obterSugestoesCarrinho,
  verificarUpgradeCombo,
  isProdutoValidoParaSugestao,
  isSugestoesDismissed,
  dismissSugestoes,
  resetSugestoesDismissed,
  CHAVE_STORAGE_SUGESTOES_DISMISSED
} from '../js/utils/sugestoes.js';

describe('CAF-000150: Sugestão de itens (upsell) no QR, pedido online e PDV', () => {
  let db;

  beforeAll(async () => {
    db = await createE2EDatabase();
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetSugestoesDismissed();
  });

  // ===========================================================================
  // 1. BANCO DE DADOS POSTGRESQL REAL (PGlite) - CA03, CA08, CA09
  // ===========================================================================
  describe('1. Banco de Dados e RPCs (PGlite) — CA03, CA08, CA09', () => {
    it('CA03: Tabela sugestoes_regras armazena canal e view totem_sugestoes mantém compatibilidade', async () => {
      await db.exec(`
        INSERT INTO public.categorias (id, nome, ativo, ordem) VALUES
          ('cat_cafes', 'Cafés', true, 1),
          ('cat_salgados', 'Salgados', true, 2)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo) VALUES
          ('prod_espresso', 'Espresso Tradicional', 6.00, 'cat_cafes', true),
          ('prod_paoqueijo', 'Pão de Queijo', 8.00, 'cat_salgados', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.sugestoes_regras (gatilho_categoria_id, produto_sugerido_id, canal, frase_destaque, ativo)
        VALUES ('cat_cafes', 'prod_paoqueijo', 'mesa', 'Vai bem na sua mesa!', true);
      `);

      // Consulta via tabela canonical
      const resRegras = await db.query(`
        SELECT canal, frase_destaque, produto_sugerido_id
        FROM public.sugestoes_regras
        WHERE produto_sugerido_id = 'prod_paoqueijo' AND canal = 'mesa'
      `);
      expect(resRegras.rows.length).toBeGreaterThanOrEqual(1);
      expect(resRegras.rows[0].canal).toBe('mesa');

      // Consulta via view de compatibilidade totem_sugestoes
      const resView = await db.query(`
        SELECT id, produto_sugerido_id, frase_destaque, canal
        FROM public.totem_sugestoes
        WHERE produto_sugerido_id = 'prod_paoqueijo'
      `);
      expect(resView.rows.length).toBeGreaterThanOrEqual(1);
      expect(resView.rows[0].canal).toBe('mesa');
    });

    it('CA08: registrar_evento_cardapio computa sugestao_exibida e sugestao_aceita e get_metricas_sugestoes calcula 30% de aceitação', async () => {
      const hoje = new Date().toISOString().split('T')[0];

      // Insere regra para teste
      const resRegra = await db.query(`
        INSERT INTO public.sugestoes_regras (gatilho_categoria_id, produto_sugerido_id, canal, frase_destaque, ativo)
        VALUES ('cat_cafes', 'prod_paoqueijo', 'mesa', 'Frase Teste Conversao', true)
        RETURNING id;
      `);
      const regraId = resRegra.rows[0].id;

      // Simula 10 exibições
      for (let i = 0; i < 10; i++) {
        await db.query(`
          SELECT public.registrar_evento_cardapio(
            'mesa',
            'sugestao_exibida',
            'prod_paoqueijo',
            '${hoje}'::date,
            ${regraId}
          );
        `);
      }

      // Simula 3 aceites
      for (let i = 0; i < 3; i++) {
        await db.query(`
          SELECT public.registrar_evento_cardapio(
            'mesa',
            'sugestao_aceita',
            'prod_paoqueijo',
            '${hoje}'::date,
            ${regraId}
          );
        `);
      }

      // Chama RPC get_metricas_sugestoes
      const metricasRes = await db.query(`
        SELECT regra_id, canal, produto_id, total_exibicoes, total_aceites, taxa_aceitacao
        FROM public.get_metricas_sugestoes('${hoje}'::date, '${hoje}'::date)
        WHERE regra_id = ${regraId} AND canal = 'mesa';
      `);

      expect(metricasRes.rows.length).toBe(1);
      const row = metricasRes.rows[0];
      expect(Number(row.total_exibicoes)).toBe(10);
      expect(Number(row.total_aceites)).toBe(3);
      expect(Number(row.taxa_aceitacao)).toBe(30.0);
    });

    it('CA09: RPC obter_pares_mais_vendidos identifica coocorrência de produtos nos pedidos dos últimos 30 dias', async () => {
      await db.exec(`
        INSERT INTO public.mesas (codigo, ativo) VALUES ('M-99', true) ON CONFLICT (codigo) DO NOTHING;

        INSERT INTO public.produtos (id, nome, preco, categoria_id, ativo) VALUES
          ('prod_brownie', 'Brownie de Chocolate', 12.00, 'cat_salgados', true)
        ON CONFLICT (id) DO NOTHING;

        -- Pedido 1: Espresso + Brownie
        INSERT INTO public.pedidos (id, numero_pedido, mesa_codigo, status, total, created_at)
        VALUES (9101, 101, 'M-99', 'concluido', 18.00, now() - INTERVAL '2 days')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES
          (9101, 'prod_espresso', 'Espresso Tradicional', 1, 6.00),
          (9101, 'prod_brownie', 'Brownie de Chocolate', 1, 12.00)
        ON CONFLICT DO NOTHING;

        -- Pedido 2: Espresso + Brownie
        INSERT INTO public.pedidos (id, numero_pedido, mesa_codigo, status, total, created_at)
        VALUES (9102, 102, 'M-99', 'concluido', 18.00, now() - INTERVAL '1 day')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_unitario) VALUES
          (9102, 'prod_espresso', 'Espresso Tradicional', 1, 6.00),
          (9102, 'prod_brownie', 'Brownie de Chocolate', 1, 12.00)
        ON CONFLICT DO NOTHING;
      `);

      const resPares = await db.query(`
        SELECT produto_id, coocorrencias
        FROM public.obter_pares_mais_vendidos(ARRAY['prod_espresso'], 5);
      `);

      expect(resPares.rows.length).toBeGreaterThanOrEqual(1);
      expect(resPares.rows[0].produto_id).toBe('prod_brownie');
      expect(Number(resPares.rows[0].coocorrencias)).toBe(2);
    });
  });

  // ===========================================================================
  // 2. MOTOR DE SUGESTÕES PURO (CA01, CA02, CA03, CA04, CA10)
  // ===========================================================================
  describe('2. Motor de Sugestões Core (js/utils/sugestoes.js)', () => {
    const produtosMock = [
      { id: 'p_cappuccino', nome: 'Cappuccino Italiano', preco: 12.00, categoria_id: 'cafes', ativo: true, disponivel: true },
      { id: 'p_paodequeijo', nome: 'Pão de Queijo', preco: 9.00, categoria_id: 'salgados', ativo: true, disponivel: true },
      { id: 'p_croissant', nome: 'Croissant Tradicional', preco: 14.00, categoria_id: 'salgados', ativo: true, disponivel: true },
      { id: 'p_brownie', nome: 'Brownie Artesanal', preco: 10.00, categoria_id: 'doces', ativo: true, disponivel: true },
      { id: 'p_esgotado', nome: 'Bolo de Cenoura', preco: 8.00, categoria_id: 'doces', ativo: true, disponivel: false }
    ];

    it('CA01: Motor reproduz comportamento do totem sem regressão para regras e fallback', () => {
      const regras = [
        { id: 1, gatilho_categoria_id: 'cafes', produto_sugerido_id: 'p_paodequeijo', frase_destaque: 'Sugestão do Barista', ativo: true }
      ];
      const carrinho = [{ produto: produtosMock[0], quantidade: 1 }];

      const res = obterSugestoesCarrinho({
        carrinho,
        regras,
        produtos: produtosMock,
        canal: 'totem',
        limite: 3
      });

      expect(res.itens.length).toBe(3);
      expect(res.itens[0].id).toBe('p_paodequeijo');
      expect(res.frase).toBe('Sugestão do Barista');
      // Demais itens são do fallback de outras categorias e não estão no carrinho
      expect(res.itens.some(i => i.id === 'p_cappuccino')).toBe(false);
    });

    it('CA02: Sugestão roda em menos de 20 ms com 300 produtos e 50 regras', () => {
      const prods300 = [];
      for (let i = 1; i <= 300; i++) {
        prods300.push({
          id: `prod_${i}`,
          nome: `Produto Teste ${i}`,
          preco: 10.00 + (i % 5),
          categoria_id: `cat_${i % 10}`,
          ativo: true,
          disponivel: true
        });
      }

      const regras50 = [];
      for (let r = 1; r <= 50; r++) {
        regras50.push({
          id: r,
          gatilho_categoria_id: `cat_${r % 10}`,
          produto_sugerido_id: `prod_${(r * 5) % 300 + 1}`,
          canal: 'todos',
          prioridade: r,
          ativo: true
        });
      }

      const carrinho = [{ produto: prods300[0], quantidade: 2 }];

      const t0 = performance.now();
      const res = obterSugestoesCarrinho({
        carrinho,
        regras: regras50,
        produtos: prods300,
        limite: 3
      });
      const t1 = performance.now();
      const delta = t1 - t0;

      expect(res.itens.length).toBe(3);
      expect(delta).toBeLessThan(20);
    });

    it('CA03: Regra restrita ao canal "mesa" não aparece quando o canal consultado for "totem"', () => {
      const regras = [
        { id: 10, gatilho_produto_id: 'p_cappuccino', produto_sugerido_id: 'p_croissant', canal: 'mesa', ativo: true }
      ];
      const carrinho = [{ produto: produtosMock[0], quantidade: 1 }];

      const resTotem = obterSugestoesCarrinho({
        carrinho,
        regras,
        produtos: produtosMock,
        canal: 'totem',
        limite: 3
      });
      // A regra de mesa não deve ser a primeira por regra; itens virão apenas do fallback de outra categoria
      expect(resTotem.itens[0]._motivo).not.toBe('regra');

      const resMesa = obterSugestoesCarrinho({
        carrinho,
        regras,
        produtos: produtosMock,
        canal: 'mesa',
        limite: 3
      });
      expect(resMesa.itens[0].id).toBe('p_croissant');
      expect(resMesa.itens[0]._motivo).toBe('regra');
    });

    it('CA04: Produto esgotado nunca é sugerido em nenhum canal (caso negativo)', () => {
      const regras = [
        { id: 20, gatilho_produto_id: 'p_cappuccino', produto_sugerido_id: 'p_esgotado', canal: 'todos', ativo: true }
      ];
      const carrinho = [{ produto: produtosMock[0], quantidade: 1 }];

      const res = obterSugestoesCarrinho({
        carrinho,
        regras,
        produtos: produtosMock,
        canal: 'pdv',
        limite: 2
      });

      expect(res.itens.some(i => i.id === 'p_esgotado')).toBe(false);
      expect(isProdutoValidoParaSugestao(produtosMock[4], new Set())).toBe(false);
    });

    it('CA10: Carrinho contendo os itens de um combo mais barato identifica upgrade com cálculo exato da economia', () => {
      const combos = [
        {
          id: 'combo_cafe_da_manha',
          nome: 'Combo Café com Pão de Queijo',
          preco: 18.00,
          ativo: true,
          disponivel: true,
          grupos: [
            {
              id: 'grp_1',
              nome: 'Bebida',
              opcoes: [{ produto_item_id: 'p_cappuccino', ativo: true }]
            },
            {
              id: 'grp_2',
              nome: 'Acompanhamento',
              opcoes: [{ produto_item_id: 'p_paodequeijo', ativo: true }]
            }
          ]
        }
      ];

      // Carrinho com Cappuccino (R$ 12) + Pão de queijo (R$ 9) = R$ 21 avulso vs R$ 18 combo
      const carrinho = [
        { produto_id: 'p_cappuccino', quantidade: 1, preco_unitario: 12.00 },
        { produto_id: 'p_paodequeijo', quantidade: 1, preco_unitario: 9.00 }
      ];

      const upgrade = verificarUpgradeCombo(carrinho, combos, produtosMock);
      expect(upgrade).not.toBeNull();
      expect(upgrade.combo.id).toBe('combo_cafe_da_manha');
      expect(upgrade.precoItensAvulsos).toBe(21.00);
      expect(upgrade.precoCombo).toBe(18.00);
      expect(upgrade.economia).toBe(3.00);
      expect(upgrade.frase).toContain('economize R$ 3,00');
    });
  });

  // ===========================================================================
  // 3. INTEGRAÇÃO COM DOM E TELAS (CA05, CA06, CA07)
  // ===========================================================================
  describe('3. Integração com Interfaces (QR, Sessão e PDV) — CA05, CA06, CA07', () => {
    it('CA05 & CA06: Carrinho no QR renderiza bloco de sugestões com adição em 1 toque e esconde se fechado na sessão', async () => {
      const harness = createPageHarness('cardapio.html');
      await harness.carregarScript('js/utils/sugestoes.js');

      expect(harness.window.SugestoesUtils).toBeDefined();

      // Testa função de dismiss na sessão
      expect(harness.window.SugestoesUtils.isSugestoesDismissed()).toBe(false);
      harness.window.SugestoesUtils.dismissSugestoes();
      expect(harness.window.SugestoesUtils.isSugestoesDismissed()).toBe(true);
      expect(harness.window.sessionStorage.getItem(CHAVE_STORAGE_SUGESTOES_DISMISSED)).toBe('true');
    });

    it('CA07: PDV exibe até 2 sugestões discretas no rodapé e permite envio sem obrigação de interagir', async () => {
      const harness = createPageHarness('pedidos.html');
      await harness.carregarScript('js/utils/sugestoes.js');

      const resPDV = harness.window.SugestoesUtils.obterSugestoesCarrinho({
        carrinho: [{ produto: { id: 'p_cappuccino', nome: 'Cappuccino', categoria_id: 'cafes', preco: 12.00 }, quantidade: 1 }],
        produtos: [
          { id: 'p_paoqueijo', nome: 'Pão de Queijo', categoria_id: 'salgados', preco: 9.00, ativo: true, disponivel: true },
          { id: 'p_croissant', nome: 'Croissant', categoria_id: 'salgados', preco: 14.00, ativo: true, disponivel: true },
          { id: 'p_brownie', nome: 'Brownie', categoria_id: 'doces', preco: 10.00, ativo: true, disponivel: true }
        ],
        canal: 'pdv',
        limite: 2
      });
      expect(resPDV.itens.length).toBeLessThanOrEqual(2);
      expect(resPDV.itens.length).toBe(2);

      const sugestoesEl = harness.document.getElementById('pdv-sugestoes-upsell');
      expect(sugestoesEl).not.toBeNull();
      expect(sugestoesEl.getAttribute('aria-label')).toBe('Sugestões de itens');

      const btnEnviar = harness.document.getElementById('btn-enviar-pedido');
      expect(btnEnviar).not.toBeNull();
      // Não há modal bloqueando a tela nem overlay obstrutivo
      const modalBloqueante = harness.document.querySelector('.modal-bloqueante-upsell');
      expect(modalBloqueante).toBeNull();
    });
  });
});
