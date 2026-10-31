import {expect,it} from 'vitest';
import {providerSchoolPortalDestination} from '../providerSchoolPortalDestination.js';
it('routes a provider legacy admin-school shortcut to their own Schools & Programs tab',()=>{
 expect(providerSchoolPortalDestination({role:'provider',path:'/auricwell-qa-demo/admin/school-portals-hub',dashboardPath:'/auricwell-qa-demo/dashboard'})).toEqual({path:'/auricwell-qa-demo/dashboard',query:{tab:'schools_programs'},replace:true});
});
it('preserves authorized administration and never redirects unrelated admin controls into provider access',()=>{
 expect(providerSchoolPortalDestination({role:'admin',path:'/admin/school-portals'})).toBeNull();
 expect(providerSchoolPortalDestination({role:'provider',path:'/admin/users'})).toBeNull();
 expect(providerSchoolPortalDestination({role:'school_staff',path:'/admin/school-portals'})).toBeNull();
});
