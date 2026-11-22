import {it,expect} from 'vitest';
import {appointmentEmailLinks,appointmentActionsHtml} from '../../utils/appointmentEmailContent.js';
const a={startAt:'2026-11-22 13:45:00',endAt:'2026-11-22 14:45:00'};
const links=[{label:'Confirm tutoring session',url:'https://example.test/confirm'},{label:'Cancel tutoring session',url:'https://example.test/cancel'}];
const join={url:'https://example.test/tutoring/invite#synthetic-only'};
it('prioritizes joining within the real joining window, preserving the opaque fragment',()=>{const ordered=appointmentEmailLinks(a,links,join,Date.parse('2026-11-22T13:30:00Z'));expect(ordered[0].label).toBe('Join tutoring session');expect(ordered[1]).toEqual(links[0]);const html=appointmentActionsHtml(ordered);expect(html).toMatch(/data-appointment-action="primary"[^>]+invite#synthetic-only/);});
it('keeps confirmation primary for future bookings and adds no fake room for in-person bookings',()=>{expect(appointmentEmailLinks(a,links,join,Date.parse('2026-11-22T12:30:00Z'))[0]).toEqual(links[0]);expect(appointmentEmailLinks(a,links,null)).toEqual(links);});
