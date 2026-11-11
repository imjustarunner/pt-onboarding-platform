import {expect,it} from 'vitest';import {guardianPortalStatus} from '../guardianPortalStatus.js';
it('distinguishes pending links from completed enrollment',()=>{
 const p=guardianPortalStatus({access_enabled:1,enrollment_status:'pending',permissions_json:{noView:true}});expect(p.label).toBe('Own enrollment and signatures pending');expect(p.detail).toContain('restricted');
 expect(guardianPortalStatus({access_enabled:1,enrollment_status:'accepted'}).label).toBe('Own enrollment completed');expect(guardianPortalStatus({access_enabled:1}).label).toBe('Access available');
});
it('retains disabled/restricted and expiry without inferring completion',()=>{
 expect(guardianPortalStatus({access_enabled:0}).label).toBe('Access disabled');expect(guardianPortalStatus({access_enabled:1,permissions_json:'{"noView":true}'}).label).toBe('Linked · records restricted');
 expect(guardianPortalStatus({access_enabled:1,enrollment_status:'expired'}).label).toContain('expired');expect(guardianPortalStatus({access_enabled:1,permissions_json:'invalid'}).label).toBe('Linked · records restricted');
});
