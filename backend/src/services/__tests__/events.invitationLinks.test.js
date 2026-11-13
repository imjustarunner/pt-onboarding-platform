import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { companyEventInvitationLinks, resolveCompanyEventInvitationLinks } from '../companyEventLinks.service.js';
import { buildCompanyEventSms } from '../../utils/companyEventSms.js';
const event = {id:353,agency_id:2,title:'Denver Holiday Potluck Party!',staff_link_token:'a'.repeat(48),potluck_enabled:1,starts_at:null,
  description:'Celebrate the season together.',event_location_name:'Denver office',operations_json:{invitedAgencyIds:[3]}};
afterEach(() => vi.unstubAllEnvs());
describe('agency event invitation links and text', () => {
  it('keeps a multi-agency event at its host agency while preserving the shared invitation token', async () => {
    vi.stubEnv('FRONTEND_URL','https://plottwisthq.com');
    const db={execute:vi.fn().mockResolvedValue([[{id:2,name:'ITSCO',slug:'itsco'}]])};
    const links=await resolveCompanyEventInvitationLinks(event,'personal-token',db);
    expect(links).toEqual({rsvpUrl:'https://app.itsco.health/event-rsvp/personal-token',detailsUrl:`https://app.itsco.health/company-events/353/staff/${event.staff_link_token}`,smsUrl:`https://app.itsco.health/company-events/353/staff/${event.staff_link_token}`});
    expect(db.execute.mock.calls[0][1]).toEqual([2]);
  });
  it('uses the configured agency app domain and keeps public registration an explicit choice', () => {
    const agency={slug:'example',custom_domain:'events.example.org'};
    expect(companyEventInvitationLinks(event,'token',agency).smsUrl).toContain('https://events.example.org/company-events/353/staff/');
    expect(companyEventInvitationLinks({...event,operations_json:{publicRegistrationEnabled:true}},'token',agency).smsUrl).toBe('https://events.example.org/company-events/353');
  });
  it('puts usable RSVP commands, date status, venue, description and potluck steps in the initial invitation', () => {
    const text=buildCompanyEventSms({event:{...event,invitationPageUrl:'https://app.itsco.health/company-events/353'},code:128,brandName:'ITSCO',mode:'rsvp_invitation'});
    expect(text).toContain('Yes 128, No 128, or Maybe 128');
    expect(text).toContain('Date to be decided');expect(text).toContain('Denver office');expect(text).toContain('Celebrate the season together.');
    expect(text).toContain('Event details (no login needed)');expect(text).toContain('sign in on the event page');
    expect(text).toContain('MUTE 128');expect(text).toContain('does not change your RSVP');
    expect(text).not.toContain('Reply 128 to turn off');
  });
  it('preserves the existing poll invitation and opt-out format exactly', () => {
    const body='Which dates work best?\n1: Friday\n2: Saturday\nReply 129 1 (or another option).';
    expect(buildCompanyEventSms({event,code:129,body,brandName:'ITSCO',purpose:'polling'})).toBe(`${body}\nReply 129 to turn off texts about this event. Reply NOPOLLS to stop poll texts only.`);
  });
  it('preserves participant service-event text controls separately from employee RSVP commands',()=>{
    expect(buildCompanyEventSms({event,code:128,body:'Your class is tomorrow.',brandName:'ITSCO',audience:'participant',purpose:'reminders'})).toBe("Your class is tomorrow.\nReply 128 to turn off texts about this event. Reply STOP to opt out of ITSCO's Service Texting. HELP for help. Msg & data rates may apply.");
  });
});
