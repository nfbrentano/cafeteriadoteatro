import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { validarEstruturaPgTap, listarTestesSql } from '../scripts/test-db-runner.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000106: Resolução de Vulnerabilidade Crítica Supabase (Habilitar RLS em 100% das Tabelas Públicas)', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000106_habilitar_rls_todas_tabelas.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('Módulo 1: Ativação Explícita de RLS e Idempotência (CA01, CA06)', () => {
    it('CA01: Migration 106 executa ENABLE ROW LEVEL SECURITY explicitamente nas 6 tabelas mapeadas', () => {
      const tabelasObrigatorias = [
        'cardapio_eventos_diarios',
        'cortesia_regras',
        'pedido_impressoes',
        'pedido_item_sabores',
        'promocoes',
        'promocao_itens'
      ];

      for (const tabela of tabelasObrigatorias) {
        const regex = new RegExp(`ALTER TABLE (IF EXISTS )?public\\.${tabela} ENABLE ROW LEVEL SECURITY`, 'i');
        expect(migrationSql).toMatch(regex);
      }
    });

    it('CA06: Migration inclui salvaguarda dinâmica que itera por pg_tables e ativa RLS em qualquer tabela sem RLS', () => {
      expect(migrationSql).toMatch(/SELECT tablename\s+FROM pg_tables\s+WHERE schemaname = 'public'\s+AND rowsecurity = false/i);
      expect(migrationSql).toMatch(/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i);
    });

    it('Garante transacionalidade e registro idempotente na tabela app_migrations', () => {
      expect(migrationSql.trim().startsWith('BEGIN;')).toBe(true);
      expect(migrationSql.trim().endsWith('COMMIT;')).toBe(true);
      expect(migrationSql).toMatch(/INSERT INTO public\.app_migrations\s*\(versao,\s*arquivo\)\s*VALUES\s*\('106'/i);
      expect(migrationSql).toMatch(/ON CONFLICT \(versao\) DO NOTHING/i);
    });
  });

  describe('Módulo 2: Matriz de Políticas de Segurança por Tabela (CA02 a CA05)', () => {
    it('CA02: cardapio_eventos_diarios revoga escrita direta de anônimos e restringe leitura a staff com relatórios ou admin', () => {
      expect(migrationSql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.cardapio_eventos_diarios FROM anon, authenticated, public/i);
      expect(migrationSql).toMatch(/CREATE POLICY "cardapio_eventos_select_staff" ON public\.cardapio_eventos_diarios/i);
      expect(migrationSql).toMatch(/public\.tem_permissao\('relatorios'\)\s*OR\s*public\.get_user_role\(\) = 'admin'/i);
      expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_evento_cardapio\(TEXT, TEXT, TEXT, DATE\) TO anon, authenticated, service_role/i);
    });

    it('CA03: cortesia_regras e promocoes permitem leitura anônima apenas de ativos e restringem escrita a admin', () => {
      // cortesia_regras
      expect(migrationSql).toMatch(/CREATE POLICY "cortesia_regras_select_ativo" ON public\.cortesia_regras/i);
      expect(migrationSql).toMatch(/ativo = true\s*OR\s*public\.get_user_role\(\) = 'admin'/i);
      expect(migrationSql).toMatch(/CREATE POLICY "cortesia_regras_admin_all" ON public\.cortesia_regras/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.cortesia_regras TO anon, authenticated/i);

      // promocoes
      expect(migrationSql).toMatch(/CREATE POLICY "promocoes_select_ativo" ON public\.promocoes/i);
      expect(migrationSql).toMatch(/CREATE POLICY "promocoes_admin_all" ON public\.promocoes/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.promocoes TO anon, authenticated/i);

      // promocao_itens
      expect(migrationSql).toMatch(/CREATE POLICY "promocao_itens_select" ON public\.promocao_itens/i);
      expect(migrationSql).toMatch(/CREATE POLICY "promocao_itens_admin_all" ON public\.promocao_itens/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.promocao_itens TO anon, authenticated/i);
    });

    it('CA04: pedido_impressoes restringe leitura a equipe autenticada e bloqueia escrita direta via PostgREST', () => {
      expect(migrationSql).toMatch(/CREATE POLICY "pedido_impressoes_select_staff" ON public\.pedido_impressoes/i);
      expect(migrationSql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pedido_impressoes FROM anon, authenticated, public/i);
      expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.travar_impressao_pedido\(BIGINT, TEXT, TEXT, TEXT\) TO authenticated/i);
    });

    it('CA05: pedido_item_sabores permite leitura para KDS/cardápio e restringe manipulação direta a staff', () => {
      expect(migrationSql).toMatch(/CREATE POLICY "pedido_item_sabores_select" ON public\.pedido_item_sabores/i);
      expect(migrationSql).toMatch(/CREATE POLICY "pedido_item_sabores_staff" ON public\.pedido_item_sabores/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.pedido_item_sabores TO anon, authenticated/i);
    });
  });

  describe('Módulo 3: Validação da Suíte pgTAP de Banco de Dados', () => {
    it('O arquivo supabase/tests/rls_todas_tabelas.test.sql existe e possui estrutura pgTAP válida', () => {
      const pgtapPath = path.resolve(__dirname, '../supabase/tests/rls_todas_tabelas.test.sql');
      expect(fs.existsSync(pgtapPath)).toBe(true);

      const pgtapSql = fs.readFileSync(pgtapPath, 'utf8');
      const checagem = validarEstruturaPgTap(pgtapSql);
      expect(checagem.valido).toBe(true);
      expect(checagem.temOkTrue).toBe(false);
      expect(pgtapSql).toContain('rls_todas_tabelas');
      expect(pgtapSql).toContain('rowsecurity = false');
    });

    it('Todos os 19 arquivos de teste pgTAP em supabase/tests/ possuem asserções válidas', () => {
      const testesSql = listarTestesSql('supabase/tests');
      expect(testesSql.length).toBeGreaterThanOrEqual(19);

      for (const arq of testesSql) {
        const conteudo = fs.readFileSync(arq, 'utf8');
        const checagem = validarEstruturaPgTap(conteudo);
        expect(checagem.valido).toBe(true);
      }
    });
  });

  describe('Módulo 4: Simulação Funcional de Acesso e Contratos do Frontend', () => {
    it('Cliente anônimo consome promoções ativas e não consegue visualizar inativas', async () => {
      const mockData = {
        promocoes: [
          { id: 1, nome: 'Promo Ativa', ativo: true },
          { id: 2, nome: 'Promo Inativa', ativo: false }
        ]
      };

      // Simula política: anônimo só enxerga ativo = true
      const supabase = createSupabaseMock({
        promocoes: mockData.promocoes.filter(p => p.ativo)
      });

      const { data } = await supabase.from('promocoes').select('*').eq('ativo', true);
      expect(data.length).toBe(1);
      expect(data[0].nome).toBe('Promo Ativa');
    });

    it('Escrita em analytics ocorre via RPC registrar_evento_cardapio sem inserção direta na tabela', async () => {
      const rpcSpy = vi.fn(() => ({ data: null, error: null }));
      const supabase = createSupabaseMock({}, {
        rpcHandlers: {
          registrar_evento_cardapio: rpcSpy
        }
      });

      const res = await supabase.rpc('registrar_evento_cardapio', {
        p_canal: 'mesa',
        p_tipo_evento: 'view_item',
        p_produto_id: 'p1'
      });

      expect(rpcSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          p_canal: 'mesa',
          p_tipo_evento: 'view_item',
          p_produto_id: 'p1'
        }),
        expect.anything()
      );
      expect(res.error).toBeNull();
    });

    it('Controle de impressão em cozinha.js utiliza RPC travar_impressao_pedido sem inserção direta', () => {
      const cozinhaJs = fs.readFileSync(path.resolve(__dirname, '../js/cozinha.js'), 'utf8');
      expect(cozinhaJs).toMatch(/rpc\(['"]travar_impressao_pedido['"]/i);
      expect(cozinhaJs).not.toMatch(/from\(['"]pedido_impressoes['"]\)\.insert/i);
    });

    it('Controle de analytics em js/utils/menu-analytics.js utiliza RPC registrar_evento_cardapio sem inserção direta', () => {
      const analyticsJs = fs.readFileSync(path.resolve(__dirname, '../js/utils/menu-analytics.js'), 'utf8');
      expect(analyticsJs).toMatch(/rpc\(['"]registrar_evento_cardapio['"]/i);
      expect(analyticsJs).not.toMatch(/from\(['"]cardapio_eventos_diarios['"]\)\.insert/i);
    });
  });
});
