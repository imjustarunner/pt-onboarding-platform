import { mkdirSync, writeFileSync, copyFileSync, cpSync } from 'node:fs';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { pages, renderWebsite } from '../src/auricwell/website/render.mjs';
const out = fileURLToPath(new URL('../dist/auricwell/', import.meta.url));
mkdirSync(`${out}site`, {recursive:true});
for (const section of Object.keys(pages)) {
  writeFileSync(`${out}site/${section || 'home'}.html`, renderWebsite(section, {base:'/auricwell', email:'support@auricwell.com'}));
}
copyFileSync(fileURLToPath(new URL('../src/auricwell/website/website.css', import.meta.url)), `${out}website.css`);
copyFileSync(fileURLToPath(new URL('../public/auricwell/logo.png', import.meta.url)), `${out}logo.png`);
cpSync(fileURLToPath(new URL('../public/auricwell/examples/', import.meta.url)), `${out}examples`, {recursive:true});
await build({configFile:false,root:fileURLToPath(new URL('../',import.meta.url)),plugins:[vue()],define:{'process.env.NODE_ENV':'"production"'},build:{outDir:out,emptyOutDir:false,copyPublicDir:false,lib:{entry:fileURLToPath(new URL('../src/auricwell/website/website-demo.js',import.meta.url)),formats:['es'],fileName:()=> 'website-demo.js'},rollupOptions:{output:{assetFileNames:asset=>asset.name?.endsWith('.css')?'website-demo.css':'[name][extname]'}}}});
console.log('Built five static AuricWell website pages.');
