import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),agencies:vi.fn(),link:vi.fn(),financial:vi.fn(),support:vi.fn(),get:vi.fn(),put:vi.fn(),audit:vi.fn(),post:vi.fn()}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user,getAgencies:m.agencies}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:m.link}}));
vi.mock('../../services/guardianFinancialWorkspace.service.js',()=>({guardianFinancialWorkspace:m.financial}));
vi.mock('../../services/clientAccountSupportAccess.service.js',()=>({requireClientAccountSupport:m.support}));
vi.mock('../../services/sessionNotification.service.js',()=>({getClientPreferences:m.get,putClientPreferences:m.put}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
vi.mock('../agencyAnnouncements.controller.js',()=>({createAgencyScheduledAnnouncement:m.post}));
import {postProfileAnnouncement,saveSessionPreferences,getSessionPreferences} from '../guardianAccountWorkspace.controller.js';
const req=body=>({params:{id:'20',clientId:'4'},user:{id:7,role:'admin'},body});
const res=()=>({json:vi.fn(),set:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:20,role:'client_guardian'});m.agencies.mockResolvedValue([{id:2}]);m.support.mockResolvedValue({id:4,agency_id:2});m.link.mockResolvedValue({permissions_json:{}});m.get.mockResolvedValue({channels:{sms:false,email:true},optionalRemindersEnabled:false,reminderLead:{hours:24}});});
it('forces one guardian recipient on the server, even if the browser supplies a broadcast audience',async()=>{
 const request=req({agencyId:2,audience:'everyone',recipientUserIds:[99],recipient_user_ids:[]});await postProfileAnnouncement(request,res(),vi.fn());
 const scoped=m.post.mock.calls[0][0];expect(scoped.body).toMatchObject({audience:'specific_users',recipientUserIds:[20],recipient_user_ids:[20]});expect(scoped.params.id).toBe('2');expect(scoped.user).toBe(request.user);
});
it('rejects an organization outside this guardian account',async()=>{
 const next=vi.fn();await postProfileAnnouncement(req({agencyId:3}),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.post).not.toHaveBeenCalled();
});
it('saves categories and channel choices without accepting consent evidence or altering the audit actor',async()=>{
 const request=req({optionalRemindersEnabled:true,channels:{sms:true,email:true},evidence:{source:'inbound_start'},relationshipRevoked:false});
 await saveSessionPreferences(request,res(),vi.fn());
 expect(m.put).toHaveBeenCalledWith(2,4,expect.objectContaining({optionalRemindersEnabled:true,channels:{sms:true,email:true,in_app:true,phone:false},reminderLead:{hours:24}}),20);
 expect(m.put.mock.calls[0][2]).not.toHaveProperty('evidence');expect(m.put.mock.calls[0][2]).not.toHaveProperty('relationshipRevoked');expect(m.audit.mock.calls[0][0]).toBe(request);
});
it('rejects preference changes outside client account support access',async()=>{
 m.support.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));const next=vi.fn();await saveSessionPreferences(req({optionalRemindersEnabled:true}),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.get).not.toHaveBeenCalled();expect(m.put).not.toHaveBeenCalled();
});
it('rejects a revoked or missing relationship before reading preferences',async()=>{
 m.link.mockResolvedValue({permissions_json:{relationshipRevoked:true}});const next=vi.fn();await getSessionPreferences(req({}),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.get).not.toHaveBeenCalled();
});
