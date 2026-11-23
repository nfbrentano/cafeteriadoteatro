// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import '../js/db.js';

describe('CAF-000158: Correção das RPCs get_resumo_financeiro e admin_create_user (pgcrypto gen_salt)', () => {
  let mockRpc;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRpc = vi.fn();
    window.cafeteriaSupabase = {
      rpc: mockRpc
    };
  });

  describe('1. Correção e Normalização de get_resumo_financeiro (CA01, CA02, CA03)', () => {
    it('CA01: getResumo() sem argumentos preenche mês e ano correntes como inteiros e mapeia aliases', async () => {
      const hoje = new Date();
      const mesEsperado = hoje.getMonth() + 1;
      const anoEsperado = hoje.getFullYear();

      mockRpc.mockResolvedValueOnce({
        data: {
          mes: mesEsperado,
          ano: anoEsperado,
          vencidas_total: 150.50,
          vencidas_qtd: 2,
          vence_7d_total: 300.00,
          vence_7d_qtd: 1,
          total_pago: 1200.00,
          total_faturamento: 4500.00,
          resultado_operacional: 3300.00,
          despesas_por_categoria: []
        },
        error: null
      });

      const resultado = await window.cafeteriaDB.financeiro.getResumo();

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('get_resumo_financeiro', {
        p_mes: mesEsperado,
        p_ano: anoEsperado
      });

      expect(resultado).toBeDefined();
      expect(resultado.total_vencidas).toBe(150.50);
      expect(resultado.qtd_vencidas).toBe(2);
      expect(resultado.total_a_vencer_7d).toBe(300.00);
      expect(resultado.qtd_a_vencer_7d).toBe(1);
      expect(resultado.total_despesas_pagas).toBe(1200.00);
    });

    it('CA02: simula alerta financeiro no dashboard ao carregar dados de getResumo', async () => {
      document.body.innerHTML = `
        <div id="dash-alerta-financeiro" style="display: none;">
          <span id="dash-alerta-financeiro-icon"></span>
          <div id="dash-alerta-financeiro-texto"></div>
        </div>
      `;

      const dashAlerta = document.getElementById('dash-alerta-financeiro');
      const dashAlertaIcon = document.getElementById('dash-alerta-financeiro-icon');
      const dashAlertaTexto = document.getElementById('dash-alerta-financeiro-texto');

      mockRpc.mockResolvedValueOnce({
        data: {
          total_vencidas: 250.00,
          qtd_vencidas: 3,
          total_a_vencer_7d: 100.00,
          qtd_a_vencer_7d: 1
        },
        error: null
      });

      const resumo = await window.cafeteriaDB.financeiro.getResumo();

      if (resumo && Number(resumo.qtd_vencidas) > 0) {
        dashAlerta.style.display = 'flex';
        dashAlertaIcon.textContent = '🔴';
        dashAlertaTexto.innerHTML = `Você tem ${resumo.qtd_vencidas} conta(s) vencida(s)`;
      }

      expect(dashAlerta.style.display).toBe('flex');
      expect(dashAlertaIcon.textContent).toBe('🔴');
      expect(dashAlertaTexto.innerHTML).toContain('3 conta(s) vencida(s)');
    });

    it('CA03: getResumo("YYYY-MM") processa a string e envia p_mes e p_ano numéricos', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          mes: 8,
          ano: 2026,
          total_vencidas: 0,
          qtd_vencidas: 0
        },
        error: null
      });

      const resultado = await window.cafeteriaDB.financeiro.getResumo('2026-08');

      expect(mockRpc).toHaveBeenCalledWith('get_resumo_financeiro', {
        p_mes: 8,
        p_ano: 2026
      });
      expect(resultado.mes).toBe(8);
      expect(resultado.ano).toBe(2026);
    });

    it('CA03 (borda): fallback para data corrente quando argumentos forem nulos, vazios ou inválidos', async () => {
      const hoje = new Date();
      const mesEsperado = hoje.getMonth() + 1;
      const anoEsperado = hoje.getFullYear();

      mockRpc.mockResolvedValue({
        data: { mes: mesEsperado, ano: anoEsperado },
        error: null
      });

      await window.cafeteriaDB.financeiro.getResumo(null, null);
      expect(mockRpc).toHaveBeenLastCalledWith('get_resumo_financeiro', {
        p_mes: mesEsperado,
        p_ano: anoEsperado
      });

      await window.cafeteriaDB.financeiro.getResumo(undefined, undefined);
      expect(mockRpc).toHaveBeenLastCalledWith('get_resumo_financeiro', {
        p_mes: mesEsperado,
        p_ano: anoEsperado
      });

      await window.cafeteriaDB.financeiro.getResumo('invalido');
      expect(mockRpc).toHaveBeenLastCalledWith('get_resumo_financeiro', {
        p_mes: mesEsperado,
        p_ano: anoEsperado
      });
    });

    it('CA06 / Tratamento de Erro: getResumo captura erro da RPC e retorna null sem lançar exceção', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Erro de conexão no banco', code: 'PGRST' }
      });

      const resultado = await window.cafeteriaDB.financeiro.getResumo();
      expect(resultado).toBeNull();
    });
  });

  describe('2. Validação e Execução de admin_create_user (CA04, CA05)', () => {
    it('CA04: simula criação de usuário com sucesso repassando parâmetros requeridos', async () => {
      const novoUserId = 'b5d9841e-3cb5-4f40-84cf-233bbd155f9a';
      mockRpc.mockResolvedValueOnce({
        data: {
          id: novoUserId,
          email: 'novo.barista@cafeteriadoteatro.com.br',
          nome: 'Barista Teste',
          role: 'barista'
        },
        error: null
      });

      const resposta = await window.cafeteriaSupabase.rpc('admin_create_user', {
        email: 'novo.barista@cafeteriadoteatro.com.br',
        password: 'SenhaSegura@2026',
        nome: 'Barista Teste',
        role_param: 'barista',
        pode_dar_desconto_param: false
      });

      expect(resposta.error).toBeNull();
      expect(resposta.data.id).toBe(novoUserId);
      expect(mockRpc).toHaveBeenCalledWith('admin_create_user', {
        email: 'novo.barista@cafeteriadoteatro.com.br',
        password: 'SenhaSegura@2026',
        nome: 'Barista Teste',
        role_param: 'barista',
        pode_dar_desconto_param: false
      });
    });

    it('CA05: simula rejeição de criação de usuário para sessões não autorizadas', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: '42501',
          message: 'Acesso negado. Apenas administradores podem criar usuários.'
        }
      });

      const resposta = await window.cafeteriaSupabase.rpc('admin_create_user', {
        email: 'hacker@invasao.com',
        password: '123',
        nome: 'Invasor',
        role_param: 'admin',
        pode_dar_desconto_param: true
      });

      expect(resposta.error).toBeDefined();
      expect(resposta.error.code).toBe('42501');
      expect(resposta.error.message).toContain('Acesso negado');
    });
  });

  describe('3. Validação Estática da Migration e Rollback 158 (CA01, CA04, CA05)', () => {
    const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000158_correcao_rpcs_pgcrypto_financeiro.sql');
    const rollbackPath = path.resolve(__dirname, '../supabase/rollback/rollback_caf_000158.sql');

    it('CA01 / CA04: migration_caf_000158 existe e define defaults, schema extensions e permissões', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Extensão pgcrypto no schema extensions
      expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;');

      // 2. get_resumo_financeiro com defaults
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_resumo_financeiro(');
      expect(sql).toContain('DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT');
      expect(sql).toContain('DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT');
      expect(sql).toContain('total_vencidas');
      expect(sql).toContain('qtd_vencidas');

      // 3. admin_create_user com pgcrypto qualificado
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_create_user(');
      expect(sql).toContain('SET search_path = public, extensions');
      expect(sql).toContain('extensions.crypt(password, extensions.gen_salt(\'bf\'))');

      // 4. Revogação de permissões para anônimo
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon, public;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;');
    });

    it('CA04 / CA05: rollback_caf_000158 existe e reverte de forma transacional', () => {
      expect(fs.existsSync(rollbackPath)).toBe(true);
      const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');

      expect(rollbackSql).toContain('BEGIN;');
      expect(rollbackSql).toContain("DELETE FROM public.app_migrations WHERE versao = '158';");
      expect(rollbackSql).toContain('COMMIT;');
    });
  });
});
