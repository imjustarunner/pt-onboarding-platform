import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fundthredPages} from '../src/content/fundthredWebsite.js';

// Use the application's compiled entry: public pages and the authenticated
// workspace share one release, with distinct metadata for public deep links.
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const shell=readFileSync(`${dist}/index.html`,'utf8');
const directory=`${dist}/_public-sites/fundthred`;
mkdirSync(directory,{recursive:true});
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
for(const [key,page] of Object.entries(fundthredPages)){
  const url=`https://fundthred.com${key==='home'?'':'/'+key}`;
  const head=`<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><link rel="canonical" href="${url}"><link rel="icon" type="image/svg+xml" href="/assets/fundthred/icon.svg"><meta property="og:type" content="website"><meta property="og:site_name" content="FundThred by Plot Twist Co."><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${url}"><meta name="theme-color" content="#0d203d"><meta property="og:image" content="https://fundthred.com/assets/fundthred/share-card.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="FundThred — Follow the thread of every dollar"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="https://fundthred.com/assets/fundthred/share-card.png"><style>html,body{margin:0;background:#f8fbfd}#app{min-height:100vh}</style>`;
  const html=shell.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*(?:name=["'](?:description|theme-color|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi,'').replace(/<link\b[^>]*rel=["'](?:icon|canonical)["'][^>]*>/gi,'').replace('</head>',`${head}</head>`).replace('</body>',`<noscript><main><h1>${escape(page.title)}</h1><p>${escape(page.description)}</p><p>Enable JavaScript to explore FundThred and sign in to your workspace.</p><a href="https://plottwistco.com/start?path=hq&amp;service=operations">Contact Plot Twist Co.</a></main></noscript></body>`);
  writeFileSync(`${directory}/${key}.html`,html);
}
writeFileSync(`${directory}/sitemap.xml`,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(fundthredPages).map(key=>`<url><loc>https://fundthred.com${key==='home'?'':'/'+key}</loc></url>`).join('')}</urlset>`);
console.log(`FundThred packaged: ${Object.keys(fundthredPages).length} public pages and sitemap.`);
