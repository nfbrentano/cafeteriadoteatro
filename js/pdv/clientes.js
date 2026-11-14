/* =========================================================
   PDV — CLIENTES (AUTOCOMPLETE, VÍNCULO & CADASTRO RÁPIDO)
   ========================================================= */

import { estadoPDV, definirGlobalPDV } from './estado.js';

export function formatarTelefoneExibicao(tel) {
  if (!tel) return '';
  let d = String(tel).replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 10) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

export function registrarClientesPDV() {
  const {
    pedidoClienteId,
    pedidoClienteNome,
    clienteBadge,
    clienteBadgeNome,
    clienteBadgeTel,
    clienteBadgeConta,
    sugestoesClientes,
    btnDesvincularCliente,
    btnAbrirCadastroCliente,
    modalCadastroCliente,
    btnFecharModalCliente,
    btnCancelarCadastroCliente,
    formCadastroClienteRapido,
    cadClienteNome,
    cadClienteTel,
    cadClienteConsentimento,
    pedidoParaViagem,
    pedidoPrioritario,
    boxMotivoPrioridade,
    pedidoPrioridadeMotivo,
    pedidoObs,
    mesaSelect
  } = estadoPDV.refs;

  const showToast = (...args) => (window.showToast || estadoPDV.fn.showToast)?.(...args);

  function selecionarCliente(cliente) {
    if (!cliente) return;
    estadoPDV.selectedClienteObj = cliente;
    if (pedidoClienteId) pedidoClienteId.value = cliente.id;
    if (pedidoClienteNome) {
      pedidoClienteNome.value = cliente.nome;
      pedidoClienteNome.style.display = 'none';
    }
    if (clienteBadge && clienteBadgeNome) {
      clienteBadgeNome.textContent = cliente.nome;
      if (clienteBadgeTel) {
        clienteBadgeTel.textContent = cliente.telefone ? formatarTelefoneExibicao(cliente.telefone) : '';
      }
      if (clienteBadgeConta) {
        if (cliente.conta_habilitada) {
          const saldo = Number(cliente.saldo) || 0;
          const limiteDisp = Number(cliente.limite_disponivel) || 0;
          const saldoFmt = Math.abs(saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const dispFmt = limiteDisp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          if (saldo > 0) {
            clienteBadgeConta.innerHTML = `<span style="color:#15803d; font-weight:600;">💳 Créditos: +${saldoFmt}</span>`;
          } else if (saldo < 0) {
            clienteBadgeConta.innerHTML = `<span style="color:#b91c1c; font-weight:600;">💳 Fiado: ${saldoFmt} (Disp: ${dispFmt})</span>`;
          } else {
            clienteBadgeConta.innerHTML = `<span style="color:#475569; font-weight:600;">💳 Conta Habilitada (Disp: ${dispFmt})</span>`;
          }
        } else {
          clienteBadgeConta.innerHTML = '<span style="color:#64748b; font-size:11px;">Conta pós-pago: Desabilitada</span>';
        }
      }
      clienteBadge.style.display = 'flex';
    }
    if (sugestoesClientes) {
      sugestoesClientes.style.display = 'none';
      sugestoesClientes.innerHTML = '';
    }
    estadoPDV.fn.checkFormValidity?.();
    estadoPDV.fn.salvarRascunhoCarrinho?.();
  }

  function desvincularCliente() {
    estadoPDV.selectedClienteObj = null;
    if (pedidoClienteId) pedidoClienteId.value = '';
    if (pedidoClienteNome) {
      pedidoClienteNome.value = '';
      pedidoClienteNome.style.display = '';
      pedidoClienteNome.focus();
    }
    if (clienteBadgeConta) clienteBadgeConta.innerHTML = '';
    if (clienteBadge) clienteBadge.style.display = 'none';
    if (sugestoesClientes) {
      sugestoesClientes.style.display = 'none';
      sugestoesClientes.innerHTML = '';
    }
    estadoPDV.fn.checkFormValidity?.();
    estadoPDV.fn.salvarRascunhoCarrinho?.();
  }

  function abrirModalCadastroCliente(nomePreenchido = '') {
    if (!modalCadastroCliente) return;
    if (sugestoesClientes) {
      sugestoesClientes.style.display = 'none';
      sugestoesClientes.innerHTML = '';
    }
    if (cadClienteNome) cadClienteNome.value = nomePreenchido;
    if (cadClienteTel) cadClienteTel.value = '';
    if (cadClienteConsentimento) cadClienteConsentimento.checked = true;
    modalCadastroCliente.classList.remove('hidden');
    modalCadastroCliente.style.display = 'flex';
    setTimeout(() => {
      if (nomePreenchido && cadClienteTel) {
        cadClienteTel.focus();
      } else if (cadClienteNome) {
        cadClienteNome.focus();
      }
    }, 50);
  }

  function fecharModalCadastroCliente() {
    if (!modalCadastroCliente) return;
    modalCadastroCliente.classList.add('hidden');
    modalCadastroCliente.style.display = 'none';
  }

  function renderSugestoesClientes(lista, termo) {
    if (!sugestoesClientes) return;
    sugestoesClientes.innerHTML = '';

    if (!lista || lista.length === 0) {
      const itemVazio = document.createElement('div');
      itemVazio.style.padding = '8px 12px';
      itemVazio.style.fontSize = '13px';
      itemVazio.style.color = '#64748b';
      itemVazio.textContent = `Nenhum cliente cadastrado com "${termo}"`;
      sugestoesClientes.appendChild(itemVazio);
    } else {
      lista.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '13px';
        item.style.borderBottom = '1px solid #f1f5f9';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const telFmt = c.telefone ? formatarTelefoneExibicao(c.telefone) : '';
        item.innerHTML = `
          <div>
            <strong>${window.escapeHtml(c.nome)}</strong>
            ${telFmt ? `<span style="color:#64748b; font-size:12px; margin-left:6px;">${window.escapeHtml(telFmt)}</span>` : ''}
          </div>
          ${c.aceita_contato ? '<span title="Aceita contato via WhatsApp" style="font-size:14px;">💬</span>' : ''}
        `;
        item.addEventListener('mouseenter', () => { item.style.background = '#f8fafc'; });
        item.addEventListener('mouseleave', () => { item.style.background = '#fff'; });
        item.addEventListener('click', () => selecionarCliente(c));
        sugestoesClientes.appendChild(item);
      });
    }

    const itemNovo = document.createElement('div');
    itemNovo.style.padding = '8px 12px';
    itemNovo.style.cursor = 'pointer';
    itemNovo.style.fontSize = '13px';
    itemNovo.style.fontWeight = 'bold';
    itemNovo.style.color = '#15803d';
    itemNovo.style.background = '#f0fdf4';
    itemNovo.innerHTML = `➕ Cadastrar "<em>${window.escapeHtml(termo)}</em>"`;
    itemNovo.addEventListener('click', () => {
      sugestoesClientes.style.display = 'none';
      abrirModalCadastroCliente(termo);
    });
    sugestoesClientes.appendChild(itemNovo);

    sugestoesClientes.style.display = 'block';
  }

  if (btnDesvincularCliente) {
    btnDesvincularCliente.addEventListener('click', desvincularCliente);
  }

  if (btnAbrirCadastroCliente) {
    btnAbrirCadastroCliente.addEventListener('click', (e) => {
      e.preventDefault();
      const termoAtual = pedidoClienteNome ? pedidoClienteNome.value.trim() : '';
      if (typeof window.baristaAbrirCadastroCliente === 'function') {
        window.baristaAbrirCadastroCliente(termoAtual);
      } else {
        abrirModalCadastroCliente(termoAtual);
      }
    });
  }
  if (btnFecharModalCliente) btnFecharModalCliente.addEventListener('click', fecharModalCadastroCliente);
  if (btnCancelarCadastroCliente) btnCancelarCadastroCliente.addEventListener('click', fecharModalCadastroCliente);
  if (modalCadastroCliente) {
    modalCadastroCliente.addEventListener('click', (e) => {
      if (e.target === modalCadastroCliente) {
        fecharModalCadastroCliente();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalCadastroCliente && !modalCadastroCliente.classList.contains('hidden') && modalCadastroCliente.style.display !== 'none') {
      fecharModalCadastroCliente();
    }
  });

  if (cadClienteTel) {
    cadClienteTel.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      if (v.length > 6) {
        v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
      } else if (v.length > 2) {
        v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      } else if (v.length > 0) {
        v = `(${v}`;
      }
      e.target.value = v;
    });
  }

  if (formCadastroClienteRapido) {
    formCadastroClienteRapido.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!navigator.onLine) {
        showToast('Cadastro de novos clientes requer conexão com a internet.', 'error');
        return;
      }
      const nome = cadClienteNome.value.trim();
      const tel = cadClienteTel.value.replace(/\D/g, '');
      const aceita = cadClienteConsentimento.checked;

      if (!nome) {
        showToast('Informe o nome do cliente.', 'error');
        return;
      }
      if (!tel || tel.length < 10) {
        showToast('Informe um telefone válido com DDD (mínimo 10 dígitos).', 'error');
        return;
      }

      try {
        const btnSalvar = formCadastroClienteRapido.querySelector('button[type="submit"]');
        if (btnSalvar) btnSalvar.disabled = true;

        const novo = await window.cafeteriaDB.clientes.create({
          nome: nome,
          telefone: tel,
          aceita_contato: aceita
        });

        showToast('Cliente cadastrado com sucesso!', 'success');
        fecharModalCadastroCliente();
        selecionarCliente(novo);
      } catch (err) {
        console.error('[PDV] Erro ao cadastrar cliente:', err);
        const msg = (err.message && err.message.includes('unique'))
          ? 'Este telefone já está cadastrado para outro cliente.'
          : 'Erro ao cadastrar cliente: ' + (err.message || 'tente novamente');
        showToast(msg, 'error');
      } finally {
        const btnSalvar = formCadastroClienteRapido.querySelector('button[type="submit"]');
        if (btnSalvar) btnSalvar.disabled = false;
      }
    });
  }

  if (pedidoClienteNome) {
    pedidoClienteNome.addEventListener('input', () => {
      estadoPDV.fn.checkFormValidity?.();
      estadoPDV.fn.salvarRascunhoCarrinho?.();

      const termo = pedidoClienteNome.value.trim();
      clearTimeout(estadoPDV.timers.buscaCliente);
      if (termo.length < 2) {
        if (sugestoesClientes) {
          sugestoesClientes.style.display = 'none';
          sugestoesClientes.innerHTML = '';
        }
        return;
      }

      estadoPDV.timers.buscaCliente = setTimeout(async () => {
        try {
          if (!window.cafeteriaDB || !window.cafeteriaDB.clientes) return;
          const clientes = await window.cafeteriaDB.clientes.buscar(termo, 6);
          renderSugestoesClientes(clientes, termo);
        } catch (err) {
          console.warn('[PDV] Erro ao buscar clientes:', err);
        }
      }, 220);
    });

    document.addEventListener('click', (e) => {
      if (sugestoesClientes && !sugestoesClientes.contains(e.target) && e.target !== pedidoClienteNome) {
        sugestoesClientes.style.display = 'none';
      }
    });
  }

  if (pedidoParaViagem) {
    pedidoParaViagem.addEventListener('change', () => {
      if (pedidoParaViagem.checked) {
        if (mesaSelect) mesaSelect.value = '';
        if (navigator.vibrate) navigator.vibrate(12);
      }
      estadoPDV.fn.updateMesaTriggerUI?.();
      estadoPDV.fn.renderMesaSelectionGrid?.();
      estadoPDV.fn.checkFormValidity?.();
      estadoPDV.fn.salvarRascunhoCarrinho?.();
    });
  }
  if (pedidoPrioritario) {
    pedidoPrioritario.addEventListener('change', () => {
      if (boxMotivoPrioridade) {
        boxMotivoPrioridade.style.display = pedidoPrioritario.checked ? 'block' : 'none';
      }
      estadoPDV.fn.salvarRascunhoCarrinho?.();
    });
  }
  if (pedidoPrioridadeMotivo) {
    pedidoPrioridadeMotivo.addEventListener('change', () => {
      estadoPDV.fn.salvarRascunhoCarrinho?.();
    });
  }
  if (pedidoObs) {
    pedidoObs.addEventListener('input', () => {
      estadoPDV.fn.salvarRascunhoCarrinho?.();
    });
  }

  definirGlobalPDV('baristaSelecionarCliente', selecionarCliente);
  definirGlobalPDV('baristaDesvincularCliente', desvincularCliente);
  definirGlobalPDV('baristaAbrirCadastroCliente', function (nomePreenchido = '') {
    const termo = nomePreenchido || (pedidoClienteNome ? pedidoClienteNome.value.trim() : '');
    abrirModalCadastroCliente(termo);
  });

  estadoPDV.fn.selecionarCliente = selecionarCliente;
  estadoPDV.fn.desvincularCliente = desvincularCliente;
  estadoPDV.fn.renderSugestoesClientes = renderSugestoesClientes;
  estadoPDV.fn.abrirModalCadastroCliente = abrirModalCadastroCliente;
  estadoPDV.fn.fecharModalCadastroCliente = fecharModalCadastroCliente;
}
