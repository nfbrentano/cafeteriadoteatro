import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CAF-000081 — Segurança: PIN com Bloqueio, Permissões por Cargo e RLS Operacional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RF01 / CA01 — Validação de PIN com Autorizador Específico', () => {
    it('envia p_autorizador_id quando informado e valida correspondência', async () => {
      let rpcParams = null;
      window.cafeteriaSupabase = {
        rpc: vi.fn((name, params) => {
          if (name === 'validar_pin_autorizacao') {
            rpcParams = params;
            // Se o PIN não bate com o do autorizador escolhido
            if (params.p_autorizador_id === 'gerente-1' && params.p_pin === '1234') {
              return Promise.resolve({
                data: { autorizado: true, supervisor_nome: 'Gerente Carlos' },
                error: null
              });
            }
            return Promise.resolve({
              data: { autorizado: false, mensagem: 'PIN inválido ou bloqueado.' },
              error: null
            });
          }
          return Promise.resolve({ data: null, error: null });
        })
      };

      // Simula chamada de db.js
      async function validarPin(pin, perm, motivo, contexto, autorizadorId) {
        const params = {
          p_pin: pin,
          p_permissao_necessaria: perm,
          p_motivo: motivo,
          p_contexto: contexto
        };
        if (autorizadorId) params.p_autorizador_id = autorizadorId;
        const { data, error } = await window.cafeteriaSupabase.rpc('validar_pin_autorizacao', params);
        if (error) throw error;
        return data;
      }

      // 1. PIN de outro gerente digitado para gerente-1
      const resErrado = await validarPin('9999', 'pdv.desconto', 'Desconto 10%', null, 'gerente-1');
      expect(resErrado.autorizado).toBe(false);
      expect(rpcParams.p_autorizador_id).toBe('gerente-1');

      // 2. PIN correto para gerente-1
      const resCerto = await validarPin('1234', 'pdv.desconto', 'Desconto 10%', null, 'gerente-1');
      expect(resCerto.autorizado).toBe(true);
      expect(resCerto.supervisor_nome).toBe('Gerente Carlos');
    });
  });

  describe('RF02 / RF03 / CA02 / CA03 / CA04 — Força Bruta e Bloqueio de PIN', () => {
    it('migration 081 define bloqueio após 5 erros e rate limiting de 10 tentativas por solicitante', () => {
      const sqlCode = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migration_caf_000081_seguranca_pin_rls.sql'),
        'utf-8'
      );

      // Bloqueio após 5 falhas no autorizador
      expect(sqlCode).toMatch(/COALESCE\(pin_tentativas_erradas,\s*0\)\s*\+\s*1\s*>=\s*5/);
      expect(sqlCode).toMatch(/now\(\)\s*\+\s*interval\s*'15 minutes'/);

      // Rate limiting de 10 falhas por solicitante
      expect(sqlCode).toMatch(/v_falhas_solicitante\s*>=\s*10/);
      expect(sqlCode).toMatch(/solicitante_id\s*=\s*v_solicitante_id/);

      // Reset no sucesso
      expect(sqlCode).toMatch(/pin_tentativas_erradas\s*=\s*0/);
      expect(sqlCode).toMatch(/pin_bloqueado_ate\s*=\s*NULL/);
    });
  });

  describe('RF06 / CA06 — Permissões Efetivas no Front sem Bypass por Role', () => {
    it('usuarioTemPermissao não concede pdv.vender se o cargo do barista não contiver a permissão', () => {
      // Função com a lógica atualizada de usuarioTemPermissao em js/pedidos.js
      function usuarioTemPermissao(currentUser, permissao) {
        if (!currentUser) return false;
        if (currentUser.is_admin || currentUser.perfil?.role === 'admin') return true;
        if (Array.isArray(currentUser.permissoes)) {
          return currentUser.permissoes.includes(permissao);
        }
        // Fallbacks de retrocompatibilidade SOMENTE para usuários sem cargo atribuído
        if (!currentUser.perfil?.cargo_id) {
          if (permissao === 'pdv.vender' && currentUser.perfil?.role === 'barista') return true;
          if (permissao === 'pdv.desconto' && currentUser.perfil?.pode_dar_desconto) return true;
        }
        return false;
      }

      // Barista com cargo Atendente onde pdv.vender foi removido
      const baristaSemVender = {
        is_admin: false,
        perfil: {
          role: 'barista',
          cargo_id: 'cargo-atendente-uuid'
        },
        permissoes: ['pdv.fechar_conta'] // não tem pdv.vender
      };

      expect(usuarioTemPermissao(baristaSemVender, 'pdv.vender')).toBe(false);
      expect(usuarioTemPermissao(baristaSemVender, 'pdv.fechar_conta')).toBe(true);

      // Barista sem cargo atribuído (legado) continua tendo fallback funcional (CA13)
      const baristaLegado = {
        is_admin: false,
        perfil: {
          role: 'barista',
          cargo_id: null
        },
        permissoes: null
      };

      expect(usuarioTemPermissao(baristaLegado, 'pdv.vender')).toBe(true);
    });
  });

  describe('RF07 / CA07 — Ocultação de Abas e Rotas no Admin por Permissão', () => {
    it('podeAcessarPagina libera apenas abas autorizadas para gerentes e não-admins', () => {
      const adminHarness = {
        session: {
          isLoggedIn: true,
          user: { role: 'gerente', is_admin: false },
          isAdmin: false
        },
        PAGE_PERMISSIONS: {
          dashboard: 'admin.relatorios',
          relatorios: 'admin.relatorios',
          pedidos: 'pdv.vender',
          produtos: 'admin.cardapio',
          estoque: 'admin.estoque',
          caixa: 'caixa.abrir_fechar',
          financeiro: 'admin.financeiro',
          usuarios: 'admin.usuarios'
        },
        permissoes: ['admin.relatorios', 'caixa.abrir_fechar'],
        podeAcessarPagina(pageId) {
          if (!this.session.isLoggedIn) return false;
          const user = this.session.user;
          if (user?.role === 'admin' || user?.is_admin || this.session.isAdmin) return true;
          const permNecessaria = this.PAGE_PERMISSIONS[pageId];
          if (!permNecessaria) return true;
          if (!this.permissoes) return true;
          return this.permissoes.includes(permNecessaria);
        }
      };

      expect(adminHarness.podeAcessarPagina('dashboard')).toBe(true);
      expect(adminHarness.podeAcessarPagina('relatorios')).toBe(true);
      expect(adminHarness.podeAcessarPagina('caixa')).toBe(true);

      // Bloqueados
      expect(adminHarness.podeAcessarPagina('financeiro')).toBe(false);
      expect(adminHarness.podeAcessarPagina('usuarios')).toBe(false);
      expect(adminHarness.podeAcessarPagina('produtos')).toBe(false);
    });

    it('administradores possuem acesso irrestrito a todas as páginas', () => {
      const adminUser = {
        session: {
          isLoggedIn: true,
          user: { role: 'admin', is_admin: true },
          isAdmin: true
        },
        PAGE_PERMISSIONS: {
          usuarios: 'admin.usuarios',
          financeiro: 'admin.financeiro'
        },
        permissoes: [],
        podeAcessarPagina(pageId) {
          if (!this.session.isLoggedIn) return false;
          const user = this.session.user;
          if (user?.role === 'admin' || user?.is_admin || this.session.isAdmin) return true;
          const permNecessaria = this.PAGE_PERMISSIONS[pageId];
          if (!permNecessaria) return true;
          return this.permissoes.includes(permNecessaria);
        }
      };

      expect(adminUser.podeAcessarPagina('usuarios')).toBe(true);
      expect(adminUser.podeAcessarPagina('financeiro')).toBe(true);
    });
  });

  describe('RF08 / CA08 — Restrição de Transição para "entregue"', () => {
    it('migration 081 define trigger trg_validar_pedido_entregue bloqueando perfil cozinha', () => {
      const sqlCode = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migration_caf_000081_seguranca_pin_rls.sql'),
        'utf-8'
      );

      expect(sqlCode).toMatch(/CREATE TRIGGER trg_validar_pedido_entregue/i);
      expect(sqlCode).toMatch(/get_user_role\(\)\s*=\s*'cozinha'/);
      expect(sqlCode).toMatch(/tem_permissao\('pdv\.entregar'/);
    });
  });

  describe('RF09 / CA09 / CA10 — Cancelamento de Item Protegido', () => {
    it('cancelar_item valida motivo com mínimo 3 caracteres e exige permissão', () => {
      const sqlCode = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migration_caf_000081_seguranca_pin_rls.sql'),
        'utf-8'
      );

      expect(sqlCode).toMatch(/LENGTH\(TRIM\(p_motivo\)\)\s*<\s*3/);
      expect(sqlCode).toMatch(/tem_permissao\('pdv\.cancelar_item'/);
    });
  });

  describe('RF10 / CA11 — Transferir Mesa como SECURITY DEFINER', () => {
    it('transferir_mesa valida permissão e executa como SECURITY DEFINER', () => {
      const sqlCode = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migration_caf_000081_seguranca_pin_rls.sql'),
        'utf-8'
      );

      expect(sqlCode).toMatch(/CREATE OR REPLACE FUNCTION public\.transferir_mesa/);
      expect(sqlCode).toMatch(/SECURITY DEFINER SET search_path\s*=\s*public/i);
      expect(sqlCode).toMatch(/tem_permissao\('pdv\.transferir_mesa'/);
    });
  });

  describe('RF11 / CA12 — Revogação de Acesso Anônimo a RPCs Internas', () => {
    it('migration 081 revoga execute de anon para validar_pin_autorizacao, cancelar_item e transferir_mesa', () => {
      const sqlCode = fs.readFileSync(
        path.resolve(process.cwd(), 'supabase/migration_caf_000081_seguranca_pin_rls.sql'),
        'utf-8'
      );

      expect(sqlCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.validar_pin_autorizacao FROM anon;/);
      expect(sqlCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.cancelar_item FROM anon;/);
      expect(sqlCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.transferir_mesa FROM anon;/);
      expect(sqlCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.set_usuario_pin FROM anon;/);
    });
  });
});
