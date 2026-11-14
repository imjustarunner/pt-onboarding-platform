import {expect,it} from 'vitest';
import {isGuardianReceiptRoute} from '../guardianRoutePolicy.js';
it.each(['PaymentReceipt','OrganizationPaymentReceipt'])('permits the real %s route without granting staff or arbitrary billing access',name=>{
 expect(isGuardianReceiptRoute({name,params:{paymentId:'4'}})).toBe(true);
 expect(isGuardianReceiptRoute({name,params:{paymentId:'../admin'}})).toBe(false);
 expect(isGuardianReceiptRoute({name:'FamilyBillingDesk',params:{paymentId:'4'}})).toBe(false);
});
