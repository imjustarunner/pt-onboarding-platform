import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import { companyEventPageUrl, eventPageSlug, storedCompanyEventPage } from '../../utils/companyEventPage.js';
import { ensureCompanyEventPage, findCompanyEventPage } from '../companyEventPages.service.js';
import { mapEventOperations, normalizeEventOperations } from '../../utils/companyEventOperations.js';
import { buildEventIcs, makeGoogleCalendarUrl } from '../companyEvents.service.js';
const pageLink={eventId:353,organizationSlug:'itsco',eventSlug:'denver-holiday-potluck-party-353'};
const event={id:353,agency_id:2,event_type:'staff_get_together',title:'Renamed event',operations_json:{pageLink},startsAt:'2030-12-05T00:00:00Z',endsAt:'2030-12-05T02:00:00Z'};
describe('stable central company event links',()=>{
  it('uses the original address after titles, dates and agency choices change',async()=>{
    const db={execute:vi.fn(),getConnection:vi.fn()};
    const url=await ensureCompanyEventPage({...event,agency_id:3,title:'A new title',starts_at:null},{slug:'renamed'},db);
    expect(url).toBe('https://auricwell.com/conversa/events/itsco/denver-holiday-potluck-party-353');
    expect(db.getConnection).not.toHaveBeenCalled();
    expect(mapEventOperations(event).staffPageUrl).toBe(url);
  });
  it('does not reuse an original event’s address when its metadata is copied',()=>{
    expect(storedCompanyEventPage({...event,id:354})).toBeNull();
    expect(companyEventPageUrl({...event,id:354})).toBeNull();
  });
  it('does not accept client-supplied page slugs when saving settings',()=>{
    expect(normalizeEventOperations({pageLink:{eventId:353,organizationSlug:'outside',eventSlug:'wrong'}},event.operations_json).pageLink).toEqual(pageLink);
    expect(normalizeEventOperations({pageLink})).not.toHaveProperty('pageLink');
  });
  it.each(['skills_group','program_workshop','guardian_program_class','team_poll','childcare','tutoring'])('keeps %s out of company page generation',async event_type=>{
    const db={execute:vi.fn(),getConnection:vi.fn()};
    expect(await ensureCompanyEventPage({...event,event_type},{slug:'itsco'},db)).toBeNull();expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('does not create public company links for an organization’s book club',async()=>{
    expect(await ensureCompanyEventPage(event,{slug:'club',club_kind:'book_club'},{getConnection:vi.fn()})).toBeNull();
  });
  it.each(['../private','Bad Name','x/y','%2f',''])('rejects malformed route slug %s before querying events',async slug=>{
    const db={execute:vi.fn()};expect(await findCompanyEventPage({organizationSlug:'itsco',eventSlug:slug},db)).toBeNull();expect(db.execute).not.toHaveBeenCalled();
  });
  it('normalizes readable titles while retaining a useful fallback',()=>{
    expect(eventPageSlug('Café & Team — 2nd Anniversary!')).toBe('cafe-team-2nd-anniversary');expect(eventPageSlug('🎉')).toBe('event');
  });
  it('puts the shared event page into calendar details and the calendar URL property',()=>{
    const row={...event,staffPageUrl:companyEventPageUrl(event)};
    expect(new URL(makeGoogleCalendarUrl(row)).searchParams.get('details')).toContain(row.staffPageUrl);
    expect(buildEventIcs(row)).toContain(`URL:${row.staffPageUrl}`);
  });
});
