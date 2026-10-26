/**
 * js/pix-brcode.js
 * Gerador local de BR Code Pix estático com valor (padrão EMV® QRCPS-MPM / Banco Central do Brasil)
 * e utilitários de exibição de QR Code e tela cheia para o cliente (CAF-000039).
 */

(function () {
  'use strict';

  let cachedConfigPix = null;
  let lastFetchTs = 0;

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizarTextoEmv(texto, maxLen) {
    if (!texto) return '';
    return String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[çÇ]/g, 'C')
      .replace(/[^A-Za-z0-9 $%*+\-./:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, maxLen);
  }

  function isCpfValido(digits) {
    if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
    let r = (sum * 10) % 11;
    if (r === 10) r = 0;
    if (r !== parseInt(digits[9], 10)) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
    r = (sum * 10) % 11;
    if (r === 10) r = 0;
    return r === parseInt(digits[10], 10);
  }

  function normalizarChavePix(chaveRaw) {
    if (!chaveRaw) return '';
    const raw = String(chaveRaw).trim();
    if (!raw) return '';

    // E-mail
    if (raw.includes('@')) {
      return raw.toLowerCase();
    }

    // Chave aleatória EVP (UUID)
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(raw)) {
      return raw.toLowerCase();
    }

    // Telefone já com +55
    if (raw.startsWith('+')) {
      return '+' + raw.replace(/\D/g, '');
    }

    const digits = raw.replace(/\D/g, '');
    // CNPJ (14 dígitos)
    if (digits.length === 14) {
      return digits;
    }

    // 11 dígitos: pode ser CPF ou celular sem +55
    if (digits.length === 11) {
      if (isCpfValido(digits) && !raw.includes('(') && !raw.includes(' ')) {
        return digits;
      }
      if (digits[2] === '9') {
        return '+55' + digits;
      }
      return digits;
    }

    // 10 dígitos (telefone fixo com DDD)
    if (digits.length === 10) {
      return '+55' + digits;
    }

    // 12 ou 13 dígitos começando com 55 (telefone com DDI sem +)
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      return '+' + digits;
    }

    return raw;
  }

  function emvField(id, value) {
    const str = String(value ?? '');
    const len = String(str.length).padStart(2, '0');
    return `${id}${len}${str}`;
  }

  function crc16CCITT(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Gera o payload BR Code Pix estático ("Copia e Cola") segundo especificação EMV do Bacen.
   */
  function gerarPayloadPix({ chave, recebedor, cidade, valor, txid }) {
    const chaveLimpa = normalizarChavePix(chave);
    if (!chaveLimpa) {
      return { ok: false, erro: 'Chave Pix não configurada.' };
    }

    const nomeLimpo = normalizarTextoEmv(recebedor || 'CAFETERIA DO TEATRO', 25) || 'CAFETERIA DO TEATRO';
    const cidadeLimpa = normalizarTextoEmv(cidade || 'LAJEADO', 15) || 'LAJEADO';

    const txidLimpo = txid
      ? String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
      : '***';

    // 26 - Merchant Account Information (GUI + Chave)
    const gui = emvField('00', 'br.gov.bcb.pix');
    const keyField = emvField('01', chaveLimpa);
    const merchantAccountInfo = emvField('26', gui + keyField);

    // 52 - Merchant Category Code (0000)
    // 53 - Transaction Currency (986 = BRL)
    // 54 - Transaction Amount (opcional, incluído quando > 0)
    const numValor = Number(valor || 0);
    const amountField = numValor > 0 ? emvField('54', numValor.toFixed(2)) : '';

    // 58 - Country Code (BR)
    // 59 - Merchant Name (<= 25)
    // 60 - Merchant City (<= 15)
    // 62 - Additional Data Field Template (05 = txid)
    const additionalData = emvField('62', emvField('05', txidLimpo));

    const semCrc =
      emvField('00', '01') +
      merchantAccountInfo +
      emvField('52', '0000') +
      emvField('53', '986') +
      amountField +
      emvField('58', 'BR') +
      emvField('59', nomeLimpo) +
      emvField('60', cidadeLimpa) +
      additionalData +
      '6304';

    const crc = crc16CCITT(semCrc);
    const payload = semCrc + crc;

    return {
      ok: true,
      payload,
      crc,
      chave: chaveLimpa,
      recebedor: nomeLimpo,
      cidade: cidadeLimpa,
      valor: numValor,
      txid: txidLimpo
    };
  }

  function gerarQrSvg(payload, cellSize = 4, margin = 2) {
    const qrFn = window.qrcode || (typeof qrcode !== 'undefined' ? qrcode : null);
    if (!payload || typeof qrFn !== 'function') return '';
    try {
      const qr = qrFn(0, 'M');
      qr.addData(payload);
      qr.make();
      return qr.createSvgTag({ cellSize, margin, scalable: true });
    } catch (e) {
      console.error('Erro ao gerar SVG de QR Pix:', e);
      return '';
    }
  }

  function gerarQrDataUrl(payload, cellSize = 4, margin = 2) {
    const qrFn = window.qrcode || (typeof qrcode !== 'undefined' ? qrcode : null);
    if (!payload || typeof qrFn !== 'function') return '';
    try {
      const qr = qrFn(0, 'M');
      qr.addData(payload);
      qr.make();
      return qr.createDataURL(cellSize, margin);
    } catch (e) {
      console.error('Erro ao gerar DataURL de QR Pix:', e);
      return '';
    }
  }

  async function obterConfigPix(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedConfigPix && now - lastFetchTs < 30000) {
      return cachedConfigPix;
    }

    // Tenta ler do localStorage primeiro para funcionar offline
    try {
      const localRaw = localStorage.getItem('cafeteria_pix_config_v1');
      if (localRaw && ! cachedConfigPix) {
        cachedConfigPix = JSON.parse(localRaw);
      }
    } catch (_) {}

    if (window.cafeteriaSupabase && navigator.onLine !== false) {
      try {
        const { data } = await window.cafeteriaSupabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['pix_chave', 'pix_recebedor', 'pix_cidade', 'pix_imprimir_na_conta']);

        if (Array.isArray(data) && data.length > 0) {
          const cfg = {
            chave: '',
            recebedor: 'CAFETERIA DO TEATRO',
            cidade: 'LAJEADO',
            imprimirNaConta: true
          };
          data.forEach((row) => {
            const val = row.valor;
            if (row.chave === 'pix_chave') cfg.chave = typeof val === 'string' ? val : String(val ?? '');
            if (row.chave === 'pix_recebedor') cfg.recebedor = typeof val === 'string' ? val : String(val ?? 'CAFETERIA DO TEATRO');
            if (row.chave === 'pix_cidade') cfg.cidade = typeof val === 'string' ? val : String(val ?? 'LAJEADO');
            if (row.chave === 'pix_imprimir_na_conta') {
              cfg.imprimirNaConta = typeof val === 'boolean' ? val : String(val) !== 'false';
            }
          });
          cachedConfigPix = cfg;
          lastFetchTs = now;
          try {
            localStorage.setItem('cafeteria_pix_config_v1', JSON.stringify(cfg));
          } catch (_) {}
          return cfg;
        }
      } catch (e) {
        console.warn('Falha ao buscar config Pix online, usando cache local:', e);
      }
    }

    return (
      cachedConfigPix || {
        chave: '',
        recebedor: 'CAFETERIA DO TEATRO',
        cidade: 'LAJEADO',
        imprimirNaConta: true
      }
    );
  }

  function atualizarCacheConfigPix(novaConfig) {
    cachedConfigPix = {
      ...(cachedConfigPix || {}),
      ...novaConfig
    };
    lastFetchTs = Date.now();
    try {
      localStorage.setItem('cafeteria_pix_config_v1', JSON.stringify(cachedConfigPix));
    } catch (_) {}
  }

  async function copiarCodigoPix(payload, btnElement) {
    if (!payload) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (btnElement) {
        const orig = btnElement.innerHTML;
        btnElement.innerHTML = '✅ Código Copiado!';
        setTimeout(() => {
          btnElement.innerHTML = orig;
        }, 2200);
      }
      return true;
    } catch (e) {
      console.error('Erro ao copiar código Pix:', e);
      return false;
    }
  }

  async function abrirModalClienteTelaCheia({ valor, txid, subtitulo }) {
    const cfg = await obterConfigPix();
    const res = gerarPayloadPix({
      chave: cfg.chave,
      recebedor: cfg.recebedor,
      cidade: cfg.cidade,
      valor,
      txid
    });

    let overlay = document.getElementById('pix-fullscreen-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pix-fullscreen-modal';
      overlay.style.cssText =
        'position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.96); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center;';
      document.body.appendChild(overlay);
    }

    const fmtValor = Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    if (!res.ok) {
      overlay.innerHTML = `
        <div style="background:#fff; color:#1e293b; border-radius:16px; padding:24px; max-width:380px; width:100%;">
          <div style="font-size:36px; margin-bottom:8px;">⚠️</div>
          <h3 style="margin:0 0 8px 0;">Chave Pix não configurada</h3>
          <p style="font-size:14px; color:#64748b; margin:0 0 18px 0;">
            Configure a chave Pix da cafeteria em <strong>Admin → Configurações</strong> para gerar o QR Code com valor automático.
          </p>
          <button type="button" id="btn-fechar-pix-fullscreen" style="width:100%; padding:12px; border:none; border-radius:8px; background:#1e293b; color:#fff; font-weight:700; cursor:pointer;">Fechar</button>
        </div>
      `;
    } else {
      const svg = gerarQrSvg(res.payload, 6, 2);
      const safeRecebedor = (window.escapeHtml || escapeHtml)(res.recebedor || '');
      const safeSubtitulo = (window.escapeHtml || escapeHtml)(subtitulo || '');
      const safeValor = (window.escapeHtml || escapeHtml)(fmtValor || '');

      overlay.innerHTML = `
        <div style="background:#fff; color:#0f172a; border-radius:20px; padding:24px 20px; max-width:400px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#059669; margin-bottom:4px;">Pagamento Instantâneo PIX</div>
          <div style="font-size:18px; font-weight:800; color:#1e293b;">${safeRecebedor}</div>
          ${safeSubtitulo ? `<div style="font-size:13px; color:#64748b; margin-top:2px;">${safeSubtitulo}</div>` : ''}
          <div style="font-size:32px; font-weight:900; color:#047857; margin:12px 0;">${safeValor}</div>
          <div style="width:240px; height:240px; margin:0 auto 14px auto; display:flex; align-items:center; justify-content:center; border:2px solid #e2e8f0; border-radius:12px; padding:8px; background:#fff;">
            ${svg}
          </div>
          <div style="font-size:12px; color:#475569; margin-bottom:14px;">
            Aponte a câmera do aplicativo do seu banco para o QR Code acima. O valor já está preenchido.
          </div>
          <div style="display:flex; gap:8px; flex-direction:column;">
            <button type="button" id="btn-copiar-pix-fullscreen" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:10px; background:#f8fafc; color:#0f172a; font-weight:700; font-size:14px; cursor:pointer;">
              📋 Copiar código Pix (Copia e Cola)
            </button>
            <button type="button" id="btn-fechar-pix-fullscreen" style="width:100%; padding:12px; border:none; border-radius:10px; background:#059669; color:#fff; font-weight:700; font-size:15px; cursor:pointer;">
              ✓ Voltar ao Atendimento
            </button>
          </div>
        </div>
      `;

      overlay
        .querySelector('#btn-copiar-pix-fullscreen')
        ?.addEventListener('click', function () {
          copiarCodigoPix(res.payload, this);
        });
    }

    overlay.style.display = 'flex';
    overlay.querySelector('#btn-fechar-pix-fullscreen')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }

  const pixExport = {
    gerarPayloadPix,
    gerarPayload: (opts) => gerarPayloadPix({ ...opts, recebedor: opts?.recebedor || opts?.nomeRecebedor }),
    gerarQrSvg,
    gerarQrDataUrl,
    crc16CCITT,
    normalizarChavePix,
    normalizarTextoEmv,
    obterConfigPix,
    getPixConfig: obterConfigPix,
    atualizarCacheConfigPix,
    copiarCodigoPix,
    abrirModalClienteTelaCheia
  };

  if (typeof window !== 'undefined') {
    window.cafeteriaPix = pixExport;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.cafeteriaPix = pixExport;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = pixExport;
  }
})();
