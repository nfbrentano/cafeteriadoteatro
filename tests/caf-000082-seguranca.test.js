import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CAF-000082: Segurança: RPCs, policies e views expostas', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000082_seguranca.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const cozinhaJsPath = path.resolve(__dirname, '../js/cozinha.js');
  const cozinhaJs = fs.readFileSync(cozinhaJsPath, 'utf8');

  const retiradaJsPath = path.resolve(__dirname, '../js/retirada.js');
  const retiradaJs = fs.readFileSync(retiradaJsPath, 'utf8');

  describe('CA01 / RF01: Trava de impressão e fechamento de pedido_impressoes', () => {
    it('revoga escrita direta em pedido_impressoes para anon e authenticated', () => {
      expect(migrationSql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pedido_impressoes FROM anon/i);
      expect(migrationSql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.pedido_impressoes FROM authenticated/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.pedido_impressoes TO authenticated/i);
    });

    it('travar_impressao_pedido é SECURITY DEFINER com search_path = public e validação de autenticação', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.travar_impressao_pedido/i);
      expect(migrationSql).toMatch(/SECURITY DEFINER/i);
      expect(migrationSql).toMatch(/SET search_path = public/i);
      expect(migrationSql).toMatch(/auth\.role\(\) <> 'authenticated'/i);
      expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.travar_impressao_pedido.*FROM anon/i);
    });

    it('cozinha.js utiliza exclusivamente a RPC e não possui insert direto em pedido_impressoes', () => {
      expect(cozinhaJs).not.toMatch(/from\(['"]pedido_impressoes['"]\)\.insert/i);
      expect(cozinhaJs).toMatch(/rpc\(['"]travar_impressao_pedido['"]/i);
    });
  });

  describe('CA02 / RF02: Chamados de mesa e anti-spam', () => {
    it('remove a policy de insert anônimo direto em mesa_chamados', () => {
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "mesa_chamados_insert_anon" ON public\.mesa_chamados/i);
      expect(migrationSql).toMatch(/REVOKE INSERT ON public\.mesa_chamados FROM anon/i);
    });

    it('chamar_atendente_mesa possui controle anti-spam e search_path fixo', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.chamar_atendente_mesa/i);
      expect(migrationSql).toMatch(/SET search_path = public/i);
      expect(migrationSql).toMatch(/INTERVAL '60 seconds'/i);
      expect(migrationSql).toMatch(/'repetido', true/i);
    });
  });

  describe('CA03 / RF03: Estoque movimentos restrito a staff com permissão', () => {
    it('limita inserções de entrada, ajuste e perda a quem tem permissão estoque ou admin/gerente', () => {
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "estoque_movimentos_insert_auth"/i);
      expect(migrationSql).toMatch(/CREATE POLICY "estoque_movimentos_insert_auth" ON public\.estoque_movimentos/i);
      expect(migrationSql).toMatch(/tem_permissao\('estoque'\)/i);
      expect(migrationSql).toMatch(/tipo = 'saida'/i);
    });
  });

  describe('CA04 / RF04: Policies de CRM restritas a crm ou admin', () => {
    it('substitui policies abertas de CRM por checagens de permissão', () => {
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "cliente_tags_auth_all"/i);
      expect(migrationSql).toMatch(/CREATE POLICY "cliente_tags_crm_staff"/i);
      expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "campanhas_auth_all"/i);
      expect(migrationSql).toMatch(/CREATE POLICY "campanhas_crm_staff"/i);
      expect(migrationSql).toMatch(/tem_permissao\('crm'\)/i);
    });
  });

  describe('CA05 / RF05: Views de dados pessoais com security_invoker = true e sem grant anon', () => {
    it('declara security_invoker = true para views com dados de clientes', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE VIEW public\.v_cliente_saldo WITH \(security_invoker = true\)/i);
      expect(migrationSql).toMatch(/CREATE OR REPLACE VIEW public\.v_clientes_rfv WITH \(security_invoker = true\)/i);
      expect(migrationSql).toMatch(/CREATE OR REPLACE VIEW public\.v_campanhas_conversao WITH \(security_invoker = true\)/i);
    });

    it('revoga acesso de anônimos às views de clientes', () => {
      expect(migrationSql).toMatch(/REVOKE ALL ON public\.v_clientes_rfv FROM anon/i);
      expect(migrationSql).toMatch(/REVOKE ALL ON public\.v_cliente_saldo FROM anon/i);
      expect(migrationSql).toMatch(/REVOKE ALL ON public\.v_campanhas_conversao FROM anon/i);
      expect(migrationSql).toMatch(/GRANT SELECT ON public\.v_clientes_rfv TO authenticated/i);
    });
  });

  describe('CA06 / RF06: Painel de retirada e LGPD', () => {
    it('v_painel_retirada expõe estritamente as 4 colunas necessárias e usa timezone de São Paulo', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE VIEW public\.v_painel_retirada/i);
      const painelViewMatch = migrationSql.match(/CREATE OR REPLACE VIEW public\.v_painel_retirada[\s\S]*?FROM public\.pedidos/i);
      expect(painelViewMatch).not.toBeNull();
      const viewSelect = painelViewMatch[0];
      expect(viewSelect).toMatch(/numero_pedido/i);
      expect(viewSelect).toMatch(/split_part\(trim\(coalesce\(cliente_nome, ''\)\), ' ', 1\) AS primeiro_nome/i);
      expect(viewSelect).toMatch(/status/i);
      expect(viewSelect).toMatch(/pronto_em/i);
      expect(viewSelect).not.toMatch(/\bid\b/i);
      expect(viewSelect).not.toMatch(/mesa_codigo/i);
      expect(migrationSql).toMatch(/America\/Sao_Paulo/i);
    });

    it('retirada.js não consulta a tabela pedidos diretamente como anon', () => {
      expect(retiradaJs).not.toMatch(/from\(['"]pedidos['"]\)/i);
      expect(retiradaJs).toMatch(/from\(['"]v_painel_retirada['"]\)/i);
    });
  });

  describe('CA07 & CA08 / RF07 & RF08: Verificação de horário e rate limit no servidor', () => {
    it('define função loja_esta_aberta com search_path seguro e cálculo de fuso', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.loja_esta_aberta/i);
      expect(migrationSql).toMatch(/SET search_path = public/i);
      expect(migrationSql).toMatch(/America\/Sao_Paulo/i);
    });
  });

  describe('CA09 / RF09: Sanitização de Menu Analytics', () => {
    it('rejeita canais e tipos inválidos e força data corrente de São Paulo', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_evento_cardapio/i);
      expect(migrationSql).toMatch(/Canal de analytics inválido/i);
      expect(migrationSql).toMatch(/Tipo de evento de analytics inválido/i);
      expect(migrationSql).toMatch(/CURRENT_TIMESTAMP AT TIME ZONE 'America\/Sao_Paulo'/i);
      expect(migrationSql).toMatch(/Produto não encontrado/i);
    });
  });

  describe('CA10 / RF10: Fechamento de acesso anônimo a cupom e cashback', () => {
    it('revoga execute de anon em registrar_uso_cupom e processar_cashback_pedido', () => {
      expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.processar_cashback_pedido.*FROM anon/i);
      expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.registrar_uso_cupom.*FROM anon/i);
      expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_uso_cupom.*TO authenticated/i);
    });

    it('registrar_uso_cupom valida autenticação e id de campanha', () => {
      expect(migrationSql).toMatch(/auth\.role\(\) <> 'authenticated'/i);
      expect(migrationSql).toMatch(/Campanha ID é obrigatório/i);
    });
  });

  describe('CA11 / RF11: Lint estático da migration contra grants anônimos indevidos', () => {
    it('não concede GRANT a anon para tabelas ou RPCs fora da allowlist', () => {
      const anonGrants = [...migrationSql.matchAll(/GRANT\s+([^;]+?)\s+TO\s+([^;\n]*anon[^;\n]*)/gi)];
      const allowedTargets = [
        'chamar_atendente_mesa',
        'v_painel_retirada',
        'registrar_evento_cardapio'
      ];

      anonGrants.forEach(match => {
        const fullMatch = match[0];
        const isAllowed = allowedTargets.some(target => fullMatch.includes(target));
        expect(isAllowed, `Grant anônimo não autorizado encontrado: ${fullMatch}`).toBe(true);
      });
    });

    it('não contém WITH CHECK (true) sem restrição', () => {
      expect(migrationSql).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    });
  });
});
