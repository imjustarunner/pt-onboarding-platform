import {expect,it} from 'vitest';
import {familyLoginOrganization,portalSignInUsername} from '../../utils/familyLoginContext.js';
import {buildClientEnrollmentEmail} from '../clientPortalEmailContent.js';
import {buildPortalMigrationEmail} from '../portalMigrationContent.js';
const agency={id:2,slug:'itsco',organization_type:'agency'};
const school={id:376,slug:'hogwarts',organization_type:'school',affiliated_agency_id:2};
const learning={id:6,slug:'nlu',organization_type:'learning'};
it('routes a guardian from a school affiliation to the authorized care agency',()=>{
 const user={role:'client_guardian'};
 expect(familyLoginOrganization(user,[school,agency,learning],'hogwarts')).toEqual(agency);
 expect(familyLoginOrganization(user,[school,learning,agency],null)).toEqual(agency);
 expect(familyLoginOrganization(user,[school,agency,learning],'nlu')).toEqual(learning);
 expect(familyLoginOrganization(user,[agency],'unrelated')).toEqual(agency);
 expect(familyLoginOrganization(user,[school],'unrelated')).toBeNull();
 expect(familyLoginOrganization({role:'school_staff'},[school,agency],'hogwarts')).toBeNull();
});
it('uses the email families can actually sign in with, while preserving employee usernames',()=>{
 expect(portalSignInUsername({role:'client_guardian',email:'parent@example.com',username:'old-alias'})).toBe('parent@example.com');
 expect(portalSignInUsername({role:'provider',email:'staff@example.com',username:'staff-id'})).toBe('staff-id');
});
it('puts the sign-in email and automatic login instructions in both welcome emails',()=>{
 const data={agencyName:'ITSCO',username:'parent@example.com',url:'https://auricwell.com/itsco/new_account/example',portalUrl:'https://auricwell.com/itsco/guardian'};
 for(const mail of [buildClientEnrollmentEmail(data),buildPortalMigrationEmail(data)]){
  expect(mail.text).toContain('Your sign-in email (username): parent@example.com');
  expect(mail.html).toContain('parent@example.com');expect(mail.text).toContain('signed in automatically');
  expect(mail.text).toContain('when your browser offers');
 }
 expect(buildPortalMigrationEmail({...data,resetPassword:true}).html).toContain('Set your portal password');
});
