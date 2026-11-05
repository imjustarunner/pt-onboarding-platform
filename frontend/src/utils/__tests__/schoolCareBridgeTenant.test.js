import {describe,it,expect} from 'vitest';
import {schoolCareBridgePartnerPath,scopedSchoolCareBridgeDestination} from '../schoolCareBridgeTenant';
import {getLoginUrlForRedirect} from '../loginRedirect';
const limited={id:2,slug:'small-agency',organization_type:'agency',feature_flags:{schoolCareBridgeOnly:true}},full={id:3,slug:'itsco',organization_type:'agency'};
describe('SchoolCareBridge tenant navigation',()=>{
 it('builds agency workspaces without impersonating a school slug',()=>{expect(schoolCareBridgePartnerPath('itsco','schools')).toBe('/schoolcarebridge/app/partners/itsco/schools');});
 it('scopes standalone dashboard navigation',()=>{expect(scopedSchoolCareBridgeDestination({path:'/small-agency/dashboard',params:{organizationSlug:'small-agency'}},[limited])).toBe('/schoolcarebridge/app/partners/small-agency');});
 it('preserves full ITSCO navigation for users with both memberships',()=>{expect(scopedSchoolCareBridgeDestination({path:'/itsco/dashboard',params:{organizationSlug:'itsco'}},[limited,full])).toBeNull();});
 it('keeps a dual member in the school workspace only while that company is active',()=>{
  const school={id:9,slug:'new-school',organization_type:'school'};
  expect(scopedSchoolCareBridgeDestination({path:'/supervision',params:{}},[limited,full,school],limited)).toBe('/schoolcarebridge/app/partners/small-agency');
  expect(scopedSchoolCareBridgeDestination({path:'/new-school/dashboard',params:{organizationSlug:'new-school'}},[limited,full,school],limited)).toBeNull();
  expect(scopedSchoolCareBridgeDestination({path:'/itsco/dashboard',params:{organizationSlug:'itsco'}},[limited,full],full)).toBeNull();
  expect(scopedSchoolCareBridgeDestination({path:'/itsco/dashboard',params:{organizationSlug:'itsco'}},[limited,full],limited)).toBeNull();
 });
 it('keeps signing and school workflows available',()=>{for(const path of ['/small-agency/tasks/documents/5/sign','/schoolcarebridge/app/ashley','/schoolcarebridge/app/partners/small-agency'])expect(scopedSchoolCareBridgeDestination({path},[limited])).toBeNull();});
 it('returns expiry and logout to the partner entry',()=>{window.history.replaceState({},'', '/schoolcarebridge/app/partners/itsco/settings');expect(getLoginUrlForRedirect()).toContain('/schoolcarebridge/app/partners/itsco');});
});
