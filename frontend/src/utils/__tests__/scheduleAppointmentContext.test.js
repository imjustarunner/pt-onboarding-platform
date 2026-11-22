import { mergeSavedAppointmentCalendar } from '../savedAppointmentCalendar.js';
import { expect, it } from 'vitest';
import { scheduleAppointmentContext } from '../scheduleAppointmentContext.js';

it('preserves explicit clinical source identifiers independently from the provider calendar event id', () => {
  expect(scheduleAppointmentContext({ id: 80, appointmentId: 20, officeEventId: 83, clinicalSessionId: 167, clientId: 2273, tenantServiceId: 34, serviceCode: '90834', serviceLocationId: 125, modality: 'IN_PERSON', appointmentStatus: 'SCHEDULED' })).toMatchObject({
    appointmentId: 20, officeEventId: 83, clinicalSessionId: 167, clinicalNoteId: null, clientId: 2273, tenantServiceId: 34, serviceCode: '90834', serviceLocationId: 125, schoolOrganizationId: null, modality: 'IN_PERSON', appointmentStatus: 'scheduled'
  });
});

it.each(['schoolOrganizationId','school_organization_id','schoolOrgId','school_org_id'])('retains %s so a school session stays beside its assignment rail',field=>{
  expect(scheduleAppointmentContext({appointmentId:20,[field]:'451'})).toMatchObject({appointmentId:20,schoolOrganizationId:451});
  expect(scheduleAppointmentContext({[field]:-451})).toMatchObject({schoolOrganizationId:null});
});

it('does not use generic calendar identifiers as appointment or office identifiers', () => {
  expect(scheduleAppointmentContext({ id: 80, eventId: 80 })).toMatchObject({ appointmentId: null, officeEventId: null, clinicalSessionId: null, clientId: null });
  expect(scheduleAppointmentContext({ appointmentId: -3, officeEventId: 'invalid' })).toMatchObject({ appointmentId: null, officeEventId: null });
});

it('projects a saved client session over its unlinked personal calendar copy until the canonical row arrives', () => {
  const mirror = { id: 71, kind: 'PERSONAL_EVENT', title: 'Personal' };
  const saved = {
    ...mirror, appointmentId: 205, providerId: 4, clientId: 12, clientName: 'Demo Client',
    title: 'Client session', startAt: '2026-11-22T16:00:00Z'
  };
  const overlay = { [saved.appointmentId]: saved };
  expect(mergeSavedAppointmentCalendar({ scheduleEvents: [mirror] }, overlay, 4, '2026-11-16').scheduleEvents)
    .toEqual([saved]);
  const canonical = { ...saved, startAt: '2026-11-22T17:00:00Z' };
  expect(mergeSavedAppointmentCalendar({ scheduleEvents: [canonical] }, overlay, 4, '2026-11-16').scheduleEvents)
    .toEqual([canonical]);
});
