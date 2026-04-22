/* =========================================================
   ADMIN/MENU-PDF.JS — Cardápio PDF / Livro Digital
   Upload · Status · Substituir · Remover
   ========================================================= */

(function () {
  'use strict';

  const admin = window.cafeteriaAdmin;
  const MAX_MB = 20;

  /* ── Estado local ───────────────────────────────────────── */
  let _uploading = false;
  let _currentFile = null;

  /* ── Helpers de UI ──────────────────────────────────────── */
  function fmt(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function setProgress(pct) {
    const bar  = document.getElementById('pdf-progress-bar');
    const text = document.getElementById('pdf-progress-text');
    if (!bar) return;
    bar.style.width = pct + '%';
    if (text) text.textContent = pct < 100 ? `Enviando… ${pct}%` : 'Concluído!';
  }

  function showProgress(visible) {
    const wrap = document.getElementById('pdf-progress-wrap');
    if (wrap) wrap.style.display = visible ? 'block' : 'none';
  }

  function setUploadBtn(loading) {
    const btn = document.getElementById('btn-upload-pdf');
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="pdf-btn-spinner"></span> Enviando…'
      : '📤 Enviar PDF';
  }

  function clearFileSelection() {
    _currentFile = null;
    const input = document.getElementById('pdf-file-input');
    const nameEl = document.getElementById('pdf-selected-name');
    const sizeEl = document.getElementById('pdf-selected-size');
    const zone   = document.getElementById('pdf-upload-zone');
    if (input) input.value = '';
    if (nameEl) nameEl.textContent = 'Nenhum arquivo selecionado';
    if (sizeEl) sizeEl.textContent = '';
    if (zone) zone.classList.remove('has-file');
    document.getElementById('btn-upload-pdf').disabled = true;
  }

  /* ── Renderizar status do PDF atual ────────────────────── */
  window.renderMenuPdf = async function () {
    const statusCard  = document.getElementById('pdf-current-status');
    const emptyState  = document.getElementById('pdf-empty-state');
    const activeState = document.getElementById('pdf-active-state');

    if (!statusCard) return;

    // Verificação de segurança
    if (!window.cafeteriaDB || !window.cafeteriaDB.menuPdf) {
      console.error('[menu-pdf] cafeteriaDB.menuPdf não encontrado!');
      return;
    }

    // Loading state
    statusCard.classList.add('loading');

    try {
      const meta = await window.cafeteriaDB.menuPdf.get();

      if (!meta || !meta.active) {
        // Nenhum PDF ativo
        emptyState?.classList.remove('hidden');
        activeState?.classList.add('hidden');
      } else {
        // PDF ativo encontrado
        emptyState?.classList.add('hidden');
        activeState?.classList.remove('hidden');

        const el = (id) => document.getElementById(id);
        if (el('pdf-current-name'))  el('pdf-current-name').textContent  = meta.fileName || 'cardapio-atual.pdf';
        if (el('pdf-current-date'))  el('pdf-current-date').textContent  = fmtDate(meta.updatedAt);
        if (el('pdf-current-link'))  el('pdf-current-link').href         = meta.pdfUrl || '#';
        if (el('pdf-active-badge'))  el('pdf-active-badge').textContent  = '● Ativo';
      }
    } catch (err) {
      console.error('[menu-pdf] Erro ao carregar status:', err);
    } finally {
      statusCard.classList.remove('loading');
    }
  };

  /* ── Upload ─────────────────────────────────────────────── */
  async function handleUpload() {
    if (_uploading || !_currentFile) return;

    const ok = await admin.confirm({
      icon: '📄',
      title: 'Enviar PDF do Cardápio?',
      msg: `"${_currentFile.name}" (${fmt(_currentFile.size)}) será o novo cardápio digital para todos os visitantes.`,
      okLabel: 'Enviar',
      okClass: 'btn--primary'
    });
    if (!ok) return;

    _uploading = true;
    setUploadBtn(true);
    showProgress(true);
    setProgress(5);

    try {
      await window.cafeteriaDB.menuPdf.upload(_currentFile, (pct) => {
        setProgress(pct);
      });

      admin.toast('PDF enviado!', 'O cardápio digital foi atualizado com sucesso.', 'success');
      clearFileSelection();
      showProgress(false);
      await window.renderMenuPdf();
    } catch (err) {
      console.error('[menu-pdf] Erro upload:', err);
      admin.toast('Erro no upload', err.message || 'Tente novamente.', 'error');
      showProgress(false);
      setProgress(0);
    } finally {
      _uploading = false;
      setUploadBtn(false);
    }
  }

  /* ── Remover ────────────────────────────────────────────── */
  async function handleRemove() {
    const ok = await admin.confirm({
      icon: '🗑️',
      title: 'Remover cardápio digital?',
      msg: 'O PDF ficará inativo. O cardápio de produtos continuará visível normalmente.',
      okLabel: 'Remover',
      okClass: 'btn--danger'
    });
    if (!ok) return;

    try {
      await window.cafeteriaDB.menuPdf.remove();
      admin.toast('PDF removido', 'O cardápio digital foi desativado.', 'success');
      await window.renderMenuPdf();
    } catch (err) {
      console.error('[menu-pdf] Erro ao remover:', err);
      admin.toast('Erro', err.message || 'Falha ao remover.', 'error');
    }
  }

  /* ── Seleção de arquivo ─────────────────────────────────── */
  function handleFileSelect(file) {
    if (!file) return;

    // Valida tipo
    if (file.type !== 'application/pdf') {
      admin.toast('Arquivo inválido', 'Selecione um arquivo .pdf válido.', 'error');
      return;
    }

    // Valida tamanho
    if (file.size > MAX_MB * 1024 * 1024) {
      admin.toast('Arquivo muito grande', `O PDF não pode ultrapassar ${MAX_MB} MB.`, 'error');
      return;
    }

    _currentFile = file;

    const nameEl = document.getElementById('pdf-selected-name');
    const sizeEl = document.getElementById('pdf-selected-size');
    const zone   = document.getElementById('pdf-upload-zone');

    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = fmt(file.size);
    if (zone)   zone.classList.add('has-file');

    document.getElementById('btn-upload-pdf').disabled = false;
  }

  /* ── Drag & Drop ────────────────────────────────────────── */
  function initDragDrop() {
    const zone = document.getElementById('pdf-upload-zone');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    });

    zone.addEventListener('click', () => {
      document.getElementById('pdf-file-input')?.click();
    });
  }

  /* ── DOMContentLoaded ────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {

    // Input file
    document.getElementById('pdf-file-input')?.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    // Botão upload
    document.getElementById('btn-upload-pdf')?.addEventListener('click', handleUpload);

    // Botão remover
    document.getElementById('btn-remove-pdf')?.addEventListener('click', handleRemove);

    // Botão substituir (abre o file picker)
    document.getElementById('btn-replace-pdf')?.addEventListener('click', () => {
      document.getElementById('pdf-file-input')?.click();
    });

    // Botão cancelar seleção
    document.getElementById('btn-cancel-pdf')?.addEventListener('click', clearFileSelection);

    // Drag & drop
    initDragDrop();

    // Render inicial ao navegar para a seção
    const navBtn = document.getElementById('nav-menu-pdf');
    navBtn?.addEventListener('click', () => {
      window.renderMenuPdf();
    });
  });

})();
