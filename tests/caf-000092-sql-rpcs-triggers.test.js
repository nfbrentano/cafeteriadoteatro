import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { validarAmbienteSeguro, listarTestesSql, validarEstruturaPgTap, PROD_HOST } from '../scripts/test-db-runner.js';

/**
 * CAF-000092 — Testes SQL Automatizados das RPCs, Triggers e Policies (pgTAP em Banco Isolado)
 */
describe('CAF-000092 — Suíte SQL, RPCs, Triggers e Policies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const schemaSnapshot = JSON.parse(fs.readFileSync('tests/fixtures/schema-snapshot.json', 'utf8'));
  const deployYaml = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

  it('CA01 / RF01: package.json possui script test:db e arquivos pgTAP existem em supabase/tests/', () => {
    expect(pkg.scripts['test:db']).toBeDefined();
    expect(pkg.scripts['test:db']).toContain('scripts/test-db-runner.js');

    const arquivos = listarTestesSql();
    expect(arquivos.length).toBeGreaterThanOrEqual(14);
    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(arq, 'utf8');
      const res = validarEstruturaPgTap(conteudo);
      expect(res.valido, `Arquivo ${arq} deve ter estrutura pgTAP transacional válida`).toBe(true);
    }
  });

  it('CA02: testes de fechamento de conta cobrem parâmetros, cancelados e pagamentos (fechar_conta_mesa.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/fechar_conta_mesa.test.sql', 'utf8');
    expect(sql).toMatch(/fechar_conta_mesa/);
    expect(sql).toMatch(/cancelado/i);
    expect(sql).toMatch(/p_desconto_manual/i);
  });

  it('CA03: testes de pedido validam itens esgotados e adicionais vinculados (criar_pedido.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/criar_pedido.test.sql', 'utf8');
    expect(sql).toMatch(/criar_pedido/);
    expect(sql).toMatch(/disponivel/i);
    expect(sql).toMatch(/produto_adicionais_permitidos/i);
  });

  it('CA04: testes de cancelamento de item e transferência de mesa (cancelar_item e transferir_mesa)', () => {
    const sqlCancelar = fs.readFileSync('supabase/tests/cancelar_item.test.sql', 'utf8');
    const sqlTransferir = fs.readFileSync('supabase/tests/transferir_mesa.test.sql', 'utf8');

    expect(sqlCancelar).toMatch(/cancelar_item/);
    expect(sqlCancelar).toMatch(/motivo/i);

    expect(sqlTransferir).toMatch(/transferir_mesa/);
    expect(sqlTransferir).toMatch(/auditoria/i);
  });

  it('CA05: testes de estoque e CMV com custo médio ponderado (estoque_custo.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/estoque_custo.test.sql', 'utf8');
    expect(sql).toMatch(/fn_calcular_custo_produto/);
    expect(sql).toMatch(/custo/i);
    expect(sql).toMatch(/trg_gravar_custo_pedido_item/);
  });

  it('CA06: testes de caixa, contagem cega e taxas de pagamento (caixa.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/caixa.test.sql', 'utf8');
    expect(sql).toMatch(/get_caixa_atual/);
    expect(sql).toMatch(/fn_calcular_totais_caixa_interno/);
    expect(sql).toMatch(/cego|cega/i);
  });

  it('CA07: testes de cashback e cupons com controle de idempotência (cashback.test.sql e cupons.test.sql)', () => {
    const sqlCashback = fs.readFileSync('supabase/tests/cashback.test.sql', 'utf8');
    const sqlCupons = fs.readFileSync('supabase/tests/cupons.test.sql', 'utf8');

    expect(sqlCashback).toMatch(/processar_cashback_pedido/);
    expect(sqlCashback).toMatch(/idempot/i);

    expect(sqlCupons).toMatch(/validar_cupom/);
    expect(sqlCupons).toMatch(/registrar_uso_cupom/);
  });

  it('CA08: testes de conta do cliente e limite de fiado (conta_cliente.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/conta_cliente.test.sql', 'utf8');
    expect(sql).toMatch(/lancar_movimento_conta/);
    expect(sql).toMatch(/limite/i);
    expect(sql).toMatch(/FOR UPDATE/i);
  });

  it('CA09: matriz RLS por papel para pedidos, clientes e views (rls_pedidos.test.sql e rls_clientes.test.sql)', () => {
    const sqlPedidos = fs.readFileSync('supabase/tests/rls_pedidos.test.sql', 'utf8');
    const sqlClientes = fs.readFileSync('supabase/tests/rls_clientes.test.sql', 'utf8');

    expect(sqlPedidos).toMatch(/relrowsecurity/);
    expect(sqlPedidos).toMatch(/entregue/i);

    expect(sqlClientes).toMatch(/relrowsecurity/);
    expect(sqlClientes).toMatch(/security_invoker/i);
  });

  it('CA10: catálogo e assinaturas de RPCs batem com o snapshot do front-end', () => {
    const sql = fs.readFileSync('supabase/tests/contrato_catalogo.test.sql', 'utf8');
    expect(sql).toMatch(/fechar_conta_mesa/);
    expect(sql).toMatch(/criar_pedido/);
    expect(sql).toMatch(/cancelar_item/);

    expect(schemaSnapshot.rpcs['fechar_conta_mesa']).toBeDefined();
    expect(schemaSnapshot.rpcs['criar_pedido']).toBeDefined();
    expect(schemaSnapshot.rpcs['cancelar_item']).toBeDefined();
  });

  it('CA11: testes de fuso horário America/Sao_Paulo e corte do dia operacional (fuso_corte_dia.test.sql)', () => {
    const sql = fs.readFileSync('supabase/tests/fuso_corte_dia.test.sql', 'utf8');
    expect(sql).toMatch(/America\/Sao_Paulo/i);
    expect(sql).toMatch(/timestamptz/i);
  });

  it('CA12: job db-tests configurado no GitHub Actions bloqueando merge e deploy', () => {
    expect(deployYaml).toMatch(/db-tests:/);
    expect(deployYaml).toMatch(/npm run test:db/);
    expect(deployYaml).toMatch(/needs:\s*\[db-tests\]/);
  });

  it('CA13: bugs conhecidos mapeados com referência de SDD sem quebrar a suíte', () => {
    const sql = fs.readFileSync('supabase/tests/fechar_conta_mesa.test.sql', 'utf8');
    expect(sql).toMatch(/CAF-000073/);
  });

  it('CA14: teste de concorrência com idempotência e FOR UPDATE', () => {
    const sqlFechar = fs.readFileSync('supabase/tests/fechar_conta_mesa.test.sql', 'utf8');
    const sqlConta = fs.readFileSync('supabase/tests/conta_cliente.test.sql', 'utf8');

    expect(sqlFechar).toMatch(/FOR UPDATE/i);
    expect(sqlConta).toMatch(/FOR UPDATE/i);
  });

  it('CA15 / RNF01: trava de produção aborta imediatamente se apontar para o host de produção', () => {
    // 1. Host local/preview é aceito
    expect(() => validarAmbienteSeguro('postgresql://postgres:postgres@localhost:54322/postgres')).not.toThrow();
    expect(() => validarAmbienteSeguro('')).not.toThrow();

    // 2. Host de produção é rejeitado com mensagem estrita
    expect(() => validarAmbienteSeguro(`https://${PROD_HOST}`)).toThrow(/testes SQL só rodam em banco local\/preview/);
    expect(() => validarAmbienteSeguro('postgres://postgres:pass@nyretgvzbnbtiyeioeju.supabase.co:5432/postgres')).toThrow(/testes SQL só rodam em banco local\/preview/);
  });
});
