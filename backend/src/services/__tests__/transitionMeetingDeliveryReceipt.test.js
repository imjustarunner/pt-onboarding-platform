import {it,expect} from 'vitest';
import {verifiedTransitionDeliveryReceipt} from '../transitionMeetingDeliveryReceipt.js';
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
