import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tenantLegalProfiles, tenantLegalLinks } from '../src/content/tenantLegalProfiles.js';
import { renderItscoLegalHtml } from '../src/utils/itscoLegalHtml.js';
const destination=fileURLToPath(new URL('../../deliverables/tenant-legal/',import.meta.url));
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
mkdirSync(destination,{recursive:true});
const cards=[];
for(const profile of Object.values(tenantLegalProfiles)) {
  const dir=`${destination}/${profile.slug}`;mkdirSync(dir,{recursive:true});
  let logo='';
  if(profile.logo && existsSync(publicRoot+profile.logo)) {
    const ext=profile.logo.split('.').pop(),mime=ext==='svg'?'image/svg+xml':`image/${ext}`;
    logo=`data:${mime};base64,${readFileSync(publicRoot+profile.logo).toString('base64')}`;
  }
  for(const {type} of tenantLegalLinks(profile)) writeFileSync(`${dir}/${type}.html`,renderItscoLegalHtml(type,profile,{logo}));
  cards.push(`<section style="border-top:4px solid ${profile.color}"><h2>${profile.name}</h2><p>${profile.kind==='healthcare'?'Clinical privacy notice included':'Service-specific health information notice included'}</p>${tenantLegalLinks(profile).map(l=>`<p><a href="${profile.slug}/${l.type}.html">${l.label}</a></p>`).join('')}</section>`);
}
writeFileSync(`${destination}/index.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tenant policy review</title><style>body{font:16px/1.6 system-ui;background:#f7f8f5;color:#243e3c;margin:0}main{max-width:1150px;margin:auto;padding:32px}h1{font-size:36px}article{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}section{background:white;padding:24px;border-radius:8px}a{color:#24594c}</style></head><body><main><h1>Tenant policy review</h1><p>Prepared October 4, 2026. These are local review copies; they have not been published. Each page can be printed or saved as PDF from your browser.</p><article>${cards.join('')}</article></main></body></html>`);
console.log(`Prepared ${cards.length} branded policy sets in ${destination}`);
