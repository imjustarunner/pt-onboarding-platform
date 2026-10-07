import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: { findById: vi.fn() } }));
import pool from '../../config/database.js';
import clinical from '../../config/clinicalDatabase.js';
import Location from '../../models/AgencyServiceLocation.model.js';
import { resolveAppointmentServiceSetting, buildSchoolReminder } from '../appointmentServiceSetting.service.js';
beforeEach(() => { vi.resetAllMocks(); pool.execute.mockResolvedValue([[]]); clinical.execute.mockResolvedValue([[]]); });
it('separates the selected school from the billing office', async () => {
  Location.findById.mockResolvedValue({ id: 9, agency_id: 2, name: 'School A', school_organization_id: 8, place_of_service: '03', billing_office_location_id: 77 });
  await expect(resolveAppointmentServiceSetting({ agencyId: 2, serviceLocationId: 9, officeLocationId: 77 })).resolves.toMatchObject({ isSchool: true, locationLabel: 'School A', billingOfficeLocationId: 77, requiresConfirmation: false });
});
it('recovers an older canonical record from its selected booking location', async () => {
  pool.execute.mockResolvedValue([[{ service_location_id: 9 }]]);
  Location.findById.mockResolvedValue({ agency_id: 2, name: 'School A', place_of_service: '03' });
  expect((await resolveAppointmentServiceSetting({ agencyId: 2, officeEventId: 4 })).isSchool).toBe(true);
});
it('recovers the actual school setting from a tenant-scoped clinical encounter', async () => {
  clinical.execute.mockResolvedValue([[{ service_location_id: null, place_of_service: '03' }]]);
  expect((await resolveAppointmentServiceSetting({ agencyId: 2, clinicalSessionId: 18, officeLocationId: 77 })).locationLabel).toBe('School');
  expect(clinical.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id = ?'), [18, 2]);
});
it('keeps a selected office appointment even for a school-enrolled child', async () => {
  Location.findById.mockResolvedValue({ agency_id: 2, name: 'Office A', place_of_service: '11' });
  expect((await resolveAppointmentServiceSetting({ agencyId: 2, serviceLocationId: 7, clientType: 'school' })).isSchool).toBe(false);
});
it('never describes a billing office alone as the place of care', async () => {
  expect((await resolveAppointmentServiceSetting({ agencyId: 2, officeLocationId: 77 })).locationLabel).toBe('Service location needs review');
});
it('rejects cross-tenant service locations', async () => {
  Location.findById.mockResolvedValue({ agency_id: 3, name: 'Private school' });
  await expect(resolveAppointmentServiceSetting({ agencyId: 2, serviceLocationId: 7 })).rejects.toMatchObject({ code: 'SERVICE_LOCATION_INVALID' });
});
it('uses local time and a minimal absence notice without confirmation or private labels', () => {
  const text = buildSchoolReminder({ startAt: '2026-10-07 16:00:00', sourceTimezone: 'America/Denver', title: 'Private diagnosis' });
  expect(text).toContain('10:00 AM MDT');
  expect(text).toContain('No confirmation is needed');
  expect(text).toContain('report school absences to the school');
  expect(text).not.toMatch(/Y to confirm|N to cancel|Private diagnosis/);
});
