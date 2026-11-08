import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Keep the exact app components and brand configuration while using small web
// derivatives in the standalone marketing bundle. Original app assets stay intact.
export function narrivaWebsiteAssets(){
 const directory=fileURLToPath(new URL('../src/assets/narriva/',import.meta.url));
 return {name:'narriva-website-assets',enforce:'pre',load(id){
  const filename=id.split('?')[0];
  if(path.dirname(filename)!==directory.replace(/\/$/,'')||!filename.endsWith('.png'))return null;
  const name=path.basename(filename,'.png');
  const data=readFileSync(path.join(directory,'web',`${name}.webp`));
  return `export default ${JSON.stringify('data:image/webp;base64,'+data.toString('base64'))};`;
 }};
}
