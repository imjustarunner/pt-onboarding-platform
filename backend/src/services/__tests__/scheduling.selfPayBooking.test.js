vi.mock('../clientSessionBookingRollout.service.js', () => ({ requireClientSessionBooking: vi.fn().mockResolvedValue({ enabled: true }) }));
import { requireClientSessionBooking } from '../clientSessionBookingRollout.service.js';
vi.mock('../appointmentScheduleNotice.service.js', () => ({ appointmentScheduleNotices: { queue: vi.fn() } }));
vi.mock('../clientSchedulingGuard.service.js', () => ({ withClientSchedulingLock: async (ids, work) => work() }));
vi.mock('../staffCareEligibility.service.js', () => ({ requireStaffCareEligibility: vi.fn().mockResolvedValue({ canProvideCare: true }) }));
import { requireStaffCareEligibility } from '../staffCareEligibility.service.js';
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
import { scheduleSessionNotifications } from '../sessionNotification.service.js';
import { appointmentScheduleNotices } from '../appointmentScheduleNotice.service.js';
import * as afterHours from '../clinicalAfterHours.service.js';
import pool from '../../config/database.js';
const args = { agencyId: 1, tenantServiceId: 10, providerUserId: 9, startAt: '2026-09-15T16:00:00Z', endAt: '2026-09-15T16:50:00Z', participants: [{ clientId: 8, role: 'client' }] };
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockResolvedValue([[]]);
  getAgencySelfPayOnly.mockResolvedValue(true);
  resolveSelfPayQuote.mockResolvedValue({ amountCents: 12500, rateCents: 15000, rateUnit: 'hour', source: 'provider' });
  TenantService.findById.mockResolvedValue({ id: 10, agencyId: 1, businessType: 'mental_health', isActive: true, allowsIndividual: true, billingMethod: 'self_pay', priceCents: 10000 });
  Appointment.create.mockResolvedValue({ id: 20 }); Appointment.findById.mockResolvedValue({ id: 20 });
  Appointment.listParticipants.mockResolvedValue(args.participants); Appointment.getBilling.mockResolvedValue({});
});
describe('self-pay booking integration', () => {
  it('uses the saved office timezone instead of the browser or platform default',async()=>{
    pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT l.timezone')?[[{timezone:'America/New_York'}]]:[[]]);
    const reconcile=vi.spyOn(afterHours,'reconcileClinicalAfterHours').mockResolvedValueOnce({addonServiceCodes:['99051']});
    try{
      await createAppointment({...args,officeEventId:44,startAt:'2026-11-09T22:00:00Z',endAt:'2026-11-09T23:00:00Z',timeZone:'America/Los_Angeles',serviceCode:'90837'});
      expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({timeZone:'America/New_York',startAt:'2026-11-09 22:00:00'}));
      expect(pool.execute).toHaveBeenCalledWith('UPDATE appointments SET service_location_id = ?, source_timezone = ? WHERE id = ?',[null,'America/New_York',20]);
    }finally{reconcile.mockRestore();}
  });
  it('persists the server-reconciled add-ons using the actual normalized schedule and source timezone',async()=>{
    const reconcile=vi.spyOn(afterHours,'reconcileClinicalAfterHours').mockResolvedValueOnce({addonServiceCodes:['90785','99051']});
    try{
      await createAppointment({...args,startAt:'2026-11-10T00:00:00Z',endAt:'2026-11-10T01:00:00Z',timeZone:'America/Denver',serviceCode:'90837',addonServiceCodes:['90785']});
      expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({startAt:'2026-11-10 00:00:00',timeZone:'America/Denver',primaryCode:'90837',providerUserId:9,addonServiceCodes:['90785']}));
      expect(Appointment.create).toHaveBeenCalledWith(expect.objectContaining({addonServiceCodes:['90785','99051']}));expect(Appointment.setServiceCodes).toHaveBeenCalledWith(20,expect.objectContaining({addonServiceCodes:['90785','99051']}));
    }finally{reconcile.mockRestore();}
  });
  it('books pro bono with no client charge and cannot reserve a client-paid package',async()=>{
    await createAppointment({...args,serviceCode:'PRO-BONO SERVICE',billing:{settlementMode:'self_pay',amountCents:25000}});
    expect(Appointment.upsertBilling).toHaveBeenCalledWith(20,expect.objectContaining({settlementMode:'pro_bono',amountCents:0,paymentStatus:'waived'}));expect(resolveSelfPayQuote).not.toHaveBeenCalled();
    vi.clearAllMocks();await expect(createAppointment({...args,serviceCode:'PRO-BONO SERVICE',packageEntitlementId:4})).rejects.toMatchObject({status:409});expect(BookingPackage.applyAppointmentUsage).not.toHaveBeenCalled();expect(Appointment.create).not.toHaveBeenCalled();
  });
  it('resumes a partially created replacement on the same appointment',async()=>{
    Appointment.findById.mockResolvedValue({id:20,agencyId:1,providerUserId:9,tenantServiceId:10,status:'scheduled',
      source:'replacement_offer:3',startAt:args.startAt,endAt:args.endAt,modality:'VIRTUAL'});
    await createAppointment({...args,modality:'VIRTUAL',source:'replacement_offer:3',replacementOfferId:3,resumeReplacementAppointmentId:20,deferScheduleNotice:true});
    expect(Appointment.create).not.toHaveBeenCalled();expect(Appointment.replaceParticipants).toHaveBeenCalledWith(20,args.participants);
    expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(20,null);expect(scheduleSessionNotifications).not.toHaveBeenCalled();
  });
  it.each([{status:'canceled_by_provider'},{providerUserId:99},{source:'staff_grid'},{startAt:'2026-09-15T17:00:00Z'},{tenantServiceId:99}])('does not overwrite a replacement that changed during recovery: %j',async change=>{
    Appointment.findById.mockResolvedValue({id:20,agencyId:1,providerUserId:9,tenantServiceId:10,status:'scheduled',source:'replacement_offer:3',startAt:args.startAt,endAt:args.endAt,modality:'VIRTUAL',...change});
    await expect(createAppointment({...args,modality:'VIRTUAL',source:'replacement_offer:3',replacementOfferId:3,resumeReplacementAppointmentId:20,deferScheduleNotice:true})).rejects.toMatchObject({status:409});
    expect(Appointment.create).not.toHaveBeenCalled();expect(Appointment.replaceParticipants).not.toHaveBeenCalled();
  });
  it('resumes a package reservation even when its last credit is already reserved for this appointment',async()=>{
    Appointment.findById.mockResolvedValue({id:20,agencyId:1,providerUserId:9,tenantServiceId:10,status:'scheduled',source:'replacement_offer:3',startAt:args.startAt,endAt:args.endAt,modality:'VIRTUAL',packageEntitlementId:4});
    BookingPackage.findEntitlementById.mockResolvedValue({clientId:8,status:'ACTIVE',sessionsRemaining:0});
    await createAppointment({...args,modality:'VIRTUAL',source:'replacement_offer:3',replacementOfferId:3,resumeReplacementAppointmentId:20,deferScheduleNotice:true,packageEntitlementId:4});
    expect(Appointment.create).not.toHaveBeenCalled();expect(BookingPackage.applyAppointmentUsage).toHaveBeenCalledWith(expect.objectContaining({appointmentId:20,entitlementId:4,mode:'reserve'}));
  });
  it('defers replacement reminders and confirmation until the approval is fully linked', async () => {
    await createAppointment({ ...args, deferScheduleNotice:true, source:'replacement_offer:1' });
    expect(scheduleSessionNotifications).not.toHaveBeenCalled();expect(appointmentScheduleNotices.queue).not.toHaveBeenCalled();
    expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(20,null);
  });
  it('blocks a direct clinical booking before the provider is enabled, even with a self-pay package', async () => {
    requireClientSessionBooking.mockRejectedValueOnce(Object.assign(new Error('Coming soon'), {status:403}));
    await expect(createAppointment({ ...args, packageEntitlementId: 4 })).rejects.toMatchObject({status:403});
    expect(Appointment.create).not.toHaveBeenCalled();
    expect(BookingPackage.applyAppointmentUsage).not.toHaveBeenCalled();
  });
  it('requires a care assignment for self-pay care too', async () => {
    requireStaffCareEligibility.mockRejectedValueOnce(Object.assign(new Error('Care assignment required'), {status:403}));
    await expect(createAppointment(args)).rejects.toMatchObject({status:403});
    expect(Appointment.create).not.toHaveBeenCalled();
  });
  it('records the duration-based provider charge and creates a note context without insurance coding', async () => {
    await createAppointment(args);
    expect(resolveSelfPayQuote).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 50, agencyId: 1, providerId: 9 }));
    expect(Appointment.upsertBilling).toHaveBeenCalledWith(20, expect.objectContaining({ settlementMode: 'self_pay_only', amountCents: 12500, responsibleClientId: 8 }));
    expect(validateSchedulingSelection).not.toHaveBeenCalled();
    expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(20, null);
    expect(scheduleSessionNotifications).toHaveBeenCalledWith(20,{replace:true});
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
