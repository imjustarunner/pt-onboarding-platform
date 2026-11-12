import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {get as httpGet} from 'node:http';

test('central and public-domain nginx serve mobile routes and exact AuricWell files', {skip:process.env.MOBILE_NGINX_TEST!=='1',timeout:120000},async()=>{
  const fixture=await mkdtemp(join(tmpdir(),'auricwell-mobile-host-'));
  const frontend=join(fixture,'frontend'),dist=join(frontend,'dist'),name=`auricwell-mobile-host-${process.pid}`;
  let started=false;
  const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try {
    await mkdir(join(frontend,'scripts'),{recursive:true});await mkdir(dist);
    await symlink(fileURLToPath(new URL('../src',import.meta.url)),join(frontend,'src'),'dir');
    await copyFile(new URL('./build-product-domains.mjs',import.meta.url),join(frontend,'scripts/build-product-domains.mjs'));
    await writeFile(join(frontend,'package.json'),'{"type":"module"}');
    await writeFile(join(dist,'index.html'),'<!doctype html><html><head><title>PORTAL-FIXTURE</title></head><body>Portal</body></html>');
    await writeFile(join(dist,'mobile.html'),'<!doctype html><html><head><title>MOBILE-FIXTURE</title></head><body>Mobile</body></html>');
    await writeFile(join(dist,'mobile-sw.js'),'self.addEventListener("push",()=>{});');
    await writeFile(join(dist,'itsco-public.nginx.conf'),'');
    const centralConfig=join(fixture,'central.nginx.conf'),legalConfig=join(fixture,'tenant-legal-locations.conf');
    await copyFile(new URL('../nginx.conf',import.meta.url),centralConfig);
    await writeFile(legalConfig,'');
    const staticFiles=[
      {path:'/auricwell/session-comments/secure-session-button.png',type:'image/png',signature:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])},
      {path:'/auricwell/session-comments/read-secure-message-button.png',type:'image/png',signature:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])},
      {path:'/auricwell/provider-training/PROVIDER-FIELD-GUIDE.pdf',type:'application/pdf',signature:Buffer.from('%PDF-')},
      {path:'/auricwell/provider-training/PROVIDER-TRANSITION-TRAINING.pptx',type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',signature:Buffer.from([0x50,0x4b,0x03,0x04])}
    ];
    for(const file of staticFiles){
      // The tracked release assets are small enough to use directly: this
      // validates real PNG/PDF/Office ZIP bytes, not an HTML-shaped placeholder.
      file.bytes=await readFile(new URL(`../public${file.path}`,import.meta.url));
      assert.deepEqual(file.bytes.subarray(0,file.signature.length),file.signature,file.path);
      const destination=join(dist,file.path.slice(1));
      await mkdir(join(destination,'..'),{recursive:true});
      await writeFile(destination,file.bytes);
    }
    execFileSync(process.execPath,[join(frontend,'scripts/build-product-domains.mjs')],{stdio:['ignore','pipe','pipe']});
    docker('run','--detach','--name',name,'--publish','127.0.0.1::8080',
      '--volume',`${dist}:/usr/share/nginx/html:ro`,
      // default.conf sorts before product-domains.conf so the real central
      // server is the fallback host, as in production, rather than a product.
      '--volume',`${centralConfig}:/etc/nginx/conf.d/default.conf:ro`,
      '--volume',`${join(dist,'itsco-public.nginx.conf')}:/etc/nginx/conf.d/product-domains.conf:ro`,
      '--volume',`${legalConfig}:/etc/nginx/tenant-legal-locations.conf:ro`,'nginx:alpine');
    started=true;
    const info=JSON.parse(docker('inspect',name))[0];
    const origin=`http://127.0.0.1:${info.NetworkSettings.Ports['8080/tcp'][0].HostPort}`;
    const requestHost=(path,host='auricwell.com')=>new Promise((resolve,reject)=>{httpGet(origin+path,{headers:{Host:host}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);response.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:response.statusCode,headers:new Headers(response.headers),bytes,text:async()=>bytes.toString('utf8')});});}).on('error',reject);});
    for(let attempt=0;attempt<30;attempt++) {
      try {await requestHost('/mobile');break;}
      catch(error){if(attempt===29)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
    }
    for(const path of ['/mobile','/mobile/','/mobile/workspace?kind=chat&id=2','/mobile/family/synthetic/guardian?panel=family','/mobile/family/synthetic/guardian/waivers','/mobile/connect','/mobile/callback','/mobile.html']) {
      const response=await requestHost(path);
      assert.equal(response.status,200,path);assert.match(await response.text(),/MOBILE-FIXTURE/,path);
      assert.match(response.headers.get('cache-control'),/no-store/,path);
      assert.match(response.headers.get('x-robots-tag'),/noindex/,path);
    }
    const worker=await requestHost('/mobile-sw.js');
    assert.equal(worker.status,200);assert.match(worker.headers.get('cache-control'),/no-cache/);
    assert.equal(worker.headers.get('service-worker-allowed'),'/mobile/');
    const home=await requestHost('/');assert.equal(home.status,200);assert.doesNotMatch(await home.text(),/MOBILE-FIXTURE/);
    for(const host of ['app.itsco.health','auricwell.com','schoolcarebridge.org']){
      for(const file of staticFiles){
        const context=`${host}${file.path}`,response=await requestHost(file.path,host);
        assert.equal(response.status,200,context);
        assert.equal(response.headers.get('location'),null,context);
        assert.equal(response.headers.get('content-type'),file.type,context);
        assert.deepEqual(response.bytes,file.bytes,context);
        assert.match(response.headers.get('cache-control'),/no-cache/,context);
        assert.equal(response.headers.get('x-content-type-options'),'nosniff',context);
      }
      for(const path of ['/auricwell/session-comments/missing.png','/auricwell/provider-training/missing.pdf','/auricwell/provider-training/missing.pptx']){
        const context=`${host}${path}`,response=await requestHost(path,host);
        assert.equal(response.status,404,context);
        assert.equal(response.headers.get('location'),null,context);
        assert.doesNotMatch(await response.text(),/PORTAL-FIXTURE|MOBILE-FIXTURE/,context);
        assert.match(response.headers.get('cache-control'),/no-cache/,context);
        assert.equal(response.headers.get('x-content-type-options'),'nosniff',context);
      }
    }
  } finally {
    if(started)docker('rm','--force',name);
    await rm(fixture,{recursive:true,force:true});
  }
});
