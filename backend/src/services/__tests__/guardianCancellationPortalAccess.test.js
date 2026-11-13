import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedClient:vi.fn(),authorizedAppointmentClient:vi.fn()}));
import {authorizedClient,authorizedAppointmentClient} from '../guardianAppointments.service.js';
import {servicePortalAccess,decorateService} from '../../utils/clientServiceLifecycle.js';
import {limitedServiceRouteAllowed,limitedGlobalRouteAllowed,createGlobalServicePortalGate,servicePortalGate,guardianSessionHistory,sessionHistoryCsv} from '../guardianServicePortal.service.js';
const services=[{id:3,agency_id:2,provider_user_id:7,service_kind:'counseling',is_active:0,service_status:'discontinued'},{id:4,agency_id:2,provider_user_id:99,service_kind:'tutoring',is_active:1,service_status:'active'}];
beforeEach(()=>{vi.clearAllMocks();authorizedClient.mockResolvedValue({client_id:8,agency_id:2,portal_access:{limited:true,status:'discontinued'},services,service:services[0]});authorizedAppointmentClient.mockResolvedValue({client_id:8,agency_id:2,service:services[0]});});
it('preserves inactive services and limits only the selected service, while global termination limits the profile',()=>{
 expect(decorateService({...services[0],service_status:undefined}).status_label).toBe('Discontinued services');
 expect(servicePortalAccess({},services,3).limited).toBe(true);expect(servicePortalAccess({},services,4).limited).toBe(false);
 expect(servicePortalAccess({client_status_key:'terminated'},services,4)).toMatchObject({limited:true,status:'terminated'});
});
it.each(['/session-booking','/session-booking/slots','/appointments/1/requests','/appointments/1/cancel-preview','/care-access','/checkins','/notification-setup/sms-consent'])('blocks direct active-care APIs for an ended service: %s',async path=>{
 const next=vi.fn();await servicePortalGate({user:{id:9},params:{clientId:'8'},query:{agencyId:2,serviceId:3},body:{},path,method:'POST'},{},next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403,code:'SERVICE_PORTAL_LIMITED'}));
});
it('allows signed copies, history, status and the existing termination/feedback flow without reopening booking',()=>{
 for(const path of ['/service-access','/session-history','/session-history/download','/intake-documents','/intake-documents/1/download-url','/cancellations/saved','/cancellations/saved/feedback'])expect(limitedServiceRouteAllowed('GET',path)).toBe(true);
 expect(limitedServiceRouteAllowed('POST','/cancellations/saved/feedback')).toBe(true);
 expect(limitedServiceRouteAllowed('GET','/session-booking')).toBe(false);expect(limitedServiceRouteAllowed('PUT','/contact-sharing')).toBe(false);
});
it('keeps appointment access rules for downloads, filters other services, and omits clinical notes and other participants',async()=>{
 const db={execute:vi.fn(async()=>[[{id:1,agencyId:2,providerUserId:7,businessType:'mental_health',startAt:'2026-01-01 16:00:00',endAt:'2026-01-01 17:00:00',status:'completed',providerName:'Provider',modality:'IN_PERSON',notes:'private chart',otherClientName:'Another child'},
 {id:2,agencyId:2,providerUserId:99,businessType:'learning',status:'completed'}]])};
 const result=await guardianSessionHistory({userId:9,clientId:8,agencyId:2,serviceId:3},db);
 expect(result).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('private chart');expect(JSON.stringify(result)).not.toContain('Another child');
 expect(db.execute.mock.calls[0][1]).toEqual([8,2]);expect(db.execute.mock.calls[0][0]).toContain('a.start_at<=UTC_TIMESTAMP()');
 authorizedAppointmentClient.mockRejectedValueOnce(Object.assign(new Error('No access'),{status:403}));await expect(guardianSessionHistory({userId:10,clientId:8},db)).rejects.toMatchObject({status:403});
});
it('escapes spreadsheet formulas and CSV quotes in downloadable history',()=>{
 const csv=sessionHistoryCsv([{id:1,providerName:'  =HYPERLINK("bad")',service:'Counseling',status:'completed'}]);
 expect(csv).toContain('"\'  =HYPERLINK(""bad"")"');expect(csv).not.toContain('clinicalNote');
});
it('blocks global enrollment and care APIs for a fully ended account while preserving account, billing-support and status access',async()=>{
 const gate=createGlobalServicePortalGate({profiles:async()=>[{client_id:8}],contexts:async()=>[{portal_access:{limited:true}}]});
 for(const path of ['/registration/catalog','/enrollments','/messages','/dependents']){const next=vi.fn();await gate({user:{id:9},path,method:'GET',query:{},body:{}},{},next);expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'SERVICE_PORTAL_LIMITED'}));}
 expect(limitedGlobalRouteAllowed('GET','/overview')).toBe(true);expect(limitedGlobalRouteAllowed('PUT','/account')).toBe(true);expect(limitedGlobalRouteAllowed('POST','/support-tickets')).toBe(true);
});
it('still rejects the ended target when another family profile is active',async()=>{
 const gate=createGlobalServicePortalGate({client:async()=>({portal_access:{limited:true}}),profiles:async()=>[{client_id:9}],contexts:async()=>[{portal_access:{limited:false}}]});
 const next=vi.fn();await gate({user:{id:9},path:'/registration/learning-classes/1/enroll',method:'POST',query:{},body:{clientIds:[8]}},{},next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
 const permitted=vi.fn();await gate({user:{id:9},path:'/registration/catalog',method:'GET',query:{},body:{}},{},permitted);expect(permitted).toHaveBeenCalledWith();
});
