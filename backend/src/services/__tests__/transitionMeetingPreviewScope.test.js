import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),workspace:vi.fn(),staff:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../transitionWorkspace.service.js',()=>({transitionWorkspaceData:m.workspace,transitionStaff:m.staff}));
vi.mock('../meetingInvitations.service.js',()=>({personalMeetingInvitation:vi.fn()}));
vi.mock('../chatEncryption.service.js',()=>({isChatEncryptionConfigured:()=>true,encryptChatText:s=>({test:s}),decryptChatText:v=>v.test}));
import {transitionSequencePreview} from '../transitionMeetingSequenceLive.service.js';
it('selects practice staff rather than similarly named school accounts and includes the explicitly invited NLU provider',async()=>{
 const person=(id,first,email,status='ACTIVE_EMPLOYEE')=>({id,first_name:first,last_name:'Example',email,status});
 const users=[person(1,'Provider','provider@example.test','ONBOARDING'),person(91,'Megan','megan@example.test'),person(92,'Rachel','rachel@example.test'),person(93,'Michael','michael@plottwistco.com'),person(96,'Unused',''),person(930,'Megan','school@example.test'),person(931,'Rachel','other-school@example.test'),person(932,'School','')];
 const eligible=[1,91,92,93,96].map(id=>({id}));m.workspace.mockResolvedValue({people:[{providerId:1,cohort:1}],staff:eligible});m.staff.mockResolvedValue([{id:99}]);
 const setup={address:'transitions@auricwell.com',verifiedFrom:'transitions@auricwell.com',transport:'workspace_smtp_relay',automationSubject:'auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com',senderIdentityId:8,roundTripVerified:true,visibleFromVerified:true,groupSettingsVerifiedByOwner:true,groupMembershipVerifiedByOperator:true,verificationCommunicationId:17,relayReceipt:'synthetic',verifiedAt:'2026-11-24T18:00:00Z'};
 m.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM users u'))return [sql.includes('ua.agency_id=?')?[person(99,'Kimi','kimi@nextleveluplcc.com')]:users];
  if(sql.includes('email_sender_identities'))return [[{id:8}]];
  if(sql.includes('email_inbound_routes'))return [[{id:1}]];
  if(sql.includes('transition_meeting_sequences'))return [[{payload_json:JSON.stringify({test:JSON.stringify({setup})})}]];
  throw Error('Unexpected preview query');
 });
 const plan=await transitionSequencePreview(new Date('2026-11-24T18:00:00Z'));
 expect(plan.hostIds).toEqual([91,92,93]);expect(plan.providers.map(p=>p.userId)).toEqual([1,99]);expect(plan.providers[1]).toMatchObject({payrollAgencyId:6,group:1});
 const query=m.execute.mock.calls.find(([sql])=>sql.includes('FROM users u')&&!sql.includes('ua.agency_id=?'));
 expect(query[1]).toEqual(eligible.map(p=>p.id));expect(query[0]).toContain("'ONBOARDING'");
});
