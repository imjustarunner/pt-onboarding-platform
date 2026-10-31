import { expect, it } from 'vitest';
import { scheduleAppointmentContext } from '../scheduleAppointmentContext.js';

it('preserves explicit clinical source identifiers independently from the provider calendar event id', () => {
  expect(scheduleAppointmentContext({ id: 80, appointmentId: 20, officeEventId: 83, clinicalSessionId: 167, clientId: 2273, tenantServiceId: 34, serviceCode: '90834', serviceLocationId: 125, modality: 'IN_PERSON', appointmentStatus: 'SCHEDULED' })).toEqual({
    appointmentId: 20, officeEventId: 83, clinicalSessionId: 167, clinicalNoteId: null, clientId: 2273, tenantServiceId: 34, serviceCode: '90834', serviceLocationId: 125, modality: 'IN_PERSON', appointmentStatus: 'scheduled'
  });
});

it('does not use generic calendar identifiers as appointment or office identifiers', () => {
  expect(scheduleAppointmentContext({ id: 80, eventId: 80 })).toMatchObject({ appointmentId: null, officeEventId: null, clinicalSessionId: null, clientId: null });
  expect(scheduleAppointmentContext({ appointmentId: -3, officeEventId: 'invalid' })).toMatchObject({ appointmentId: null, officeEventId: null });
});
