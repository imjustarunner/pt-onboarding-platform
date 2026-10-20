import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({user:{id:10,role:'provider'},agencies:[{id:2}]}));
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(req,res,next)=>{req.user=m.user;next();},requireActiveStatus:(req,res,next)=>next()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:vi.fn(),listParticipants:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:async()=>m.agencies}}));
vi.mock('../../services/payrollPto.service.js',()=>({getAgencyPtoPolicy:async()=>({policy:{ptoEnabled:true,schoolSupportEnabled:true}})}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:async()=>({primaryIsMedicaid:true})}));
import pool from '../../config/database.js';
import Appointment from '../../models/Appointment.model.js';
import router from '../../routes/appointment.routes.js';
beforeEach(()=>{
 m.user={id:10,role:'provider'};m.agencies=[{id:2}];
 Appointment.findById.mockResolvedValue({id:1,agencyId:2,providerUserId:10,startAt:'2026-10-20 18:00:00'});
 Appointment.listParticipants.mockResolvedValue([{clientId:20,isBillingResponsible:true}]);
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM clients'))return [[{client_type:'school'}]];
  if(sql.includes('FROM payroll_pto_accounts'))return [[{school_support_balance_hours:3}]];
  if(sql.startsWith('SELECT total_hours'))return [[{total_hours:1}]];
  if(sql.includes('source_appointment_id'))return [[]];
  throw Error(`Unexpected query ${sql}`);
 });
});
function get(){return new Promise(resolve=>{
 const req={method:'GET',url:'/1/change/school-support?eventType=canceled',query:{eventType:'canceled'},headers:{}};
 const res={statusCode:200,status(n){this.statusCode=n;return this;},json(data){resolve({status:this.statusCode,data});}};
 router.handle(req,res,error=>resolve({status:error?.status||500,error}));
});}
it('returns the assigned provider earned balance through the real route without client-billing redaction',async()=>{
 expect(await get()).toMatchObject({status:200,data:{eligible:true,balanceHours:3,pendingHours:1,availableHours:2}});
});
it('rejects a provider outside the agency',async()=>{
 m.agencies=[];expect((await get()).status).toBe(403);
});
it('scheduling staff cannot see someone else’s benefit balance',async()=>{
 m.user={id:30,role:'staff'};expect(await get()).toEqual({status:200,data:{eligible:false}});
});
