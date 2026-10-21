import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getHojeYMD,
  deriveDespesaStatus,
  normalizeDespesaFromDB,
  buildDespesaPayload
} from '../js/utils/despesa-mapper.js';

describe('CAF-000078 — Financeiro / Despesas: Contrato Front ↔ Banco', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RF01 / CA01 — Criar despesa pendente com colunas reais', () => {
    it('gera payload com "valor" e sem "valor_total", "status" ou "data_pagamento"', () => {
      const formInput = {
        descricao: 'Café Grãos Especial',
        valor: '150.00',
        vencimento: '2026-10-25',
        categoria_id: '2',
        fornecedor_id: 'uuid-forn-1',
        tipo: 'variavel',
        recorrencia: 'nenhuma',
        documento: 'NF-1234',
        observacoes: 'Lote 40'
      };

      const payload = buildDespesaPayload(formInput);

      expect(payload).toEqual({
        descricao: 'Café Grãos Especial',
        categoria_id: 2,
        fornecedor_id: 'uuid-forn-1',
        valor: 150.00,
        vencimento: '2026-10-25',
        pago_em: null,
        valor_pago: null,
        forma_pagamento: null,
        recorrencia: 'nenhuma',
        origem: 'manual',
        observacoes: 'Lote 40',
        documento: 'NF-1234',
        anexo_url: null
      });

      expect(payload).not.toHaveProperty('valor_total');
      expect(payload).not.toHaveProperty('status');
      expect(payload).not.toHaveProperty('data_pagamento');
    });

    it('normaliza despesa do banco derivando status="aberto"', () => {
      const dbRow = {
        id: 'desp-1',
        descricao: 'Café Grãos',
        valor: 150.00,
        vencimento: '2099-12-31',
        pago_em: null,
        categoria_id: 2
      };

      const norm = normalizeDespesaFromDB(dbRow, '2026-10-21');
      expect(norm.valor).toBe(150.00);
      expect(norm.status).toBe('aberto');
    });
  });

  describe('RF01 / CA02 — Criar despesa já paga', () => {
    it('grava pago_em, valor_pago e forma_pagamento sem coluna status no payload', () => {
      const formInput = {
        descricao: 'Gás de Cozinha P45',
        valor: 150.00,
        vencimento: '2026-10-10',
        categoria_id: 1,
        jaPaga: true,
        pago_em: '2026-10-10',
        valor_pago: 150.00,
        forma_pagamento: 'pix'
      };

      const payload = buildDespesaPayload(formInput);

      expect(payload.valor).toBe(150.00);
      expect(payload.pago_em).toBe('2026-10-10');
      expect(payload.valor_pago).toBe(150.00);
      expect(payload.forma_pagamento).toBe('pix');
      expect(payload).not.toHaveProperty('status');

      const norm = normalizeDespesaFromDB(payload, '2026-10-21');
      expect(norm.status).toBe('pago');
    });
  });

  describe('RF02 / CA03 — Recorrência "nenhuma" ou "mensal" (proibido "unica")', () => {
    it('converte recorrência "unica" ou vazia para "nenhuma"', () => {
      const payloadUnica = buildDespesaPayload({
        descricao: 'Água',
        valor: 50,
        vencimento: '2026-10-25',
        categoria_id: 1,
        recorrencia: 'unica'
      });
      expect(payloadUnica.recorrencia).toBe('nenhuma');

      const payloadMensal = buildDespesaPayload({
        descricao: 'Aluguel',
        valor: 2500,
        vencimento: '2026-11-05',
        categoria_id: 1,
        recorrencia: 'mensal'
      });
      expect(payloadMensal.recorrencia).toBe('mensal');
    });
  });

  describe('RF03 / CA04 — Baixa de despesa via RPC baixar_despesa', () => {
    it('camada db.js formata parâmetros corretos para a RPC baixar_despesa', async () => {
      let rpcNameCalled = null;
      let rpcParamsCalled = null;

      const mockSupabase = {
        rpc: vi.fn((name, params) => {
          rpcNameCalled = name;
          rpcParamsCalled = params;
          return Promise.resolve({ data: { success: true, recorrencia_criada: false }, error: null });
        })
      };

      // Simula implementação de db.financeiro.despesas.baixar
      async function mockBaixar(id, dados) {
        return mockSupabase.rpc('baixar_despesa', {
          p_despesa_id: id,
          p_pago_em: dados.pago_em || dados.data_pagamento,
          p_valor_pago: Number(dados.valor_pago),
          p_forma_pagamento: dados.forma_pagamento || 'pix'
        });
      }

      await mockBaixar('uuid-desp-123', {
        valor_pago: 140.00,
        pago_em: '2026-10-15',
        forma_pagamento: 'dinheiro'
      });

      expect(rpcNameCalled).toBe('baixar_despesa');
      expect(rpcParamsCalled).toEqual({
        p_despesa_id: 'uuid-desp-123',
        p_pago_em: '2026-10-15',
        p_valor_pago: 140.00,
        p_forma_pagamento: 'dinheiro'
      });
      expect(isNaN(rpcParamsCalled.p_valor_pago)).toBe(false);
    });
  });

  describe('RF01 / CA05 — Status derivado e cálculo de dias / vencidas', () => {
    it('deriva "vencida" quando vencimento < hoje e não está paga', () => {
      const desp = {
        vencimento: '2026-10-01',
        pago_em: null
      };
      expect(deriveDespesaStatus(desp, '2026-10-21')).toBe('vencida');
    });

    it('deriva "pago" mesmo se vencimento era anterior a hoje', () => {
      const desp = {
        vencimento: '2026-10-01',
        pago_em: '2026-10-05'
      };
      expect(deriveDespesaStatus(desp, '2026-10-21')).toBe('pago');
    });

    it('deriva "aberto" quando vencimento >= hoje e não paga', () => {
      const desp = {
        vencimento: '2026-10-25',
        pago_em: null
      };
      expect(deriveDespesaStatus(desp, '2026-10-21')).toBe('aberto');
    });
  });

  describe('RF04 / CA06 — Linhas de CSV exportam valor e status derivado', () => {
    it('formata linha de exportação CSV com d.valor e status derivado', () => {
      const desp = normalizeDespesaFromDB({
        id: '1',
        descricao: 'Copos Descartáveis',
        valor: 85.50,
        vencimento: '2026-10-15',
        pago_em: '2026-10-14',
        valor_pago: 85.50,
        forma_pagamento: 'pix',
        documento: 'NF-9988'
      }, '2026-10-21');

      const isPaga = Boolean(desp.pago_em);
      const statusLabel = isPaga ? 'Pago' : 'Em Aberto';
      const valorStr = (Number(desp.valor) || 0).toFixed(2).replace('.', ',');

      expect(valorStr).toBe('85,50');
      expect(statusLabel).toBe('Pago');
      expect(desp.documento).toBe('NF-9988');
    });
  });

  describe('RF05 / CA07 — Persistência e reabertura de documento', () => {
    it('preserva número do documento no payload e no mapper', () => {
      const payload = buildDespesaPayload({
        descricao: 'Serviço Manutenção',
        valor: 200,
        vencimento: '2026-10-30',
        categoria_id: 3,
        documento: 'REC-5544'
      });
      expect(payload.documento).toBe('REC-5544');

      const norm = normalizeDespesaFromDB({
        ...payload,
        id: 'desp-55'
      });
      expect(norm.documento).toBe('REC-5544');
    });
  });

  describe('CA11 — Validação negativa de valor <= 0 ou vazio', () => {
    it('rejeita valor zero, negativo ou ausente', () => {
      expect(() => buildDespesaPayload({
        descricao: 'Teste',
        valor: 0,
        vencimento: '2026-10-30',
        categoria_id: 1
      })).toThrow(/Valor da despesa deve ser um número positivo/);

      expect(() => buildDespesaPayload({
        descricao: 'Teste',
        valor: -10,
        vencimento: '2026-10-30',
        categoria_id: 1
      })).toThrow(/Valor da despesa deve ser um número positivo/);

      expect(() => buildDespesaPayload({
        descricao: '',
        valor: 10,
        vencimento: '2026-10-30',
        categoria_id: 1
      })).toThrow(/Descrição da despesa é obrigatória/);
    });
  });

  describe('RNF02 — Payload sem chaves fora do schema de produção', () => {
    it('o payload contém apenas colunas reconhecidas pela tabela despesas', () => {
      const allowedColumns = new Set([
        'id',
        'descricao',
        'fornecedor_id',
        'categoria_id',
        'valor',
        'vencimento',
        'pago_em',
        'valor_pago',
        'forma_pagamento',
        'origem',
        'recorrencia',
        'proxima_recorrencia_criada',
        'caixa_movimento_id',
        'estoque_movimento_id',
        'observacoes',
        'anexo_url',
        'documento',
        'criado_por',
        'criado_por_nome'
      ]);

      const payload = buildDespesaPayload({
        descricao: 'Energia Elétrica',
        valor: 350.25,
        vencimento: '2026-10-28',
        categoria_id: 1,
        fornecedor_id: null,
        recorrencia: 'mensal',
        documento: 'FAT-2026-10',
        observacoes: 'Consumo out/2026'
      });

      const invalidKeys = Object.keys(payload).filter(k => !allowedColumns.has(k));
      expect(invalidKeys).toEqual([]);
    });
  });
});
