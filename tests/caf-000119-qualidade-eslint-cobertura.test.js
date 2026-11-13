import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { ESLint } from 'eslint';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import { setupAuthMock } from './helpers/pedidos-page.js';
import {
  gerarMarkdownResumoCobertura,
  verificarArquivosSemCobertura
} from '../scripts/coverage-summary-md.mjs';

/**
 * CAF-000119: Qualidade Contínua — ESLint, Cobertura Real nas Telas e Pisos no CI
 */
describe('CAF-000119: ESLint, Cobertura Real das Telas e Pisos no CI', () => {
  const intervalIds = [];
  const origSetInterval = globalThis.setInterval;

  function rastrearTimers() {
    globalThis.setInterval = (...args) => {
      const id = origSetInterval(...args);
      intervalIds.push(id);
      return id;
    };
  }

  afterEach(() => {
    while (intervalIds.length > 0) {
      clearInterval(intervalIds.pop());
    }
    globalThis.setInterval = origSetInterval;
    vi.restoreAllMocks();
  });

  describe('1. Análise Estática com ESLint e Gate no CI (CA01, CA02 / RF01, RF02)', () => {
    it('CA01 (CT01): ESLint executa em js/ com 0 erros bloqueantes', async () => {
      const eslint = new ESLint({ cwd: process.cwd() });
      const results = await eslint.lintFiles(['js/']);
      const totalErrors = results.reduce((acc, r) => acc + r.errorCount, 0);

      expect(results.length).toBeGreaterThan(30);
      expect(totalErrors).toBe(0);
    }, 25000);

    it('CA02 (CT02): ESLint detecta variável não declarada (no-undef) e redeclaração (no-redeclare)', async () => {
      const eslint = new ESLint({ cwd: process.cwd() });

      const [undefRes] = await eslint.lintText(
        'function testar() { return variavelNaoDeclaradaTesteXYZ + 1; }\ntestar();\n',
        { filePath: path.resolve(process.cwd(), 'js/fixture-undef.js') }
      );
      expect(undefRes.errorCount).toBeGreaterThanOrEqual(1);
      expect(undefRes.messages.some(m => m.ruleId === 'no-undef')).toBe(true);

      const [redeclRes] = await eslint.lintText(
        'var duplicada = 1;\nvar duplicada = 2;\n',
        { filePath: path.resolve(process.cwd(), 'js/fixture-redeclare.js') }
      );
      expect(redeclRes.errorCount).toBeGreaterThanOrEqual(1);
      expect(redeclRes.messages.some(m => m.ruleId === 'no-redeclare')).toBe(true);
    });

    it('CA02 / CA05: deploy.yml configura npm run lint antes dos testes e npm run test:coverage com resumo', () => {
      const yml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf-8');
      const idxLint = yml.indexOf('npm run lint');
      const idxCov = yml.indexOf('npm run test:coverage');
      const idxSummary = yml.indexOf('scripts/coverage-summary-md.mjs');

      expect(idxLint).toBeGreaterThan(-1);
      expect(idxCov).toBeGreaterThan(idxLint);
      expect(idxSummary).toBeGreaterThan(idxCov);
    });
  });

  describe('2. Cobertura Real do Painel Admin e Regressão dos Bugs (CA03 / RF03, RF06)', () => {
    it('CA03 (CT03): admin.html carrega módulos reais, abre aba Clientes e exercita abas/fluxos corrigidos', async () => {
      rastrearTimers();

      const mockData = {
        categorias: [{ id: 1, nome: 'Cafés', ordem: 1, ativo: true }],
        produtos: [{ id: 10, nome: 'Espresso', categoria_id: 1, preco: 8.5, ativo: true, tipo_montagem: 'padrao' }],
        adicionais: [{ id: 1, nome: 'Chantilly', preco: 3, ativo: true }],
        clientes: [{ id: 1, nome: 'Maria Teatro', telefone: '11999998888', email: 'maria@teatro.com', ativo: true, aceita_contato: true, saldo_atual: 0, cashback_saldo: 12 }],
        v_clientes_rfv: [{
          cliente_id: 1,
          total_pedidos: 4,
          pedidos_90d: 3,
          total_gasto: 120,
          ultima_compra: '2026-11-10T15:00:00Z',
          primeira_compra: '2026-08-01T15:00:00Z',
          segmento: 'Ativo'
        }],
        cliente_tags: [{ id: 1, nome: 'VIP', cor: '#8b0000' }],
        cliente_tag_vinculos: [{ cliente_id: 1, tag_id: 1 }],
        pedidos: [{
          id: 500,
          numero_pedido: 500,
          mesa_codigo: 'M01',
          status: 'concluido',
          forma_pagamento: 'pix',
          total: 25,
          created_at: '2026-11-12T18:00:00Z',
          pedido_itens: []
        }],
        mesas: [{ id: 1, codigo: 'M01', nome: 'Mesa 01', ativa: true }],
        promocoes: [{ id: 1, nome: 'Combo Tarde', tipo: 'percentual', percentual: 10, ativo: true }],
        perfis: [{ id: 'admin-1', nome: 'Natanael', email: 'admin@teatro.com', role: 'admin', ativo: true }],
        cargos: [{ id: 1, nome: 'Administrador', permissoes: ['admin.relatorios'], sistema: true }],
        avaliacoes: [{ id: 1, nota_produto: 5, nota_atendimento: 5, comentario: 'Excelente', created_at: '2026-11-12T18:00:00Z' }],
        avaliacao_itens: [],
        estoque_itens: [{ id: 1, nome: 'Café em Grão', unidade: 'kg', quantidade_atual: 10, estoque_minimo: 2 }],
        fornecedores: [{ id: 1, nome: 'Torrefação SP' }],
        configuracoes_sistema: [
          { chave: 'pix_chave', valor: '00000000000' },
          { chave: 'totem_animacao_ativa', valor: 'true' }
        ]
      };

      const rpcHandlers = {
        get_caixa_atual: () => ({ data: { id: 'cx-1', status: 'aberto', valor_abertura: 100 }, error: null }),
        get_totais_caixa: () => ({ data: { total_vendas: 150, total_dinheiro: 50, total_suprimentos: 0, total_sangrias: 0 }, error: null }),
        get_historico_caixas: () => ({ data: [{ id: 'cx-0', status: 'fechado', data_abertura: '2026-11-11T08:00:00Z', data_fechamento: '2026-11-11T20:00:00Z', valor_abertura: 100, valor_fechamento: 250 }], error: null }),
        reabrir_caixa: () => ({ data: { success: true }, error: null }),
        get_admin_reports: () => ({
          data: {
            resumo: { total_vendas: 1200, qtd_pedidos: 40, ticket_medio: 30 },
            por_hora: [],
            por_dia_semana: [],
            por_pagamento: [],
            top_produtos: []
          },
          error: null
        }),
        obter_dre_gerencial: () => ({ data: { receita_bruta: 1000, lucro_liquido: 400 }, error: null }),
        obter_previsao_recebiveis: () => ({ data: [], error: null }),
        obter_meta_progresso_dia: () => ({ data: { meta_valor: 1000, vendido_valor: 500 }, error: null }),
        obter_resumo_erros_cliente: () => ({ data: { total_erros: 0, telas_afetadas: 0, grupos: [] }, error: null }),
        get_minhas_permissoes: () => ({
          data: ['admin.relatorios', 'admin.clientes', 'admin.estoque', 'admin.cardapio', 'admin.usuarios', 'admin.configuracoes', 'caixa.abrir_fechar', 'admin.financeiro', 'pdv.vender'],
          error: null
        })
      };

      const mockSupabase = setupAuthMock(
        createSupabaseMock(mockData, { rpcHandlers }),
        { id: 'admin-1', email: 'admin@teatro.com', role: 'admin', is_admin: true }
      );

      const harness = createPageHarness('admin.html', { supabase: mockSupabase });

      try {
        await harness.carregarScriptsDaPagina((src) => !src.includes('utils/error-reporter.js'));
        await harness.aguardarRender(80);

        // Garante sessão admin ativa para navegação completa das abas
        harness.window.cafeteriaAdmin.session = {
          isLoggedIn: true,
          isAdmin: true,
          user: { id: 'admin-1', email: 'admin@teatro.com', role: 'admin', is_admin: true }
        };

        await harness.window.cafeteriaAdmin.loadData();
        await harness.aguardarRender(50);

        // Exercita aba Clientes (CA03) e valida tabela preenchida
        harness.window.cafeteriaAdmin.navigateTo('clientes');
        await harness.aguardarRender(80);
        const tbodyClientes = harness.document.getElementById('tbody-clientes');
        expect(tbodyClientes).toBeTruthy();
        expect(tbodyClientes.textContent).toContain('Maria Teatro');

        // Exercita as demais abas reais do Admin
        const abas = [
          'produtos',
          'categorias',
          'adicionais',
          'pedidos',
          'mesas',
          'usuarios',
          'hero',
          'horarios',
          'conteudo',
          'menu-pdf',
          'avaliacoes',
          'estoque',
          'caixa',
          'financeiro',
          'erros'
        ];
        for (const aba of abas) {
          harness.window.cafeteriaAdmin.navigateTo(aba);
        }

        // Aciona Promoções e Relatórios (listeners registrados via DOMContentLoaded)
        harness.clicar('#nav-promocoes');
        harness.clicar('#nav-relatorios');
        harness.clicar('#btn-gerar-relatorio');
        await harness.aguardarRender(60);

        // Regressão CAF-000119: reabrirCaixaAdmin não pode falhar com initCaixa is not defined
        harness.window.cafeteriaAdmin.prompt = vi.fn().mockResolvedValue('Conferência de caixa no turno');
        await expect(harness.window.reabrirCaixaAdmin('cx-0')).resolves.toBeUndefined();
      } finally {
        harness.cleanup();
      }
    }, 15000);
  });

  describe('3. Testes de Fumaça das Telas Públicas Reais no Harness (RF06 / CA06)', () => {
    it('RF06: index.html carrega scripts reais e responde a interações da interface', async () => {
      rastrearTimers();
      const harness = createPageHarness('index.html', {
        initialData: {
          produtos: [{ id: 1, nome: 'Cappuccino', preco: 14, categoria_id: 1, ativo: true, destaque: true }],
          categorias: [{ id: 1, nome: 'Bebidas Quentes', ordem: 1, ativo: true }],
          promocoes: [{ id: 1, titulo: 'Semana do Café', ativa: true }],
          configuracoes_sistema: [{ chave: 'sobre_texto', valor: 'Cafeteria Histórica' }]
        }
      });

      try {
        await harness.carregarScriptsDaPagina();
        await harness.aguardarRender(60);

        harness.clicar('#carousel-next');
        harness.clicar('#hamburger');
        expect(harness.loadedScripts).toContain('js/home-dynamic.js');
        expect(harness.loadedScripts).toContain('js/hero-carousel.js');
        expect(harness.loadedScripts).toContain('js/main.js');
        expect(harness.loadedScripts).toContain('js/analytics.js');
      } finally {
        harness.cleanup();
      }
    });

    it('RF06: cardapio.html carrega scripts reais com catálogo e flipbook protegidos', async () => {
      rastrearTimers();
      const harness = createPageHarness('cardapio.html', {
        initialData: {
          categorias: [{ id: 1, nome: 'Cafés', ordem: 1, ativo: true }],
          produtos: [{ id: 1, nome: 'Latte', preco: 12, categoria_id: 1, ativo: true }],
          promocoes: [{ id: 1, nome: 'Latte em Dobro', tipo: 'percentual', percentual: 10, ativo: true, dias_semana: [0, 1, 2, 3, 4, 5, 6] }],
          promocao_itens: [],
          configuracoes_sistema: []
        }
      });

      try {
        await harness.carregarScriptsDaPagina();
        await harness.aguardarRender(60);

        expect(harness.loadedScripts).toContain('js/cardapio-init.js');
        expect(harness.loadedScripts).toContain('js/cardapio-dynamic.js');
        expect(harness.loadedScripts).toContain('js/cardapio.js');
        expect(harness.loadedScripts).toContain('js/cardapio-pdf-viewer.js');
      } finally {
        harness.cleanup();
      }
    });

    it('RF06: retirada.html carrega script real e exibe senha pronta da view v_painel_retirada', async () => {
      rastrearTimers();
      const harness = createPageHarness('retirada.html', {
        initialData: {
          v_painel_retirada: [{
            id: 42,
            numero_pedido: 42,
            primeiro_nome: 'Ana',
            status: 'concluido',
            pronto_em: new Date().toISOString()
          }]
        }
      });

      try {
        await harness.carregarScriptsDaPagina();
        await harness.aguardarRender(60);

        const gridPronto = harness.document.getElementById('grid-pronto');
        expect(gridPronto).toBeTruthy();
        expect(gridPronto.textContent).toContain('#42');
        expect(gridPronto.textContent).toContain('Ana');
      } finally {
        harness.cleanup();
      }
    });

    it('RF06: avaliar.html carrega script real e exibe aviso amigável sem token válido', async () => {
      rastrearTimers();
      const harness = createPageHarness('avaliar.html', {
        rpcHandlers: {
          consultar_pedido_avaliacao: () => ({ data: { encontrado: false }, error: null })
        }
      });

      try {
        harness.window.history.replaceState({}, '', '/avaliar.html');
        await harness.carregarScriptsDaPagina();
        await harness.aguardarRender(50);

        const msgBox = harness.document.getElementById('state-message');
        expect(msgBox).toBeTruthy();
        expect(msgBox.classList.contains('hidden')).toBe(false);
      } finally {
        harness.cleanup();
      }
    });

    it('RF06: 404.html carrega 404-init.js real, preenche ano atual e alterna menu mobile', async () => {
      rastrearTimers();
      const harness = createPageHarness('404.html');

      try {
        await harness.carregarScriptsDaPagina((src) => !src.includes('curtain.js'));
        await harness.aguardarRender(30);

        const yearEl = harness.document.getElementById('current-year');
        expect(yearEl.textContent).toBe(String(new Date().getFullYear()));

        harness.clicar('#hamburger');
        expect(harness.document.getElementById('mobile-menu').classList.contains('active')).toBe(true);
      } finally {
        harness.cleanup();
      }
    });
  });

  describe('4. Pisos de Cobertura e Resumo para CI (CA04, CA05, CA06 / RF04, RF05)', () => {
    it('CA04: vitest.config.js define limites mínimos para js/utils/**, js/admin/** e js/*.js', () => {
      const vitestCfg = fs.readFileSync(path.resolve(process.cwd(), 'vitest.config.js'), 'utf-8');
      expect(vitestCfg).toContain("'js/utils/**'");
      expect(vitestCfg).toContain("'js/admin/**'");
      expect(vitestCfg).toContain("'js/*.js'");
    });

    it('CA05 / CA06 (CT04 / CT05): coverage-summary-md.mjs gera resumo Markdown e falha se algum arquivo tiver 0%', () => {
      const sampleSummary = {
        total: {
          lines: { total: 200, covered: 120, pct: 60 },
          statements: { total: 200, covered: 120, pct: 60 },
          functions: { total: 50, covered: 30, pct: 60 },
          branches: { total: 40, covered: 20, pct: 50 }
        },
        '/repo/js/utils/cashback.js': {
          lines: { total: 100, covered: 90, pct: 90 },
          statements: { total: 100, covered: 90, pct: 90 },
          functions: { total: 20, covered: 20, pct: 100 },
          branches: { total: 20, covered: 15, pct: 75 }
        },
        '/repo/js/admin/clientes-admin.js': {
          lines: { total: 100, covered: 30, pct: 30 },
          statements: { total: 100, covered: 30, pct: 30 },
          functions: { total: 30, covered: 10, pct: 33.33 },
          branches: { total: 20, covered: 5, pct: 25 }
        }
      };

      expect(verificarArquivosSemCobertura(sampleSummary)).toEqual([]);
      const mdOk = gerarMarkdownResumoCobertura(sampleSummary);
      expect(mdOk).toContain('Resumo de Cobertura de Testes');
      expect(mdOk).toContain('60.00%');
      expect(mdOk).toContain('Nenhum arquivo de `js/`');

      const brokenSummary = {
        ...sampleSummary,
        '/repo/js/retirada.js': {
          lines: { total: 100, covered: 0, pct: 0 },
          statements: { total: 100, covered: 0, pct: 0 },
          functions: { total: 10, covered: 0, pct: 0 },
          branches: { total: 10, covered: 0, pct: 0 }
        }
      };

      const zerados = verificarArquivosSemCobertura(brokenSummary);
      expect(zerados).toEqual([{ arquivo: 'js/retirada.js', linesPct: 0, totalLines: 100 }]);

      // Testa CLI real com fixture zerado garantindo código de saída != 0
      const tmpJson = path.join('/tmp', `cov-test-${Date.now()}.json`);
      fs.writeFileSync(tmpJson, JSON.stringify(brokenSummary));
      try {
        let exitCode = 0;
        try {
          execFileSync(process.execPath, ['scripts/coverage-summary-md.mjs', '--input', tmpJson], {
            cwd: process.cwd(),
            stdio: 'pipe'
          });
        } catch (err) {
          exitCode = err.status;
        }
        expect(exitCode).toBe(1);
      } finally {
        if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
      }
    });

    it('CA03 / CA06 (CT05): quando coverage/coverage-summary.json existe, nenhum arquivo de js/ tem 0% e clientes-admin.js > 0%', () => {
      const summaryPath = path.resolve(process.cwd(), 'coverage/coverage-summary.json');
      if (!fs.existsSync(summaryPath)) {
        return;
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      const zerados = verificarArquivosSemCobertura(summary);
      expect(zerados).toEqual([]);

      const entryClientes = Object.entries(summary).find(([k]) =>
        k.replace(/\\/g, '/').endsWith('/js/admin/clientes-admin.js')
      );
      expect(entryClientes).toBeDefined();
      expect(entryClientes[1].lines.pct).toBeGreaterThan(0);
    });
  });
});
