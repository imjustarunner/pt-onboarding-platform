import { it, expect, vi, beforeEach } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),email:vi.fn(),notify:vi.fn(),agency:vi.fn(),user:vi.fn(),ticket:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../coGuardianInvite.service.js',()=>({emailCoGuardianInvite:m.email,invitePublicUrl:()=> 'https://agency.test/intake/new-token',insertGuardianAccessTicket:m.ticket}));
vi.mock('../enrollmentPortalEmail.service.js',()=>({sendEnrollmentPortalEmail:m.notify}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
import { assertInvitationOwner, inviteDeliveryState, deliverCoGuardianInvite, resendGuardianInvitation, notifyInvitationFailure, listGuardianInvitations } from '../coGuardianDelivery.service.js';
import { parseGuardianDeliveryReport } from '../../utils/guardianDeliveryReport.js';
const invite={id:3,agency_id:4,invited_by_user_id:8,status:'pending',source:'office',invited_email:'typo@example.test'};
const clients=[{id:5,agency_id:4,access_enabled:1,permissions_json:{},date_of_birth:'2015-01-01'}];
let db;
it('persists an invitation failure when context or transport throws before returning a receipt', async()=>{
 m.email.mockRejectedValueOnce(new Error('Sender lookup unavailable'));
 const result=await deliverCoGuardianInvite({inviteId:3,agency:{id:4},to:'other@example.test'});
 expect(result).toMatchObject({sent:false,deliveryStatus:'failed'});
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE co_guardian_invite_deliveries SET delivery_status'),expect.arrayContaining(['failed','send_failed']));
});
beforeEach(()=>{
 vi.clearAllMocks();
 db={execute:vi.fn(async sql=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT * FROM co_guardian_invites'))return [[invite]];
  if(sql.includes('SELECT c.id'))return [clients];
  if(sql.includes('SELECT * FROM co_guardian_invite_deliveries'))return [[]];
  if(sql.includes('COUNT(*)'))return [[{n:0}]];
  return [[],[]];
 }),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 m.getConnection.mockResolvedValue(db);m.execute.mockResolvedValue([{insertId:13}]);m.agency.mockResolvedValue({id:4,name:'Agency',slug:'itsco'});
 m.email.mockResolvedValue({sent:true,communicationId:7,internetMessageId:'<opaque@example.test>'});
});
it('distinguishes sent, pending approval and failed mail',()=>{
 expect(inviteDeliveryState({sent:true})).toBe('sent');expect(inviteDeliveryState({queued:true})).toBe('pending');expect(inviteDeliveryState({skipped:true})).toBe('failed');
});
it('records a delivery attempt before sending and tracks the provider ID',async()=>{
 await deliverCoGuardianInvite({inviteId:3,agency:{id:4},to:'correct@example.test'});
 expect(m.execute.mock.calls[0][0]).toContain('INSERT');expect(m.execute.mock.calls[1][1]).toEqual(['sent',7,'<opaque@example.test>',null,13]);
});
it('blocks another parent, another agency, accepted invites, revoked access and adult clients',async()=>{
 for(const changed of [{userId:9},{agencyId:7},{invite:{...invite,status:'accepted'}}])await expect(assertInvitationOwner({invite,userId:8,agencyId:4,db,...changed})).rejects.toThrow();
 db.execute.mockResolvedValue([[{...clients[0],permissions_json:{noView:true}}]]);await expect(assertInvitationOwner({invite,userId:8,agencyId:4,db})).rejects.toThrow('current guardian');
 db.execute.mockResolvedValue([[{...clients[0],date_of_birth:'1990-01-01'}]]);await expect(assertInvitationOwner({invite,userId:8,agencyId:4,db})).rejects.toThrow('adult');
});
it('rotates the old invitation token and only revokes links restricted by that invite',async()=>{
 const result=await resendGuardianInvitation({userId:8,agencyId:4,inviteId:3,email:'correct@example.test'});
 expect(result.deliveryStatus).toBe('sent');expect(db.commit).toHaveBeenCalled();
 const revoke=db.execute.mock.calls.find(([sql])=>sql.includes('SET cg.access_enabled=0'));
 expect(revoke[0]).toContain('coGuardianInviteRestricted');expect(revoke[0]).toContain('coGuardianInviteId');
 const tokenUpdate=db.execute.mock.calls.find(([sql])=>sql.includes('SET invited_email='));
 expect(tokenUpdate[1][0]).toBe('correct@example.test');expect(tokenUpdate[1][1]).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(result)).not.toContain('token');
});
it('rate limits retries without sending or changing accounts',async()=>{
 db.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT * FROM co_guardian_invites')?[[invite]]:sql.includes('SELECT c.id')?[clients]:sql.includes('SELECT * FROM co_guardian_invite_deliveries')?[[{created_at:new Date()}]]:[[]]);
 await expect(resendGuardianInvitation({userId:8,agencyId:4,inviteId:3,email:'a@example.test'})).rejects.toThrow('Wait a minute');expect(m.email).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
});
it('notifies only the stored submitting parent with agency branding and no child details',async()=>{
 const row={id:13,invite_id:3,agency_id:4,invited_by_user_id:8,source:'office',delivery_status:'bounced',failure_kind:'mailbox_rejected'};
 db.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT d.*')?[[row]]:[[]]);
 m.user.mockResolvedValue({id:8,email:'parent@example.test',role:'client_guardian'});m.notify.mockResolvedValue({sent:true,communicationId:9});
 await notifyInvitationFailure(13);
 expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({agencyId:4,to:'parent@example.test',text:expect.stringContaining('receiving email service rejected')}));
 expect(m.ticket).not.toHaveBeenCalled();
});
it('creates a staff follow-up if the submitting parent cannot be notified',async()=>{
 db.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT d.*')?[[{id:13,invite_id:3,agency_id:4,delivery_status:'failed'}]]:[[]]);
 await notifyInvitationFailure(13);expect(m.ticket).toHaveBeenCalledWith(expect.objectContaining({subject:expect.stringContaining('contact the submitting parent')}));
});
function report(action='failed',status='5.1.1') {return {mimeType:'multipart/report',headers:[{name:'Content-Type',value:'multipart/report; report-type=delivery-status'}],parts:[{mimeType:'message/delivery-status',body:{data:Buffer.from(`Original-Message-ID: <opaque@example.test>\r\n\r\nFinal-Recipient: rfc822; typo@example.test\r\nAction: ${action}\r\nStatus: ${status}\r\n`).toString('base64url')}}]};}
it('requires a structured permanent failure, original message ID and exact recipient',()=>{
 expect(parseGuardianDeliveryReport(report())).toEqual([{messageId:'<opaque@example.test>',recipient:'typo@example.test'}]);
 expect(parseGuardianDeliveryReport(report('delayed','4.2.0'))).toEqual([]);
 expect(parseGuardianDeliveryReport({...report(),mimeType:'text/plain'})).toEqual([]);
 const noId=report();noId.parts[0].body.data=Buffer.from('Final-Recipient: rfc822; typo@example.test\nAction: failed\nStatus: 5.1.1').toString('base64url');expect(parseGuardianDeliveryReport(noId)).toEqual([]);
});

it('staff reminder preserves the confirmed recipient and original inviter while refreshing the link', async () => {
  const { sendStaffGuardianInvitationReminder } = await import('../coGuardianDelivery.service.js');
  m.user.mockResolvedValue({ id: 501, role: 'super_admin' });
  const original = db.execute.getMockImplementation();
  db.execute.mockImplementation(async sql => sql.includes('SELECT * FROM co_guardian_invites')
    ? [[{...invite, public_key:'synthetic-office'}]] : sql.includes('FROM intake_links')
      ? [[{id:20,is_active:1,create_guardian:1,master_channel:'counseling'}]] : original(sql));
  const result = await sendStaffGuardianInvitationReminder({actorUserId:501,agencyId:4,inviteId:3});
  expect(result).toMatchObject({deliveryStatus:'sent',email:'typo@example.test',communicationId:7});
  expect(m.email).toHaveBeenCalledWith(expect.objectContaining({to:'typo@example.test',reminder:false}));
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('SET invited_by_user_id'))).toBe(false);
  expect(db.execute.mock.calls.some(([sql])=>sql.includes('SET cg.access_enabled'))).toBe(false);
});
it.each(['office','school'])('labels a %s follow-up as a reminder only after a prior successful send to that recipient',async source=>{
 const original=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,args)=>sql.includes('SELECT * FROM co_guardian_invites')?[[{...invite,source}]]:
   sql.includes('LOWER(recipient_email)=')?[[{n:1}]]:original(sql,args));
 await resendGuardianInvitation({userId:8,agencyId:4,inviteId:3,email:invite.invited_email});
 expect(m.email).toHaveBeenCalledWith(expect.objectContaining({reminder:true,school:source==='school'}));
});
it('exposes delivery history and next reminder only for the authorized dependent, without message contents',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT i.id')?[[{...statusRow,clientId:5,invitedByUserId:8,nextReminderAt:'2026-10-29'}]]:
   [[{inviteId:18,id:33,kind:'invitation',status:'sent',occurredAt:'2026-10-27',body:'private',token:'secret'}]]);
 const [result]=await listGuardianInvitations({userId:8,agencyId:4,clientId:5});
 expect(result.history).toEqual([{id:33,kind:'invitation',status:'sent',occurredAt:'2026-10-27'}]);
 expect(result.nextReminderAt).toBe('2026-10-29');
 expect(await listGuardianInvitations({userId:8,agencyId:4,clientId:99})).toEqual([]);
});
it('staff reminder does not send without agency access or a published guardian packet', async () => {
  const { sendStaffGuardianInvitationReminder } = await import('../coGuardianDelivery.service.js');
  m.user.mockResolvedValue({id:501,role:'provider'});
  await expect(sendStaffGuardianInvitationReminder({actorUserId:501,agencyId:4,inviteId:3})).rejects.toThrow('administrator');
  m.user.mockResolvedValue({id:501,role:'super_admin'});
  await expect(sendStaffGuardianInvitationReminder({actorUserId:501,agencyId:4,inviteId:3})).rejects.toThrow('published enrollment');
  expect(m.email).not.toHaveBeenCalled();
});
const statusRow={id:18,email:'other@example.test',invitedByUserId:501,source:'office',status:'pending',accountConnected:0,
 clientAgencyId:4,portalEnabled:1,accessEnabled:1,dateOfBirth:'2015-01-01',permissions:{},deliveryStatus:'sent',
 invitedAt:'2026-10-01',lastSentAt:'2026-10-02',deliveryAttempts:2};
it('shows an authorized linked parent masked staff-created invitation progress without management authority',async()=>{
 m.execute.mockResolvedValue([[statusRow]]);
 const [result]=await listGuardianInvitations({userId:8,agencyId:4});
 expect(result).toMatchObject({id:18,email:'o•••@•••',status:'pending',canManage:false,deliveryAttempts:2,lastSentAt:'2026-10-02'});
 expect(result).not.toHaveProperty('invitedByUserId');expect(result).not.toHaveProperty('dateOfBirth');
 expect(JSON.stringify(result)).not.toContain('other@example.test');
 await expect(assertInvitationOwner({invite:{...invite,invited_by_user_id:501},userId:8,agencyId:4,db})).rejects.toHaveProperty('status',404);
});
it('keeps status private after restricted, revoked, adult, malformed, or cross-agency access',async()=>{
 for(const changes of [{permissions:{noView:true}},{permissions:{noViewOtherGuardian:true}},{permissions:'{'},{permissions:[]},
  {accessEnabled:0},{portalEnabled:0},{dateOfBirth:'1990-01-01'},{clientAgencyId:6}]){
  m.execute.mockResolvedValue([[{...statusRow,...changes}]]);
  expect(await listGuardianInvitations({userId:8,agencyId:4})).toEqual([]);
 }
});
it('keeps owner management separate from read-only progress when another linked child is restricted',async()=>{
 m.execute.mockResolvedValue([[{...statusRow,invitedByUserId:8}]]);
 expect((await listGuardianInvitations({userId:8,agencyId:4}))[0]).toMatchObject({email:'other@example.test',canManage:true});
 m.execute.mockResolvedValue([[{...statusRow,invitedByUserId:8},{...statusRow,invitedByUserId:8,accessEnabled:0}]]);
 expect((await listGuardianInvitations({userId:8,agencyId:4}))[0]).toMatchObject({canManage:false});
});

it('sends the refreshed invitation directly to the same guardian’s renewed saved draft',async()=>{
 const original=db.execute.getMockImplementation();
 db.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT s.id,s.session_token')
  ? [[{id:101,session_token:'saved-second-parent-session'}]]
  : sql.includes('SELECT * FROM co_guardian_invites') ? [[{...invite,public_key:'synthetic-office'}]] : original(sql,args));
 await resendGuardianInvitation({userId:8,agencyId:4,inviteId:3,email:invite.invited_email});
 const sent=m.email.mock.calls[0][0];
 expect(new URL(sent.inviteUrl).searchParams.get('session')).toBe('saved-second-parent-session');
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('SET draft_expires_at='))).toBe(true);
});
