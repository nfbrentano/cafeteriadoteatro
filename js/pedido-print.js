/* =========================================================
   PEDIDO-PRINT.JS — Lógica de Impressão (Iframe)
   ========================================================= */

(function () {
  'use strict';

  function getOrCreatePrintFrame() {
    let iframe = document.getElementById('print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }
    return iframe;
  }

  function formatFormaPagamento(fp) {
    const map = {
      'pix': 'PIX',
      'dinheiro': 'Dinheiro',
      'cartao_credito': 'Cartão Crédito',
      'cartao_debito': 'Cartão Débito',
      'outros': 'Outros'
    };
    return map[fp] || (fp ? fp.toUpperCase() : 'Não informado');
  }

  function executePrint(html) {
    const iframe = getOrCreatePrintFrame();
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 400);
  }

  const baseStyles = `
    body { 
      font-family: 'Courier New', monospace; 
      font-size: 13px; 
      color: #000; 
      width: 280px; 
      margin: 0; 
      padding: 4px; 
      line-height: 1.3;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 2px 0; }
    .qty { width: 30px; font-weight: bold; }
    .price { text-align: right; width: 68px; white-space: nowrap; }
    .item-obs { font-size: 11px; font-style: italic; color: #222; padding-left: 12px; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0.2cm; width: 100%; }
    }
  `;

  // Expõe globalmente as funções de impressão
  window.cafeteriaPrint = {
    printPedido: function (pedido, itens) {
      const date = new Date(pedido.created_at || new Date()).toLocaleString('pt-BR');
      const total = Number(pedido.total || 0).toFixed(2).replace('.', ',');
      const pagamento = pedido.forma_pagamento ? formatFormaPagamento(pedido.forma_pagamento) : null;
      const statusPag = pedido.status_pagamento === 'pago' ? 'PAGO ✅' : 'A PAGAR ⏳';

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
          <div class="center">COMANDA DE COZINHA / BAR</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 15px; font-weight: bold;">${pedido.mesa_codigo}</span></div>
          <div><span class="bold">PEDIDO:</span> #${pedido.numero_pedido || pedido.id}</div>
          <div><span class="bold">HORA:</span> ${date}</div>
          <div><span class="bold">STATUS PAG.:</span> ${statusPag} ${pagamento ? '(' + pagamento + ')' : ''}</div>
          
          <div class="divider"></div>
          
          <table>
      `;

      (itens || []).forEach(item => {
        const preco = (Number(item.preco_unitario || 0) * (item.quantidade || 1)).toFixed(2).replace('.', ',');
        html += `
          <tr>
            <td class="qty">${item.quantidade}x</td>
            <td><strong>${item.nome_produto}</strong></td>
            <td class="price">R$ ${preco}</td>
          </tr>
        `;
        if (item.observacoes && item.observacoes.trim()) {
          html += `
            <tr>
              <td colspan="3" class="item-obs">↳ Obs: ${item.observacoes.trim()}</td>
            </tr>
          `;
        }
      });

      html += `
          </table>
          
          <div class="divider"></div>
          
          <div class="bold" style="font-size: 16px; text-align: right;">
            TOTAL: R$ ${total}
          </div>
      `;

      if (pedido.observacoes && pedido.observacoes.trim()) {
        html += `
          <div class="divider"></div>
          <div class="bold">OBSERVAÇÕES GERAIS:</div>
          <div style="font-size: 12px;">${pedido.observacoes.trim()}</div>
        `;
      }

      html += `
          <div class="divider"></div>
          <div class="center" style="font-size: 11px;">Operador(a): ${pedido.criado_por_nome || 'Equipe Cafeteria'}</div>
        </body>
        </html>
      `;

      executePrint(html);
    },

    // Conferência de Mesa (Prévia da Conta para o cliente)
    printConferenciaMesa: function (mesaCodigo, pedidosMesa) {
      const date = new Date().toLocaleString('pt-BR');
      let totalGeral = 0;

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
          <div class="center bold">CONFERÊNCIA DE CONTA</div>
          <div class="center" style="font-size: 11px;">*** NÃO É DOCUMENTO FISCAL ***</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 16px; font-weight: bold;">${mesaCodigo}</span></div>
          <div><span class="bold">EMISSÃO:</span> ${date}</div>
          <div><span class="bold">PEDIDOS INCLUSOS:</span> ${(pedidosMesa || []).map(p => '#' + (p.numero_pedido || p.id)).join(', ')}</div>
          
          <div class="divider"></div>
          <table>
      `;

      (pedidosMesa || []).forEach(ped => {
        totalGeral += Number(ped.total || 0);
        if (ped.pedido_itens) {
          ped.pedido_itens.forEach(item => {
            const subtotal = (Number(item.preco_unitario || 0) * (item.quantidade || 1)).toFixed(2).replace('.', ',');
            html += `
              <tr>
                <td class="qty">${item.quantidade}x</td>
                <td>${item.nome_produto}</td>
                <td class="price">R$ ${subtotal}</td>
              </tr>
            `;
          });
        }
      });

      const totalStr = totalGeral.toFixed(2).replace('.', ',');

      html += `
          </table>
          <div class="divider"></div>
          <div class="bold" style="font-size: 17px; text-align: right;">
            TOTAL A PAGAR: R$ ${totalStr}
          </div>
          <div class="divider"></div>
          <div class="center" style="font-size: 11px; margin-top: 8px;">
            Agradecemos a sua preferência!<br>
            Apresente este extrato ao operador para pagamento.
          </div>
        </body>
        </html>
      `;

      executePrint(html);
    }
  };

})();
