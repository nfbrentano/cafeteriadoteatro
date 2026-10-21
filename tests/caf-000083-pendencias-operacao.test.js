import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatComprovanteContaCliente } from '../js/utils/receipt-formatter.js';

describe('CAF-000083: Pendências funcionais de operação e caixa', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migration_caf_000083_pendencias_operacao.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const pedidosJsPath = path.resolve(__dirname, '../js/pedidos.js');
  const pedidosJs = fs.readFileSync(pedidosJsPath, 'utf8');

  const caixaAdminJsPath = path.resolve(__dirname, '../js/admin/caixa-admin.js');
  const caixaAdminJs = fs.readFileSync(caixaAdminJsPath, 'utf8');

  const adminHtmlPath = path.resolve(__dirname, '../admin.html');
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

  const pedidosHtmlPath = path.resolve(__dirname, '../pedidos.html');
  const pedidosHtml = fs.readFileSync(pedidosHtmlPath, 'utf8');

  describe('CA01 / RF01: Depósitos de clientes nos totais do caixa', () => {
    it('migration calcula depósitos de clientes em fn_calcular_totais_caixa_interno', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_calcular_totais_caixa_interno/i);
      expect(migrationSql).toMatch(/FROM public\.cliente_conta_movimentos m/i);
      expect(migrationSql).toMatch(/m\.tipo IN \('deposito', 'pagamento_fatura'\)/i);
      expect(migrationSql).toMatch(/'total_depositos_clientes', v_total_depositos_clientes/i);
    });
  });

  describe('CA02, CA03 / RF02: Pagamento com conta do cliente no fechamento de mesa', () => {
    it('pedidos.html inclui a opção conta_cliente no select de fechamento', () => {
      expect(pedidosHtml).toMatch(/<option value="conta_cliente">/i);
    });

    it('pedidos.js valida cliente vinculado antes de permitir conta_cliente', () => {
      expect(pedidosJs).toMatch(/forma === 'conta_cliente'/i);
      expect(pedidosJs).toMatch(/É necessário vincular um cliente cadastrado à mesa para pagar com Conta do Cliente/i);
    });

    it('pedidos.js debita a conta do cliente via lancarMovimento e bloqueia se recusado', () => {
      expect(pedidosJs).toMatch(/window\.cafeteriaDB\.clientes\.lancarMovimento/i);
      expect(pedidosJs).toMatch(/Débito na conta recusado/i);
    });
  });

  describe('CA04 / RF03: Comprovante de depósito / recebimento de cliente', () => {
    it('formatComprovanteContaCliente formata comprovante com saldo anterior, valor e novo saldo', () => {
      const comprovante = formatComprovanteContaCliente({
        clienteNome: 'João Silva',
        tipo: 'deposito',
        formaPagamento: 'pix',
        saldoAnterior: 50.0,
        valor: 100.0,
        saldoNovo: 150.0
      });

      expect(comprovante).toContain('João Silva');
      expect(comprovante).toContain('CRÉDITO EM CONTA');
      expect(comprovante).toContain('PIX');
      expect(comprovante).toContain('R$ 50,00');
      expect(comprovante).toContain('R$ 100,00');
      expect(comprovante).toContain('R$ 150,00');
    });
  });

  describe('CA05 / RF04: Alerta de mesas e pedidos abertos com detalhes', () => {
    it('admin.html contém o elemento lista-mesas-abertas-detalhes', () => {
      expect(adminHtml).toMatch(/id="lista-mesas-abertas-detalhes"/i);
    });

    it('caixa-admin.js lista pedidos em aberto com código, tempo e link para PDV', () => {
      expect(caixaAdminJs).toMatch(/listaMesasDetalhes/i);
      expect(caixaAdminJs).toMatch(/pedidos\.html/i);
      expect(caixaAdminJs).toMatch(/aberta\)/i);
    });
  });

  describe('CA06, CA07 / RF05: Reabertura de caixa pelo admin', () => {
    it('migration define a RPC reabrir_caixa exigindo cargo admin e motivo com pelo menos 5 caracteres', () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.reabrir_caixa/i);
      expect(migrationSql).toMatch(/(public\.get_user_role\(\)|v_role)\s*<>\s*'admin'/i);
      expect(migrationSql).toMatch(/length\(trim\(p_motivo\)\) < 5/i);
    });

    it('RPC recusa reabertura se já houver outro caixa aberto', () => {
      expect(migrationSql).toMatch(/WHERE status = 'aberto' AND id <> p_caixa_id/i);
    });

    it('caixa-admin.js expõe reabrirCaixaAdmin chamando a RPC', () => {
      expect(caixaAdminJs).toMatch(/window\.reabrirCaixaAdmin/i);
      expect(caixaAdminJs).toMatch(/rpc\('reabrir_caixa'/i);
    });
  });

  describe('CA08, CA09 / RF06: Pedidos de intervalo no PDV gravam retirada_em em São Paulo', () => {
    it('pedidos.js calcula e grava retirada_em com base no horário do intervalo de hoje em SP', () => {
      expect(pedidosJs).toMatch(/retirada_em: retiradaEm/i);
      expect(pedidosJs).toMatch(/espetaculo_horario_intervalo/i);
    });
  });

  describe('CA12 / RF09: Tempo-alvo padrão em categorias', () => {
    it('migration altera DEFAULT de categorias.tempo_alvo_min para NULL', () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.categorias ALTER COLUMN tempo_alvo_min SET DEFAULT NULL;/i);
    });
  });
});
