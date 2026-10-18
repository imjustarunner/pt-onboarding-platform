import { auricwellLegalPages } from './legal-pages.mjs';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const waitingMedia=['video','audio/waiting-room'].flatMap(dir=>{
 const root=new URL(`../frontend/public/assets/${dir}/`,import.meta.url);
 return readdirSync(root).map(name=>({url:`/assets/${dir}/${name}`,path:fileURLToPath(new URL(name,root))}));
});
waitingMedia.push({url:'/auricwell-logo.png',path:fileURLToPath(new URL('./public/auricwell-logo.png',import.meta.url))});
waitingMedia.push({url:'/assets/auricwell-session-logo.png',path:fileURLToPath(new URL('./public/auricwell-logo.png',import.meta.url))});
const sharedWaitingMedia={
 name:'shared-waiting-room-media',
 generateBundle(){for(const file of waitingMedia)this.emitFile({type:'asset',fileName:file.url.slice(1),source:readFileSync(file.path)});},
 configureServer(server){server.middlewares.use((req,res,next)=>{const file=waitingMedia.find(f=>f.url===req.url?.split('?')[0]);if(!file)return next();res.setHeader('Content-Type',file.url.endsWith('.mp4')?'video/mp4':file.url.endsWith('.png')?'image/png':'audio/mpeg');res.end(readFileSync(file.path));});}
};
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [{ name: 'shared-public-imports', enforce: 'pre', resolveId(source, importer) {
    if (source === '../router' && importer?.endsWith('/frontend/src/store/auth.js')) return fileURLToPath(new URL('./src/router.js', import.meta.url));
    if (!source.startsWith('/') || !importer?.includes('/frontend/src/')) return null;
    const file = fileURLToPath(new URL(`../frontend/public${source}`, import.meta.url));
    return existsSync(file) ? file : null;
  } }, vue(),sharedWaitingMedia,auricwellLegalPages],
  resolve: { alias: { "@": fileURLToPath(new URL("../frontend/src", import.meta.url)) }, dedupe: ["vue", "vue-router"] },
  server: {
    port: 5174,
    proxy: {
      "/api/auricwell-sms/webhook": {
        target: process.env.AURICWELL_API_UPSTREAM || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/api/auricwell": {
        target: process.env.AURICWELL_API_UPSTREAM || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: { sourcemap: false },
});
