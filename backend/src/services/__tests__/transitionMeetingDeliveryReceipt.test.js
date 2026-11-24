import {it,expect} from 'vitest';
import {verifiedTransitionDeliveryReceipt,isVerifiedTransitionSmtpSetup} from '../transitionMeetingDeliveryReceipt.js';
it('keeps the actual delivered thread identity for direct and accepted relay receipts',()=>{
 for(const extra of [{},{relay:{accepted:true,partial:false,rejectedCount:0}}]){
  const action={internetMessageId:'<original@example.test>'};
  expect(verifiedTransitionDeliveryReceipt({id:'transport-123',internetMessageId:'<actual@example.test>',...extra},action)).toEqual({status:'sent',reference:'email:transport-123'});
  expect(action.internetMessageId).toBe('<actual@example.test>');
 }
});
it('holds partial relay acceptance even when a host CC may have succeeded',()=>{
 for(const relay of [{accepted:true,partial:true},{accepted:true,rejectedCount:1},{accepted:false},{id:'unconfirmed'}])
  expect(()=>verifiedTransitionDeliveryReceipt({id:'partial-123',relay},{})).toThrow('unconfirmed');
});
it('holds blocked, redirected and unconfirmed sends without reporting delivery',()=>{
 for(const result of [{},{id:'r',pendingApproval:true},{id:'r',redirected:true},{id:'r',queued:true},{id:'r',blocked:true},{id:'r',skipped:true}])
  expect(()=>verifiedTransitionDeliveryReceipt(result,{})).toThrow('unconfirmed');
});

const setup={address:'transitions@auricwell.com',verifiedFrom:'transitions@auricwell.com',transport:'workspace_smtp_relay',automationSubject:'auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com',senderIdentityId:81,roundTripVerified:true,visibleFromVerified:true,groupSettingsVerifiedByOwner:true,groupMembershipVerifiedByOperator:true,verificationCommunicationId:17,relayReceipt:'relay-synthetic',verifiedAt:'2026-11-24T18:00:00Z'};
it('binds SMTP authorization to the actual dedicated sender and complete delivery evidence',()=>{
 expect(isVerifiedTransitionSmtpSetup(setup,81)).toBe(true);expect(isVerifiedTransitionSmtpSetup(setup,82)).toBe(false);expect(isVerifiedTransitionSmtpSetup(null,81)).toBe(false);
 for(const key of ['roundTripVerified','visibleFromVerified','groupSettingsVerifiedByOwner','groupMembershipVerifiedByOperator'])expect(isVerifiedTransitionSmtpSetup({...setup,[key]:false},81)).toBe(false);
});
it('rejects proof for another address, transport, actor or missing wire receipt',()=>{
 for(const changed of [{address:'other@auricwell.com'},{verifiedFrom:'ai@plottwistco.com'},{transport:'gmail'},{automationSubject:'human'},{relayReceipt:''},{verificationCommunicationId:0},{verifiedAt:'unverified'}])expect(isVerifiedTransitionSmtpSetup({...setup,...changed},81)).toBe(false);
});
