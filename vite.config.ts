import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sitemapPlugin() {
  return {
    name: 'xeio-sitemap',
    closeBundle() {
      const siteUrl = (process.env.VITE_SITE_URL || 'https://xeio.in').replace(/\/+$/, '');
      const distDir = resolve(__dirname, 'dist');
      mkdirSync(distDir, { recursive: true });
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${siteUrl}/</loc></url>`,
        '</urlset>',
        '',
      ].join('\n');
      writeFileSync(resolve(distDir, 'sitemap.xml'), xml, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [react(), sitemapPlugin()],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
});
