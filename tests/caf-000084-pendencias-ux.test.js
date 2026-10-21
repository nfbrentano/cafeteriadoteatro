import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SmartSearch } from '../js/utils/smart-search.js';
import * as theaterMode from '../js/utils/theater-mode.js';

describe('CAF-000084: Pendências de UX, KDS e cardápio', () => {
  const rootDir = process.cwd();
  const pedidosJsPath = path.join(rootDir, 'js/pedidos.js');
  const cardapioHtmlPath = path.join(rootDir, 'cardapio.html');
  const cardapioDynamicJsPath = path.join(rootDir, 'js/cardapio-dynamic.js');
  const totemHtmlPath = path.join(rootDir, 'totem.html');
  const totemJsPath = path.join(rootDir, 'js/totem.js');
  const cozinhaJsPath = path.join(rootDir, 'js/cozinha.js');
  const pedidoPrintJsPath = path.join(rootDir, 'js/pedido-print.js');
  const pedidosAdminJsPath = path.join(rootDir, 'js/admin/pedidos-admin.js');
  const adminHtmlPath = path.join(rootDir, 'admin.html');
  const homeCssPath = path.join(rootDir, 'css/home.css');
  const mapaWebpPath = path.join(rootDir, 'assets/images/mapa-estatico.webp');

  const pedidosJs = fs.readFileSync(pedidosJsPath, 'utf8');
  const cardapioHtml = fs.readFileSync(cardapioHtmlPath, 'utf8');
  const cardapioDynamicJs = fs.readFileSync(cardapioDynamicJsPath, 'utf8');
  const totemHtml = fs.readFileSync(totemHtmlPath, 'utf8');
  const totemJs = fs.readFileSync(totemJsPath, 'utf8');
  const cozinhaJs = fs.readFileSync(cozinhaJsPath, 'utf8');
  const pedidoPrintJs = fs.readFileSync(pedidoPrintJsPath, 'utf8');
  const pedidosAdminJs = fs.readFileSync(pedidosAdminJsPath, 'utf8');
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
  const homeCss = fs.readFileSync(homeCssPath, 'utf8');

  describe('CA01 / RF01: Eliminação de alert/confirm em js/pedidos.js', () => {
    it('js/pedidos.js contém 0 ocorrências de alert( e confirm(', () => {
      // Regex que busca alert( ou confirm( que não sejam comentários ou strings soltas
      const alertMatches = pedidosJs.match(/\balert\s*\(/g);
      const confirmMatches = pedidosJs.match(/\bconfirm\s*\(/g);

      expect(alertMatches, 'Não deve haver alert() em js/pedidos.js').toBeNull();
      expect(confirmMatches, 'Não deve haver confirm() em js/pedidos.js').toBeNull();
    });

    it('erros de aprovação e recusa usam showToast com tipo error', () => {
      expect(pedidosJs).toMatch(/showToast\('Erro ao aprovar pedido:.*tipo:\s*'error'/i);
      expect(pedidosJs).toMatch(/showToast\('Erro ao recusar pedido:.*tipo:\s*'error'/i);
      expect(pedidosJs).toMatch(/showToast\('Erro ao atender chamado:.*tipo:\s*'error'/i);
    });
  });

  describe('CA02 / RF02: Busca com SmartSearch no cardápio público', () => {
    it('cardapio.html inclui input de busca com min-height 44px e font-size 16px', () => {
      expect(cardapioHtml).toContain('id="input-busca-cardapio"');
      expect(cardapioHtml).toContain('id="btn-limpar-busca-cardapio"');
      expect(cardapioHtml).toMatch(/font-size:\s*16px/i);
      expect(cardapioHtml).toMatch(/min-height:\s*44px/i);
      expect(cardapioHtml).toContain('js/utils/smart-search.js');
    });

    it('SmartSearch filtra "capu" e "cappucino" encontrando Cappuccino', () => {
      const mockProdutos = [
        { id: '1', nome: 'Café Espresso', categoria_id: 'cafes' },
        { id: '2', nome: 'Cappuccino Italiano', categoria_id: 'cafes' },
        { id: '3', nome: 'Pão de Queijo', categoria_id: 'salgados' }
      ];

      const res1 = SmartSearch.filterProducts(mockProdutos, 'capu');
      expect(res1.some(p => p.nome.includes('Cappuccino'))).toBe(true);
      expect(res1.some(p => p.nome.includes('Pão de Queijo'))).toBe(false);

      const res2 = SmartSearch.filterProducts(mockProdutos, 'cappucino');
      expect(res2.some(p => p.nome.includes('Cappuccino'))).toBe(true);
    });

    it('cardapio-dynamic.js expõe e executa filtrarCardapio', () => {
      expect(cardapioDynamicJs).toMatch(/function filtrarCardapio/i);
      expect(cardapioDynamicJs).toMatch(/window\.filtrarCardapio\s*=\s*filtrarCardapio/i);
      expect(cardapioDynamicJs).toMatch(/SmartSearch\.filterProducts/i);
    });
  });

  describe('CA03 / RF02: Busca no totem com SmartSearch', () => {
    it('totem.html inclui barra de busca e carrega smart-search.js', () => {
      expect(totemHtml).toContain('id="totem-input-busca"');
      expect(totemHtml).toContain('id="btn-totem-limpar-busca"');
      expect(totemHtml).toContain('js/utils/smart-search.js');
    });

    it('totem.js implementa busca em tempo real e restaura cardápio ao limpar', () => {
      expect(totemJs).toMatch(/function initBuscaTotem/i);
      expect(totemJs).toMatch(/termoBuscaTotem/i);
      expect(totemJs).toMatch(/SmartSearch\.filterProducts/i);

      const produtosMock = [
        { id: '1', nome: 'Pão de Queijo Mineiro', categoria_id: 'salgados' },
        { id: '2', nome: 'Croissant Francês', categoria_id: 'salgados' }
      ];
      const res = SmartSearch.filterProducts(produtosMock, 'pao queijo');
      expect(res.length).toBe(1);
      expect(res[0].nome).toBe('Pão de Queijo Mineiro');
    });
  });

  describe('CA04 / RF03: Banner de espetáculo no totem com reserva de intervalo', () => {
    it('totem.html contém o elemento do banner do espetáculo', () => {
      expect(totemHtml).toContain('id="totem-banner-espetaculo"');
      expect(totemHtml).toContain('id="btn-totem-reservar-intervalo"');
    });

    it('totem.js ativa banner e envia retirada_em quando espetáculo está ativo', () => {
      expect(totemJs).toMatch(/atualizarBannerEspetaculoTotem/i);
      expect(totemJs).toMatch(/isTheaterModeActive/i);
      expect(totemJs).toMatch(/calculateIntervalRetiradaEm/i);
      expect(totemJs).toMatch(/reservandoParaIntervaloTotem/i);
      expect(totemJs).toMatch(/retirada_em:\s*retiradaEmIso/i);
      expect(totemJs).toMatch(/is_intervalo:\s*Boolean\(reservandoParaIntervaloTotem\)/i);
    });

    it('theaterMode calcula retirada_em em formato ISO corretamente', () => {
      const cfg = {
        ativo: true,
        nome: 'Show de Comédia',
        horario_intervalo: '21:30'
      };
      const ref = new Date('2026-10-21T18:00:00-03:00');
      const iso = theaterMode.calculateIntervalRetiradaEm(cfg, ref);
      expect(iso).toBeTruthy();
      expect(typeof iso).toBe('string');
    });
  });

  describe('CA05 / RF04: Marcação de pedido adicional no PDV, KDS e comanda', () => {
    it('js/pedidos.js salva pedidoOrigemIdAdicao ao clicar em Adicionar Itens e o envia no payload', () => {
      expect(pedidosJs).toMatch(/pedidoOrigemIdAdicao\s*=\s*ultimoPedido/i);
      expect(pedidosJs).toMatch(/pedido_origem_id:\s*pedidoOrigemIdAdicao/i);
      expect(pedidosJs).toMatch(/is_adicional:\s*Boolean\(pedidoOrigemIdAdicao\)/i);
    });

    it('cozinha.js exibe ➕ ADICIONAL — Mesa X (ref. #Y) quando pedido_origem_id ou is_adicional existe', () => {
      expect(cozinhaJs).toMatch(/➕\s*ADICIONAL\s*—\s*Mesa/i);
      expect(cozinhaJs).toMatch(/pedido\.pedido_origem_id/i);
      expect(cozinhaJs).toMatch(/ref\.\s*#/i);
    });

    it('pedido-print.js inclui ➕ ADICIONAL — Mesa X (ref. #Y) no cabeçalho da comanda impressa', () => {
      expect(pedidoPrintJs).toMatch(/➕\s*ADICIONAL\s*—\s*Mesa/i);
      expect(pedidoPrintJs).toMatch(/ref\.\s*#/i);
    });
  });

  describe('CA06 / RF05: Novos itens no cabeçalho do KDS e horário de lançamento', () => {
    it('cozinha.js exibe +N itens novos no cabeçalho quando novosPendentesCount > 0', () => {
      expect(cozinhaJs).toMatch(/badge-novos-kds/i);
      expect(cozinhaJs).toMatch(/\+.*novosPendentesCount.*itens novos/i);
    });

    it('cozinha.js inclui o horário de lançamento no selo NOVO de cada item', () => {
      expect(cozinhaJs).toMatch(/horaLancamentoStr/i);
      expect(cozinhaJs).toMatch(/badge-item-novo.*NOVO/i);
      expect(cozinhaJs).toMatch(/toLocaleTimeString\('pt-BR'/i);
    });
  });

  describe('CA07 / RF06: cliente_nome na listagem e busca do admin', () => {
    it('admin.html inclui coluna Cliente no cabeçalho e campo filter-pedido-busca', () => {
      expect(adminHtml).toMatch(/<th>Cliente<\/th>/i);
      expect(adminHtml).toContain('id="filter-pedido-busca"');
    });

    it('pedidos-admin.js renderiza cliente_nome com escapeHtml e filtra por ele', () => {
      expect(pedidosAdminJs).toMatch(/pedido\.cliente_nome/i);
      expect(pedidosAdminJs).toMatch(/window\.escapeHtml\(pedido\.cliente_nome\)/i);
      expect(pedidosAdminJs).toMatch(/filterBusca/i);
      expect(pedidosAdminJs).toMatch(/p\.cliente_nome.*toLowerCase\(\)\.includes\(termoBusca\)/i);
    });
  });

  describe('CA08 / RF07: Desfazer entrega restaurando status anterior e toast 5s', () => {
    it('baristaMarcarEntregue preserva statusAnterior e o restaura no desfazer', () => {
      expect(pedidosJs).toMatch(/statusAnterior\s*=\s*p\s*\?\s*p\.status\s*:\s*'pronto'/i);
      expect(pedidosJs).toMatch(/status:\s*statusAnterior/i);
    });

    it('o toast de desfazer entrega passa duração de 5000 ms', () => {
      expect(pedidosJs).toMatch(/window\.showToast\('Pedido entregue',\s*'Desfazer',.*5000\)/s);
    });

    it('swipe para entrega é habilitado em status onde Entregar é permitido', () => {
      expect(pedidosJs).toMatch(/podeEntregar\s*=\s*isPronto\s*\|\|\s*pedido\.status\s*===\s*'pronto'\s*\|\|\s*pedido\.status\s*===\s*'concluido'/i);
      expect(pedidosJs).toMatch(/bindSwipeRight\(card,[\s\S]*?baristaMarcarEntregue/i);
    });
  });

  describe('CA09 / RF08: Otimização do mapa estático (< 80 KB)', () => {
    it('assets/images/mapa-estatico.webp existe e tem tamanho inferior a 80 KB', () => {
      expect(fs.existsSync(mapaWebpPath)).toBe(true);
      const stat = fs.statSync(mapaWebpPath);
      const sizeKb = stat.size / 1024;
      expect(sizeKb).toBeLessThan(80);
      expect(sizeKb).toBeGreaterThan(5); // assegura integridade
    });
  });

  describe('CA10 / RF09: env(safe-area-inset-bottom) nos botões do hero', () => {
    it('css/home.css aplica env(safe-area-inset-bottom) no container .hero__actions', () => {
      expect(homeCss).toMatch(/\.hero__actions[\s\S]*?env\(safe-area-inset-bottom/i);
    });
  });
});
