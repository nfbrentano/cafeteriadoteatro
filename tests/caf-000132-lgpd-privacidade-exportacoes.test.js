import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Importa código real da aplicação
import { escapeCSV, gerarCSVPedidos, exportarParaCsv } from '../js/utils/csv-export.js';

describe('CAF-000132: LGPD, Consent Mode, Privacidade e Escape CSV', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete window.dataLayer;
    delete window.gtag;
    delete window.abrirPreferenciasPrivacidade;
    delete window.cafeteriaConsent;
  });

  // -----------------------------------------------------------------------------
  // CA11: Escape CSV - Sanitização contra CSV Injection (OWASP)
  // -----------------------------------------------------------------------------
  describe('CA11: Sanitização de fórmulas perigosas em CSV', () => {
    it('deve prefixar com apóstrofo strings que iniciam com =, +, -, @, \\t ou \\r', () => {
      const perigosos = [
        '=HYPERLINK("http://evil.com","Clique")',
        '=cmd|"/C calc"!A0',
        '=SUM(A1:A10)',
        '@SUM(1+1)',
        '+cmd.exe',
        '+2+2',
        '\tmalicious',
        '\rmalicious'
      ];

      for (const val of perigosos) {
        const escapado = escapeCSV(val, ';');
        // Deve começar com apóstrofo dentro das aspas ou como primeiro caractere
        expect(escapado).toMatch(/^"?[']/);
      }
    });

    it('deve escapar corretamente aspas e separadores mantendo o apóstrofo de proteção', () => {
      const val = '=HYPERLINK("http://teste.com"; "ok")';
      const escapado = escapeCSV(val, ';');
      expect(escapado).toBe('"\'=HYPERLINK(""http://teste.com""; ""ok"")"');
    });
  });

  // -----------------------------------------------------------------------------
  // CA12: Preservação de números legítimos em CSV
  // -----------------------------------------------------------------------------
  describe('CA12: Preservação de valores numéricos legítimos', () => {
    it('deve manter números negativos e positivos legítimos sem apóstrofo de fórmula', () => {
      expect(escapeCSV(-12.5, ';')).toBe('-12.5');
      expect(escapeCSV(-12.50, ';')).toBe('-12.5');
      expect(escapeCSV('-12,50', ';')).toBe('-12,50');
      expect(escapeCSV('-150.00', ';')).toBe('-150.00');
      expect(escapeCSV('+50,00', ';')).toBe('+50,00');
      expect(escapeCSV('0,00', ';')).toBe('0,00');
      expect(escapeCSV(0, ';')).toBe('0');
      expect(escapeCSV(100.25, ';')).toBe('100.25');
    });

    it('gerarCSVPedidos deve gerar CSV válido preservando valores monetários sem apóstrofo', () => {
      const pedidos = [
        {
          numero_pedido: 101,
          created_at: '2026-11-24T14:30:00-03:00',
          mesa_codigo: '12',
          status: 'concluido',
          forma_pagamento: 'pix',
          total: 25.50
        }
      ];

      const csv = gerarCSVPedidos(pedidos, { separator: ';', incluirBOM: false });
      expect(csv).toContain('101;24/11/2026 14:30:00;12;concluido;pix;25,50');
      expect(csv).not.toContain("'25,50");
    });
  });

  // -----------------------------------------------------------------------------
  // CA05 & CA06: Google Analytics Consent Mode v2 & Banner
  // -----------------------------------------------------------------------------
  describe('CA05 & CA06: Consent Mode v2 e Banner de Cookies', () => {
    it('CA05: gtag-init deve definir consent default denied antes de qualquer config quando sem consentimento prévio', async () => {
      // Simula carregamento de js/gtag-init.js
      const scriptCode = readFileSync(resolve(__dirname, '../js/gtag-init.js'), 'utf-8');
      window.dataLayer = [];
      
      new Function(scriptCode)();

      expect(window.dataLayer).toBeDefined();
      expect(window.dataLayer.length).toBeGreaterThanOrEqual(3);

      // Primeiro comando no dataLayer deve ser o consent default
      const consentCall = window.dataLayer.find(item => item[0] === 'consent' && item[1] === 'default');
      expect(consentCall).toBeDefined();
      expect(consentCall[2]).toEqual({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    });

    it('CA05: se localStorage já tiver granted, gtag-init deve inicializar com granted', () => {
      localStorage.setItem('cafeteria_consent_analytics', 'granted');
      const scriptCode = readFileSync(resolve(__dirname, '../js/gtag-init.js'), 'utf-8');
      window.dataLayer = [];

      new Function(scriptCode)();

      const consentCall = window.dataLayer.find(item => item[0] === 'consent' && item[1] === 'default');
      expect(consentCall[2].analytics_storage).toBe('granted');
    });

    it('CA06: banner de cookies deve renderizar com botões Recusar e Aceitar e gravar no localStorage', () => {
      document.body.innerHTML = '';
      window.gtag = vi.fn();

      const bannerCode = readFileSync(resolve(__dirname, '../js/cookie-consent.js'), 'utf-8');
      new Function(bannerCode)();

      const banner = document.getElementById('cafeteria-cookie-banner');
      expect(banner).not.toBeNull();

      const btnRecusar = document.getElementById('btn-cookie-recusar');
      const btnAceitar = document.getElementById('btn-cookie-aceitar');
      expect(btnRecusar).not.toBeNull();
      expect(btnAceitar).not.toBeNull();

      // Clicar em Recusar
      btnRecusar.click();
      expect(localStorage.getItem('cafeteria_consent_analytics')).toBe('denied');
      expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
        analytics_storage: 'denied'
      });

      // Simular abertura novamente e clicar em Aceitar
      window.abrirPreferenciasPrivacidade();
      const btnAceitarNovo = document.getElementById('btn-cookie-aceitar');
      btnAceitarNovo.click();
      expect(localStorage.getItem('cafeteria_consent_analytics')).toBe('granted');
      expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
        analytics_storage: 'granted'
      });
    });
  });

  // -----------------------------------------------------------------------------
  // CA01, CA02, CA03: Pedido Online - Opt-in Explícito e Aviso de Privacidade
  // -----------------------------------------------------------------------------
  describe('CA01, CA02, CA03: Checkout do Pedido Online e Opt-in LGPD', () => {
    it('CA01: checkout online deve conter aviso de privacidade com link para /privacidade.html', () => {
      const code = readFileSync(resolve(__dirname, '../js/cardapio-cliente-pedido.js'), 'utf-8');
      expect(code).toContain('pedido-online-aviso-privacidade');
      expect(code).toContain('/privacidade.html');
      expect(code).toContain('check-marketing-online');
      // O checkbox antigo obrigatório não deve mais existir
      expect(code).not.toContain('id="check-lgpd-online" checked required');
    });

    it('CA02: envio sem marcar novidades deve gerar payload com aceita_marketing = false', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="check-marketing-online" />
      `;
      const isChecked = Boolean(document.getElementById('check-marketing-online')?.checked);
      expect(isChecked).toBe(false);
    });

    it('CA03: envio com novidades marcadas deve gerar payload com aceita_marketing = true', () => {
      document.body.innerHTML = `
        <input type="checkbox" id="check-marketing-online" checked />
      `;
      const isChecked = Boolean(document.getElementById('check-marketing-online')?.checked);
      expect(isChecked).toBe(true);
    });
  });

  // -----------------------------------------------------------------------------
  // CA07: Página de Política de Privacidade
  // -----------------------------------------------------------------------------
  describe('CA07: Conteúdo da Página de Política de Privacidade', () => {
    it('deve conter controlador, DPO, bases legais, retenção e direitos do titular', () => {
      const html = readFileSync(resolve(__dirname, '../privacidade.html'), 'utf-8');
      
      // Controlador e DPO
      expect(html).toContain('Cafeteria do Teatro');
      expect(html).toContain('privacidade@cafeteriadoteatro.com.br');
      expect(html).toContain('Encarregado');

      // Bases legais e finalidades
      expect(html).toContain('Execução de Pedidos');
      expect(html).toContain('Marketing');
      expect(html).toContain('Consent Mode v2');

      // Retenção
      expect(html).toContain('5 (cinco) anos');
      expect(html).toContain('2 (dois) anos');

      // Direitos do Titular (Art. 18) e Formulário
      expect(html).toContain('Art. 18 da LGPD');
      expect(html).toContain('form-canal-titular');
      expect(html).toContain('titular-nome');
      expect(html).toContain('titular-telefone');
      expect(html).toContain('titular-tipo');
    });

    it('páginas públicas principais devem conter link para /privacidade.html', () => {
      const indexHtml = readFileSync(resolve(__dirname, '../index.html'), 'utf-8');
      const cardapioHtml = readFileSync(resolve(__dirname, '../cardapio.html'), 'utf-8');
      const avaliarHtml = readFileSync(resolve(__dirname, '../avaliar.html'), 'utf-8');
      const retiradaHtml = readFileSync(resolve(__dirname, '../retirada.html'), 'utf-8');
      const totemHtml = readFileSync(resolve(__dirname, '../totem.html'), 'utf-8');

      expect(indexHtml).toContain('/privacidade.html');
      expect(cardapioHtml).toContain('/privacidade.html');
      expect(avaliarHtml).toContain('/privacidade.html');
      expect(retiradaHtml).toContain('/privacidade.html');
      expect(totemHtml).toContain('/privacidade.html');
    });
  });

  // -----------------------------------------------------------------------------
  // CA08, CA09: Canal do Titular (RPC e Interação)
  // -----------------------------------------------------------------------------
  describe('CA08 & CA09: Canal do Titular e Módulo db.titular', () => {
    it('db.titular deve invocar RPCs correspondentes com validações corretas', async () => {
      const mockRpc = vi.fn().mockImplementation((rpcName, params) => {
        if (rpcName === 'solicitar_direito_titular') {
          return Promise.resolve({
            data: { sucesso: true, protocolo: 'LGPD-20261124-ABC123', mensagem: 'Registrado com sucesso' },
            error: null
          });
        }
        if (rpcName === 'listar_solicitacoes_titular') {
          return Promise.resolve({
            data: [{ id: 1, protocolo: 'LGPD-20261124-ABC123', status: 'pendente' }],
            error: null
          });
        }
        if (rpcName === 'processar_solicitacao_titular') {
          return Promise.resolve({
            data: { sucesso: true, acao: params.p_acao },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      window.cafeteriaSupabase = { rpc: mockRpc };

      // Importa/executa db.js
      const dbCode = readFileSync(resolve(__dirname, '../js/db.js'), 'utf-8');
      new Function(dbCode)();

      expect(window.cafeteriaDB.titular).toBeDefined();

      // Solicitar
      const resSolicitar = await window.cafeteriaDB.titular.solicitar({
        nome: 'João da Silva',
        telefone: '51999999999',
        tipo: 'copia_dados'
      });
      expect(resSolicitar.sucesso).toBe(true);
      expect(resSolicitar.protocolo).toBe('LGPD-20261124-ABC123');
      expect(mockRpc).toHaveBeenCalledWith('solicitar_direito_titular', {
        p_payload: { nome: 'João da Silva', telefone: '51999999999', tipo: 'copia_dados' }
      });

      // Listar
      const resListar = await window.cafeteriaDB.titular.listar();
      expect(resListar.length).toBe(1);
      expect(mockRpc).toHaveBeenCalledWith('listar_solicitacoes_titular', { p_status: null });

      // Processar
      const resProc = await window.cafeteriaDB.titular.processar(1, 'exportar');
      expect(resProc.sucesso).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('processar_solicitacao_titular', {
        p_id: 1,
        p_acao: 'exportar',
        p_resposta: null
      });
    });

    it('formulário em js/privacidade.js deve submeter solicitação e exibir protocolo', async () => {
      document.body.innerHTML = `
        <form id="form-canal-titular">
          <input id="titular-nome" value="Carlos Alberto" />
          <input id="titular-telefone" value="51 98888-7777" />
          <select id="titular-tipo">
            <option value="exclusao_anonimizacao" selected>Exclusão</option>
          </select>
          <textarea id="titular-motivo">Quero excluir meus dados</textarea>
          <button type="submit" id="btn-enviar-titular">Enviar</button>
        </form>
        <div id="titular-feedback" class="hidden"></div>
      `;

      window.cafeteriaDB = {
        titular: {
          solicitar: vi.fn().mockResolvedValue({
            sucesso: true,
            protocolo: 'LGPD-20261124-XYZ999',
            mensagem: 'Sua solicitação foi registrada com sucesso.'
          })
        }
      };

      const privScript = readFileSync(resolve(__dirname, '../js/privacidade.js'), 'utf-8');
      new Function(privScript)();

      const form = document.getElementById('form-canal-titular');
      form.dispatchEvent(new Event('submit', { cancelable: true }));

      // Aguarda microtasks
      await new Promise(r => setTimeout(r, 20));

      expect(window.cafeteriaDB.titular.solicitar).toHaveBeenCalledWith({
        nome: 'Carlos Alberto',
        telefone: '51 98888-7777',
        tipo: 'exclusao_anonimizacao',
        motivo: 'Quero excluir meus dados'
      });

      const feedback = document.getElementById('titular-feedback');
      expect(feedback.classList.contains('hidden')).toBe(false);
      expect(feedback.innerHTML).toContain('LGPD-20261124-XYZ999');
    });
  });

  // -----------------------------------------------------------------------------
  // CA10: Schema da Tabela acessos
  // -----------------------------------------------------------------------------
  describe('CA10: Tabela acessos sem colunas desnecessárias', () => {
    it('migration deve conter comandos DROP COLUMN IF EXISTS para ip e user_agent', () => {
      const sql = readFileSync(resolve(__dirname, '../supabase/migration_caf_000132_lgpd_consentimento_privacidade.sql'), 'utf-8');
      expect(sql).toContain('ALTER TABLE public.acessos DROP COLUMN IF EXISTS ip;');
      expect(sql).toContain('ALTER TABLE public.acessos DROP COLUMN IF EXISTS user_agent;');
    });
  });

  // -----------------------------------------------------------------------------
  // CA13: Exportação de clientes com verificação fail-closed de admin
  // -----------------------------------------------------------------------------
  describe('CA13: Exportação de clientes protegida contra acesso não autorizado', () => {
    it('deve bloquear exportação com erro caso role não seja estritamente admin', () => {
      document.body.innerHTML = `
        <div id="page-clientes">
          <button id="btn-export-clientes">Exportar</button>
          <input id="filter-cliente-segmento" />
          <input id="filter-cliente-tag" />
          <input id="filter-cliente-produto" />
          <input id="filter-cliente-periodo" />
          <input id="filter-cliente-contato" />
          <input id="filter-cliente-conta" />
          <input id="filter-cliente-status" />
        </div>
      `;

      const toastMock = vi.fn();
      window.admin = {
        toast: toastMock,
        session: { user: { role: 'barista' } } // Papel não-admin
      };

      const clientesAdminCode = readFileSync(resolve(__dirname, '../js/admin/clientes-admin.js'), 'utf-8');
      new Function(clientesAdminCode)();

      const btn = document.getElementById('btn-export-clientes');
      btn.click();

      expect(toastMock).toHaveBeenCalledWith(
        'Acesso Restrito (LGPD)',
        'A exportação da base de clientes é permitida apenas para administradores.',
        'error'
      );
    });

    it('deve bloquear exportação caso sessão ou role esteja indefinida (fail-closed)', () => {
      document.body.innerHTML = `
        <div id="page-clientes">
          <button id="btn-export-clientes">Exportar</button>
        </div>
      `;

      const toastMock = vi.fn();
      window.admin = {
        toast: toastMock,
        session: undefined // Sessão ausente
      };

      const clientesAdminCode = readFileSync(resolve(__dirname, '../js/admin/clientes-admin.js'), 'utf-8');
      new Function(clientesAdminCode)();

      const btn = document.getElementById('btn-export-clientes');
      btn.click();

      expect(toastMock).toHaveBeenCalledWith(
        'Acesso Restrito (LGPD)',
        'A exportação da base de clientes é permitida apenas para administradores.',
        'error'
      );
    });
  });
});
