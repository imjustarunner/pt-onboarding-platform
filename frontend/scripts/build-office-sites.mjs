import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { OFFICE_SITES, officeHtml } from '../src/utils/officeSite.js';
const dist = new URL('../dist/', import.meta.url);
const shell = readFileSync(new URL('index.html', dist), 'utf8');
let nginx = '';
for (const site of OFFICE_SITES) {
  const folder = `_public-sites/office-${site.locationId}`;
  mkdirSync(new URL(folder, dist), { recursive: true });
  writeFileSync(new URL(`${folder}/home.html`, dist), officeHtml(shell, site));
  nginx += `
server {
 listen 8080;
 server_name ${site.host};
 root /usr/share/nginx/html;
 add_header X-Content-Type-Options nosniff always;
 add_header X-Frame-Options SAMEORIGIN always;
 add_header X-Robots-Tag noindex always;
 location ^~ /api/ { return 404; } # The load balancer must route /api/* to onboarding-backend.
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.nginx\\.conf$ { return 404; }
 location ~ \\.webmanifest$ { default_type application/manifest+json; add_header Cache-Control no-cache; try_files $uri =404; }
 location ^~ /assets/ { try_files $uri =404; }
 location /office/ { try_files $uri =404; }
 location / { add_header Cache-Control no-store; try_files $uri /${folder}/home.html =404; }
}
`;
}
// The Docker image already installs this generated nginx include.
const config = new URL('itsco-public.nginx.conf', dist);
writeFileSync(config, readFileSync(config, 'utf8') + nginx);
