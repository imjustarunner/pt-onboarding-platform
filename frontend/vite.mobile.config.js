import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),base:'./',plugins:[{name:'mobile-shared-auth-router',enforce:'pre',resolveId(id,importer){if(id==='../router' && importer?.endsWith('/store/auth.js'))return fileURLToPath(new URL('./src/mobile/routerBridge.js',import.meta.url));}},{name:'mobile-public-assets',enforce:'pre',resolveId(id){if(id.startsWith('/') && existsSync(fileURLToPath(new URL('./public'+id,import.meta.url))))return '\0mobile-public:'+Buffer.from(id).toString('base64url');},load(id){if(id.startsWith('\0mobile-public:'))return 'export default '+JSON.stringify('https://auricwell.com'+Buffer.from(id.slice('\0mobile-public:'.length).split('?')[0],'base64url').toString('utf8'));}},vue(),{name:'mobile-development-entry',configureServer(server){server.middlewares.use((req,_res,next)=>{if(/^\/mobile(?:\/(?:workspace|callback|connect|family(?:\/.*)))?(?:\?|$)/.test(req.url || ''))req.url='/mobile.html'+((req.url || '').includes('?')?'?'+req.url.split('?').slice(1).join('?'):'');next();});}}],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  define:{'import.meta.env.VITE_AURICWELL_MOBILE':'true'},
  publicDir:false,
  build:{outDir:'dist-auricwell-mobile',rollupOptions:{input:fileURLToPath(new URL('./mobile.html',import.meta.url))}}
});
