import { resolve, basename } from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

function inlineCssPlugin() {
  return {
    name: 'inline-css-plugin',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      if (!ctx || !ctx.bundle) return html;

      let resultHtml = html;
      for (const [fileName, file] of Object.entries(ctx.bundle)) {
        if (fileName.endsWith('.css') && file.type === 'asset') {
          const fileBase = basename(fileName);
          const cssContent = typeof file.source === 'string' ? file.source : file.source.toString();
          
          // Match any <link> tag that references this css file
          const linkRegex = new RegExp(
            `<link\\s+[^>]*?href=["'][^"']*?${fileBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*?>`,
            'gi'
          );

          if (linkRegex.test(resultHtml)) {
            resultHtml = resultHtml.replace(linkRegex, `<style>${cssContent}</style>`);
          }
        }
      }
      return resultHtml;
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        cardapio: resolve(import.meta.dirname, 'cardapio.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        notfound: resolve(import.meta.dirname, '404.html')
      }
    }
  },
  plugins: [
    inlineCssPlugin(),
    viteStaticCopy({
      targets: [
        { src: 'CNAME', dest: '' },
        { src: 'sw.js', dest: '' },
        { src: 'manifest.json', dest: '' },
        { src: 'robots.txt', dest: '' },
        { src: 'sitemap.xml', dest: '' },
        { src: 'assets', dest: '' },
        { src: 'css', dest: '' },
        { src: 'js', dest: '' }
      ]
    })
  ],
  server: {
    port: 3000
  }
});
