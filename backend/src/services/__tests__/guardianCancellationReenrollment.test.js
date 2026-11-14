import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:()=>{}}));
vi.mock('../guardianAppointments.service.js',()=>({authorizedAppointmentClient:vi.fn()}));
vi.mock('../clientUpdate.service.js',()=>({currentClientUpdateRecipient:vi.fn(),sendReenrollmentUpdate:vi.fn()}));
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:vi.fn()}));
import {createClientReenrollment,reenrollmentPacket} from '../clientReenrollment.service.js';
import {createReenrollmentPacketGate,assertReenrollmentSubject,publicEnrollmentResponsePrivacy} from '../../middleware/reenrollmentPacket.middleware.js';
const base={intake_steps:[{type:'document',templateId:10,title:'Current agreement v3'},{type:'registration'}],intake_fields:[{key:'contact'}]};
it('keeps staff match evidence private in public completion, status and nested progress responses',()=>{
 const input={submittedAt:new Date('2026-01-01'),registrationReturningAutoMatch:{matched:true,initials:'PR'},submission:{intake_data:{responses:{submission:{registration_client_match:'existing',registration_matched_client_id:123,registration_returning_guardian_auto_match:true,registration_returning_matched_initials:'PR',answer:'Preserved'}}}}};
 const json=vi.fn(),res={json},next=vi.fn();publicEnrollmentResponsePrivacy({},res,next);res.json(input);const output=json.mock.calls[0][0];expect(JSON.stringify(output)).not.toMatch(/matched|existing|123|PR/);expect(output.submission.intake_data.responses.submission).toEqual({registration_client_match:'new',answer:'Preserved'});expect(output.submittedAt).toBe(input.submittedAt);expect(input.registrationReturningAutoMatch.matched).toBe(true);expect(next).toHaveBeenCalledOnce();
 res.json({intake_data:JSON.stringify(input.submission.intake_data)});expect(json.mock.calls[1][0].intake_data).not.toMatch(/matched|existing|123|PR/);
});
const service={id:3,client_id:8,agency_id:2,provider_user_id:7,label:'Counseling',provider_name:'Previous provider',is_active:0,service_status:'discontinued',ended_at:'2026-11-01',created_at:'2026-01-01'};
it('rejects another client identity even when the correct account has opened the package',()=>{
 const row={client_id:8,expectedClient:{id:8,full_name:'Client Example',date_of_birth:'2000-01-01'}};
 expect(()=>assertReenrollmentSubject(row,{clients:[{clientId:99,fullName:'Client Example'}]})).toThrow('linked to one');expect(()=>assertReenrollmentSubject(row,{clients:[{clientId:8,fullName:'Another Person'}]})).toThrow('linked to one');expect(()=>assertReenrollmentSubject(row,{clients:[{fullName:'Client Example',dateOfBirth:'1999-01-01'}]})).toThrow('linked to one');expect(()=>assertReenrollmentSubject(row,{clients:[{fullName:'Client Example',dateOfBirth:'2000-01-01'}]})).not.toThrow();
});
const input={clientId:8,agencyId:2,userId:9,input:{serviceId:3,recipientUserId:11,confirmed:true,requestKey:'11111111-1111-4111-8111-111111111111'}};
let d,api,requests;
beforeEach(()=>{requests=[];const execute=vi.fn(async(sql,args)=>{
 if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
 if(sql.includes('FROM client_service_enrollments'))return [[service]];
 if(sql.includes('reenrollment_request_key=?'))return [requests.filter(r=>r.reenrollment_request_key===args[1])];
 if(sql.includes("status IN ('draft','sent','in_progress')"))return [requests.filter(r=>r.status==='sent')];
 if(sql.startsWith('INSERT INTO client_update_requests')){requests.push({id:4,client_id:8,agency_id:2,guardian_user_id:11,service_enrollment_id:3,reenrollment_request_key:args[5],status:'draft'});return [{insertId:4}];}
 if(sql.includes('client_service_provider_history'))return [[{id:90,service_enrollment_id:3,provider_name:'Previous provider',service_status:'discontinued',ended_at:'2026-09-01',recorded_at:'2026-01-01'}]];
 return [{affectedRows:1}];
 });const connection={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};d={db:{execute,getConnection:async()=>connection},master:vi.fn(async()=>base),contacts:vi.fn(async()=>[{guardian_user_id:11,email:'client@example.invalid'}]),recipient:vi.fn(async()=>({recipient:{guardian_user_id:11,email:'client@example.invalid'}})),send:vi.fn(async()=>{requests[0].status='sent';return {deliveryStatus:'sent'};}),authorize:vi.fn(async()=>({agency_id:2,services:[service]}))};api=createClientReenrollment(d);});
it('uses a fresh document set with required confirmations, removing registration',()=>{
 const result=reenrollmentPacket(base);expect(result.steps.map(s=>s.type)).toEqual(['document','insurance_info','communications']);expect(result.documents[0].title).toBe('Current agreement v3');expect(()=>reenrollmentPacket({intake_steps:[]})).toThrow('Publish');
});
it('prepares one existing-client package and keeps the same identity on retry',async()=>{
 await api.send(input);expect(d.send).toHaveBeenCalledTimes(1);expect(requests).toHaveLength(1);expect(requests[0].status).toBe('sent');expect(await api.send(input)).toMatchObject({alreadyCreated:true,id:4});expect(d.send).toHaveBeenCalledTimes(1);
 expect(d.db.execute.mock.calls.some(([sql])=>/UPDATE client_service_enrollments|INSERT INTO clients|INSERT INTO appointments/.test(sql))).toBe(false);
 await expect(api.send({...input,input:{...input.input,recipientUserId:99}})).rejects.toHaveProperty('status');
});
it('retains a closed provider episode even when the service is active again',async()=>{
 d.authorize.mockResolvedValue({agency_id:2,services:[{...service,is_active:1}]});const result=await api.pastProviders({userId:11,clientId:8,agencyId:2});expect(result.providers).toHaveLength(1);expect(result.providers[0]).toMatchObject({providerName:'Previous provider',currentServiceActive:true,serviceId:3});
 d.authorize.mockResolvedValue({agency_id:2,services:[]});expect((await api.pastProviders({userId:11,clientId:8,agencyId:2})).providers).toEqual([]);
});
it('filters a package manifest when the current relationship no longer includes that service',async()=>{
 const execute=d.db.execute.getMockImplementation();d.db.execute.mockImplementation((sql,...args)=>sql.includes(' submitted\n')?Promise.resolve([[{id:4,status:'sent',service_enrollment_id:99,packet_config_json:{documents:[{id:10,title:'Private clinical agreement'}]},packet_public_key:'reenroll-private'}]]):execute(sql,...args));
 expect((await api.list({userId:11,clientId:8,agencyId:2})).packages).toEqual([]);
 expect(d.db.execute.mock.calls.at(-1)[1]).toEqual([8,2,11]);
});
it('requires sign-in before querying an invite or revealing any client context',async()=>{
 const access=vi.fn(),auth=vi.fn((req,res)=>res.status(401).json({error:{message:'Sign in'}}));const res={set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
 await createReenrollmentPacketGate({auth,access})({params:{publicKey:'reenroll-secret'},path:'/session',method:'POST'},res,next);expect(access).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(401);
});
it('denies public account recognition and extra siblings even after valid account authorization',async()=>{
 const access=vi.fn(async()=>({client_id:8,guardian_user_id:11,status:'sent'})),auth=(req,res,next)=>next(),gate=createReenrollmentPacketGate({auth,access});
 for(const request of [{path:'/account-lookup',method:'GET',body:{}},{path:'/submit',method:'POST',body:{clients:[{},{}]}}]){
  const res={set:vi.fn().mockReturnThis(),sendStatus:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await gate({params:{publicKey:'reenroll-secret'},user:{id:11},...request},res,next);expect(next).not.toHaveBeenCalled();expect(res.sendStatus.mock.calls.length+res.status.mock.calls.length).toBe(1);
 }
});
