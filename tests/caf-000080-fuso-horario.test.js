import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  hojeSP,
  inicioDoDiaSP,
  fimDoDiaSP,
  diaSemanaSP,
  formatarDataHoraSP,
  formatarDataSP,
  formatarHoraSP
} from '../js/utils/datas-sp.js';

describe('CAF-000080: Fuso horário consistente (America/Sao_Paulo) e corte do dia operacional', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000080_fuso_horario.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const pedidosJsPath = path.resolve(__dirname, '../js/pedidos.js');
  const pedidosJs = fs.readFileSync(pedidosJsPath, 'utf8');

  const cardapioDynamicJsPath = path.resolve(__dirname, '../js/cardapio-dynamic.js');
  const cardapioDynamicJs = fs.readFileSync(cardapioDynamicJsPath, 'utf8');

  const pedidosAdminJsPath = path.resolve(__dirname, '../js/admin/pedidos-admin.js');
  const pedidosAdminJs = fs.readFileSync(pedidosAdminJsPath, 'utf8');

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CA01 / RF03: Utilitários datas-sp.js no Horário de Brasília (-03:00)', () => {
    it('hojeSP retorna YYYY-MM-DD correto em qualquer instante', () => {
      // 2026-10-21 15:30:00 UTC = 2026-10-21 12:30:00 em SP
      const dt = new Date('2026-10-21T15:30:00.000Z');
      expect(hojeSP(dt)).toBe('2026-10-21');
    });

    it('inicioDoDiaSP retorna 00:00:00 de SP convertida em UTC (03:00:00.000Z)', () => {
      const inicio = inicioDoDiaSP('2026-10-21');
      expect(inicio).toBe('2026-10-21T03:00:00.000Z');
    });

    it('fimDoDiaSP retorna 23:59:59.999 de SP convertida em UTC (dia seguinte 02:59:59.999Z)', () => {
      const fim = fimDoDiaSP('2026-10-21');
      expect(fim).toBe('2026-10-22T02:59:59.999Z');
    });

    it('formatarDataHoraSP formata no horário de Brasília com precisão', () => {
      const dt = new Date('2026-10-21T15:30:45.000Z'); // 12:30:45 em SP
      expect(formatarDataHoraSP(dt)).toBe('21/10/2026 12:30:45');
      expect(formatarDataSP(dt)).toBe('21/10/2026');
      expect(formatarHoraSP(dt)).toBe('12:30');
    });
  });

  describe('CA02 / RF02: Corte do dia no banco e v_painel_retirada', () => {
    it('migration cria fn_inicio_dia_sp e fn_fim_dia_sp com search_path = public', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_inicio_dia_sp/i);
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_fim_dia_sp/i);
      expect(migrationSql).toMatch(/America\/Sao_Paulo/i);
    });

    it('v_painel_retirada usa fn_inicio_dia_sp para não sumir pedidos após as 21h', () => {
      expect(migrationSql).toMatch(/created_at >= public\.fn_inicio_dia_sp\(\)/i);
    });
  });

  describe('CA03 / RF03: Simulação de 22:30 de terça em SP (01:30Z de quarta em UTC)', () => {
    it('calcula terça-feira (dia 2) e data de terça mesmo após as 21h (01:30 UTC do dia seguinte)', () => {
      // Terça-feira, 20/10/2026 às 22:30:00 em SP = Quarta-feira, 21/10/2026 às 01:30:00 UTC
      const noiteDeTerca = new Date('2026-10-21T01:30:00.000Z');
      vi.setSystemTime(noiteDeTerca);

      expect(hojeSP()).toBe('2026-10-20');
      expect(diaSemanaSP()).toBe(2); // 2 = Terça-feira
    });

    it('cardapio-dynamic.js consome datasSP para diaSemana e data do dia sem conversão UTC errônea', () => {
      expect(cardapioDynamicJs).toMatch(/window\.datasSP\.diaSemanaSP/i);
      expect(cardapioDynamicJs).toMatch(/window\.datasSP\.hojeSP/i);
    });
  });

  describe('CA05 / RF04: Exportação e filtros do admin com fuso de Brasília', () => {
    it('pedidos-admin.js ancora buildPedidosQuery e exportação CSV no fuso de SP', () => {
      expect(pedidosAdminJs).toMatch(/datasHelper\.inicioDoDiaSP/i);
      expect(pedidosAdminJs).toMatch(/datasHelper\.fimDoDiaSP/i);
      expect(pedidosAdminJs).toMatch(/formatarDataHoraSP/i);
    });
  });

  describe('CA06, CA07 / RF05: loadActivePedidos não carrega histórico infinito nem cancelados antigos', () => {
    it('pedidos.js usa janela de 2 dias para não pagos e exclui cancelados e finalizados antigos', () => {
      expect(pedidosJs).toMatch(/status_pagamento\.eq\.pendente,status\.not\.in\.\(cancelado,finalizado\)/i);
      expect(pedidosJs).toMatch(/doisDiasAtras/i);
      expect(pedidosJs).toMatch(/status\.in\.\(pendente,em_preparo,aguardando_pagamento,pronto\)/i);
    });
  });

  describe('CA08 / RF06: Auditoria de correção histórica no banco', () => {
    it('migration define fn_simular_correcao_fuso_historico com segurança', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_simular_correcao_fuso_historico/i);
      expect(migrationSql).toMatch(/SECURITY DEFINER/i);
      expect(migrationSql).toMatch(/SET search_path = public/i);
    });
  });

  describe('CA09 / RF07: Lint estático de novas migrations contra timezone("America/Sao_Paulo", now()) em default', () => {
    it('a migration 80 padroniza colunas timestamptz para DEFAULT now()', () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.pedidos ALTER COLUMN created_at SET DEFAULT now\(\);/i);
      expect(migrationSql).toMatch(/ALTER TABLE public\.pedidos ALTER COLUMN updated_at SET DEFAULT now\(\);/i);
    });
  });
});
