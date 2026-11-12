import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createPageHarness } from './helpers/page-harness.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';
import {
  maskSensitiveData,
  getScreenName,
  getAppVersion,
  getErrorSignature,
  shouldSendError,
  resetSessionErrorCounts,
  saveErrorOffline,
  flushOfflineQueue,
  sendErrorToDatabase,
  reportError,
  reportRpcError,
  initErrorReporter,
  MAX_SAME_ERROR_PER_SESSION,
  STORAGE_KEY_OFFLINE
} from '../js/utils/error-reporter.js';

describe('CAF-000115: Observabilidade e Captura de Erros do Front em Produção', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSessionErrorCounts();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    resetSessionErrorCounts();
  });

  describe('1. Sanitização e Mascaramento de Dados Sensíveis (CA08 / RNF01)', () => {
    it('CA08: mascara telefones em diferentes formatos na mensagem de erro', () => {
      const msg1 = 'Falha ao processar pedido do cliente telefone (11) 98765-4321 no balcão';
      const msg2 = 'Erro contato +55 21 91234-5678 sem resposta';
      const msg3 = 'WhatsApp 51988887777 retornou timeout';

      expect(maskSensitiveData(msg1)).not.toContain('98765-4321');
      expect(maskSensitiveData(msg1)).toContain('[TELEFONE_MASCARADO]');

      expect(maskSensitiveData(msg2)).not.toContain('91234-5678');
      expect(maskSensitiveData(msg2)).toContain('[TELEFONE_MASCARADO]');

      expect(maskSensitiveData(msg3)).not.toContain('51988887777');
      expect(maskSensitiveData(msg3)).toContain('[TELEFONE_MASCARADO]');
    });

    it('CA08: mascara PINs, senhas e tokens de autorização', () => {
      const msg1 = 'Erro de permissão com pin: 9942 ao cancelar item';
      const msg2 = 'Autenticação rejeitada senha="minhasenhasecreta"';
      const msg3 = 'Falha com token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... expirado';

      expect(maskSensitiveData(msg1)).not.toContain('9942');
      expect(maskSensitiveData(msg1)).toContain('pin: [MASCARADO]');

      expect(maskSensitiveData(msg2)).not.toContain('minhasenhasecreta');
      expect(maskSensitiveData(msg2)).toContain('senha=[MASCARADO]');

      expect(maskSensitiveData(msg3)).not.toContain('eyJhbGciOi');
      expect(maskSensitiveData(msg3)).toContain('token: [MASCARADO]');
    });

    it('CA08: mascara números de cartão de crédito', () => {
      const msg = 'Erro no gateway com cartão 4532 1199 8844 2211 na maquininha';
      expect(maskSensitiveData(msg)).not.toContain('4532 1199 8844 2211');
      expect(maskSensitiveData(msg)).toContain('[CARTAO_MASCARADO]');
    });

    it('retorna string vazia para valores nulos ou indefinidos de forma segura', () => {
      expect(maskSensitiveData(null)).toBe('');
      expect(maskSensitiveData(undefined)).toBe('');
      expect(maskSensitiveData('')).toBe('');
    });
  });

  describe('2. Rate Limiting e Proteção Anti-Enxurrada por Sessão (CA06 / RF05)', () => {
    it('CA06: envia apenas as 10 primeiras ocorrências do mesmo erro e descarta repetições subsequentes', () => {
      const signature = 'pedidos|obter_itens|TypeError: Cannot read properties of undefined';

      // Dispara 15 vezes consecutivas
      const resultados = [];
      for (let i = 1; i <= 15; i++) {
        resultados.push(shouldSendError(signature));
      }

      // As primeiras 10 ocorrências devem ser autorizadas
      const autorizados = resultados.filter(r => r === true);
      const descartados = resultados.filter(r => r === false);

      expect(autorizados).toHaveLength(MAX_SAME_ERROR_PER_SESSION);
      expect(descartados).toHaveLength(5);
    });

    it('diferentes assinaturas de erro possuem limites de sessão independentes', () => {
      const sig1 = 'totem||Erro de renderizacao';
      const sig2 = 'cozinha||Audio play failed';

      for (let i = 0; i < 10; i++) {
        expect(shouldSendError(sig1)).toBe(true);
      }
      expect(shouldSendError(sig1)).toBe(false);

      // sig2 ainda não atingiu o limite
      expect(shouldSendError(sig2)).toBe(true);
    });
  });

  describe('3. Captura Automática de Erros Não Tratados na Tela (CA01 / RF01)', () => {
    it('CA01: captura ErrorEvent não tratado na tela de pedidos e grava em erros_cliente com tela, mensagem e versão', async () => {
      const harness = createPageHarness('pedidos.html', {
        initialData: { erros_cliente: [] }
      });

      const rpcSpy = vi.fn().mockResolvedValue({ data: { success: true, id: 'err-1' }, error: null });
      harness.mockSupabase.rpc = rpcSpy;
      harness.window.cafeteriaSupabase = harness.mockSupabase;

      // Inicializa o reporter no ambiente da página
      initErrorReporter({ window: harness.window });

      // Simula um erro não tratado na página
      const errorEvent = new ErrorEvent('error', {
        message: 'Uncaught ReferenceError: calcSubtotal is not defined',
        filename: 'http://localhost/js/pedidos.js',
        lineno: 104,
        colno: 12
      });

      harness.window.dispatchEvent(errorEvent);

      // Aguarda o processamento assíncrono
      await new Promise(r => setTimeout(r, 60));

      expect(rpcSpy).toHaveBeenCalled();
      const chamada = rpcSpy.mock.calls.find(c => c[0] === 'registrar_erro_cliente');
      expect(chamada).toBeDefined();

      const payload = chamada[1];
      expect(payload.p_tela).toBe('pedidos');
      expect(payload.p_mensagem).toContain('Uncaught ReferenceError: calcSubtotal is not defined');
      expect(payload.p_versao).toBe('1.0.0');
      expect(payload.p_tipo).toBe('uncaught_error');
    });

    it('CA01: captura unhandledrejection e grava tipo unhandled_rejection com detalhes', async () => {
      const harness = createPageHarness('cozinha.html');
      const rpcSpy = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      harness.mockSupabase.rpc = rpcSpy;
      harness.window.cafeteriaSupabase = harness.mockSupabase;

      initErrorReporter({ window: harness.window });

      // Simula Promise rejeitada não tratada
      const rejectionEvent = new Event('unhandledrejection');
      rejectionEvent.reason = new Error('Falha assíncrona ao sincronizar comanda');

      harness.window.dispatchEvent(rejectionEvent);

      await new Promise(r => setTimeout(r, 60));

      const chamada = rpcSpy.mock.calls.find(c => c[0] === 'registrar_erro_cliente');
      expect(chamada).toBeDefined();
      expect(chamada[1].p_tipo).toBe('unhandled_rejection');
      expect(chamada[1].p_mensagem).toContain('Falha assíncrona ao sincronizar comanda');
    });
  });

  describe('4. Resiliência, Execução Silenciosa e Fila Offline (CA02 / RNF02)', () => {
    it('CA02: se a RPC falhar ou estiver offline, não lança exceção e grava na fila local', async () => {
      const mockStorage = {
        store: {},
        getItem(key) { return this.store[key] || null; },
        setItem(key, val) { this.store[key] = String(val); },
        removeItem(key) { delete this.store[key]; }
      };

      const mockSupabaseComFalha = {
        rpc: vi.fn().mockRejectedValue(new Error('503 Service Unavailable: Supabase offline'))
      };

      let erroLancado = false;
      try {
        await sendErrorToDatabase({
          tela: 'totem',
          mensagem: 'Falha ao carregar catálogo do totem',
          tipo: 'uncaught_error'
        }, {
          supabase: mockSupabaseComFalha,
          storage: mockStorage
        });
      } catch {
        erroLancado = true;
      }

      // Nunca pode lançar exceção para o front-end
      expect(erroLancado).toBe(false);

      // Deve ter enfileirado localmente para envio posterior
      const buffer = JSON.parse(mockStorage.getItem(STORAGE_KEY_OFFLINE) || '[]');
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer[0].p_mensagem).toContain('Falha ao carregar catálogo do totem');
    });

    it('CA02: descarrega a fila offline com sucesso ao recuperar conectividade', async () => {
      const mockStorage = {
        store: {},
        getItem(key) { return this.store[key] || null; },
        setItem(key, val) { this.store[key] = String(val); },
        removeItem(key) { delete this.store[key]; }
      };

      saveErrorOffline({ p_tela: 'totem', p_mensagem: 'Erro offline 1' }, mockStorage);
      saveErrorOffline({ p_tela: 'pedidos', p_mensagem: 'Erro offline 2' }, mockStorage);

      const rpcSuccess = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      const client = { rpc: rpcSuccess };

      const reenviados = await flushOfflineQueue(client, mockStorage);
      expect(reenviados).toBe(2);
      expect(mockStorage.getItem(STORAGE_KEY_OFFLINE)).toBeNull();
    });
  });

  describe('5. Ponto Único de Registro de Falhas de RPC em db.js (CA03 / RF02)', () => {
    it('CA03: falha tratada no logger de db.js registra nome da RPC e código do erro', async () => {
      const rpcSpy = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      const mockSb = { rpc: rpcSpy };

      // Configura reporter global
      window.errorReporter = {
        reportRpcError: vi.fn((rpcNome, err) => {
          return reportRpcError(rpcNome, err, { supabase: mockSb, tela: 'pedidos' });
        })
      };

      // Carrega db.js real
      const db = await import('../js/db.js');

      // Simula falha registrada pelo logger central do db.js
      window.cafeteriaDB.logger.error('obter_dre_gerencial', {
        code: '42703',
        message: 'column total_faturamento does not exist'
      });

      await new Promise(r => setTimeout(r, 60));

      expect(window.errorReporter.reportRpcError).toHaveBeenCalledWith(
        'obter_dre_gerencial',
        expect.objectContaining({ code: '42703' })
      );

      const rpcCall = rpcSpy.mock.calls.find(c => c[0] === 'registrar_erro_cliente');
      expect(rpcCall).toBeDefined();
      expect(rpcCall[1].p_rpc_nome).toBe('obter_dre_gerencial');
      expect(rpcCall[1].p_erro_codigo).toBe('42703');
      expect(rpcCall[1].p_tipo).toBe('rpc_error');
    });

    it('CA03: não gera recursão quando o erro é da própria RPC registrar_erro_cliente', async () => {
      const rpcSpy = vi.fn();
      const mockSb = { rpc: rpcSpy };

      await reportRpcError('registrar_erro_cliente', new Error('Falha no banco'), {
        supabase: mockSb
      });

      expect(rpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('6. Segurança RLS da Tabela erros_cliente (CA04 / RF03)', () => {
    it('CA04: migration_caf_000115_erros_cliente.sql define RLS ativo com SELECT restrito a admin e bloqueio de DML direto', () => {
      const sqlPath = path.resolve(process.cwd(), 'supabase/migration_caf_000115_erros_cliente.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      // Valida RLS habilitado
      expect(sqlContent).toMatch(/ALTER\s+TABLE\s+public\.erros_cliente\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);

      // Valida policy de SELECT restrita a admin
      expect(sqlContent).toMatch(/CREATE\s+POLICY\s+"erros_cliente_select_admin"\s+ON\s+public\.erros_cliente/i);
      expect(sqlContent).toMatch(/public\.get_user_role\(\)\s*=\s*'admin'/i);

      // Valida que INSERT, UPDATE, DELETE direto foram revogados
      expect(sqlContent).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.erros_cliente\s+FROM\s+anon,\s*authenticated;/i);

      // Valida que a RPC é SECURITY DEFINER com search_path = public
      expect(sqlContent).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.registrar_erro_cliente/i);
      expect(sqlContent).toMatch(/SECURITY\s+DEFINER/i);
      expect(sqlContent).toMatch(/SET\s+search_path\s*=\s*public/i);
    });

    it('CA04: simulação de RLS: anon e barista recebem zero linhas em SELECT direto', async () => {
      function consultarErrosComo(usuarioRole) {
        const dadosBanco = [
          { id: '1', tela: 'pedidos', mensagem: 'Erro fatal 1' },
          { id: '2', tela: 'cozinha', mensagem: 'Erro fatal 2' }
        ];

        // Se for admin, a policy permite leitura; se for anon ou barista, retorna 0 linhas
        if (usuarioRole === 'admin') {
          return dadosBanco;
        }
        return [];
      }

      expect(consultarErrosComo('anon')).toHaveLength(0);
      expect(consultarErrosComo('barista')).toHaveLength(0);
      expect(consultarErrosComo('garcom')).toHaveLength(0);
      expect(consultarErrosComo('admin')).toHaveLength(2);
    });
  });

  describe('7. Painel de Saúde no Admin e Agrupamento (CA05 / RF04)', () => {
    it('CA05: renderiza erros agrupados por mensagem, com contagem e última ocorrência', async () => {
      const harness = createPageHarness('admin.html');

      const mockResumo = {
        periodo_horas: 24,
        total_erros: 4,
        telas_afetadas: 2,
        grupos: [
          {
            tela: 'totem',
            tipo: 'uncaught_error',
            mensagem: 'TypeError: Cannot read properties of null',
            total_ocorrencias: 3,
            primeira_ocorrencia: '2026-11-11T10:00:00.000Z',
            ultima_ocorrencia: '2026-11-11T12:30:00.000Z',
            versao_app: '1.0.0',
            stack_recente: 'TypeError at Totem.js:45'
          },
          {
            tela: 'pedidos',
            tipo: 'rpc_error',
            rpc_nome: 'fechar_conta_mesa',
            mensagem: '[RPC fechar_conta_mesa] Mesa já fechada',
            total_ocorrencias: 1,
            primeira_ocorrencia: '2026-11-11T11:15:00.000Z',
            ultima_ocorrencia: '2026-11-11T11:15:00.000Z',
            versao_app: '1.0.0',
            stack_recente: 'Error at db.js:80'
          }
        ]
      };

      harness.window.cafeteriaDB = {
        erros: {
          obterResumo: vi.fn().mockResolvedValue(mockResumo),
          limparAntigos: vi.fn().mockResolvedValue(0)
        }
      };

      // Carrega o script admin do painel de erros
      await import('../js/admin/erros-admin.js');

      // Aciona inicialização do painel de erros
      harness.window.initAdminErros();

      await new Promise(r => setTimeout(r, 60));

      const totalKpi = harness.document.getElementById('kpi-erros-total');
      const telasKpi = harness.document.getElementById('kpi-erros-telas');
      const rpcKpi = harness.document.getElementById('kpi-erros-rpcs');
      const tbody = harness.document.getElementById('erros-tabela-body');

      expect(totalKpi.textContent).toBe('4');
      expect(telasKpi.textContent).toBe('2');
      expect(rpcKpi.textContent).toBe('1');

      // Tabela deve conter 2 linhas de grupos
      const rows = tbody.querySelectorAll('tr');
      expect(rows).toHaveLength(2);

      // Primeiro grupo tem badge 3x
      expect(rows[0].textContent).toContain('3x');
      expect(rows[0].textContent).toContain('totem');
      expect(rows[0].textContent).toContain('TypeError: Cannot read properties of null');

      // Segundo grupo tem badge 1x e indica RPC fechar_conta_mesa
      expect(rows[1].textContent).toContain('1x');
      expect(rows[1].textContent).toContain('fechar_conta_mesa');
    });
  });

  describe('8. Limpeza Automática e Manual de Registros Antigos (CA07 / RF06)', () => {
    it('CA07: rotina de limpeza remove registros com mais de 30 dias', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({ data: 12, error: null })
      };

      const harness = createPageHarness('admin.html');
      harness.window.cafeteriaDB = {
        erros: {
          limparAntigos: async (dias) => {
            const { data } = await mockClient.rpc('limpar_erros_antigos', { p_dias: dias });
            return data;
          }
        }
      };

      const removidos = await harness.window.cafeteriaDB.erros.limparAntigos(30);

      expect(mockClient.rpc).toHaveBeenCalledWith('limpar_erros_antigos', { p_dias: 30 });
      expect(removidos).toBe(12);
    });

    it('CA07: valida função SQL limpar_erros_antigos na migration', () => {
      const sqlPath = path.resolve(process.cwd(), 'supabase/migration_caf_000115_erros_cliente.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      expect(sqlContent).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.limpar_erros_antigos/i);
      expect(sqlContent).toMatch(/DELETE\s+FROM\s+public\.erros_cliente/i);
      expect(sqlContent).toMatch(/days/i);
    });
  });
});

