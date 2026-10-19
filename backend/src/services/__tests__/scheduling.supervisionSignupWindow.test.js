import { describe, expect, it } from 'vitest';
import { getSupervisionSignupWindow } from '../supervisionSignupWindow.js';
import { wallMysqlToUtcMysql } from '../../utils/zonedWallTime.util.js';
import { canViewDeclinedMeetingParticipants, visibleMeetingRsvpParticipants } from '../meetingRsvpVisibility.js';

describe('signup-only supervision window', () => {
  const session = { start_at:'2026-10-22 00:00:00', signup_closes_at:'2026-10-19 18:00:00' };
  it('opens exactly 24 hours before and closes exactly one hour before the current date', () => {
    expect(getSupervisionSignupWindow(session, '2026-10-20T23:59:59Z')).toMatchObject({signupState:'upcoming',signupOpen:false});
    expect(getSupervisionSignupWindow(session, '2026-10-21T00:00:00Z')).toEqual({signupOpensAt:'2026-10-21T00:00:00.000Z',signupClosesAt:'2026-10-21T23:00:00.000Z',signupState:'open',signupOpen:true});
    expect(getSupervisionSignupWindow(session, '2026-10-21T22:59:59Z').signupOpen).toBe(true);
    expect(getSupervisionSignupWindow(session, '2026-10-21T23:00:00Z').signupState).toBe('closed');
  });
  it.each(['2026-03-08 10:00:00','2026-11-01 10:00:00'])('keeps a full 24h invitation lead across Denver DST on %s', wall => {
    const start_at = wallMysqlToUtcMysql(wall,'America/Denver');
    const window = getSupervisionSignupWindow({start_at});
    expect(Date.parse(start_at.replace(' ','T')+'Z') - Date.parse(window.signupOpensAt)).toBe(24*3600000);
    expect(Date.parse(window.signupClosesAt) - Date.parse(window.signupOpensAt)).toBe(23*3600000);
  });
  it('fails closed for cancelled or invalid sessions', () => {
    expect(getSupervisionSignupWindow({...session,status:'CANCELLED'},'2026-10-21T01:00:00Z').signupOpen).toBe(false);
    expect(getSupervisionSignupWindow({start_at:'garbage'}).signupOpen).toBe(false);
  });
});

describe('event RSVP privacy', () => {
  const event={provider_id:5,supervisor_user_id:5,co_facilitator_user_id:6};
  const people=[{id:1,name:'Yes',status:'SIGNED_UP'},{id:2,name:'No',status:'DECLINED',decline_reason:'Private reason'},{id:3,name:'Pending',status:'INVITED'},{id:4,name:'Withdrew',rsvp:'declined',rsvp_decline_reason:'Private'}];
  it.each(['provider','staff','clinical_practice_assistant'])('keeps confirmed and pending RSVPs visible, excluding declines for ordinary %s viewers', role => {
    const access=canViewDeclinedMeetingParticipants(event,{id:1,role},people);
    expect(access).toBe(false);
    expect(visibleMeetingRsvpParticipants(people,access).map(p=>p.name)).toEqual(['Yes','Pending']);
  });
  it.each(['admin','super_admin','superadmin','support'])('permits authorized event %s viewers to see declined replies', role => {
    expect(canViewDeclinedMeetingParticipants(event,{id:1,role},people)).toBe(true);
  });
  it('permits only assigned hosts and cohosts, rather than all supervisors', () => {
    expect(canViewDeclinedMeetingParticipants(event,{id:5,role:'provider'},people)).toBe(true);
    expect(canViewDeclinedMeetingParticipants(event,{id:6,role:'provider'},people)).toBe(true);
    expect(canViewDeclinedMeetingParticipants(event,{id:1,role:'supervisor'},people)).toBe(false);
    expect(canViewDeclinedMeetingParticipants(event,{id:1,role:'provider'},[{id:1,is_cohost:1}])).toBe(true);
    expect(visibleMeetingRsvpParticipants(people,true)[1].decline_reason).toBe('Private reason');
  });
});
