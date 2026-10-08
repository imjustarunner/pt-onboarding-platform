import { injectPublicFavicon } from '../src/utils/publicBrowserBranding.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITSCO_PUBLIC_SECTIONS } from '../src/utils/publicDomainRouting.js';
import { itscoPublicResponse, itscoSitemap, ITSCO_REDIRECTS, ITSCO_ORIGIN } from '../src/utils/itscoPublicSeo.js';
import { buildShareMeta, injectShareMetaIntoHtml } from '../src/utils/sharePreview.js';
import {sstcNginxServer} from './build-sstc-website.mjs';
import { itscoLegalLinks } from '../src/content/itscoLegalDocuments.js';
import { renderItscoLegalHtml, itscoLegalTypeForPath } from '../src/utils/itscoLegalHtml.js';
import { tenantLegalProfiles } from '../src/content/tenantLegalProfiles.js';
import { legalRouteEntries } from '../src/utils/tenantLegalRoutes.js';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const out = `${dist}/_public-sites/itsco`;
mkdirSync(out, {recursive:true});
const shell = readFileSync(`${dist}/index.html`, 'utf8');
const locations = [];
for (const section of [...ITSCO_PUBLIC_SECTIONS, 'careers', ...itscoLegalLinks.map(link => link.path.slice(1))]) {
 const path = `/${section}`;
 const page = itscoPublicResponse('www.itsco.health', path);
 const meta = {name:'ITSCO',title:page.title,description:page.description,url:page.canonical,image:buildShareMeta({host:'www.itsco.health',path}).image};
 const legalType = itscoLegalTypeForPath(path);
 const html = legalType ? renderItscoLegalHtml(legalType) : injectPublicFavicon(injectShareMetaIntoHtml(shell,meta), 'itsco.health').replace('</head>',`<link rel="canonical" href="${page.canonical}"></head>`);
 const file = `${(section || 'home').replaceAll('/', '-')}.html`;
 writeFileSync(`${out}/${file}`, html);
 locations.push(`location = ${path} { add_header Cache-Control "no-cache"; ${page.noindex ? 'add_header X-Robots-Tag noindex always;' : ''} ${section === 'providers' ? 'add_header X-Robots-Tag $itsco_filter_robots always;' : ''} try_files /_public-sites/itsco/${file} =404; }`);
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
 location = /manifest.webmanifest { default_type application/manifest+json; add_header Cache-Control "no-cache"; try_files /manifest.webmanifest =404; }
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
 location ~ ^/providers/[a-z0-9-]+-[1-9][0-9]*$ { add_header Cache-Control "no-cache"; add_header X-Robots-Tag "noindex" always; try_files /_public-sites/itsco/providers.html =404; }
 ${locations.join('\n')}
 location = /assets/itsco/ITSCO-School-Partnership-Guide.pdf {
  default_type application/pdf;
  expires 1h;
  try_files $uri =404;
 }
 location = /sitemap.xml { default_type application/xml; try_files /_public-sites/itsco/sitemap.xml =404; }
 location = /robots.txt { default_type text/plain; try_files /_public-sites/itsco/robots.txt =404; }
 location ~ ^/(.+)/$ { return 301 ${ITSCO_ORIGIN}/$1$is_args$args; }
 location ^~ /api/ { return 404; } # Must be routed to the API backend at the load balancer.
 location ~ ^/(join|intake|careers|itsco|sign|public|secure-message|preferences-form)(/|$) {
  add_header Cache-Control "no-store" always;
  add_header X-Robots-Tag "noindex" always;
  try_files /index.html =404;
 }
 location ~* \\.mjs$ { types { application/javascript mjs; } default_type application/javascript; try_files $uri =404; }
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
function nativeLegalLocations(profile, canonicalOnly=false) {
 const folder=`${dist}/_public-sites/${profile.slug}`;
 mkdirSync(folder,{recursive:true});
 return legalRouteEntries(profile).filter(entry=>!canonicalOnly||entry.path===entry.canonical).map(entry=>{
  const filename=`legal-${entry.type}.html`;
  writeFileSync(`${folder}/${filename}`,renderItscoLegalHtml(entry.type,profile));
  return entry.path===entry.canonical?`location = ${entry.path} { add_header Cache-Control "no-cache"; try_files /_public-sites/${profile.slug}/${filename} =404; }`:`location = ${entry.path} { return 301 ${profile.legalOrigin || profile.origin}${entry.canonical}$is_args$args; }`;
 }).join('\n');
}
// Canonical tenant URLs also work on shared/app hosts without requiring JavaScript.
writeFileSync(`${dist}/tenant-legal-locations.conf`,Object.values(tenantLegalProfiles).map(profile=>nativeLegalLocations(profile,true)).join('\n'));
// Plotline is a separate public entry, keeping the marketing site independent of staff sessions.
const { plotlinePages } = await import('../src/content/plotlineWebsite.js');
const plotlineLocations = Object.keys(plotlinePages).map(key => {
 const suffix = key === 'home' ? '' : `/${key}`;
 return `location = /plottline${suffix} { add_header Cache-Control "no-cache"; try_files /_public-sites/plotline${suffix}/index.html =404; }
 location = /plottline${suffix}/ { return 302 https://plottwistco.com/plottline${suffix}$is_args$args; }
 location = /plotline${suffix} { return 302 https://plottwistco.com/plottline${suffix}$is_args$args; }`;
}).join('\n') + `
 location ^~ /plottline/assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
 location = /plottline/sitemap.xml { default_type application/xml; try_files /_public-sites/plotline/sitemap.xml =404; }
 location ^~ /plottline/ { return 404; }
`;
const publicServers = Object.entries(PUBLIC_SITE_DOMAINS).map(([domain, slug]) => {
 mkdirSync(`${dist}/_public-sites/${slug}`, {recursive:true});
 const meta = buildShareMeta({host:domain,path:'/'});
 const legalProfile=tenantLegalProfiles[slug];
 const legalLocations=legalProfile?nativeLegalLocations(legalProfile):'';
 writeFileSync(`${dist}/_public-sites/${slug}/home.html`, injectPublicFavicon(injectShareMetaIntoHtml(shell, meta), domain));
 return `
server {
 listen 8080;
 server_name ${domain} www.${domain};
 root /usr/share/nginx/html;
 location = /manifest.webmanifest { default_type application/manifest+json; add_header Cache-Control "no-cache"; try_files /manifest.webmanifest =404; }
 location = / { add_header Cache-Control "no-cache"; try_files /_public-sites/${slug}/home.html =404; }
    location = /auricwell/demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex, nofollow" always; add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; try_files /auricwell-demo.html =404; }
    location = /auricwell/demo/ { absolute_redirect off; return 301 /auricwell/demo$is_args$args; }
    location = /auricwell-demo.html { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex, nofollow" always; add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; try_files $uri =404; }
 location = /schoolcarebridge/demo/ { absolute_redirect off; return 301 /schoolcarebridge/demo$is_args$args; }
 location = /schoolcarebridge/demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /schoolcarebridge-demo.html =404; }
 ${slug === 'mh4kidz' ? 'location = /schoolcarebridge { add_header Cache-Control "no-cache"; try_files /_public-sites/schoolcarebridge/home.html =404; }\n location = /schoolcarebridge/app { add_header Cache-Control \"no-store\"; add_header X-Robots-Tag \"noindex\" always; try_files /_public-sites/schoolcarebridge/home.html =404; }\n location ^~ /schoolcarebridge/app/ { add_header Cache-Control \"no-store\"; add_header X-Robots-Tag \"noindex\" always; try_files /_public-sites/schoolcarebridge/home.html =404; }\n location ^~ /schoolcarebridge/ { add_header Cache-Control "no-store"; try_files /_public-sites/schoolcarebridge/home.html =404; }' : ''}
 ${legalLocations}
 ${slug === 'ptco' ? plotlineLocations : ''}
 location = /fundthred { return 302 https://plottwisthq.com/fundthred$is_args$args; }
 location ^~ /fundthred/ { return 302 https://plottwisthq.com$request_uri; }
 location = /login { return 302 https://app.${domain}/login$is_args$args; }
 location = /app { return 302 https://app.${domain}/login$is_args$args; }
 location ~ ^/[^/]+/login$ { return 302 https://app.${domain}/login$is_args$args; }
 location = /p/${slug} { return 301 https://${domain}/$is_args$args; }
 location ~ ^/p/${slug}/(.*)$ { return 301 https://${domain}/$1$is_args$args; }
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.nginx\\.conf$ { return 404; }
 location ~* \\.mjs$ { types { application/javascript mjs; } default_type application/javascript; try_files $uri =404; }
 location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot)$ { try_files $uri =404; }
 location / { add_header Cache-Control "no-cache"; try_files $uri /_public-sites/${slug}/home.html =404; }
}
`;}).join('\n');
writeFileSync(`${dist}/itsco-public.nginx.conf`, readFileSync(`${dist}/itsco-public.nginx.conf`, 'utf8') + publicServers);
writeFileSync(`${dist}/itsco-public.nginx.conf`, readFileSync(`${dist}/itsco-public.nginx.conf`, 'utf8') + sstcNginxServer().replace(' root /usr/share/nginx/html;', ` root /usr/share/nginx/html;\n ${nativeLegalLocations(tenantLegalProfiles.sstc)}`));

// Prepared now; DNS, certificate and load-balancer activation are separate rollout steps.
mkdirSync(`${dist}/_public-sites/schoolcarebridge`, {recursive:true});
const scbMeta = buildShareMeta({host:'schoolcarebridge.org',path:'/'});
writeFileSync(`${dist}/_public-sites/schoolcarebridge/home.html`, injectPublicFavicon(injectShareMetaIntoHtml(shell,scbMeta), 'schoolcarebridge.org'));
writeFileSync(`${dist}/itsco-public.nginx.conf`, readFileSync(`${dist}/itsco-public.nginx.conf`, 'utf8') + `
server {
 listen 8080;
 server_name schoolcarebridge.org www.schoolcarebridge.org;
 ${nativeLegalLocations(tenantLegalProfiles.schoolcarebridge)}
 location = /demo/ { absolute_redirect off; return 301 /demo$is_args$args; }
 location = /demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /schoolcarebridge-demo.html =404; }
    location = /auricwell/demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex, nofollow" always; add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; try_files /auricwell-demo.html =404; }
    location = /auricwell/demo/ { absolute_redirect off; return 301 /auricwell/demo$is_args$args; }
    location = /auricwell-demo.html { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex, nofollow" always; add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always; try_files $uri =404; }
 location = /schoolcarebridge/demo/ { absolute_redirect off; return 301 /schoolcarebridge/demo$is_args$args; }
 location = /schoolcarebridge/demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /schoolcarebridge-demo.html =404; }
 root /usr/share/nginx/html;
 add_header X-Content-Type-Options nosniff always;
 location ^~ /api/ { return 404; } # Route /api/* to the existing backend at the load balancer.
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.nginx\\.conf$ { return 404; }
 location ^~ /assets/ { try_files $uri =404; }
 location = /app { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /_public-sites/schoolcarebridge/home.html =404; }
 location ^~ /app/ { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /_public-sites/schoolcarebridge/home.html =404; }
 location / { add_header Cache-Control "no-cache"; try_files $uri /_public-sites/schoolcarebridge/home.html =404; }
}
`);
