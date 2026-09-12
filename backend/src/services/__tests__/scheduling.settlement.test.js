import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn(), getBilling: vi.fn(), listParticipants: vi.fn(), upsertBilling: vi.fn() } }));
vi.mock('../../models/BookingPackage.model.js', () => ({ default: { applyAppointmentUsage: vi.fn() } }));
vi.mock('../practitionerPackage.service.js', () => ({ debitSessionOnComplete: vi.fn(), applyMissedSessionPolicy: vi.fn() }));
import Appointment from '../../models/Appointment.model.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import { debitSessionOnComplete, applyMissedSessionPolicy } from '../practitionerPackage.service.js';
import { settleAppointmentOutcome } from '../appointmentSettlement.service.js';
describe('session settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Appointment.findById.mockResolvedValue({ id: 1, agencyId: 1, packageEntitlementId: 7, providerScheduleEventId: 8 });
    Appointment.getBilling.mockResolvedValue({ paymentStatus: 'none' });
    Appointment.listParticipants.mockResolvedValue([{ clientId: 2 }]);
    BookingPackage.applyAppointmentUsage.mockResolvedValue({ sessionsRemaining: 1 });
  });
  it('debits only the selected package system', async () => {
    expect(await settleAppointmentOutcome(1, { outcome: 'completed' })).toMatchObject({ settled: true, paymentStatus: 'package_consumed' });
    expect(debitSessionOnComplete).not.toHaveBeenCalled();
    expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledOnce();
  });
  it('no-show cannot consume both package systems', async () => {
    await settleAppointmentOutcome(1, { outcome: 'no_show' });
    expect(applyMissedSessionPolicy).not.toHaveBeenCalled();
  });
  it('does not report success when package usage failed', async () => {
    BookingPackage.applyAppointmentUsage.mockRejectedValue(new Error('ledger unavailable'));
    await expect(settleAppointmentOutcome(1, { outcome: 'completed' })).rejects.toThrow('ledger unavailable');
    expect(Appointment.upsertBilling).not.toHaveBeenCalled();
  });
  it('medical sessions cannot debit unrelated tutoring packages', async () => {
    Appointment.findById.mockResolvedValue({ id: 1, agencyId: 1, clinicalSessionId: 4, providerScheduleEventId: 8 });
    expect(await settleAppointmentOutcome(1, { outcome: 'completed' })).toMatchObject({ reason: 'CLINICAL_BILLING' });
    expect(debitSessionOnComplete).not.toHaveBeenCalled();
  });
});
