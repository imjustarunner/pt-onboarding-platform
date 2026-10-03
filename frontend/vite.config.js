import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { pages, renderWebsite } from './src/auricwell/website/render.mjs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const indexHtml = fileURLToPath(new URL('./index.html', import.meta.url));
/** Git submodule at repo root: `games/` (https://github.com/imjustarunner/games.git) */
const gamesRoot = path.resolve(rootDir, '..', 'games');

export default defineConfig({
  // Always resolve root relative to this config file (works even when invoked from repo root).
  root: rootDir,
  plugins: [vue(), {
    name: 'auricwell-preview-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const parsed = new URL(req.url || '/', 'http://localhost');
        const pathname = parsed.pathname.replace(/\/$/, '');
        if (pathname === '/auricwell/website-demo.js') {
          _res.setHeader('Content-Type', 'application/javascript');
          req.url = '/src/auricwell/website/website-demo.js';
          return next();
        }
        if (pathname === '/auricwell/website-demo.css') { _res.setHeader('Content-Type','text/css'); return _res.end('/* Component styles are injected by Vite in development. */'); }
        if (pathname === '/auricwell/website.css') {
          _res.setHeader('Content-Type', 'text/css');
          return _res.end(readFileSync(path.join(rootDir, 'src/auricwell/website/website.css')));
        }
        const section = pathname === '/auricwell' ? '' : pathname.replace(/^\/auricwell\//, '');
        if (pathname.startsWith('/auricwell') && Object.hasOwn(pages, section)) {
          _res.setHeader('Content-Type', 'text/html');
          return _res.end(renderWebsite(section, {base:'/auricwell', email:'support@auricwell.com'}));
        }
        if (/^\/auricwell\/app(?:\/|$)/.test(pathname)) req.url = '/auricwell.html';
        else if (/^\/auricwell\/[^.]+$/.test(pathname)) {
          _res.statusCode = 302;
          _res.setHeader('Location', pathname.replace('/auricwell/', '/auricwell/app/') + parsed.search);
          return _res.end();
        }
        next();
      });
    }
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@games': gamesRoot
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js']
  },
  server: {
    port: 5173,
    fs: {
      allow: [rootDir, gamesRoot]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { main: indexHtml, auricwell: fileURLToPath(new URL('./auricwell.html', import.meta.url)) }
    }
  }
});

