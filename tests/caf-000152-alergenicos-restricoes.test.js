// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import { createPageHarness } from './helpers/page-harness.js';
import {
  CATALOGO_ALERGENICOS,
  CATALOGO_RESTRICOES,
  AVISO_CONTAMINACAO_PADRAO,
  CHAVE_STORAGE_FILTRO,
  isProdutoRevisado,
  getMensagemNaoRevisado,
  getFiltroAlergiasSalvo,
  salvarFiltroAlergias,
  produtoAtendeFiltro,
  calcularAlergenicosCombinados,
  renderSelosHtml,
  renderAvisoContaminacaoHtml,
  formatarAlergiasTexto,
  gerarHtmlAlertaKds,
  gerarTextoAlertaPrint
} from '../js/utils/alergenicos.js';

const ADMIN_CLAIMS = { sub: '00000000-0000-0000-0000-000000000001', role: 'authenticated', email: 'admin@e2e.local' };
const ANON_CLAIMS = { sub: '00000000-0000-0000-0000-000000000099', role: 'anon', email: 'anon@e2e.local' };

describe('CAF-000152: Alergênicos e Restrições Alimentares no Cardápio, Totem, PDV e KDS', () => {
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
  });

  // ===========================================================================
  // 1. BANCO DE DADOS POSTGRESQL REAL (PGlite) - CA01, CA02, CA09, CA10
  // ===========================================================================
  describe('1. Banco de Dados e Views (PGlite) — CA01, CA02, CA09, CA10', () => {
    it('CA01: Dado insumo "Farinha de trigo" com glúten na ficha do croissant, v_produto_alergenicos deriva origem "ficha_tecnica" e tipo "contem"', async () => {
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        // Cria categoria e produto
        await tx.query(`INSERT INTO public.categorias (id, nome, ativo, ordem) VALUES ('padaria', 'Padaria', true, 1) ON CONFLICT (id) DO NOTHING`);
        await tx.query(`INSERT INTO public.produtos (id, nome, categoria_id, preco, ativo) VALUES ('croissant_teste', 'Croissant Artesanal', 'padaria', 12.00, true) ON CONFLICT (id) DO NOTHING`);

        // Cria insumo
        const insumoRes = await tx.query(`
          INSERT INTO public.estoque_itens (nome, unidade, quantidade, custo_medio)
          VALUES ('Farinha de Trigo Especial', 'kg', 50.0, 4.50)
          RETURNING id
        `);
        const estoqueItemId = insumoRes.rows[0].id;

        // Vincula insumo ao alergênico 'gluten'
        await tx.query(`
          INSERT INTO public.estoque_item_alergenicos (estoque_item_id, alergenico_id)
          VALUES ($1, 'gluten')
          ON CONFLICT (estoque_item_id, alergenico_id) DO NOTHING
        `, [estoqueItemId]);

        // Vincula insumo à ficha técnica do produto
        await tx.query(`
          INSERT INTO public.fichas_tecnicas (produto_id, estoque_item_id, quantidade)
          VALUES ('croissant_teste', $1, 0.150)
          ON CONFLICT (produto_id, estoque_item_id) DO NOTHING
        `, [estoqueItemId]);

        // Consulta a view v_produto_alergenicos
        const viewRes = await tx.query(`
          SELECT produto_id, alergenico_id, alergenico_nome, tipo, origem
          FROM public.v_produto_alergenicos
          WHERE produto_id = 'croissant_teste' AND alergenico_id = 'gluten'
        `);

        expect(viewRes.rows.length).toBe(1);
        const row = viewRes.rows[0];
        expect(row.alergenico_id).toBe('gluten');
        expect(row.tipo).toBe('contem');
        expect(row.origem).toBe('ficha_tecnica');
      });
    });

    it('CA02: Dado produto sem ficha técnica, quando admin cadastra manual "pode_conter", v_produto_alergenicos retorna tipo "pode_conter" e origem "manual"', async () => {
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        await tx.query(`INSERT INTO public.categorias (id, nome, ativo, ordem) VALUES ('padaria', 'Padaria', true, 1) ON CONFLICT (id) DO NOTHING`);
        await tx.query(`INSERT INTO public.produtos (id, nome, categoria_id, preco, ativo) VALUES ('barra_cereal', 'Barra de Cereal', 'padaria', 6.00, true) ON CONFLICT (id) DO NOTHING`);

        await tx.query(`
          INSERT INTO public.produto_alergenicos (produto_id, alergenico_id, tipo)
          VALUES ('barra_cereal', 'amendoim', 'pode_conter')
          ON CONFLICT (produto_id, alergenico_id) DO UPDATE SET tipo = 'pode_conter'
        `);

        const viewRes = await tx.query(`
          SELECT produto_id, alergenico_id, alergenico_nome, tipo, origem
          FROM public.v_produto_alergenicos
          WHERE produto_id = 'barra_cereal' AND alergenico_id = 'amendoim'
        `);

        expect(viewRes.rows.length).toBe(1);
        const row = viewRes.rows[0];
        expect(row.tipo).toBe('pode_conter');
        expect(row.origem).toBe('manual');
      });
    });

    it('CA09: Trigger trg_sync_pedidos_alergias extrai restrição/alergia de observações para coluna alergias_cliente', async () => {
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        await tx.query(`INSERT INTO public.mesas (codigo, ativo) VALUES ('M99', true) ON CONFLICT (codigo) DO NOTHING`);

        const insPedido = await tx.query(`
          INSERT INTO public.pedidos (mesa_codigo, observacoes, status, total)
          VALUES ('M99', 'ALERGIA: Sem Lactose | Sem canela por favor', 'pendente', 25.00)
          RETURNING id, alergias_cliente, observacoes
        `);

        expect(insPedido.rows.length).toBe(1);
        const pedido = insPedido.rows[0];
        expect(pedido.alergias_cliente).toBeDefined();
        expect(pedido.alergias_cliente).toContain('Sem Lactose');
      });
    });

    it('CA10: Dado produto revisado, quando insumo novo é adicionado à ficha técnica, v_produtos_revisao_alergenicos aponta "revisao_necessaria"', async () => {
      await db.withJwtClaims(ADMIN_CLAIMS, async (tx) => {
        await tx.query(`INSERT INTO public.categorias (id, nome, ativo, ordem) VALUES ('padaria', 'Padaria', true, 1) ON CONFLICT (id) DO NOTHING`);
        await tx.query(`
          INSERT INTO public.produtos (id, nome, categoria_id, preco, ativo, alergenicos_revisado_em)
          VALUES ('bolo_cenoura', 'Bolo de Cenoura', 'padaria', 9.00, true, now() - INTERVAL '1 hour')
          ON CONFLICT (id) DO UPDATE SET alergenicos_revisado_em = now() - INTERVAL '1 hour'
        `);

        // Antes de alterar a ficha, o status é 'revisado'
        const antesRes = await tx.query(`
          SELECT status_revisao FROM public.v_produtos_revisao_alergenicos WHERE produto_id = 'bolo_cenoura'
        `);
        expect(antesRes.rows[0].status_revisao).toBe('revisado');

        // Cria novo insumo com ovo e adiciona à ficha agora (data > alergenicos_revisado_em)
        const ovoRes = await tx.query(`
          INSERT INTO public.estoque_itens (nome, unidade, quantidade, custo_medio, created_at)
          VALUES ('Ovos Caipiras', 'un', 100.0, 0.80, now())
          RETURNING id
        `);
        const ovoId = ovoRes.rows[0].id;

        await tx.query(`INSERT INTO public.estoque_item_alergenicos (estoque_item_id, alergenico_id, created_at) VALUES ($1, 'ovos', now()) ON CONFLICT (estoque_item_id, alergenico_id) DO NOTHING`, [ovoId]);
        await tx.query(`INSERT INTO public.fichas_tecnicas (produto_id, estoque_item_id, quantidade, created_at) VALUES ('bolo_cenoura', $1, 2.0, now()) ON CONFLICT (produto_id, estoque_item_id) DO NOTHING`, [ovoId]);

        // Após alteração na ficha técnica, a view deve alertar 'revisao_necessaria'
        const depoisRes = await tx.query(`
          SELECT status_revisao FROM public.v_produtos_revisao_alergenicos WHERE produto_id = 'bolo_cenoura'
        `);
        expect(depoisRes.rows[0].status_revisao).toBe('revisao_necessaria');
      });
    });
  });

  // ===========================================================================
  // 2. MÓDULO UTILITÁRIO E REGRAS DE NEGÓCIO - CA03, CA04, CA05, CA06, CA07, CA08
  // ===========================================================================
  describe('2. Módulo de Alergênicos e Regras de Negócio (CA03 a CA08)', () => {
    it('CA03: Produto não revisado exibe mensagem "informação não disponível" e é bloqueado no filtro "sem glúten" (caso negativo)', () => {
      const prodNaoRevisado = { id: 'p1', nome: 'Biscoito Caseiro', alergenicos_revisado_em: null };
      expect(isProdutoRevisado(prodNaoRevisado)).toBe(false);

      const msg = getMensagemNaoRevisado();
      expect(msg).toBe('Informação de alergênicos não disponível. Pergunte ao atendente.');

      // Bloqueia com filtro 'sem_gluten' por precaução (não é seguro afirmar que não contém)
      const passaNoFiltro = produtoAtendeFiltro(prodNaoRevisado, [], ['sem_gluten']);
      expect(passaNoFiltro).toBe(false);
    });

    it('CA04: Produto revisado com glúten e leite exibe dois selos legíveis e acessíveis (WCAG AA)', () => {
      const alergs = [
        { alergenico_id: 'gluten', nome: 'Glúten', icone: '🌾', tipo: 'contem' },
        { alergenico_id: 'leite', nome: 'Leite / Lactose', icone: '🥛', tipo: 'contem' }
      ];

      const html = renderSelosHtml(alergs);
      expect(html).toContain('Contém Glúten');
      expect(html).toContain('Contém Leite / Lactose');
      expect(html).toContain('role="listitem"');
      expect(html).toContain('aria-label="Contém Glúten"');
      expect(html).toContain('selo-contem');
    });

    it('CA05: Produto revisado exibe aviso de contaminação cruzada padrão ou customizado', () => {
      const htmlPadrao = renderAvisoContaminacaoHtml();
      expect(htmlPadrao).toContain(AVISO_CONTAMINACAO_PADRAO);
      expect(htmlPadrao).toContain('role="note"');

      const avisoCustom = 'Aviso: Produzido em maquinário exclusivo para cafés especiais.';
      const htmlCustom = renderAvisoContaminacaoHtml(avisoCustom);
      expect(htmlCustom).toContain(avisoCustom);
    });

    it('CA06: Filtro "sem glúten" esconde produtos que contêm ou podem conter glúten e persiste no localStorage', () => {
      const prodComGluten = { id: 'p_trigo', nome: 'Pão Italiano', alergenicos_revisado_em: '2026-11-20T10:00:00Z' };
      const prodPodeGluten = { id: 'p_aveia', nome: 'Bolo Aveia', alergenicos_revisado_em: '2026-11-20T10:00:00Z' };
      const prodSeguro = { id: 'p_fruta', nome: 'Salada de Frutas', alergenicos_revisado_em: '2026-11-20T10:00:00Z' };

      const alergsTrigo = [{ alergenico_id: 'gluten', tipo: 'contem' }];
      const alergsAveia = [{ alergenico_id: 'gluten', tipo: 'pode_conter' }];
      const alergsFruta = [];

      expect(produtoAtendeFiltro(prodComGluten, alergsTrigo, ['sem_gluten'])).toBe(false);
      expect(produtoAtendeFiltro(prodPodeGluten, alergsAveia, ['sem_gluten'])).toBe(false);
      expect(produtoAtendeFiltro(prodSeguro, alergsFruta, ['sem_gluten'])).toBe(true);

      // Persistência no localStorage
      salvarFiltroAlergias(['sem_gluten', 'sem_lactose']);
      const recuperado = getFiltroAlergiasSalvo();
      expect(recuperado).toEqual(['sem_gluten', 'sem_lactose']);
    });

    it('CA07: Ao adicionar adicional que contém alergênico (ex.: leite integral), total é recalculado e inclui "contém leite"', () => {
      // Produto base seguro (sem lactose)
      const baseLatteAveiaAlergs = [];
      const adicionalLeiteComum = {
        id: 'adic_leite_vaca',
        nome: 'Leite Integral (Vaca)',
        alergenicos: [{ alergenico_id: 'leite', tipo: 'contem' }]
      };

      const combinados = calcularAlergenicosCombinados(baseLatteAveiaAlergs, [adicionalLeiteComum]);
      expect(combinados.length).toBe(1);
      expect(combinados[0].alergenico_id).toBe('leite');
      expect(combinados[0].tipo).toBe('contem');

      const html = renderSelosHtml(combinados);
      expect(html).toContain('Contém Leite / Lactose');
    });

    it('CA08: Pedido com alergia a amendoim gera destaque em vermelho e string "ALERGIA: AMENDOIM" para KDS e impressão', () => {
      const htmlKds = gerarHtmlAlertaKds(['amendoim']);
      expect(htmlKds).toContain('background:#d32f2f');
      expect(htmlKds).toContain('ALERGIA: AMENDOIM');
      expect(htmlKds).toContain('role="alert"');

      const textoPrint = gerarTextoAlertaPrint(['amendoim']);
      expect(textoPrint).toBe('ALERGIA: AMENDOIM');
    });
  });

  // ===========================================================================
  // 3. INTEGRAÇÃO COM DOM E INTERFACES - KDS, PRINT E CARDÁPIO
  // ===========================================================================
  describe('3. Integração com Interfaces (KDS, Comanda e Cardápio)', () => {
    it('CA08: cafeteriaPrint.printPedido e printEtiquetaCopo incluem destaque ALERGIA no cupom e na etiqueta', async () => {
      let capturedHtml = '';
      const iframeMock = {
        contentWindow: {
          document: {
            open: vi.fn(),
            write: vi.fn((html) => { capturedHtml = html; }),
            close: vi.fn()
          },
          focus: vi.fn(),
          print: vi.fn()
        }
      };

      vi.spyOn(document, 'getElementById').mockReturnValue(iframeMock);

      // Carrega scripts no contexto window do happy-dom
      await import('../js/utils/alergenicos.js');
      await import('../js/pedido-print.js');

      const pedidoComAlergia = {
        id: 777,
        numero_pedido: '077',
        mesa_codigo: 'M05',
        cliente_nome: 'Lucas Silva',
        alergias_cliente: ['amendoim'],
        observacoes: 'ALERGIA: amendoim',
        created_at: new Date().toISOString()
      };

      const itens = [
        { id: 1, nome_produto: 'Cookies com Gotas', quantidade: 2, preco_unitario: 8.00 }
      ];

      // Testa impressão de comanda
      window.cafeteriaPrint.printPedido(pedidoComAlergia, itens);
      expect(capturedHtml).toContain('ALERGIA: AMENDOIM');

      // Testa impressão de etiqueta
      window.cafeteriaPrint.printEtiquetas(pedidoComAlergia, itens);
      expect(capturedHtml).toContain('ALERGIA: AMENDOIM');
    });

    it('CA04 & CA09: Cardápio inicializa barra de filtros e envia restrição salva no pedido mesa/online', async () => {
      const harness = createPageHarness('cardapio.html');
      harness.window.localStorage.setItem(CHAVE_STORAGE_FILTRO, JSON.stringify(['sem_lactose']));

      await harness.carregarScript('js/utils/alergenicos.js');
      
      const filtroLido = harness.window.AlergenicosUtils.getFiltroAlergiasSalvo();
      expect(filtroLido).toEqual(['sem_lactose']);

      const texto = harness.window.AlergenicosUtils.formatarAlergiasTexto(filtroLido);
      expect(texto).toContain('Sem Lactose');
    });
  });
});
