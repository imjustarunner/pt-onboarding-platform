vi.mock('../clientSessionBookingRollout.service.js', () => ({ requireClientSessionBooking: vi.fn().mockResolvedValue({ enabled: true }) }));
import { requireClientSessionBooking } from '../clientSessionBookingRollout.service.js';
vi.mock('../appointmentScheduleNotice.service.js', () => ({ appointmentScheduleNotices: { queue: vi.fn() } }));
vi.mock('../clientSchedulingGuard.service.js', () => ({ withClientSchedulingLock: async (ids, work) => work() }));
vi.mock('../staffCareEligibility.service.js', () => ({ requireStaffCareEligibility: vi.fn().mockResolvedValue({ canProvideCare: true }) }));
import { requireStaffCareEligibility } from '../staffCareEligibility.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn().mockResolvedValue([[]]) } }));
vi.mock('../../models/AgencyServiceLocation.model.js', () => ({ default: {findById:vi.fn(async()=>({agency_id:1}))} }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn().mockResolvedValue([{ id: 1 }]), findById: vi.fn().mockResolvedValue({ role: 'provider' }) } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { create: vi.fn(), update:vi.fn(), findById: vi.fn(), getBilling: vi.fn(), listParticipants: vi.fn(), replaceParticipants: vi.fn(), setServiceCodes: vi.fn(), upsertBilling: vi.fn() } }));
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
import { createAppointment,updateAppointment } from '../appointment.service.js';
import { scheduleSessionNotifications } from '../sessionNotification.service.js';
import { appointmentScheduleNotices } from '../appointmentScheduleNotice.service.js';

vi.mock('../appointmentScheduleSync.service.js',()=>({assertAppointmentCanMove:vi.fn()}));
vi.mock('../appointmentServiceSetting.service.js',()=>({resolveAppointmentServiceSetting:vi.fn(async()=> 'school')}));
import {assertAppointmentCanMove} from '../appointmentScheduleSync.service.js';
import StaffAssignments from '../../models/StaffServiceAssignment.model.js';
let current;
beforeEach(()=>{
 vi.clearAllMocks();
 current={id:20,agencyId:1,providerUserId:9,tenantServiceId:10,clinicalSessionId:159,status:'scheduled',serviceCode:'PRO_BONO_SERVICE',serviceLocationId:12,modality:'IN_PERSON',startAt:'2026-10-12 15:00:00',endAt:'2026-10-12 16:00:00',businessType:'mental_health'};
 Appointment.findById.mockImplementation(async()=>({...current}));Appointment.getBilling.mockResolvedValue({settlementMode:'self_pay_only'});Appointment.listParticipants.mockResolvedValue([{role:'client',clientId:8}]);
 Appointment.update.mockImplementation(async(id,patch)=>{Object.assign(current,patch);return {...current};});Appointment.setServiceCodes.mockImplementation(async(id,patch)=>{Object.assign(current,patch);});
 TenantService.findById.mockResolvedValue({id:11,isActive:true,businessType:'mental_health'});StaffAssignments.listServiceIdsForUser.mockResolvedValue([10,11]);assertAppointmentCanMove.mockResolvedValue();
});
it('persists an explicit service change and refreshes its existing clinical encounter without moving its time',async()=>{
 const result=await updateAppointment(20,{serviceCode:'90791',tenantServiceId:11,serviceLocationId:13},{actorUserId:9});
 expect(result).toMatchObject({serviceCode:'90791',tenantServiceId:11,clinicalSessionId:159});
 expect(assertAppointmentCanMove).toHaveBeenCalledWith(expect.objectContaining({id:20,clinicalSessionId:159}));
 expect(ensureAppointmentClinicalLink).toHaveBeenCalledWith(20,9);
 expect(current.startAt).toBe('2026-10-12 15:00:00');expect(Appointment.upsertBilling).not.toHaveBeenCalled();
});
it('rejects clinical service changes before any mutation when the appointment has a signed note',async()=>{
 assertAppointmentCanMove.mockRejectedValue(Object.assign(new Error('This appointment has a signed note.'),{status:409}));
 await expect(updateAppointment(20,{serviceCode:'90791'},{actorUserId:9})).rejects.toMatchObject({status:409});
 expect(Appointment.update).not.toHaveBeenCalled();expect(Appointment.setServiceCodes).not.toHaveBeenCalled();expect(ensureAppointmentClinicalLink).not.toHaveBeenCalled();
});
it('does not refresh or mutate clinical encounter metadata on an idempotent service save',async()=>{
 await updateAppointment(20,{serviceCode:'PRO_BONO_SERVICE',tenantServiceId:10},{actorUserId:9});
 expect(assertAppointmentCanMove).not.toHaveBeenCalled();expect(ensureAppointmentClinicalLink).not.toHaveBeenCalled();
});
it('rejects unassigned tenant services and service IDs outside the booking agency',async()=>{
 StaffAssignments.listServiceIdsForUser.mockResolvedValue([10]);
 await expect(updateAppointment(20,{tenantServiceId:11},{actorUserId:9})).rejects.toThrow('not assigned');expect(Appointment.update).not.toHaveBeenCalled();
 TenantService.findById.mockResolvedValue(null);
 await expect(updateAppointment(20,{tenantServiceId:15},{actorUserId:9})).rejects.toThrow('not found');expect(TenantService.findById).toHaveBeenLastCalledWith(15,1);
});
