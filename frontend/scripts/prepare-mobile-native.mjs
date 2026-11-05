import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
const out=new URL('../dist-auricwell-mobile/',import.meta.url);
const html=await readFile(new URL('mobile.html',out),'utf8');
await writeFile(new URL('index.html',out),html.replace(/<link rel="manifest"[^>]*>/,'').replace(/<link rel="apple-touch-icon"[^>]*>/,''));
await mkdir(new URL('auricwell/',out),{recursive:true});
for(const name of ['logo.png','mark.svg','mark.png'])await copyFile(new URL(`../public/auricwell/${name}`,import.meta.url),new URL(`auricwell/${name}`,out));

await mkdir(new URL('assets/conversa/',out),{recursive:true});
await copyFile(new URL('../public/assets/conversa/mark.svg',import.meta.url),new URL('assets/conversa/mark.svg',out));
