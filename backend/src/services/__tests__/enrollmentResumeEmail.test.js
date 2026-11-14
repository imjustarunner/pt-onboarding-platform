import {beforeEach, expect, it, vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:vi.fn()}));
import {createEnrollmentResumeEmail} from '../enrollmentResumeEmail.service.js';
import {isRequestedAccountEmail} from '../../utils/accountAccessEmail.js';

let current, prior, db, communications, send, agencies, request, input;
beforeEach(()=>{
 current={status:'started',signer_email:'qa.nlu.parent@example.com',session_token:'private-draft-token',draft_expires_at:'2099-01-01'};
 prior=null;
 db={execute:vi.fn(async sql=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.includes('FROM intake_submissions'))return [[{...current}]];
  if(sql.includes('FROM user_communications'))return [prior?[prior]:[]];
  throw Error('Unexpected SQL');
 }),release:vi.fn()};
 db.getConnection=vi.fn(async()=>db);
 communications={create:vi.fn(async()=>({id:900})),updateDeliveryStatus:vi.fn(async()=>{})};
 send=vi.fn(async()=>({sent:true,id:'transport-1'}));
 agencies={findById:vi.fn(async()=>({id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}}))};
 request=createEnrollmentResumeEmail({db,communications,send,agencies});
 input={agencyId:453,link:{id:349,public_key:'qa-form'},submission:{id:12,status:'started',signer_email:current.signer_email,intake_data:{guardian:{email:current.signer_email}}},sessionToken:current.session_token};
});
it('emails only the saved recipient and exact scoped draft without returning a token',async()=>{
 const result=await request({...input,to:'attacker@example.com'});
 expect(result).toMatchObject({communicationId:900,deliveryStatus:'sent'});
 const message=send.mock.calls[0][0];
 expect(message.to).toBe(current.signer_email);
 expect(message.text).toContain('https://app.nextleveluplcc.com/nlu-qa-demo/intake/qa-form?session=private-draft-token&serviceType=tutoring');
 expect(message).toMatchObject({enrollmentChannel:'tutoring',preloggedReceipt:true,existingCommunicationId:900});
 expect(JSON.stringify(result)).not.toContain(input.sessionToken);
 expect(isRequestedAccountEmail(message.templateType)).toBe(true);
 expect(db.release).toHaveBeenCalledOnce();
});
it.each(['sent','pending','failed'])('suppresses a recent %s request without another transport attempt',async status=>{
 prior={id:800,delivery_status:status};
 expect(await request(input)).toMatchObject({communicationId:800,alreadyRequested:true});
 expect(send).not.toHaveBeenCalled();expect(communications.create).not.toHaveBeenCalled();
});
it.each(['wrong-token','changed-email','completed','expired'])('rechecks %s before sending',async reason=>{
 if(reason==='wrong-token')current.session_token='different';
 if(reason==='changed-email')current.signer_email='other@example.com';
 if(reason==='completed')current.status='submitted';
 if(reason==='expired')current.draft_expires_at='2020-01-01';
 await expect(request(input)).rejects.toMatchObject({status:409});
 expect(send).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
});
it('retains uncertain transmission for review instead of immediately permitting a replay',async()=>{
 send.mockRejectedValue(Error('Transport timeout'));
 await expect(request(input)).rejects.toThrow('Transport timeout');
 expect(communications.updateDeliveryStatus).toHaveBeenCalledWith(900,'pending',null,null,expect.stringContaining('review'));
 expect(send).toHaveBeenCalledOnce();
});
it('keeps known transmission when the history write fails',async()=>{
 communications.updateDeliveryStatus.mockRejectedValue(Error('History unavailable'));
 expect(await request(input)).toMatchObject({deliveryStatus:'sent',historyNeedsReview:true});
 expect(send).toHaveBeenCalledOnce();
});
