/**
 * js/admin/mesas-admin.js
 * Lógica para CRUD de Mesas e Gestão de QR Codes de Autoatendimento (CAF-000037).
 */
(function() {
  const pageMesas = document.getElementById('page-mesas');
  if (!pageMesas) return;

  const tbody = document.getElementById('mesas-table-body');
  const btnNovaMesa = document.getElementById('btn-nova-mesa');
  const btnImprimirTodosQr = document.getElementById('btn-imprimir-todos-qr');

  // Modal CRUD Mesa
  const modalOverlay = document.getElementById('modal-mesa-overlay');
  const btnClose = document.getElementById('modal-mesa-close');
  const btnCancel = document.getElementById('modal-mesa-cancel');
  const formMesa = document.getElementById('form-mesa');
  const btnSalvar = document.getElementById('btn-salvar-mesa');

  const inputId = document.getElementById('mesa-id');
  const inputCodigo = document.getElementById('mesa-codigo');
  const inputDescricao = document.getElementById('mesa-descricao');
  const inputAtivo = document.getElementById('mesa-ativo');

  // Modal QR Code da Mesa
  const modalQrOverlay = document.getElementById('modal-qr-mesa-overlay');
  const modalQrClose = document.getElementById('modal-qr-mesa-close');
  const modalQrCancel = document.getElementById('modal-qr-mesa-cancel');
  const modalQrTitle = document.getElementById('modal-qr-mesa-title');
  const qrDisplay = document.getElementById('qr-code-display');
  const qrMesaInfo = document.getElementById('qr-code-mesa-info');
  const qrLinkInput = document.getElementById('qr-code-link-input');
  const btnCopiarQrLink = document.getElementById('btn-copiar-qr-link');
  const btnBaixarQrPng = document.getElementById('btn-baixar-qr-png');
  const btnRegenerarQrToken = document.getElementById('btn-regenerar-qr-token');

  let currentQrMesa = null;
  let allLoadedMesas = [];

  function openModal(mesa = null) {
    if (mesa) {
      document.getElementById('modal-mesa-title').textContent = 'Editar Mesa';
      inputId.value = mesa.codigo;
      inputId.dataset.original = mesa.codigo;
      inputCodigo.value = mesa.codigo;
      inputDescricao.value = mesa.descricao || '';
      inputAtivo.checked = mesa.ativo;
    } else {
      document.getElementById('modal-mesa-title').textContent = 'Nova Mesa';
      formMesa.reset();
      inputId.value = '';
      inputId.dataset.original = '';
      inputAtivo.checked = true;
    }
    modalOverlay.style.display = 'flex';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
  }

  [btnClose, btnCancel].forEach(el => el && el.addEventListener('click', closeModal));
  if (btnNovaMesa) btnNovaMesa.addEventListener('click', () => openModal());

  function closeQrModal() {
    if (modalQrOverlay) modalQrOverlay.style.display = 'none';
    currentQrMesa = null;
  }

  [modalQrClose, modalQrCancel].forEach(el => el && el.addEventListener('click', closeQrModal));

  function getCardapioMesaUrl(mesa) {
    const origin = window.location.origin;
    const token = mesa.qr_token || '';
    return `${origin}/cardapio.html?mesa=${encodeURIComponent(mesa.codigo)}&t=${encodeURIComponent(token)}`;
  }

  function gerarQrDataUrl(text, cellSize = 6) {
    if (typeof qrcode === 'undefined') {
      console.error('Biblioteca qrcode-generator não carregada');
      return '';
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createDataURL(cellSize, 2);
    } catch (err) {
      console.error('Erro ao gerar QR Code:', err);
      return '';
    }
  }

  function openQrModal(mesa) {
    currentQrMesa = mesa;
    if (!modalQrOverlay) return;

    modalQrTitle.textContent = `🔳 QR Code — Mesa ${mesa.codigo}`;
    qrMesaInfo.textContent = mesa.descricao ? `${mesa.codigo} (${mesa.descricao})` : `Mesa ${mesa.codigo}`;

    const url = getCardapioMesaUrl(mesa);
    qrLinkInput.value = url;

    // Gera imagem do QR Code
    const dataUrl = gerarQrDataUrl(url, 7);
    if (dataUrl) {
      qrDisplay.innerHTML = `<img src="${dataUrl}" alt="QR Code Mesa ${mesa.codigo}" style="width:220px; height:220px; image-rendering:pixelated; display:block;" />`;
    } else {
      qrDisplay.innerHTML = `<p style="color:red;">Falha ao gerar QR Code.</p>`;
    }

    modalQrOverlay.style.display = 'flex';
  }

  if (btnCopiarQrLink) {
    btnCopiarQrLink.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(qrLinkInput.value);
        window.showToast('Link da mesa copiado!');
      } catch (e) {
        qrLinkInput.select();
        document.execCommand('copy');
        window.showToast('Link da mesa copiado!');
      }
    });
  }

  if (btnBaixarQrPng) {
    btnBaixarQrPng.addEventListener('click', () => {
      if (!currentQrMesa) return;
      const url = getCardapioMesaUrl(currentQrMesa);
      const dataUrl = gerarQrDataUrl(url, 12); // Resolução maior para download
      if (!dataUrl) return;

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qrcode-mesa-${currentQrMesa.codigo.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  if (btnRegenerarQrToken) {
    btnRegenerarQrToken.addEventListener('click', async () => {
      if (!currentQrMesa) return;
      const conf = confirm(`Atenção: Ao regenerar o QR Code da mesa ${currentQrMesa.codigo}, qualquer código impresso anteriormente deixará de funcionar. Deseja continuar?`);
      if (!conf) return;

      btnRegenerarQrToken.disabled = true;
      btnRegenerarQrToken.textContent = 'Regenerando...';

      try {
        const res = await window.cafeteriaDB.mesas.regenerarQrToken(currentQrMesa.id);
        if (res && res.qr_token) {
          currentQrMesa.qr_token = res.qr_token;
          window.showToast('Novo QR Code gerado com sucesso!');
          openQrModal(currentQrMesa);
          loadMesas();
        }
      } catch (err) {
        alert('Erro ao regenerar QR Code: ' + (err.message || 'Falha de comunicação'));
      } finally {
        btnRegenerarQrToken.disabled = false;
        btnRegenerarQrToken.textContent = '🔄 Gerar Novo Token (invalida o QR code anterior)';
      }
    });
  }

  // Impressão de folha A4 com todos os QR Codes
  if (btnImprimirTodosQr) {
    btnImprimirTodosQr.addEventListener('click', () => {
      const ativas = allLoadedMesas.filter(m => m.ativo);
      if (ativas.length === 0) {
        alert('Nenhuma mesa ativa cadastrada para impressão.');
        return;
      }

      const areaPrint = document.getElementById('area-impressao-todos-qr');
      if (!areaPrint) return;

      areaPrint.innerHTML = ativas.map(m => {
        const url = getCardapioMesaUrl(m);
        const dataUrl = gerarQrDataUrl(url, 6);
        return `
          <div class="cartao-qr-print">
            <div style="font-size:12px; font-weight:700; letter-spacing:1px; color:#78350f; text-transform:uppercase; margin-bottom:2px;">
              ☕ Cafeteria do Teatro
            </div>
            <h3>${m.codigo}</h3>
            ${m.descricao ? `<p style="font-style:italic; color:#64748b; margin-bottom:4px;">${m.descricao}</p>` : ''}
            <img src="${dataUrl}" alt="QR Mesa ${m.codigo}" />
            <p style="font-weight:700; color:#1e293b; margin-top:4px;">Faça seu pedido aqui!</p>
            <p style="font-size:10px; color:#64748b;">Aponte a câmera do seu celular para ver o cardápio</p>
          </div>
        `;
      }).join('');

      document.body.classList.add('imprimindo-qr-mesas');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('imprimindo-qr-mesas');
        areaPrint.innerHTML = '';
      }, 1000);
    });
  }

  async function loadMesas() {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
    
    const { data, error } = await window.cafeteriaSupabase
      .from('mesas')
      .select('*')
      .order('codigo');

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">Erro: ${error.message}</td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma mesa cadastrada.</td></tr>';
      allLoadedMesas = [];
      return;
    }

    allLoadedMesas = data;
    tbody.innerHTML = '';
    data.forEach(mesa => {
      const dataCriacao = new Date(mesa.created_at).toLocaleString('pt-BR');
      const statusHtml = mesa.ativo 
        ? '<span class="status status--active">Ativa</span>' 
        : '<span class="status status--inactive">Inativa</span>';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${mesa.codigo}</strong></td>
        <td>${mesa.descricao || '—'}</td>
        <td>${statusHtml}</td>
        <td>${dataCriacao}</td>
        <td class="table-actions">
          <button class="btn btn--outline-dark btn-small btn-qr" title="Ver QR Code da Mesa" style="font-size:12px;">🔳 QR Code</button>
          <button class="btn btn--outline-dark btn-small btn-edit" title="Editar">✏️</button>
          <button class="btn btn--danger btn-small btn-delete" title="Excluir">🗑</button>
        </td>
      `;
      
      tr.querySelector('.btn-qr').addEventListener('click', () => openQrModal(mesa));
      tr.querySelector('.btn-edit').addEventListener('click', () => openModal(mesa));
      tr.querySelector('.btn-delete').addEventListener('click', () => deleteMesa(mesa));
      
      tbody.appendChild(tr);
    });
  }

  formMesa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!inputId.value;
    const codigoOriginal = inputId.dataset.original;
    
    const payload = {
      codigo: inputCodigo.value.trim().toUpperCase(),
      descricao: inputDescricao.value.trim(),
      ativo: inputAtivo.checked
    };

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';

    let error;
    
    if (isEdit) {
      const res = await window.cafeteriaSupabase
        .from('mesas')
        .update(payload)
        .eq('codigo', codigoOriginal);
      error = res.error;
    } else {
      const res = await window.cafeteriaSupabase
        .from('mesas')
        .insert([payload]);
      error = res.error;
    }

    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Mesa';

    if (error) {
      if (error.code === '23505') {
        alert('Já existe uma mesa com este código.');
      } else {
        alert('Erro ao salvar mesa: ' + error.message);
      }
      return;
    }

    window.showToast('Mesa salva com sucesso!');
    closeModal();
    loadMesas();
  });

  async function deleteMesa(mesa) {
    if (!confirm(`Tem certeza que deseja EXCLUIR a mesa ${mesa.codigo}?\nIsso pode falhar se houver pedidos vinculados.`)) return;

    const { error } = await window.cafeteriaSupabase
      .from('mesas')
      .delete()
      .eq('codigo', mesa.codigo);

    if (error) {
      if (error.code === '23503') {
        alert('Não é possível excluir esta mesa pois existem pedidos vinculados a ela. Em vez disso, inative a mesa.');
      } else {
        alert('Erro ao excluir: ' + error.message);
      }
      return;
    }

    window.showToast('Mesa excluída.');
    loadMesas();
  }

  // Expor init
  window.initAdminMesas = loadMesas;

})();
