import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { IDBFactory } from 'fake-indexeddb';
import viteConfig from '../vite.config.js';
import vitestConfig from '../vitest.config.js';
import '../js/db.js';
import {
  IDB_NAME,
  IDB_STORE,
  openOfflineDB,
  dbSalvarPedidoOffline,
  dbObterFilaOffline,
  dbRemoverPedidoOffline,
  dbAtualizarStatusPedidoOffline
} from '../js/utils/offline-queue.js';

function parseSemver(versionStr) {
  const clean = String(versionStr || '').replace(/^[\^~>=<]+/, '').trim();
  const [major, minor, patch] = clean.split('.').map(n => parseInt(n, 10));
  return { major: major || 0, minor: minor || 0, patch: patch || 0, raw: clean };
}

function isAtLeast(versionStr, minMajor, minMinor, minPatch) {
  const v = parseSemver(versionStr);
  if (v.major !== minMajor) return v.major > minMajor;
  if (v.minor !== minMinor) return v.minor > minMinor;
  return v.patch >= minPatch;
}

describe('CAF-000114 — Atualização de Dependências (vite, vitest, @vitest/coverage-v8, fake-indexeddb)', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const vitestPkg = JSON.parse(fs.readFileSync(path.resolve('node_modules/vitest/package.json'), 'utf8'));
  const coveragePkg = JSON.parse(fs.readFileSync(path.resolve('node_modules/@vitest/coverage-v8/package.json'), 'utf8'));
  const vitePkg = JSON.parse(fs.readFileSync(path.resolve('node_modules/vite/package.json'), 'utf8'));
  const fakeIdbPkg = JSON.parse(fs.readFileSync(path.resolve('node_modules/fake-indexeddb/package.json'), 'utf8'));

  describe('CA01: Paridade e atualização de vitest e @vitest/coverage-v8 (>= 5.1.0)', () => {
    it('caminho feliz: vitest e @vitest/coverage-v8 estão instalados em versão >= 5.1.0 e em paridade exata', () => {
      expect(isAtLeast(vitestPkg.version, 5, 1, 0)).toBe(true);
      expect(isAtLeast(coveragePkg.version, 5, 1, 0)).toBe(true);
      expect(vitestPkg.version).toBe(coveragePkg.version);
    });

    it('integração real com vitest.config.js: configuração de cobertura usa provedor v8 e thresholds reais', () => {
      expect(vitestConfig.test).toBeDefined();
      expect(vitestConfig.test.environment).toBe('happy-dom');
      expect(vitestConfig.test.coverage.provider).toBe('v8');
      expect(vitestConfig.test.coverage.thresholds['js/utils/**']).toEqual({
        lines: 85,
        branches: 65,
        functions: 85,
        statements: 85
      });
    });

    it('caso negativo: vitest e @vitest/coverage-v8 não permanecem na versão antiga 5.0.5', () => {
      expect(vitestPkg.version).not.toBe('5.0.5');
      expect(coveragePkg.version).not.toBe('5.0.5');
      expect(rootPkg.devDependencies['vitest']).not.toBe('^5.0.5');
      expect(rootPkg.devDependencies['@vitest/coverage-v8']).not.toBe('^5.0.5');
    });
  });

  describe('CA02: Atualização do Vite (>= 8.3.5) e validação da configuração real de build', () => {
    it('caminho feliz: vite instalado em versão >= 8.3.5 e carrega entradas multi-página em vite.config.js', () => {
      expect(isAtLeast(vitePkg.version, 8, 3, 5)).toBe(true);
      expect(viteConfig.build.outDir).toBe('dist');

      const inputs = viteConfig.build.rollupOptions.input;
      const expectedPages = ['main', 'cardapio', 'admin', 'pedidos', 'cozinha', 'retirada', 'totem', 'avaliar', 'notfound'];
      expect(Object.keys(inputs)).toEqual(expectedPages);

      for (const [, htmlPath] of Object.entries(inputs)) {
        expect(fs.existsSync(htmlPath), `Arquivo de entrada ${htmlPath} deve existir`).toBe(true);
      }
    });

    it('borda/transformação real: inlineCssPlugin de vite.config.js substitui <link> por <style> apenas quando aplicável', () => {
      const inlinePlugin = viteConfig.plugins.find(p => p && p.name === 'inline-css-plugin');
      expect(inlinePlugin).toBeDefined();

      // Caso limite sem bundle no contexto
      const rawHtml = '<html><head><link rel="stylesheet" href="/assets/style-123.css"></head></html>';
      expect(inlinePlugin.transformIndexHtml(rawHtml, null)).toBe(rawHtml);

      // Caminho feliz com bundle CSS
      const transformed = inlinePlugin.transformIndexHtml(rawHtml, {
        bundle: {
          'assets/style-123.css': {
            type: 'asset',
            source: 'body { color: #111; }'
          }
        }
      });
      expect(transformed).toContain('<style>body { color: #111; }</style>');
      expect(transformed).not.toContain('<link rel="stylesheet"');
    });

    it('caso negativo: vite não permanece na versão antiga 8.3.4', () => {
      expect(vitePkg.version).not.toBe('8.3.4');
      expect(rootPkg.devDependencies['vite']).not.toBe('^8.3.4');
    });
  });

  describe('CA03: Atualização do fake-indexeddb (>= 6.2.7) integrado ao módulo real js/utils/offline-queue.js e js/db.js', () => {
    let customIdb;

    beforeEach(() => {
      customIdb = new IDBFactory();
      localStorage.clear();
    });

    it('caminho feliz: fake-indexeddb >= 6.2.7 cria banco real, persiste, atualiza, ordena e remove pedidos na fila offline', async () => {
      expect(isAtLeast(fakeIdbPkg.version, 6, 2, 7)).toBe(true);

      const db = await openOfflineDB(customIdb);
      expect(db).toBeTruthy();
      expect(db.name).toBe(IDB_NAME);
      expect(db.objectStoreNames.contains(IDB_STORE)).toBe(true);

      const pTarde = {
        client_id: 'cli-002',
        mesa: '05',
        created_at: '2026-11-03T12:10:00.000Z',
        status: 'pendente_sync'
      };
      const pCedo = {
        client_id: 'cli-001',
        mesa: '02',
        created_at: '2026-11-03T12:00:00.000Z',
        status: 'pendente_sync'
      };

      expect(await dbSalvarPedidoOffline(pTarde, { db })).toBe(true);
      expect(await dbSalvarPedidoOffline(pCedo, { db })).toBe(true);

      const fila = await dbObterFilaOffline({ db });
      expect(fila.map(p => p.client_id)).toEqual(['cli-001', 'cli-002']);

      // Atualiza status e erro
      const updated = await dbAtualizarStatusPedidoOffline('cli-001', 'erro_sync', 'Timeout de rede', { db });
      expect(updated).toBe(true);

      const filaAtualizada = await dbObterFilaOffline({ db });
      expect(filaAtualizada[0].status).toBe('erro_sync');
      expect(filaAtualizada[0].ultimo_erro).toBe('Timeout de rede');

      // Remove pedido sincronizado
      expect(await dbRemoverPedidoOffline('cli-001', { db })).toBe(true);
      const filaRestante = await dbObterFilaOffline({ db });
      expect(filaRestante.map(p => p.client_id)).toEqual(['cli-002']);

      db.close();
    });

    it('casos limites e negativos: rejeita payloads inválidos, IDs vazios e atualizações de pedidos inexistentes', async () => {
      const db = await openOfflineDB(customIdb);

      // Sem client_id
      expect(await dbSalvarPedidoOffline(null, { db })).toBe(false);
      expect(await dbSalvarPedidoOffline({ mesa: '10' }, { db })).toBe(false);

      // Atualizar ou remover ID inexistente / nulo
      expect(await dbAtualizarStatusPedidoOffline('', 'sincronizado', null, { db })).toBe(false);
      expect(await dbAtualizarStatusPedidoOffline('id-inexistente', 'sincronizado', null, { db })).toBe(false);
      expect(await dbRemoverPedidoOffline('', { db })).toBe(false);

      // Cache do db.js rejeita chaves não listadas em ALLOWED_KEYS
      const cafeteriaDB = window.cafeteriaDB;
      expect(cafeteriaDB).toBeDefined();
      cafeteriaDB.cache.set('chave_invalida', { foo: 'bar' });
      expect(cafeteriaDB.cache.get('chave_invalida')).toBeNull();

      db.close();
    });

    it('caso negativo: fake-indexeddb não permanece na versão antiga 6.2.6', () => {
      expect(fakeIdbPkg.version).not.toBe('6.2.6');
      expect(rootPkg.devDependencies['fake-indexeddb']).not.toBe('^6.2.6');
    });
  });

  describe('CA04: Integridade do package.json e lockfile após atualização', () => {
    it('package-lock.json reflete exatamente as novas versões instaladas sem referências às versões antigas na raiz', () => {
      const lockPkg = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
      const rootEntry = lockPkg.packages[''];
      expect(rootEntry.devDependencies['@vitest/coverage-v8']).toBe('^5.1.0');
      expect(rootEntry.devDependencies['fake-indexeddb']).toBe('^6.2.7');
      expect(rootEntry.devDependencies['vite']).toBe('^8.3.5');
      expect(rootEntry.devDependencies['vitest']).toBe('^5.1.0');

      expect(lockPkg.packages['node_modules/@vitest/coverage-v8'].version).toBe(coveragePkg.version);
      expect(lockPkg.packages['node_modules/fake-indexeddb'].version).toBe(fakeIdbPkg.version);
      expect(lockPkg.packages['node_modules/vite'].version).toBe(vitePkg.version);
      expect(lockPkg.packages['node_modules/vitest'].version).toBe(vitestPkg.version);
    });
  });
});
