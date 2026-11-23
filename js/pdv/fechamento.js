/* =========================================================
   PDV — FECHAMENTO DE CONTA DA MESA, DIVISÃO, DESCONTO & PIX
   ========================================================= */

import { estadoPDV, definirGlobalPDV } from './estado.js';

export function registrarFechamentoPDV() {
  const {
    modalMesa,
    modalFecharConta,
    fecharContaTitle,
    fecharContaClose,
    fecharContaCancelar,
    fecharContaConfirmar,
    btnFecharContaVoltar,
    btnFecharContaVoltarFooter,
    fecharContaStepSub,
    btnFecharContaNext1,
    btnFecharContaNext2,
    fecharContaFooterLabel,
    fecharContaFooterVal,
    stepFecharConsumo,
    stepFecharAjustes,
    stepFecharPagamento,
    fecharContaResumo,
    fecharContaSubtotalLbl,
    fecharContaDivDesconto,
    fecharContaDescontoTipo,
    fecharContaDescontoValor,
    fecharContaDescontoMotivo,
    btnSolicitarDescontoPin,
    fecharContaCupomInput,
    btnFecharContaAplicarCupom,
    fecharContaCupomMsg,
    fecharContaDivTaxa,
    fecharContaTaxaCheck,
    fecharContaTaxaPercLbl,
    fecharContaTaxaValLbl,
    fecharContaTotalLbl,
    fecharContaJaPagoLbl,
    fecharContaAPagarLbl,
    fecharContaFaltaLbl,
    fecharContaForma,
    fecharContaValor,
    btnAddPagamento,
    divDinheiroRecebido,
    inputDinheiroRecebido,
    containerTrocoChips,
    fecharContaTrocoLbl,
    fecharContaLista,
    fecharContaModo,
    fecharContaDivPessoas,
    fecharContaNumPessoas,
    btnGerarPartesIgual,
    fecharContaDivAddParte,
    fecharContaNomeParte,
    btnAddParteItem,
    fecharContaListaPartes,
    fecharContaPainelPagamento,
    tituloPagamentoParte,
    fecharContaImprimirCupom,
    fecharContaEmitirNfce,
    fecharContaNfceCpf,
    fecharContaDivParcialItens,
    fecharContaListaItensParcial,
    fecharContaDivParcialValor,
    fecharContaInputParcialValor
  } = estadoPDV.refs;

  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);
  let pixFechamentoMonitor = null;

  function updateFecharContaFooterSummary() {
    if (!fecharContaFooterLabel || !fecharContaFooterVal) return;
    const { currentFecharContaStep, currentFechamento, currentPartes } = estadoPDV;
    if (currentFecharContaStep === 1) {
      fecharContaFooterLabel.textContent = 'Subtotal Itens:';
      fecharContaFooterVal.textContent = `R$ ${currentFechamento.subtotal.toFixed(2).replace('.', ',')}`;
      fecharContaFooterVal.style.color = 'var(--marrom-escuro)';
    } else if (currentFecharContaStep === 2) {
      fecharContaFooterLabel.textContent = 'Total c/ Ajustes:';
      fecharContaFooterVal.textContent = `R$ ${currentFechamento.totalConta.toFixed(2).replace('.', ',')}`;
      fecharContaFooterVal.style.color = 'var(--marrom-escuro)';
    } else {
      let totalPagoAll = 0;
      currentPartes.forEach(pt => {
        totalPagoAll += pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);
      });
      const faltaTotal = currentFechamento.aPagar - totalPagoAll;
      if (faltaTotal <= 0.05 && totalPagoAll > 0 && currentPartes.length > 0) {
        fecharContaFooterLabel.textContent = 'Status:';
        fecharContaFooterVal.textContent = 'Total Pago ✓';
        fecharContaFooterVal.style.color = 'var(--verde-ok)';
      } else {
        fecharContaFooterLabel.textContent = 'Falta Pagar:';
        fecharContaFooterVal.textContent = `R$ ${(faltaTotal > 0 ? faltaTotal : 0).toFixed(2).replace('.', ',')}`;
        fecharContaFooterVal.style.color = 'var(--vermelho-erro)';
      }
    }
  }

  function setFecharContaStep(step) {
    estadoPDV.currentFecharContaStep = Math.max(1, Math.min(3, step));
    const currentStep = estadoPDV.currentFecharContaStep;

    if (stepFecharConsumo) stepFecharConsumo.classList.toggle('is-active', currentStep === 1);
    if (stepFecharAjustes) stepFecharAjustes.classList.toggle('is-active', currentStep === 2);
    if (stepFecharPagamento) stepFecharPagamento.classList.toggle('is-active', currentStep === 3);

    if (btnFecharContaVoltar) {
      btnFecharContaVoltar.classList.toggle('hidden', currentStep === 1);
    }

    if (fecharContaStepSub) {
      const stepNames = {
        1: 'Passo 1 de 3: Consumo da Mesa',
        2: 'Passo 2 de 3: Ajustes e Divisão',
        3: 'Passo 3 de 3: Formas de Pagamento'
      };
      fecharContaStepSub.textContent = stepNames[currentStep] || '';
    }

    const tabs = document.querySelectorAll('.fechar-conta-step-tab');
    tabs.forEach(tab => {
      const s = Number(tab.getAttribute('data-step'));
      tab.classList.toggle('active', s === currentStep);
      tab.classList.toggle('completed', s < currentStep);
    });

    const btnVoltarFooter = document.getElementById('btn-fechar-conta-voltar-footer');
    const btnCancelarFooter = document.getElementById('modal-fechar-conta-cancelar');
    const btnWhatsappFooter = document.getElementById('btn-fechar-conta-whatsapp');
    const btnShareFooter = document.getElementById('btn-fechar-conta-share');

    if (btnWhatsappFooter) btnWhatsappFooter.classList.add('hidden');
    if (btnShareFooter) btnShareFooter.classList.add('hidden');

    if (btnCancelarFooter) {
      btnCancelarFooter.classList.toggle('hidden', currentStep !== 1);
    }
    if (btnVoltarFooter) {
      btnVoltarFooter.classList.toggle('hidden', currentStep === 1);
    }
    if (btnFecharContaNext1) btnFecharContaNext1.classList.toggle('hidden', currentStep !== 1);
    if (btnFecharContaNext2) btnFecharContaNext2.classList.toggle('hidden', currentStep !== 2);
    if (fecharContaConfirmar) fecharContaConfirmar.classList.toggle('hidden', currentStep !== 3);

    updateFecharContaFooterSummary();

    const modalBody = document.querySelector('.fechar-conta-body');
    if (modalBody) modalBody.scrollTop = 0;
  }

  async function atualizarPixFechamentoBox(pt, faltaParte) {
    const divPix = document.getElementById('div-pix-fechamento');
    if (!divPix) return;

    if (!fecharContaForma || fecharContaForma.value !== 'pix' || !pt) {
      divPix.classList.add('hidden');
      return;
    }

    const valorDigitado = Number(fecharContaValor?.value) || 0;
    const valorPix =
      valorDigitado > 0
        ? valorDigitado
        : faltaParte > 0
        ? faltaParte
        : pt.valor_devido || 0;

    if (valorPix <= 0) {
      divPix.classList.add('hidden');
      return;
    }

    divPix.classList.remove('hidden');
    const lblVal = document.getElementById('fechar-conta-pix-valor-lbl');
    const qrBox = document.getElementById('fechar-conta-pix-qr');
    const avisoSemChave = document.getElementById('fechar-conta-pix-sem-chave');
    if (lblVal) lblVal.textContent = `R$ ${valorPix.toFixed(2).replace('.', ',')}`;

    const { currentFechamento } = estadoPDV;
    const mesaCod = currentFechamento?.mesaCodigo || 'MESA';
    const numPed = currentFechamento?.pedidos?.[0]?.numero_pedido || currentFechamento?.pedidos?.[0]?.id || '';
    const txid = `CAF${String(numPed || mesaCod).replace(/[^A-Za-z0-9]/g, '')}P${pt.id}`;
    const subtitulo = `Mesa ${mesaCod} · ${pt.nome}`;

    if (!window.cafeteriaPix) return;
    const cfg = await window.cafeteriaPix.obterConfigPix();
    const res = window.cafeteriaPix.gerarPayloadPix({
      chave: cfg.chave,
      recebedor: cfg.recebedor,
      cidade: cfg.cidade,
      valor: valorPix,
      txid
    });

    estadoPDV.ultimoPixFechamentoState = {
      payload: res.ok ? res.payload : '',
      valor: valorPix,
      txid,
      subtitulo
    };

    if (!res.ok) {
      if (qrBox) qrBox.style.display = 'none';
      if (avisoSemChave) avisoSemChave.classList.remove('hidden');
    } else {
      if (avisoSemChave) avisoSemChave.classList.add('hidden');
      if (qrBox) {
        qrBox.style.display = 'flex';
        qrBox.innerHTML = window.cafeteriaPix.gerarQrSvg(res.payload, 3, 1);
      }
    }
  }

  function renderTrocoChips(valorBase, pt) {
    if (!containerTrocoChips) return;
    containerTrocoChips.innerHTML = '';
    if (!valorBase || valorBase <= 0) return;

    const sugestoes = new Set();
    sugestoes.add(Number(valorBase.toFixed(2)));

    const proxDezena = Math.ceil(valorBase / 10) * 10;
    if (proxDezena > valorBase && proxDezena <= 200) {
      sugestoes.add(proxDezena);
    }

    const notasComuns = [5, 10, 20, 50, 100, 200];
    for (const nota of notasComuns) {
      if (nota > valorBase && sugestoes.size < 5) {
        sugestoes.add(nota);
      }
    }

    const valoresOrdenados = Array.from(sugestoes).sort((a, b) => a - b);
    const atualRecebido = Number(inputDinheiroRecebido?.value) || 0;

    valoresOrdenados.forEach(val => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isExato = Math.abs(val - valorBase) < 0.005;
      const isSelected = Math.abs(val - atualRecebido) < 0.005;
      btn.className = `btn-troco-chip ${isExato ? 'btn-troco-chip--exato' : ''} ${isSelected ? 'selected' : ''}`;

      btn.textContent = isExato
        ? `Exato (R$ ${val.toFixed(2).replace('.', ',')})`
        : `R$ ${val.toFixed(0)}`;

      btn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(15);
        if (inputDinheiroRecebido) inputDinheiroRecebido.value = val.toFixed(2);
        pt.dinheiro_recebido = val;

        if (fecharContaForma && fecharContaForma.value !== 'dinheiro') {
          fecharContaForma.value = 'dinheiro';
          divDinheiroRecebido?.classList.remove('hidden');
        }

        if (fecharContaValor && (!fecharContaValor.value || Number(fecharContaValor.value) <= 0)) {
          fecharContaValor.value = valorBase.toFixed(2);
        }

        renderPainelPagamento();
      });

      containerTrocoChips.appendChild(btn);
    });
  }

  function renderPainelPagamento() {
    if (!fecharContaPainelPagamento) return;
    if (!estadoPDV.parteAtivaId) {
      fecharContaPainelPagamento.classList.add('hidden');
      return;
    }
    const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
    if (!pt) return;

    fecharContaPainelPagamento.classList.remove('hidden');
    if (tituloPagamentoParte) tituloPagamentoParte.textContent = `Pagamentos - ${pt.nome}`;

    if (inputDinheiroRecebido) inputDinheiroRecebido.value = pt.dinheiro_recebido || '';

    let totalPagoParte = 0;
    let htmlLista = '';
    const formasNomes = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      cartao_debito: 'Cartão de Débito',
      cartao_credito: 'Cartão de Crédito',
      outros: 'Outros'
    };

    pt.pagamentos.forEach(pag => {
      totalPagoParte += pag.valor;
      const isPix = pag.forma === 'pix';
      const txidPag = `CAF${String(estadoPDV.currentFechamento?.mesaCodigo || '').replace(/[^A-Za-z0-9]/g, '')}P${pt.id}`;
      const botoesPixHtml = isPix
        ? `<button type="button" class="btn-ghost-small btn--pix-copy" data-action="barista-mostrar-qr-pix" data-valor="${pag.valor}" data-txid="${txidPag}" data-parte-nome="${window.escapeHtml(pt.nome || '')}">📱 QR Pix</button>`
        : '';
      htmlLista += `
        <div style="display:flex; justify-content: space-between; align-items:center; background:#f9f9f9; border:1px solid #ddd; padding:6px; border-radius:4px; margin-bottom:4px; font-size:13px; gap:6px;">
          <span>${formasNomes[pag.forma] || pag.forma}: <strong>R$ ${pag.valor.toFixed(2).replace('.', ',')}</strong></span>
          <div style="display:flex; align-items:center; gap:4px;">
            ${botoesPixHtml}
            <button type="button" class="btn-ghost-small btn--remover-item" data-action="barista-remover-pagamento" data-pagamento-id="${pag.id}">X</button>
          </div>
        </div>
      `;
    });
    if (fecharContaLista) fecharContaLista.innerHTML = htmlLista;

    const faltaParte = pt.valor_devido - totalPagoParte;
    if (fecharContaValor) {
      if (faltaParte > 0 && !fecharContaValor.value) {
        fecharContaValor.value = faltaParte.toFixed(2);
      } else if (faltaParte <= 0) {
        fecharContaValor.value = '';
      }
    }

    const valorDinheiroLancado = pt.pagamentos.filter(pag => pag.forma === 'dinheiro').reduce((sum, pag) => sum + pag.valor, 0);
    const valorBaseParaTroco = valorDinheiroLancado > 0
      ? valorDinheiroLancado
      : (Number(fecharContaValor?.value) || faltaParte || 0);

    renderTrocoChips(valorBaseParaTroco, pt);

    const recebido = Number(inputDinheiroRecebido?.value) || 0;
    if (fecharContaTrocoLbl) {
      if (recebido > 0 && valorBaseParaTroco > 0) {
        let troco = recebido - valorBaseParaTroco;
        if (troco < 0) troco = 0;
        fecharContaTrocoLbl.textContent = `R$ ${troco.toFixed(2).replace('.', ',')}`;
      } else {
        fecharContaTrocoLbl.textContent = 'R$ 0,00';
      }
    }

    atualizarPixFechamentoBox(pt, faltaParte);
  }

  function renderPartes() {
    const { currentPartes, parteAtivaId, currentFechamento } = estadoPDV;
    let totalPagoAll = 0;

    let htmlPartes = '';
    currentPartes.forEach(pt => {
      const totalPagoParte = pt.pagamentos.reduce((sum, pag) => sum + pag.valor, 0);
      totalPagoAll += totalPagoParte;

      let faltaParte = pt.valor_devido - totalPagoParte;
      if (faltaParte < 0) faltaParte = 0;

      let statusColor = faltaParte > 0 ? '#D97706' : 'green';
      if (pt.valor_devido === 0 && fecharContaModo?.value === 'item') statusColor = '#999';

      const isActive = pt.id === parteAtivaId;
      const nomeSeguro = window.escapeHtml(pt.nome || '');

      htmlPartes += `
        <div data-action="barista-selecionar-parte" data-parte-id="${pt.id}" style="border: 2px solid ${isActive ? 'var(--marrom)' : '#E5E5E5'}; padding: 8px 12px; border-radius: 8px; cursor: pointer; background: ${isActive ? '#fdf7f1' : '#fff'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color: ${isActive ? 'var(--marrom-escuro)' : '#333'}">${nomeSeguro}</strong>
            <span style="font-size:12px; font-weight:bold; color: ${statusColor}">
              ${faltaParte > 0 ? 'Falta: R$ ' + faltaParte.toFixed(2).replace('.', ',') : (pt.valor_devido > 0 ? 'Pago!' : '')}
            </span>
          </div>
          <div style="font-size: 12px; color: #555;">
            Devido: R$ ${pt.valor_devido.toFixed(2).replace('.', ',')} | Pago: R$ ${totalPagoParte.toFixed(2).replace('.', ',')}
          </div>
        </div>
      `;
    });

    if (fecharContaListaPartes) fecharContaListaPartes.innerHTML = htmlPartes;

    const faltaTotal = currentFechamento.aPagar - totalPagoAll;
    if (fecharContaFaltaLbl) {
      fecharContaFaltaLbl.textContent = `R$ ${(faltaTotal > 0 ? faltaTotal : 0).toFixed(2).replace('.', ',')}`;
      if (faltaTotal <= 0.05 && totalPagoAll > 0 && currentPartes.length > 0) {
        if (fecharContaConfirmar) fecharContaConfirmar.disabled = false;
        fecharContaFaltaLbl.style.color = 'green';
      } else {
        if (fecharContaConfirmar) fecharContaConfirmar.disabled = true;
        fecharContaFaltaLbl.style.color = 'red';
      }
    }

    renderPainelPagamento();
    updateFecharContaFooterSummary();
  }

  function renderResumoItens() {
    if (!fecharContaResumo) return;
    const { currentFechamento, currentPartes, parteAtivaId } = estadoPDV;
    let htmlResumo = '<ul style="padding-left:16px; margin:0; list-style-type:none;">';

    currentFechamento.pedidos.forEach(p => {
      const valorPedido = Number(p.total || 0);
      let statusHtml = '';
      if (p.status_pagamento === 'pago') {
        statusHtml = '<span style="color:green; font-weight:bold;">(Pago)</span>';
      }

      htmlResumo += `<li style="margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between;">
          <span>Pedido #${p.numero_pedido || p.id} ${statusHtml}</span>
          <strong>R$ ${valorPedido.toFixed(2).replace('.', ',')}</strong>
        </div>`;

      if (fecharContaModo?.value === 'item' && p.status_pagamento !== 'pago') {
        let atribuido = 0;
        let badges = '';
        if (p._atribuicoes) {
          p._atribuicoes.forEach(a => {
            atribuido += a.perc;
            const pt = currentPartes.find(x => x.id === a.parteId);
            if (pt) {
              badges += `<span style="font-size:10px; background:#ddd; padding:2px 4px; border-radius:4px; margin-right:4px;">${window.escapeHtml(pt.nome)} (${a.perc}%)</span>`;
            }
          });
        }

        let botoesAtrib = '';
        if (atribuido < 100 && parteAtivaId) {
          const faltante = 100 - atribuido;
          botoesAtrib = `
            <div style="margin-top: 4px;">
              ${faltante === 100 ? `<button class="btn-ghost-small btn-atribuir-parte" data-action="barista-atribuir-item" data-pedido-item-id="${p.id}" data-percentual="100">Atribuir 100%</button>` : ''}
              <button class="btn-ghost-small btn-atribuir-parte" data-action="barista-atribuir-item" data-pedido-item-id="${p.id}" data-percentual="50">+50%</button>
              <button class="btn-ghost-small btn-atribuir-parte" data-action="barista-atribuir-item" data-pedido-item-id="${p.id}" data-percentual="${faltante}">Restante (${faltante}%)</button>
            </div>
          `;
        }

        htmlResumo += `<div>${badges}${botoesAtrib}</div>`;
      }

      htmlResumo += '</li>';
    });
    htmlResumo += '</ul>';
    fecharContaResumo.innerHTML = htmlResumo;
  }

  function recalcularValorDevidoItemMode() {
    estadoPDV.currentPartes.forEach(pt => { pt.valor_devido = 0; });

    estadoPDV.currentFechamento.pedidos.forEach(p => {
      if (p.status_pagamento === 'pago') return;
      if (!p._atribuicoes) return;

      const valorPedido = Number(p.total || 0);
      p._atribuicoes.forEach(a => {
        const pt = estadoPDV.currentPartes.find(x => x.id === a.parteId);
        if (pt) {
          pt.valor_devido += (valorPedido * (a.perc / 100));
        }
      });
    });
  }

  function recalcularTotaisFechamento() {
    const { currentFechamento, configTaxaServico, currentPartes } = estadoPDV;
    const modo = fecharContaModo?.value || 'padrao';
    let subtotalOperacao = 0;

    if (modo === 'parcial_item') {
      let subtotalItens = 0;
      const chks = fecharContaListaItensParcial?.querySelectorAll('.chk-item-parcial:checked') || [];
      chks.forEach(chk => {
        const id = chk.getAttribute('data-id');
        const preco = Number(chk.getAttribute('data-preco')) || 0;
        const inputQtd = fecharContaListaItensParcial.querySelector(`.input-qtd-parcial[data-id="${id}"]`);
        const maxQtd = Number(inputQtd?.getAttribute('max')) || 1;
        let qtd = Number(inputQtd?.value) || 1;
        if (qtd > maxQtd) qtd = maxQtd;
        if (qtd < 1) qtd = 1;
        subtotalItens += (qtd * preco);
      });
      subtotalOperacao = subtotalItens;

      let taxa = 0;
      if (configTaxaServico.ativa && fecharContaTaxaCheck?.checked) {
        taxa = (subtotalOperacao * configTaxaServico.percentual) / 100;
      }
      currentFechamento.taxaServico = taxa;
      currentFechamento.descontoAplicado = 0;
      currentFechamento.totalConta = subtotalOperacao + taxa;
      currentFechamento.aPagar = currentFechamento.totalConta;
    } else if (modo === 'parcial_valor') {
      const saldoRestanteMax = Math.max(0, currentFechamento.subtotal - currentFechamento.jaPago);
      let valAbatimento = Number(fecharContaInputParcialValor?.value) || 0;
      if (valAbatimento > saldoRestanteMax) {
        valAbatimento = saldoRestanteMax;
        if (fecharContaInputParcialValor) fecharContaInputParcialValor.value = valAbatimento.toFixed(2);
      }
      subtotalOperacao = valAbatimento;

      let taxa = 0;
      if (configTaxaServico.ativa && fecharContaTaxaCheck?.checked) {
        taxa = (subtotalOperacao * configTaxaServico.percentual) / 100;
      }
      currentFechamento.taxaServico = taxa;
      currentFechamento.descontoAplicado = 0;
      currentFechamento.totalConta = subtotalOperacao + taxa;
      currentFechamento.aPagar = currentFechamento.totalConta;
    } else {
      const saldoRestanteBase = Math.max(0, currentFechamento.subtotal - currentFechamento.jaPago);
      let desconto = 0;
      if (fecharContaDescontoValor?.value) {
        const val = Number(fecharContaDescontoValor.value);
        if (fecharContaDescontoTipo?.value === 'percent') {
          desconto = (saldoRestanteBase * val) / 100;
        } else {
          desconto = val;
        }
      }
      if (desconto > saldoRestanteBase) {
        desconto = saldoRestanteBase;
      }
      currentFechamento.descontoAplicado = desconto;
      currentFechamento.descontoMotivo = fecharContaDescontoMotivo ? fecharContaDescontoMotivo.value.trim() : '';

      const subtotalAposDesconto = saldoRestanteBase - desconto;
      let taxa = 0;
      if (configTaxaServico.ativa && fecharContaTaxaCheck?.checked) {
        taxa = (subtotalAposDesconto * configTaxaServico.percentual) / 100;
      }
      currentFechamento.taxaServico = taxa;
      currentFechamento.totalConta = subtotalAposDesconto + taxa;
      currentFechamento.aPagar = currentFechamento.totalConta;
    }

    if (fecharContaSubtotalLbl) fecharContaSubtotalLbl.textContent = `R$ ${currentFechamento.subtotal.toFixed(2).replace('.', ',')}`;
    if (fecharContaTaxaValLbl) fecharContaTaxaValLbl.textContent = `R$ ${currentFechamento.taxaServico.toFixed(2).replace('.', ',')}`;
    if (fecharContaTotalLbl) fecharContaTotalLbl.textContent = `R$ ${currentFechamento.totalConta.toFixed(2).replace('.', ',')}`;
    if (fecharContaJaPagoLbl) fecharContaJaPagoLbl.textContent = `R$ ${currentFechamento.jaPago.toFixed(2).replace('.', ',')}`;
    if (fecharContaAPagarLbl) fecharContaAPagarLbl.textContent = `R$ ${currentFechamento.aPagar.toFixed(2).replace('.', ',')}`;

    if (modo === 'padrao' || modo === 'parcial_item' || modo === 'parcial_valor') {
      if (currentPartes.length > 0) {
        currentPartes[0].valor_devido = currentFechamento.aPagar;
      }
    } else if (modo === 'igual') {
      if (btnGerarPartesIgual) btnGerarPartesIgual.click();
    }

    renderPartes();
    updateFecharContaFooterSummary();
  }

  function renderListaItensParciais() {
    if (!fecharContaListaItensParcial) return;
    const itens = [];
    (estadoPDV.currentFechamento.pedidos || []).forEach(p => {
      if (p.status_pagamento === 'pago') return;
      (p.pedido_itens || []).forEach(it => {
        if (it.cancelado) return;
        const qtdTotal = Number(it.quantidade) || 0;
        const qtdPaga = Number(it.quantidade_paga) || 0;
        const pendente = Math.max(0, qtdTotal - qtdPaga);
        if (pendente > 0) {
          itens.push({
            id: it.id,
            pedidoId: p.id,
            nome: it.nome_produto || 'Item',
            pendente,
            precoUnit: Number(it.preco_unitario) || 0
          });
        }
      });
    });

    if (itens.length === 0) {
      fecharContaListaItensParcial.innerHTML = '<div style="color:#777; font-size:12px; padding:6px;">Todos os itens individuais já estão quitados.</div>';
      return;
    }

    let html = '';
    itens.forEach(it => {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #eee;">
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; flex:1;">
            <input type="checkbox" class="chk-item-parcial" data-id="${it.id}" data-preco="${it.precoUnit}" style="width:18px; height:18px;">
            <span><strong>${it.pendente}x</strong> ${window.escapeHtml(it.nome)} (R$ ${it.precoUnit.toFixed(2).replace('.', ',')}/un)</span>
          </label>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px; color:#555;">Pagar:</span>
            <input type="number" class="input-qtd-parcial input-padrao" data-id="${it.id}" min="1" max="${it.pendente}" value="${it.pendente}" style="width:55px; text-align:center; padding:2px;" disabled>
          </div>
        </div>
      `;
    });
    fecharContaListaItensParcial.innerHTML = html;

    fecharContaListaItensParcial.querySelectorAll('.chk-item-parcial').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const inputQtd = fecharContaListaItensParcial.querySelector(`.input-qtd-parcial[data-id="${id}"]`);
        if (inputQtd) {
          inputQtd.disabled = !e.target.checked;
        }
        recalcularTotaisFechamento();
      });
    });

    fecharContaListaItensParcial.querySelectorAll('.input-qtd-parcial').forEach(inp => {
      inp.addEventListener('input', () => {
        recalcularTotaisFechamento();
      });
    });
  }

  function abrirModalFecharConta(mesaCodigo, pedidosMesa) {
    const { currentFechamento, configTaxaServico } = estadoPDV;
    currentFechamento.mesaCodigo = mesaCodigo;
    currentFechamento.pedidos = pedidosMesa;
    currentFechamento.subtotal = 0;
    currentFechamento.descontoAplicado = 0;
    currentFechamento.descontoMotivo = '';
    currentFechamento.taxaServico = 0;
    currentFechamento.totalConta = 0;
    currentFechamento.jaPago = 0;
    currentFechamento.aPagar = 0;
    currentFechamento._idempotencyKey = null;
    currentFechamento._contaClienteDebitada = false;

    pedidosMesa.forEach(p => {
      const valorPedido = Number(p.total || 0);
      currentFechamento.subtotal += valorPedido;
      if (p.status_pagamento === 'pago') {
        currentFechamento.jaPago += valorPedido;
      } else {
        p._atribuicoes = [];
        (p.pedido_itens || []).forEach(it => {
          if (!it.cancelado && Number(it.quantidade_paga || 0) > 0) {
            currentFechamento.jaPago += (Number(it.quantidade_paga) * Number(it.preco_unitario || 0));
          }
        });
      }
    });

    if (currentFechamento.subtotal - currentFechamento.jaPago <= 0.001) {
      showToast('Esta mesa não tem pedidos pendentes de pagamento.', 'info');
      return;
    }

    if (fecharContaTitle) fecharContaTitle.textContent = `Fechar Conta: ${mesaCodigo}`;

    if (configTaxaServico.ativa) {
      fecharContaDivTaxa?.classList.remove('hidden');
      if (fecharContaTaxaCheck) fecharContaTaxaCheck.checked = true;
      if (fecharContaTaxaPercLbl) fecharContaTaxaPercLbl.textContent = `${configTaxaServico.percentual}%`;
    } else {
      fecharContaDivTaxa?.classList.add('hidden');
      if (fecharContaTaxaCheck) fecharContaTaxaCheck.checked = false;
    }

    const temPermissaoDesconto = estadoPDV.fn.usuarioTemPermissao?.('pdv.desconto');
    const btnSolicitarDescontoContainer = document.getElementById('fechar-conta-btn-pedir-desconto-container');
    currentFechamento._supervisorDesconto = null;

    if (temPermissaoDesconto) {
      fecharContaDivDesconto?.classList.remove('hidden');
      if (btnSolicitarDescontoContainer) btnSolicitarDescontoContainer.classList.add('hidden');
      if (fecharContaDescontoTipo) fecharContaDescontoTipo.value = 'valor';
      if (fecharContaDescontoValor) fecharContaDescontoValor.value = '';
      if (fecharContaDescontoMotivo) fecharContaDescontoMotivo.value = '';
    } else {
      fecharContaDivDesconto?.classList.add('hidden');
      if (btnSolicitarDescontoContainer) btnSolicitarDescontoContainer.classList.remove('hidden');
      if (fecharContaDescontoValor) fecharContaDescontoValor.value = '';
      if (fecharContaDescontoMotivo) fecharContaDescontoMotivo.value = '';
    }

    if (fecharContaCupomInput) fecharContaCupomInput.value = '';
    if (fecharContaCupomMsg) {
      fecharContaCupomMsg.style.display = 'none';
      fecharContaCupomMsg.textContent = '';
    }
    currentFechamento._cupomCampanhaId = null;
    currentFechamento._cupomCodigo = null;

    recalcularTotaisFechamento();

    if (fecharContaModo) {
      fecharContaModo.value = 'padrao';
      fecharContaModo.dispatchEvent(new Event('change'));
    }

    modalMesa?.classList.add('hidden');
    modalFecharConta?.classList.remove('hidden');
    setFecharContaStep(1);
  }

  function fecharModalFecharConta() {
    if (pixFechamentoMonitor) {
      pixFechamentoMonitor.stop();
      pixFechamentoMonitor = null;
    }
    modalFecharConta?.classList.add('hidden');
    if (estadoPDV.currentSelectedMesaParaConta) {
      estadoPDV.fn.abrirModalMesa?.(
        estadoPDV.currentSelectedMesaParaConta.mesaCodigo,
        estadoPDV.currentSelectedMesaParaConta.pedidosMesa
      );
    }
  }

  // Event Listeners
  if (fecharContaDescontoValor) fecharContaDescontoValor.addEventListener('input', recalcularTotaisFechamento);
  if (fecharContaDescontoTipo) fecharContaDescontoTipo.addEventListener('change', recalcularTotaisFechamento);
  if (fecharContaDescontoMotivo) {
    fecharContaDescontoMotivo.addEventListener('input', () => {
      estadoPDV.currentFechamento.descontoMotivo = fecharContaDescontoMotivo.value.trim();
    });
  }
  if (fecharContaTaxaCheck) fecharContaTaxaCheck.addEventListener('change', recalcularTotaisFechamento);

  if (btnFecharContaAplicarCupom) {
    btnFecharContaAplicarCupom.addEventListener('click', async () => {
      const code = (fecharContaCupomInput?.value || '').trim();
      if (!code) {
        if (fecharContaCupomMsg) {
          fecharContaCupomMsg.textContent = 'Informe o código do cupom.';
          fecharContaCupomMsg.style.color = '#dc2626';
          fecharContaCupomMsg.style.display = 'block';
        }
        return;
      }

      btnFecharContaAplicarCupom.disabled = true;
      btnFecharContaAplicarCupom.textContent = 'Validando...';

      const validator = window.couponValidator;
      const sb = window.cafeteriaSupabase || window.supabaseClient;
      const subtotal = estadoPDV.currentFechamento ? estadoPDV.currentFechamento.subtotal : 0;

      let res = null;
      if (validator && sb) {
        res = await validator.validateCouponWithSupabase(sb, code, subtotal);
      } else {
        res = { valid: false, message: 'Validador de cupons não disponível.' };
      }

      btnFecharContaAplicarCupom.disabled = false;
      btnFecharContaAplicarCupom.textContent = 'Aplicar';

      if (res && res.valid) {
        fecharContaDivDesconto?.classList.remove('hidden');
        if (fecharContaDescontoTipo) fecharContaDescontoTipo.value = (res.tipo_desconto === 'percentual' || res.tipo_desconto === 'percent') ? 'percent' : 'valor';
        if (fecharContaDescontoValor) fecharContaDescontoValor.value = res.valor_desconto;
        if (fecharContaDescontoMotivo) fecharContaDescontoMotivo.value = `Cupom: ${res.cupom_codigo}`;
        if (estadoPDV.currentFechamento) {
          estadoPDV.currentFechamento._cupomCampanhaId = res.campanha_id;
          estadoPDV.currentFechamento._cupomCodigo = res.cupom_codigo;
          estadoPDV.currentFechamento.cupomCodigo = res.cupom_codigo;
        }

        if (fecharContaCupomMsg) {
          const descCalc = Number(res.desconto_calculado ?? res.valor_desconto ?? 0);
          fecharContaCupomMsg.textContent = `✅ ${res.message || 'Cupom aplicado!'} (- R$ ${descCalc.toFixed(2).replace('.', ',')})`;
          fecharContaCupomMsg.style.color = '#15803d';
          fecharContaCupomMsg.style.display = 'block';
        }

        recalcularTotaisFechamento();
      } else {
        if (fecharContaCupomMsg) {
          fecharContaCupomMsg.textContent = `❌ ${res ? res.message : 'Cupom inválido.'}`;
          fecharContaCupomMsg.style.color = '#dc2626';
          fecharContaCupomMsg.style.display = 'block';
        }
      }
    });
  }

  if (btnSolicitarDescontoPin) {
    btnSolicitarDescontoPin.addEventListener('click', async () => {
      const auth = await estadoPDV.fn.pedirAutorizacaoPin?.(
        'pdv.desconto',
        `Liberação de desconto para ${estadoPDV.currentFechamento ? estadoPDV.currentFechamento.mesaCodigo : 'a mesa'}`,
        { mesa_codigo: estadoPDV.currentFechamento ? estadoPDV.currentFechamento.mesaCodigo : null }
      );
      if (auth) {
        estadoPDV.currentFechamento._supervisorDesconto = auth;
        fecharContaDivDesconto?.classList.remove('hidden');
        document.getElementById('fechar-conta-btn-pedir-desconto-container')?.classList.add('hidden');
        if (auth.motivo && fecharContaDescontoMotivo && !fecharContaDescontoMotivo.value) {
          fecharContaDescontoMotivo.value = auth.motivo;
        }
        fecharContaDescontoValor?.focus();
      }
    });
  }

  if (fecharContaModo) {
    fecharContaModo.addEventListener('change', () => {
      const modo = fecharContaModo.value;
      fecharContaDivPessoas?.classList.add('hidden');
      fecharContaDivAddParte?.classList.add('hidden');
      if (fecharContaDivParcialItens) fecharContaDivParcialItens.classList.add('hidden');
      if (fecharContaDivParcialValor) fecharContaDivParcialValor.classList.add('hidden');

      estadoPDV.currentPartes = [];
      estadoPDV.parteAtivaId = null;

      if (modo === 'padrao') {
        estadoPDV.currentPartes.push({
          id: 1,
          nome: 'Parte Única',
          valor_devido: estadoPDV.currentFechamento.aPagar,
          pagamentos: [],
          dinheiro_recebido: 0
        });
        estadoPDV.parteAtivaId = 1;
      } else if (modo === 'igual') {
        fecharContaDivPessoas?.classList.remove('hidden');
      } else if (modo === 'item') {
        fecharContaDivAddParte?.classList.remove('hidden');
        estadoPDV.currentFechamento.pedidos.forEach(p => { if (p._atribuicoes) p._atribuicoes = []; });
      } else if (modo === 'parcial_item') {
        if (fecharContaDivParcialItens) fecharContaDivParcialItens.classList.remove('hidden');
        renderListaItensParciais();
        estadoPDV.currentPartes.push({
          id: 1,
          nome: 'Pagamento Parcial (Itens)',
          valor_devido: 0,
          pagamentos: [],
          dinheiro_recebido: 0
        });
        estadoPDV.parteAtivaId = 1;
      } else if (modo === 'parcial_valor') {
        if (fecharContaDivParcialValor) fecharContaDivParcialValor.classList.remove('hidden');
        estadoPDV.currentPartes.push({
          id: 1,
          nome: 'Pagamento Parcial (Abatimento)',
          valor_devido: 0,
          pagamentos: [],
          dinheiro_recebido: 0
        });
        estadoPDV.parteAtivaId = 1;
      }
      recalcularTotaisFechamento();
      renderPartes();
      renderResumoItens();
    });
  }

  if (fecharContaInputParcialValor) {
    fecharContaInputParcialValor.addEventListener('input', recalcularTotaisFechamento);
  }

  if (btnGerarPartesIgual) {
    btnGerarPartesIgual.addEventListener('click', () => {
      const num = Number(fecharContaNumPessoas?.value);
      if (num < 2) return;
      estadoPDV.currentPartes = [];

      const partesValores = window.cafeteriaDivisaoConta
        ? window.cafeteriaDivisaoConta.dividirConta(estadoPDV.currentFechamento.aPagar, num)
        : [estadoPDV.currentFechamento.aPagar];

      estadoPDV.currentPartes = partesValores.map((valor, idx) => ({
        id: idx + 1,
        nome: `Parte ${idx + 1}`,
        valor_devido: valor,
        pagamentos: [],
        dinheiro_recebido: 0
      }));
      estadoPDV.parteAtivaId = 1;
      renderPartes();
    });
  }

  if (btnAddParteItem) {
    btnAddParteItem.addEventListener('click', () => {
      const nome = (fecharContaNomeParte?.value || '').trim() || `Parte ${estadoPDV.currentPartes.length + 1}`;
      estadoPDV.currentPartes.push({
        id: Date.now(),
        nome: nome,
        valor_devido: 0,
        pagamentos: [],
        dinheiro_recebido: 0
      });
      if (fecharContaNomeParte) fecharContaNomeParte.value = '';
      renderPartes();
    });
  }

  document.getElementById('btn-fechar-pix-copiar')?.addEventListener('click', function () {
    if (!estadoPDV.ultimoPixFechamentoState.payload) {
      showToast('Chave Pix não configurada no Admin.', 'warn');
      return;
    }
    window.cafeteriaPix?.copiarCodigoPix(estadoPDV.ultimoPixFechamentoState.payload, this);
    showToast('Código Pix Copia e Cola copiado!', 'success');
  });

  document.getElementById('btn-fechar-pix-fullscreen')?.addEventListener('click', () => {
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: estadoPDV.ultimoPixFechamentoState.valor,
      txid: estadoPDV.ultimoPixFechamentoState.txid,
      subtitulo: estadoPDV.ultimoPixFechamentoState.subtitulo
    });
  });

  async function iniciarPixDinamicoPDV() {
    if (!estadoPDV.parteAtivaId) {
      showToast('Selecione uma parte da conta primeiro.', 'warn');
      return;
    }
    const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
    if (!pt) return;
    const pago = pt.pagamentos.reduce((s, p) => s + p.valor, 0);
    const valorRestante = Number((pt.valor_devido - pago).toFixed(2));
    if (valorRestante <= 0) {
      showToast('Esta parte já está totalmente paga.', 'info');
      return;
    }

    const boxDinamico = document.getElementById('fechar-pix-dinamico-box');
    const statusLbl = document.getElementById('fechar-pix-dinamico-status');
    const timerLbl = document.getElementById('fechar-pix-dinamico-timer');
    const fallbackAviso = document.getElementById('fechar-pix-fallback-aviso');
    const btnRegenerar = document.getElementById('btn-fechar-pix-regenerar');
    const qrContainer = document.getElementById('fechar-conta-pix-qr');

    if (pixFechamentoMonitor) {
      pixFechamentoMonitor.stop();
      pixFechamentoMonitor = null;
    }

    boxDinamico?.classList.remove('hidden');
    fallbackAviso?.classList.add('hidden');
    btnRegenerar?.classList.add('hidden');
    if (statusLbl) statusLbl.textContent = '⏳ Gerando Pix Dinâmico...';
    if (timerLbl) timerLbl.textContent = '--:--';

    try {
      const mesaCod = estadoPDV.currentSelectedMesaParaConta?.mesaCodigo || estadoPDV.currentFechamento.mesaCodigo || 'MESA';
      const cobranca = await window.cafeteriaPix.criarCobrancaDinamica({
        mesaCodigo: mesaCod,
        parteNome: pt.nome,
        valor: valorRestante,
        canal: 'pdv',
        descricao: `PDV ${mesaCod} - ${pt.nome}`,
        expiracaoMin: 10,
        timeoutMs: 4500
      });

      if (!cobranca.ok) {
        showToast('Não foi possível gerar Pix: ' + (cobranca.erro || 'Verifique configurações'), 'error');
        boxDinamico?.classList.add('hidden');
        return;
      }

      estadoPDV.ultimoPixFechamentoState.payload = cobranca.payload;
      estadoPDV.ultimoPixFechamentoState.txid = cobranca.txid;
      estadoPDV.ultimoPixFechamentoState.valor = cobranca.valor;

      if (qrContainer) {
        qrContainer.innerHTML = window.cafeteriaPix.gerarQrSvg(cobranca.payload, 3, 1);
      }

      if (cobranca.fallback && fallbackAviso) {
        fallbackAviso.classList.remove('hidden');
      }

      if (cobranca.modo === 'dinamico') {
        if (statusLbl) statusLbl.textContent = '⏳ Aguardando pagamento Pix...';
        pixFechamentoMonitor = window.cafeteriaPix.monitorarCobrancaPix({
          txid: cobranca.txid,
          expiraEm: cobranca.expiraEm,
          onTick: ({ restanteSegundos }) => {
            if (timerLbl) {
              timerLbl.textContent = window.cafeteriaPix.formatarContagemRegressiva(restanteSegundos);
            }
          },
          onPago: (row) => {
            if (statusLbl) statusLbl.textContent = '✅ Pix Confirmado com Sucesso!';
            if (timerLbl) timerLbl.textContent = '00:00';
            pt.pagamentos.push({
              id: Date.now(),
              forma: 'pix',
              valor: Number(row.valor || valorRestante),
              pix_cobranca_id: row.id,
              pix_txid: row.txid
            });
            if (fecharContaValor) fecharContaValor.value = '';
            renderPartes();
            showToast('Pagamento Pix confirmado automaticamente! ✅', 'success');
          },
          onExpirada: () => {
            if (statusLbl) statusLbl.textContent = '⚠️ Cobrança Pix Expirada';
            btnRegenerar?.classList.remove('hidden');
          }
        });
      }
    } catch (err) {
      console.warn('Erro ao gerar cobrança dinâmica no PDV:', err);
      showToast('Erro ao iniciar cobrança Pix.', 'error');
      boxDinamico?.classList.add('hidden');
    }
  }

  document.getElementById('btn-fechar-pix-dinamico')?.addEventListener('click', iniciarPixDinamicoPDV);
  document.getElementById('btn-fechar-pix-regenerar')?.addEventListener('click', iniciarPixDinamicoPDV);

  if (fecharContaValor) {
    fecharContaValor.addEventListener('input', () => {
      if (fecharContaForma?.value === 'pix' && estadoPDV.parteAtivaId) {
        const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
        if (pt) {
          const pago = pt.pagamentos.reduce((s, p) => s + p.valor, 0);
          atualizarPixFechamentoBox(pt, pt.valor_devido - pago);
        }
      }
    });
  }

  if (fecharContaForma) {
    fecharContaForma.addEventListener('change', () => {
      if (fecharContaForma.value === 'dinheiro') {
        divDinheiroRecebido?.classList.remove('hidden');
        document.getElementById('div-pix-fechamento')?.classList.add('hidden');
        renderPainelPagamento();
      } else {
        divDinheiroRecebido?.classList.add('hidden');
        renderPainelPagamento();
      }
    });
  }

  if (inputDinheiroRecebido) {
    inputDinheiroRecebido.addEventListener('input', () => {
      if (estadoPDV.parteAtivaId) {
        const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
        if (pt) {
          pt.dinheiro_recebido = Number(inputDinheiroRecebido.value) || 0;
          renderPainelPagamento();
        }
      }
    });
  }

  if (btnAddPagamento) {
    btnAddPagamento.addEventListener('click', () => {
      if (!estadoPDV.parteAtivaId) return;
      const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
      if (!pt) return;

      const forma = fecharContaForma.value;
      const valor = Number(fecharContaValor.value);

      if (!valor || valor <= 0) {
        showToast('Digite um valor válido para o pagamento.', 'error');
        return;
      }

      if (forma === 'conta_cliente') {
        const clienteId = estadoPDV.currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || estadoPDV.currentFechamento.clienteId;
        if (!clienteId) {
          showToast('É necessário vincular um cliente cadastrado à mesa para pagar com Conta do Cliente.', 'warning');
          return;
        }
      }

      pt.pagamentos.push({
        id: Date.now(),
        forma: forma,
        valor: valor
      });

      fecharContaValor.value = '';
      renderPartes();
    });
  }

  [fecharContaClose, fecharContaCancelar].filter(Boolean).forEach(b => b.addEventListener('click', fecharModalFecharConta));

  if (fecharContaConfirmar) {
    fecharContaConfirmar.addEventListener('click', async () => {
      const { currentPartes, currentFechamento } = estadoPDV;
      const todosPagamentos = [];
      currentPartes.forEach(pt => {
        pt.pagamentos.forEach(pag => {
          todosPagamentos.push({ forma: pag.forma, valor: pag.valor, parteNome: pt.nome });
        });
      });

      const totalPagamentos = todosPagamentos.reduce((sum, p) => sum + p.valor, 0);

      if (totalPagamentos < currentFechamento.aPagar - 0.05) {
        showToast('O valor dos pagamentos é menor que o total a pagar!', 'error');
        return;
      }

      if (todosPagamentos.length === 0) {
        showToast('Adicione pelo menos uma forma de pagamento.', 'error');
        return;
      }

      const modo = fecharContaModo?.value;
      const isParcial = modo === 'parcial_item' || modo === 'parcial_valor';

      if (isParcial) {
        const itensPayload = [];
        const itensParaImpressao = [];
        let valorAbatimento = 0;

        if (modo === 'parcial_item') {
          const chks = fecharContaListaItensParcial?.querySelectorAll('.chk-item-parcial:checked') || [];
          if (chks.length === 0) {
            showToast('Selecione pelo menos um item para pagar.', 'warning');
            return;
          }
          chks.forEach(chk => {
            const id = Number(chk.getAttribute('data-id'));
            const inputQtd = fecharContaListaItensParcial.querySelector(`.input-qtd-parcial[data-id="${id}"]`);
            const qtd = Number(inputQtd?.value) || 1;
            const preco = Number(chk.getAttribute('data-preco')) || 0;
            itensPayload.push({ pedido_item_id: id, quantidade: qtd });
            itensParaImpressao.push({
              id,
              quantidade: qtd,
              preco_unitario: preco,
              nome_produto: chk.closest('label')?.querySelector('span')?.textContent || 'Item'
            });
          });
        } else {
          valorAbatimento = Number(fecharContaInputParcialValor?.value) || 0;
          if (valorAbatimento <= 0) {
            showToast('Informe um valor de abatimento maior que zero.', 'warning');
            return;
          }
        }

        fecharContaConfirmar.disabled = true;
        fecharContaConfirmar.textContent = 'Registrando...';

        try {
          if (!currentFechamento._idempotencyKey) {
            currentFechamento._idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
          }
          const idempotencyKey = currentFechamento._idempotencyKey;

          const pagamentosPayload = todosPagamentos.map(p => ({
            forma: p.forma,
            valor: p.valor
          }));

          const { data, error } = await window.cafeteriaSupabase.rpc('registrar_pagamento_parcial_mesa', {
            p_mesa_codigo: currentFechamento.mesaCodigo,
            p_pagamentos: pagamentosPayload,
            p_itens: itensPayload,
            p_valor_abatimento: valorAbatimento,
            p_taxa_servico: Number(currentFechamento.taxaServico || 0),
            p_idempotency_key: idempotencyKey
          });

          if (error) throw error;

          if (fecharContaImprimirCupom?.checked && window.cafeteriaPrint && window.cafeteriaPrint.printPagamentoParcialMesa) {
            window.cafeteriaPrint.printPagamentoParcialMesa(
              currentFechamento.mesaCodigo,
              itensParaImpressao,
              pagamentosPayload,
              data?.total_pago || currentFechamento.aPagar,
              data?.saldo_restante || 0,
              data?.troco || 0,
              Number(currentFechamento.taxaServico || 0)
            );
          }

          if (fecharContaEmitirNfce?.checked && data?.fechamento_id && window.cafeteriaDB?.nfce) {
            try {
              const nfceRes = await window.cafeteriaDB.nfce.emitirNfce({
                fechamentoId: data.fechamento_id,
                consumidorCpfCnpj: fecharContaNfceCpf?.value || null
              });

              if (nfceRes?.sucesso && nfceRes?.nota) {
                showToast(`NFC-e parcial nº ${nfceRes.nota.numero} autorizada!`, 'success');
                if (fecharContaImprimirCupom?.checked && window.cafeteriaPrint?.printDanfeNfce) {
                  window.cafeteriaPrint.printDanfeNfce(nfceRes.nota);
                }
              } else if (nfceRes?.status === 'rejeitada') {
                showToast(`Venda salva, mas NFC-e rejeitada: ${nfceRes.motivo || 'Verifique no Admin'}`, 'warning');
              } else if (nfceRes?.contingencia || nfceRes?.status === 'contingencia') {
                showToast('SEFAZ indisponível. NFC-e parcial salva em contingência.', 'warning');
              } else if (nfceRes?.erro) {
                showToast(`Aviso NFC-e: ${nfceRes.erro}`, 'warning');
              }
            } catch (nfceErr) {
              console.warn('[Fechamento Parcial] Falha na emissão NFC-e:', nfceErr);
              showToast('Pagamento registrado. Falha na emissão da NFC-e.', 'warning');
            }
          }

          showToast('Pagamento parcial registrado com sucesso!', 'success');
          modalFecharConta?.classList.add('hidden');
          await estadoPDV.fn.loadActivePedidos?.();
          return;
        } catch (err) {
          console.error('[Fechamento Parcial] Erro:', err);
          showToast('Erro ao registrar pagamento parcial: ' + (err.message || 'Falha na operação'), 'error');
          return;
        } finally {
          fecharContaConfirmar.disabled = false;
          fecharContaConfirmar.textContent = 'Confirmar Fechamento';
        }
      }

      const pagtoContaCliente = todosPagamentos.find(p => p.forma === 'conta_cliente');
      if (pagtoContaCliente) {
        const clienteId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || currentFechamento.clienteId;
        if (!clienteId) {
          showToast('Erro: mesa sem cliente vinculado para pagamento via Conta do Cliente.', 'error');
          return;
        }
      }

      if (currentFechamento.descontoAplicado > 0 && !estadoPDV.fn.usuarioTemPermissao?.('pdv.desconto') && !currentFechamento._supervisorDesconto) {
        const auth = await estadoPDV.fn.pedirAutorizacaoPin?.(
          'pdv.desconto',
          `Aprovar desconto de R$ ${currentFechamento.descontoAplicado.toFixed(2)} no fechamento da mesa ${currentFechamento.mesaCodigo}`,
          { mesa_codigo: currentFechamento.mesaCodigo, desconto: currentFechamento.descontoAplicado }
        );
        if (!auth) {
          showToast('Desconto não autorizado por supervisor.', { tipo: 'warning' });
          return;
        }
        currentFechamento._supervisorDesconto = auth;
      }

      fecharContaConfirmar.disabled = true;
      fecharContaConfirmar.textContent = 'Fechando...';

      try {
        if (!currentFechamento._idempotencyKey) {
          currentFechamento._idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        }
        const idempotencyKey = currentFechamento._idempotencyKey;

        if (pagtoContaCliente && !currentFechamento._contaClienteDebitada) {
          const clienteId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || currentFechamento.clienteId;
          if (window.cafeteriaDB && window.cafeteriaDB.clientes && window.cafeteriaDB.clientes.lancarMovimento) {
            const resDebito = await window.cafeteriaDB.clientes.lancarMovimento(
              clienteId,
              'consumo',
              -Math.abs(pagtoContaCliente.valor),
              currentFechamento.pedidos[0]?.id || null,
              null,
              'conta_cliente',
              `Fechamento Mesa ${currentFechamento.mesaCodigo}`
            );
            if (resDebito && !resDebito.sucesso) {
              showToast(`Débito na conta recusado: ${resDebito?.mensagem || 'Saldo/limite insuficiente.'}`, 'error');
              fecharContaConfirmar.disabled = false;
              fecharContaConfirmar.textContent = 'Confirmar Fechamento';
              return;
            }
            currentFechamento._contaClienteDebitada = true;
          }
        }
        const pagamentosPayload = todosPagamentos.map(p => ({
          forma: p.forma,
          valor: p.valor
        }));

        const { data, error } = await window.cafeteriaSupabase.rpc('fechar_conta_mesa', {
          p_mesa_codigo: currentFechamento.mesaCodigo,
          p_pagamentos: pagamentosPayload,
          p_taxa_servico: Number(currentFechamento.taxaServico || 0),
          p_desconto_manual: Number(currentFechamento.descontoAplicado || 0),
          p_desconto_motivo: currentFechamento.descontoMotivo || null,
          p_idempotency_key: idempotencyKey,
          p_cupom_codigo: currentFechamento.cupomCodigo || currentFechamento._cupomCodigo || null,
          p_campanha_id: currentFechamento._cupomCampanhaId || null
        });

        if (error) throw error;

        if (currentFechamento._cupomCampanhaId && window.couponValidator) {
          try {
            const primeiroPedidoId = currentFechamento.pedidos[0]?.id;
            await window.couponValidator.registerCouponUsage(
              window.cafeteriaSupabase || window.supabaseClient,
              currentFechamento._cupomCampanhaId,
              primeiroPedidoId
            );
          } catch (couponErr) {
            console.warn('[Fechamento] Falha ao registrar estatística do cupom:', couponErr);
            showToast('Aviso: conta fechada, mas não foi possível registrar estatística do cupom.', 'warning');
          }
        }

        if (window.cafeteriaCashback) {
          try {
            const sbClient = window.cafeteriaSupabase || window.supabaseClient;
            const cbConfig = await (window.cafeteriaCashback.loadCashbackConfig
              ? window.cafeteriaCashback.loadCashbackConfig(sbClient)
              : Promise.resolve(null));

            if (window.cafeteriaCashback.isCashbackActive(cbConfig)) {
              const clienteComId = currentFechamento.pedidos.find(p => p.cliente_id)?.cliente_id || null;
              if (clienteComId) {
                const valorElegivel = window.cafeteriaCashback.calculateEligiblePaymentAmount(todosPagamentos);
                if (valorElegivel > 0) {
                  const cbResult = await window.cafeteriaCashback.processOrderCashback(
                    sbClient,
                    currentFechamento.pedidos[0]?.id || null,
                    clienteComId,
                    valorElegivel
                  );
                  if (cbResult && cbResult.creditado && cbResult.valor_cashback > 0) {
                    const msg = window.cafeteriaCashback.formatCashbackNotification(
                      cbResult.valor_cashback,
                      cbResult.novo_saldo
                    );
                    showToast(msg || `🎁 Cashback de R$ ${Number(cbResult.valor_cashback).toFixed(2).replace('.', ',')} creditado!`, 'info');
                  }
                }
              }
            }
          } catch (cbErr) {
            console.warn('[Cashback] Erro ao processar:', cbErr);
          }
        }

        showToast(`Conta da mesa ${currentFechamento.mesaCodigo} fechada com sucesso!`, 'success');

        if (fecharContaImprimirCupom?.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoContaMultiPartes) {
          window.cafeteriaPrint.printFechamentoContaMultiPartes(
            currentFechamento.mesaCodigo,
            currentFechamento.pedidos,
            currentPartes,
            currentFechamento.aPagar,
            data.troco || 0,
            currentFechamento.subtotal,
            currentFechamento.descontoAplicado,
            currentFechamento.taxaServico
          );
        } else if (fecharContaImprimirCupom?.checked && window.cafeteriaPrint && window.cafeteriaPrint.printFechamentoConta) {
          window.cafeteriaPrint.printFechamentoConta(
            currentFechamento.mesaCodigo,
            currentFechamento.pedidos,
            todosPagamentos,
            currentFechamento.aPagar,
            data.troco || 0,
            currentFechamento.subtotal,
            currentFechamento.descontoAplicado,
            currentFechamento.taxaServico
          );
        }

        if (fecharContaEmitirNfce?.checked && data?.fechamento_id && window.cafeteriaDB?.nfce) {
          try {
            const nfceRes = await window.cafeteriaDB.nfce.emitirNfce({
              fechamentoId: data.fechamento_id,
              consumidorCpfCnpj: fecharContaNfceCpf?.value || null
            });

            if (nfceRes?.sucesso && nfceRes?.nota) {
              showToast(`NFC-e nº ${nfceRes.nota.numero} autorizada!`, 'success');
              if (fecharContaImprimirCupom?.checked && window.cafeteriaPrint?.printDanfeNfce) {
                window.cafeteriaPrint.printDanfeNfce(nfceRes.nota);
              }
            } else if (nfceRes?.status === 'rejeitada') {
              showToast(`Venda salva, mas NFC-e rejeitada: ${nfceRes.motivo || 'Verifique no Admin'}`, 'warning');
            } else if (nfceRes?.contingencia || nfceRes?.status === 'contingencia') {
              showToast('SEFAZ indisponível. NFC-e salva em contingência.', 'warning');
            } else if (nfceRes?.erro) {
              showToast(`Aviso NFC-e: ${nfceRes.erro}`, 'warning');
            }
          } catch (nfceErr) {
            console.warn('[Fechamento] Falha na emissão NFC-e:', nfceErr);
            showToast('Conta fechada. Falha na emissão da NFC-e.', 'warning');
          }
        }

        estadoPDV.currentSelectedMesaParaConta = null;
        modalFecharConta?.classList.add('hidden');
        estadoPDV.fn.loadActivePedidos?.();
      } catch (err) {
        console.error(err);
        showToast('Erro ao fechar conta: ' + err.message, 'error');
      } finally {
        fecharContaConfirmar.disabled = false;
        fecharContaConfirmar.textContent = 'Confirmar Fechamento';
      }
    });
  }

  if (btnFecharContaNext1) {
    btnFecharContaNext1.addEventListener('click', () => setFecharContaStep(2));
  }
  if (btnFecharContaNext2) {
    btnFecharContaNext2.addEventListener('click', () => setFecharContaStep(3));
  }
  if (btnFecharContaVoltar) {
    btnFecharContaVoltar.addEventListener('click', () => setFecharContaStep(estadoPDV.currentFecharContaStep - 1));
  }
  if (btnFecharContaVoltarFooter) {
    btnFecharContaVoltarFooter.addEventListener('click', () => setFecharContaStep(estadoPDV.currentFecharContaStep - 1));
  }
  document.querySelectorAll('.fechar-conta-step-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const step = Number(tab.getAttribute('data-step'));
      if (step) setFecharContaStep(step);
    });
  });

  if (fecharContaEmitirNfce) {
    fecharContaEmitirNfce.addEventListener('change', () => {
      if (fecharContaNfceCpf) {
        if (fecharContaEmitirNfce.checked) {
          fecharContaNfceCpf.classList.remove('hidden');
          fecharContaNfceCpf.focus();
        } else {
          fecharContaNfceCpf.classList.add('hidden');
        }
      }
    });
  }

  // Globals (Allowlist)
  definirGlobalPDV('baristaAbrirModalFecharConta', abrirModalFecharConta);
  definirGlobalPDV('selecionarParte', function (id) {
    estadoPDV.parteAtivaId = id;
    renderPartes();
    renderResumoItens();
  });
  definirGlobalPDV('atribuirItem', function (pedidoId, percent) {
    if (fecharContaModo?.value !== 'item') return;
    if (!estadoPDV.parteAtivaId) {
      showToast('Selecione uma parte primeiro!', 'warning');
      return;
    }

    const p = estadoPDV.currentFechamento.pedidos.find(x => x.id === pedidoId);
    if (!p) return;

    p._atribuicoes = p._atribuicoes.filter(a => a.parteId !== estadoPDV.parteAtivaId);

    const totalPerc = p._atribuicoes.reduce((sum, a) => sum + a.perc, 0);
    if (totalPerc + percent > 100) {
      showToast('O item não pode passar de 100% de atribuição.', 'error');
      return;
    }

    if (percent > 0) {
      p._atribuicoes.push({ parteId: estadoPDV.parteAtivaId, perc: percent });
    }

    recalcularValorDevidoItemMode();
    renderResumoItens();
    renderPartes();
  });
  definirGlobalPDV('mostrarQrPixPagamento', function (valor, txid, parteNome) {
    const mesaCod = estadoPDV.currentFechamento?.mesaCodigo || '';
    window.cafeteriaPix?.abrirModalClienteTelaCheia({
      valor: Number(valor || 0),
      txid: txid || 'CAFMESA',
      subtitulo: `Mesa ${mesaCod} · ${parteNome || ''}`
    });
  });
  definirGlobalPDV('removerPagamentoFechamento', function (id) {
    if (!estadoPDV.parteAtivaId) return;
    const pt = estadoPDV.currentPartes.find(x => x.id === estadoPDV.parteAtivaId);
    if (pt) {
      pt.pagamentos = pt.pagamentos.filter(p => p.id !== id);
      renderPartes();
    }
  });
  definirGlobalPDV('baristaSetFecharContaStep', setFecharContaStep);

  estadoPDV.fn.abrirModalFecharConta = abrirModalFecharConta;
  estadoPDV.fn.fecharModalFecharConta = fecharModalFecharConta;
  estadoPDV.fn.renderListaItensParciais = renderListaItensParciais;
  estadoPDV.fn.recalcularTotaisFechamento = recalcularTotaisFechamento;
  estadoPDV.fn.recalcularValorDevidoItemMode = recalcularValorDevidoItemMode;
  estadoPDV.fn.renderResumoItens = renderResumoItens;
  estadoPDV.fn.renderPartes = renderPartes;
  estadoPDV.fn.renderPainelPagamento = renderPainelPagamento;
  estadoPDV.fn.setFecharContaStep = setFecharContaStep;
  estadoPDV.fn.updateFecharContaFooterSummary = updateFecharContaFooterSummary;
}
