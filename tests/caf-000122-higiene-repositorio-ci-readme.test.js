import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createPageHarness, lerAdminHtmlCompleto } from './helpers/page-harness.js';
import { generatePrecache, isPrecacheAsset } from '../scripts/sw-precache-generator.js';
import viteConfig from '../vite.config.js';

const ROOT_DIR = process.cwd();

function listarArquivosPorExtensao(dir, exts, baseDir = ROOT_DIR) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listarArquivosPorExtensao(fullPath, exts, baseDir));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results.sort();
}

function extrairBlocoRunContador(ymlContent) {
  const marker = '        run: |\n';
  const idx = ymlContent.indexOf(marker);
  if (idx === -1) {
    throw new Error('Bloco run: | não encontrado em contador_diario.yml');
  }
  return ymlContent
    .slice(idx + marker.length)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

describe('CAF-000122: Higiene do Repositório, Node do CI e README', () => {
  const tempDirs = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  // =========================================================================
  // CT01 / CA01 / RNF01: Todas as imagens e áudios referenciados existem
  // =========================================================================
  describe('CT01 / CA01 / RNF01: Integridade de Assets Referenciados', () => {
    it('todas as referências assets/(images|icons|audio)/... em HTML, CSS, JS e manifest.json existem no disco e em dist/', () => {
      const filesToScan = [
        ...fs.readdirSync(ROOT_DIR).filter((f) => f.endsWith('.html')),
        ...listarArquivosPorExtensao(path.join(ROOT_DIR, 'admin/partials'), ['.html']),
        ...listarArquivosPorExtensao(path.join(ROOT_DIR, 'css'), ['.css']),
        ...listarArquivosPorExtensao(path.join(ROOT_DIR, 'js'), ['.js']),
        'manifest.json'
      ];

      const assetRefs = new Set();
      const assetRegex = /assets\/(?:images|icons|audio)\/[A-Za-z0-9_.-]+\.(?:webp|png|jpg|jpeg|wav|svg)/gi;

      for (const relFile of filesToScan) {
        const content = fs.readFileSync(path.join(ROOT_DIR, relFile), 'utf-8');
        expect(content, `${relFile} não deve referenciar images_backup`).not.toContain('images_backup');
        expect(content, `${relFile} não deve referenciar Prancheta`).not.toContain('Prancheta');

        const matches = content.match(assetRegex) || [];
        for (const match of matches) {
          assetRefs.add(match);
        }
      }

      expect(assetRefs.size).toBeGreaterThanOrEqual(20);

      const distDir = path.join(ROOT_DIR, 'dist');
      const hasDist = fs.existsSync(distDir);

      for (const relAsset of assetRefs) {
        expect(fs.existsSync(path.join(ROOT_DIR, relAsset)), `Asset ausente na origem: ${relAsset}`).toBe(true);
        if (hasDist) {
          expect(fs.existsSync(path.join(distDir, relAsset)), `Asset ausente em dist/: ${relAsset}`).toBe(true);
        }
      }
    });

    it('renderiza index.html e cardapio.html no harness real com todas as imagens presentes no disco', () => {
      for (const htmlFile of ['index.html', 'cardapio.html']) {
        const harness = createPageHarness(htmlFile);
        try {
          const imgs = Array.from(harness.document.querySelectorAll('img[src]'));
          expect(imgs.length).toBeGreaterThan(0);

          for (const img of imgs) {
            const src = img.getAttribute('src');
            if (!src || src.startsWith('data:') || src.startsWith('http')) continue;
            expect(fs.existsSync(path.join(ROOT_DIR, src)), `<img src="${src}"> em ${htmlFile} não existe`).toBe(true);
          }

          if (htmlFile === 'index.html') {
            const heroImgs = Array.from(harness.document.querySelectorAll('.hero-carousel__img'));
            expect(heroImgs.length).toBeGreaterThanOrEqual(8);
            for (const el of heroImgs) {
              const styleAttr = el.getAttribute('style') || '';
              const m = styleAttr.match(/url\(['"]?(assets\/[^'")]+)['"]?\)/i);
              expect(m, `Hero carousel sem url de imagem válida: ${styleAttr}`).not.toBeNull();
              expect(fs.existsSync(path.join(ROOT_DIR, m[1])), `Hero image ausente: ${m[1]}`).toBe(true);
            }
          }
        } finally {
          harness.cleanup();
        }
      }

      const adminHtml = lerAdminHtmlCompleto(ROOT_DIR);
      expect(adminHtml).not.toContain('images_backup');
    });
  });

  // =========================================================================
  // CT02 / CA01: Configuração Vite + dist/assets sem images_backup
  // =========================================================================
  describe('CT02 / CA01: Build e Configuração Vite sem Backup de Imagens', () => {
    it('viteStaticCopy lista apenas subpastas ativas de assets (audio, icons, images) e nunca a pasta assets inteira', () => {
      const plugins = viteConfig.plugins.flat();
      expect(plugins.length).toBeGreaterThan(0);

      const viteConfigSrc = fs.readFileSync(path.join(ROOT_DIR, 'vite.config.js'), 'utf-8');
      expect(viteConfigSrc).toContain("src: ['assets/audio', 'assets/icons', 'assets/images']");
      expect(viteConfigSrc).not.toMatch(/\{\s*src:\s*'assets'\s*,\s*dest:\s*''\s*\}/);
      expect(fs.existsSync(path.join(ROOT_DIR, 'assets/images_backup'))).toBe(false);
    });

    it('dist/assets não contém images_backup nem Prancheta e preserva audio/icons/images após npm run build', async () => {
      const distDir = path.join(ROOT_DIR, 'dist');
      expect(fs.existsSync(distDir), 'Execute npm run build antes dos testes').toBe(true);

      const distAssetsDir = path.join(distDir, 'assets');
      expect(fs.existsSync(distAssetsDir)).toBe(true);
      expect(fs.existsSync(path.join(distAssetsDir, 'images_backup'))).toBe(false);
      expect(fs.existsSync(path.join(distAssetsDir, 'assets'))).toBe(false);
      expect(fs.existsSync(path.join(distAssetsDir, 'audio'))).toBe(true);
      expect(fs.existsSync(path.join(distAssetsDir, 'icons'))).toBe(true);
      expect(fs.existsSync(path.join(distAssetsDir, 'images'))).toBe(true);

      const entriesInImages = fs.readdirSync(path.join(distAssetsDir, 'images'));
      expect(entriesInImages.some((name) => name.includes('Prancheta'))).toBe(false);
      expect(entriesInImages).toContain('logo-cafeteria-do-teatro.webp');

      const precache = await generatePrecache(distDir);
      expect(precache.assetsList.some((a) => a.includes('images_backup') || a.includes('Prancheta'))).toBe(false);
      expect(isPrecacheAsset('assets/images_backup/hero-bg.png')).toBe(false);
    });
  });

  // =========================================================================
  // CT03 / CA02 / CA03 / RNF02: Git limpo e .gitignore atualizado
  // =========================================================================
  describe('CT03 / CA02 / CA03 / RNF02: Arquivos Removidos do Git e Ignorados', () => {
    it('git ls-files não rastreia images_backup, supabase/.temp, rascunhos da raiz nem Prancheta', () => {
      const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf-8', cwd: ROOT_DIR })
        .split('\n')
        .filter(Boolean);

      const forbiddenExact = new Set([
        'scratch-hero.html',
        'replace_hero.py',
        'produtos_cafeteria.csv',
        'produtos_cafeteria.xls'
      ]);

      for (const file of tracked) {
        expect(file.startsWith('assets/images_backup/'), `Backup rastreado: ${file}`).toBe(false);
        expect(file.startsWith('supabase/.temp/'), `Temp do Supabase CLI rastreado: ${file}`).toBe(false);
        expect(forbiddenExact.has(file), `Arquivo de rascunho rastreado na raiz: ${file}`).toBe(false);
        expect(file.includes('Prancheta'), `Imagem de exportação rastreada: ${file}`).toBe(false);
        expect(file.endsWith('.DS_Store'), `.DS_Store rastreado: ${file}`).toBe(false);
      }
    });

    it('.gitignore ignora supabase/.temp/ e assets/images_backup/ no git check-ignore', () => {
      const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('supabase/.temp/');
      expect(gitignore).toContain('assets/images_backup/');

      const checkTemp = spawnSync('git', ['check-ignore', '-q', 'supabase/.temp/linked-project.json'], {
        cwd: ROOT_DIR
      });
      expect(checkTemp.status).toBe(0);

      const checkBackup = spawnSync('git', ['check-ignore', '-q', 'assets/images_backup/hero-bg.png'], {
        cwd: ROOT_DIR
      });
      expect(checkBackup.status).toBe(0);
    });
  });

  // =========================================================================
  // CT04 / CA04: Alinhamento único de versão do Node (.nvmrc, engines e CI)
  // =========================================================================
  describe('CT04 / CA04: Versão Única do Node.js entre Local e CI', () => {
    it('.nvmrc, package.json engines.node e workflows usam Node 24 via node-version-file', () => {
      const nvmrc = fs.readFileSync(path.join(ROOT_DIR, '.nvmrc'), 'utf-8').trim();
      expect(nvmrc).toBe('24');

      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
      expect(pkg.engines?.node).toBe('24.x');

      const deployYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf-8');
      const deployMatches = deployYml.match(/node-version-file:\s*['"]\.nvmrc['"]/g) || [];
      expect(deployMatches).toHaveLength(2);
      expect(deployYml).not.toMatch(/node-version:\s*20\b/);

      const backupYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/backup-diario.yml'), 'utf-8');
      expect(backupYml).toMatch(/node-version-file:\s*['"]\.nvmrc['"]/);
      expect(backupYml).not.toMatch(/node-version:\s*20\b/);
    });
  });

  // =========================================================================
  // CT05 / CA05: Workflow contador_diario.yml sem credenciais literais
  // =========================================================================
  describe('CT05 / CA05: contador_diario.yml sem Token/Host Literais e com Validação de HTTP', () => {
    it('não contém host do projeto nem JWT literal e lê URL/chave via vars e secrets', () => {
      const yml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/contador_diario.yml'), 'utf-8');

      expect(yml).not.toContain('nyretgvzbnbtiyeioeju');
      expect(yml).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
      expect(yml).toContain('vars.SUPABASE_URL');
      expect(yml).toContain('secrets.SUPABASE_ANON_KEY');
      expect(yml).toContain('${SUPABASE_URL%/}/rest/v1/rpc/consolidar_contador_dia_anterior');
    });

    it('executa o script real do workflow com mock de curl para sucesso 2xx, falha 5xx e variáveis ausentes', () => {
      const yml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/contador_diario.yml'), 'utf-8');
      const bashScript = extrairBlocoRunContador(yml);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caf-000122-curl-'));
      tempDirs.push(tmpDir);

      const curlStubPath = path.join(tmpDir, 'curl');
      fs.writeFileSync(
        curlStubPath,
        [
          '#!/usr/bin/env bash',
          'printf "%s\\n" "$*" > "$MOCK_CURL_LOG"',
          'printf "%s\\nHTTP_STATUS:%s\\n" "${MOCK_BODY:-{\\"ok\\":true}}" "${MOCK_STATUS:-200}"'
        ].join('\n'),
        'utf-8'
      );
      fs.chmodSync(curlStubPath, 0o755);

      const logFile = path.join(tmpDir, 'curl-args.log');

      // 1. Falha imediatamente quando SUPABASE_URL ou SUPABASE_ANON_KEY não estão definidas
      const missingRes = spawnSync('bash', ['-e', '-c', bashScript], {
        env: { PATH: `${tmpDir}:${process.env.PATH}` },
        encoding: 'utf-8'
      });
      expect(missingRes.status).toBe(1);
      expect(missingRes.stdout + missingRes.stderr).toContain('SUPABASE_URL e SUPABASE_ANON_KEY');

      // 2. Sucesso com HTTP 200 e barra final removida da URL
      const okRes = spawnSync('bash', ['-e', '-c', bashScript], {
        env: {
          PATH: `${tmpDir}:${process.env.PATH}`,
          SUPABASE_URL: 'https://exemplo.supabase.co/',
          SUPABASE_ANON_KEY: 'anon-test-key',
          MOCK_STATUS: '200',
          MOCK_BODY: '{"consolidados":12}',
          MOCK_CURL_LOG: logFile
        },
        encoding: 'utf-8'
      });
      expect(okRes.status).toBe(0);
      expect(okRes.stdout).toContain('Status retornado: 200');
      expect(fs.readFileSync(logFile, 'utf-8')).toContain(
        'https://exemplo.supabase.co/rest/v1/rpc/consolidar_contador_dia_anterior'
      );
      expect(fs.readFileSync(logFile, 'utf-8')).toContain('apikey: anon-test-key');

      // 3. Falha com HTTP 500
      const errRes = spawnSync('bash', ['-e', '-c', bashScript], {
        env: {
          PATH: `${tmpDir}:${process.env.PATH}`,
          SUPABASE_URL: 'https://exemplo.supabase.co',
          SUPABASE_ANON_KEY: 'anon-test-key',
          MOCK_STATUS: '500',
          MOCK_BODY: '{"error":"internal"}',
          MOCK_CURL_LOG: logFile
        },
        encoding: 'utf-8'
      });
      expect(errRes.status).toBe(1);
      expect(errRes.stdout).toContain('Status retornado: 500');
    });
  });

  // =========================================================================
  // CT06 / CA06: README completo e coerente com package.json e SDD
  // =========================================================================
  describe('CT06 / CA06: README.md Atualizado e Executável', () => {
    it('documenta todas as telas, comandos reais, migrations, CI e fluxo SDD sem scripts inexistentes', () => {
      const readme = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf-8');
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));

      const requiredPages = [
        'index.html',
        'cardapio.html',
        'totem.html',
        'pedidos.html',
        'cozinha.html',
        'retirada.html',
        'avaliar.html',
        'admin.html',
        '404.html'
      ];
      for (const page of requiredPages) {
        expect(readme, `README.md deve documentar ${page}`).toContain(page);
      }

      const requiredCommands = [
        'npm run dev',
        'npm test',
        'npm run test:coverage',
        'npm run lint',
        'npm run lint:e2e',
        'npm run test:db',
        'npm run test:e2e',
        'npm run db:migrate',
        'npm run build',
        'npm run preview'
      ];
      for (const cmd of requiredCommands) {
        expect(readme, `README.md deve documentar '${cmd}'`).toContain(cmd);
      }

      // Todo `npm run <script>` citado no README existe em package.json
      const mentionedScripts = [...readme.matchAll(/\bnpm run ([a-zA-Z0-9:_-]+)/g)].map((m) => m[1]);
      expect(mentionedScripts.length).toBeGreaterThanOrEqual(9);
      for (const scriptName of mentionedScripts) {
        expect(pkg.scripts[scriptName], `Script citado no README não existe em package.json: ${scriptName}`).toBeDefined();
      }

      expect(readme).toContain('supabase/migrations.manifest.json');
      expect(readme).toContain('supabase/README.md');
      expect(readme).toContain('supabase/RESTAURACAO.md');
      expect(readme).toContain('SDD/MODELO_ATIVIDADE.md');
      expect(readme).toContain('SDD/INDICE.md');
      expect(readme).toContain('SDD/CONCLUIDAS/');
      expect(readme).toContain('GEMINI.md');
      expect(readme).toContain('.nvmrc');
    });
  });
});
