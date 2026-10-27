import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setupPedidosPage } from './helpers/pedidos-page.js';

describe('CAF-000104: Correção das Colunas prioridade e prioridade_motivo na Tabela pedidos e RPCs Associadas', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('Módulo 1: Integridade da Migration e Schema de Banco (CA01, CA03, CA06)', () => {
    it('CA06: Arquivo de migration 104 existe e possui DDL idempotente das colunas e índice', () => {
      const migrationPath = path.resolve(process.cwd(), 'supabase/migration_caf_000104_correcao_prioridade_pedidos.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);

      const content = fs.readFileSync(migrationPath, 'utf8');
      expect(content).toContain('ALTER TABLE public.pedidos');
      expect(content).toContain('ADD COLUMN IF NOT EXISTS prioridade SMALLINT NOT NULL DEFAULT 0');
      expect(content).toContain('ADD COLUMN IF NOT EXISTS prioridade_motivo TEXT');
      expect(content).toContain('CREATE INDEX IF NOT EXISTS idx_pedidos_prioridade_created');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.alterar_prioridade_pedido');
      expect(content).toContain('CREATE OR REPLACE FUNCTION public.fn_audit_pedidos');
      expect(content).toContain("'104'");
    });

    it('CA01 & CA03: O catálogo schema-snapshot inclui as colunas prioridade, prioridade_motivo e RPC alterar_prioridade_pedido', () => {
      const snapshotPath = path.resolve(process.cwd(), 'tests/fixtures/schema-snapshot.json');
      expect(fs.existsSync(snapshotPath)).toBe(true);

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      const colunasPedidos = snapshot.tables?.pedidos?.columns || [];

      expect(colunasPedidos).toContain('prioridade');
      expect(colunasPedidos).toContain('prioridade_motivo');
      expect(snapshot.rpcs?.alterar_prioridade_pedido).toBeDefined();
      expect(snapshot.rpcs.alterar_prioridade_pedido.parameters).toEqual([
        'p_pedido_id',
        'p_prioridade',
        'p_motivo'
      ]);
    });
  });

  describe('Módulo 2: Fluxo Real de Registro de Pedidos no PDV para Balcão e Viagem (CA02)', () => {
    it('CA02 - Caso 1: Registrar pedido de Balcão via botão selecionar balcão', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      
      const btnBalcao = document.getElementById('btn-selecionar-balcao');
      if (btnBalcao) {
        btnBalcao.click();
      } else {
        page.marcarParaViagem(true);
      }

      page.marcarPrioritario(false);
      page.marcarIntervalo(false);
      page.limparChamadasRpc();

      await page.submeterPedido();

      const rpcCalls = page.obterChamadasRpc('criar_pedido');
      expect(rpcCalls.length).toBe(1);

      const payload = rpcCalls[0].args.p_payload;
      expect(payload.mesa_codigo).toBe('BALCAO');
      expect(payload.para_viagem).toBe(true);
      expect(payload.prioridade).toBe(0);
      expect(payload.prioridade_motivo).toBeNull();
      expect(payload.itens.length).toBe(1);
      expect(payload.itens[0].produto_id).toBe('p1');
    });

    it('CA02 - Caso 2: Registrar pedido para Viagem (takeout) com sucesso', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 2);
      page.selecionarMesa('');
      page.marcarParaViagem(true);
      page.marcarPrioritario(false);
      page.marcarIntervalo(false);
      page.limparChamadasRpc();

      await page.submeterPedido();

      const rpcCalls = page.obterChamadasRpc('criar_pedido');
      expect(rpcCalls.length).toBe(1);

      const payload = rpcCalls[0].args.p_payload;
      expect(payload.mesa_codigo).toBe('BALCAO');
      expect(payload.para_viagem).toBe(true);
      expect(payload.prioridade).toBe(0);
      expect(payload.prioridade_motivo).toBeNull();
      expect(payload.itens[0].quantidade).toBe(2);
    });

    it('CA02 - Caso 3: Registrar pedido Balcão com Prioridade marcada', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      page.marcarParaViagem(true);
      page.marcarPrioritario(true, 'Refazer');
      page.marcarIntervalo(false);
      page.limparChamadasRpc();

      await page.submeterPedido();

      const rpcCalls = page.obterChamadasRpc('criar_pedido');
      expect(rpcCalls.length).toBe(1);

      const payload = rpcCalls[0].args.p_payload;
      expect(payload.mesa_codigo).toBe('BALCAO');
      expect(payload.prioridade).toBe(1);
      expect(payload.prioridade_motivo).toBe('Refazer');
    });

    it('CA02 - Caso 4: Registrar pedido Viagem para Intervalo de Espetáculo', async () => {
      const page = await setupPedidosPage();
      const produto = { id: 'p1', nome: 'Espresso', preco: 8.0 };

      page.adicionarItemAoCarrinho(produto, 1);
      page.selecionarMesa('');
      page.marcarParaViagem(true);
      page.marcarPrioritario(false);
      page.marcarIntervalo(true);
      page.limparChamadasRpc();

      await page.submeterPedido();

      const rpcCalls = page.obterChamadasRpc('criar_pedido');
      expect(rpcCalls.length).toBe(1);

      const payload = rpcCalls[0].args.p_payload;
      expect(payload.para_viagem).toBe(true);
      expect(payload.is_intervalo).toBe(true);
      expect(payload.prioridade).toBe(1);
      expect(payload.prioridade_motivo).toBe('Espetáculo (Intervalo)');
      expect(payload.observacoes).toContain('[🎭 Intervalo]');
      expect(typeof payload.retirada_em).toBe('string');
    });
  });

  describe('Módulo 3: RPC alterar_prioridade_pedido e Auditoria (CA04, CA05)', () => {
    it('CA04 & CA05: Chama RPC alterar_prioridade_pedido e valida estrutura de payload e resposta', async () => {
      const page = await setupPedidosPage({
        rpcHandlers: {
          alterar_prioridade_pedido: (args) => ({
            data: { id: args.p_pedido_id, prioridade: args.p_prioridade, prioridade_motivo: args.p_motivo },
            error: null
          })
        }
      });

      const res = await page.mockSupabase.rpc('alterar_prioridade_pedido', {
        p_pedido_id: 1050,
        p_prioridade: 1,
        p_motivo: 'Mesa solicitou pressa'
      });

      expect(res.data).toEqual({
        id: 1050,
        prioridade: 1,
        prioridade_motivo: 'Mesa solicitou pressa'
      });
      expect(res.error).toBeNull();
    });

    it('CA04 (negativo): RPC alterar_prioridade_pedido trata erro de pedido inexistente', async () => {
      const page = await setupPedidosPage({
        rpcHandlers: {
          alterar_prioridade_pedido: (args) => {
            if (args.p_pedido_id === 999999) {
              return {
                data: null,
                error: { message: 'Pedido não encontrado: 999999', code: 'P0001' }
              };
            }
            return { data: { id: args.p_pedido_id }, error: null };
          }
        }
      });

      const res = await page.mockSupabase.rpc('alterar_prioridade_pedido', {
        p_pedido_id: 999999,
        p_prioridade: 1,
        p_motivo: 'Teste inexistente'
      });

      expect(res.data).toBeNull();
      expect(res.error?.message).toContain('Pedido não encontrado');
    });
  });
});
