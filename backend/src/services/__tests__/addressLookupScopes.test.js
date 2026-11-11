import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {dependentRouteAllowed} from '../dependentPortalPolicy.service.js';
import {mobileFamilyRouteAllowed} from '../mobile/familyScope.service.js';
import {previewRouteAllowed,qaPreviewRouteAllowed} from '../auricwellPreviewPolicy.js';
describe('address utility authorization remains narrow',()=>{
 it('allows only exact read-only utility actions for already authorized mobile/personal principals',()=>{
  for(const method of ['POST','GET','DELETE','PUT'])for(const path of ['/api/address-lookup/suggest','/api/address-lookup/select','/api/address-lookup/admin','/api/address-lookup/select/extra','/api/address-lookup/context/select','/api/clients/10','/api/clinical-notes/1']){
   const expected=method==='POST' && /^\/api\/address-lookup\/(suggest|select)$/.test(path);expect(mobileFamilyRouteAllowed(method,path,5),`${method} ${path}`).toBe(expected);expect(dependentRouteAllowed(method,path,5),`${method} ${path}`).toBe(expected);
  }
 });
 it('keeps verified EHR practice-bound utility reads separate from clinical write permissions',()=>{
  for(const action of ['suggest','select'])for(const role of ['support','provider','admin']){expect(previewRouteAllowed('POST',`/address-lookup/${action}`)).toBe(true);expect(qaPreviewRouteAllowed('POST',`/address-lookup/${action}`,{id:5,role},450)).toBe(true);}
  expect(qaPreviewRouteAllowed('POST','/clinical-notes/drafts',{id:5,role:'support'},450)).toBe(false);
  for(const path of ['/address-lookup/context/select','/address-lookup/select/extra','/address-lookup/admin'])expect(previewRouteAllowed('POST',path)).toBe(false);
  expect(previewRouteAllowed('GET','/address-lookup/suggest')).toBe(false);
 });
 it('mounts family-cookie actions after original family-session and same-site checks, not on workplace routes',()=>{
  const source=readFileSync(new URL('../../routes/family.routes.js',import.meta.url),'utf8');expect(source.indexOf('router.use(requireFamilySession)')).toBeLessThan(source.indexOf("router.post('/address-lookup/suggest'"));expect(source.indexOf("req.get('sec-fetch-site')")).toBeLessThan(source.indexOf("router.post('/address-lookup/suggest'"));expect(source).toContain('addressAutocompleteHandlers.familySuggest');expect(source).toContain('addressAutocompleteHandlers.familySelect');
 });
});
