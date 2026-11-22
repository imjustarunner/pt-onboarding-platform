import {beforeEach,expect,it,vi} from 'vitest';
import {transferSchoolAgencySession} from '../schoolAgencyWorkspace';
import {readChosenOrganizationId} from '../../utils/workingOrganization';
const input={agencies:[{id:450,portal_url:'auricwell-qa-demo',organization_type:'agency'}],parentId:450,role:'provider',userId:7};
const context=(hostname='schoolcarebridge.org')=>({api:{post:vi.fn()},router:{push:vi.fn()},location:{origin:`https://${hostname}`,hostname,assign:vi.fn()}});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
it.each(['schoolcarebridge.org','app.itsco.health'])('keeps the existing session on %s and bypasses school route aliases',async host=>{
 const c=context(host);await transferSchoolAgencySession(input,c);
 expect(c.location.assign).toHaveBeenCalledWith(`https://${host}/auricwell-qa-demo/dashboard`);
 expect(c.api.post).not.toHaveBeenCalled();expect(c.router.push).not.toHaveBeenCalled();
 expect(readChosenOrganizationId(7)).toBe(450);
});
it('does not infer a full agency membership from a school link',async()=>{
 const c=context();await expect(transferSchoolAgencySession({...input,parentId:6},c)).rejects.toThrow('No full agency');expect(c.location.assign).not.toHaveBeenCalled();
});
it('does not send school-only members into a clinical workspace',async()=>{
 const c=context();await expect(transferSchoolAgencySession({...input,agencies:[{...input.agencies[0],feature_flags:{schoolCareBridgeOnly:true}}]},c)).rejects.toThrow('No full agency');expect(c.location.assign).not.toHaveBeenCalled();
});
