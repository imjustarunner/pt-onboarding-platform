import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), identity: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: m.identity } }));
import { previousWeekday, closureNoticePhase, schoolClosurePlans, closureNoticeMessage } from '../../utils/schoolClosureNotice.js';
import { runSchoolClosureNotifications } from '../schoolClosureNotification.service.js';

const monday = new Date('2026-11-09T13:00:00Z'); // 6 AM Denver, after DST ends.
const districtEvent = { id: 313, agency_id: 2, organization_id: null, district_name: 'D11', event_type: 'school_holiday', title: 'No School', starts_at: '2026-11-09 07:00:00', ends_at: '2026-11-10 06:59:59', timezone: 'America/Denver', is_active: 1, school_event_status: 'scheduled' };
const schoolEvent = { ...districtEvent, id: 340, organization_id: 430, district_name: null, event_type: 'school_day_off', title: 'Professional Development for staff', description: 'No school for students' };
const schools = [{ id: 430, agency_id: 2, name: 'Keller Elementary', slug: 'keller', district_name: 'D11', itsco_email: 'keller@itsco.health' },
  { id: 151, agency_id: 2, name: 'John Adams', slug: 'johnadams', district_name: 'd11' },
  { id: 200, agency_id: 2, name: 'Another district', district_name: 'D12' },
  { id: 450, agency_id: 450, name: 'Other tenant', district_name: 'D11' },
  { id: 414, agency_id: 2, name: 'Fake School Test', district_name: 'D11' }];
const assignments = [{ agency_id: 2, school_id: 430, provider_id: 979, provider_name: 'Lily Finch', work_email: 'lily@itsco.health' },
  { agency_id: 2, school_id: 151, provider_id: 979, provider_name: 'Lily Finch', work_email: 'lily@itsco.health' },
  { agency_id: 2, school_id: 430, provider_id: 496, provider_name: 'Megan', work_email: 'megan@itsco.health' }];
const plans = (changes = {}) => schoolClosurePlans({ events: [districtEvent, schoolEvent], schools, assignments, now: monday, ...changes });
let claims, send;
beforeEach(() => {
  vi.resetAllMocks(); claims = new Set(); send = vi.fn().mockResolvedValue({ id: 'gmail-1', communicationId: 23 });
  m.identity.mockResolvedValue({ id: 12, agency_id: 2, from_email: 'Schools@ITSCO.health' });
  m.execute.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM agencies s')) return [schools.filter(school => school.agency_id === 2)];
    if (sql.includes('SELECT * FROM company_events')) return [[districtEvent, schoolEvent]];
    if (sql.includes('FROM provider_school_assignments')) return [assignments];
    if (sql.startsWith('SELECT id FROM school_closure_notice_deliveries')) return [claims.has(params[1])?[{id:1}]:[]];
    if (sql.startsWith('INSERT IGNORE')) {
      const key = params[1];
      if (claims.has(key)) return [{ affectedRows: 0 }];
      claims.add(key); return [{ affectedRows: 1, insertId: claims.size }];
    }
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('school closure timing and scope', () => {
  it('uses Friday before a Monday closure and separate 3 PM / 6 AM windows', () => {
    expect(previousWeekday('2026-11-09')).toBe('2026-11-06');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-06T21:59:59Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-06T22:00:00Z'))).toBe('advance');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-08T22:00:00Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-09T12:59:59Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', monday)).toBe('morning');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-09T19:00:00Z'))).toBeNull();
  });
  it('follows daylight saving and each calendar’s timezone', () => {
    expect(closureNoticePhase('2026-10-26', 'America/Denver', new Date('2026-10-26T12:00:00Z'))).toBe('morning');
    expect(closureNoticePhase('2026-11-09', 'America/Los_Angeles', monday)).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Los_Angeles', new Date('2026-11-09T14:00:00Z'))).toBe('morning');
  });
  it('combines both sources once and lists every affected assignment for each provider', () => {
    const result = plans({ assignments: [...assignments, assignments[0]] });
    expect(result).toHaveLength(3);
    const lily = result.find(plan => plan.userId === 979);
    expect(lily.schools.map(school => school.id)).toEqual([151, 430]);
    expect(lily.schools.find(school => school.id === 430).sources.map(source => source.id)).toEqual([313, 340]);
    expect(lily.schools.find(school => school.id === 151).sources.map(source => source.id)).toEqual([313]);
    expect(new Set(result.map(plan => plan.key)).size).toBe(3);
  });
  it('does not include another district, another tenant, or a test school', () => {
    expect(plans()[0].schools.map(school => school.id).sort()).toEqual([151, 430]);
    expect(plans({ events: [{ ...districtEvent, is_active: 0 }, { ...schoolEvent, school_event_status: 'canceled' }] })).toEqual([]);
  });
  it('a school-only date affects only that school and its own providers', () => {
    const result = plans({ events: [schoolEvent] });
    expect(result[0].schools.map(school => school.id)).toEqual([430]);
    const message = closureNoticeMessage(result[0], 'schools@itsco.health');
    expect(message.subject).toContain('D11');
    expect(message.text).toContain('Professional Development for staff');
    expect(message.text).not.toContain('D11 has a district-wide');
  });
  it('preserves sessions-prohibited wording and leaves appointments/families untouched', () => {
    const result = plans({ events: [{ ...schoolEvent, event_type: 'school_sessions_prohibited', title: 'Testing' }] });
    const message = closureNoticeMessage(result[1], 'schools@itsco.health');
    expect(message.text).toContain('school sessions prohibited');
    expect(message.text).toContain('does not cancel appointments or notify families');
  });
  it('does not mail weekend days within a long break and handles UTC midnight correctly', () => {
    const result = plans({ events: [{ ...districtEvent, starts_at: '2026-11-06 07:00:00', ends_at: '2026-11-10 07:00:00' }], now: new Date('2026-11-07T14:00:00Z') });
    expect(result).toEqual([]);
    expect(plans({ events: [{ ...districtEvent, ends_at: '2026-11-09 07:00:00' }] })).toEqual([]);
  });
});

describe('school closure delivery choices', () => {
  let preference, teamMembers, notify, mode;
  const account = id => ({id,role:'provider',work_email:id===1000?'schools@itsco.health':assignments.find(a=>a.provider_id===id)?.work_email});
  const run = options => runSchoolClosureNotifications({ now:monday,enabled:true,send,preference,teamMembers,notify,...options });
  beforeEach(()=>{
    mode='app';
    preference=vi.fn(async id=>({user:account(id),recommendedForRole:true,delivery:{mode},effective:{inApp:mode==='app',sms:mode==='sms',email:mode.startsWith('work_email')}}));
    teamMembers=vi.fn().mockResolvedValue([{id:1000}]);
    notify={create:vi.fn(async input=>({id:44,user_id:input.userId,...input})),push:vi.fn().mockResolvedValue({sent:0}),sms:vi.fn().mockResolvedValue({dispatched:true,providerRef:'sms-1'})};
  });
  it('defaults to app delivery without email or texts and includes every source',async()=>{
    const result=await run();expect(result.deliveries.filter(d=>d.status==='sent')).toHaveLength(3);
    expect(notify.create).toHaveBeenCalledTimes(3);expect(notify.push).toHaveBeenCalledTimes(3);expect(send).not.toHaveBeenCalled();expect(notify.sms).not.toHaveBeenCalled();
    const lily=notify.create.mock.calls.find(([n])=>n.userId===979)[0];expect(lily.message).toContain('John Adams');expect(lily.message).toContain('Professional Development for staff');
  });
  it('None records an explicit skip and dispatches no channel',async()=>{
    mode='none';const r=await run();expect(r.deliveries.every(d=>d.reason==='delivery_choice_none')).toBe(true);expect(notify.create).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  });
  it('text uses only the consented SMS channel',async()=>{
    mode='sms';await run();expect(notify.sms).toHaveBeenCalledTimes(3);expect(notify.push).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  });
  it('a disabled text choice never falls back to email',async()=>{
    preference.mockResolvedValue({user:account(979),recommendedForRole:true,delivery:{mode:'sms'},effective:{sms:false}});
    const r=await run();expect(r.deliveries.every(d=>d.status==='skipped')).toBe(true);expect(send).not.toHaveBeenCalled();expect(notify.sms).not.toHaveBeenCalled();
  });
  it('SSO work email uses Schools From and Reply-To without a personal copy',async()=>{
    mode='work_email';await run();expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls.every(([m])=>m.senderIdentityId===12&&m.replyToOverride==='schools@itsco.health'&&!m.bcc)).toBe(true);expect(notify.create).not.toHaveBeenCalled();
  });
  it('non-SSO forwarding sends to work and only the resolved personal copy',async()=>{
    preference.mockImplementation(async id=>({user:{...account(id),sso_password_override:1,personal_email:'person@example.test'},recommendedForRole:true,delivery:{mode:'work_email_forward'},effective:{email:true}}));
    const forwardRecipient=vi.fn().mockResolvedValue('person@example.test');await run({forwardRecipient});
    expect(send.mock.calls.every(([m])=>m.to.endsWith('@itsco.health')&&m.bcc==='person@example.test')).toBe(true);expect(forwardRecipient).toHaveBeenCalledTimes(3);
  });
  it('a changed SSO route does not silently forward or choose another channel',async()=>{
    mode='work_email_forward';const r=await run();expect(r.deliveries.every(d=>d.status==='skipped')).toBe(true);expect(send).not.toHaveBeenCalled();
  });
  it('does not replay completed legacy team or provider deliveries',async()=>{
    claims.add('2:d11:2026-11-09:morning:team');claims.add('2:d11:2026-11-09:morning:provider:979');
    await run();expect(teamMembers).not.toHaveBeenCalled();expect(notify.create).toHaveBeenCalledOnce();expect(notify.create.mock.calls[0][0].userId).toBe(496);
  });
  it('concurrent ticks claim each recipient once',async()=>{
    await Promise.all([run(),run()]);expect(notify.create).toHaveBeenCalledTimes(3);
  });
  it('advance and morning remain separate without replaying either',async()=>{
    await run({now:new Date('2026-11-06T22:00:00Z')});await run();await run();expect(notify.create).toHaveBeenCalledTimes(6);
  });
  it('read-only preview never writes or dispatches',async()=>{
    const r=await run({dryRun:true});expect(r.deliveries).toHaveLength(3);expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);expect(notify.create).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
  });
  it('unverified forwarding is held and not repeated',async()=>{
    preference.mockImplementation(async id=>({user:{...account(id),sso_password_override:1,personal_email:'person@example.test'},recommendedForRole:true,delivery:{mode:'work_email_forward'},effective:{email:true}}));
    const forwardRecipient=vi.fn().mockRejectedValue(new Error('route unavailable'));const r=await run({forwardRecipient});await run({forwardRecipient});expect(r.deliveries.every(d=>d.status==='held')).toBe(true);expect(send).not.toHaveBeenCalled();expect(forwardRecipient).toHaveBeenCalledTimes(3);
  });
  it('the scheduler remains disabled when its rollout flag is off',async()=>{await run({enabled:false});expect(preference).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();});
});
