/* =========================================================
   PDV — IMPRESSÃO & COMPARTILHAMENTO DIGITAL DE COMPROVANTES
   ========================================================= */

import { estadoPDV } from './estado.js';

export function registrarImpressaoPDV() {
  const { modalMesaPrint, fecharContaNumPessoas } = estadoPDV.refs;

  function obterDadosComprovanteAtual(origem = 'mesa') {
    const { currentFechamento, currentSelectedMesaParaConta } = estadoPDV;
    const fecharContaModo = estadoPDV.refs.fecharContaModo;
    let mesa = null;
    let pedidos = [];
    let subtotal = 0;
    let desconto = 0;
    let taxa = 0;
    let total = 0;
    let divisaoPessoas = 1;
    let pagamentos = [];
    let clienteNome = null;
    let clienteTelefone = null;
    let pedidoId = null;

    if (origem === 'fechamento' && currentFechamento) {
      mesa = currentFechamento.mesaCodigo;
      pedidos = currentFechamento.pedidos || [];
      subtotal = currentFechamento.subtotal || 0;
      desconto = currentFechamento.descontoAplicado || 0;
      taxa = currentFechamento.taxaServico || 0;
      total = currentFechamento.totalConta || (subtotal - desconto + taxa);
      pagamentos = currentFechamento.pagamentos || [];
      if (fecharContaModo?.value === 'igual' && fecharContaNumPessoas) {
        divisaoPessoas = parseInt(fecharContaNumPessoas.value, 10) || 1;
      }
    } else if (currentSelectedMesaParaConta) {
      mesa = currentSelectedMesaParaConta.mesaCodigo;
      pedidos = currentSelectedMesaParaConta.pedidosMesa || [];
      subtotal = pedidos.reduce((sum, p) => sum + Number(p.total || 0), 0);
      total = subtotal;
    }

    const itensMap = new Map();
    pedidos.forEach(p => {
      if (!clienteNome && (p.cliente_nome || p.clientes?.nome)) {
        clienteNome = p.cliente_nome || p.clientes?.nome;
      }
      if (!clienteTelefone && (p.cliente_telefone || p.clientes?.telefone)) {
        clienteTelefone = p.cliente_telefone || p.clientes?.telefone;
      }
      if (!pedidoId && p.id) {
        pedidoId = p.id;
      }

      const itens = p.pedido_itens || p.itens || [];
      itens.forEach(it => {
        const nome = it.nome_produto || it.produtos?.nome || it.nome || 'Item';
        const preco = Number(it.preco_unitario || it.preco || 0);
        const qtd = Number(it.quantidade || 1);
        const key = `${nome}__${preco}`;
        if (!itensMap.has(key)) {
          itensMap.set(key, { nome, preco_unitario: preco, quantidade: 0, observacoes: it.observacoes });
        }
        itensMap.get(key).quantidade += qtd;
      });
    });

    return {
      mesaCodigo: mesa,
      clienteNome,
      clienteTelefone,
      itens: Array.from(itensMap.values()),
      subtotal,
      desconto,
      taxaServico: taxa,
      total,
      divisaoPessoas,
      formasPagamento: pagamentos,
      pedidoId
    };
  }

  function acaoEnviarWhatsAppComprovante(origem = 'mesa') {
    if (!window.ReceiptFormatter) return;
    const dados = obterDadosComprovanteAtual(origem);
    const texto = window.ReceiptFormatter.formatDigitalReceipt(dados);
    window.ReceiptFormatter.openWhatsAppReceipt(texto, dados.clienteTelefone);
  }

  async function acaoCompartilharComprovante(origem = 'mesa') {
    if (!window.ReceiptFormatter) return;
    const dados = obterDadosComprovanteAtual(origem);
    const texto = window.ReceiptFormatter.formatDigitalReceipt(dados);
    await window.ReceiptFormatter.shareOrCopyReceipt(texto, {
      title: `Comprovante Mesa ${dados.mesaCodigo || ''}`,
      onCopySuccess: (msg) => {
        if (window.showToast) window.showToast(msg, { tipo: 'success' });
      }
    });
  }

  if (modalMesaPrint) {
    modalMesaPrint.addEventListener('click', () => {
      if (estadoPDV.currentSelectedMesaParaConta && window.cafeteriaPrint) {
        window.cafeteriaPrint.printConferenciaMesa(
          estadoPDV.currentSelectedMesaParaConta.mesaCodigo,
          estadoPDV.currentSelectedMesaParaConta.pedidosMesa
        );
      }
    });
  }

  document.getElementById('btn-mesa-whatsapp')?.addEventListener('click', () => acaoEnviarWhatsAppComprovante('mesa'));
  document.getElementById('btn-mesa-share')?.addEventListener('click', () => acaoCompartilharComprovante('mesa'));
  document.getElementById('btn-fechar-conta-whatsapp')?.addEventListener('click', () => acaoEnviarWhatsAppComprovante('fechamento'));
  document.getElementById('btn-fechar-conta-share')?.addEventListener('click', () => acaoCompartilharComprovante('fechamento'));

  estadoPDV.fn.obterDadosComprovanteAtual = obterDadosComprovanteAtual;
  estadoPDV.fn.acaoEnviarWhatsAppComprovante = acaoEnviarWhatsAppComprovante;
  estadoPDV.fn.acaoCompartilharComprovante = acaoCompartilharComprovante;
}
