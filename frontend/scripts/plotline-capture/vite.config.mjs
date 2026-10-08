import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('../../',import.meta.url)),plugins:[vue()],resolve:{alias:{'@':fileURLToPath(new URL('../../src',import.meta.url))}},optimizeDeps:{entries:['scripts/plotline-capture/index.html']},server:{host:'127.0.0.1',port:5177,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url)),realpathSync(fileURLToPath(new URL('../../node_modules',import.meta.url)))]}}});
