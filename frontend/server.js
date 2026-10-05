import express from 'express';
import { OFFICE_SITES, officeSiteForHost, officeHtml } from './src/utils/officeSite.js';
import { pages as auricwellPages } from './src/auricwell/website/render.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { buildShareMeta, injectShareMetaIntoHtml } from './src/utils/sharePreview.js';

import { isItscoPublicHost } from './src/utils/publicDomainRouting.js';
import {isSstcPublicHost, sstcMarketingPage} from './src/sstc/website/routing.mjs';
import { itscoPublicResponse, itscoSitemap, ITSCO_ORIGIN } from './src/utils/itscoPublicSeo.js';
import { renderItscoLegalHtml, itscoLegalTypeForPath } from './src/utils/itscoLegalHtml.js';
import { tenantLegalRequest } from './src/utils/tenantLegalRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const distPath = join(__dirname, 'dist');
app.use((req,res,next) => {
  const page = sstcMarketingPage(req.headers.host, req.path);
  if (page) return res.set('Cache-Control','no-cache').sendFile(join(distPath, '_public-sites', page.base ? 'sstc-alias' : 'sstc', `${page.section || 'home'}.html`));
  if (isSstcPublicHost(req.headers.host) && ['/sitemap.xml','/robots.txt'].includes(req.path)) return res.sendFile(join(distPath, '_public-sites/sstc', req.path.slice(1)));
  if (['/assets/sstc/site.css','/assets/sstc/browser.js'].includes(req.path)) return res.set('Cache-Control','no-cache').sendFile(join(distPath, req.path));
  if (req.path.startsWith('/_public-sites/sstc')) return res.sendStatus(404);
  next();
});
app.use((req,res,next)=>{
  const match=req.path.match(/^\/kiosk-welcome\/(1|6)\/?$/);
  const site=match?OFFICE_SITES.find(s=>s.locationId===Number(match[1])):req.path==='/'?officeSiteForHost(req.headers.host):null;
  if(!site)return next();
  return res.type('html').set('Cache-Control','no-store').send(officeHtml(readFileSync(join(distPath,'index.html'),'utf8'),site));
});

console.log(`Serving files from: ${distPath}`);
console.log(`Dist directory exists: ${existsSync(distPath)}`);

// Log what files exist in dist directory
if (existsSync(distPath)) {
  try {
    const distContents = readdirSync(distPath);
    console.log(`Dist directory contents: ${distContents.join(', ')}`);
    
    // Check assets folder
    const assetsPath = join(distPath, 'assets');
    if (existsSync(assetsPath)) {
      const assetsContents = readdirSync(assetsPath);
      console.log(`Assets directory contents (${assetsContents.length} files):`);
      assetsContents.forEach(file => {
        const filePath = join(assetsPath, file);
        const stats = statSync(filePath);
        console.log(`  - ${file} (${stats.size} bytes)`);
      });
      
      // Check what index.html references
      try {
        const indexPath = join(distPath, 'index.html');
        const indexContent = readFileSync(indexPath, 'utf-8');
        const jsMatch = indexContent.match(/src="([^"]*\.js)"/);
        const cssMatch = indexContent.match(/href="([^"]*\.css)"/);
        if (jsMatch) {
          const referencedJs = jsMatch[1].replace(/^\//, '');
          console.log(`index.html references JS: ${referencedJs}`);
          const referencedJsPath = join(distPath, referencedJs);
          console.log(`  File exists: ${existsSync(referencedJsPath)}`);
          if (!existsSync(referencedJsPath)) {
            console.log(`  ERROR: Referenced file does not exist! Looking for: ${referencedJsPath}`);
          }
        }
        if (cssMatch) {
          const referencedCss = cssMatch[1].replace(/^\//, '');
          console.log(`index.html references CSS: ${referencedCss}`);
        }
      } catch (err) {
        console.error('Error reading index.html:', err);
      }
    } else {
      console.log('WARNING: assets directory does not exist!');
    }
    
    // Check index.html
    const indexPath = join(distPath, 'index.html');
    if (existsSync(indexPath)) {
      console.log('✓ index.html exists');
    } else {
      console.log('✗ index.html does NOT exist!');
    }
  } catch (err) {
    console.error('Error reading dist directory:', err);
  }
} else {
  console.error('ERROR: dist directory does not exist! Build may have failed.');
}

// Exact public hosts only: never apply website redirects to app or Quick View.
app.use((req,res,next)=>{
  if(isItscoPublicHost(req.headers.host))return next();
  const legal=tenantLegalRequest(req.headers.host,req.originalUrl);
  if(!legal)return next();
  if(legal.redirect)return res.redirect(301,legal.redirect);
  return res.set('Cache-Control','no-cache').type('html').send(renderItscoLegalHtml(legal.type,legal.profile));
});
app.use((req, res, next) => {
  if (!isItscoPublicHost(req.headers.host)) return next();
  if (req.path === '/sitemap.xml') return res.type('application/xml').send(itscoSitemap());
  if (req.path === '/robots.txt') return res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${ITSCO_ORIGIN}/sitemap.xml\n`);
  if (/^\/(assets|api|uploads)(\/|$)/.test(req.path) || /\.[^/]+$/.test(req.path)) return next();
  const page = itscoPublicResponse(req.headers.host, req.originalUrl);
  if (page.redirect) return res.redirect(page.status, page.redirect);
  const legalType = itscoLegalTypeForPath(req.path);
  if (legalType) return res.set('Cache-Control', 'no-cache').type('html').send(renderItscoLegalHtml(legalType));
  if (page.status === 404) return res.status(404).set('X-Robots-Tag', 'noindex').type('html').send(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | ITSCO</title></head><body><main><h1>Page not found</h1><p>This address is unavailable.</p><a href="/">Return to ITSCO</a></main></body></html>'
  );
  res.locals.itscoPublicPage = page;
  if (page.noindex) res.setHeader('X-Robots-Tag', 'noindex');
  next();
});

app.use((req, res, next) => {
  if (/^\/schoolcarebridge\/app(?:\/|$)/.test(req.path) || (['schoolcarebridge.org','www.schoolcarebridge.org'].includes(String(req.headers.host || '').split(':')[0]) && /^\/app(?:\/|$)/.test(req.path))) {
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
  }
  next();
});

app.use((req, res, next) => {
  const match = req.path.match(/^\/michael(?:\/(services|coaching|running-coaching|college-planning|college-coach-consulting|private-practice|scale-your-practice|ai-development|business-growth|nonprofits|packages|work|about|contact|pay|privacy|terms))?\/?$/);
  if (match) return res.set('Cache-Control', 'no-cache').sendFile(join(distPath, 'michael/site', `${match[1] || 'home'}.html`));
  if (req.path.startsWith('/michael/site/')) return res.sendStatus(404);
  if (['/michael/site.css','/michael/browser.js','/michael/sitemap.xml'].includes(req.path)) return res.set('Cache-Control', 'no-cache').sendFile(join(distPath, req.path));
  next();
});

// Public pages never load clinical stores or request practice data.
app.use((req, res, next) => {
  if (!/^\/auricwell(?:\/|$)/.test(req.path)) return next();
  const pathname = req.path.replace(/\/$/, '');
  const section = pathname === '/auricwell' ? '' : pathname.slice('/auricwell/'.length);
  if (Object.hasOwn(auricwellPages, section)) {
    if (pathname !== req.path) return res.redirect(301, pathname + req.originalUrl.slice(req.path.length));
    return res.set('Cache-Control', 'no-cache').sendFile(join(distPath, 'auricwell/site', `${section || 'home'}.html`));
  }
  if (section === 'demo') return res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').set('Permissions-Policy','camera=(), microphone=(), geolocation=()').sendFile(join(distPath,'auricwell-demo.html'));
  if (/^app(?:\/|$)/.test(section)) return res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow').sendFile(join(distPath, 'auricwell.html'));
  if (section.startsWith('site/')) return res.sendStatus(404);
  if (section.startsWith('examples/')) return res.set('Cache-Control','no-cache').sendFile(join(distPath,'auricwell',section));
  if (section === 'website-demo.css') return res.set('Cache-Control','no-cache').sendFile(join(distPath,'auricwell/website-demo.css'));
  if (section === 'website-demo.js') return res.set('Cache-Control', 'no-cache').sendFile(join(distPath, 'auricwell/website-demo.js'));
  if (section === 'website.css') return res.set('Cache-Control', 'no-cache').sendFile(join(distPath, 'auricwell/website.css'));
  if (section.includes('.')) return next();
  return res.redirect(301, `/auricwell/app/${section}` + req.originalUrl.slice(req.path.length));
});
app.get(['/schoolcarebridge/demo','/schoolcarebridge/demo/','/schoolcarebridge-demo.html'], (_req,res)=>res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex').sendFile(join(distPath,'schoolcarebridge-demo.html')));
app.get('/demo', (req,res,next)=>['schoolcarebridge.org','www.schoolcarebridge.org'].includes(req.hostname) ? res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex').sendFile(join(distPath,'schoolcarebridge-demo.html')) : next());
app.get('/auricwell-demo.html', (_req,res)=>res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex, nofollow').set('Permissions-Policy','camera=(), microphone=(), geolocation=()').sendFile(join(distPath,'auricwell-demo.html')));
app.get('/auricwell.html', (_req, res) => res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, nofollow').sendFile(join(distPath, 'auricwell.html')));

// Serve static files from dist directory
// This handles all static assets including /assets/* files
app.use(express.static(distPath, {
  index: false, // Don't serve index.html automatically
  setHeaders: (res, path) => {
    // Set correct MIME types
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
    
    // Cache static assets (JS, CSS) for 1 year, but not index.html
    if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.css') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.get('*', (req, res) => {
  // Check if this is a request for a file (has file extension)
  const hasExtension = /\.[^/]+$/.test(req.path);
  
  if (hasExtension) {
    // It's a file request - if we reach here, express.static didn't find it
    const filePath = join(distPath, req.path);
    console.log(`[404] File not found: ${req.path} (checked: ${filePath})`);
    return res.status(404).send('File not found');
  }
  
  // For all other routes (SPA routes), serve index.html
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    // Prevent caching of index.html to ensure fresh content
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const html = readFileSync(indexPath, 'utf8');
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const meta = buildShareMeta({
      host: req.headers.host,
      path: req.originalUrl || req.path,
      proto
    });
    const page = res.locals.itscoPublicPage;
    let rendered;
    if (page) {
      Object.assign(meta, { title: page.title, description: page.description, url: page.canonical,
        name: 'ITSCO', image: `${ITSCO_ORIGIN}/assets/itsco/students-hero.png` });
      rendered = injectShareMetaIntoHtml(html, meta);
      rendered = rendered.replace('</head>', `<link rel="canonical" href="${page.canonical.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"></head>`);
      if (page.status === 404) rendered = rendered.replace(/<div id="app"><\/div>/, '<div id="app"><h1>Page not found</h1><a href="/">Return to ITSCO</a></div>');
      res.status(page.status);
    } else rendered = injectShareMetaIntoHtml(html, meta);
    res.type('html').send(rendered);
  } else {
    console.error(`[ERROR] index.html not found at: ${indexPath}`);
    res.status(500).send('index.html not found');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving files from: ${distPath}`);
});
