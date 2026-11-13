import { describe, expect, it } from 'vitest';
import { projectScheduleGoogleOverlay } from '../scheduleGoogleOverlay.service.js';
const event = (id, extra = {}) => ({ id, startAt: '2026-11-26T22:00:00Z', endAt: '2026-11-26T23:00:00Z', htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`, ...extra });
describe('Google events outside the app calendar', () => {
  it('removes explicit app copies while retaining a real external meeting at the identical time', () => {
    const result = projectScheduleGoogleOverlay({ events: [event('app'), event('external')], scheduleEvents: [{id:7, googleEventId:'app'}] });
    expect(result.events.map(e => e.id)).toEqual(['external']);
    expect(result.scheduleEvents[0].googleCalendarUrl).toContain('eid=app');
  });
  it('recognizes office, supervision and program copies by their Google metadata', () => {
    const events = [event('office',{extendedProperties:{private:{pt_office_event_id:'9'}}}),event('supervision',{extendedProperties:{private:{pt_supervision_session_id:'3'}}}),event('program',{extendedProperties:{private:{pt_kind:'COMPANY_EVENT_SESSION'}}})];
    const result = projectScheduleGoogleOverlay({events,officeEvents:[{id:9}],supervisionSessions:[{id:3}]});
    expect(result.events).toEqual([]); expect(result.officeEvents[0].googleCalendarUrl).toContain('office'); expect(result.supervisionSessions[0].googleCalendarUrl).toContain('supervision');
  });
  it('recognizes legacy stored office copy IDs and recurring instance master IDs', () => {
    const result = projectScheduleGoogleOverlay({events:[event('legacy'), event('series_20261126',{recurringEventId:'series'})], officeEvents:[{id:9,googleEventId:'legacy'}], scheduleEvents:[{id:3,googleEventId:'series'}]});
    expect(result.events).toHaveLength(0);
  });
  it('does not expose unsafe links or mutate canonical rows', () => {
    const row = {id:3, googleEventId:'app'};
    const result = projectScheduleGoogleOverlay({events:[event('app',{htmlLink:'javascript:alert(1)'})], scheduleEvents:[row]});
    expect(result.scheduleEvents[0]).not.toHaveProperty('googleCalendarUrl'); expect(row).not.toHaveProperty('googleCalendarUrl');
  });
  it('removes cancelled external events without hiding other external events', () => {
    expect(projectScheduleGoogleOverlay({events:[event('cancelled',{status:'cancelled'}),event('valid')]}).events.map(e=>e.id)).toEqual(['valid']);
  });
});
