import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn(), getBilling: vi.fn(), listParticipants: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/clinical/ClinicalSession.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../appointmentContext.service.js', () => ({ ensureAppointmentContext: vi.fn() }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: { findById: vi.fn() } }));
import AgencyServiceLocation from '../../models/AgencyServiceLocation.model.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import Appointment from '../../models/Appointment.model.js';
import Client from '../../models/Client.model.js';
import ClinicalSession from '../../models/clinical/ClinicalSession.model.js';
import { ensureAppointmentContext } from '../appointmentContext.service.js';
import { ensureAppointmentClinicalLink } from '../appointmentClinicalLink.service.js';
describe('appointment clinical linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Appointment.getBilling.mockResolvedValue(null);
    Appointment.findById.mockResolvedValue({ id: 3, agencyId: 1, providerUserId: 9, modality: 'TELEHEALTH',
      startAt: '2026-09-01 18:00:00', endAt: '2026-09-01 19:00:00', serviceCode: '90837' });
    Appointment.listParticipants.mockResolvedValue([{ clientId: 2, role: 'client' }]);
    Client.findById.mockResolvedValue({ id: 2, agency_id: 1, client_type: 'clinical' });
    pool.execute.mockResolvedValue([[]]);
    clinicalPool.execute.mockImplementation(async (sql, params) => sql.includes('SELECT *')
      ? [[{ id: 20 + params[1], client_id: params[1] }]] : [{ affectedRows: 1 }]);
  });
  it('creates a clinical session without requiring an office reservation', async () => {
    expect(await ensureAppointmentClinicalLink(3, 9)).toEqual([{ id: 22, client_id: 2 }]);
    expect(Appointment.update).toHaveBeenCalledWith(3, { clinicalSessionId: 22 });
    expect(clinicalPool.execute.mock.calls[0][0]).toContain('ON DUPLICATE KEY UPDATE');
  });
  it('keeps self-pay-only clinical notes linked with insurance claims blocked from insertion', async () => {
    Appointment.getBilling.mockResolvedValue({ settlementMode: 'self_pay_only' });
    await ensureAppointmentClinicalLink(3, 9);
    const [sql, values] = clinicalPool.execute.mock.calls[0];
    expect(sql).toContain('claim_blocked_reason');
    expect(values.at(-1)).toMatch(/^SELF_PAY_ONLY:/);
    expect(sql.match(/\?/g).length).toBe(values.length);
    expect(Appointment.update).toHaveBeenCalledWith(3, { clinicalSessionId: 22 });
  });
  it('blocks claims for office sessions that do not yet carry appointment_id', async () => {
    Appointment.findById.mockResolvedValue({ id: 3, agencyId: 1, providerUserId: 9, officeEventId: 7 });
    Appointment.getBilling.mockResolvedValue({ settlementMode: 'self_pay_only' });
    ensureAppointmentContext.mockResolvedValue({ ensured: true, context: { clinicalSessionId: 22 } });
    ClinicalSession.findById.mockResolvedValue({ id: 22, appointment_id: null });
    await ensureAppointmentClinicalLink(3, 9);
    expect(clinicalPool.execute).toHaveBeenCalledWith('UPDATE clinical_sessions SET claim_blocked_reason = ? WHERE id = ? AND agency_id = ?', [expect.stringMatching(/^SELF_PAY_ONLY:/), 22, 1]);
  });
  it('retains clinical documentation for a prepaid counseling package and blocks insurance', async () => {
    const appointment = await Appointment.findById();
    Appointment.findById.mockResolvedValue({ ...appointment, businessType: 'mental_health', packageEntitlementId: 6 });
    Appointment.getBilling.mockResolvedValue({ settlementMode: 'package' });
    await ensureAppointmentClinicalLink(3, 9);
    expect(Appointment.update).toHaveBeenCalledWith(3, { clinicalSessionId: 22 });
    expect(clinicalPool.execute.mock.calls[0][1].at(-1)).toMatch(/Prepaid package/);
  });
  it('creates separate client contexts for a group', async () => {
    Appointment.listParticipants.mockResolvedValue([{ clientId: 2, role: 'client' }, { clientId: 4, role: 'client' }]);
    expect((await ensureAppointmentClinicalLink(3, 9)).map((row) => row.client_id)).toEqual([2, 4]);
  });
  it('preserves the selected school location and its billing address', async () => {
    const appointment = await Appointment.findById();
    Appointment.findById.mockResolvedValue({ ...appointment, serviceLocationId: 6, sourceTimezone: 'America/Chicago' });
    AgencyServiceLocation.findById.mockResolvedValue({ id: 6, agency_id: 1, place_of_service: '03', billing_office_location_id: 7 });
    await ensureAppointmentClinicalLink(3, 9);
    const [sql, values] = clinicalPool.execute.mock.calls[0];
    expect(values[5]).toBe('America/Chicago');
    expect(values.slice(-4)).toEqual([6, 7, '03', null]);
    expect(sql.match(/\?/g).length).toBe(values.length);
  });
  it('rejects a location belonging to another agency', async () => {
    const appointment = await Appointment.findById();
    Appointment.findById.mockResolvedValue({ ...appointment, serviceLocationId: 6 });
    AgencyServiceLocation.findById.mockResolvedValue({ id: 6, agency_id: 99 });
    await expect(ensureAppointmentClinicalLink(3, 9)).rejects.toThrow('does not belong');
    expect(clinicalPool.execute).not.toHaveBeenCalled();
  });
  it('rejects clients outside the appointment agency before creating records', async () => {
    Client.findById.mockResolvedValue({ id: 2, agency_id: 99, client_type: 'clinical' });
    await expect(ensureAppointmentClinicalLink(3, 9)).rejects.toThrow('not assigned');
    expect(clinicalPool.execute).not.toHaveBeenCalled();
  });
  it('does not create medical billing records for a tutoring package', async () => {
    Appointment.findById.mockResolvedValue({ id: 3, agencyId: 1, packageEntitlementId: 7, businessType: 'tutoring' });
    expect(await ensureAppointmentClinicalLink(3, 9)).toEqual([]);
    expect(clinicalPool.execute).not.toHaveBeenCalled();
  });
});
