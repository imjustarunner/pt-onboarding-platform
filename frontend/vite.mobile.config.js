import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),base:'./',plugins:[vue(),{name:'mobile-development-entry',configureServer(server){server.middlewares.use((req,_res,next)=>{if(/^\/mobile(?:\/(?:workspace|callback|connect))?(?:\?|$)/.test(req.url || ''))req.url='/mobile.html'+((req.url || '').includes('?')?'?'+req.url.split('?').slice(1).join('?'):'');next();});}}],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  define:{'import.meta.env.VITE_AURICWELL_MOBILE':'true'},
  publicDir:false,
  build:{outDir:'dist-auricwell-mobile',rollupOptions:{input:fileURLToPath(new URL('./mobile.html',import.meta.url))}}
});
