import {mkdirSync, writeFileSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderSstc, pages} from '../src/sstc/website/render.mjs';
import {SSTC_ORIGIN} from '../src/sstc/website/routing.mjs';
export function buildSstcWebsite() {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  for (const base of ['', '/p/sstc']) {
    const directory = `${dist}/_public-sites/sstc${base ? '-alias' : ''}`;
    mkdirSync(directory, {recursive:true});
    for (const section of Object.keys(pages)) writeFileSync(`${directory}/${section || 'home'}.html`, renderSstc(section,{base}));
  }
  mkdirSync(`${dist}/assets/sstc`,{recursive:true});
  for (const name of ['site.css','browser.js']) copyFileSync(fileURLToPath(new URL(`../src/sstc/website/${name}`,import.meta.url)),`${dist}/assets/sstc/${name}`);
  writeFileSync(`${dist}/_public-sites/sstc/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(section=>`<url><loc>${SSTC_ORIGIN}/${section}</loc></url>`).join('')}</urlset>`);
  writeFileSync(`${dist}/_public-sites/sstc/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /sstc/\nDisallow: /api/\nSitemap: ${SSTC_ORIGIN}/sitemap.xml\n`);
}
export function sstcNginxServer() {
  const locations = Object.keys(pages).map(section=>`location = /${section} { add_header Cache-Control "no-cache"; try_files /_public-sites/sstc/${section || 'home'}.html =404; }${section ? `\n location = /${section}/ { absolute_redirect off; return 301 /${section}$is_args$args; }` : ''}`).join('\n');
  return `
# Marketing claims only the nine explicit public pages. The existing SSTC
# application, token links and integrations remain on this same hostname.
server {
 listen 8080;
 server_name summitstatstc.com www.summitstatstc.com;
 root /usr/share/nginx/html;
 add_header X-Content-Type-Options nosniff always;
 add_header X-Frame-Options SAMEORIGIN always;
 ${locations}
 location = /p/sstc { return 301 /$is_args$args; }
 location ~ ^/p/sstc/(features|how-it-works|groups|tour|pricing|faq|about|contact)/?$ { return 301 /$1$is_args$args; }
 location = /p/sstc/ { return 301 /$is_args$args; }
 location = /sitemap.xml { default_type application/xml; try_files /_public-sites/sstc/sitemap.xml =404; }
 location = /robots.txt { default_type text/plain; try_files /_public-sites/sstc/robots.txt =404; }
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.nginx\\.conf$ { return 404; }
 location = /assets/sstc/site.css { add_header Cache-Control "no-cache"; try_files $uri =404; }
 location = /assets/sstc/browser.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
 location = /manifest.webmanifest { default_type application/manifest+json; add_header Cache-Control "no-cache"; try_files $uri =404; }
 location ~* \\.mjs$ { types { application/javascript mjs; } default_type application/javascript; try_files $uri =404; }
 location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|json|pdf)$ { try_files $uri =404; }
 location ^~ /api/ { return 404; } # The load balancer routes API requests to the existing backend.
 location / {
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  add_header X-Robots-Tag "noindex" always;
  sub_filter_once off;
  sub_filter '<title>Portal</title>' '<title>Summit Stats Team Challenge</title>';
  sub_filter 'content="Portal"' 'content="Summit Stats Team Challenge"';
  sub_filter 'content="Care, scheduling, billing, and support."' 'content="Your fitness club, teams, seasons, and competitions."';
  sub_filter 'href="/branding/plottwisthq-platform-bg.png"' 'href="/assets/sstc/logo.png"';
  try_files /index.html =404;
 }
}
`;
}
