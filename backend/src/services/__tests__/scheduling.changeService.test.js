import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn(), listParticipants: vi.fn(), upsertBilling: vi.fn(), getBilling: vi.fn() } }));
vi.mock('../../models/BookingPackage.model.js', () => ({ default: { applyAppointmentUsage: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClientMedicaidAttendanceStrike.model.js', () => ({ default: {} }));
vi.mock('../appointment.service.js', () => ({ getAppointmentBundle: vi.fn(), updateAppointment: vi.fn() }));
vi.mock('../appointmentChangeWorkflow.service.js', () => ({ runSignedAppointmentChange: vi.fn() }));
vi.mock('../appointmentCalendarMaintenance.service.js', () => ({ releaseAppointmentCalendar: vi.fn() }));
vi.mock('../appointmentReminder.service.js', () => ({ cancelPendingReminders: vi.fn() }));
vi.mock('../bookingCancellationPolicy.service.js', () => ({ evaluateCancel: vi.fn() }));
vi.mock('../practitionerPackage.service.js', () => ({ applyMissedSessionPolicy: vi.fn() }));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import { getAppointmentBundle, updateAppointment } from '../appointment.service.js';
import { runSignedAppointmentChange } from '../appointmentChangeWorkflow.service.js';
import { releaseAppointmentCalendar } from '../appointmentCalendarMaintenance.service.js';
import { evaluateCancel } from '../bookingCancellationPolicy.service.js';
import { applyMissedSessionPolicy } from '../practitionerPackage.service.js';
import { previewAppointmentChange, completeAppointmentChange } from '../appointmentChange.service.js';
const actor = { actorUserId: 9, actorRole: 'provider' };
const canceled = { eventType: 'canceled', clientId: 3, initiator: 'client', reasons: ['illness'], signatureConfirmed: true };
let appointment, packageRow;
beforeEach(() => {
  vi.clearAllMocks();
  appointment = { id: 1, agencyId: 2, providerUserId: 9, providerScheduleEventId: 10, startAt: '2026-01-01 17:00:00', status: 'confirmed', clinicalSessionId: 4 };
  packageRow = null;
  getAppointmentBundle.mockImplementation(async () => appointment); Appointment.findById.mockImplementation(async () => appointment);
  Appointment.listParticipants.mockResolvedValue([{ clientId: 3, isBillingResponsible: true }]);
  updateAppointment.mockImplementation(async (id, patch) => ({ ...appointment, ...patch }));
  evaluateCancel.mockResolvedValue({ allowed: true, isLate: true, withinNotice: false, recommendedFeeCents: 2500, recommendedPackageAction: 'forfeit', policy: { noticeHours: 24 } });
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM clients')) return [[{ insurance_type: 'Commercial' }]];
    if (sql.includes('booking_package_ledger')) return [[]];
    if (sql.includes('FROM agencies')) return [[{ medicaid_strike_policy_enabled: 0 }]];
    if (sql.includes('package_entitlements')) return [[packageRow].filter(Boolean)];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  runSignedAppointmentChange.mockImplementation(async (id, facts, who, { previewChange, applyChange }) => applyChange(id, facts, who, await previewChange(id, facts, who)));
});
describe('appointment change consequences and completion', () => {
  it('never offers a secondary claim and keeps amounts out of provider narratives', async () => {
    const preview = await previewAppointmentChange(1, canceled, actor);
    expect(preview.insuranceClaim).toMatchObject({ willCreatePrimarySessionClaim: false, willCreateSecondaryClaim: false });
    expect(preview.narrative).not.toContain('$'); expect(preview.consequence.summary).not.toContain('$');
  });
  it('rejects a client who is not attached to the appointment', async () => {
    await expect(previewAppointmentChange(1, { ...canceled, clientId: 88 }, actor)).rejects.toThrow('attached');
  });
  it('requires an explicit valid replacement instead of silently linking the next session', async () => {
    await expect(completeAppointmentChange(1, { ...canceled, eventType: 'rescheduled' }, actor)).rejects.toThrow('replacement');
    Appointment.findById.mockResolvedValue({ id: 99, agencyId: 77 });
    await expect(previewAppointmentChange(1, { ...canceled, replacementAppointmentId: 99 }, actor)).rejects.toThrow('another active appointment');
  });
  it('releases a provider-canceled package reservation with no client fee', async () => {
    appointment.packageEntitlementId = 7; appointment.clinicalSessionId = null;
    packageRow = { id: 7, sessions_remaining: 5 };
    const result = await completeAppointmentChange(1, { ...canceled, initiator: 'provider' }, actor);
    expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'release', entitlementId: 7 }));
    expect(result.appointment.cancellationFeeCents).toBe(0); expect(releaseAppointmentCalendar).toHaveBeenCalledOnce();
  });
  it('forfeits a selected booking package once without invoking automatic settlement too', async () => {
    appointment.packageEntitlementId = 7; appointment.clinicalSessionId = null; packageRow = { id: 7, sessions_remaining: 5 };
    await completeAppointmentChange(1, { ...canceled, eventType: 'no_show', reasonKnown: false, outreach: ['called'] }, actor);
    expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledOnce();
    expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'forfeit' }));
    expect(updateAppointment).toHaveBeenCalledWith(1, expect.anything(), { actorUserId: 9, settleOutcome: false });
    expect(applyMissedSessionPolicy).not.toHaveBeenCalled();
  });
  it('applies the existing practitioner free-miss policy to the same entitlement', async () => {
    appointment.clinicalSessionId = null;
    packageRow = { id: 8, sessions_remaining: 6, free_rebooks_remaining: 1, missed_session_policy_json: { type: 'free_rebook' } };
    const preview = await previewAppointmentChange(1, canceled, actor);
    expect(preview.consequence).toMatchObject({ packageAction: 'free_miss', after: { sessionsRemaining: 6, freeMissesRemaining: 0 } });
    await completeAppointmentChange(1, canceled, actor);
    expect(applyMissedSessionPolicy).toHaveBeenCalledWith(expect.objectContaining({ entitlementId: 8, providerScheduleEventId: 10 }));
  });
  it('previews an administrator waiver without showing a credit deduction', async () => {
    appointment.packageEntitlementId = 7; appointment.clinicalSessionId = null;
    packageRow = { id: 7, sessions_remaining: 5, free_rebooks_remaining: 1 };
    const preview = await previewAppointmentChange(1, { ...canceled, waiver: { action: 'waive', reason: 'illness' } }, { actorUserId: 9, actorRole: 'admin' });
    expect(preview.consequence).toMatchObject({ packageAction: 'waived', before: { sessionsRemaining: 5 }, after: { sessionsRemaining: 5 } });
    expect(preview.narrative).not.toContain('free miss was applied');
  });
  it('rejects provider approval of a financial waiver', async () => {
    await expect(completeAppointmentChange(1, { ...canceled, waiver: { action: 'waive', reason: 'illness' } }, actor)).rejects.toThrow('Administrator');
  });
  it('does not report success if calendar cleanup fails', async () => {
    releaseAppointmentCalendar.mockRejectedValueOnce(new Error('calendar unavailable'));
    await expect(completeAppointmentChange(1, canceled, actor)).rejects.toThrow('calendar unavailable');
  });
});
