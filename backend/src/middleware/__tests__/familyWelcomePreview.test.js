import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({protect:vi.fn(),security:vi.fn()}));
vi.mock('../../services/activityProtection.service.js',()=>({protectFileResource:m.protect}));
vi.mock('../../services/accountSecurity.service.js',()=>({accountSecurityState:m.security}));
import {fileOperation,enforceActivityProtection} from '../activityProtection.middleware.js';
import {enforceAccountSecurity} from '../accountSecurity.middleware.js';
const req=(url='/api/school-contact-plan/pdf-preview?agencyId=2&schoolId=193',method='GET')=>({originalUrl:url,method,user:{id:8,role:'provider'}});
beforeEach(()=>{vi.clearAllMocks();m.protect.mockRejectedValue(Object.assign(new Error('Client-file review hold'),{status:403}));});
it('allows own non-client introduction previews without spending client-file allowances or releasing a hold',async()=>{
 for(const method of ['GET','HEAD']){const next=vi.fn();await enforceActivityProtection(req(undefined,method),{},next);expect(next).toHaveBeenCalledWith();}
 expect(m.protect).not.toHaveBeenCalled();
});
it.each(['/api/phi-documents/22/view','/api/phi-documents/22/download','/api/clients/99/export.pdf','/api/school-contact-plan/pdf-preview/extra'])('retains client-file protections for %s',async path=>{
 expect(fileOperation(req(path))).toBe(true);const next=vi.fn();await enforceActivityProtection(req(path),{},next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
});
it('retains sign-in verification for a public-profile PDF preview',async()=>{
 m.security.mockResolvedValue({required:true,verified:false,enabled:true});const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await enforceAccountSecurity(req(),res,next);expect(res.status).toHaveBeenCalledWith(403);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.objectContaining({code:'MFA_REQUIRED'})}));expect(next).not.toHaveBeenCalled();
});
