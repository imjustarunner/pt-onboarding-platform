import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../services/appointmentClinicalLink.service.js',()=>({assertAppointmentClients:m.assertClients}));
vi.mock('../../services/ownedOfficeSession.service.js',()=>({bookSessionInOwnedOffice:vi.fn(async()=>null)}));
vi.mock('../../services/ownedOfficeSessionJobs.service.js',()=>({queueOwnedOfficeSession:vi.fn(async()=>null)}));
const m=vi.hoisted(()=>({execute:vi.fn(),agencies:vi.fn(),officeAgencies:vi.fn(),office:vi.fn(),provider:vi.fn(),create:vi.fn(),selection:vi.fn(),rollout:vi.fn(),locations:vi.fn(),room:vi.fn(),access:vi.fn(),warnings:vi.fn(),tenantService:vi.fn(),assertClients:vi.fn()}));
vi.mock('../../models/TenantService.model.js',()=>({default:{findById:m.tenantService}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies,findById:m.provider}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findById:m.office}}));
vi.mock('../../models/OfficeLocationAgency.model.js',()=>({default:{listAgenciesForOffice:m.officeAgencies,userHasAccess:m.access}}));
vi.mock('../../models/OfficeRoom.model.js',()=>({default:{findById:m.room}}));
vi.mock('../../models/OfficeBookingRequest.model.js',()=>({default:{create:m.create}}));
vi.mock('../../models/UserComplianceDocument.model.js',()=>({default:{findByUser:async()=>[]}}));
vi.mock('../../models/AgencyServiceLocation.model.js',()=>({default:{listByAgency:m.locations}}));
vi.mock('../../services/schedulingTaxonomy.service.js',()=>({getSchedulingBookingMetadata:vi.fn(),validateSchedulingSelection:m.selection}));
vi.mock('../../services/clientSessionBookingRollout.service.js',()=>({requireClientSessionBooking:m.rollout}));
vi.mock('../../services/sameDayServiceWarning.service.js',()=>({confirmSameDayServiceWarnings:m.warnings}));
vi.mock('../../services/officeBillingSites.service.js',()=>({filterServiceLocationsForProvider:rows=>rows,listUserOfficeIds:async()=>[1],listUserSchoolIds:async()=>[]}));
import { bookSessionInOwnedOffice } from '../../services/ownedOfficeSession.service.js';
import { queueOwnedOfficeSession } from '../../services/ownedOfficeSessionJobs.service.js';
import { createOfficeBookingRequest, getBookingLocations } from '../officeSchedule.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();m.assertClients.mockResolvedValue([{id:81}]);m.execute.mockResolvedValue([[]]);m.room.mockResolvedValue({id:10,location_id:1});m.access.mockResolvedValue(true);
 m.warnings.mockResolvedValue(true);m.rollout.mockResolvedValue({enabled:true});
 m.tenantService.mockResolvedValue({id:320,businessType:'tutoring',serviceCode:'TUTORING',isActive:true});
 m.agencies.mockResolvedValue([{id:2},{id:377}]);m.officeAgencies.mockResolvedValue([{id:2},{id:377}]);
 m.office.mockResolvedValue({id:1,timezone:'America/Denver'});m.provider.mockResolvedValue({id:501,role:'super_admin'});
 m.create.mockResolvedValue({id:9});m.selection.mockResolvedValue({appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'});
 m.locations.mockResolvedValue([{id:44,agency_id:377}]);
});
it('uses active tutoring eligibility for an ordinary tutor office request and retains the exact service',async()=>{
 m.agencies.mockResolvedValue([{id:453}]);m.officeAgencies.mockResolvedValue([{id:453}]);
 m.provider.mockResolvedValue({id:1496,role:'provider'});
 m.selection.mockResolvedValue({appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'TUTORING'});
 m.rollout.mockImplementation(async(_agency,_provider,_db,options)=>{
  if(options?.businessType!=='tutoring')throw Object.assign(new Error('Clinical transition not enabled'),{status:403});
  return {enabled:true};
 });
 const req={user:{id:1496,role:'provider'},body:{agencyId:453,officeLocationId:1,clientId:2547,tenantServiceId:320,
  startAt:'2026-11-26T13:00:00',endAt:'2026-11-26T14:00:00',appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'TUTORING'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(m.warnings).toHaveBeenCalledWith(req,res,expect.objectContaining({agencyId:453,tenantServiceId:320}));
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({roomType:'tutoring',serviceCode:'TUTORING',
  sessionContext:expect.objectContaining({agencyId:453,tenantServiceId:320})}));
});
it('accepts the pure tutoring form payload without clinical taxonomy fields or a counseling room classification',async()=>{
 m.agencies.mockResolvedValue([{id:453}]);m.officeAgencies.mockResolvedValue([{id:453}]);
 m.provider.mockResolvedValue({id:1496,role:'provider'});
 m.selection.mockImplementation(async input=>{
  if(input.serviceCode!=='TUTORING'||input.appointmentTypeCode!=='SESSION')throw new Error('Wrong service context');
  return {appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'TUTORING'};
 });
 m.rollout.mockImplementation(async(_agency,_provider,_db,options)=>{
  if(options?.businessType!=='tutoring')throw Object.assign(new Error('Clinical transition not enabled'),{status:403});
  return {enabled:true};
 });
 const req={user:{id:1496,role:'provider'},body:{agencyId:453,officeLocationId:1,clientId:2547,tenantServiceId:320,
  startAt:'2026-11-26T13:00:00',endAt:'2026-11-26T14:00:00',appointmentTypeCode:'AVAILABLE_SLOT',serviceCode:null,modality:'IN_PERSON',roomType:'counseling'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(m.tenantService).toHaveBeenCalledWith(320,453);
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({roomType:'tutoring',appointmentTypeCode:'SESSION',serviceCode:'TUTORING',clientId:2547}));
});
it('rejects an inactive or conflicting configured tutoring service before holding a room',async()=>{
 const req={user:{id:501,role:'super_admin'},body:{agencyId:377,officeLocationId:1,clientId:81,tenantServiceId:320,
  startAt:'2026-11-26T13:00:00',endAt:'2026-11-26T14:00:00',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(m.create).not.toHaveBeenCalled();
 m.tenantService.mockResolvedValue({...await m.tenantService(),isActive:false});
 await createOfficeBookingRequest({...req,body:{...req.body,serviceCode:null}},response(),next);
 expect(next).toHaveBeenLastCalledWith(expect.objectContaining({status:400}));expect(m.create).not.toHaveBeenCalled();
});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it('validates and persists the selected tenant when a clinical session uses another tenant’s shared office',async()=>{
 const req={user:{id:501,role:'super_admin'},body:{agencyId:377,officeLocationId:1,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',recurrence:'BIWEEKLY',bookedOccurrenceCount:6,appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(m.rollout).toHaveBeenCalledWith(377,501,undefined,{actorUserId:501});
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

it('uses the owned reservation result immediately instead of requesting that room again',async()=>{
 bookSessionInOwnedOffice.mockResolvedValueOnce({ok:true,kind:'auto_booked',officeEventId:18510,appointment:{id:88}});
 const req={user:{id:501,role:'super_admin'},body:{agencyId:377,officeLocationId:1,roomId:10,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({kind:'auto_booked',officeEventId:18510}));expect(m.create).not.toHaveBeenCalled();
 expect(bookSessionInOwnedOffice).toHaveBeenLastCalledWith(expect.objectContaining({agencyId:377,providerId:501,clientId:81,roomId:10}));
});

it('requires the booking actor to have scheduling access to the selected session agency',async()=>{
 m.agencies.mockImplementation(async id=>id===507?[{id:2}]:[{id:2},{id:377}]);
 const req={user:{id:507,role:'admin'},body:{requestedProviderId:501,agencyId:377,officeLocationId:1,roomId:10,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);expect(bookSessionInOwnedOffice).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
it('returns a durable progress job promptly for the session form instead of waiting on the whole series',async()=>{
 queueOwnedOfficeSession.mockResolvedValueOnce({kind:'booking_job',job:{id:'job-1',status:'queued',total:26}});
 const req={user:{id:501,role:'super_admin'},body:{asyncOwnedSession:true,agencyId:377,officeLocationId:1,roomId:10,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',recurrence:'BIWEEKLY',bookedOccurrenceCount:26,appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const res=response(),next=vi.fn();await createOfficeBookingRequest(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(202);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({kind:'booking_job'}));
 expect(bookSessionInOwnedOffice).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});

it('rejects an unassigned client before creating an office request or owned-office session',async()=>{
 m.assertClients.mockRejectedValueOnce(Object.assign(new Error('Client is not assigned to this provider'),{status:403}));
 const req={user:{id:501,role:'super_admin'},body:{agencyId:377,officeLocationId:1,roomId:10,clientId:81,startAt:'2026-11-26T15:00:00',endAt:'2026-11-26T16:00:00',appointmentTypeCode:'SESSION',modality:'IN_PERSON',serviceCode:'90837'}};
 const next=vi.fn();await createOfficeBookingRequest(req,response(),next);
 expect(m.assertClients).toHaveBeenCalledWith(377,[{clientId:81}],{providerUserId:501,serviceLocationId:undefined});
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
 expect(bookSessionInOwnedOffice).not.toHaveBeenCalled();expect(queueOwnedOfficeSession).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
});
