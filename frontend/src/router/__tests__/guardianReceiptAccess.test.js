import {expect,it} from 'vitest';
import {isGuardianReceiptRoute,isGuardianOfficeJoinRoute,isGuardianWorkspaceRoute} from '../guardianRoutePolicy.js';
it.each(['PaymentReceipt','OrganizationPaymentReceipt'])('permits the real %s route without granting staff or arbitrary billing access',name=>{
 expect(isGuardianReceiptRoute({name,params:{paymentId:'4'}})).toBe(true);
 expect(isGuardianReceiptRoute({name,params:{paymentId:'../admin'}})).toBe(false);
 expect(isGuardianReceiptRoute({name:'FamilyBillingDesk',params:{paymentId:'4'}})).toBe(false);
});

it('keeps a signed-in guardian on the real public office waiting-room route',()=>{
 const route={name:'JoinMyRoom',path:'/join/my-room/qa-nlu-tutor',params:{slug:'qa-nlu-tutor'}};
 expect(isGuardianOfficeJoinRoute(route)).toBe(true);expect(isGuardianWorkspaceRoute(route)).toBe(true);
});
it.each([
 {name:'OrganizationPrivateVirtualOffice',path:'/nlu-qa-demo/my-virtual-office',params:{slug:'qa-nlu-tutor'}},
 {name:'JoinMyRoom',path:'/nlu-qa-demo/admin/users',params:{slug:'qa-nlu-tutor'}},
 {name:'Unknown',path:'/join/my-room/qa-nlu-tutor',params:{slug:'qa-nlu-tutor'}},
 {name:'JoinMyRoom',path:'/join/my-room/bad',params:{slug:'../admin'}},
 {name:'JoinMyRoom',path:'/join/my-room/bad',params:{slug:''}}
])('does not turn the waiting-room exception into employee or arbitrary-route access: %j',route=>{
 expect(isGuardianOfficeJoinRoute(route)).toBe(false);expect(isGuardianWorkspaceRoute(route)).toBe(false);
});
