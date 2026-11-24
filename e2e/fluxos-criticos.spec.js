import { test, expect } from '@playwright/test';

const PROD_MARKER = 'nyretgvzbnbtiyeioeju';
const E2E_PASS = 'E2E@2026!';

async function setupIsolatedContext(context) {
  const prodRequests = [];
  const pageErrors = [];

  context.on('request', (req) => {
    if (req.url().includes(PROD_MARKER)) {
      prodRequests.push(req.url());
    }
  });

  context.on('page', (page) => {
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
  });

  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes(PROD_MARKER)) {
      prodRequests.push(url);
      await route.abort();
      return;
    }

    if (
      url.startsWith('http://127.0.0.1:4173') ||
      url.startsWith('http://localhost:4173') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      await route.continue();
      return;
    }

    if (url.endsWith('.css') || url.includes('fonts.googleapis.com')) {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });

  return { prodRequests, pageErrors };
}

async function querySql(request, sql, params = []) {
  const res = await request.post('/e2e/api/sql', {
    data: { sql, params }
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.error).toBeNull();
  return body.rows || [];
}

async function loginPdvOrKds(page, urlPath, email) {
  await page.goto(urlPath);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pass').fill(E2E_PASS);
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden();
}

async function loginAdmin(page) {
  await page.goto('/admin.html');
  await page.locator('#login-user').fill('admin@e2e.local');
  await page.locator('#login-pass').fill(E2E_PASS);
  await page.locator('#login-btn').click();
  await expect(page.locator('#admin-app')).toBeVisible();
}

async function selecionarMesaNoPdv(page, mesaCodigo) {
  await page.locator('#btn-mesa-trigger').click();
  const mesaCardBtn = page.locator(`.mesa-btn-card[data-mesa="${mesaCodigo}"]`);
  await expect(mesaCardBtn).toBeVisible();
  await mesaCardBtn.click();
}

async function adicionarProdutoNoPdv(page, nomeProduto) {
  await page.locator('.cat-tab', { hasText: 'Todos' }).click();
  const card = page.locator('#products-grid .product-card', { hasText: nomeProduto });
  await expect(card).toBeVisible();
  await card.click();
}

test.describe('CAF-000120 — Testes E2E de Fluxos Críticos em Navegador Real', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/e2e/api/reset');
    expect(res.ok()).toBe(true);
  });

  test('CT01 (CA01): Ambiente isolado carrega migrations e seed mínimo sem chamar produção', async ({ browser, request }) => {
    const health = await (await request.get('/e2e/health')).json();
    expect(health.ok).toBe(true);
    expect(health.appliedMigrations).toBeGreaterThanOrEqual(65);

    const [cats] = await querySql(request, 'SELECT COUNT(*)::int AS total FROM public.categorias');
    const [prods] = await querySql(request, 'SELECT COUNT(*)::int AS total FROM public.produtos');
    const [mesas] = await querySql(request, 'SELECT COUNT(*)::int AS total FROM public.mesas');
    const [pedidos] = await querySql(request, 'SELECT COUNT(*)::int AS total FROM public.pedidos');
    const [clientes] = await querySql(request, 'SELECT COUNT(*)::int AS total FROM public.clientes');

    expect(cats.total).toBe(3);
    expect(prods.total).toBeGreaterThanOrEqual(5);
    expect(mesas.total).toBeGreaterThanOrEqual(5);
    expect(pedidos.total).toBe(0);
    expect(clientes.total).toBe(0);

    const context = await browser.newContext();
    const { prodRequests, pageErrors } = await setupIsolatedContext(context);
    try {
      const page = await context.newPage();
      await page.goto('/cardapio.html');
      await expect(page.locator('#cardapio-root')).toContainText('Café Espresso');

      await loginPdvOrKds(page, '/pedidos.html', 'barista@e2e.local');
      await expect(page.locator('#products-grid')).toContainText('Café Espresso');

      expect(prodRequests).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('CT02 (CA02 — Cenário 1): Pedido lançado em pedidos.html aparece em cozinha.html via Realtime em < 5s', async ({ browser, request }) => {
    const ctxBarista = await browser.newContext();
    const ctxCozinha = await browser.newContext();
    const guardBarista = await setupIsolatedContext(ctxBarista);
    const guardCozinha = await setupIsolatedContext(ctxCozinha);

    try {
      const pdvPage = await ctxBarista.newPage();
      const kdsPage = await ctxCozinha.newPage();

      await loginPdvOrKds(kdsPage, '/cozinha.html', 'cozinha@e2e.local');
      await loginPdvOrKds(pdvPage, '/pedidos.html', 'barista@e2e.local');

      await selecionarMesaNoPdv(pdvPage, 'M-01');
      await adicionarProdutoNoPdv(pdvPage, 'Café Espresso');
      await adicionarProdutoNoPdv(pdvPage, 'Pão de Queijo Artesanal');
      await pdvPage.locator('#btn-enviar-pedido').click();

      // Aguardar card aparecer em #list-pendentes na aba do KDS sem reload
      await expect(kdsPage.locator('#list-pendentes .pedido-card')).toHaveCount(1, { timeout: 5000 });
      await expect(kdsPage.locator('#list-pendentes')).toContainText('M-01');
      await expect(kdsPage.locator('#list-pendentes')).toContainText('Café Espresso');
      await expect(kdsPage.locator('#list-pendentes')).toContainText('Pão de Queijo Artesanal');

      const [ped] = await querySql(request, 'SELECT id, mesa_codigo, total, status FROM public.pedidos ORDER BY id DESC LIMIT 1');
      expect(ped.mesa_codigo).toBe('M-01');
      expect(Number(ped.total)).toBe(22);
      expect(ped.status).toBe('pendente');

      expect(guardBarista.prodRequests).toEqual([]);
      expect(guardCozinha.prodRequests).toEqual([]);
    } finally {
      await ctxBarista.close();
      await ctxCozinha.close();
    }
  });

  test('CT03 (CA03 — Cenário 2): Conclusão das estações em cozinha.html atualiza status pronto em pedidos.html via Realtime', async ({ browser, request }) => {
    const ctxBarista = await browser.newContext();
    const ctxCozinha = await browser.newContext();
    const guardBarista = await setupIsolatedContext(ctxBarista);
    const guardCozinha = await setupIsolatedContext(ctxCozinha);

    try {
      const pdvPage = await ctxBarista.newPage();
      const kdsPage = await ctxCozinha.newPage();

      await loginPdvOrKds(pdvPage, '/pedidos.html', 'barista@e2e.local');
      await selecionarMesaNoPdv(pdvPage, 'M-01');
      await adicionarProdutoNoPdv(pdvPage, 'Café Espresso');
      await adicionarProdutoNoPdv(pdvPage, 'Pão de Queijo Artesanal');
      await pdvPage.locator('#btn-enviar-pedido').click();

      // Abrir visão de Mesas & Ativos em pedidos.html
      await pdvPage.locator('#nav-btn-mesas').click();
      await expect(pdvPage.locator('.pedido-card-barista')).toHaveCount(1);

      await loginPdvOrKds(kdsPage, '/cozinha.html', 'cozinha@e2e.local');
      await expect(kdsPage.locator('#list-pendentes .pedido-card')).toHaveCount(1);

      // Iniciar preparo nas duas estações (bar e cozinha) ou quantas existirem no card
      while ((await kdsPage.locator('#list-pendentes [data-action="kds-iniciar-preparo"], #list-preparo [data-action="kds-iniciar-preparo"]').count()) > 0) {
        await kdsPage.locator('#list-pendentes [data-action="kds-iniciar-preparo"], #list-preparo [data-action="kds-iniciar-preparo"]').first().click();
        await kdsPage.waitForTimeout(150);
      }

      while ((await kdsPage.locator('#list-preparo [data-action="kds-concluir-preparo"]').count()) > 0) {
        await kdsPage.locator('#list-preparo [data-action="kds-concluir-preparo"]').first().click();
        await kdsPage.waitForTimeout(150);
      }

      await expect(kdsPage.locator('#list-concluidos .pedido-card')).toHaveCount(1);

      // Verificar atualização em tempo real na aba de pedidos.html sem reload
      await expect(pdvPage.locator('.pedido-card-barista.pronto')).toHaveCount(1, { timeout: 5000 });
      await expect(pdvPage.locator('.pedido-card-barista.pronto')).toContainText('PRONTO P/ SERVIR!');

      const [ped] = await querySql(request, 'SELECT status FROM public.pedidos ORDER BY id DESC LIMIT 1');
      expect(ped.status).toBe('concluido');

      expect(guardBarista.prodRequests).toEqual([]);
      expect(guardCozinha.prodRequests).toEqual([]);
    } finally {
      await ctxBarista.close();
      await ctxCozinha.close();
    }
  });

  test('CT04 (CA04 — Cenário 3): Fechamento completo de conta da mesa com dois meios de pagamento', async ({ browser, request }) => {
    const context = await browser.newContext();
    const guard = await setupIsolatedContext(context);

    try {
      const page = await context.newPage();
      await loginPdvOrKds(page, '/pedidos.html', 'barista@e2e.local');

      await selecionarMesaNoPdv(page, 'M-01');
      await adicionarProdutoNoPdv(page, 'Café Espresso');
      await adicionarProdutoNoPdv(page, 'Pão de Queijo Artesanal');
      await page.locator('#btn-enviar-pedido').click();

      await page.locator('#nav-btn-mesas').click();
      const mesaCard = page.locator('#mesas-grid .mesa-card', { hasText: 'M-01' });
      await expect(mesaCard).toHaveClass(/ocupada/);
      await mesaCard.click();

      await expect(page.locator('#modal-mesa')).toBeVisible();
      await page.locator('#modal-mesa-fechar-conta').click();

      await expect(page.locator('#modal-fechar-conta')).toBeVisible();
      await page.locator('#btn-fechar-conta-next-1').click();
      await page.locator('#btn-fechar-conta-next-2').click();

      // Pagamento 1: PIX R$ 10,00
      await page.locator('#fechar-conta-forma').selectOption('pix');
      await page.locator('#fechar-conta-valor').fill('10');
      await page.locator('#btn-add-pagamento').click();

      // Pagamento 2: Dinheiro R$ 12,00
      await page.locator('#fechar-conta-forma').selectOption('dinheiro');
      await page.locator('#fechar-conta-valor').fill('12');
      await page.locator('#btn-add-pagamento').click();

      await page.locator('#modal-fechar-conta-confirmar').click();
      await expect(page.locator('#modal-fechar-conta')).toBeHidden();

      // Mesa M-01 deve voltar a livre
      await expect(page.locator('#mesas-grid .mesa-card', { hasText: 'M-01' })).toHaveClass(/livre/);

      const pagamentos = await querySql(
        request,
        'SELECT forma, valor FROM public.fechamento_pagamentos ORDER BY id ASC'
      );
      expect(pagamentos).toHaveLength(2);
      const soma = pagamentos.reduce((acc, p) => acc + Number(p.valor), 0);
      expect(soma).toBe(22);

      const [ped] = await querySql(request, 'SELECT status_pagamento FROM public.pedidos LIMIT 1');
      expect(ped.status_pagamento).toBe('pago');

      expect(guard.prodRequests).toEqual([]);
      expect(guard.pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('CT05 (CA05 — Cenário 4): Pagamento parcial por item (CAF-000112) sem dupla cobrança', async ({ browser, request }) => {
    const context = await browser.newContext();
    const guard = await setupIsolatedContext(context);

    try {
      const page = await context.newPage();
      await loginPdvOrKds(page, '/pedidos.html', 'barista@e2e.local');

      await selecionarMesaNoPdv(page, 'M-02');
      await adicionarProdutoNoPdv(page, 'Café Espresso'); // R$ 10,00
      await adicionarProdutoNoPdv(page, 'Pão de Queijo Artesanal'); // R$ 12,00
      await adicionarProdutoNoPdv(page, 'Brownie do Teatro'); // R$ 14,00
      await page.locator('#btn-enviar-pedido').click();

      await page.locator('#nav-btn-mesas').click();
      const mesaCard = page.locator('#mesas-grid .mesa-card', { hasText: 'M-02' });
      await expect(mesaCard).toHaveClass(/ocupada/);
      await mesaCard.click();
      await page.locator('#modal-mesa-fechar-conta').click();

      // Avançar para Passo 2 (Ajustes e Divisão), selecionar modo parcial por item e marcar apenas 1 item (Café Espresso R$ 10,00)
      await page.locator('#btn-fechar-conta-next-1').click();
      await page.locator('#fechar-conta-modo').selectOption('parcial_item');
      const chkEspresso = page.locator('.chk-item-parcial').first();
      await chkEspresso.check();
      await page.locator('#btn-fechar-conta-next-2').click();

      await page.locator('#fechar-conta-forma').selectOption('pix');
      await page.locator('#fechar-conta-valor').fill('10');
      await page.locator('#btn-add-pagamento').click();
      await page.locator('#modal-fechar-conta-confirmar').click();
      await expect(page.locator('#modal-fechar-conta')).toBeHidden();

      // Mesa M-02 deve continuar ocupada com saldo restante de R$ 26,00
      await expect(page.locator('#mesas-grid .mesa-card', { hasText: 'M-02' })).toHaveClass(/ocupada/);

      const itensAposPrimeiro = await querySql(
        request,
        'SELECT nome_produto, quantidade, quantidade_paga FROM public.pedido_itens ORDER BY id ASC'
      );
      expect(itensAposPrimeiro.filter((i) => Number(i.quantidade_paga) === Number(i.quantidade))).toHaveLength(1);

      // Reabrir mesa e quitar os 2 itens restantes
      await mesaCard.click();
      await page.locator('#modal-mesa-fechar-conta').click();
      await page.locator('#btn-fechar-conta-next-1').click();
      await page.locator('#fechar-conta-modo').selectOption('parcial_item');
      const checkboxesRestantes = page.locator('.chk-item-parcial');
      await expect(checkboxesRestantes).toHaveCount(2);
      await checkboxesRestantes.nth(0).check();
      await checkboxesRestantes.nth(1).check();
      await page.locator('#btn-fechar-conta-next-2').click();

      await page.locator('#fechar-conta-forma').selectOption('cartao_debito');
      await page.locator('#fechar-conta-valor').fill('26');
      await page.locator('#btn-add-pagamento').click();
      await page.locator('#modal-fechar-conta-confirmar').click();
      await expect(page.locator('#modal-fechar-conta')).toBeHidden();

      // Mesa M-02 deve ficar livre e nenhum item pago em dobro
      await expect(page.locator('#mesas-grid .mesa-card', { hasText: 'M-02' })).toHaveClass(/livre/);

      const itensFinal = await querySql(
        request,
        'SELECT quantidade, quantidade_paga FROM public.pedido_itens ORDER BY id ASC'
      );
      expect(itensFinal).toHaveLength(3);
      for (const item of itensFinal) {
        expect(Number(item.quantidade_paga)).toBe(Number(item.quantidade));
      }

      const pags = await querySql(request, 'SELECT valor FROM public.fechamento_pagamentos');
      expect(pags.reduce((acc, p) => acc + Number(p.valor), 0)).toBe(36);

      expect(guard.prodRequests).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('CT06 (CA06 — Cenário 5): Abertura e fechamento de caixa em admin.html reconciliado com pagamentos', async ({ browser, request }) => {
    const ctxAdmin = await browser.newContext();
    const ctxBarista = await browser.newContext();
    const guardAdmin = await setupIsolatedContext(ctxAdmin);
    const guardBarista = await setupIsolatedContext(ctxBarista);

    try {
      const adminPage = await ctxAdmin.newPage();
      await loginAdmin(adminPage);
      await adminPage.locator('#nav-caixa').click();
      await expect(adminPage.locator('#page-caixa')).toBeVisible();

      // Abrir caixa com R$ 100,00
      await expect(adminPage.locator('#caixa-estado-fechado')).toBeVisible();
      await adminPage.locator('#caixa-fundo-troco').fill('100');
      await adminPage.locator('#btn-abrir-caixa').click();
      await expect(adminPage.locator('#caixa-estado-aberto')).toBeVisible();

      // Realizar venda e fechamento em M-01 com PIX (10,00) + Dinheiro (12,00)
      const pdvPage = await ctxBarista.newPage();
      await loginPdvOrKds(pdvPage, '/pedidos.html', 'barista@e2e.local');
      await selecionarMesaNoPdv(pdvPage, 'M-01');
      await adicionarProdutoNoPdv(pdvPage, 'Café Espresso');
      await adicionarProdutoNoPdv(pdvPage, 'Pão de Queijo Artesanal');
      await pdvPage.locator('#btn-enviar-pedido').click();

      await pdvPage.locator('#nav-btn-mesas').click();
      await pdvPage.locator('#mesas-grid .mesa-card', { hasText: 'M-01' }).click();
      await pdvPage.locator('#modal-mesa-fechar-conta').click();
      await pdvPage.locator('#btn-fechar-conta-next-1').click();
      await pdvPage.locator('#btn-fechar-conta-next-2').click();
      await pdvPage.locator('#fechar-conta-forma').selectOption('pix');
      await pdvPage.locator('#fechar-conta-valor').fill('10');
      await pdvPage.locator('#btn-add-pagamento').click();
      await pdvPage.locator('#fechar-conta-forma').selectOption('dinheiro');
      await pdvPage.locator('#fechar-conta-valor').fill('12');
      await pdvPage.locator('#btn-add-pagamento').click();
      await pdvPage.locator('#modal-fechar-conta-confirmar').click();
      await expect(pdvPage.locator('#modal-fechar-conta')).toBeHidden();

      // Fechar caixa no admin (fechamento cego) e validar totais esperados no resultado (Dinheiro 100+12=112, PIX 10)
      await adminPage.locator('#btn-fechar-caixa').click();
      await expect(adminPage.locator('#modal-fechar-caixa-overlay')).toBeVisible();
      await expect(adminPage.locator('#fechar-caixa-tbody')).toContainText('Dinheiro');

      await adminPage.locator('.form-contado[data-forma="dinheiro"]').fill('112');
      await adminPage.locator('.form-contado[data-forma="pix"]').fill('10');
      await adminPage.locator('#btn-confirmar-fechar-caixa').click();

      await expect(adminPage.locator('#fechar-caixa-resultado-tbody')).toBeVisible();
      await expect(adminPage.locator('#fechar-caixa-resultado-tbody')).toContainText('112,00');
      await expect(adminPage.locator('#fechar-caixa-resultado-tbody')).toContainText('10,00');
      await expect(adminPage.locator('#fechar-caixa-resultado-banner')).toContainText('Caixa bateu exatamente');
      await adminPage.locator('#btn-concluir-fechar-caixa').click();
      await expect(adminPage.locator('#caixa-estado-fechado')).toBeVisible();

      const [caixa] = await querySql(request, 'SELECT id, fechado_em, fundo_troco FROM public.caixas ORDER BY aberto_em DESC LIMIT 1');
      expect(caixa.fechado_em).toBeTruthy();

      const confs = await querySql(
        request,
        'SELECT forma_pagamento, valor_informado::numeric::float8 AS informado, valor_sistema::numeric::float8 AS sistema, diferenca::numeric::float8 AS diferenca FROM public.caixa_conferencia WHERE caixa_id = $1 ORDER BY forma_pagamento',
        [caixa.id]
      );
      const confDinheiro = confs.find((c) => c.forma_pagamento === 'dinheiro');
      const confPix = confs.find((c) => c.forma_pagamento === 'pix');
      expect(confDinheiro).toMatchObject({ informado: 112, sistema: 112, diferenca: 0 });
      expect(confPix).toMatchObject({ informado: 10, sistema: 10, diferenca: 0 });

      expect(guardAdmin.prodRequests).toEqual([]);
      expect(guardBarista.prodRequests).toEqual([]);
    } finally {
      await ctxAdmin.close();
      await ctxBarista.close();
    }
  });

  test('CT07 (CA07 — Cenário 6): Pedido do cliente via QR Code (aprovação envia para KDS; recusa bloqueia KDS)', async ({ browser, request }) => {
    const ctxCliente = await browser.newContext();
    const ctxBarista = await browser.newContext();
    const ctxCozinha = await browser.newContext();
    const guardCliente = await setupIsolatedContext(ctxCliente);
    const guardBarista = await setupIsolatedContext(ctxBarista);
    const guardCozinha = await setupIsolatedContext(ctxCozinha);

    try {
      const clientePage = await ctxCliente.newPage();
      const pdvPage = await ctxBarista.newPage();
      const kdsPage = await ctxCozinha.newPage();

      await loginPdvOrKds(pdvPage, '/pedidos.html', 'barista@e2e.local');
      await loginPdvOrKds(kdsPage, '/cozinha.html', 'cozinha@e2e.local');

      // 1. Primeiro pedido QR na M-03 -> Aprovação pelo barista
      await clientePage.goto('/cardapio.html?mesa=M-03&token=tok-e2e-m03');
      await expect(clientePage.locator('.btn-pedir-item').first()).toBeVisible();
      await clientePage.locator('.btn-pedir-item').first().click();

      if (await clientePage.locator('#btn-cust-adicionar').isVisible()) {
        await clientePage.locator('#btn-cust-adicionar').click();
      }
      await clientePage.locator('#btn-abrir-carrinho').click();
      await clientePage.locator('#input-cliente-nome').fill('Cliente QR Aprovado');
      await clientePage.locator('#btn-enviar-pedido-cliente').click();
      await expect(clientePage.locator('#modal-tracking-pedido')).toBeVisible();

      // Triagem em pedidos.html -> Aprovar primeiro pedido
      await expect(pdvPage.locator('#btn-abrir-triagem-pedidos-cliente')).toBeVisible();
      await pdvPage.locator('#btn-abrir-triagem-pedidos-cliente').click();
      await expect(pdvPage.locator('#modal-pedidos-cliente-triagem')).toBeVisible();
      await expect(pdvPage.locator('#lista-pedidos-cliente-aguardando')).toContainText('Cliente QR Aprovado');
      await pdvPage.locator('.btn-aprovar-pedido-cliente').first().click();

      // Primeiro pedido deve entrar na fila KDS
      await expect(kdsPage.locator('#list-pendentes .pedido-card')).toHaveCount(1, { timeout: 5000 });
      await expect(kdsPage.locator('#list-pendentes')).toContainText('M-03');

      await pdvPage.locator('#btn-fechar-triagem-footer').click();
      await expect(pdvPage.locator('#modal-pedidos-cliente-triagem')).toBeHidden();

      // Respeitar janela anti-spam de 30s da RPC criar_pedido_cliente na mesma mesa M-03 (CAF-000130 / RF05)
      await querySql(
        request,
        "UPDATE public.pedidos SET created_at = created_at - interval '35 seconds' WHERE mesa_codigo = 'M-03'"
      );

      // 2. Segundo pedido QR na M-03 -> Recusa pelo barista
      await clientePage.goto('/cardapio.html?mesa=M-03&token=tok-e2e-m03');
      await expect(clientePage.locator('.btn-pedir-item').first()).toBeVisible();
      await clientePage.locator('.btn-pedir-item').first().click();
      if (await clientePage.locator('#btn-cust-adicionar').isVisible()) {
        await clientePage.locator('#btn-cust-adicionar').click();
      }
      await clientePage.locator('#btn-abrir-carrinho').click();
      await clientePage.locator('#input-cliente-nome').fill('Cliente QR Recusado');
      await clientePage.locator('#btn-enviar-pedido-cliente').click();
      await expect(clientePage.locator('#modal-tracking-pedido')).toBeVisible();

      await pdvPage.locator('#btn-abrir-triagem-pedidos-cliente').click();
      await expect(pdvPage.locator('#lista-pedidos-cliente-aguardando')).toContainText('Cliente QR Recusado');
      await pdvPage.locator('.btn-recusar-pedido-cliente').first().click();

      await expect(pdvPage.locator('#modal-prompt-sheet')).toBeVisible();
      await pdvPage.locator('#modal-prompt-input').fill('Item indisponível no momento');
      await pdvPage.locator('#modal-prompt-ok').click();

      // Segundo pedido NÃO pode entrar no KDS
      await kdsPage.waitForTimeout(600);
      await expect(kdsPage.locator('#list-pendentes .pedido-card')).toHaveCount(1);

      const pedidosQr = await querySql(
        request,
        'SELECT cliente_nome, status, motivo_cancelamento FROM public.pedidos ORDER BY id ASC'
      );
      expect(pedidosQr).toHaveLength(2);
      expect(pedidosQr[0].status).toBe('pendente');
      expect(pedidosQr[1].status).toBe('cancelado');
      expect(pedidosQr[1].motivo_cancelamento).toBe('Item indisponível no momento');

      expect(guardCliente.prodRequests).toEqual([]);
      expect(guardBarista.prodRequests).toEqual([]);
      expect(guardCozinha.prodRequests).toEqual([]);
    } finally {
      await ctxCliente.close();
      await ctxBarista.close();
      await ctxCozinha.close();
    }
  });

  test('Fluxo Crítico 6: Avaliação pós-pedido pelo cliente e conferência na aba Avaliações do Admin (CAF-000130 / RF03)', async ({
    browser,
    request
  }) => {
    // 1. Criar pedido entregue com pedido_token
    const pedidoRows = await querySql(
      request,
      `INSERT INTO public.pedidos (numero_pedido, mesa_codigo, cliente_nome, status, status_pagamento, total, created_at, pedido_token)
       VALUES (601, 'M-01', 'Cliente E2E Avaliacao', 'concluido', 'pago', 25.00, now(), 'a0000000-0000-0000-0000-000000000001'::uuid)
       RETURNING id, pedido_token`
    );
    const token = pedidoRows[0].pedido_token;

    const ctxCliente = await browser.newContext();
    const ctxAdmin = await browser.newContext();
    const guardCliente = await setupIsolatedContext(ctxCliente);
    const guardAdmin = await setupIsolatedContext(ctxAdmin);

    try {
      const clientePage = await ctxCliente.newPage();
      await clientePage.goto(`/avaliar.html?token=${token}`);

      // Verifica carregamento sem "Serviço indisponível"
      await expect(clientePage.locator('#eval-form')).toBeVisible({ timeout: 5000 });

      // Seleciona 5 estrelas para produtos e 5 para atendimento
      await clientePage.locator('#stars-produto button').nth(4).click();
      await clientePage.locator('#stars-atendimento button').nth(4).click();

      // Preenche comentário e envia
      await clientePage.locator('#eval-comentario').fill('Atendimento impecável no E2E!');
      await clientePage.locator('#btn-submit-eval').click();

      // Sucesso na tela
      await expect(clientePage.locator('#state-success')).toBeVisible({ timeout: 5000 });
      await expect(clientePage.locator('#success-title')).toContainText('Muito obrigado!');

      // 2. Admin confere na aba Avaliações
      const adminPage = await ctxAdmin.newPage();
      await loginAdmin(adminPage);

      await adminPage.locator('#nav-avaliacoes').click();
      await expect(adminPage.locator('#page-avaliacoes')).toBeVisible();

      // Confere lista de comentários
      await expect(adminPage.locator('#aval-lista-tbody')).toContainText('Atendimento impecável no E2E!');
      await expect(adminPage.locator('#aval-lista-tbody')).toContainText('Cliente E2E Avaliacao');

      expect(guardCliente.prodRequests).toEqual([]);
      expect(guardAdmin.prodRequests).toEqual([]);
    } finally {
      await ctxCliente.close();
      await ctxAdmin.close();
    }
  });
});
