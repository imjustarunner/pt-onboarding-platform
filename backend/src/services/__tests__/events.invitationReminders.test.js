import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../companyEventSms.service.js', () => ({ sendCompanyEventSms: vi.fn() }));
vi.mock('../companyEventAudience.service.js', () => ({ resolveCompanyEventAudienceUserIds: vi.fn() }));
import { dueCompanyEventReminders, normalizeCompanyEventReminderConfig, invitationResponse } from '../../utils/companyEventReminders.js';
import { companyEventInvitationEmail, companyEventWhen } from '../../utils/companyEventInvitationEmail.js';
import { companyEventEmailContext, deliverCompanyEventInvitation, sendCompanyEventInvitationsForUsers } from '../companyEventInvitations.service.js';
import { processCompanyEventInvitationReminders } from '../companyEventInvitationReminders.service.js';

const now = new Date('2026-11-11T18:00:00Z');
const config = { enabled: true, offsetsHours: [168,24], channels: { email: true,inApp:true }, rsvp: { enabled:true,intervalHours:48,channels:{email:true,inApp:true} } };
const event = { id:7,agency_id:2,title:'Second anniversary',starts_at:'2026-11-18T18:00:00Z',ends_at:'2026-11-18T20:00:00Z',
  reminder_config_json:config,staff_link_token:'a'.repeat(48),operations_json:{} };
const invitation = { id:20,user_id:5,token:'private',created_at:'2026-11-07T18:00:00Z',response:null,email:'staff@example.com' };
beforeEach(() => { vi.clearAllMocks(); process.env.FRONTEND_URL='https://app.example.com'; });

describe('company RSVP and attendance schedules', () => {
  it('keeps legacy poll channels while adding an independent RSVP schedule', () => {
    expect(normalizeCompanyEventReminderConfig({enabled:true,channels:{sms:true},anchor:'poll_close'})).toMatchObject({enabled:true,channels:{inApp:true,email:false,sms:true},anchor:'poll_close',rsvp:{enabled:false,intervalHours:48}});
  });
  it('reminds unanswered invitees every 48 hours without a date', () => {
    const plans=dueCompanyEventReminders({...event,starts_at:null,ends_at:null},invitation,now);
    expect(plans).toEqual([{kind:'rsvp_reminder',key:'rsvp:2',channels:{email:true,inApp:true,sms:false}}]);
  });
  it('does not immediately remind a new invitee or run after RSVP deadline', () => {
    expect(dueCompanyEventReminders(event,{...invitation,created_at:now.toISOString()},now)).toEqual([]);
    expect(dueCompanyEventReminders({...event,rsvp_deadline:'2026-11-10T18:00:00Z'},invitation,now)).toEqual([]);
  });
  it.each(['yes','no','maybe'])('stops RSVP nudges after %s', response => {
    expect(dueCompanyEventReminders(event,{...invitation,response},now).some(p=>p.kind==='rsvp_reminder')).toBe(false);
  });
  it('also recognizes staff-page replies when invitation response is not synchronized', () => {
    expect(invitationResponse({response_key:'maybe'})).toBe('maybe');
    expect(dueCompanyEventReminders(event,{...invitation,response_key:'no'},now)).toEqual([]);
  });
  it.each(['yes','maybe'])('sends a seven-day attendance reminder to %s',response => {
    expect(dueCompanyEventReminders(event,{...invitation,response},now)).toEqual([{kind:'attendance_reminder',key:'attend:2026-11-18T18:00:00.000Z:168',channels:{email:true,inApp:true,sms:false},offsetHours:168}]);
  });
  it('sends a 24-hour reminder without catching up a seven-day reminder', () => {
    const date=new Date('2026-11-17T18:01:00Z');
    expect(dueCompanyEventReminders(event,{...invitation,response:'yes'},date).map(p=>p.offsetHours)).toEqual([24]);
  });
  it('does not send attendance notices to declines, new invitees or undated events',()=>{
    expect(dueCompanyEventReminders(event,{...invitation,response:'no'},now)).toEqual([]);
    expect(dueCompanyEventReminders({...event,starts_at:null}, {...invitation,response:'yes'},now)).toEqual([]);
    expect(dueCompanyEventReminders(event,{...invitation,response:'yes',created_at:'2026-11-11T17:59:00Z'},now)).toHaveLength(1);
    expect(dueCompanyEventReminders(event,{...invitation,response:'yes',created_at:'2026-11-11T18:01:00Z'},new Date('2026-11-11T18:02:00Z'))).toEqual([]);
  });
});

describe('invitation email presentation and identity',()=>{
  it('uses both hosts, private links and undecided dates without exposing HTML',()=>{
    const message=companyEventInvitationEmail({event:{...event,starts_at:null,title:'Party <script>',description:'Bring <b>ideas</b>'},user:{first_name:'A & B'},
      agencies:[{name:'ITSCO'},{name:'Next Level Up'}],rsvpUrl:'https://app.example.com/event-rsvp/private',detailsUrl:'https://app.example.com/company-events/7/staff/private'});
    expect(message.text).toContain('ITSCO + Next Level Up');expect(message.text).toContain('Date to be decided');
    expect(message.html).toContain('Party &lt;script&gt;');expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('Will you join us?');expect(message.html).toContain('?r=yes');expect(message.html).toContain('Optional attendance');
  });
  it('formats event time in its own timezone',()=>expect(companyEventWhen({...event,timezone:'America/Denver'})).toContain('11:00 AM MST'));
  it('requires events@ rather than falling back to a general sender',async()=>{
    const db={execute:vi.fn().mockResolvedValueOnce([[{id:2,name:'ITSCO'}]]).mockResolvedValueOnce([[]])};
    await expect(companyEventEmailContext(event,db)).rejects.toHaveProperty('code','event_sender_missing');
  });
  it('uses PlotTwistCo events@ and retains both agency brands for cross-agency invitations',async()=>{
    const agencies=[{id:2,name:'ITSCO'},{id:3,name:'NLU'}];
    const db={execute:vi.fn().mockResolvedValueOnce([agencies]).mockResolvedValueOnce([[{id:1}]]).mockResolvedValueOnce([[{id:42,from_email:'events@plottwistco.com'}]])};
    expect(await companyEventEmailContext({...event,operations_json:{invitedAgencyIds:[3]}},db)).toEqual({agencies,identity:{id:42,from_email:'events@plottwistco.com'}});
    expect(db.execute.mock.calls[2][1]).toEqual([1]);
  });
});

describe('durable per-channel delivery',()=>{
  const fixture=()=>{
    const claims=new Set();let next=1;
    const db={execute:vi.fn(async(sql,args)=>{
      if(sql.startsWith('SELECT id,name,slug'))return [[{id:2,name:'ITSCO',slug:'itsco'}]];
      if(sql.startsWith('SELECT i.response'))return [[{response:null}]];
      if(sql.startsWith('INSERT IGNORE INTO company_event_notification_deliveries')){const key=JSON.stringify(args);if(claims.has(key))return[{affectedRows:0}];claims.add(key);return[{affectedRows:1,insertId:next++}];}
      return [{affectedRows:1}];
    })};
    return {db,notify:vi.fn().mockResolvedValue({id:1}),sendEmail:vi.fn().mockResolvedValue({id:'email-1'}),sendSms:vi.fn().mockResolvedValue({sid:'sms-1'})};
  };
  it('claims each channel once across repeated workers',async()=>{
    const deps=fixture(),args={event,invitation,kind:'rsvp_reminder',scheduleKey:'rsvp:2',channels:{email:true,inApp:true},...deps};
    expect(await deliverCompanyEventInvitation(args)).toHaveLength(2);expect(await deliverCompanyEventInvitation(args)).toEqual([]);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);expect(deps.notify).toHaveBeenCalledTimes(1);
  });
  it('rechecks a response between channels and stops after RSVP',async()=>{
    const deps=fixture();deps.notify.mockImplementation(async()=>{deps.db.execute.mockImplementation(async(sql)=>sql.startsWith('SELECT i.response')?[[{response:'yes'}]]:sql.startsWith('SELECT id,name,slug')?[[{id:2,slug:'itsco'}]]:[{affectedRows:1}]);return{id:1};});
    const results=await deliverCompanyEventInvitation({event,invitation,kind:'rsvp_reminder',channels:{email:true,inApp:true},...deps});
    expect(results).toHaveLength(1);expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it('reports email approval as approval rather than success and does not mark email sent',async()=>{
    const deps=fixture();deps.sendEmail.mockResolvedValue({pendingApproval:true,reason:'approval_required'});
    expect(await deliverCompanyEventInvitation({event,invitation,channels:{email:true},...deps})).toMatchObject([{status:'approval'}]);
    expect(deps.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE company_event_invitations'))).toBe(false);
  });
  it('uses the coded RSVP invitation format and agency details URL for the actual SMS dispatch',async()=>{
    const deps=fixture();const result=await deliverCompanyEventInvitation({event:{...event,potluck_enabled:1},invitation:{...invitation,phone_number:'+13035550101'},channels:{sms:true},...deps});
    expect(result).toMatchObject([{channel:'sms',status:'sent'}]);
    expect(deps.sendSms).toHaveBeenCalledWith(expect.objectContaining({mode:'rsvp_invitation',dispatchType:'rsvp_invitation',
      event:expect.objectContaining({invitationPageUrl:`https://app.itsco.health/company-events/7/staff/${event.staff_link_token}`})}));
  });
  it('adds a potluck sign-in next step to the in-app invitation',async()=>{
    const deps=fixture();await deliverCompanyEventInvitation({event:{...event,potluck_enabled:1},invitation,channels:{inApp:true},...deps});
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('Potluck: sign in to choose or update')}));
  });
  it('never rotates an existing invitation token when send is retried',async()=>{
    const deps=fixture();const original=deps.db.execute.getMockImplementation();
    deps.db.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT i.*,')?[[invitation]]:original(sql,args));
    await sendCompanyEventInvitationsForUsers({event,recipientIds:[5],actorUserId:9,channels:{inApp:true},...deps});
    const [sql]=deps.db.execute.mock.calls.find(([query])=>query.startsWith('INSERT INTO company_event_invitations'));
    expect(sql).toContain('ON DUPLICATE KEY UPDATE updated_at = updated_at');expect(sql).not.toContain('token =');
  });
});

describe('invited-only scheduled announcements',()=>{
  it('omits removed audience members and never creates invites for agency bystanders',async()=>{
    const announcement={id:'a1',scheduledAt:'2026-11-11T17:00:00Z',endsAt:'2026-11-12T17:00:00Z',content:'See the latest details'};
    const row={...event,operations_json:{dashboardAnnouncements:[announcement]}};
    const db={execute:vi.fn().mockResolvedValue([[row]])},deliver=vi.fn().mockResolvedValue([]);
    const result=await processCompanyEventInvitationReminders({now,db,resolveRecipientIds:vi.fn().mockResolvedValue([5,8]),
      listInvitations:vi.fn().mockResolvedValue([invitation,{...invitation,id:21,user_id:6}]),deliver});
    expect(result.failures).toEqual([]);expect(deliver.mock.calls.every(([args])=>args.invitation.user_id===5)).toBe(true);
    expect(deliver.mock.calls.find(([args])=>args.kind==='announcement')[0]).toMatchObject({announcement,channels:{inApp:true}});
  });
  it('skips future and expired splashes and events with no sent invitations',async()=>{
    const row={...event,reminder_config_json:{},operations_json:{dashboardAnnouncements:[{id:'expired',scheduledAt:'2026-11-01T00:00:00Z',endsAt:'2026-11-02T00:00:00Z',content:'old'},
      {id:'future',scheduledAt:'2026-12-01T00:00:00Z',content:'future'}]}};
    const deliver=vi.fn();await processCompanyEventInvitationReminders({now,db:{execute:vi.fn().mockResolvedValue([[row]])},resolveRecipientIds:vi.fn().mockResolvedValue([5]),listInvitations:vi.fn().mockResolvedValue([invitation]),deliver});
    expect(deliver).not.toHaveBeenCalled();
  });
});
