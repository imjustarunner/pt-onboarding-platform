import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),identities:vi.fn(),directory:vi.fn(),affiliations:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:m.identities}}));
vi.mock('../../models/UserLoginEmail.model.js',()=>({default:{listForUser:m.affiliations}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getUser:m.directory}}));
import {tenantMeetingEmail,resolveMeetingRecipient} from '../meetingRecipientIdentity.service.js';
beforeEach(()=>{vi.clearAllMocks();m.affiliations.mockResolvedValue([]);m.agency.mockResolvedValue({feature_flags:{workspaceEmailDomain:'itsco.health'}});});
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
it('prefers the explicit verified agency affiliation over a same-name alias',async()=>{
 m.directory.mockResolvedValue({primaryEmail:'explicit@plottwistco.com',aliases:['explicit@itsco.health','chosen@itsco.health']});
 m.affiliations.mockResolvedValue([{agency_id:2,email:'Chosen@itsco.health'}]);
 const result=await resolveMeetingRecipient({agencyId:2,user:{id:21,email:'explicit@plottwistco.com'}});
 expect(result.email).toBe('chosen@itsco.health');expect(result.calendarAccountEmail).toBe('explicit@plottwistco.com');expect(m.affiliations).toHaveBeenCalledWith(21);
});
it('does not use another agency affiliation even if it is owned by the same account',async()=>{
 m.directory.mockResolvedValue({primaryEmail:'scoped@plottwistco.com',aliases:['scoped@itsco.health','scoped@nextleveluplcc.com']});
 m.affiliations.mockResolvedValue([{agency_id:6,email:'scoped@nextleveluplcc.com'}]);
 expect((await resolveMeetingRecipient({agencyId:2,user:{id:22,email:'scoped@plottwistco.com'}})).email).toBe('scoped@itsco.health');
});
it('does not trust a configured affiliation belonging to someone else',async()=>{
 m.directory.mockResolvedValue({primaryEmail:'owner@plottwistco.com',aliases:['owner@itsco.health']});
 m.affiliations.mockResolvedValue([{agency_id:2,email:'other-person@itsco.health'}]);
 expect((await resolveMeetingRecipient({agencyId:2,user:{id:23,email:'owner@plottwistco.com'}})).email).toBe('owner@itsco.health');
});
it('falls back to the existing address when affiliation ownership cannot be verified',async()=>{
 m.directory.mockRejectedValue(new Error('Directory unavailable'));
 m.affiliations.mockResolvedValue([{agency_id:2,email:'unverified@itsco.health'}]);
 expect((await resolveMeetingRecipient({agencyId:2,user:{id:24,email:'unverified@plottwistco.com'}})).email).toBe('unverified@plottwistco.com');
});
it('keeps candidate delivery independent of affiliated staff addresses',async()=>{
 const result=await resolveMeetingRecipient({agencyId:2,user:{id:25,email:'candidate@example.org'},guest:true});
 expect(result.email).toBe('candidate@example.org');expect(m.affiliations).not.toHaveBeenCalled();
});
