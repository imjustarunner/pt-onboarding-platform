import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invitationKey, meetingInvitationContent, reminderMinutes } from '../meetingInvitationPolicy.js';
const m = vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),lock:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.lock,release:m.release})}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendNotificationEmail:m.send}));
vi.mock('../../utils/tenantMeetingUrl.js',()=>({tenantMeetingBase:async id=>`https://tenant${id}.example.com`}));
vi.mock('../meetingParticipants.service.js',()=>({meetingReplyTo:async()=> 'host@example.com',meetingParticipantRows:async()=>[],meetingEmailDetails:async()=>''}));
import { personalMeetingInvitation, resolvePersonalMeetingInvitation, sendDueMeetingInvitations, invitationEvents } from '../meetingInvitations.service.js';
const token = 'a'.repeat(32);
const event = {id:10,agency_id:2,provider_id:3,title:'Leadership <meeting>',start_at:'2026-09-28 22:00:00',end_at:'2026-09-28 23:00:00',event_timezone:'America/Denver',participant_join_token:'participant',host_join_token:'SECRET',recurrence_series_id:'series',recurrence_frequency:'WEEKLY'};
const invite = {id:1,agency_id:2,provider_id:3,event_id:10,user_id:5,join_token:token,meeting_type:'team_meeting'};
beforeEach(()=>{
  vi.clearAllMocks();
  m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email_invitations')?[[invite]]:sql.includes('SELECT p.*')?[[event]]:[]);
  m.lock.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT id FROM meeting_email')?[[{id:1}]]:sql.includes('SELECT id,email')?[[{id:5,email:'person@example.com'},{id:3,first_name:'Host'}]]:[[]]);
  m.send.mockResolvedValue({messageId:'sent'});
});
describe('meeting invitation content and settings',()=>{
  it('defaults to five minutes, supports no reminder, and rejects invalid settings',()=>{
    expect(reminderMinutes()).toBe(5);expect(reminderMinutes(null)).toBeNull();expect(reminderMinutes(1440)).toBe(1440);
    for (const n of [-1,0,1.5,'bad',10081]) expect(()=>reminderMinutes(n)).toThrow();
  });
  it('groups by tenant, host, series and meeting type, not occurrence',()=>{
    expect(invitationKey(event)).toBe(invitationKey({...event,id:11}));
    for(const change of [{agency_id:4},{provider_id:4},{meeting_type:'supervision'},{recurrence_series_id:'other'}])expect(invitationKey({...event,...change})).not.toBe(invitationKey(event));
  });
  it('uses a branded personal join link and local timezone, without leaking host tokens',()=>{
    const result=meetingInvitationContent({events:[event],joinUrl:'https://tenant2.example.com/join/invitation/private',hostName:'Host & name'});
    expect(result.subject).toContain('Recurring');expect(result.html).toContain('Leadership &lt;meeting&gt;');expect(result.html).toContain('Host &amp; name');
    expect(result.text).toContain('4:00 PM');expect(result.text).toContain('America/Denver');expect(result.text).toContain('same personal link');expect(result.html).not.toContain('SECRET');
  });
});
describe('personal invitation authorization',()=>{
  it('rejects malformed tokens without a database lookup',async()=>{await expect(resolvePersonalMeetingInvitation('1',5)).rejects.toMatchObject({status:404});expect(m.execute).not.toHaveBeenCalled();});
  it('does not let forwarded links impersonate the invitee',async()=>{await expect(resolvePersonalMeetingInvitation(token,6)).rejects.toMatchObject({status:403});expect(m.execute).toHaveBeenCalledTimes(1);});
  it('rechecks live roster, tenant and active membership before resolving',async()=>{
    const result=await resolvePersonalMeetingInvitation(token,5,new Date('2026-09-28T21:59Z'));
    expect(result.joinUrl).toBe('https://tenant2.example.com/join/team-meeting/participant');
    const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.includes('SELECT p.*'));
    expect(sql).toContain('provider_schedule_event_attendees');expect(sql).toContain('ua.is_active=1');expect(sql).toContain('p.agency_id=?');expect(args).toEqual([10,2,3,5,5,5]);
  });
  it('revokes removed invitees and cancelled meetings',async()=>{m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email')?[[invite]]:[[]]);await expect(resolvePersonalMeetingInvitation(token,5)).rejects.toMatchObject({status:410});});
  it('selects the next active occurrence rather than a completed one',async()=>{
    m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email')?[[invite]]:[[ {...event,meeting_completed_at:'2026-09-28'}, {...event,id:11,start_at:'2026-10-05 22:00:00',end_at:'2026-10-05 23:00:00',participant_join_token:'next'} ]]);
    expect((await resolvePersonalMeetingInvitation(token,5,new Date('2026-09-28T23:00Z'))).joinUrl).toContain('/next');
  });
  it('supervision checks the attendee role/status and uses its separate meeting namespace',async()=>{
    m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email')?[[{...invite,meeting_type:'supervision'}]]:[[ {...event,supervisor_user_id:3} ]]);
    const result=await resolvePersonalMeetingInvitation(token,5,new Date('2026-09-28T21:59Z'));
    expect(result.joinUrl).toContain('/join/supervision/participant');expect(m.execute.mock.calls[1][0]).toContain("'DECLINED','REMOVED','CANCELLED'");
  });
  it('allows rejoining an ongoing meeting after the scheduled end time',async()=>{
    m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email')?[[invite]]:[[{...event,has_live_presence:1}]]);
    expect((await resolvePersonalMeetingInvitation(token,5,new Date('2026-09-28T23:30Z'))).joinUrl).toContain('/participant');
  });
  it('shows in-person details instead of opening a video room that does not exist',async()=>{
    m.execute.mockImplementation(async sql=>sql.includes('SELECT * FROM meeting_email')?[[invite]]:[[{...event,platform_video_link:0}]]);
    const result=await resolvePersonalMeetingInvitation(token,5,new Date('2026-09-28T21:59Z'));
    expect(result.joinUrl).toBeNull();expect(result.meeting.title).toBe(event.title);
  });
  it('creates a stable recipient token without queueing email when only syncing a calendar',async()=>{
    await personalMeetingInvitation(event,5);
    const [sql,args]=m.execute.mock.calls[0];expect(sql).toContain('ON DUPLICATE KEY UPDATE');expect(args[6]).toBe('none');expect(args[5]).toMatch(/^[\w-]{32}$/);
    expect(sql).toContain("VALUES(delivery_status)='pending'");
  });
});
describe('durable invitation delivery',()=>{
  it('sends once per queued recipient, using the tenant email pipeline',async()=>{
    await sendDueMeetingInvitations();expect(m.send).toHaveBeenCalledOnce();
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,to:'person@example.com',triggerKey:'meeting_invited',userId:5}));
    expect(m.send.mock.calls[0][0].text).toContain(`/join/invitation/${token}`);
    expect(m.lock.mock.calls.some(([sql])=>sql.includes("delivery_status=?"))).toBe(true);expect(m.release).toHaveBeenCalledOnce();
  });
  it('prevents concurrent replicas sending the same invite',async()=>{m.lock.mockResolvedValue([[{acquired:0}]]);await sendDueMeetingInvitations();expect(m.send).not.toHaveBeenCalled();});
  it('does not replay a delivery that completed while waiting for the lock',async()=>{m.lock.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[]]);await sendDueMeetingInvitations();expect(m.send).not.toHaveBeenCalled();});
  it('does not label approval-queued email as sent or repeatedly enqueue it',async()=>{m.send.mockResolvedValue({queued:true,pendingApproval:true});await sendDueMeetingInvitations();expect(m.lock).toHaveBeenCalledWith(expect.stringContaining('delivery_status=?'),['approval','approval',null,1]);});
  it('backs off on disabled email instead of flooding requests',async()=>{m.send.mockResolvedValue({skipped:true});await sendDueMeetingInvitations();expect(m.lock.mock.calls.some(([sql])=>sql.includes('INTERVAL 1 HOUR'))).toBe(true);});
});
