import {it,expect,vi} from 'vitest';
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(req,res,next)=>next(),requireBackofficeAdmin:(req,res,next)=>next()}));
vi.mock('../../controllers/providerImport.controller.js',()=>Object.fromEntries(['previewProviderImport','applyProviderImport','bulkCreateProvidersFromSchoolList','bulkUpdateProviderEmails','importEmployeeInfo','importKvPaste','purgeProviderProfileValues'].map(name=>[name,(req,res)=>res.json({allowed:true})])));
vi.mock('../../controllers/providerSearch.controller.js',()=>Object.fromEntries(['rebuildProviderSearchIndex','searchProviders','compileProviderSearch','getClinicalFacetsBatch'].map(name=>[name,(req,res)=>res.json({allowed:true})])));
import imports from '../providerImport.routes.js';
import search from '../providerSearch.routes.js';
function request(router,url,role='support') {
 return new Promise((resolve,reject)=>router.handle({method:'POST',url,headers:{},body:{agencyId:450},user:{id:1434,role}},
  {statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});}},e=>e?reject(e):resolve({status:404})));
}
it.each(['/preview','/apply','/bulk-create','/email-update','/employee-info','/kv-paste','/purge'])('support cannot invoke profile administration at %s',async url=>{
 expect(await request(imports,url)).toMatchObject({status:403,body:{error:{code:'ACCOUNT_ADMIN_REQUIRED'}}});
});
it('allows administrator imports and keeps support provider search available',async()=>{
 expect((await request(imports,'/preview','admin')).status).toBe(200);
 expect((await request(imports,'/preview','super_admin')).status).toBe(200);
 expect((await request(search,'/search')).status).toBe(200);
 expect((await request(search,'/rebuild')).status).toBe(403);
});
