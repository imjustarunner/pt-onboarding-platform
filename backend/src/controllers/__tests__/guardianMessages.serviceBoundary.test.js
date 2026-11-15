import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({context:vi.fn(),shared:vi.fn(),history:vi.fn(),execute:vi.fn(),mail:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/clientServiceEnrollment.service.js',()=>({guardianServiceContext:m.context,guardianCareContexts:vi.fn()}));
vi.mock('../../services/guardianSharedMessages.service.js',()=>({ensureSharedChildThread:m.shared}));
vi.mock('../../services/familySecureHistory.service.js',()=>({listFamilySecureHistory:m.history}));
vi.mock('../../services/clientSecureConversation.service.js',()=>({refreshClientSecureAccess:vi.fn(),ensureClientSecureConversation:vi.fn()}));
vi.mock('../../services/familySecureMessageAccess.service.js',()=>({familyMessageVisibilitySql:()=> '1=1'}));
vi.mock('../../services/portalMailbox.service.js',()=>({listPortalEmails:m.mail}));
vi.mock('../chat.controller.js',()=>({findOrCreateDirectThread:vi.fn(),listMessages:vi.fn(),sendMessage:vi.fn()}));
vi.mock('../../services/chatEncryption.service.js',()=>({isChatEncryptionConfigured:()=>true}));
import {listGuardianMessageThreads} from '../guardianMessages.controller.js';
const context={client_id:2545,agency_id:453,service:{id:1042,service_kind:'tutoring',label:'Tutoring',provider_user_id:0}};
const req={user:{id:1759},query:{clientId:2545,agencyId:453,serviceId:1042}};
beforeEach(()=>{vi.clearAllMocks();m.context.mockResolvedValue(context);m.history.mockResolvedValue([]);m.mail.mockResolvedValue([]);m.execute.mockResolvedValue([[{}]]);m.shared.mockResolvedValue({threadId:380,participants:[{id:1496,name:'QA Tutor',role:'provider'},{id:1759,name:'QA Parent',role:'guardian'}]});});
it('returns an exact unassigned service and actionable prerequisite without another tutor or audience',async()=>{
 const res={json:vi.fn()},next=vi.fn();await listGuardianMessageThreads(req,res,next);
 expect(res.json.mock.calls[0][0].threads).toEqual([expect.objectContaining({service_id:1042,service_kind:'tutoring',provider:null,participants:[],thread_id:null,available:false,unavailable_reason:'provider_unassigned'})]);
 expect(m.shared).not.toHaveBeenCalled();expect(m.history).toHaveBeenCalledWith(expect.objectContaining({serviceId:1042}));expect(next).not.toHaveBeenCalled();
});
it('preserves clinical denial rather than returning a successful empty inbox',async()=>{
 const denied=Object.assign(new Error('Not authorized'),{status:403});m.context.mockRejectedValue(denied);const res={json:vi.fn()},next=vi.fn();await listGuardianMessageThreads(req,res,next);expect(next).toHaveBeenCalledWith(denied);expect(res.json).not.toHaveBeenCalled();expect(m.shared).not.toHaveBeenCalled();
});
it.each([403,500])('propagates a shared audience failure (%s) instead of claiming no subjects',async status=>{
 m.context.mockResolvedValue({...context,service:{...context.service,provider_user_id:1496}});const error=Object.assign(new Error('Audience lookup failed'),{status});m.shared.mockRejectedValue(error);const res={json:vi.fn()},next=vi.fn();await listGuardianMessageThreads(req,res,next);expect(next).toHaveBeenCalledWith(error);expect(res.json).not.toHaveBeenCalled();
});
it('returns the authorized roster and service kind for actual Messages',async()=>{
 m.context.mockResolvedValue({...context,service:{...context.service,id:1038,provider_user_id:1496}});const res={json:vi.fn()},next=vi.fn();await listGuardianMessageThreads(req,res,next);expect(res.json.mock.calls[0][0].threads[0]).toMatchObject({service_id:1038,service_kind:'tutoring',available:true,participants:[{id:1496,role:'provider'},{id:1759,role:'guardian'}]});expect(m.shared).toHaveBeenCalledWith({clientId:2545,agencyId:453,serviceId:1038,userId:1759});
});
