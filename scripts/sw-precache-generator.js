import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * CAF-000118 — Gerador Automático de Precache e Versionamento para Service Worker (PWA)
 * 
 * Regras:
 * - CA01 / CA02: Hash determinístico baseado no conteúdo dos arquivos gerados no build.
 * - CA03: Todo arquivo referenciado existe em dist/; inclui HTML, CSS, JS de PDV, KDS, Totem, Retirada e Admin.
 * - RNF02: Tamanho total do precache estritamente abaixo de 5 MB (sem imagens pesadas de galeria/decorativas).
 */

const MAX_PRECACHE_BYTES = 5 * 1024 * 1024; // 5 MB (RNF02)

/**
 * Determina se um arquivo relativo ao dist/ deve fazer parte do precache do Service Worker.
 * @param {string} relPath 
 * @returns {boolean}
 */
export function isPrecacheAsset(relPath) {
  const norm = relPath.replace(/\\/g, '/');

  // Arquivos do sistema ou de deploy que NÃO devem entrar em cache
  if (
    norm === 'sw.js' ||
    norm === 'CNAME' ||
    norm === 'robots.txt' ||
    norm === 'sitemap.xml' ||
    norm.endsWith('.map') ||
    norm.includes('.DS_Store') ||
    norm.includes('images_backup/')
  ) {
    return false;
  }

  // Excluir imagens pesadas da galeria, decorações e fotos (RNF02: manter precache < 5MB)
  if (
    norm.includes('assets/arte-') ||
    norm.includes('assets/galeria-') ||
    norm.includes('sobre-cafe') ||
    norm.includes('mapa-estatico') ||
    norm.includes('Prancheta')
  ) {
    return false;
  }

  // Inclusões essenciais
  const isHtml = norm.endsWith('.html');
  const isJs = norm.endsWith('.js');
  const isCss = norm.endsWith('.css');
  const isManifest = norm === 'manifest.json' || norm.startsWith('assets/manifest-');
  const isAudio = norm.includes('audio/') || norm.endsWith('.wav');
  const isEssentialIcon =
    norm.includes('favicon') ||
    norm.includes('icon-192') ||
    norm.includes('icon-512') ||
    norm.includes('logo-cafeteria');

  return isHtml || isJs || isCss || isManifest || isAudio || isEssentialIcon;
}

/**
 * Varre recursivamente um diretório e retorna lista de arquivos com caminhos relativos e tamanhos.
 * @param {string} dir 
 * @param {string} baseDir 
 * @returns {Array<{ relativePath: string, fullPath: string, size: number }>}
 */
export function scanDirectory(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanDirectory(fullPath, baseDir));
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ relativePath, fullPath, size: stat.size });
    }
  }
  return results;
}

/**
 * Computa um hash SHA-256 determinístico consolidado a partir do conteúdo dos arquivos.
 * @param {Array<{ relativePath: string, content: Buffer|string }>} filesWithContent 
 * @returns {string} Hash determinístico no formato 'v-[10chars]'
 */
export function computePrecacheHash(filesWithContent) {
  // Ordenar alfabeticamente pelo caminho relativo para garantir determinismo absoluto
  const sorted = [...filesWithContent].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const hasher = crypto.createHash('sha256');
  for (const item of sorted) {
    hasher.update(`path:${item.relativePath}\n`);
    hasher.update(Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content, 'utf8'));
    hasher.update('\n---\n');
  }

  const hex = hasher.digest('hex');
  return `v-${hex.slice(0, 10)}`;
}

/**
 * Monta a lista formatada de URLs para STATIC_ASSETS no Service Worker.
 * @param {string[]} relativePaths 
 * @returns {string[]} Lista de URLs com '/' inicial, garantindo '/' na raiz.
 */
export function buildStaticAssetsList(relativePaths) {
  const assetSet = new Set();
  assetSet.add('/'); // Raiz sempre presente

  for (const p of relativePaths) {
    const clean = p.replace(/^\/+/, '');
    assetSet.add(`/${clean}`);
  }

  // Ordenar para consistência
  return Array.from(assetSet).sort();
}

/**
 * Gera ou injeta a lista de precache e a versão no sw.js e gera version.json.
 * @param {string} distDir 
 * @param {object} options
 * @returns {Promise<{ version: string, totalSizeBytes: number, assetsCount: number, assetsList: string[] }>}
 */
export async function generatePrecache(distDir, options = {}) {
  const allFiles = scanDirectory(distDir);
  const precacheEntries = allFiles.filter(f => isPrecacheAsset(f.relativePath));

  let totalSizeBytes = 0;
  const filesWithContent = [];

  for (const entry of precacheEntries) {
    const content = fs.readFileSync(entry.fullPath);
    totalSizeBytes += entry.size;
    filesWithContent.push({
      relativePath: entry.relativePath,
      content
    });
  }

  if (totalSizeBytes > MAX_PRECACHE_BYTES && !options.allowLargePrecache) {
    console.warn(`[SW Precache] ATENÇÃO: Precache (${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB) excedeu o limite recomendado de 5 MB.`);
  }

  // Gera a versão com hash do conteúdo
  const version = computePrecacheHash(filesWithContent);
  const assetsList = buildStaticAssetsList(precacheEntries.map(e => e.relativePath));

  // Injetar no sw.js dentro de dist/
  const swDestPath = path.join(distDir, 'sw.js');
  if (fs.existsSync(swDestPath)) {
    let swContent = fs.readFileSync(swDestPath, 'utf8');

    // Substituir CACHE_VERSION
    swContent = swContent.replace(
      /const\s+CACHE_VERSION\s*=\s*['"][^'"]*['"];?/,
      `const CACHE_VERSION = '${version}';`
    );

    // Substituir STATIC_ASSETS
    const assetsFormatted = JSON.stringify(assetsList, null, 2);
    swContent = swContent.replace(
      /const\s+STATIC_ASSETS\s*=\s*\[[\s\S]*?\];/,
      `const STATIC_ASSETS = ${assetsFormatted};`
    );

    fs.writeFileSync(swDestPath, swContent, 'utf8');
  }

  // Gerar dist/version.json para consumo da aplicação e admin
  const versionInfo = {
    version,
    buildTime: new Date().toISOString(),
    filesCount: assetsList.length,
    totalSizeBytes
  };
  fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf8');

  return {
    version,
    totalSizeBytes,
    assetsCount: assetsList.length,
    assetsList
  };
}

