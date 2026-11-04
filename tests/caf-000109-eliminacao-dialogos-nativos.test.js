// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupPedidosPage, setupAuthMock } from './helpers/pedidos-page.js';
import { createPageHarness } from './helpers/page-harness.js';

describe('CAF-000109: Eliminação de Diálogos Nativos Bloqueantes e Modal de Recebimento do Totem', () => {
  let page;
  let harness;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (page?.harness?.cleanup) page.harness.cleanup();
    if (harness?.cleanup) harness.cleanup();
  });

  describe('CA01: Recebimento de Pedido do Totem no PDV com Botões de Seleção de Forma de Pagamento', () => {
    it('CA01: abre modal com botões Pix, Cartão Débito, Cartão Crédito e Dinheiro e envia cartao_debito ao clicar em Cartão Débito sem usar window.prompt', async () => {
      page = await setupPedidosPage({
        initialData: {
          pedidos: [
            {
              id: 777,
              numero_pedido: 'TOT-77',
              mesa_codigo: 'TOTEM',
              cliente_nome: 'Mariana Totem',
              total: 34.5,
              status: 'aguardando_pagamento',
              status_pagamento: 'pendente',
              forma_pagamento: 'pix',
              origem: 'totem',
              created_at: new Date().toISOString()
            }
          ]
        }
      });

      const promptSpy = window.prompt;
      let recebidoArgs = null;
      page.mockRpc('receber_pedido_totem', async (args) => {
        recebidoArgs = args;
        return { data: { sucesso: true }, error: null };
      });

      const promiseReceber = window.baristaReceberPedidoTotem(777);

      // Aguarda renderização do modal
      await new Promise(r => setTimeout(r, 20));
      const modalTotem = document.getElementById('modal-receber-totem');
      expect(modalTotem).toBeTruthy();
      expect(modalTotem.classList.contains('hidden')).toBe(false);

      const botoes = Array.from(modalTotem.querySelectorAll('.btn-pagto-totem'));
      expect(botoes.map(b => b.dataset.forma)).toEqual([
        'pix',
        'cartao_debito',
        'cartao_credito',
        'dinheiro'
      ]);

      // Toca no botão "Cartão Débito"
      const btnDebito = modalTotem.querySelector('.btn-pagto-totem[data-forma="cartao_debito"]');
      btnDebito.click();

      await promiseReceber;

      expect(promptSpy).not.toHaveBeenCalled();
      expect(recebidoArgs).toEqual({
        p_pedido_id: 777,
        p_forma_pagamento: 'cartao_debito'
      });
    });
  });

  describe('CA02: Substituição de prompt() de motivos no PDV por Bottom Sheet com chips de motivos rápidos', () => {
    it('CA02: exibe chips de motivos rápidos no cancelamento de item e seleciona motivo com 1 toque sem window.prompt', async () => {
      page = await setupPedidosPage();
      const promptSpy = window.prompt;

      let cancelArgs = null;
      page.mockRpc('cancelar_item', async (args) => {
        cancelArgs = args;
        return { data: { sucesso: true }, error: null };
      });

      const promiseCancelar = window.baristaCancelarItem(1, 101, '02');
      await new Promise(r => setTimeout(r, 20));

      const modalPrompt = document.getElementById('modal-prompt-sheet');
      expect(modalPrompt).toBeTruthy();
      expect(modalPrompt.classList.contains('hidden')).toBe(false);

      const chip = modalPrompt.querySelector('.prompt-chip[data-chip-val="Produto em falta"]');
      expect(chip).toBeTruthy();
      chip.click();

      const btnOk = modalPrompt.querySelector('#modal-prompt-ok');
      btnOk.click();

      await promiseCancelar;

      expect(promptSpy).not.toHaveBeenCalled();
      expect(cancelArgs).toEqual({
        p_item_id: 1,
        p_motivo: 'Produto em falta'
      });
    });
  });

  describe('CA03: Tela da Cozinha (KDS) exibe toasts e modal próprio sem window.alert ou window.prompt', () => {
    it('CA03: showKdsPromptSheet abre modal de prioridade com chips rápidos no KDS e showKdsToast exibe aviso sem alert', async () => {
      harness = createPageHarness('cozinha.html', {
        initialData: {
          perfis: [{ id: 'u1', nome: 'Cozinha', role: 'cozinha', ativo: true }]
        }
      });
      setupAuthMock(harness.mockSupabase, { id: 'u1', email: 'cozinha@cafeteria.com' });
      const alertSpy = vi.fn();
      const promptSpy = vi.fn();
      window.alert = alertSpy;
      window.prompt = promptSpy;

      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/cozinha.js');

      window.showKdsToast('Aviso de teste no KDS', 'error');
      expect(alertSpy).not.toHaveBeenCalled();

      const pMotivo = window.showKdsPromptSheet({
        titulo: 'Priorizar Pedido',
        opcoesRapidas: ['Espetáculo', 'Refazer']
      });
      await new Promise(r => setTimeout(r, 15));

      const modalKds = document.getElementById('kds-modal-prompt');
      expect(modalKds).toBeTruthy();
      const chipRefazer = modalKds.querySelector('.prompt-chip[data-chip-val="Refazer"]');
      chipRefazer.click();
      modalKds.querySelector('#kds-prompt-ok').click();

      const motivoEscolhido = await pMotivo;
      expect(motivoEscolhido).toBe('Refazer');
      expect(promptSpy).not.toHaveBeenCalled();
    });
  });

  describe('CA04: Totem exibe modal de erro próprio com botão grande sem window.alert', () => {
    it('CA04: totemExibirModalErro renderiza modal de erro acessível com botão de 56px+ sem chamar window.alert', async () => {
      harness = createPageHarness('totem.html');
      const alertSpy = vi.fn();
      window.alert = alertSpy;

      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/totem.js');

      window.totemExibirModalErro('Não foi possível registrar o pedido: Produto esgotado');

      const modalErro = document.getElementById('totem-modal-erro');
      expect(modalErro).toBeTruthy();
      expect(modalErro.getAttribute('role')).toBe('alertdialog');
      expect(modalErro.textContent).toContain('Produto esgotado');

      const btnOk = document.getElementById('totem-modal-erro-ok');
      expect(btnOk.style.minHeight).toBe('56px');
      btnOk.click();

      expect(modalErro.classList.contains('hidden')).toBe(true);
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('CA05: Cardápio Digital utiliza toast e bottom sheet de confirmação sem alert/confirm', () => {
    it('CA05: cardapioShowToast e cardapioConfirmSheet funcionam no DOM sem acionar window.alert ou window.confirm', async () => {
      harness = createPageHarness('cardapio.html');
      const alertSpy = vi.fn();
      const confirmSpy = vi.fn();
      window.alert = alertSpy;
      window.confirm = confirmSpy;

      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/cardapio-cliente-pedido.js');

      window.cardapioShowToast('Por favor, informe seu nome para identificação do pedido.', 'warning');
      const toastEl = document.querySelector('#cardapio-toast-container .cardapio-toast');
      expect(toastEl).toBeTruthy();
      expect(toastEl.textContent).toContain('informe seu nome');

      const pConfirm = window.cardapioConfirmSheet({
        titulo: 'Chamar Atendente',
        mensagem: 'Deseja chamar o atendente para a mesa 04?'
      });
      await new Promise(r => setTimeout(r, 15));

      const modalConfirm = document.getElementById('cardapio-modal-confirm');
      expect(modalConfirm).toBeTruthy();
      modalConfirm.querySelector('#cardapio-confirm-ok').click();

      const ok = await pConfirm;
      expect(ok).toBe(true);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  describe('CA06: Painel Admin possui admin.prompt(), admin.confirm() e admin.toast()', () => {
    it('CA06: admin.prompt renderiza modal com chips de opção e retorna o valor confirmado sem window.prompt', async () => {
      harness = createPageHarness('admin.html');
      const promptSpy = vi.fn();
      window.prompt = promptSpy;

      await harness.carregarScript('js/supabase-client.js');
      await harness.carregarScript('js/db.js');
      await harness.carregarScript('js/admin/main.js');

      const adminApi = window.cafeteriaAdmin || window.admin;
      expect(typeof adminApi?.prompt).toBe('function');

      const pValor = adminApi.prompt({
        title: 'Reabrir Caixa Fechado',
        msg: 'Digite o motivo obrigatório:',
        options: ['Correção de lançamento']
      });
      await new Promise(r => setTimeout(r, 15));

      const overlay = document.getElementById('admin-prompt-overlay');
      expect(overlay).toBeTruthy();
      const chip = overlay.querySelector('.prompt-chip[data-chip-val="Correção de lançamento"]');
      chip.click();
      overlay.querySelector('#admin-prompt-ok').click();

      const res = await pValor;
      expect(res).toBe('Correção de lançamento');
      expect(promptSpy).not.toHaveBeenCalled();
    });
  });
});
