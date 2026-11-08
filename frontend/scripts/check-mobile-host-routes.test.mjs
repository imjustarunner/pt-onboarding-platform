import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {get as httpGet} from 'node:http';

test('generated auricwell.com nginx serves mobile routes and its push worker', {skip:process.env.MOBILE_NGINX_TEST!=='1',timeout:120000},async()=>{
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
    execFileSync(process.execPath,[join(frontend,'scripts/build-product-domains.mjs')],{stdio:['ignore','pipe','pipe']});
    docker('run','--detach','--name',name,'--publish','127.0.0.1::8080',
      '--volume',`${dist}:/usr/share/nginx/html:ro`,
      '--volume',`${join(dist,'itsco-public.nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,'nginx:alpine');
    started=true;
    const info=JSON.parse(docker('inspect',name))[0];
    const origin=`http://127.0.0.1:${info.NetworkSettings.Ports['8080/tcp'][0].HostPort}`;
    const requestHost=path=>new Promise((resolve,reject)=>{httpGet(origin+path,{headers:{Host:'auricwell.com'}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,headers:new Headers(response.headers),text:async()=>body}));}).on('error',reject);});
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
  } finally {
    if(started)docker('rm','--force',name);
    await rm(fixture,{recursive:true,force:true});
  }
});
