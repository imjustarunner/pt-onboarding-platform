import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),permission:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/transitionClientImportAccess.service.js',()=>({hasTransitionClientImportAccess:m.permission}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import {transitionImportOperation,transitionClientImportAccess} from '../transitionClientImport.middleware.js';
it.each(['GET', 'POST'])('allows %s contact review only on the scoped import route', method => {
  expect(transitionImportOperation(method, '/api/clients/42/chart-import/contacts/preview')).toEqual({ clientId: 42 });
  expect(transitionImportOperation(method, '/api/clients/42/chart-import/contacts/export')).toBeNull();
});

beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue(true);m.execute.mockResolvedValue([[{agency_id:2}]]);m.audit.mockResolvedValue({id:7});});
const request=(overrides={})=>({method:'POST',originalUrl:'/api/clients',body:{recordsImport:true,agency_id:2},query:{},get:name=>name==='X-Agency-Id'?'2':null,user:{id:55,role:'provider_plus',sessionId:'synthetic'},...overrides});
it('allows only nonbillable import operations and never roles, deletion, signatures, claims or prices',()=>{
 expect(transitionImportOperation('POST','/api/clients',{recordsImport:true})).toEqual({});
 expect(transitionImportOperation('POST','/api/clients/1/intake-note/import',{recordsImport:{text:'Synthetic'}})).toEqual({clientId:1});
 expect(transitionImportOperation('POST','/api/medical-billing/treatment-plans',{clientId:1,recordsImport:{text:'Synthetic'},status:'draft',finalize:false})).toEqual({clientId:1});
 for(const [method,path,body] of [['POST','/api/clients',{}],['POST','/api/clients/1/intake-note/import',{}],['POST','/api/medical-billing/treatment-plans',{recordsImport:{},finalize:true}],['DELETE','/api/clients/1',{}],['PUT','/api/users/55',{}],['POST','/api/medical-billing/claims',{}],['PUT','/api/family-billing/account/clients/1/service-rates/H0004',{}],['POST','/api/clients/1/intake-note/sign',{}]])expect(transitionImportOperation(method,path,body)).toBeNull();
});
it('keeps the real user and session, audits delegation and never changes the shared account object',async()=>{
 const req=request(),original=req.user,next=vi.fn();await transitionClientImportAccess(req,{},next);
 expect(req.user).toMatchObject({id:55,sessionId:'synthetic',role:'admin',clientImportDelegation:{agencyId:2,originalRole:'provider_plus'}});
 expect(original.role).toBe('provider_plus');expect(req.user).not.toBe(original);expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({user:expect.objectContaining({id:55,role:'admin'})}),expect.objectContaining({required:true,metadata:expect.objectContaining({originalRole:'provider_plus'})}));expect(next).toHaveBeenCalledWith();
});
it('does not elevate missing grants, foreign charts, mixed practice selectors or unrelated endpoints',async()=>{
 for(const input of [{originalUrl:'/api/users/55',method:'PUT'},{body:{recordsImport:true,agency_id:6}},{originalUrl:'/api/clients/1',method:'GET'}]){
  m.execute.mockResolvedValue([[{agency_id:6}]]);const req=request(input),original=req.user,next=vi.fn();await transitionClientImportAccess(req,{},next);expect(req.user).toBe(original);expect(next).toHaveBeenCalledWith();
 }
 m.permission.mockResolvedValue(false);const req=request();await transitionClientImportAccess(req,{},vi.fn());expect(req.user.role).toBe('provider_plus');
});
it('holds delegation when its audit cannot be retained',async()=>{
 m.audit.mockRejectedValue(new Error('Audit unavailable'));const req=request(),next=vi.fn();await transitionClientImportAccess(req,{},next);expect(req.user.role).toBe('provider_plus');expect(next).toHaveBeenCalledWith(expect.any(Error));
});
