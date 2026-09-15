import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITSCO_PUBLIC_SECTIONS } from '../src/utils/publicDomainRouting.js';
import { itscoPublicResponse, itscoSitemap, ITSCO_REDIRECTS, ITSCO_ORIGIN } from '../src/utils/itscoPublicSeo.js';
import { injectShareMetaIntoHtml } from '../src/utils/sharePreview.js';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const out = `${dist}/_public-sites/itsco`;
mkdirSync(out, {recursive:true});
const shell = readFileSync(`${dist}/index.html`, 'utf8');
const locations = [];
for (const section of [...ITSCO_PUBLIC_SECTIONS, 'careers']) {
 const path = `/${section}`;
 const page = itscoPublicResponse('www.itsco.health', path);
 const meta = {name:'ITSCO',title:page.title,description:page.description,url:page.canonical,image:`${ITSCO_ORIGIN}/assets/itsco/students-hero.png`};
 const html = injectShareMetaIntoHtml(shell,meta).replace('</head>',`<link rel="canonical" href="${page.canonical}"></head>`);
 const file = `${section || 'home'}.html`;
 writeFileSync(`${out}/${file}`, html);
 locations.push(`location = ${path} { add_header Cache-Control "no-cache"; ${section === 'providers' ? 'add_header X-Robots-Tag $itsco_filter_robots always;' : ''} try_files /_public-sites/itsco/${file} =404; }`);
}
writeFileSync(`${out}/sitemap.xml`, itscoSitemap());
writeFileSync(`${out}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${ITSCO_ORIGIN}/sitemap.xml\n`);
writeFileSync(`${out}/404.html`, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found | ITSCO</title></head><body><main><h1>Page not found</h1><a href="/">Return to ITSCO</a></main></body></html>');
const redirects = Object.entries(ITSCO_REDIRECTS).map(([from,to])=>`location = ${from} { return 301 ${ITSCO_ORIGIN}${to}$is_args$args; }`).join('\n');
// An additional exact-host server leaves the existing app/QV default server untouched.
writeFileSync(`${dist}/itsco-public.nginx.conf`, `
map $uri $itsco_clean_uri {
 default $uri;
 /p/itsco /;
 /careers/itsco /careers;
 ~^/p/itsco/(.*)$ /$1;
 ~^/careers/itsco/(.*)$ /careers/$1;
 ${Object.entries(ITSCO_REDIRECTS).map(([from,to])=>`${from} ${to};`).join('\n')}
}
map "$arg_provider:$arg_school" $itsco_filter_robots { default "noindex"; ":" ""; }
server {
 listen 8080;
 server_name itsco.health;
 return 301 ${ITSCO_ORIGIN}$itsco_clean_uri$is_args$args;
}
server {
 listen 8080;
 server_name www.itsco.health;
 root /usr/share/nginx/html;
 add_header X-Content-Type-Options nosniff always;
 add_header X-Frame-Options SAMEORIGIN always;
 location ^~ /_public-sites/ { return 404; }
 location = /itsco-public.nginx.conf { return 404; }
 location = /app { return 302 https://app.itsco.health/itsco/login$is_args$args; }
 location = /login { return 302 https://app.itsco.health/itsco/login$is_args$args; }
 location = /itsco/login { return 302 https://app.itsco.health/itsco/login$is_args$args; }
 location = /p/itsco { return 301 ${ITSCO_ORIGIN}/$is_args$args; }
 location ~ ^/p/itsco/(.*)$ { return 301 ${ITSCO_ORIGIN}/$1$is_args$args; }
 location = /careers/itsco { return 301 ${ITSCO_ORIGIN}/careers$is_args$args; }
 location ~ ^/careers/itsco/(.*)$ { return 301 ${ITSCO_ORIGIN}/careers/$1$is_args$args; }
 ${redirects}
 ${locations.join('\n')}
 location = /sitemap.xml { default_type application/xml; try_files /_public-sites/itsco/sitemap.xml =404; }
 location = /robots.txt { default_type text/plain; try_files /_public-sites/itsco/robots.txt =404; }
 location ~ ^/(.+)/$ { return 301 ${ITSCO_ORIGIN}/$1$is_args$args; }
 location ^~ /api/ { return 404; } # Must be routed to the API backend at the load balancer.
 location ~ ^/(join|intake|careers|itsco|sign|public|secure-message|preferences-form)(/|$) {
  add_header Cache-Control "no-store" always;
  add_header X-Robots-Tag "noindex" always;
  try_files /index.html =404;
 }
 location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|json)$ {
  expires 1d;
  try_files $uri =404;
 }
 location / { return 404; }
 error_page 404 /_itsco-not-found;
 location = /_itsco-not-found {
  internal;
  add_header X-Robots-Tag noindex always;
  try_files /_public-sites/itsco/404.html =404;
 }
}
`);
console.log('Prepared ITSCO public-domain HTML metadata, sitemap, and Nginx host configuration.');

// Exact website hosts share the built app, with the public history adapter
// selecting the existing marketing page before the login guard runs.
const { PUBLIC_SITE_DOMAINS } = await import('../src/utils/publicDomainRouting.js');
const publicServers = Object.entries(PUBLIC_SITE_DOMAINS).map(([domain, slug]) => `
server {
 listen 8080;
 server_name ${domain} www.${domain};
 root /usr/share/nginx/html;
 location = /login { return 302 https://app.${domain}/login$is_args$args; }
 location = /app { return 302 https://app.${domain}/login$is_args$args; }
 location ~ ^/[^/]+/login$ { return 302 https://app.${domain}/login$is_args$args; }
 location = /p/${slug} { return 301 /$is_args$args; }
 location ~ ^/p/${slug}/(.*)$ { return 301 /$1$is_args$args; }
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.nginx\\.conf$ { return 404; }
 location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot)$ { try_files $uri =404; }
 location / { add_header Cache-Control "no-cache"; try_files $uri /index.html; }
}
`).join('\n');
writeFileSync(`${dist}/itsco-public.nginx.conf`, readFileSync(`${dist}/itsco-public.nginx.conf`, 'utf8') + publicServers);
