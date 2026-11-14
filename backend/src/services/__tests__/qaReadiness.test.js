import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),demo:vi.fn(),room:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:mocks.access}));
vi.mock('../privateOfficeDemoAccess.service.js',()=>({privateOfficeDemoAccess:mocks.demo}));
vi.mock('../../models/ProviderMyRoom.model.js',()=>({default:{getOrCreateForUser:mocks.room}}));
import {configureQaPaymentSimulation,configureQaTutorOffice,qaTutorOfficePlan} from '../qaReadiness.service.js';
const fixture={roomId:15,userId:1496,tier:'premium_plus',expiresAt:'2030-01-08T00:00:00Z'};
const org=()=>({id:453,slug:'nlu-qa-demo',is_active:1,is_archived:0,feature_flags:{medicalBillingEnabled:false,qaSandbox:{syntheticOnly:true,program:'tutoring',privateOfficeFixture:fixture}}});
const tutor=()=>({id:1496,email:'qa.nlu.tutor@example.com',role:'provider',is_demo:1,is_active:1,is_archived:0,status:'ACTIVE_EMPLOYEE'});
function database({agency=org(),employee=tutor(),members=[{agency_id:453},{agency_id:454}],missingSchema=false}={}){
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),getConnection:vi.fn()};db.getConnection.mockResolvedValue(db);
 db.execute=vi.fn(async(sql)=>{
  if(sql.includes('FROM agencies'))return [[agency].filter(Boolean)];
  if(sql.includes('FROM users'))return [[employee].filter(Boolean)];
  if(sql.includes('FROM user_agencies'))return [members];
  if(sql.includes('FROM qa_payment_simulations')&&missingSchema)throw new Error('Missing migration');
  return [{affectedRows:1}];
 });return db;
}
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({role:'admin'});mocks.demo.mockResolvedValue(true);mocks.room.mockResolvedValue({id:15,userId:1496,agencyId:453,isActive:true});});
it.each(['provider','staff','support',null])('does not let %s configure QA payments',async role=>{mocks.access.mockResolvedValue(role?{role}:null);const db=database();await expect(configureQaPaymentSimulation({user:{id:1434},agencyId:453,enabled:true},db)).rejects.toHaveProperty('status',403);expect(db.commit).not.toHaveBeenCalled();});
it('preserves all unrelated flags and requires the migration before enabling payments',async()=>{
 const db=database();await configureQaPaymentSimulation({user:{id:1435},agencyId:453,enabled:true},db);
 const flags=JSON.parse(db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE agencies'))[1][0]);
 expect(flags.medicalBillingEnabled).toBe(false);expect(flags.qaSandbox).toMatchObject({syntheticOnly:true,program:'tutoring',privateOfficeFixture:fixture,simulatedPaymentsEnabled:true});
 const absent=database({missingSchema:true});await expect(configureQaPaymentSimulation({user:{id:1435},agencyId:453,enabled:true},absent)).rejects.toThrow('Missing migration');expect(absent.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE agencies'))).toBe(false);
});
it('creates an audited, seven-day room fixture without changing a purchased plan or starting a visit',async()=>{
 const db=database();const result=await configureQaTutorOffice({user:{id:1435},agencyId:453,tutorUserId:1496},db);
 expect(result).toMatchObject({roomId:15,tutorUserId:1496,qaFixture:true,planPurchased:false});expect(Date.parse(result.expiresAt)-Date.now()).toBeGreaterThan(6.99*86400000);
 expect(mocks.room).toHaveBeenCalledWith(1496,453,db);
 const sql=db.execute.mock.calls.map(([s])=>s).join('\n');expect(sql).not.toMatch(/meeting_access_plans|video_token|attendance|is_demo\s*=/);
 expect(JSON.stringify(result)).not.toMatch(/token|slug/i);
});
it.each(['live organization','other tutor','inactive tutor','outside membership','real caseload'])('rejects %s',async reason=>{
 const agency=org(),employee=tutor();let members=[{agency_id:453}];
 if(reason==='live organization'){agency.id=6;agency.slug='nlu';}
 if(reason==='other tutor')employee.email='someone@example.com';
 if(reason==='inactive tutor')employee.is_active=0;
 if(reason==='outside membership')members.push({agency_id:6});
 if(reason==='real caseload')mocks.demo.mockResolvedValue(false);
 const db=database({agency,employee,members});await expect(configureQaTutorOffice({user:{id:1435},agencyId:agency.id,tutorUserId:1496},db)).rejects.toHaveProperty('status',403);expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalledOnce();
});
it.each(['expired','wrong room','wrong user','missing grant','live scope'])('does not expose a QA plan for %s',async reason=>{
 const room={id:15,userId:1496,agencyId:453};if(reason==='wrong room')room.id=16;if(reason==='wrong user')room.userId=1497;if(reason==='live scope')room.agencyId=6;if(reason==='missing grant')mocks.demo.mockResolvedValue(false);
 expect(await qaTutorOfficePlan(room,database(),{now:Date.parse(reason==='expired'?'2030-01-09':'2030-01-01')})).toBe(null);
});
it('returns an effective expiring plan only for the exact granted QA room',async()=>{expect(await qaTutorOfficePlan({id:15,userId:1496,agencyId:453},database(),{now:Date.parse('2030-01-01')})).toMatchObject({privateOffice:true,multipleOfficeGuests:true,qaFixture:true,expiresAt:fixture.expiresAt});});
