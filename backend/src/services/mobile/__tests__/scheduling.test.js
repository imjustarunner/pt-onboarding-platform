import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../session.service.js',()=>({mobileSessions:{access:vi.fn()}}));
vi.mock('../agencyScope.service.js',()=>({listMobileAgencies:vi.fn()}));
vi.mock('../../agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn()}));
vi.mock('../../../utils/agencyAccessPolicy.js',()=>({applyAgencyAccess:vi.fn()}));
vi.mock('../../../utils/agencyAccessContext.js',()=>({runWithAgencyAccess:vi.fn()}));
vi.mock('../../../models/Appointment.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../../models/AgencyServiceLocation.model.js',()=>({default:{listByAgency:vi.fn()}}));
vi.mock('../../narrivaAccess.service.js',()=>({maskMobileClientName:client=>client.full_name==='Fictional Client'?'Fic* Cli*':'Client'}));
import {createMobileScheduling} from '../scheduling.service.js';
let dependencies,handlers,req,res,next;
beforeEach(()=>{
 handlers={
  listUserVirtualSessionClients:vi.fn(async(_req,res)=>res.json({clients:[{id:12,full_name:'Fictional Client'}]})),
  getBookingOptions:vi.fn(async(_req,res)=>res.json({services:[{id:9,serviceCode:'90837',name:'Psychotherapy'}]})),
  createAppointmentHandler:vi.fn(async(req,res)=>res.json({ok:true,appointment:{id:60,agencyId:req.body.agencyId,providerUserId:req.body.providerUserId,startAt:'2026-11-11 18:00:00',endAt:'2026-11-11 19:00:00',participants:req.body.participants,fullName:'NEVER RETURN'}})),
  getAppointment:vi.fn(async(_req,res)=>res.json({ok:true,appointment:{id:60,agencyId:2,providerUserId:7,participants:[{role:'client',clientId:12,full_name:'NEVER RETURN'}],client_full_name:'NEVER RETURN'}})),
  updateAppointmentHandler:vi.fn(async(_req,res)=>res.json({ok:true,appointment:{id:60,agencyId:2,providerUserId:7}})),
  cancelAppointmentHandler:vi.fn(async(_req,res)=>res.json({ok:true,appointment:{id:60,agencyId:2,providerUserId:7}}))
 };
 dependencies={db:{execute:vi.fn(async()=>[[{id:12,full_name:'Fictional Client',initials:'full identity would be unsafe'}]])},access:vi.fn(async()=>({surface:'staff',user:{id:7,role:'provider'}})),agencies:vi.fn(async()=>({agencies:[{id:2,name:'Agency'}]})),agencyAccess:vi.fn(async()=>({role:'provider',permissions:{}})),applyAccess:(user,profile)=>({...user,role:profile.role}),scope:vi.fn((_agency,work)=>work()),findAppointment:vi.fn(async()=>({id:60,agencyId:2,providerUserId:7})),locations:vi.fn(async()=>[{id:4,name:'Office',place_of_service:'11'}]),handlers};
 req={quickView:{userId:7,agencyId:2,mobileDeviceSessionId:4,credentialVersion:8},body:{agencyId:2,participants:[{role:'client',clientId:12}],tenantServiceId:9},query:{},params:{},mobileScheduleOperation:'create'};
 res={status:vi.fn(function(code){this.statusCode=code;return this;}),json:vi.fn()};next=vi.fn();
});
const run=()=>createMobileScheduling(dependencies)(req,res,next);
describe('primary mobile scheduling adapter',()=>{
 it('does not elevate legacy PIN access into scheduling',async()=>{delete req.quickView.mobileDeviceSessionId;await run();expect(res.status).toHaveBeenCalledWith(403);expect(handlers.createAppointmentHandler).not.toHaveBeenCalled();});
 it('rechecks target agency and QA boundaries before invoking canonical mutation',async()=>{req.body.agencyId=3;await run();expect(res.status).toHaveBeenCalledWith(403);expect(handlers.createAppointmentHandler).not.toHaveBeenCalled();req.quickView.qaAgencyIds=[450];req.body.agencyId=2;await run();expect(handlers.createAppointmentHandler).not.toHaveBeenCalled();});
 it('rejects another provider or forged client, including when the global role would permit team scheduling',async()=>{req.params={appointmentId:60};dependencies.findAppointment.mockResolvedValue({id:60,agencyId:2,providerUserId:99});await run();expect(res.status).toHaveBeenCalledWith(403);expect(handlers.createAppointmentHandler).not.toHaveBeenCalled();req.params={};req.body.participants=[{role:'client',clientId:999}];await run();expect(handlers.createAppointmentHandler).not.toHaveBeenCalled();});
 it('uses normal appointment rules with the current effective actor and masks returned identity',async()=>{Object.assign(req.body,{force:true,billing:{amount:0},providerUserId:7});await run();expect(next).not.toHaveBeenCalled();const forwarded=handlers.createAppointmentHandler.mock.calls[0][0];expect(forwarded.user.role).toBe('provider');expect(forwarded.body).toMatchObject({agencyId:2,providerUserId:7,source:'staff_grid',createProviderScheduleEvent:true,participants:[{role:'client',clientId:12,isBillingResponsible:true,receivesReminders:true}]});expect(forwarded.body.force).toBeUndefined();expect(forwarded.body.billing).toBeUndefined();expect(JSON.stringify(res.json.mock.calls)).not.toContain('NEVER RETURN');expect(res.json.mock.calls[0][0].appointment.startAt).toBe('2026-11-11T18:00:00.000Z');});
 it('preserves conflicts and partial-booking details for explicit recovery instead of pretending success',async()=>{handlers.createAppointmentHandler.mockImplementation(async(_req,res)=>res.status(409).json({error:{code:'BOOKING_INCOMPLETE',message:'Review the created occurrence'},createdAppointmentIds:[60]}));await run();expect(res.status).toHaveBeenCalledWith(409);expect(res.json).toHaveBeenCalledWith({error:{code:'BOOKING_INCOMPLETE',message:'Review the created occurrence'},createdAppointmentIds:[60]});});
 it('offers only main-schedule-authorized clients with a matching agency relationship and masked names',async()=>{req.mobileScheduleOperation='options';await run();const result=res.json.mock.calls[0][0];expect(result.clients).toEqual([{id:12,maskedName:'Fic* Cli*'}]);expect(dependencies.db.execute.mock.calls[0][0]).toContain('client_agency_assignments');expect(dependencies.db.execute.mock.calls[0][1]).toEqual([2,2,12]);expect(result.locations).toEqual([{id:4,name:'Office',placeOfService:'11',schoolOrganizationId:null}]);});
 it('binds direct appointment actions to canonical agency and requires a cancellation reason',async()=>{req.mobileScheduleOperation='update';req.params={appointmentId:60};req.body.agencyId=3;await run();expect(res.status).toHaveBeenCalledWith(403);expect(handlers.updateAppointmentHandler).not.toHaveBeenCalled();req.body={};req.mobileScheduleOperation='cancel';await run();expect(res.status).toHaveBeenCalledWith(400);expect(handlers.cancelAppointmentHandler).not.toHaveBeenCalled();req.body.reason='Synthetic test cancellation';await run();expect(handlers.cancelAppointmentHandler.mock.calls[0][0].body).toMatchObject({status:'canceled_by_provider',reason:'Synthetic test cancellation',followUpAction:'keep_next'});});
 it('does not return full chart identity from canonical appointment details',async()=>{req.mobileScheduleOperation='detail';req.params={appointmentId:60};req.body={};await run();expect(JSON.stringify(res.json.mock.calls)).not.toContain('NEVER RETURN');expect(res.json.mock.calls[0][0].appointment.participants[0]).toEqual({role:'client',clientId:12,isBillingResponsible:false,receivesReminders:true});});
});
