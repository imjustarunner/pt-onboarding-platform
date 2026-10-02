import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(),getSupervisors:vi.fn()}}));
vi.mock('../../models/UserInfoValue.model.js',()=>({default:{createOrUpdate:vi.fn()}}));
vi.mock('../../models/UserComplianceDocument.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{getHoursSummaryForSupervisee:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{}}));
vi.mock('../licenseCredentialSync.service.js',()=>({saveProviderLicenseUpload:vi.fn()}));
vi.mock('../providerUpdate.service.js',()=>({getRecipientByToken:vi.fn(),getMyOpenRecipient:vi.fn()}));
vi.mock('../officeAssignmentBookingAvailability.service.js',()=>({setOfficeAssignmentBookingAvailability:vi.fn()}));
vi.mock('../providerAvailabilityAccess.service.js',()=>({requireProviderAvailabilityAccess:vi.fn()}));
vi.mock('../../controllers/officeSlotActions.controller.js',()=>({forfeitAssignment:vi.fn(),downgradeStandingAssignment:vi.fn(),rescheduleStandingAssignment:vi.fn()}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import SupervisionSession from '../../models/SupervisionSession.model.js';
import {getRecipientByToken} from '../providerUpdate.service.js';
import {rescheduleStandingAssignment} from '../../controllers/officeSlotActions.controller.js';
import {officeReviewAction,persistReviewSection} from '../../controllers/providerUpdateReview.controller.js';
const recipient={id:1,provider_user_id:9,agency_id:6,section_config_json:{office_schedule:true,supervision_hours:true}};
let req,res,next;
beforeEach(()=>{
 vi.clearAllMocks();
 req={params:{token:'personal',assignmentId:'10',action:'move'},body:{agencyId:2,newHour:17,blockHours:8},query:{},user:{id:999,role:'super_admin'}};
 res={json:vi.fn()};next=vi.fn();
 getRecipientByToken.mockResolvedValue({...recipient});User.getAgencies.mockResolvedValue([{id:6}]);
 pool.execute.mockResolvedValue([[{id:10,provider_id:9,booking_agency_id:6,office_location_id:3,hour:14}]]);
 User.getSupervisors.mockResolvedValue([{id:20}]);SupervisionSession.getHoursSummaryForSupervisee.mockResolvedValue({totalHours:12});
});
it('personal updater links never inherit administrator approval privileges',async()=>{
 await officeReviewAction(req,res,next);
 expect(req.user).toEqual({id:9,role:'provider',agencyId:6});
 expect(req.body.agencyId).toBe(6);
 expect(req.body.blockHours).toBe(1);
 expect(req.body.sourceStartHour).toBe(14);
 expect(rescheduleStandingAssignment).toHaveBeenCalledOnce();
});
it('rejects another provider’s assignment and a different agency’s assignment',async()=>{
 pool.execute.mockResolvedValue([[]]);await officeReviewAction(req,res,next);expect(next).toHaveBeenLastCalledWith(expect.objectContaining({status:403}));
 pool.execute.mockResolvedValue([[{id:10,provider_id:9,booking_agency_id:2}]]);await officeReviewAction(req,res,next);expect(rescheduleStandingAssignment).not.toHaveBeenCalled();
});
it('rejects expired membership and disabled office sections',async()=>{
 User.getAgencies.mockResolvedValue([]);await officeReviewAction(req,res,next);expect(next).toHaveBeenLastCalledWith(expect.objectContaining({status:403}));
 User.getAgencies.mockResolvedValue([{id:6}]);getRecipientByToken.mockResolvedValue({...recipient,section_config_json:{office_schedule:false}});await officeReviewAction(req,res,next);expect(rescheduleStandingAssignment).not.toHaveBeenCalled();
});
it('requires a correction reason and records the actual ledger total without altering credits',async()=>{
 await expect(persistReviewSection(recipient,'supervision_hours',{decision:'correction_requested',requestedHours:20,reason:''},true)).rejects.toThrow('reason');
 const data={decision:'correction_requested',requestedHours:20,reason:'External supervision record'};
 await persistReviewSection(recipient,'supervision_hours',data,true);
 expect(data.recordedHours).toBe(12);expect(pool.execute).not.toHaveBeenCalled();
});
