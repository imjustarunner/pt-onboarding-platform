import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function unpackPrivateLibrary(bytes,manifest) {
  if(digest(bytes)!==manifest.sha256)throw new Error('Private library bundle checksum does not match this release.');
  const archive=JSON.parse(gunzipSync(bytes,{maxOutputLength:80*1024*1024}).toString('utf8'));
  if(archive.version!==1 || !archive.files || Object.keys(archive.files).length!==Object.keys(manifest.files).length)throw new Error('Invalid private library archive.');
  return Object.entries(manifest.files).map(([name,hash])=>{
    if(!/^[a-zA-Z0-9_.\-/]+$/.test(name) || name.split('/').some(part=>!part||part==='..') || !manifest.directories.includes(name.split('/')[0]))throw new Error('Invalid private library file path.');
    const bytes=Buffer.from(archive.files[name] || '', 'base64');
    if(digest(bytes)!==hash)throw new Error('Private library file checksum mismatch.');
    return [name,bytes];
  });
}
export async function ensurePrivateLibraryContent() {
  const manifest=JSON.parse(await readFile(new URL('../privateLibraryManifest.json',import.meta.url),'utf8'));
  const root=fileURLToPath(new URL('../content/',import.meta.url));
  const present=await Promise.all(Object.entries(manifest.files).map(async([name,hash])=>{try{return digest(await readFile(path.join(root,name)))===hash;}catch{return false;}}));
  if(present.every(Boolean))return {restored:false,files:present.length};
  const bucket=process.env.PTONBOARDFILES || process.env.GCS_BUCKET_NAME;
  if(!bucket)throw new Error('Private library source is missing. Configure the app storage bucket and run restorePrivateLibraryContent.js.');
  const {Storage}=await import('@google-cloud/storage');
  const storage=new Storage({projectId:process.env.GCS_PROJECT_ID,...(process.env.GCS_KEY_FILENAME?{keyFilename:process.env.GCS_KEY_FILENAME}:{}),...(process.env.GCS_CREDENTIALS?{credentials:JSON.parse(process.env.GCS_CREDENTIALS)}:{})});
  const [bytes]=await storage.bucket(bucket).file(manifest.objectKey).download();
  const files=unpackPrivateLibrary(bytes,manifest);
  for(const [name,content] of files){const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});const temporary=target+'.restore';await writeFile(temporary,content,{mode:0o600});await rename(temporary,target);}
  return {restored:true,files:files.length};
}
