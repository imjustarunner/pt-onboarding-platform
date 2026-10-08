// Build the independent Plotline marketing entry and package it for previews
// and the normal frontend production image.
import { build } from 'vite';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plotlinePages } from '../src/content/plotlineWebsite.js';
import { PLOTLINE_WEBSITE_URL } from '../src/utils/plotline.js';
const root=fileURLToPath(new URL('..',import.meta.url));
await build({configFile:`${root}/plotline-site/vite.config.mjs`});
const dist=`${root}/dist-plotline`,shell=readFileSync(`${dist}/index.html`,'utf8');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
for(const [key,page] of Object.entries(plotlinePages)) {
  const path=key==='home'?'':`/${key}`,url=PLOTLINE_WEBSITE_URL+path;
  const html=shell.replace(/<title>.*?<\/title>/,`<title>${escape(page.title)} | Plotline by PlotTwistCo</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${escape(page.description)}">`).replace('</head>',`<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="Plotline by PlotTwistCo"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://plottwistco.com/assets/plotline/share.png"><meta name="twitter:card" content="summary_large_image"><style>html,body{margin:0;padding:0;background:#faf8f4}body{min-width:320px}#plotline-main:focus{outline:none}button,input,select,textarea{font:inherit}</style></head>`).replace('</body>',`<noscript><main><h1>${escape(page.title)}</h1><p>${escape(page.description)}</p><p>Please enable JavaScript to explore Plotline and use the pricing calculator.</p><a href="https://plottwistco.com/start?path=hq&amp;service=people">Contact PlotTwistCo</a></main></noscript></body>`);
  mkdirSync(`${dist}/pages${path}`,{recursive:true});writeFileSync(`${dist}/pages${path}/index.html`,html);
}
mkdirSync(`${dist}/public-assets`,{recursive:true});
cpSync(`${root}/public/assets/plotline`,`${dist}/public-assets/plotline`,{recursive:true});
writeFileSync(`${dist}/sitemap.xml`,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(plotlinePages).map(key=>`<url><loc>${PLOTLINE_WEBSITE_URL}${key==='home'?'':'/'+key}</loc></url>`).join('')}</urlset>`);
writeFileSync(`${dist}/404.html`,'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found | Plotline</title><body style="font-family:system-ui;padding:10%;background:#faf8f4;color:#0f2d24"><h1>This chapter hasn’t been written.</h1><p>The page you’re looking for isn’t here.</p><a href="/plottline">Return to Plotline →</a></body></html>');
console.log('Plotline website packaged: 7 pages, public assets, metadata, and sitemap.');

// Package into the normal frontend image as well as the isolated preview artifact.
mkdirSync(`${root}/dist/plottline`,{recursive:true});
cpSync(`${dist}/assets`,`${root}/dist/plottline/assets`,{recursive:true});
cpSync(`${dist}/pages`,`${root}/dist/_public-sites/plotline`,{recursive:true});
cpSync(`${dist}/sitemap.xml`,`${root}/dist/_public-sites/plotline/sitemap.xml`);
