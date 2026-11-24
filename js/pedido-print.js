/* =========================================================
   PEDIDO-PRINT.JS — Lógica de Impressão (Iframe)
   ========================================================= */

(function () {
  'use strict';

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  if (!window.escapeHtml) {
    window.escapeHtml = escapeHtml;
  }

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
    printPedido: function (pedido, itens, options = {}) {
      const isComplementar = Boolean(options && options.isComplementar);
      const printDate = new Date().toLocaleString('pt-BR');
      const orderDate = new Date(pedido.created_at || new Date()).toLocaleString('pt-BR');
      const total = Number(pedido.total || 0).toFixed(2).replace('.', ',');
      const pagamento = pedido.forma_pagamento ? formatFormaPagamento(pedido.forma_pagamento) : null;
      const statusPag = pedido.status_pagamento === 'pago' ? 'PAGO ✅' : 'A PAGAR ⏳';

      let totalAdicionais = 0;
      (itens || []).forEach(it => {
        if (!it.cancelado) {
          totalAdicionais += (Number(it.preco_unitario || 0) * (it.quantidade || 1)) - (Number(it.desconto || 0));
        }
      });
      const totalAdicionaisStr = Math.max(0, totalAdicionais).toFixed(2).replace('.', ',');

      const estacao = options && options.estacao ? options.estacao.toLowerCase() : null;
      let estacaoLabel = 'COZINHA / BAR';
      if (estacao === 'cozinha') estacaoLabel = 'COZINHA';
      else if (estacao === 'bar') estacaoLabel = 'BAR';

      let cabecalhoHtml = `
        <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
        <div class="center bold" style="font-size: 14px; margin-top: 2px; letter-spacing: 0.5px;">COMANDA — ${estacaoLabel}</div>
      `;

      if (isComplementar) {
        cabecalhoHtml = `
          <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
          <div class="center bold" style="background: #000; color: #fff; padding: 4px 0; margin: 4px 0; font-size: 13px; letter-spacing: 1px;">*** COMANDA COMPLEMENTAR — ${estacaoLabel} ***</div>
          <div class="center bold" style="font-size: 12px; margin-bottom: 2px;">⚠️ ACRÉSCIMO AO PEDIDO</div>
        `;
      }

      // CAF-000152: Alergias em destaque
      const alergiasLista = Array.isArray(pedido.alergias_cliente) ? [...pedido.alergias_cliente] : [];
      if (alergiasLista.length === 0 && pedido.observacoes) {
        const match = pedido.observacoes.match(/alergia[:\s\/]+([^\n\r|]+)/i);
        if (match && match[1]) alergiasLista.push(match[1].trim());
      }
      const textoAlergias = (window.AlergenicosUtils && typeof window.AlergenicosUtils.formatarAlergiasTexto === 'function')
        ? window.AlergenicosUtils.formatarAlergiasTexto(alergiasLista)
        : alergiasLista.join(', ');
      const temAlergia = Boolean(textoAlergias);

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
        </head>
        <body>
          ${cabecalhoHtml}
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 15px; font-weight: bold;">${(pedido.pedido_origem_id || pedido.is_adicional) ? `➕ ADICIONAL — Mesa ${window.escapeHtml(pedido.mesa_codigo)} (ref. #${window.escapeHtml(pedido.pedido_origem_id || 'origem')})` : window.escapeHtml(pedido.mesa_codigo)}</span> ${pedido.para_viagem ? ' <strong>(🥡 VIAGEM)</strong>' : ''}</div>
          ${pedido.cliente_nome ? `<div><span class="bold">CLIENTE:</span> ${window.escapeHtml(pedido.cliente_nome)}</div>` : ''}
          <div><span class="bold">PEDIDO:</span> #${pedido.numero_pedido || pedido.id}</div>
          <div><span class="bold">${isComplementar ? 'HORA ACRÉSCIMO:' : 'HORA PEDIDO:'}</span> ${isComplementar ? printDate : orderDate}</div>
          <div><span class="bold">STATUS PAG.:</span> ${statusPag} ${pagamento ? '(' + pagamento + ')' : ''}</div>
          
          <div class="divider"></div>
          
          ${temAlergia ? `<div class="comanda-alergia-alerta" style="background: #000; color: #fff; padding: 4px; font-weight: bold; font-size: 13px; text-align: center; margin: 4px 0;">*** ALERGIA: ${window.escapeHtml(textoAlergias.toUpperCase())} ***</div><div class="divider"></div>` : ''}
          
          <table>
      `;

      (itens || []).forEach(item => {
        const isCancelado = item.cancelado;
        const isCortesia = item.cortesia_de_item_id ? true : false;
        const isLancadoDepois = Boolean(item.lancado_depois);
        
        const preco = (Number(item.preco_unitario || 0) * (item.quantidade || 1)).toFixed(2).replace('.', ',');
        
        let cancelStyle = isCancelado ? 'text-decoration: line-through; color: #555;' : '';
        let cancelLabel = isCancelado ? ' - CANCELADO' : '';
        let cortesiaLabel = isCortesia && !isCancelado ? ' (CORTESIA)' : '';
        let adicionalLabel = (isLancadoDepois && !isComplementar && !isCancelado) ? ' [NOVO]' : '';
        
        html += `
          <tr>
            <td class="qty" style="${cancelStyle}">${item.quantidade}x</td>
            <td style="${cancelStyle}"><strong>${window.escapeHtml(item.nome_produto)}</strong>${cortesiaLabel}${adicionalLabel}${cancelLabel}</td>
            <td class="price" style="${cancelStyle}">R$ ${preco}</td>
          </tr>
        `;
        
        if (item.pedido_item_sabores && item.pedido_item_sabores.length === 2) {
          html += `
            <tr>
              <td colspan="3" class="item-obs" style="${cancelStyle}">
                ½ ${window.escapeHtml(item.pedido_item_sabores[0].nome)}<br>
                ½ ${window.escapeHtml(item.pedido_item_sabores[1].nome)}
              </td>
            </tr>
          `;
        }
        
        if (item.pedido_item_adicionais && item.pedido_item_adicionais.length > 0) {
          item.pedido_item_adicionais.forEach(ad => {
            html += `
              <tr>
                <td colspan="3" class="item-obs" style="color:#555; ${cancelStyle}">+ ${window.escapeHtml(ad.nome_adicional)}</td>
              </tr>
            `;
          });
        }
        
        if (item.desconto > 0 && !isCancelado) {
          html += `
            <tr>
              <td colspan="3" class="item-obs">Desconto promo: - R$ ${Number(item.desconto).toFixed(2).replace('.', ',')}</td>
            </tr>
          `;
        }
        
        if (item.observacoes && item.observacoes.trim()) {
          html += `
            <tr>
              <td colspan="3" class="item-obs" style="${cancelStyle}">↳ Obs: ${window.escapeHtml(item.observacoes.trim())}</td>
            </tr>
          `;
        }

        if (temAlergia && !isCancelado) {
          html += `
            <tr>
              <td colspan="3" class="item-obs" style="font-weight: bold; color: #000;">⚠️ ALERGIA: ${window.escapeHtml(textoAlergias.toUpperCase())}</td>
            </tr>
          `;
        }
      });

      html += `
          </table>
          
          <div class="divider"></div>
      `;

      if (isComplementar) {
        html += `
          <div class="bold" style="font-size: 15px; text-align: right;">
            TOTAL ACRÉSCIMO: R$ ${totalAdicionaisStr}
          </div>
          <div style="font-size: 12px; text-align: right; color: #555;">
            Total Acumulado do Pedido: R$ ${total}
          </div>
        `;
      } else {
        html += `
          <div class="bold" style="font-size: 16px; text-align: right;">
            TOTAL: R$ ${total}
          </div>
        `;
      }

      if (pedido.observacoes && pedido.observacoes.trim()) {
        html += `
          <div class="divider"></div>
          <div class="bold">OBSERVAÇÕES GERAIS:</div>
          <div style="font-size: 12px;">${window.escapeHtml(pedido.observacoes.trim())}</div>
        `;
      }

      html += `
          <div class="divider"></div>
          <div class="center" style="font-size: 11px;">Operador(a): ${window.escapeHtml(pedido.criado_por_nome || 'Equipe Cafeteria')}</div>
        </body>
        </html>
      `;

      executePrint(html);
    },

    printComandaAdicional: function (pedido, itensNovos) {
      return this.printPedido(pedido, itensNovos, { isComplementar: true });
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
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 16px; font-weight: bold;">${window.escapeHtml(mesaCodigo)}</span></div>
          <div><span class="bold">EMISSÃO:</span> ${date}</div>
          <div><span class="bold">PEDIDOS INCLUSOS:</span> ${(pedidosMesa || []).map(p => '#' + (p.numero_pedido || p.id)).join(', ')}</div>
          
          <div class="divider"></div>
          <table>
      `;

      (pedidosMesa || []).forEach(ped => {
        totalGeral += Number(ped.total || 0);
        if (ped.pedido_itens) {
          ped.pedido_itens.forEach(item => {
            const isCancelado = item.cancelado;
            const isCortesia = item.cortesia_de_item_id ? true : false;
            
            const subtotal = (Number(item.preco_unitario || 0) * (item.quantidade || 1)).toFixed(2).replace('.', ',');
            
            let cancelStyle = isCancelado ? 'text-decoration: line-through; color: #555;' : '';
            let cancelLabel = isCancelado ? ' - CANCELADO' : '';
            let cortesiaLabel = isCortesia && !isCancelado ? ' (CORTESIA)' : '';
            
            html += `
              <tr>
                <td class="qty" style="${cancelStyle}">${item.quantidade}x</td>
                <td style="${cancelStyle}">${window.escapeHtml(item.nome_produto)}${cortesiaLabel}${cancelLabel}</td>
                <td class="price" style="${cancelStyle}">R$ ${subtotal}</td>
              </tr>
            `;
            
            if (item.pedido_item_sabores && item.pedido_item_sabores.length === 2) {
              html += `
                <tr>
                  <td colspan="3" class="item-obs" style="${cancelStyle}">
                    ½ ${window.escapeHtml(item.pedido_item_sabores[0].nome)} / ½ ${window.escapeHtml(item.pedido_item_sabores[1].nome)}
                  </td>
                </tr>
              `;
            }

            if (item.desconto > 0 && !isCancelado) {
              html += `
                <tr>
                  <td colspan="3" class="item-obs">Desconto aplicado: - R$ ${Number(item.desconto).toFixed(2).replace('.', ',')}</td>
                </tr>
              `;
            }
          });
        }
      });

      const totalStr = totalGeral.toFixed(2).replace('.', ',');

      const finalizarImpressaoConferencia = (pixBlockHtml = '') => {
        const docHtml =
          html +
          `
          </table>
          <div class="divider"></div>
          <div class="bold" style="font-size: 17px; text-align: right;">
            TOTAL A PAGAR: R$ ${totalStr}
          </div>
          ${pixBlockHtml}
          <div class="divider"></div>
          <div class="center" style="font-size: 11px; margin-top: 8px;">
            Agradecemos a sua preferência!<br>
            Apresente este extrato ao operador para pagamento.
          </div>
        </body>
        </html>
      `;
        executePrint(docHtml);
      };

      if (window.cafeteriaPix && totalGeral > 0) {
        window.cafeteriaPix
          .obterConfigPix()
          .then((cfg) => {
            if (cfg && cfg.imprimirNaConta !== false && cfg.chave) {
              const pedNum =
                (pedidosMesa && pedidosMesa[0] && (pedidosMesa[0].numero_pedido || pedidosMesa[0].id)) ||
                mesaCodigo;
              const res = window.cafeteriaPix.gerarPayloadPix({
                chave: cfg.chave,
                recebedor: cfg.recebedor,
                cidade: cfg.cidade,
                valor: totalGeral,
                txid: `CAF${String(pedNum).replace(/[^A-Za-z0-9]/g, '')}`
              });
              if (res.ok) {
                const qrDataUrl = window.cafeteriaPix.gerarQrDataUrl(res.payload, 4, 1);
                if (qrDataUrl) {
                  finalizarImpressaoConferencia(`
                    <div class="divider"></div>
                    <div class="center bold" style="font-size: 12px; margin-bottom: 4px;">PAGUE COM PIX (R$ ${totalStr})</div>
                    <div class="center">
                      <img src="${qrDataUrl}" alt="QR Code PIX" style="width: 145px; height: 145px; display: inline-block;" />
                    </div>
                    <div class="center" style="font-size: 10px;">Aponte a câmera do app do seu banco e avise o atendente</div>
                  `);
                  return;
                }
              }
            }
            finalizarImpressaoConferencia('');
          })
          .catch(() => finalizarImpressaoConferencia(''));
      } else {
        finalizarImpressaoConferencia('');
      }
    },

    // Fechamento da Conta (Comprovante de Pagamento)
    
    printFechamentoContaMultiPartes: function (mesaCodigo, pedidosMesa, partes, totalConta, trocoGeral, subtotal = 0, desconto = 0, taxa = 0) {
      const date = new Date().toLocaleString('pt-BR');

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
          <style>
            .page-break { page-break-after: always; margin-bottom: 20px; }
          </style>
        </head>
        <body>
      `;

      partes.forEach((pt, index) => {
        let totalPagoParte = pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);

        html += `
          <div class="${index < partes.length - 1 ? 'page-break' : ''}">
            <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
            <div class="center bold">COMPROVANTE DE PAGAMENTO</div>
            <div class="center" style="font-size: 11px;">*** NÃO É DOCUMENTO FISCAL ***</div>
            
            <div class="divider"></div>
            
            <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 16px; font-weight: bold;">${window.escapeHtml(mesaCodigo)}</span></div>
            <div><span class="bold">DATA:</span> ${date}</div>
            <div><span class="bold">PARTE:</span> <span style="font-size: 15px; font-weight: bold;">${window.escapeHtml(pt.nome)}</span></div>
            
            <div class="divider"></div>
            
            <div style="font-size: 14px; text-align: right;">
              SUBTOTAL: R$ ${Number(subtotal).toFixed(2).replace('.', ',')}
            </div>
            ${desconto > 0 ? `
            <div style="font-size: 14px; text-align: right; color: #555;">
              DESCONTO: - R$ ${Number(desconto).toFixed(2).replace('.', ',')}
            </div>` : ''}
            ${taxa > 0 ? `
            <div style="font-size: 14px; text-align: right;">
              TAXA DE SERVIÇO: R$ ${Number(taxa).toFixed(2).replace('.', ',')}
            </div>` : ''}
            
            <div class="bold" style="font-size: 14px; text-align: right;">
              VALOR DEVIDO DA PARTE: R$ ${Number(pt.valor_devido).toFixed(2).replace('.', ',')}
            </div>
            <div class="bold" style="font-size: 16px; text-align: right;">
              TOTAL PAGO: R$ ${Number(totalPagoParte).toFixed(2).replace('.', ',')}
            </div>
            
            <div class="divider"></div>
            <div class="bold" style="font-size: 13px; text-align: left;">
              FORMAS DE PAGAMENTO:
            </div>
            <table style="margin-top: 4px;">
        `;

        (pt.pagamentos || []).forEach(pag => {
          html += `
            <tr>
              <td>${formatFormaPagamento(pag.forma)}</td>
              <td class="price">R$ ${Number(pag.valor).toFixed(2).replace('.', ',')}</td>
            </tr>
          `;
        });

        html += `</table>`;

        let valorDinheiroLancado = pt.pagamentos.filter(pag => pag.forma === 'dinheiro').reduce((sum, pag) => sum + pag.valor, 0);
        if (pt.dinheiro_recebido && pt.dinheiro_recebido > 0) {
           let trocoParte = pt.dinheiro_recebido - valorDinheiroLancado;
           if (trocoParte < 0) trocoParte = 0;
           if (trocoParte > 0) {
             html += `
               <div class="divider"></div>
               <div class="bold" style="font-size: 14px; text-align: right;">
                 TROCO: R$ ${Number(trocoParte).toFixed(2).replace('.', ',')}
               </div>
             `;
           }
        }

        html += `
            <div class="divider"></div>
            <div class="center" style="font-size: 11px; margin-top: 8px;">
              Muito obrigado e volte sempre!
            </div>
          </div>
        `;
      });

      html += `
        </body>
        </html>
      `;

      executePrint(html);
    },

    printFechamentoConta: function (mesaCodigo, pedidosMesa, pagamentos, totalConta, troco, subtotal = 0, desconto = 0, taxa = 0) {
      const date = new Date().toLocaleString('pt-BR');

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
          <div class="center bold">COMPROVANTE DE PAGAMENTO</div>
          <div class="center" style="font-size: 11px;">*** NÃO É DOCUMENTO FISCAL ***</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 16px; font-weight: bold;">${window.escapeHtml(mesaCodigo)}</span></div>
          <div><span class="bold">DATA:</span> ${date}</div>
          <div><span class="bold">STATUS:</span> <span style="font-size: 15px; font-weight: bold; color: #000;">PAGO ✅</span></div>
          
          <div class="divider"></div>
          <table>
      `;

      (pedidosMesa || []).forEach(ped => {
        if (ped.pedido_itens) {
          ped.pedido_itens.forEach(item => {
            const isCancelado = item.cancelado;
            const isCortesia = item.cortesia_de_item_id ? true : false;
            
            const subtotal = (Number(item.preco_unitario || 0) * (item.quantidade || 1)).toFixed(2).replace('.', ',');
            
            let cancelStyle = isCancelado ? 'text-decoration: line-through; color: #555;' : '';
            let cancelLabel = isCancelado ? ' - CANCELADO' : '';
            let cortesiaLabel = isCortesia && !isCancelado ? ' (CORTESIA)' : '';
            
            html += `
              <tr>
                <td class="qty" style="${cancelStyle}">${item.quantidade}x</td>
                <td style="${cancelStyle}">${window.escapeHtml(item.nome_produto)}${cortesiaLabel}${cancelLabel}</td>
                <td class="price" style="${cancelStyle}">R$ ${subtotal}</td>
              </tr>
            `;
          });
        }
      });

      const totalStr = Number(totalConta || 0).toFixed(2).replace('.', ',');

      html += `
          </table>
          <div class="divider"></div>
          
          <div style="font-size: 15px; text-align: right;">
            SUBTOTAL: R$ ${Number(subtotal).toFixed(2).replace('.', ',')}
          </div>
          ${desconto > 0 ? `
          <div style="font-size: 15px; text-align: right; color: #555;">
            DESCONTO: - R$ ${Number(desconto).toFixed(2).replace('.', ',')}
          </div>` : ''}
          ${taxa > 0 ? `
          <div style="font-size: 15px; text-align: right;">
            TAXA DE SERVIÇO: R$ ${Number(taxa).toFixed(2).replace('.', ',')}
          </div>` : ''}
          
          <div class="bold" style="font-size: 17px; text-align: right; margin-top: 4px;">
            TOTAL A PAGAR: R$ ${totalStr}
          </div>
          <div class="divider"></div>
          <div class="bold" style="font-size: 13px; text-align: left;">
            FORMAS DE PAGAMENTO:
          </div>
          <table style="margin-top: 4px;">
      `;

      (pagamentos || []).forEach(pag => {
        html += `
          <tr>
            <td>${formatFormaPagamento(pag.forma)}</td>
            <td class="price">R$ ${Number(pag.valor).toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      });

      html += `</table>`;

      if (troco > 0) {
        html += `
          <div class="divider"></div>
          <div class="bold" style="font-size: 14px; text-align: right;">
            TROCO: R$ ${Number(troco).toFixed(2).replace('.', ',')}
          </div>
        `;
      }

      // CAF-000042: QR Code opcional "Avalie seu pedido" no comprovante impresso
      let qrAvaliacaoHtml = '';
      const pedidoComToken = (pedidosMesa || []).find(p => p && p.pedido_token);
      if (pedidoComToken && pedidoComToken.pedido_token && typeof qrcode === 'function') {
        try {
          const urlAvaliar = `${window.location.origin}/avaliar.html?t=${pedidoComToken.pedido_token}`;
          const qr = qrcode(0, 'M');
          qr.addData(urlAvaliar);
          qr.make();
          const qrImgTag = qr.createImgTag(3, 1);
          qrAvaliacaoHtml = `
            <div class="divider"></div>
            <div class="center bold" style="font-size: 11px; margin-bottom: 4px;">⭐ AVALIE SEU PEDIDO</div>
            <div class="center">${qrImgTag}</div>
            <div class="center" style="font-size: 10px;">Aponte a câmera e conte como foi sua experiência!</div>
          `;
        } catch (e) {}
      }

      html += `
          ${qrAvaliacaoHtml}
          <div class="divider"></div>
          <div class="center" style="font-size: 11px; margin-top: 8px;">
            Muito obrigado e volte sempre!
          </div>
        </body>
        </html>
      `;

      executePrint(html);
    },

    // CAF-000112: Impressão de Comprovante de Pagamento Parcial de Mesa
    printPagamentoParcialMesa: function (mesaCodigo, itensPagos, pagamentos, totalPago, saldoRestante, troco = 0, taxa = 0) {
      const date = new Date().toLocaleString('pt-BR');
      const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>${baseStyles}</style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">CAFETERIA DO TEATRO</div>
          <div class="center bold">COMPROVANTE DE PAGAMENTO PARCIAL</div>
          <div class="center" style="font-size: 11px;">*** NÃO É DOCUMENTO FISCAL ***</div>
          
          <div class="divider"></div>
          
          <div><span class="bold">MESA / LOCAL:</span> <span style="font-size: 16px; font-weight: bold;">${esc(mesaCodigo)}</span></div>
          <div><span class="bold">DATA:</span> ${date}</div>
          <div><span class="bold">STATUS:</span> <span style="font-size: 14px; font-weight: bold; color: #D97706;">PARCIALMENTE PAGO ⏳</span></div>
          
          <div class="divider"></div>
      `;

      if (Array.isArray(itensPagos) && itensPagos.length > 0) {
        html += `
          <div class="bold" style="font-size: 12px; margin-bottom: 4px;">ITENS QUITADOS NESTA OPERAÇÃO:</div>
          <table>
        `;
        itensPagos.forEach(item => {
          const qtd = Number(item.quantidade || 1);
          const preco = Number(item.preco_unitario || item.precoUnitario || 0);
          const subtotal = (qtd * preco).toFixed(2).replace('.', ',');
          html += `
            <tr>
              <td class="qty">${qtd}x</td>
              <td>${esc(item.nome_produto || item.nome || 'Item')}</td>
              <td class="price">R$ ${subtotal}</td>
            </tr>
          `;
        });
        html += `</table>`;
      } else {
        html += `
          <div class="center" style="font-size: 12px; margin: 6px 0;">
            <em>Abatimento de valor avulso na conta da mesa</em>
          </div>
        `;
      }

      const totalStr = Number(totalPago || 0).toFixed(2).replace('.', ',');
      const saldoStr = Number(saldoRestante || 0).toFixed(2).replace('.', ',');

      html += `
        <div class="divider"></div>
      `;

      if (taxa > 0) {
        html += `
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>Taxa de Serviço:</span>
            <span>R$ ${Number(taxa).toFixed(2).replace('.', ',')}</span>
          </div>
        `;
      }

      html += `
        <div class="bold" style="font-size: 16px; display: flex; justify-content: space-between; margin-top: 4px;">
          <span>TOTAL PAGO AGORA:</span>
          <span>R$ ${totalStr}</span>
        </div>

        <div class="divider"></div>
        <div class="bold" style="font-size: 13px; text-align: left;">
          FORMAS DE PAGAMENTO:
        </div>
        <table style="margin-top: 4px;">
      `;

      (pagamentos || []).forEach(pag => {
        html += `
          <tr>
            <td>${formatFormaPagamento(pag.forma)}</td>
            <td class="price">R$ ${Number(pag.valor).toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      });

      html += `</table>`;

      if (troco > 0) {
        html += `
          <div class="divider"></div>
          <div class="bold" style="font-size: 14px; text-align: right;">
            TROCO: R$ ${Number(troco).toFixed(2).replace('.', ',')}
          </div>
        `;
      }

      html += `
        <div class="divider"></div>
        <div class="bold" style="font-size: 15px; display: flex; justify-content: space-between; background: #eee; padding: 4px;">
          <span>SALDO RESTANTE DA MESA:</span>
          <span>R$ ${saldoStr}</span>
        </div>
        <div class="divider"></div>
        <div class="center" style="font-size: 11px; margin-top: 8px;">
          A mesa continua aberta com o saldo remanescente acima.
        </div>
      </body>
      </html>
      `;

      executePrint(html);
    },

    // CAF-000043: Impressão de Etiquetas Adesivas por Unidade (Copo / Embalagem)
    printEtiquetas: function (pedido, itens, options = {}) {
      const listaItens = (itens || []).filter(it => !it.cancelado);
      if (listaItens.length === 0) return;

      const tamanho = options.tamanho || '50x30';
      const dimMap = {
        '40x25': { w: 40, h: 25, fontTop: '9px', fontProd: '11px', fontSub: '8.5px' },
        '50x30': { w: 50, h: 30, fontTop: '10px', fontProd: '12px', fontSub: '9.5px' },
        '60x40': { w: 60, h: 40, fontTop: '11px', fontProd: '14px', fontSub: '10.5px' }
      };
      const dim = dimMap[tamanho] || dimMap['50x30'];

      const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

      // Privacidade (CAF-000043 RNF): apenas o primeiro nome do cliente
      const nomeCompleto = String(pedido.cliente_nome || '').trim();
      const primeiroNome = nomeCompleto ? nomeCompleto.split(/\s+/)[0] : (pedido.mesa_codigo || 'Balcão');
      const numSenha = pedido.numero_pedido || pedido.id;
      const iconeViagem = pedido.para_viagem ? ' 🥡' : '';

      // CAF-000152: Alergias em destaque
      const alergiasLista = Array.isArray(pedido.alergias_cliente) ? [...pedido.alergias_cliente] : [];
      if (alergiasLista.length === 0 && pedido.observacoes) {
        const match = pedido.observacoes.match(/alergia[:\s\/]+([^\n\r|]+)/i);
        if (match && match[1]) alergiasLista.push(match[1].trim());
      }
      const textoAlergias = (window.AlergenicosUtils && typeof window.AlergenicosUtils.formatarAlergiasTexto === 'function')
        ? window.AlergenicosUtils.formatarAlergiasTexto(alergiasLista)
        : alergiasLista.join(', ');
      const temAlergia = Boolean(textoAlergias);

      // Expande itens em unidades individuais (ex: quantidade 3 => 3 etiquetas)
      const unidades = [];
      listaItens.forEach(item => {
        const qtd = Math.max(1, parseInt(item.quantidade, 10) || 1);
        const adics = (item.pedido_item_adicionais || [])
          .map(a => a.nome_adicional || a.nome || '')
          .filter(Boolean);
        const sabores = (item.pedido_item_sabores || [])
          .map(s => '½ ' + (s.nome || ''))
          .filter(Boolean);
        const obs = String(item.observacoes || '').trim();

        for (let u = 0; u < qtd; u++) {
          unidades.push({
            itemId: item.id,
            nomeProduto: item.nome_produto || 'Item',
            variacoes: [...sabores, ...adics.map(a => '+ ' + a)].join(', '),
            obs: obs
          });
        }
      });

      const totalUnidades = unidades.length;
      if (totalUnidades === 0) return;

      const etiquetasHtml = unidades.map((un, idx) => {
        const indiceStr = `${idx + 1}/${totalUnidades}`;
        return `
          <div class="etiqueta-page">
            <div class="etq-header">
              <span class="etq-senha">#${esc(numSenha)} ${esc(primeiroNome)}${iconeViagem}</span>
              <span class="etq-counter">${indiceStr}</span>
            </div>
            <div class="etq-prod">${esc(un.nomeProduto)}</div>
            ${temAlergia ? `<div class="etq-alergia" style="font-weight: bold; font-size: 11px; color: #000;">⚠️ ALERGIA: ${esc(textoAlergias.toUpperCase())}</div>` : ''}
            ${un.variacoes ? `<div class="etq-var">${esc(un.variacoes)}</div>` : ''}
            ${un.obs ? `<div class="etq-obs">Obs: ${esc(un.obs)}</div>` : ''}
          </div>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page {
              size: ${dim.w}mm ${dim.h}mm;
              margin: 0;
            }
            html, body {
              width: ${dim.w}mm;
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              background: #fff;
            }
            .etiqueta-page {
              width: ${dim.w}mm;
              height: ${dim.h}mm;
              padding: 1.5mm 2mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              page-break-after: always;
              break-after: page;
            }
            .etiqueta-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .etq-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: ${dim.fontTop};
              font-weight: 900;
              border-bottom: 1px solid #000;
              padding-bottom: 0.6mm;
              margin-bottom: 0.8mm;
              white-space: nowrap;
            }
            .etq-senha {
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 76%;
            }
            .etq-counter {
              font-weight: 900;
            }
            .etq-prod {
              font-size: ${dim.fontProd};
              font-weight: 800;
              line-height: 1.15;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 0.5mm;
            }
            .etq-var {
              font-size: ${dim.fontSub};
              font-weight: 700;
              line-height: 1.15;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .etq-obs {
              font-size: ${dim.fontSub};
              font-style: italic;
              line-height: 1.15;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-top: auto;
            }
          </style>
        </head>
        <body>
          ${etiquetasHtml}
        </body>
        </html>
      `;

      executePrint(html);
    },

    printDanfeNfce: function (nota, configEmpresa = {}) {
      if (!nota) return;
      const empresa = {
        razaoSocial: configEmpresa.razao_social || 'Cafeteria do Teatro Ltda',
        nomeFantasia: configEmpresa.nome_fantasia || 'Cafeteria do Teatro',
        cnpj: configEmpresa.cnpj || '00.000.000/0001-91',
        ie: configEmpresa.ie || '123456789',
        endereco: configEmpresa.endereco || 'Rua do Teatro, 123 - Centro - Lajeado/RS',
        municipio: configEmpresa.municipio || 'Lajeado - RS'
      };

      const dataEmissao = new Date(nota.created_at || new Date()).toLocaleString('pt-BR');
      const chaveFormatada = String(nota.chave_acesso || '').replace(/(\d{4})/g, '$1 ').trim();
      const numFmt = String(nota.numero || 1).padStart(9, '0');
      const serieFmt = String(nota.serie || 1).padStart(3, '0');
      const protocolo = nota.protocolo || 'HOMOLOGAÇÃO';
      const itens = Array.isArray(nota.itens) ? nota.itens : [];
      const pagamentos = Array.isArray(nota.formas_pagamento) ? nota.formas_pagamento : [];

      let itensHtml = '';
      itens.forEach((it, idx) => {
        const cod = String(it.produto_id || idx + 1).padStart(3, '0');
        const desc = escapeHtml(it.nome || 'Item');
        const qtd = it.quantidade || 1;
        const un = escapeHtml(it.unidade || 'UN');
        const vUnit = Number(it.valor_unitario || 0).toFixed(2).replace('.', ',');
        const vTotal = Number(it.valor_total || (qtd * (it.valor_unitario || 0))).toFixed(2).replace('.', ',');

        itensHtml += `
          <tr>
            <td colspan="4" style="padding-top: 3px; font-weight: bold;">${idx + 1} - ${cod} ${desc}</td>
          </tr>
          <tr>
            <td style="padding-left: 8px;">${qtd} ${un} x R$ ${vUnit}</td>
            <td></td>
            <td></td>
            <td style="text-align: right; font-weight: bold;">R$ ${vTotal}</td>
          </tr>
        `;
      });

      let pagamentosHtml = '';
      pagamentos.forEach(p => {
        const formaNome = formatFormaPagamento(p.forma);
        const valorFmt = Number(p.valor || 0).toFixed(2).replace('.', ',');
        pagamentosHtml += `
          <tr>
            <td>${escapeHtml(formaNome)}</td>
            <td style="text-align: right; font-weight: bold;">R$ ${valorFmt}</td>
          </tr>
        `;
      });

      let consumidorHtml = '<div class="center" style="margin: 4px 0; font-weight: bold;">CONSUMIDOR NÃO IDENTIFICADO</div>';
      if (nota.consumidor_cpf_cnpj) {
        const docLimpo = String(nota.consumidor_cpf_cnpj).replace(/[^0-9]/g, '');
        const docFmt = docLimpo.length === 11
          ? docLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
          : docLimpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        consumidorHtml = `
          <div style="margin: 4px 0;">
            <strong>CONSUMIDOR:</strong> CPF/CNPJ ${escapeHtml(docFmt)}
            ${nota.consumidor_nome ? `<br><strong>NOME:</strong> ${escapeHtml(nota.consumidor_nome)}` : ''}
          </div>
        `;
      }

      let qrCodeHtml = '';
      const qrData = nota.qr_code_url || `https://dfe-portal.svrs.rs.gov.br/nfce/qrCode?p=${nota.chave_acesso}|2|1|1|`;
      if (typeof window !== 'undefined' && window.qrcode) {
        try {
          const qr = window.qrcode(0, 'M');
          qr.addData(qrData);
          qr.make();
          qrCodeHtml = qr.createImgTag(3, 4);
        } catch (e) {
          qrCodeHtml = `<div class="center" style="font-size:10px;">[QR CODE: ${escapeHtml(qrData)}]</div>`;
        }
      } else {
        qrCodeHtml = `<div class="center" style="font-size:10px;">[QR CODE: ${escapeHtml(qrData)}]</div>`;
      }

      const totalProd = Number(nota.valor_produtos || nota.valor_total || 0).toFixed(2).replace('.', ',');
      const totalDesc = Number(nota.valor_desconto || 0).toFixed(2).replace('.', ',');
      const totalPagar = Number(nota.valor_total || 0).toFixed(2).replace('.', ',');
      const tributosAprox = (Number(nota.valor_total || 0) * 0.18).toFixed(2).replace('.', ','); // Est. IBPT 18%

      const danfeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>DANFE NFC-e - Nº ${numFmt}</title>
          <style>${baseStyles}</style>
        </head>
        <body>
          <div class="center bold" style="font-size: 14px;">${escapeHtml(empresa.nomeFantasia)}</div>
          <div class="center" style="font-size: 11px;">${escapeHtml(empresa.razaoSocial)}</div>
          <div class="center" style="font-size: 11px;">CNPJ: ${escapeHtml(empresa.cnpj)} - IE: ${escapeHtml(empresa.ie)}</div>
          <div class="center" style="font-size: 10px;">${escapeHtml(empresa.endereco)}</div>
          <div class="divider"></div>

          <div class="center bold" style="font-size: 12px;">DANFE NFC-e</div>
          <div class="center" style="font-size: 10px;">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
          <div class="center" style="font-size: 9px; font-style: italic;">Não permite aproveitamento de crédito de ICMS</div>
          <div class="divider"></div>

          <table>
            ${itensHtml}
          </table>
          <div class="divider"></div>

          <table>
            <tr>
              <td>QTD. TOTAL DE ITENS:</td>
              <td style="text-align: right; font-weight: bold;">${itens.length}</td>
            </tr>
            <tr>
              <td>VALOR TOTAL PRODUTOS:</td>
              <td style="text-align: right;">R$ ${totalProd}</td>
            </tr>
            ${Number(nota.valor_desconto || 0) > 0 ? `
            <tr>
              <td>DESCONTOS:</td>
              <td style="text-align: right;">- R$ ${totalDesc}</td>
            </tr>` : ''}
            <tr>
              <td class="bold" style="font-size: 14px;">VALOR A PAGAR:</td>
              <td class="bold" style="font-size: 14px; text-align: right;">R$ ${totalPagar}</td>
            </tr>
          </table>
          <div class="divider"></div>

          <div class="bold" style="margin-bottom: 2px;">FORMA DE PAGAMENTO</div>
          <table>
            ${pagamentosHtml}
          </table>
          <div class="divider"></div>

          <div style="font-size: 10px; margin: 4px 0;">
            Informação dos Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ ${tributosAprox} (Fonte: IBPT)
          </div>
          <div class="divider"></div>

          <div class="center bold">
            NFC-e nº ${numFmt} Série ${serieFmt} Emissão: ${dataEmissao}
          </div>
          <div class="center" style="font-size: 11px;">
            Protocolo de autorização: ${escapeHtml(protocolo)}
          </div>
          <div class="divider"></div>

          <div class="center bold" style="font-size: 11px; margin-bottom: 2px;">CHAVE DE ACESSO</div>
          <div class="center" style="font-size: 10px; font-family: monospace; letter-spacing: 0.5px; word-break: break-all;">
            ${escapeHtml(chaveFormatada)}
          </div>
          <div class="divider"></div>

          ${consumidorHtml}
          <div class="divider"></div>

          <div class="center" style="margin: 6px 0;">
            <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">Consulta via leitor de QR Code</div>
            ${qrCodeHtml}
          </div>

          <div class="center" style="font-size: 9px; margin-top: 6px;">
            Ambiente: ${nota.ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO - SEM VALOR FISCAL'}
          </div>
        </body>
        </html>
      `;

      executePrint(danfeHtml);
    }
  };

  window.cafeteriaPrint.printEtiquetaCopo = window.cafeteriaPrint.printEtiquetas;

  window.PedidoPrint = window.cafeteriaPrint;

})();
