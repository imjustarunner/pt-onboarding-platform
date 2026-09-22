import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),identities:vi.fn(),directory:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:m.identities}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getUser:m.directory}}));
import {tenantMeetingEmail,resolveMeetingRecipient} from '../meetingRecipientIdentity.service.js';
beforeEach(()=>{vi.clearAllMocks();m.agency.mockResolvedValue({feature_flags:{workspaceEmailDomain:'itsco.health'}});});
describe('meeting identities',()=>{
 it('uses a verified tenant alias and retains the primary account for calendar ownership',async()=>{
  m.directory.mockResolvedValue({primaryEmail:'haley@plottwistco.com',aliases:['former-name@itsco.health','haley@itsco.health']});
  expect(await resolveMeetingRecipient({agencyId:2,user:{email:'haley@plottwistco.com',first_name:'Haley',last_name:'Inyart'}})).toEqual({email:'haley@itsco.health',displayName:'Haley Inyart',calendarAccountEmail:'haley@plottwistco.com'});
 });
 it('never makes up a tenant alias or changes an external candidate address',async()=>{
  const user={email:'applicant@example.org',first_name:'Applicant'};
  expect(tenantMeetingEmail(user,'itsco.health',{primaryEmail:user.email,aliases:[]})).toBe(user.email);
  expect((await resolveMeetingRecipient({agencyId:2,user,guest:true})).email).toBe(user.email);expect(m.directory).not.toHaveBeenCalled();expect(m.agency).not.toHaveBeenCalled();
 });
 it('uses the existing address if directory lookup is unavailable',async()=>{
  m.directory.mockRejectedValue(new Error('Unavailable'));
  expect((await resolveMeetingRecipient({agencyId:2,user:{email:'another@plottwistco.com'}})).email).toBe('another@plottwistco.com');
 });
});
