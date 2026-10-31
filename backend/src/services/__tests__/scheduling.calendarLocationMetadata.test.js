import {it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import Appointment from '../../models/Appointment.model.js';
it('carries the canonical school service location into provider schedule metadata',async()=>{
 db.execute.mockResolvedValue([[{id:20,provider_schedule_event_id:80,status:'client_confirmed',notes:null,modality:'IN_PERSON',service_location_id:12,school_organization_id:451,service_location_name:'Cedar Grove'}]]);
 const rows=await Appointment.listIdsByProviderScheduleEventIds([80,80]);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('sl.agency_id=ap.agency_id'),[80]);
 expect(rows.get(80)).toMatchObject({id:20,status:'client_confirmed',modality:'IN_PERSON',serviceLocationId:12,schoolOrganizationId:451,schoolName:'Cedar Grove',locationLabel:'Cedar Grove'});
});
it('retains office location and room metadata without labeling it a school',async()=>{
 db.execute.mockResolvedValue([[{id:21,provider_schedule_event_id:81,status:'scheduled',office_location_id:3,room_id:4,service_location_name:'Clinic'}]]);
 expect((await Appointment.listIdsByProviderScheduleEventIds([81])).get(81)).toMatchObject({officeLocationId:3,roomId:4,schoolOrganizationId:null,schoolName:null,locationLabel:'Clinic'});
});
it('preserves the appointment clinical context when a provider calendar overlay is reopened',async()=>{
 db.execute.mockResolvedValue([[{id:22,provider_schedule_event_id:82,status:'scheduled',clinical_session_id:167,
   service_code:'90834',tenant_service_id:99,office_event_id:44,client_id:2273,source_timezone:'America/Denver'}]]);
 const entry=(await Appointment.listIdsByProviderScheduleEventIds([82])).get(82);
 expect(entry).toMatchObject({id:22,clinicalSessionId:167,serviceCode:'90834',tenantServiceId:99,
   officeEventId:44,clientId:2273,sourceTimezone:'America/Denver'});
 expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining('COUNT(DISTINCT p.client_id)=1'),[82]);
});
it('does not pick a group participant or reuse the provider event id as an office event',async()=>{
 db.execute.mockResolvedValue([[{id:23,provider_schedule_event_id:83,client_id:null,office_event_id:null,
   clinical_session_id:null,service_code:null}]]);
 expect((await Appointment.listIdsByProviderScheduleEventIds([83])).get(83)).toMatchObject({id:23,
   clientId:null,officeEventId:null,clinicalSessionId:null,serviceCode:null});
});
