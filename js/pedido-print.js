/* =========================================================
   PEDIDO-PRINT.JS — Lógica de Impressão (Iframe)
   ========================================================= */

(function () {
  'use strict';

  // Expõe globalmente a função de impressão
  window.cafeteriaPrint = {
    printPedido: function (pedido, itens) {
      const iframe = document.getElementById('print-frame');
      if (!iframe) {
        console.error('Iframe de impressão não encontrado!');
        return;
      }

      // Monta o HTML do cupom
      const date = new Date(pedido.created_at).toLocaleString('pt-BR');
      
      let html = `
        <html>
        <head>
          <style>
            body { 
              font-family: monospace; 
              font-size: 14px; 
              color: black; 
              width: 300px; 
              margin: 0; 
              padding: 0; 
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed black; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { vertical-align: top; }
            .qty { width: 30px; }
            .price { text-align: right; width: 60px; }
            @media print {
              @page { margin: 0; }
              body { margin: 0.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="center bold">CAFETERIA DO TEATRO</div>
          <div class="center">COMANDA DE PEDIDO</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA:</span> ${pedido.mesa_codigo}</div>
          <div><span class="bold">PEDIDO:</span> #${pedido.numero_pedido}</div>
          <div><span class="bold">HORA:</span> ${date}</div>
          
          <div class="divider"></div>
          
          <table>
      `;

      itens.forEach(item => {
        const preco = (item.preco_unitario * item.quantidade).toFixed(2).replace('.', ',');
        html += `
          <tr>
            <td class="qty">${item.quantidade}x</td>
            <td>${item.nome_produto}</td>
            <td class="price">R$${preco}</td>
          </tr>
        `;
      });

      const total = Number(pedido.total).toFixed(2).replace('.', ',');
      
      html += `
          </table>
          
          <div class="divider"></div>
          
          <div class="bold" style="font-size: 16px; text-align: right;">
            TOTAL: R$ ${total}
          </div>
      `;

      if (pedido.observacoes) {
        html += `
          <div class="divider"></div>
          <div class="bold">OBSERVAÇÕES:</div>
          <div>${pedido.observacoes}</div>
        `;
      }

      html += `
          <div class="divider"></div>
          <div class="center" style="font-size: 12px;">Operador(a): ${pedido.criado_por_nome || 'Barista'}</div>
        </body>
        </html>
      `;

      // Escreve o conteúdo no iframe
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Dispara a impressão após o carregamento
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }, 500);
    }
  };

})();
