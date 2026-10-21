import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { registerCouponUsage } from '../js/utils/coupon-validator.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

describe('CAF-000077: Cupons: uso único por pedido e rastreio no fechamento', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000077_cupons_uso_unico.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const couponValidatorJsPath = path.resolve(__dirname, '../js/utils/coupon-validator.js');
  const couponValidatorJs = fs.readFileSync(couponValidatorJsPath, 'utf8');

  const pedidosJsPath = path.resolve(__dirname, '../js/pedidos.js');
  const pedidosJs = fs.readFileSync(pedidosJsPath, 'utf8');

  describe('CA01 / RF01 / RNF03: Assinatura da RPC e estrutura da tabela campanha_usos', () => {
    it('remove a assinatura antiga registrar_uso_cupom(BIGINT, NUMERIC)', () => {
      expect(migrationSql).toMatch(/DROP FUNCTION IF EXISTS public\.registrar_uso_cupom\(BIGINT,\s*NUMERIC\);/i);
    });

    it('cria a tabela campanha_usos com restrição UNIQUE(pedido_id)', () => {
      expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campanha_usos/i);
      expect(migrationSql).toMatch(/CONSTRAINT uq_campanha_usos_pedido UNIQUE\s*\(\s*pedido_id\s*\)/i);
    });

    it('define a nova RPC registrar_uso_cupom(p_campanha_id, p_pedido_id) com search_path = public', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.registrar_uso_cupom\(\s*p_campanha_id BIGINT,\s*p_pedido_id BIGINT\s*\)/i);
      expect(migrationSql).toMatch(/SECURITY DEFINER/i);
      expect(migrationSql).toMatch(/SET search_path = public/i);
    });
  });

  describe('CA02, CA03 / RF01, RF02: Unicidade, valor real do pedido e validação de cancelamento', () => {
    it('migration usa ON CONFLICT (pedido_id) DO NOTHING para garantir idempotência estrita', () => {
      expect(migrationSql).toMatch(/ON CONFLICT \(pedido_id\) DO NOTHING/i);
    });

    it('migration busca total real do pedido e recusa pedidos cancelados', () => {
      expect(migrationSql).toMatch(/SELECT id, status, total, campanha_id INTO v_pedido/i);
      expect(migrationSql).toMatch(/v_pedido\.status = 'cancelado'/i);
      expect(migrationSql).toMatch(/Não é permitido registrar uso de cupom para pedido cancelado/i);
      expect(migrationSql).toMatch(/COALESCE\(v_pedido\.total, 0\)/i);
    });
  });

  describe('CA04 / RF03 / RNF01: Revogação de acesso anônimo', () => {
    it('revoga EXECUTE de anon e public e concede apenas para authenticated', () => {
      expect(migrationSql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.registrar_uso_cupom\(BIGINT,\s*BIGINT\) FROM anon,\s*public/i);
      expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.registrar_uso_cupom\(BIGINT,\s*BIGINT\) TO authenticated/i);
    });

    it('RPC valida auth.role() = "authenticated"', () => {
      expect(migrationSql).toMatch(/auth\.role\(\) <> 'authenticated'/i);
    });
  });

  describe('CA05 / RF04: Remoção do fallback inseguro de update direto em campanhas', () => {
    it('coupon-validator.js não possui mais from("campanhas").update', () => {
      expect(couponValidatorJs).not.toMatch(/from\(['"]campanhas['"]\)\.update/i);
    });

    it('registerCouponUsage chama a RPC com p_campanha_id e p_pedido_id e propaga o erro se falhar', async () => {
      const mockSupabase = createSupabaseMock();
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('RPC falhou') });

      await expect(registerCouponUsage(mockSupabase, 10, 999)).rejects.toThrow('RPC falhou');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('registrar_uso_cupom', {
        p_campanha_id: 10,
        p_pedido_id: 999
      });
    });
  });

  describe('CA06, CA07 / RF05: Fechamento de mesa com cupom no PDV', () => {
    it('fechar_conta_mesa na migration atualiza cupom_codigo e campanha_id nos pedidos da mesa', () => {
      expect(migrationSql).toMatch(/cupom_codigo = COALESCE\(p_cupom_codigo, cupom_codigo\)/i);
      expect(migrationSql).toMatch(/campanha_id = COALESCE\(p_campanha_id, campanha_id\)/i);
    });

    it('fechar_conta_mesa registra o uso na mesma transação atômica passando o ID do pedido', () => {
      expect(migrationSql).toMatch(/PERFORM public\.registrar_uso_cupom\(p_campanha_id,\s*v_primeiro_pedido_id\)/i);
    });

    it('pedidos.js envia p_cupom_codigo e p_campanha_id para fechar_conta_mesa e trata erros', () => {
      expect(pedidosJs).toMatch(/p_cupom_codigo:\s*currentFechamento\.cupomCodigo/i);
      expect(pedidosJs).toMatch(/p_campanha_id:\s*currentFechamento\._cupomCampanhaId/i);
      expect(pedidosJs).toMatch(/await window\.couponValidator\.registerCouponUsage/i);
      expect(pedidosJs).toMatch(/showToast\([^)]*cupom/i);
    });
  });

  describe('CA08 / RF06: Estorno no cancelamento de pedidos', () => {
    it('cria trigger trg_estorno_cupom_pedido_cancelado para remover de campanha_usos e atualizar contadores', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_estorno_cupom_pedido_cancelado/i);
      expect(migrationSql).toMatch(/DELETE FROM public\.campanha_usos WHERE pedido_id = NEW\.id/i);
      expect(migrationSql).toMatch(/CREATE TRIGGER trg_estorno_cupom_pedido_cancelado/i);
    });
  });

  describe('CA09 / RF07: Conciliação histórica', () => {
    it('contém script de conciliação retroativa preenchendo campanha_usos a partir de pedidos', () => {
      expect(migrationSql).toMatch(/INSERT INTO public\.campanha_usos\s*\(campanha_id,\s*pedido_id,\s*valor_receita,\s*created_at\)/i);
      expect(migrationSql).toMatch(/FROM public\.pedidos p/i);
      expect(migrationSql).toMatch(/UPDATE public\.campanhas c/i);
    });
  });
});
