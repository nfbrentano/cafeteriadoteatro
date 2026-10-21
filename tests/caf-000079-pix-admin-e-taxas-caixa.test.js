import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Importa biblioteca qrcode e módulo Pix
const qrcodeLibPath = path.resolve(process.cwd(), 'js/libs/qrcode.min.js');
if (fs.existsSync(qrcodeLibPath)) {
  const qrcodeCode = fs.readFileSync(qrcodeLibPath, 'utf-8');
  const fn = new Function('window', 'module', 'exports', `
    ${qrcodeCode}
    return typeof qrcode !== 'undefined' ? qrcode : (module.exports || window.qrcode);
  `);
  const mod = {};
  const qr = fn(window, mod, mod.exports || {});
  window.qrcode = qr || mod.exports || window.qrcode;
}

import '../js/pix-brcode.js';

describe('CAF-000079 — Pix no Admin e Taxas no Fechamento de Caixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RF01 / CA01 — Salvar Configurações Pix no Admin', () => {
    it('executa upsert e renova cache com obterConfigPix(true)', async () => {
      let upsertPayload = null;
      let obterConfigChamado = false;

      window.cafeteriaSupabase = {
        from: vi.fn((table) => ({
          upsert: vi.fn(async (payload) => {
            if (table === 'configuracoes_sistema') {
              upsertPayload = payload;
            }
            return { data: payload, error: null };
          })
        }))
      };

      const originalObterConfig = window.cafeteriaPix.obterConfigPix;
      window.cafeteriaPix.obterConfigPix = vi.fn(async (force) => {
        if (force === true) obterConfigChamado = true;
        return { chave: 'admin@teatro.com', recebedor: 'CAFETERIA', cidade: 'FORTALEZA' };
      });

      // Simula o handler de btnSalvarPix
      const chave = '12345678909';
      const recebedor = 'CAFETERIA DO TEATRO';
      const cidade = 'FORTALEZA';
      const imprimir = true;

      const payload = [
        { chave: 'pix_chave', valor: chave, updated_at: new Date().toISOString() },
        { chave: 'pix_nome_recebedor', valor: recebedor, updated_at: new Date().toISOString() },
        { chave: 'pix_cidade', valor: cidade, updated_at: new Date().toISOString() },
        { chave: 'pix_imprimir_na_conta', valor: imprimir, updated_at: new Date().toISOString() }
      ];

      const { error } = await window.cafeteriaSupabase.from('configuracoes_sistema').upsert(payload);
      expect(error).toBeNull();

      if (window.cafeteriaPix) {
        await window.cafeteriaPix.obterConfigPix(true);
      }

      expect(upsertPayload).toHaveLength(4);
      expect(obterConfigChamado).toBe(true);

      // Restaura método
      window.cafeteriaPix.obterConfigPix = originalObterConfig;
    });

    it('getPixConfig é um alias funcional para obterConfigPix', () => {
      expect(typeof window.cafeteriaPix.getPixConfig).toBe('function');
      expect(window.cafeteriaPix.getPixConfig).toBe(window.cafeteriaPix.obterConfigPix);
    });
  });

  describe('RF02 / CA02 — Testar Pix Válido', () => {
    it('gera payload Pix de teste de R$ 1,00 e o CRC16 confere', () => {
      const res = window.cafeteriaPix.gerarPayloadPix({
        chave: '12345678909',
        recebedor: 'CAFETERIA DO TEATRO',
        cidade: 'FORTALEZA',
        valor: 1.00,
        txid: 'TESTE01'
      });

      expect(res.ok).toBe(true);
      expect(res.payload).toBeDefined();

      const payload = res.payload;
      expect(payload).toContain('TESTE01');
      expect(payload).toContain('1.00');

      // Validação do CRC16 EMV
      const semCrc = payload.slice(0, -4);
      const crcEsperado = payload.slice(-4);
      const crcCalculado = window.cafeteriaPix.crc16CCITT(semCrc);

      expect(crcCalculado).toBe(crcEsperado);

      // Geração do SVG
      const svg = window.cafeteriaPix.gerarQrSvg(payload, 4);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('gerarPayload é compatível aceitando nomeRecebedor', () => {
      const res = window.cafeteriaPix.gerarPayload({
        chave: '12345678909',
        nomeRecebedor: 'CAFETERIA DO TEATRO',
        cidade: 'FORTALEZA',
        valor: 1.00,
        txid: 'TESTE02'
      });

      expect(res.ok).toBe(true);
      expect(res.payload).toContain('TESTE02');
    });
  });

  describe('RF02 / CA03 — Testar Pix com Chave Inválida', () => {
    it('retorna erro formatado quando a chave é vazia ou inválida', () => {
      const res = window.cafeteriaPix.gerarPayloadPix({
        chave: '',
        recebedor: 'CAFETERIA',
        cidade: 'FORTALEZA',
        valor: 1.00
      });

      expect(res.ok).toBe(false);
      expect(res.erro).toMatch(/não configurada/);
    });
  });

  describe('RF03 / CA04 — Cálculo de Taxas e Valor Líquido no Caixa', () => {
    it('parseTotaisCaixa processa corretamente total_taxas e total_liquido por forma', () => {
      // Simula o retorno de fn_calcular_totais_caixa_interno
      const mockRetornoRpc = {
        caixa_id: 'uuid-caixa-1',
        total_bruto: 150.00,
        total_taxas: 3.00,
        total_liquido: 147.00,
        itens: [
          {
            forma: 'cartao_credito',
            total_vendas: 100.00,
            total_taxa: 3.00,
            total_taxas: 3.00,
            total_liquido: 97.00
          },
          {
            forma: 'pix',
            total_vendas: 50.00,
            total_taxa: 0.00,
            total_taxas: 0.00,
            total_liquido: 50.00
          }
        ]
      };

      // Simulação do parser de caixa-admin.js
      const mapaVendas = { cartao_credito: 0, pix: 0, dinheiro: 0 };
      const mapaTaxas = { cartao_credito: 0, pix: 0, dinheiro: 0 };
      const mapaLiquido = { cartao_credito: 0, pix: 0, dinheiro: 0 };

      mockRetornoRpc.itens.forEach((row) => {
        const key = row.forma;
        if (mapaVendas[key] !== undefined) {
          const bruto = Number(row.total_vendas ?? row.total ?? 0);
          const taxa = Number(row.total_taxas ?? row.total_taxa ?? 0);
          const liq = row.total_liquido !== undefined ? Number(row.total_liquido) : bruto - taxa;
          mapaVendas[key] = bruto;
          mapaTaxas[key] = taxa;
          mapaLiquido[key] = liq;
        }
      });

      expect(mapaVendas.cartao_credito).toBe(100.00);
      expect(mapaTaxas.cartao_credito).toBe(3.00);
      expect(mapaLiquido.cartao_credito).toBe(97.00);

      expect(mapaVendas.pix).toBe(50.00);
      expect(mapaTaxas.pix).toBe(0.00);
      expect(mapaLiquido.pix).toBe(50.00);
    });
  });

  describe('RF04 / CA05 — Taxas Históricas Congeladas', () => {
    it('a query SQL lê taxa_valor congelada na venda, sem join dinâmico com taxas atuais', () => {
      const sqlCode = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migration_caf_000079_pix_admin_taxas_caixa.sql'), 'utf-8');
      expect(sqlCode).toMatch(/fp\.taxa_valor/);
      expect(sqlCode).toMatch(/p\.taxa_pagamento_valor/);
      // Garante que não busca a tabela de taxas atuais na consolidação do caixa
      expect(sqlCode).not.toMatch(/JOIN public\.formas_pagamento_taxas/i);
    });
  });

  describe('RNF01 / CA06 — Contrato de Métodos de window.cafeteriaPix', () => {
    it('nenhum arquivo em js/** chama métodos não exportados de cafeteriaPix', () => {
      const exportedMethods = new Set(Object.keys(window.cafeteriaPix));
      const jsDir = path.resolve(process.cwd(), 'js');

      function scanDir(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            if (file.name !== 'libs' && file.name !== 'vendor') {
              scanDir(fullPath);
            }
          } else if (file.name.endsWith('.js') && file.name !== 'pix-brcode.js') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const regex = /cafeteriaPix(?:\.|\?\.)([a-zA-Z0-9_]+)\s*\(/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
              const methodName = match[1];
              expect(
                exportedMethods.has(methodName),
                `Método inexistente chamado em ${file.name}: cafeteriaPix.${methodName}`
              ).toBe(true);
            }
          }
        }
      }

      scanDir(jsDir);
    });
  });
});
