import { expect,it } from 'vitest';
import { mergeSavedAppointmentCalendar, savedAppointmentAcknowledged } from '../savedAppointmentCalendar.js';
const saved={id:51,kind:'PERSONAL_EVENT',providerId:7,agencyId:2,appointmentId:61,clientId:81,clientName:'Test Client',title:'Test Client',startAt:'2026-11-22T15:00:00Z',endAt:'2026-11-22T16:00:00Z',isClientSession:true};
it('keeps saved client identity when an older response contains only a personal calendar facet',()=>{
 const stale={id:51,kind:'PERSONAL_EVENT',title:'Session',startAt:saved.startAt,endAt:saved.endAt};
 const result=mergeSavedAppointmentCalendar({scheduleEvents:[stale]},{61:saved},7,'2026-11-16');
 expect(result.scheduleEvents).toHaveLength(1);expect(result.scheduleEvents[0]).toMatchObject({clientId:81,clientName:'Test Client',appointmentId:61});
 expect(savedAppointmentAcknowledged(stale,saved)).toBe(false);
});
it('uses the canonical schedule after it includes the full appointment context',()=>{
 const canonical={...saved,id:'51',appointmentId:'61',clientName:'Updated Test Client'};
 expect(savedAppointmentAcknowledged(canonical,saved)).toBe(true);
 expect(mergeSavedAppointmentCalendar({scheduleEvents:[canonical]},{61:saved},7,'2026-11-16').scheduleEvents).toEqual([canonical]);
});
it('does not project saved appointments for a different provider or week',()=>{
 expect(mergeSavedAppointmentCalendar(null,{61:saved},8,'2026-11-16')).toBeNull();
 expect(mergeSavedAppointmentCalendar(null,{61:saved},7,'2026-11-23')).toBeNull();
});
