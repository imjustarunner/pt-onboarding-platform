import { expect, it, vi } from 'vitest';
vi.mock('../afterHoursEmailPolicy.service.js',()=>({usesAppEmailAvailability:vi.fn(async()=>false)}));
vi.mock('../../models/PlannedOut.model.js',()=>({default:{tableExists:vi.fn()},isPlannedOutActiveNow:vi.fn(),ymdFromStoredDate:vi.fn()}));
vi.mock('../availabilityWindow.service.js',()=>({resolveAvailabilitySchedule:vi.fn(),isInsideSchedule:vi.fn(),nextAvailableAt:vi.fn(),formatReturnAt:vi.fn(),snapToAvailableAt:vi.fn()}));
import PlannedOut from '../../models/PlannedOut.model.js';
import {resolveAvailabilitySchedule} from '../availabilityWindow.service.js';
import {resolveRecipientDeliveryGate,resolveScheduledSendAgainstAvailability} from '../hubRecipientDelivery.service.js';
it('does not inspect or apply availability/planned-out holds for SSO recipients',async()=>{
 expect(await resolveRecipientDeliveryGate({agencyId:2,userId:6})).toBeNull();
 const requested=new Date('2026-09-30T02:00:00Z');
 expect(await resolveScheduledSendAgainstAvailability({agencyId:2,userId:6,requestedAt:requested})).toMatchObject({sendAt:requested,snapped:false});
 expect(PlannedOut.tableExists).not.toHaveBeenCalled();expect(resolveAvailabilitySchedule).not.toHaveBeenCalled();
});
