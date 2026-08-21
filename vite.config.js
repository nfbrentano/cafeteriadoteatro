import { resolve } from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
