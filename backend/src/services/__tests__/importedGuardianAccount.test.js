import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),contact:vi.fn(),read:vi.fn(),save:vi.fn(),prepare:vi.fn(),seed:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../../models/ClientContactAffiliation.model.js',()=>({default:{findById:m.contact}}));
vi.mock('../clientChartImport.service.js',()=>({readChartRecord:m.read,saveChartRecord:m.save}));
vi.mock('../guardianAccountPreparation.service.js',()=>({prepareGuardianAccount:m.prepare}));
vi.mock('../importedGuardianNotifications.service.js',()=>({seedImportedGuardianNotifications:m.seed}));
import {prepareImportedGuardianAccount} from '../importedGuardianAccount.service.js';
const scope={agencyId:2,clientId:12};
beforeEach(()=>{vi.resetAllMocks();m.client.mockResolvedValue({id:12,agency_id:2});m.read.mockResolvedValue({value:{51:{fullName:'Second Parent',email:'second@example.test',appointmentReminders:'Text (SMS) and Email'}}});m.contact.mockResolvedValue({id:51,client_id:12,agency_id:2,is_active:1,contact_is_active:1,contact_full_name:'Second Parent',contact_email:'second@example.test',contact_phone:'720-555-0102',relationship_type:'Father'});m.prepare.mockResolvedValue({prepared:true,userId:40,created:false,invitationSent:false,requiresAccessReview:true});m.seed.mockResolvedValue({status:'pending_portal',channels:{email:true,sms:true}});});
it('adds a second guardian from their saved contact without reimporting text or changing the first',async()=>{
 const result=await prepareImportedGuardianAccount(scope,51,10);
 expect(m.prepare).toHaveBeenCalledExactlyOnceWith({client:{id:12,agency_id:2},profile:{fullName:'Second Parent',firstName:'Second',lastName:'Parent',email:'second@example.test',phone:'720-555-0102',relationship:'Father'},actorUserId:10});
 expect(result.portalAccount).toMatchObject({userId:40,created:false,invitationSent:false});expect(m.save).toHaveBeenCalledWith(scope,'contacts',0,{51:expect.objectContaining({fullName:'Second Parent',notificationImport:{status:'pending_portal',channels:{email:true,sms:true}}})},10);
});
it.each([{client_id:99},{agency_id:99},{is_active:0},{contact_is_active:0}])('rejects an unrelated or inactive contact %j',async change=>{const current=await m.contact();m.contact.mockResolvedValue({...current,...change});await expect(prepareImportedGuardianAccount(scope,51,10)).rejects.toMatchObject({status:404});expect(m.prepare).not.toHaveBeenCalled();});
it('requires a saved source contact and reports missing email without altering other accounts',async()=>{
 m.read.mockResolvedValue({value:{}});await expect(prepareImportedGuardianAccount(scope,51,10)).rejects.toMatchObject({status:404});expect(m.prepare).not.toHaveBeenCalled();
 m.read.mockResolvedValue({value:{51:{fullName:'Second Parent'}}});m.prepare.mockResolvedValue({prepared:false,reason:'A valid guardian email is required.'});await expect(prepareImportedGuardianAccount(scope,51,10)).rejects.toThrow('A valid guardian email');expect(m.save).not.toHaveBeenCalled();
});
