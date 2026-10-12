import {readFileSync, writeFileSync, mkdirSync, appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderWebsite, pages as auricwellPages} from '../src/auricwell/website/render.mjs';
import {pages as michaelPages, renderSite} from '../src/michael/site.mjs';
import {plotlinePages} from '../src/content/plotlineWebsite.js';
import {fundthredPages} from '../src/content/fundthredWebsite.js';
import {injectPublicFavicon} from '../src/utils/publicBrowserBranding.js';
import {buildShareMeta, injectShareMetaIntoHtml} from '../src/utils/sharePreview.js';
const dist=fileURLToPath(new URL('../dist',import.meta.url));
const shell=readFileSync(`${dist}/index.html`,'utf8');
const config=`${dist}/itsco-public.nginx.conf`;
const page=(slug,name,html)=>{mkdirSync(`${dist}/_public-sites/${slug}`,{recursive:true});writeFileSync(`${dist}/_public-sites/${slug}/${name}.html`,html);return `/_public-sites/${slug}/${name}.html`;};
const location=(path,file)=>`location = ${path} { add_header Cache-Control "no-cache"; try_files ${file} =404; }`;
const shared=`root /usr/share/nginx/html;
 add_header X-Content-Type-Options nosniff always;
 location = /api { return 404; }
 location ^~ /api/ { return 404; }
 location ^~ /uploads/ { return 404; }
 location ^~ /_public-sites/ { return 404; }
 location ~ \\.conf$ { return 404; }
 location ~* \\.(js|mjs|css|png|jpg|jpeg|svg|webp|ico|woff2?|json|webmanifest)$ { try_files $uri =404; }
 location = /robots.txt { default_type text/plain; return 200 "User-agent: *\\nAllow: /\\nDisallow: /app\\nDisallow: /login\\nDisallow: /family\\nDisallow: /api/\\n"; }`;
function server(host,body,fallback='/index.html') {appendFileSync(config,`\nserver { listen 8080; server_name ${host};\n ${shared}\n ${body}\n location / { add_header Cache-Control "no-store" always; add_header X-Robots-Tag "noindex" always; try_files $uri ${fallback} =404; }\n}\n`);}
function redirect(host,origin,extra=''){appendFileSync(config,`\nserver { listen 8080; server_name ${host}; ${extra} location / { return 302 ${origin}$request_uri; } }\n`);}

server('fundthred.com',Object.keys(fundthredPages).map(key=>location(key==='home'?'/':`/${key}`,`/_public-sites/fundthred/${key}.html`)).join('\n')+`
 location = /sitemap.xml { default_type application/xml; try_files /_public-sites/fundthred/sitemap.xml =404; }
 location = /fundthred { return 302 https://fundthred.com/$is_args$args; }
 location ~ ^/fundthred/(.*)$ { return 302 https://fundthred.com/$1$is_args$args; }`);
redirect('www.fundthred.com','https://fundthred.com');
server('plotlinepo.com',Object.keys(plotlinePages).map(key=>location(key==='home'?'/':`/${key}`,`/_public-sites/plotline${key==='home'?'':'/'+key}/index.html`)).join('\n')+`
 location = /sitemap.xml { default_type application/xml; try_files /_public-sites/plotline/sitemap.xml =404; }
 location ^~ /plottline/assets/ { try_files $uri =404; }
 location = /plottline { return 302 https://plotlinepo.com/$is_args$args; }
 location = /plotline { return 302 https://plotlinepo.com/$is_args$args; }
 location ~ ^/plott?line/(.*)$ { return 302 https://plotlinepo.com/$1$is_args$args; }`);
redirect('www.plotlinepo.com','https://plotlinepo.com');
server('schoolcarebridge.org',`
 ${location('/', '/_public-sites/schoolcarebridge/home.html')}
 location = /demo/ { return 302 https://schoolcarebridge.org/demo$is_args$args; }
 location = /demo { add_header Cache-Control no-store; add_header X-Robots-Tag noindex always; try_files /schoolcarebridge-demo.html =404; }
 ${['terms','privacypolicy','platformhipaa','messaging'].map(type=>location('/'+type,'/_public-sites/schoolcarebridge/legal-'+type+'.html')).join('\n')}
 location = /schoolcarebridge { return 302 https://schoolcarebridge.org/$is_args$args; }
 location ~ ^/schoolcarebridge/(.*)$ { return 302 https://schoolcarebridge.org/$1$is_args$args; }`,'/_public-sites/schoolcarebridge/home.html');
redirect('www.schoolcarebridge.org','https://schoolcarebridge.org');
redirect('app.schoolcarebridge.org','https://schoolcarebridge.org', 'location = / { return 302 https://schoolcarebridge.org/app$is_args$args; }');
// QV retains its PIN-only surface and existing authorization, separate from the school app.
server('qv.app.schoolcarebridge.org','');
const family=page('family','home',injectPublicFavicon(injectShareMetaIntoHtml(shell,buildShareMeta({host:'familycommandcenterhub.com',path:'/'})), 'familycommandcenterhub.com'));
server('familycommandcenterhub.com',location('/',family),family);
redirect('www.familycommandcenterhub.com','https://familycommandcenterhub.com');

const michaelLocations=Object.keys(michaelPages).map(section=>{
 let html=renderSite(section).replaceAll('https://plottwisthq.com/michael','https://michaelvmendez.com');
 // Keep scripts, styles and media at their existing paths; clean only page links.
 html=html.replace(/href="\/michael(?=\/?(?:[?#][^"]*)?")/g,'href="');
 for(const name of Object.keys(michaelPages).filter(Boolean)) html=html.replaceAll(`href="/michael/${name}"`,`href="/${name}"`).replaceAll(`href="/michael/${name}?`,`href="/${name}?`).replaceAll(`href="/michael/${name}#`,`href="/${name}#`);
 html=html.replaceAll('href=""','href="/"');
 const file=page('michael-domain',section||'home',html);
 return location(section?`/${section}`:'/',file)+`\n location = /michael${section?'/'+section:''} { return 302 https://michaelvmendez.com${section?'/'+section:'/'}$is_args$args; }`;
}).join('\n');
server('michaelvmendez.com',michaelLocations);
redirect('www.michaelvmendez.com','https://michaelvmendez.com');
const auricwellLocations=Object.keys(auricwellPages).map(section=>location(section?`/${section}`:'/',page('auricwell-domain',section||'home',renderWebsite(section,{base:'',email:'support@auricwell.com',origin:'https://auricwell.com',canonicalBase:''})))).join('\n');
server('auricwell.com',`${auricwellLocations}
 location = /app { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /auricwell.html =404; }
 location ^~ /app/ { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /auricwell.html =404; }
 location = /demo { add_header Cache-Control "no-store"; add_header X-Robots-Tag "noindex" always; try_files /auricwell-demo.html =404; }
 location = /auricwell { return 302 https://auricwell.com/$is_args$args; }
 location = /auricwell/app { return 302 https://auricwell.com/app$is_args$args; }
 location ^~ /auricwell/app/ { rewrite ^/auricwell/app/(.*)$ https://auricwell.com/app/$1 redirect; }`);
redirect('www.auricwell.com','https://auricwell.com');
// The kiosk hostname itself is generated by build-office-sites; only its old alias redirects.
console.log('Prepared dedicated product websites and app entry points.');
