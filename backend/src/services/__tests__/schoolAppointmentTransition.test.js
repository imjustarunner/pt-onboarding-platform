import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../models/OrganizationAffiliation.model.js',()=>({default:{getActiveAgencyIdForOrganization:vi.fn()}}));
vi.mock('../../models/AgencySchool.model.js',()=>({default:{getActiveAgencyIdForSchool:vi.fn()}}));
vi.mock('../clientSessionBookingRollout.service.js',()=>({clientSessionBookingAccess:vi.fn(async()=>({enabled:true}))}));
vi.mock('../appointment.service.js',()=>({updateAppointment:vi.fn()}));
import database from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import {schoolTransitionAccess,schoolTransitionDate,schoolTransitionSchemaError,schoolAgendaLinkContext,requireSchoolTransitionSchema,annotateSchoolSlotLinks} from '../schoolAppointmentTransition.service.js';
import {createSchoolSoftScheduleCalendar} from '../schoolSoftScheduleCalendar.service.js';
const trigger={EVENT_MANIPULATION:'UPDATE',ACTION_TIMING:'BEFORE',EVENT_OBJECT_TABLE:'soft_schedule_slots',ACTION_STATEMENT:'UPDATE school_schedule_appointment_links SET slot_id=NULL WHERE slot_id=OLD.id AND (NOT (OLD.client_id <=> NEW.client_id) OR OLD.school_organization_id<>NEW.school_organization_id OR OLD.provider_user_id<>NEW.provider_user_id OR OLD.weekday<>NEW.weekday)'};
beforeEach(()=>{
 vi.clearAllMocks();database.execute.mockResolvedValue([[{id:1}]]);
 Agency.findById.mockImplementation(async id=>id===451?{id,organization_type:'school',name:'Synthetic school'}:{id,timezone:'America/Denver'});
 OrganizationAffiliation.getActiveAgencyIdForOrganization.mockResolvedValue(450);User.getAgencies.mockResolvedValue([{id:450}]);
});
it('restricts setup to practice scheduling staff and school edits to a directly affiliated school account',async()=>{
 await expect(schoolTransitionAccess({actor:{id:12,role:'school_staff'},schoolId:451,providerId:7,manage:true})).rejects.toMatchObject({status:403});
 await expect(schoolTransitionAccess({actor:{id:12,role:'school_staff'},schoolId:451,providerId:7})).rejects.toMatchObject({status:403});
 User.getAgencies.mockResolvedValue([{id:451}]);
 expect(await schoolTransitionAccess({actor:{id:12,role:'school_staff'},schoolId:451,providerId:7})).toMatchObject({agencyId:450,schoolId:451,canManage:false,canMove:true});
 await expect(schoolTransitionAccess({actor:{id:12,role:'school_staff'},schoolId:999,providerId:7})).rejects.toMatchObject({status:404});
});
it('prevents another provider or an unrelated practice from changing school appointments',async()=>{
 await expect(schoolTransitionAccess({actor:{id:8,role:'provider'},schoolId:451,providerId:7})).rejects.toMatchObject({status:403});
 User.getAgencies.mockResolvedValue([{id:999}]);
 await expect(schoolTransitionAccess({actor:{id:99,role:'admin'},schoolId:451,providerId:7,manage:true})).rejects.toMatchObject({status:403});
});
it('does not activate anything when a migration is missing and validates real dates',()=>{
 for(const value of ['2026-02-30','invalid','2026-13-10'])expect(()=>schoolTransitionDate(value)).toThrow('valid date');
 expect(schoolTransitionSchemaError({code:'ER_NO_SUCH_TABLE',message:"Table 'x.school_schedule_transitions' doesn't exist"})).toMatchObject({status:503,message:expect.stringContaining('1786')});
 const unrelated={code:'ER_NO_SUCH_TABLE',message:'another table'};expect(schoolTransitionSchemaError(unrelated)).toBe(unrelated);
});
it('requires an explicit slot when the same school client has multiple matching slots',async()=>{
 database.execute.mockImplementation(async sql=>sql.includes('information_schema.TRIGGERS')?[[trigger]]:sql.includes('LIMIT 0')?[[]]:sql.includes('FROM school_schedule_transitions')?[[{effective_date:'2026-11-01',revision:1}]]:[[{id:1,weekday:'Monday'},{id:2,weekday:'Monday'}]]);
 await expect(schoolAgendaLinkContext({db:database,agencyId:450,schoolId:451,providerId:7,clientId:1,date:'2026-11-16'})).rejects.toThrow('exact school slot');
});
it('requires both table columns and the reviewed safety trigger before transition activation',async()=>{
 database.execute.mockResolvedValue([[]]);await expect(requireSchoolTransitionSchema({db:database})).rejects.toMatchObject({status:503});
 database.execute.mockImplementation(async sql=>sql.includes('information_schema.TRIGGERS')?[[{...trigger,ACTION_STATEMENT:'SET @unsafe=1'}]]:[[]]);
 await expect(requireSchoolTransitionSchema({db:database})).rejects.toMatchObject({status:503});
 database.execute.mockImplementation(async sql=>sql.includes('information_schema.TRIGGERS')?[[trigger]]:[[]]);expect(await requireSchoolTransitionSchema({db:database})).toBe(true);
});
it('leaves legacy nontransition planning and reads available when migration 1786 is absent',async()=>{
 const missing=Object.assign(new Error("Table 'test.school_schedule_transitions' doesn't exist"),{code:'ER_NO_SUCH_TABLE'});
 const legacyDb={execute:vi.fn(async()=>{throw missing;})},slots=[{id:1,client_id:2,start_time:null,end_time:null}];
 expect(await annotateSchoolSlotLinks({schoolId:451,providerId:7,slots,db:legacyDb})).toEqual(slots);
 const roster={list:vi.fn(async()=>[{client_id:2,school_id:451,slots:[]}])},history={list:vi.fn(async()=>[])};
 const service=createSchoolSoftScheduleCalendar({database:legacyDb,roster,history});
 expect((await service.list({agencyId:450,providerId:7,startDate:'2026-11-16',endDate:'2026-11-17',timeZone:'America/Denver',appointments:[]}))[0]).toMatchObject({clientId:2,slots:[]});
});
it('replaces only explicitly linked planning slots after cutover, preserving untimed and other-school entries',async()=>{
 const database={execute:vi.fn(async()=>[[{provider_user_id:7,school_organization_id:451,effective_date:'2026-11-16',slot_id:10,client_id:1}]])};
 const rows=[{provider_id:7,client_id:1,school_id:451,slots:[{id:10,startTime:'09:00:00',endTime:'10:00:00'},{id:11,startTime:'11:00:00',endTime:'12:00:00'}]},
  {provider_id:7,client_id:2,school_id:451,slots:[]},{provider_id:7,client_id:1,school_id:452,slots:[{id:20,startTime:'13:00:00',endTime:'14:00:00'}]}];
 const roster={readMany:vi.fn(async()=>rows)},history={list:vi.fn(async()=>[])};
 const service=createSchoolSoftScheduleCalendar({database,roster,history});
 const result=await service.listMany({agencyId:450,providerIds:[7],startDate:'2026-11-16',endDate:'2026-11-17',timeZone:'America/Denver',appointments:[]});
 expect(result.find(row=>row.schoolId===451&&row.clientId===1).slots.map(slot=>slot.id)).toEqual([11]);
 expect(result.find(row=>row.clientId===2).slots).toEqual([]);expect(result.find(row=>row.schoolId===452).slots[0].id).toBe(20);
 const prior=await service.listMany({agencyId:450,providerIds:[7],startDate:'2026-11-09',endDate:'2026-11-10',timeZone:'America/Denver',appointments:[]});
 expect(prior.find(row=>row.schoolId===451&&row.clientId===1).slots.map(slot=>slot.id)).toEqual([10,11]);
});
it('does not resurrect an old planning time after a linked appointment changes weekday or is canceled',async()=>{
 const database={execute:vi.fn(async()=>[[{provider_user_id:7,school_organization_id:451,effective_date:'2026-11-01',slot_id:10,client_id:1}]])};
 const roster={list:vi.fn(async()=>[{client_id:1,school_id:451,slots:[{id:10,startTime:'09:00:00',endTime:'10:00:00'}]}])},history={list:vi.fn(async()=>[])};
 const service=createSchoolSoftScheduleCalendar({database,roster,history});
 expect(await service.list({agencyId:450,providerId:7,startDate:'2026-11-16',endDate:'2026-11-17',timeZone:'America/Denver',appointments:[]})).toEqual([]);
});
