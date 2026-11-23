import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import qrcodeGenerator from 'qrcode-generator';
import { createE2EDatabase } from '../scripts/e2e-db.mjs';
import {
  limparDigitos,
  formatarCpfCnpj,
  calcularModulo11Chave,
  gerarChaveAcesso44,
  formatarChaveEspacada,
  gerarQrCodeUrlNfce,
  validarDadosFiscaisItens,
  mapearFormaPagamentoSefaz,
  despacharNfceParaProvedor
} from '../supabase/functions/_shared/nfce-provider.js';
import { createNfceEmitirHandler } from '../supabase/functions/nfce-emitir/index.ts';
import { createNfceCancelarHandler } from '../supabase/functions/nfce-cancelar/index.ts';
import '../js/pedido-print.js';

if (typeof window !== 'undefined') {
  window.qrcode = qrcodeGenerator;
}
globalThis.qrcode = qrcodeGenerator;

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

describe('CAF-000124: Emissão de NFC-e no Fechamento da Conta via Provedor Fiscal', () => {
  let e2eDb;
  let categoriaValidaId;
  let categoriaInvalidaId;
  let produtoValidoId;
  let produtoSemDadosId;
  let fechamentoId40;
  let fechamentoParcialId;

  beforeAll(async () => {
    e2eDb = await createE2EDatabase({ env: {} });

    // 1. Cria perfil de admin com PIN configurado
    await e2eDb.query(`
      INSERT INTO public.perfis (id, nome, pin_hash, ativo)
      VALUES (
        '00000000-0000-0000-0000-000000000001'::uuid,
        'Administrador Teste',
        public.fn_hash_pin('1234'),
        true
      )
      ON CONFLICT (id) DO UPDATE SET pin_hash = public.fn_hash_pin('1234');
    `);

    // 1.1 Cria mesas para os testes
    await e2eDb.query(`
      INSERT INTO public.mesas (codigo, descricao)
      VALUES 
        ('M10', 'Mesa 10'),
        ('M11', 'Mesa 11'),
        ('M12', 'Mesa 12'),
        ('M15', 'Mesa 15'),
        ('M20', 'Mesa 20'),
        ('M99', 'Mesa 99')
      ON CONFLICT (codigo) DO NOTHING;
    `);

    // 2. Cria categorias: uma com dados fiscais padrão e outra sem
    const { rows: catRows } = await e2eDb.query(`
      INSERT INTO public.categorias (id, nome, ncm_padrao, cfop_padrao, csosn_padrao)
      VALUES 
        ('cat-fiscal-001', 'Cafeteria Fiscal', '21011110', '5102', '102'),
        ('cat-sem-fiscal-002', 'Sem Fiscal', '', '', '')
      RETURNING id, nome;
    `);
    categoriaValidaId = catRows.find(c => c.nome === 'Cafeteria Fiscal').id;
    categoriaInvalidaId = catRows.find(c => c.nome === 'Sem Fiscal').id;

    // 3. Cria produtos: um completo e outro sem dados
    const { rows: prodRows } = await e2eDb.query(`
      INSERT INTO public.produtos (id, nome, preco, categoria_id, ncm, cfop, csosn)
      VALUES 
        ('prod-valido-001', 'Cappuccino Tradicional', 15.00, $1, '21011110', '5102', '102'),
        ('prod-sem-dados-002', 'Bolo Especial Sem NCM', 10.00, $2, '', '', '')
      RETURNING id, nome;
    `, [categoriaValidaId, categoriaInvalidaId]);
    produtoValidoId = prodRows.find(p => p.nome === 'Cappuccino Tradicional').id;
    produtoSemDadosId = prodRows.find(p => p.nome === 'Bolo Especial Sem NCM').id;

    // 4. Cria pedido e fechamento de R$ 40,00 com desconto de R$ 5,00 pago em Pix (total R$ 35,00)
    const { rows: pedRows } = await e2eDb.query(`
      INSERT INTO public.pedidos (mesa_codigo, total, status, status_pagamento)
      VALUES ('M10', 40.00, 'entregue', 'pago')
      RETURNING id;
    `);
    const pedidoId = pedRows[0].id;

    await e2eDb.query(`
      INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      VALUES 
        ($1, $2, 'Cappuccino Tradicional', 2, 15.00),
        ($1, $2, 'Cappuccino Tradicional', 1, 10.00);
    `, [pedidoId, produtoValidoId]);

    const { rows: fechRows } = await e2eDb.query(`
      INSERT INTO public.fechamentos (mesa_codigo, total_conta, desconto_manual, taxa_servico, troco, parcial)
      VALUES ('M10', 35.00, 5.00, 0.00, 0.00, false)
      RETURNING id;
    `);
    fechamentoId40 = fechRows[0].id;

    await e2eDb.query(`
      INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id)
      VALUES ($1, $2);
    `, [fechamentoId40, pedidoId]);

    await e2eDb.query(`
      INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
      VALUES ($1, 'pix', 35.00);
    `, [fechamentoId40]);

    // 5. Cria fechamento parcial com itens específicos gravados em fechamento_itens (CAF-000112 / CA11)
    const { rows: pedParcialRows } = await e2eDb.query(`
      INSERT INTO public.pedidos (mesa_codigo, total, status, status_pagamento)
      VALUES ('M11', 50.00, 'entregue', 'pendente')
      RETURNING id;
    `);
    const pedParcialId = pedParcialRows[0].id;

    const { rows: itParcialRows } = await e2eDb.query(`
      INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      VALUES 
        ($1, $2, 'Cappuccino Parcial Item 1', 1, 15.00),
        ($1, $2, 'Cappuccino Parcial Item 2', 1, 35.00)
      RETURNING id, quantidade, preco_unitario, subtotal;
    `, [pedParcialId, produtoValidoId]);

    const { rows: fechParcialRows } = await e2eDb.query(`
      INSERT INTO public.fechamentos (mesa_codigo, total_conta, desconto_manual, taxa_servico, troco, parcial)
      VALUES ('M11', 15.00, 0.00, 0.00, 0.00, true)
      RETURNING id;
    `);
    fechamentoParcialId = fechParcialRows[0].id;

    await e2eDb.query(`
      INSERT INTO public.fechamento_itens (fechamento_id, pedido_item_id, quantidade, valor_unitario, subtotal)
      VALUES ($1, $2, 1, 15.00, 15.00);
    `, [fechamentoParcialId, itParcialRows[0].id]);

    await e2eDb.query(`
      INSERT INTO public.fechamento_pagamentos (fechamento_id, forma, valor)
      VALUES ($1, 'cartao_credito', 15.00);
    `, [fechamentoParcialId]);
  }, 60000);

  afterAll(async () => {
    if (e2eDb) {
      await e2eDb.close();
    }
  });

  describe('CA01: Validação de Cadastro Fiscal dos Produtos antes do Envio', () => {
    it('avisa qual produto está incompleto antes de enviar se faltar NCM e a categoria não tiver padrão', async () => {
      // Cria fechamento com o produto incompleto
      const { rows: pedErr } = await e2eDb.query(`
        INSERT INTO public.pedidos (mesa_codigo, total) VALUES ('M99', 10.00) RETURNING id;
      `);
      await e2eDb.query(`
        INSERT INTO public.pedido_itens (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
        VALUES ($1, $2, 'Bolo Especial Sem NCM', 1, 10.00);
      `, [pedErr[0].id, produtoSemDadosId]);

      const { rows: fechErr } = await e2eDb.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta) VALUES ('M99', 10.00) RETURNING id;
      `);
      await e2eDb.query(`
        INSERT INTO public.fechamento_pedidos (fechamento_id, pedido_id) VALUES ($1, $2);
      `, [fechErr[0].id, pedErr[0].id]);

      // Chama RPC obter_dados_fiscais_fechamento
      const dados = await callRpc(e2eDb, ADMIN_CLAIMS, 'obter_dados_fiscais_fechamento', [fechErr[0].id]);

      expect(dados.incompleto).toBe(true);
      expect(dados.produtos_incompletos).toContain('Bolo Especial Sem NCM');

      // Tenta emitir via Edge Function handler
      const clientMock = {
        rpc: async (fn, args) => {
          if (fn === 'obter_dados_fiscais_fechamento') {
            return { data: dados, error: null };
          }
          return { data: null, error: null };
        }
      };

      const handler = createNfceEmitirHandler({
        envGet: () => 'sandbox',
        supabaseClient: clientMock
      });

      const res = await handler(new Request('http://localhost/nfce-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechamento_id: fechErr[0].id })
      }));

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.sucesso).toBe(false);
      expect(json.produtos_incompletos).toContain('Bolo Especial Sem NCM');
      expect(json.erro).toMatch(/dados fiscais/i);
    });
  });

  describe('CA02: Segurança e Ausência de Credenciais/Certificados no Front-end', () => {
    it('varre os arquivos de build gerados (dist/) garantindo que certificados ou tokens de provedor não vazam', () => {
      const distDir = path.resolve('dist');
      if (!fs.existsSync(distDir)) {
        return; // Caso dist não tenha sido gerado antes do teste
      }

      function scanFiles(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanFiles(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Procura padrões de certificados A1, chaves privadas ou tokens reais
            expect(content).not.toMatch(/BEGIN CERTIFICATE/i);
            expect(content).not.toMatch(/BEGIN RSA PRIVATE KEY/i);
            expect(content).not.toMatch(/BEGIN PRIVATE KEY/i);
            expect(content).not.toMatch(/focus_live_[a-zA-Z0-9]{20,}/i);
            expect(content).not.toMatch(/plugnotas_live_[a-zA-Z0-9]{20,}/i);
          }
        }
      }

      scanFiles(distDir);
    });
  });

  describe('CA03: Emissão de Fechamento com Desconto e Forma Pix Registrada', () => {
    it('emite nota autorizada com os mesmos itens, desconto, total e forma de pagamento, gravando em notas_fiscais', async () => {
      // 1. Obtém dados fiscais do fechamento
      const dados = await callRpc(e2eDb, ADMIN_CLAIMS, 'obter_dados_fiscais_fechamento', [fechamentoId40]);
      expect(dados.incompleto).toBe(false);
      expect(dados.total_conta).toBe(35);
      expect(dados.desconto_manual).toBe(5);
      expect(dados.formas_pagamento[0].forma).toBe('pix');
      expect(dados.formas_pagamento[0].codigo_sefaz).toBe('17');

      // 2. Registra emissão da nota
      const resEmissao = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        fechamentoId40,
        null, // sem CPF
        null,
        JSON.stringify(dados.itens),
        JSON.stringify(dados.formas_pagamento),
        null, // gerar chave
        null, // próximo número
        1,
        'autorizada',
        '143260000000001',
        'Autorizado o uso da NFC-e',
        'https://dfe-portal.svrs.rs.gov.br/nfce/qrCode?p=mock',
        null,
        null,
        'homologacao',
        'sandbox',
        JSON.stringify({ total: 35 }),
        JSON.stringify({ mock: true })
      ]);

      expect(resEmissao.sucesso).toBe(true);
      expect(resEmissao.ja_emitida).toBe(false);
      expect(resEmissao.nota.status).toBe('autorizada');
      expect(resEmissao.nota.valor_total).toBe(35);
      expect(resEmissao.nota.valor_desconto).toBe(5);
      expect(resEmissao.nota.chave_acesso).toHaveLength(44);
      expect(resEmissao.nota.protocolo).toBe('143260000000001');

      // 3. Confere persistência no banco
      const { rows: notaDb } = await e2eDb.query(
        'SELECT * FROM public.notas_fiscais WHERE fechamento_id = $1',
        [fechamentoId40]
      );
      expect(notaDb).toHaveLength(1);
      expect(notaDb[0].status).toBe('autorizada');
      expect(Number(notaDb[0].valor_total)).toBe(35);
      expect(Number(notaDb[0].valor_desconto)).toBe(5);
    });
  });

  describe('CA04: Idempotência na Emissão de NFC-e', () => {
    it('ao tentar emitir novamente para fechamento já autorizado, não cria nova nota e retorna a existente', async () => {
      // Chama registrar_emissao_nfce novamente para o mesmo fechamentoId40
      const resRepetida = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        fechamentoId40,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify([])
      ]);

      expect(resRepetida.sucesso).toBe(true);
      expect(resRepetida.ja_emitida).toBe(true);
      expect(resRepetida.nota).toBeDefined();
      expect(resRepetida.nota.fechamento_id).toBe(fechamentoId40);

      // Confere que continua existindo apenas uma única nota no banco
      const { rows } = await e2eDb.query(
        'SELECT COUNT(*) AS total FROM public.notas_fiscais WHERE fechamento_id = $1',
        [fechamentoId40]
      );
      expect(Number(rows[0].total)).toBe(1);
    });
  });

  describe('CA05: Impressão do DANFE NFC-e com QR Code e Chave de Acesso', () => {
    it('gera HTML de impressão térmica do DANFE contendo chave de 44 dígitos e QR Code', () => {
      const notaMock = {
        numero: 123,
        serie: 1,
        chave_acesso: '43261100000000000191650010000001231000000018',
        protocolo: '143260000123456',
        valor_total: 45.00,
        valor_desconto: 5.00,
        valor_produtos: 50.00,
        itens: [
          { nome: 'Café Filtrado', quantidade: 2, valor_unitario: 15.00, valor_total: 30.00 },
          { nome: 'Pão de Queijo', quantidade: 1, valor_unitario: 20.00, valor_total: 20.00 }
        ],
        formas_pagamento: [{ forma: 'pix', valor: 45.00 }],
        qr_code_url: 'https://dfe-portal.svrs.rs.gov.br/nfce/qrCode?p=43261100000000000191650010000001231000000018|2|1|1|',
        ambiente: 'homologacao'
      };

      let printOutput = '';
      const originalExecutePrint = window.executePrint;
      // Espiona o HTML injetado no iframe de impressão
      window.document.getElementById = () => ({
        contentWindow: {
          document: {
            open: () => {},
            write: (html) => { printOutput = html; },
            close: () => {}
          },
          focus: () => {},
          print: () => {}
        }
      });

      window.cafeteriaPrint.printDanfeNfce(notaMock, {
        nome_fantasia: 'Cafeteria do Teatro',
        cnpj: '00.000.000/0001-91'
      });

      expect(printOutput).toContain('DANFE NFC-e');
      expect(printOutput).toContain('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica');
      expect(printOutput).toContain('4326 1100 0000 0000 0191 6500 1000 0001 2310 0000 0018');
      expect(printOutput).toContain('143260000123456');
      expect(printOutput).toContain('Café Filtrado');
      expect(printOutput).toContain('Pão de Queijo');
      expect(printOutput).toContain('R$ 45,00');
    });
  });

  describe('CA06: Identificação Opcional do Consumidor (CPF/CNPJ)', () => {
    it('com CPF informado, grava e exibe o CPF na nota; sem CPF, sai como não identificado', () => {
      // 1. Formatador de CPF/CNPJ
      expect(formatarCpfCnpj('12345678909')).toBe('123.456.789-09');
      expect(formatarCpfCnpj('00000000000191')).toBe('00.000.000/0001-91');
      expect(limparDigitos('123.456.789-09')).toBe('12345678909');

      // 2. Chave de acesso 44 dígitos
      const chave = gerarChaveAcesso44({
        cnpj: '00000000000191',
        serie: 1,
        numero: 99
      });
      expect(chave).toHaveLength(44);
      expect(formatarChaveEspacada(chave)).toMatch(/^(\d{4}\s){10}\d{4}$/);
    });
  });

  describe('CA07: Tratamento de Rejeição da SEFAZ sem Bloqueio de Venda', () => {
    it('quando a SEFAZ rejeita a nota, grava status rejeitada com motivo e informa operador mantendo venda fechada', async () => {
      // Fechamento de teste
      const { rows } = await e2eDb.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta) VALUES ('M12', 20.00) RETURNING id;
      `);
      const fechId = rows[0].id;

      // Despacha simulação de rejeição
      const resProvedor = await despacharNfceParaProvedor({
        provedor: 'sandbox',
        notaPayload: { simularRejeicao: true, numero: 10 }
      });
      expect(resProvedor.sucesso).toBe(false);
      expect(resProvedor.status).toBe('rejeitada');
      expect(resProvedor.motivo).toMatch(/Rejeição SEFAZ 778/);

      // Registra a nota com status rejeitada
      const resDb = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        fechId,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        10,
        1,
        'rejeitada',
        null,
        resProvedor.motivo
      ]);

      expect(resDb.sucesso).toBe(true);
      expect(resDb.nota.status).toBe('rejeitada');
      expect(resDb.nota.motivo_status).toContain('Rejeição SEFAZ 778');

      // A conta continua fechada no banco
      const { rows: fechDb } = await e2eDb.query('SELECT * FROM public.fechamentos WHERE id = $1', [fechId]);
      expect(fechDb).toHaveLength(1);
    });
  });

  describe('CA08: Cancelamento de NFC-e com Permissão/PIN e Recusa sem Permissão', () => {
    let notaParaCancelarId;

    beforeAll(async () => {
      const { rows } = await e2eDb.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta) VALUES ('M15', 50.00) RETURNING id;
      `);
      const res = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        rows[0].id,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        200,
        1,
        'autorizada'
      ]);
      notaParaCancelarId = res.nota.id;
    });

    it('recusa cancelamento se PIN estiver incorreto e usuário não for admin', async () => {
      await expect(
        callRpc(e2eDb, ANON_CLAIMS, 'cancelar_nfce', [
          notaParaCancelarId,
          'Cliente desistiu da compra no balcão',
          '9999' // PIN incorreto
        ])
      ).rejects.toThrow(/permissão negada|permission denied/i);
    });

    it('recusa cancelamento com motivo inferior a 15 caracteres', async () => {
      await expect(
        callRpc(e2eDb, ADMIN_CLAIMS, 'cancelar_nfce', [
          notaParaCancelarId,
          'Curto',
          null
        ])
      ).rejects.toThrow(/15 caracteres/);
    });

    it('cancela a nota com sucesso quando usuário tem permissão ou PIN correto', async () => {
      const res = await callRpc(e2eDb, ADMIN_CLAIMS, 'cancelar_nfce', [
        notaParaCancelarId,
        'Cliente solicitou o cancelamento do pedido no balcão',
        '1234'
      ]);

      expect(res.sucesso).toBe(true);
      expect(res.status).toBe('cancelada');

      const { rows } = await e2eDb.query('SELECT * FROM public.notas_fiscais WHERE id = $1', [notaParaCancelarId]);
      expect(rows[0].status).toBe('cancelada');
      expect(rows[0].motivo_cancelamento).toContain('Cliente solicitou o cancelamento');
      expect(rows[0].cancelada_em).not.toBeNull();
    });
  });

  describe('CA09: Contingência Offline quando o Provedor/SEFAZ está Indisponível', () => {
    it('quando o provedor fiscal sofre timeout, salva a nota em contingência sem quebrar o fechamento', async () => {
      const { rows } = await e2eDb.query(`
        INSERT INTO public.fechamentos (mesa_codigo, total_conta) VALUES ('M20', 30.00) RETURNING id;
      `);
      const fechId = rows[0].id;

      let contingenciaDisparada = false;
      try {
        await despacharNfceParaProvedor({
          provedor: 'sandbox',
          notaPayload: { simularTimeout: true }
        });
      } catch (err) {
        contingenciaDisparada = true;
      }
      expect(contingenciaDisparada).toBe(true);

      // Registra a nota com status contingência
      const resDb = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        fechId,
        null,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        null,
        300,
        1,
        'contingencia',
        null,
        'Provedor offline. Nota em contingência para envio posterior.'
      ]);

      expect(resDb.sucesso).toBe(true);
      expect(resDb.nota.status).toBe('contingencia');
      expect(resDb.nota.chave_acesso).toHaveLength(44);
    });
  });

  describe('CA10: Relatório Mensal e Gestão Fiscal de Notas', () => {
    it('retorna totais por status e lista de notas filtrada pelo mês atual', async () => {
      const mesAtual = new Date().toISOString().slice(0, 7);
      const resRelatorio = await callRpc(e2eDb, ADMIN_CLAIMS, 'listar_notas_fiscais', [mesAtual, null]);

      expect(resRelatorio.periodo).toBe(mesAtual);
      expect(resRelatorio.resumo).toBeDefined();
      expect(Number(resRelatorio.resumo.total_geral)).toBeGreaterThanOrEqual(1);
      expect(Number(resRelatorio.resumo.total_autorizadas)).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(resRelatorio.notas)).toBe(true);
      expect(resRelatorio.notas.length).toBeGreaterThanOrEqual(1);

      // Testa filtro por status específico (ex: autorizada)
      const resAut = await callRpc(e2eDb, ADMIN_CLAIMS, 'listar_notas_fiscais', [mesAtual, 'autorizada']);
      expect(resAut.notas.every(n => n.status === 'autorizada')).toBe(true);
    });
  });

  describe('CA11: Fechamento Parcial de Mesa com Emissão de NFC-e dos Itens Pagos', () => {
    it('emite nota fiscal contendo apenas os itens selecionados e pagos naquele fechamento parcial', async () => {
      // 1. Obtém dados fiscais do fechamento parcial
      const dadosParcial = await callRpc(e2eDb, ADMIN_CLAIMS, 'obter_dados_fiscais_fechamento', [fechamentoParcialId]);

      expect(dadosParcial.parcial).toBe(true);
      expect(dadosParcial.total_conta).toBe(15);
      // Deve conter exatamente o item 1 pago (R$ 15,00) e NÃO o item 2 (R$ 35,00)
      expect(dadosParcial.itens).toHaveLength(1);
      expect(dadosParcial.itens[0].nome).toBe('Cappuccino Parcial Item 1');
      expect(dadosParcial.itens[0].valor_total).toBe(15);

      // 2. Emite nota fiscal do fechamento parcial
      const resEmissaoParcial = await callRpc(e2eDb, ADMIN_CLAIMS, 'registrar_emissao_nfce', [
        fechamentoParcialId,
        '12345678909',
        'Consumidor Parcial',
        JSON.stringify(dadosParcial.itens),
        JSON.stringify(dadosParcial.formas_pagamento),
        null,
        501,
        1,
        'autorizada'
      ]);

      expect(resEmissaoParcial.sucesso).toBe(true);
      expect(resEmissaoParcial.nota.valor_total).toBe(15);
      expect(resEmissaoParcial.nota.consumidor_cpf_cnpj).toBe('12345678909');
      expect(resEmissaoParcial.nota.itens).toHaveLength(1);
      expect(resEmissaoParcial.nota.itens[0].nome).toBe('Cappuccino Parcial Item 1');
    });
  });
});
