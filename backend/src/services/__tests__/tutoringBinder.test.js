import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clinicalVideo.service.js',()=>({clinicalMedia:vi.fn()}));
vi.mock('../clinicalSessionAudit.service.js',()=>({clinicalAudit:vi.fn()}));
import {clinicalMedia} from '../clinicalVideo.service.js';
import {attachTutoringBinder} from '../tutoringOffice.service.js';
const room={id:5,agencyId:6,userId:20},office={video_session_id:'media',generation:3};
const input={clientId:40,visitId:7,confirmIdentity:true};
beforeEach(()=>{vi.clearAllMocks();clinicalMedia.mockResolvedValue({state:'active',session_kind:'office'});});
function dbFor(visits=[{id:7,status:'admitted'}]){return {execute:vi.fn(async sql=>{
 if(sql.includes('SELECT DISTINCT c.id'))return [[{id:40,full_name:'Demo Student'}]];
 if(sql.includes('SELECT id,tutoring_client_id,status'))return [visits];
 if(sql.includes('SELECT * FROM tutoring_office_encounters'))return [[]];
 return [{affectedRows:1}];
})};}
it('opens a private binder after admission without booking, completing, or charging a session',async()=>{
 const db=dbFor();const result=await attachTutoringBinder(room,office,input,db);
 expect(result).toMatchObject({manualBinder:true,participants:[{id:40}]});
 expect(db.execute.mock.calls.some(([q])=>/appointments|learning_class_sessions|charges|payment/i.test(q))).toBe(false);
});
it.each([{status:'waiting',id:7},{status:'ended',id:7},{status:'admitted',id:8}])('refuses a guest who is not currently admitted %j',async guest=>{
 await expect(attachTutoringBinder(room,office,input,dbFor([guest]))).rejects.toHaveProperty('status',409);
});
it('requires identity confirmation and an assigned tutoring student',async()=>{
 await expect(attachTutoringBinder(room,office,{...input,confirmIdentity:false},dbFor())).rejects.toHaveProperty('status',400);
 await expect(attachTutoringBinder(room,office,{...input,clientId:99},dbFor())).rejects.toHaveProperty('status',403);
});
it('keeps the prior student bound to the visit even after they leave',async()=>{
 await expect(attachTutoringBinder(room,office,input,dbFor([{id:7,status:'admitted'},{id:6,status:'ended',tutoring_client_id:39}]))).rejects.toThrow(/End this visit/);
});
it('cannot attach tutoring materials to a clinical session',async()=>{
 clinicalMedia.mockResolvedValue({state:'active',session_kind:'counseling'});
 await expect(attachTutoringBinder(room,office,input,dbFor())).rejects.toHaveProperty('status',409);
});

it('requires explicit same-session confirmation before a parent joins an existing binder',async()=>{
 const {confirmTutoringGuest}=await import('../tutoringOffice.service.js');
 const db={execute:vi.fn(async sql=>{
  if(sql.includes('SELECT * FROM tutoring_office_encounters'))return [[{room_id:5,generation:3}]];
  if(sql.includes('SELECT DISTINCT tutoring_client_id'))return [[{tutoring_client_id:40}]];
  if(sql.includes('SELECT DISTINCT c.id'))return [[{id:40,full_name:'Student'}]];
  if(sql.includes('SELECT COUNT(*) total'))return [[{total:1}]];
  return [{affectedRows:1}];
 })};
 await expect(confirmTutoringGuest(room,office,{id:8},{clientId:40,confirmIdentity:true,sameEncounter:false},db)).rejects.toHaveProperty('status',409);
 expect(db.execute.mock.calls.some(([q])=>q.startsWith('UPDATE'))).toBe(false);
 expect(await confirmTutoringGuest(room,office,{id:8},{clientId:40,confirmIdentity:true,sameEncounter:true},db)).toBe(true);
});
