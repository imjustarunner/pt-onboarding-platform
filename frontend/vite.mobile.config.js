import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),base:'./',plugins:[vue()],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  define:{'import.meta.env.VITE_AURICWELL_MOBILE':'true'},
  publicDir:false,
  build:{outDir:'dist-auricwell-mobile',rollupOptions:{input:fileURLToPath(new URL('./mobile.html',import.meta.url))}}
});
