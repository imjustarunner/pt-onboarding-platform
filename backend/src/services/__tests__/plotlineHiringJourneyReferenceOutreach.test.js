import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({send:vi.fn(),consent:vi.fn(),queue:vi.fn(),mark:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async()=>({id:8,first_name:'Synthetic',email:''})}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:async()=>({id:2,name:'ITSCO',slug:'itsco',people_ops_email:'po@agency.test'})}}));
vi.mock('../../models/HiringReferenceRequest.model.js',()=>({default:{listByProfileAndAgency:async()=>[],insertRow:async()=>({id:47,public_link_token:'synthetic-link',open_track_token:'synthetic-open'}),markSent:m.mark}}));
vi.mock('../hiringReferenceConsent.service.js',()=>({resolveHiringReferenceConsent:m.consent}));
vi.mock('../hiringJourneyEvents.service.js',()=>({queueReferenceHiringText:m.queue}));
vi.mock('../hiringReferenceReceipt.service.js',()=>({runReferenceReceiptNotifications:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../hiringReferenceIdentity.service.js',()=>({resolveHiringReferenceSenderIdentity:async()=>({id:51,agency_id:2}),resolveHiringReferenceReplyTo:async()=>'po@agency.test'}));
vi.mock('../hiringReferenceActivity.service.js',()=>({appendEmailOpenPixel:html=>html,buildReferenceOpenPixelUrl:()=>'',logHiringReferenceEvent:vi.fn()}));
import {createAndSendReferenceRequests} from '../hiringReferenceRequests.service.js';
const input={agencyId:2,candidateUserId:8,sentByUserId:12,profile:{id:9,references_json:[{name:'PRIVATE REFERENCE',email:'reference@example.test'}]}};
beforeEach(()=>{vi.resetAllMocks();m.consent.mockResolvedValue({allowed:true});m.send.mockResolvedValue({id:'accepted'});m.execute.mockResolvedValue([[]]);});
it('queues applicant progress only after a reference email succeeds, even without applicant email',async()=>{
 expect((await createAndSendReferenceRequests(input)).sent).toHaveLength(1);
 expect(m.queue).toHaveBeenCalledWith({agencyId:2,userId:8,requestIds:[47]});
 expect(JSON.stringify(m.queue.mock.calls)).not.toContain('PRIVATE REFERENCE');
});
it('never claims reference outreach when reference authorization is absent or sending is held/failed',async()=>{
 m.consent.mockResolvedValueOnce({allowed:false,message:'No signed release'});await createAndSendReferenceRequests(input);expect(m.send).not.toHaveBeenCalled();expect(m.queue).not.toHaveBeenCalled();
 for(const outcome of [{skipped:true,reason:'blocked'},{pendingApproval:true},{failed:true}]){
  m.send.mockResolvedValue(outcome);await createAndSendReferenceRequests(input);expect(m.queue).not.toHaveBeenCalled();
 }
});
