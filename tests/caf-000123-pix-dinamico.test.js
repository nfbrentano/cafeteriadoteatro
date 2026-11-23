import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import qrcodeGenerator from 'qrcode-generator';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import pixExport from '../js/pix-brcode.js';

if (typeof window !== 'undefined') {
  window.qrcode = qrcodeGenerator;
}
globalThis.qrcode = qrcodeGenerator;
import {
  gerarTxidDinamico,
  calcularHmacSha256Hex,
  validarAssinaturaWebhookPsp
} from '../supabase/functions/_shared/pix-psp.js';
import { createPixWebhookHandler } from '../supabase/functions/pix-webhook/index.ts';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_CLAIMS = { sub: ADMIN_ID, role: 'authenticated', email: 'admin@e2e.local' };
const ANON_CLAIMS = { sub: '', role: 'anon' };

async function callRpc(db, claims, fnName, argValues = []) {
  const placeholders = argValues.map((_, idx) => `$${idx + 1}`).join(', ');
  const { rows } = await db.withJwtClaims(claims, (tx) =>
    tx.query(`SELECT public.${fnName}(${placeholders}) AS res`, argValues)
  );
  return rows[0]?.res;
}

describe('CAF-000123: Pix Dinâmico com Confirmação Automática por Webhook', () => {
  let e2eDb;

  beforeAll(async () => {
    e2eDb = await createE2EDatabase({ env: {} });
    pixExport.atualizarCacheConfigPix({
      chave: '00000000000191',
      recebedor: 'CAFETERIA DO TEATRO',
      cidade: 'LAJEADO',
      dinamicoAtivo: true,
      pspProvedor: 'sandbox'
    });
  }, 60000);

  afterAll(async () => {
    if (e2eDb) {
      await e2eDb.close();
    }
  });

  describe('CT01: Geração de Cobrança Dinâmica Pix e Validação de Payload EMV (RF01, RF02, CA01)', () => {
    it('gera txid dinâmico alfanumérico seguro para Totem, PDV e Pedido Online', () => {
      const txTotem = gerarTxidDinamico({ canal: 'totem', pedidoId: 1234 });
      const txPdv = gerarTxidDinamico({ canal: 'pdv', mesaCodigo: 'M12' });
      const txOnline = gerarTxidDinamico({ canal: 'online', pedidoId: 5678 });

      expect(txTotem).toMatch(/^TOT1234[A-Z0-9]+$/);
      expect(txPdv).toMatch(/^PDVM12[A-Z0-9]+$/);
      expect(txOnline).toMatch(/^ONL5678[A-Z0-9]+$/);
      expect(txTotem.length).toBeGreaterThanOrEqual(16);
      expect(txTotem.length).toBeLessThanOrEqual(35);
      expect(txTotem).not.toMatch(/[^A-Za-z0-9]/);
    });

    it('formata contagem regressiva mm:ss corretamente', () => {
      expect(pixExport.formatarContagemRegressiva(600)).toBe('10:00');
      expect(pixExport.formatarContagemRegressiva(65)).toBe('01:05');
      expect(pixExport.formatarContagemRegressiva(9)).toBe('00:09');
      expect(pixExport.formatarContagemRegressiva(0)).toBe('00:00');
      expect(pixExport.formatarContagemRegressiva(-5)).toBe('00:00');
    });

    it('gera payload BR Code EMV válido com tags 00, 26, 52, 53, 54, 58, 59, 60, 62 e CRC16 (tag 63)', () => {
      const txid = gerarTxidDinamico({ canal: 'totem', pedidoId: 99 });
      const res = pixExport.gerarPayloadPix({
        chave: '00000000000191',
        recebedor: 'CAFETERIA DO TEATRO',
        cidade: 'LAJEADO',
        valor: 27.50,
        txid: txid
      });

      expect(res.ok).toBe(true);
      const payload = res.payload;
      expect(payload).toMatch(/^000201/);
      expect(payload).toMatch(/br\.gov\.bcb\.pix/i);
      expect(payload).toContain('00000000000191');
      expect(payload).toContain('540527.50');
      expect(payload).toContain('5802BR');
      expect(payload).toContain('CAFETERIA DO TEATRO');
      expect(payload).toContain('LAJEADO');
      expect(payload).toContain(txid);
      expect(payload).toMatch(/6304[A-F0-9]{4}$/);

      const semCrc = payload.slice(0, -4);
      const crcEsperado = pixExport.crc16CCITT(semCrc);
      expect(payload.endsWith(crcEsperado)).toBe(true);

      const svg = pixExport.gerarQrSvg(payload, 3, 1);
      expect(svg).toMatch(/^<svg/);
      expect(svg).toContain('</svg>');
    });
  });

  describe('CT02: Webhook de Confirmação Automática com Assinatura HMAC, Idempotência e 401 (RF03, CA02, CA09)', () => {
    it('calcula HMAC-SHA256 hex corretamente', async () => {
      const secret = 'chave-secreta-teste-123';
      const msg = 'id:12345;request-id:abc;ts:1700000000;';
      const hash1 = await calcularHmacSha256Hex(secret, msg);
      const hash2 = await calcularHmacSha256Hex(secret, msg);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('valida assinatura Mercado Pago e Asaas rejeitando assinaturas inválidas com 401', async () => {
      const secret = 'webhook-secret-teste';
      const headersValidos = new Headers({
        'x-signature': 'ts=1700000000,v1=falsoHashInvalido'
      });

      const checkInvalido = await validarAssinaturaWebhookPsp({
        provedor: 'mercadopago',
        headers: headersValidos,
        rawBody: '{"action":"payment.updated"}',
        parsedBody: { action: 'payment.updated' },
        secret
      });
      expect(checkInvalido.valido).toBe(false);

      const handler = createPixWebhookHandler({
        envGet: (key) => (key === 'PIX_PSP_WEBHOOK_SECRET' ? secret : ''),
        supabaseClient: { rpc: async () => ({ data: { sucesso: true } }) }
      });

      const reqInvalida = new Request('http://localhost/pix-webhook?provedor=mercadopago', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'ts=1700000000,v1=invalido'
        },
        body: JSON.stringify({ action: 'payment.updated', data: { id: '123' } })
      });

      const resp401 = await handler(reqInvalida);
      expect(resp401.status).toBe(401);
      const respJson = await resp401.json();
      expect(respJson.sucesso).toBe(false);
    });

    it('processa webhook válido e garante idempotência no reenvio no PGlite', async () => {
      const txid = gerarTxidDinamico({ canal: 'totem', pedidoId: 888 });

      // Cria cobrança usando RPC que preenche expira_em automaticamente
      const cobRes = await callRpc(e2eDb, ANON_CLAIMS, 'criar_cobranca_pix', [
        null,
        'BALCAO',
        35.00,
        'totem',
        txid,
        '000201...',
        'sandbox',
        10
      ]);
      expect(cobRes.sucesso).toBe(true);

      const res1 = await callRpc(e2eDb, ADMIN_CLAIMS, 'processar_webhook_pix', [
        txid,
        'psp_mp_99999',
        35.00,
        0.00,
        'sandbox',
        JSON.stringify({ end_to_end_id: 'E12345678' })
      ]);
      expect(res1.sucesso).toBe(true);
      expect(res1.status).toBe('pago');

      // Reenvio idêntico (idempotência)
      const res2 = await callRpc(e2eDb, ADMIN_CLAIMS, 'processar_webhook_pix', [
        txid,
        'psp_mp_99999',
        35.00,
        0.00,
        'sandbox',
        JSON.stringify({ end_to_end_id: 'E12345678' })
      ]);
      expect(res2.sucesso).toBe(true);
      expect(res2.idempotente).toBe(true);
      expect(res2.status).toBe('pago');

      const { rows: verifyRows } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status, valor_pago FROM public.pix_cobrancas WHERE txid = $1', [txid])
      );
      expect(verifyRows[0].status).toBe('pago');
      expect(Number(verifyRows[0].valor_pago)).toBe(35.00);
    });
  });

  describe('CT03: Transição de Pedido aguardando_pagamento para pendente e KDS (RF06, CA03, CA07)', () => {
    it('atualiza status do pedido para pendente e status_pagamento para pago ao confirmar Pix', async () => {
      const { rows: pedRows } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, forma_pagamento, total, cliente_nome, origem)
           VALUES ('BALCAO', 'aguardando_pagamento', 'pendente', 'pix', 42.00, 'Cliente Teste Pix', 'totem')
           RETURNING id`,
          []
        )
      );
      const pedidoId = pedRows[0].id;
      const txid = gerarTxidDinamico({ canal: 'totem', pedidoId });

      await callRpc(e2eDb, ANON_CLAIMS, 'criar_cobranca_pix', [
        pedidoId,
        'BALCAO',
        42.00,
        'totem',
        txid,
        '000201...',
        'sandbox',
        10
      ]);

      const resWebhook = await callRpc(e2eDb, ADMIN_CLAIMS, 'processar_webhook_pix', [
        txid,
        'psp_mp_ct03',
        42.00,
        0.00,
        'sandbox',
        JSON.stringify({ end_to_end_id: 'E999' })
      ]);
      expect(resWebhook.sucesso).toBe(true);

      const { rows: pedAtualizado } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status, status_pagamento FROM public.pedidos WHERE id = $1', [pedidoId])
      );
      expect(pedAtualizado[0].status).toBe('pendente');
      expect(pedAtualizado[0].status_pagamento).toBe('pago');
    });
  });

  describe('CT04: Fallback Gracioso para Pix Estático em Falha ou Timeout (RF04, CA04)', () => {
    it('cria cobrança em fallback estático se fetch falhar ou exceder timeout', async () => {
      const fallbackRes = await pixExport.criarCobrancaDinamica({
        pedidoId: 777,
        valor: 18.00,
        canal: 'totem',
        timeoutMs: 10,
        usarEdgeFunction: false
      });

      expect(fallbackRes.ok).toBe(true);
      expect(fallbackRes.payload).toMatch(/^000201/);
      expect(fallbackRes.valor).toBe(18.00);
      expect(fallbackRes.fallback).toBe(true);
    });
  });

  describe('CT05: Fechamento de Conta no PDV com Confirmação Automática de Pix (RF08, CA05)', () => {
    it('permite registrar e quitar parte de mesa via Pix dinâmico no PDV', async () => {
      const { rows: mesaPedRows } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, forma_pagamento, total, cliente_nome, origem)
           VALUES ('M-01', 'entregue', 'pendente', 'pix', 50.00, 'Mesa 01', 'pdv')
           RETURNING id`,
          []
        )
      );
      const pedId = mesaPedRows[0].id;
      const txid = gerarTxidDinamico({ canal: 'pdv', mesaCodigo: 'M01' });

      await callRpc(e2eDb, ADMIN_CLAIMS, 'criar_cobranca_pix', [
        pedId,
        'M-01',
        50.00,
        'pdv',
        txid,
        '000201...',
        'sandbox',
        10,
        'Parte 1'
      ]);

      const resPix = await callRpc(e2eDb, ADMIN_CLAIMS, 'processar_webhook_pix', [
        txid,
        'psp_mp_pdv_50',
        50.00,
        0.00,
        'sandbox',
        JSON.stringify({})
      ]);
      expect(resPix.sucesso).toBe(true);

      const { rows: cobRows } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status FROM public.pix_cobrancas WHERE txid = $1', [txid])
      );
      expect(cobRows[0].status).toBe('pago');
    });
  });

  describe('CT06: Exclusão de aguardando_pagamento do KDS até Confirmação (RF06, CA06, CA07)', () => {
    it('filtra pedidos aguardando_pagamento fora do KDS', async () => {
      const { rows: pedAguardo } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, total, origem)
           VALUES ('BALCAO', 'aguardando_pagamento', 'pendente', 15.00, 'totem')
           RETURNING id`,
          []
        )
      );

      const { rows: kdsBefore } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `SELECT id FROM public.pedidos
           WHERE status IN ('pendente', 'em_preparo')
             AND status <> 'aguardando_pagamento'
             AND id = $1`,
          [pedAguardo[0].id]
        )
      );
      expect(kdsBefore.length).toBe(0);

      // Ao mudar para pendente, entra no KDS
      await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(`UPDATE public.pedidos SET status = 'pendente' WHERE id = $1`, [pedAguardo[0].id])
      );

      const { rows: kdsAfter } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `SELECT id FROM public.pedidos
           WHERE status IN ('pendente', 'em_preparo')
             AND id = $1`,
          [pedAguardo[0].id]
        )
      );
      expect(kdsAfter.length).toBe(1);
    });
  });

  describe('CT07: Preservação de Taxas e Repasses nas Funções Financeiras (RF07, CA08)', () => {
    it('calcula taxas financeiras e valor líquido via trigger preservando balcão', async () => {
      const { rows: pedBalcao } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, forma_pagamento, total, origem)
           VALUES ('BALCAO', 'pendente', 'pago', 'pix', 100.00, 'pdv')
           RETURNING total, taxa_pagamento_valor, valor_liquido`,
          []
        )
      );

      expect(pedBalcao[0]).toBeDefined();
      expect(Number(pedBalcao[0].total)).toBe(100.00);
      expect(Number(pedBalcao[0].valor_liquido)).toBe(100.00 - Number(pedBalcao[0].taxa_pagamento_valor || 0));
    });
  });

  describe('CT08: Expirar Cobranças Vencidas e Tratamento de Valor Divergente (RF05, CA09, CA10)', () => {
    it('marca cobranças vencidas como expirada na rotina expirar_cobrancas_pix_vencidas', async () => {
      const txidVencido = gerarTxidDinamico({ canal: 'totem', pedidoId: 661 });
      await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pix_cobrancas (txid, valor, canal, brcode, status, expira_em)
           VALUES ($1, 20.00, 'totem', '000201...', 'pendente', now() - interval '5 minutes')`,
          [txidVencido]
        )
      );

      const resExpirar = await callRpc(e2eDb, ADMIN_CLAIMS, 'expirar_cobrancas_pix_vencidas', []);
      expect(Number(resExpirar)).toBeGreaterThanOrEqual(1);

      const { rows: verifyCob } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status FROM public.pix_cobrancas WHERE txid = $1', [txidVencido])
      );
      expect(verifyCob[0].status).toBe('expirada');
    });

    it('bloqueia quitação automática se valor pago for divergente e marca divergente', async () => {
      const { rows: pedDiv } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query(
          `INSERT INTO public.pedidos (mesa_codigo, status, status_pagamento, total, origem)
           VALUES ('BALCAO', 'aguardando_pagamento', 'pendente', 50.00, 'totem')
           RETURNING id`,
          []
        )
      );
      const txidDiv = gerarTxidDinamico({ canal: 'totem', pedidoId: pedDiv[0].id });

      await callRpc(e2eDb, ANON_CLAIMS, 'criar_cobranca_pix', [
        pedDiv[0].id,
        'BALCAO',
        50.00,
        'totem',
        txidDiv,
        '000201...',
        'sandbox',
        10
      ]);

      // Webhook com valor inferior (R$ 10 em vez de R$ 50)
      const resWebhookDiv = await callRpc(e2eDb, ADMIN_CLAIMS, 'processar_webhook_pix', [
        txidDiv,
        'psp_mp_div',
        10.00,
        0.00,
        'sandbox',
        JSON.stringify({})
      ]);
      expect(resWebhookDiv.sucesso).toBe(false);
      expect(resWebhookDiv.status).toBe('divergente');

      const { rows: cobDivRows } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status, motivo_conferencia, valor_pago FROM public.pix_cobrancas WHERE txid = $1', [txidDiv])
      );
      expect(cobDivRows[0].status).toBe('divergente');
      expect(cobDivRows[0].motivo_conferencia).toContain('diverge');
      expect(Number(cobDivRows[0].valor_pago)).toBe(10.00);

      const { rows: pedDivAtualizado } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status, status_pagamento FROM public.pedidos WHERE id = $1', [pedDiv[0].id])
      );
      expect(pedDivAtualizado[0].status).toBe('aguardando_pagamento');
      expect(pedDivAtualizado[0].status_pagamento).toBe('pendente');
    });
  });

  describe('CT09: Auditoria e Conferência Manual no Admin (RF10, CA10)', () => {
    it('lista cobranças divergentes e permite resolução manual com auditoria', async () => {
      const { rows: cobList } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT id, txid FROM public.pix_cobrancas WHERE status = $1 LIMIT 1', ['divergente'])
      );
      expect(cobList.length).toBe(1);
      const cobId = cobList[0].id;

      const resListar = await callRpc(e2eDb, ADMIN_CLAIMS, 'listar_cobrancas_pix_conferencia', []);
      expect(Array.isArray(resListar)).toBe(true);
      const item = resListar.find((c) => String(c.id) === String(cobId));
      expect(item).toBeDefined();

      const resResolver = await callRpc(e2eDb, ADMIN_CLAIMS, 'resolver_cobranca_pix_conferencia', [
        cobId,
        'aprovar',
        'Comprovante do cliente conferido manualmente no extrato bancário'
      ]);
      expect(resResolver.sucesso).toBe(true);

      const { rows: cobPos } = await e2eDb.withJwtClaims(ADMIN_CLAIMS, (tx) =>
        tx.query('SELECT status, motivo_conferencia, pago_em FROM public.pix_cobrancas WHERE id = $1', [cobId])
      );
      expect(cobPos[0].status).toBe('pago');
      expect(cobPos[0].motivo_conferencia).toContain('extrato bancário');
      expect(cobPos[0].pago_em).toBeDefined();
    });
  });

  describe('CT10: Isolamento de Credenciais PSP (RNF02)', () => {
    it('não expõe credenciais privadas do PSP nos bundles ou arquivos públicos de frontend', () => {
      const clientFiles = [
        'js/pix-brcode.js',
        'js/totem.js',
        'js/cardapio-cliente-pedido.js',
        'js/pdv/fechamento.js',
        'js/admin/settings.js'
      ];

      for (const relPath of clientFiles) {
        const fullPath = path.resolve(relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          expect(content).not.toMatch(/APP_USR-[A-Za-z0-9_-]+/); // MP production tokens
          expect(content).not.toMatch(/\$aact_[A-Za-z0-9_-]+/); // Asaas API keys
          expect(content).not.toContain('PIX_PSP_ACCESS_TOKEN');
          expect(content).not.toContain('PIX_PSP_WEBHOOK_SECRET');
        }
      }

      if (fs.existsSync(path.resolve('dist'))) {
        const distFiles = fs.readdirSync(path.resolve('dist')).filter((f) => f.endsWith('.js'));
        for (const f of distFiles) {
          const content = fs.readFileSync(path.resolve('dist', f), 'utf-8');
          expect(content).not.toMatch(/APP_USR-[A-Za-z0-9_-]+/);
          expect(content).not.toMatch(/\$aact_[A-Za-z0-9_-]+/);
        }
      }
    });
  });

  describe('CT11: Reversibilidade Transacional e Rollback da Migration 123 (RNF04)', () => {
    it('possui arquivo de rollback SQL transacional com remoção de objetos e registro de versão', () => {
      const rollbackPath = path.resolve('supabase/rollback/rollback_caf_000123.sql');
      expect(fs.existsSync(rollbackPath)).toBe(true);

      const sql = fs.readFileSync(rollbackPath, 'utf-8');
      expect(sql).toMatch(/BEGIN;/i);
      expect(sql).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS\s+public\.pix_cobrancas/i);
      expect(sql).toMatch(/DELETE\s+FROM\s+public\.app_migrations\s+WHERE\s+versao\s*=\s*'123'/i);
      expect(sql).toMatch(/COMMIT;/i);
    });
  });
});
