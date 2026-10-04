import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = fileURLToPath(new URL('../../src', import.meta.url));
export default defineConfig({
  root:directory, resolve:{alias:{'@':source}},
  plugins:[vue(),{name:'offline-interface-capture',enforce:'pre',resolveId(id){
    if (/services\/api(?:\.js)?$/.test(id)) return `${directory}api.js`;
  }}],
  server:{host:'127.0.0.1',port:5191,fs:{allow:[fileURLToPath(new URL('../..',import.meta.url))]}}
});
