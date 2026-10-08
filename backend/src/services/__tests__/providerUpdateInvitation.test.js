import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../providerYearUpdate.service.js',()=>({listSchoolAssignedProviders:vi.fn(async()=>[])}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolveSenderIdentityForSend:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>({id:2,slug:'itsco'}))}}));
import pool from '../../config/database.js';
import {sendPush} from '../providerUpdate.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {resolveSenderIdentityForSend} from '../emailSenderIdentityResolver.service.js';
import {listSchoolAssignedProviders} from '../providerYearUpdate.service.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>{
 if(sql.includes('SELECT * FROM provider_update_pushes'))return [[{id:2,agency_id:2,status:'draft',section_config_json:{},amendment_plan_json:{documentTemplateId:99}}]];
 if(sql.includes('SELECT u.id AS provider_user_id'))return [[{provider_user_id:496,first_name:'Test',last_name:'Staff',role:'provider',work_email:'work@example.test'}]];
 if(sql.includes('SELECT u.id, u.work_email'))return [[{id:496,role:'provider',work_email:'work@example.test'}]];
 if(sql.includes('SELECT * FROM provider_update_recipients'))return [[{id:1,token:'a'.repeat(48)}]];
 if(sql.trim().startsWith('SELECT'))return [[]];
 return [{affectedRows:1}];
});});
it('prepares an editable scoped link without email delivery or amendment assignment',async()=>{
 const result=await sendPush({pushId:2,agencyId:2,sentByUserId:501,providerUserIds:[496],prepareOnly:true});
 expect(result.results).toHaveLength(1);
 expect(result.results[0]).toMatchObject({providerUserId:496,deliveryStatus:'link_prepared'});
 expect(result.results[0].link).toContain('a'.repeat(48));
 expect(sendEmailFromIdentity).not.toHaveBeenCalled();expect(resolveSenderIdentityForSend).not.toHaveBeenCalled();
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO provider_update_sends')||sql.includes('INSERT INTO tasks'))).toBe(false);
});
it('does not prepare invitations for former staff left in school assignments',async()=>{
 listSchoolAssignedProviders.mockResolvedValueOnce([{provider_user_id:999,first_name:'Former',last_name:'Staff'}]);
 await expect(sendPush({pushId:2,agencyId:2,sentByUserId:501,providerUserIds:[999],prepareOnly:true})).rejects.toThrow('No providers to send');
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO provider_update_recipients'))).toBe(false);
 expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
