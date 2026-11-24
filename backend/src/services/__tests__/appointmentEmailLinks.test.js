import {it,expect} from 'vitest';
import {appointmentEmailLinks,appointmentActionsHtml} from '../../utils/appointmentEmailContent.js';
import {standardizeEmailButtons} from '../../utils/emailActionButton.js';
const a={startAt:'2026-11-22 13:45:00',endAt:'2026-11-22 14:45:00'};
const links=[{label:'Confirm tutoring session',url:'https://example.test/confirm'},{label:'Cancel tutoring session',url:'https://example.test/cancel'}];
const join={url:'https://example.test/tutoring/invite#synthetic-only'};
it('prioritizes joining within the real joining window, preserving the opaque fragment',()=>{const ordered=appointmentEmailLinks(a,links,join,Date.parse('2026-11-22T13:30:00Z'));expect(ordered[0].label).toBe('Join tutoring session');expect(ordered[1]).toEqual(links[0]);const html=appointmentActionsHtml(ordered);expect(html).toMatch(/data-appointment-action="primary"[^>]+invite#synthetic-only/);});
it('keeps confirmation primary for future bookings and adds no fake room for in-person bookings',()=>{expect(appointmentEmailLinks(a,links,join,Date.parse('2026-11-22T12:30:00Z'))[0]).toEqual(links[0]);expect(appointmentEmailLinks(a,links,null)).toEqual(links);});
it('keeps the secondary join a compact centered teal button through final email formatting',()=>{
 const ordered=appointmentEmailLinks(a,[...links,{label:'Request a new time',url:'https://example.test/new-time'}],join,Date.parse('2026-11-22T12:30:00Z'));
 const html=standardizeEmailButtons(appointmentActionsHtml(ordered),'#123456');
 expect(ordered.at(-1).action).toBe('join');
 expect(html).toMatch(/<p align="center"[^>]*><a[^>]*data-appointment-join="true"/);
 const button=html.match(/<a[^>]*data-appointment-join="true"[^>]*>/)[0];
 expect(button).toContain('display:inline-block;width:auto');expect(button).toContain('background:#147d73');expect(button).toContain('color:#ffffff');
 expect(html.indexOf('Request a new time')).toBeLessThan(html.indexOf('Join tutoring session'));
 expect(html.match(/display:block/g)).toHaveLength(3);
});
