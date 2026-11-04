import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createSchoolCancellationCaregiverContacts} from '../schoolCancellationCaregiverContacts.service.js';

function setup() {
  const client={id:2079,is_school_client:1,date_of_birth:'2015-03-10'};
  let binding={id:977,bound_client_id:2079,owning_agency_id:2};
  let submitted={id:977,status:'submitted',submitted_at:'2026-10-01',consent_given_at:'2026-10-01',signer_name:'Caregiver',signer_email:'caregiver@example.test',guardian_user_id:null};
  const database={execute:vi.fn(async()=>[[binding]])},submission=vi.fn(async()=>submitted);
  const contacts=createSchoolCancellationCaregiverContacts({database,submission,now:()=>new Date('2026-11-04T15:00:00Z')});
  return {client,database,submission,contacts,setBinding:value=>{binding=value;},setSubmission:value=>{submitted={...submitted,...value};}};
}

it('uses only the client-bound submitted school enrollment caregiver when no guardian account/link exists',async()=>{
  const s=setup(),recipients=await s.contacts({client:s.client,agencyId:2,links:[]});
  expect(recipients).toEqual([expect.objectContaining({key:'enrollment:977',email:'caregiver@example.test',userId:null,operationalOnly:true,intakeSubmissionId:977})]);
  expect(s.database.execute).toHaveBeenCalledWith(expect.stringContaining('intake_submission_clients'),[2,2079,2]);
  expect(s.database.execute.mock.calls[0][0]).toContain("s.status='submitted'");
  expect(s.database.execute.mock.calls[0][0]).toContain('oa.agency_id=?');
  expect(s.database.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});

it('handles mysql DATE objects for minors and retains the adult boundary',async()=>{
  const s=setup();
  expect(await s.contacts({client:{...s.client,date_of_birth:new Date('2015-03-10T00:00:00Z')},agencyId:2,links:[]})).toHaveLength(1);
  expect(await s.contacts({client:{...s.client,date_of_birth:new Date('2008-11-04T00:00:00Z')},agencyId:2,links:[]})).toEqual([]);
  expect(await s.contacts({client:{...s.client,date_of_birth:new Date('invalid')},agencyId:2,links:[]})).toEqual([]);
});

it.each([1167,1327])('uses intake-created pending guardian %s for logistics without enabling portal access',async userId=>{
  const s=setup();s.setSubmission({guardian_user_id:userId});
  const link={guardian_user_id:userId,access_enabled:0,permissions_json:{intakeLinkGuardianProfile:true},status:'PENDING_SETUP',is_active:1,email:'current@example.test',first_name:'Current',last_name:'Caregiver'};
  const before=structuredClone(link);
  const recipients=await s.contacts({client:s.client,agencyId:2,links:[link]});
  expect(recipients[0]).toMatchObject({email:'current@example.test',userId,operationalOnly:true});
  expect(link).toEqual(before);expect(s.database.execute.mock.calls.every(([sql])=>sql.trim().startsWith('SELECT'))).toBe(true);
});

it.each([{revoked:true},{relationshipRevoked:true},{noContact:true},{no_contact:true},{contactRestricted:true},{canReceiveNotifications:false}])('never bypasses an actual relationship/contact restriction %j',async restriction=>{
  const s=setup();s.setSubmission({guardian_user_id:1167});
  expect(await s.contacts({client:s.client,agencyId:2,links:[{guardian_user_id:1167,access_enabled:0,status:'PENDING_SETUP',is_active:1,email:'caregiver@example.test',permissions_json:{intakeLinkGuardianProfile:true,...restriction}}]})).toEqual([]);
});

it.each([{noView:true},{noViewOtherGuardian:true},{canViewAppointments:false},{coGuardianInviteRestricted:true}])('keeps portal-only view settings separate from operational contact %j',async setting=>{
  const s=setup();s.setSubmission({guardian_user_id:1167});
  const link={guardian_user_id:1167,access_enabled:0,status:'DISABLED',is_active:0,email:'caregiver@example.test',permissions_json:setting};
  const before=structuredClone(link);
  expect(await s.contacts({client:s.client,agencyId:2,links:[link]})).toHaveLength(1);
  expect(link).toEqual(before);
});

it('retains legacy guardian affiliations independently of disabled login, and excludes unrelated or unsigned enrollment',async()=>{
  const s=setup();s.setSubmission({guardian_user_id:1167});
  const link={guardian_user_id:1167,access_enabled:0,status:'ACTIVE',is_active:1,email:'caregiver@example.test',permissions_json:{}};
  expect(await s.contacts({client:s.client,agencyId:2,links:[link]})).toHaveLength(1);
  expect(await s.contacts({client:s.client,agencyId:2,links:[{...link,status:'PENDING_SETUP',is_active:0,permissions_json:{intakeLinkGuardianProfile:true}}]})).toHaveLength(1);
  expect(await s.contacts({client:{...s.client,date_of_birth:'2000-01-01'},agencyId:2,links:[]})).toEqual([]);
  s.setBinding({id:977,bound_client_id:999,owning_agency_id:2});
  expect(await s.contacts({client:s.client,agencyId:2,links:[]})).toEqual([]);
  s.setBinding({id:977,bound_client_id:2079,owning_agency_id:6});
  expect(await s.contacts({client:s.client,agencyId:2,links:[]})).toEqual([]);
  s.setBinding({id:977,bound_client_id:2079,owning_agency_id:2});s.setSubmission({status:'started'});
  expect(await s.contacts({client:s.client,agencyId:2,links:[]})).toEqual([]);
  s.setSubmission({status:'submitted',consent_given_at:null});
  expect(await s.contacts({client:s.client,agencyId:2,links:[]})).toEqual([]);
});
