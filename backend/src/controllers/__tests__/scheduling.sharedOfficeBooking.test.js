import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),agencies:vi.fn(),officeAgencies:vi.fn(),office:vi.fn(),provider:vi.fn(),create:vi.fn(),selection:vi.fn(),rollout:vi.fn(),locations:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies,findById:m.provider}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findById:m.office}}));
vi.mock('../../models/OfficeLocationAgency.model.js',()=>({default:{listAgenciesForOffice:m.officeAgencies}}));
vi.mock('../../models/OfficeBookingRequest.model.js',()=>({default:{create:m.create}}));
vi.mock('../../models/UserComplianceDocument.model.js',()=>({default:{findByUser:async()=>[]}}));
vi.mock('../../models/AgencyServiceLocation.model.js',()=>({default:{listByAgency:m.locations}}));
vi.mock('../../services/schedulingTaxonomy.service.js',()=>({getSchedulingBookingMetadata:vi.fn(),validateSchedulingSelection:m.selection}));
vi.mock('../../services/clientSessionBookingRollout.service.js',()=>({requireClientSessionBooking:m.rollout}));
vi.mock('../../services/sameDayServiceWarning.service.js',()=>({confirmSameDayServiceWarnings:async()=>true}));
vi.mock('../../services/officeBillingSites.service.js',()=>({filterServiceLocationsForProvider:rows=>rows,listUserOfficeIds:async()=>[1],listUserSchoolIds:async()=>[]}));
import { createOfficeBookingRequest, getBookingLocations } from '../officeSchedule.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();m.execute.mockResolvedValue([[]]);
 m.agencies.mockResolvedValue([{id:2},{id:377}]);m.officeAgencies.mockResolvedValue([{id:2},{id:377}]);
 m.office.mockResolvedValue({id:1,timezone:'America/Denver'});m.provider.mockResolvedValue({id:501,role:'super_admin'});
 m.create.mockResolvedValue({id:9});m.selection.mockResolvedValue({appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'});
 m.locations.mockResolvedValue([{id:44,agency_id:377}]);
});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it('validates and persists the selected tenant when a clinical session uses another tenant’s shared office',async()=>{
 const req={user:{id:501,role:'super_admin'},body:{agencyId:377,officeLocationId:1,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',recurrence:'BIWEEKLY',bookedOccurrenceCount:6,appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(m.rollout).toHaveBeenCalledWith(377,501);
 expect(m.selection).toHaveBeenCalledWith(expect.objectContaining({agencyId:377,enforceSessionRollout:true}));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({recurrence:'BIWEEKLY',sessionContext:expect.objectContaining({agencyId:377})}));
});
it('loads configured locations without waiting for taxonomy setup',async()=>{
 const res=response(),next=vi.fn();await getBookingLocations({user:{id:501,role:'super_admin'},query:{agencyId:377,providerId:501}},res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({agencyId:377,providerId:501,serviceLocations:[{id:44,agency_id:377}]});
 expect(m.selection).not.toHaveBeenCalled();
});
it('denies a manager reading a provider catalog in a foreign practice',async()=>{
 m.agencies.mockImplementation(async id=>id===507?[{id:2}]:[{id:377}]);
 const res=response();await getBookingLocations({user:{id:507,role:'admin'},query:{agencyId:377,providerId:501}},res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.locations).not.toHaveBeenCalled();
});
