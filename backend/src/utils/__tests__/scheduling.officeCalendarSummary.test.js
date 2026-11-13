import { expect, it } from 'vitest';
import { officeCalendarSummary } from '../officeCalendarSummary.js';
it('distinguishes the client appointment from its room reservation without copying client details',()=>{
 expect(officeCalendarSummary({client_id:81,clinical_session_id:400,booking_agency_name:'Inner Strength',notes:'private',client_name:'Private Person'},'Windchime','Office #10')).toBe('Client session · Inner Strength · Windchime • Office #10');
 expect(officeCalendarSummary({slot_state:'ASSIGNED_BOOKED'},'Windchime','Office #10')).toBe('Windchime • Office #10 — Booked');
});
