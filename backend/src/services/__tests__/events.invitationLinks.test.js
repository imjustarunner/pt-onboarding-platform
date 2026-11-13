import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { companyEventInvitationLinks, resolveCompanyEventInvitationLinks } from '../companyEventLinks.service.js';
import { buildCompanyEventSms } from '../../utils/companyEventSms.js';
const event = {id:353,agency_id:2,title:'Denver Holiday Potluck Party!',staff_link_token:'a'.repeat(48),potluck_enabled:1,starts_at:null,
  description:'Celebrate the season together.',event_location_name:'Denver office',operations_json:{invitedAgencyIds:[3],pageLink:{eventId:353,organizationSlug:'itsco',eventSlug:'denver-holiday-potluck-party-353'}}};
afterEach(() => vi.unstubAllEnvs());
describe('agency event invitation links and text', () => {
  it('uses one central event page for multi-agency invitations and personal RSVP links', async () => {
    vi.stubEnv('FRONTEND_URL','https://plottwisthq.com');
    const db={execute:vi.fn()};
    const page='https://auricwell.com/conversa/events/itsco/denver-holiday-potluck-party-353';
    expect(await resolveCompanyEventInvitationLinks(event,'personal-token',db)).toEqual({rsvpUrl:page+'?invitation=personal-token',detailsUrl:page,smsUrl:page});
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('keeps agency hosts for program registration while company invitations share the central page', () => {
    const agency={slug:'example',custom_domain:'events.example.org'};
    expect(companyEventInvitationLinks(event,'token',agency).smsUrl).toContain('https://auricwell.com/conversa/events/itsco/');
    expect(companyEventInvitationLinks({...event,event_type:'program_workshop',operations_json:{publicRegistrationEnabled:true}},'token',agency).smsUrl).toBe('https://events.example.org/company-events/353');
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
