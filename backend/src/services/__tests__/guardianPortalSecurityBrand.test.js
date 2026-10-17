import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import {inferAgencyMailDomain} from '../tenantMessageMailboxes.service.js';
import {guardianPortalSecurityBrand} from '../guardianPortalSecurityBrand.service.js';
beforeEach(()=>{vi.clearAllMocks();Agency.findById.mockResolvedValue({name:'Next Level Up',feature_flags:{medicalBillingEnabled:true}});inferAgencyMailDomain.mockResolvedValue('nextleveluplcc.com');});
it('uses the tutoring agency sender even when that agency also supports clinical records',async()=>{
 pool.execute.mockResolvedValue([[{agency_id:4,client_type:'basic_nonclinical'}]]);
 expect(await guardianPortalSecurityBrand({user:{id:20,agencyId:4},body:{agencyId:99,from:'attacker@example.invalid'}})).toMatchObject({agencyId:4,fromEmail:'portal@nextleveluplcc.com',products:[]});
 expect(pool.execute.mock.calls[0][1]).toEqual([20,4]);expect(Agency.findById).toHaveBeenCalledWith(4);
});
it('uses AuricWell for a clinical family within their caring agency',async()=>{
 pool.execute.mockResolvedValue([[{agency_id:3,client_type:'clinical'}]]);Agency.findById.mockResolvedValue({name:'ITSCO',feature_flags:{medicalBillingEnabled:true}});inferAgencyMailDomain.mockResolvedValue('itsco.health');
 expect(await guardianPortalSecurityBrand({user:{id:20}})).toMatchObject({agencyId:3,fromEmail:'portal@auricwell.com',replyTo:'support@itsco.health'});
});
it('uses only an active agency membership if no current client links exist',async()=>{
 pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{agency_id:4}]]);
 expect(await guardianPortalSecurityBrand({user:{id:20}})).toMatchObject({agencyId:4,fromEmail:'portal@nextleveluplcc.com'});
 expect(pool.execute.mock.calls[1][0]).toContain("a.organization_type='agency'");
});
it('does not invent a sender or use a browser-provided agency when no membership is available',async()=>{
 pool.execute.mockResolvedValue([[]]);await expect(guardianPortalSecurityBrand({user:{id:20},body:{agencyId:99}})).rejects.toMatchObject({code:'MFA_EMAIL_UNAVAILABLE'});expect(Agency.findById).not.toHaveBeenCalled();
});
