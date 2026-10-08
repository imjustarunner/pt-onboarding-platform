import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root,base:'/plottline/',publicDir:false,plugins:[vue()],build:{outDir:fileURLToPath(new URL('../dist-plotline',import.meta.url)),emptyOutDir:true},server:{host:'127.0.0.1',port:5176}});
