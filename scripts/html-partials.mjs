import fs from 'node:fs';
import path from 'node:path';

const INCLUDE_TAG_REGEX = /<include\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>(?:\s*<\/include>)?/gi;

/**
 * Resolve recursivamente diretivas `<include src="..."></include>` em arquivos HTML.
 * Garante isolamento contra path traversal e ciclos de inclusao.
 *
 * @param {string} html Conteudo HTML de origem.
 * @param {string} rootDir Diretorio raiz do projeto.
 * @param {Set<string>} [seen] Caminhos ja visitados na cadeia atual.
 * @returns {string} HTML com parciais expandidas inline.
 */
export function expandHtmlPartials(html, rootDir, seen = new Set()) {
  if (!html || !html.includes('<include')) return html;

  const resolvedRoot = path.resolve(rootDir);

  return html.replace(INCLUDE_TAG_REGEX, (fullMatch, _quote, relPath) => {
    const cleanRelPath = relPath.replace(/^\/+/, '');
    const targetPath = path.resolve(resolvedRoot, cleanRelPath);

    if (targetPath !== resolvedRoot && !targetPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Partial HTML fora da raiz do projeto nao permitido: ${relPath}`);
    }

    if (seen.has(targetPath)) {
      throw new Error(`Ciclo detectado ao incluir partial HTML: ${relPath}`);
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Partial HTML nao encontrada: ${relPath} (${targetPath})`);
    }

    const partialContent = fs.readFileSync(targetPath, 'utf8');
    const nextSeen = new Set(seen);
    nextSeen.add(targetPath);

    return expandHtmlPartials(partialContent, resolvedRoot, nextSeen);
  });
}
