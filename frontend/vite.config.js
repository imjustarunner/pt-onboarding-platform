import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { pages, renderWebsite } from './src/auricwell/website/render.mjs';
import {pages as michaelPages, renderSite as renderMichaelSite} from './src/michael/site.mjs';
import {buildMichaelSite} from './scripts/build-michael-site.mjs';
import {renderSstc} from './src/sstc/website/render.mjs';
import {sstcMarketingPage} from './src/sstc/website/routing.mjs';
import {buildSstcWebsite} from './scripts/build-sstc-website.mjs';
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
    name: 'plotline-marketing-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (/^\/plott?line(?:\/(?:product|solutions|careers|resources|about|pricing|start))?\/?$/.test(url.pathname)) req.url = '/plotline-site/index.html' + url.search;
        next();
      });
    }
  }, {
    name: 'summit-stats-public-website',
    closeBundle: buildSstcWebsite,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const page = sstcMarketingPage(req.headers.host, req.url);
        if (!page) return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(renderSstc(page.section, {...page, dev:true}));
      });
    }
  }, {
    name: 'michael-consulting-site',
    closeBundle: buildMichaelSite,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/$/, '');
        const section = pathname === '/michael' ? '' : pathname.slice('/michael/'.length);
        if (/^\/michael(?:\/|$)/.test(pathname) && Object.hasOwn(michaelPages, section)) {
          res.setHeader('Content-Type', 'text/html');
          return res.end(renderMichaelSite(section, {dev: true}));
        }
        next();
      });
    }
  }, {
    name: 'auricwell-preview-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const parsed = new URL(req.url || '/', 'http://localhost');
        const pathname = parsed.pathname.replace(/\/$/, '');
        if (pathname === '/auricwell/demo') {req.url='/auricwell-demo.html'+parsed.search;return next();}
        if (pathname === '/schoolcarebridge/demo') {req.url='/schoolcarebridge-demo.html'+parsed.search;return next();}
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
      input: { main: indexHtml, auricwell: fileURLToPath(new URL('./auricwell.html', import.meta.url)), auricwellDemo: fileURLToPath(new URL('./auricwell-demo.html', import.meta.url)), schoolcarebridgeDemo: fileURLToPath(new URL('./schoolcarebridge-demo.html', import.meta.url)) }
    }
  }
});
