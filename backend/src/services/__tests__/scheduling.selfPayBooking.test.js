import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn().mockResolvedValue([[]]) } }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn().mockResolvedValue([{ id: 1 }]), findById: vi.fn().mockResolvedValue({ role: 'provider' }) } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { create: vi.fn(), findById: vi.fn(), getBilling: vi.fn(), listParticipants: vi.fn(), replaceParticipants: vi.fn(), setServiceCodes: vi.fn(), upsertBilling: vi.fn() } }));
vi.mock('../../models/TenantService.model.js', () => ({ default: { findById: vi.fn(), listForAgency: vi.fn() } }));
vi.mock('../../models/StaffServiceAssignment.model.js', () => ({ default: { listServiceIdsForUser: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../models/AgencyBusinessType.model.js', () => ({ default: {} }));
vi.mock('../../models/BookingPackage.model.js', () => ({ default: { findEntitlementById: vi.fn(), applyAppointmentUsage: vi.fn() } }));
vi.mock('../../models/BookingCancellationPolicy.model.js', () => ({ default: {} }));
vi.mock('../appointmentClinicalLink.service.js', () => ({ ensureAppointmentClinicalLink: vi.fn(), assertAppointmentClients: vi.fn().mockResolvedValue([{ client_type: 'clinical' }]) }));
vi.mock('../schedulingTaxonomy.service.js', () => ({ validateSchedulingSelection: vi.fn() }));
vi.mock('../bookingCancellationPolicy.service.js', () => ({ resolvePolicyForAppointmentContext: vi.fn().mockResolvedValue({}), evaluateCancel: vi.fn() }));
vi.mock('../appointmentReminder.service.js', () => ({ cancelPendingReminders: vi.fn(), listReminders: vi.fn().mockResolvedValue([]), listCommunications: vi.fn().mockResolvedValue([]) }));
vi.mock('../sessionNotification.service.js', () => ({ scheduleSessionNotifications: vi.fn() }));
vi.mock('../appointmentSettlement.service.js', () => ({ settleAppointmentOutcome: vi.fn() }));
vi.mock('../selfPayRates.service.js', () => ({ getAgencySelfPayOnly: vi.fn(), resolveSelfPayQuote: vi.fn() }));
import Appointment from '../../models/Appointment.model.js';
import TenantService from '../../models/TenantService.model.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import { getAgencySelfPayOnly, resolveSelfPayQuote } from '../selfPayRates.service.js';
import { validateSchedulingSelection } from '../schedulingTaxonomy.service.js';
import { ensureAppointmentClinicalLink } from '../appointmentClinicalLink.service.js';
import { createAppointment } from '../appointment.service.js';
const args = { agencyId: 1, tenantServiceId: 10, providerUserId: 9, startAt: '2026-09-15T16:00:00Z', endAt: '2026-09-15T16:50:00Z', participants: [{ clientId: 8, role: 'client' }] };
beforeEach(() => {
  vi.clearAllMocks();
  getAgencySelfPayOnly.mockResolvedValue(true);
  resolveSelfPayQuote.mockResolvedValue({ amountCents: 12500, rateCents: 15000, rateUnit: 'hour', source: 'provider' });
  TenantService.findById.mockResolvedValue({ id: 10, agencyId: 1, businessType: 'mental_health', isActive: true, allowsIndividual: true, billingMethod: 'self_pay', priceCents: 10000 });
  Appointment.create.mockResolvedValue({ id: 20 }); Appointment.findById.mockResolvedValue({ id: 20 });
  Appointment.listParticipants.mockResolvedValue(args.participants); Appointment.getBilling.mockResolvedValue({});
});
describe('self-pay booking integration', () => {
  it('records the duration-based provider charge and creates a note context without insurance coding', async () => {
    await createAppointment(args);
    expect(resolveSelfPayQuote).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 50, agencyId: 1, providerId: 9 }));
    expect(Appointment.upsertBilling).toHaveBeenCalledWith(20, expect.objectContaining({ settlementMode: 'self_pay_only', amountCents: 12500, responsibleClientId: 8 }));
    expect(validateSchedulingSelection).not.toHaveBeenCalled();
    expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(20, null);
  });
  it('does not require insurance coding for self-pay packages or add a separate session charge', async () => {
    BookingPackage.findEntitlementById.mockResolvedValue({ clientId: 8, status: 'ACTIVE', sessionsRemaining: 2 });
    await createAppointment({ ...args, packageEntitlementId: 4 });
    expect(resolveSelfPayQuote).not.toHaveBeenCalled();
    expect(Appointment.upsertBilling).toHaveBeenCalledWith(20, expect.objectContaining({ settlementMode: 'package', amountCents: null, packageEntitlementId: 4 }));
    expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledWith(expect.objectContaining({ entitlementId: 4, mode: 'reserve' }));
  });
  it('keeps insurance coding requirements for agencies that have not opted into self-pay only', async () => {
    getAgencySelfPayOnly.mockResolvedValue(false);
    await expect(createAppointment(args)).rejects.toThrow('service code is required');
    expect(Appointment.create).not.toHaveBeenCalled();
  });
  it('honors a specifically authorized zero-dollar billing adjustment', async () => {
    await createAppointment({ ...args, billing: { amountCents: 0 } });
    expect(Appointment.upsertBilling).toHaveBeenCalledWith(20, expect.objectContaining({ amountCents: 0, settlementMode: 'self_pay_only' }));
  });
});
