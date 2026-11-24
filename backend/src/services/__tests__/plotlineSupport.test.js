import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'production'}}));
vi.mock('../../models/HiringReferenceRequest.model.js',()=>({default:{}}));
vi.mock('../publicAgencySupport.service.js',()=>({scanPublicSupportContent:()=>({block:false})}));
vi.mock('../../utils/supportTicketCrypto.js',()=>({prepareEncryptedTicketText:()=>({plain:'plaintext',encrypted:false})}));
vi.mock('../ticketAssignment.service.js',()=>({recordTicketAssignment:vi.fn()}));
import {createPlotlineSupportService} from '../plotlineSupport.service.js';
const token='a'.repeat(64),key='11111111-1111-4111-8111-111111111111';
const body=()=>({name:'QA Referee',email:'referee@example.test',subject:'Reference form help',message:'How can I update my professional relationship?',submissionKey:key});
let d,service,db,conn,reference,product,people,links;
beforeEach(()=>{
 vi.clearAllMocks();links=new Map();people=[{id:7}];
 product={product_key:'plotline',product_name:'Plotline',operator_name:'PlotTwistCo',operator_agency_id:1,default_owner_user_id:null};
 reference={id:47,agency_id:463,status:'sent',reference_name:'QA Referee',reference_email:'referee@example.test',referenceContact:{referenceName:'QA Referee',referenceEmail:'referee@example.test'},token_expires_at:new Date(Date.now()+86400000),questionnaire:{PRIVATE:'NOT FOR SUPPORT'}};
 const execute=vi.fn(async(sql,values=[])=>{
  expect((sql.match(/\?/g)||[]).length).toBe(values.length);
  if(sql.includes('FROM platform_support_products'))return [[product]];
  if(sql.includes('FROM users WHERE'))return [people];
  if(sql.startsWith('INSERT INTO platform_support_submissions')){if(links.has(values[2]))throw Object.assign(Error('Duplicate'),{code:'ER_DUP_ENTRY'});links.set(values[2],{payload_fingerprint:values[3]});return[{insertId:80}];}
  if(sql.startsWith('SELECT id FROM hiring_reference_requests'))return [[{id:47}]];
  if(sql.startsWith('SELECT COUNT'))return [[{total:1}]];
  if(sql.startsWith('INSERT INTO support_tickets'))return [{insertId:501}];
  if(sql.startsWith('UPDATE platform_support_submissions')){links.get(values[1]).support_ticket_id=values[0];return[{affectedRows:1}];}
  if(sql.startsWith('SELECT support_ticket_id'))return [[links.get(values[0])]];
  if(sql.startsWith('INSERT INTO notifications'))return [{insertId:90}];
  throw Error(`Unexpected SQL: ${sql}`);
 });
 conn={execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};db={execute,getConnection:vi.fn(async()=>conn)};
 d={db,production:true,recaptcha:{siteKey:'PUBLIC-KEY'},reference:vi.fn(async()=>reference),captcha:vi.fn(async()=>({ok:true,score:0.9})),encrypt:vi.fn(()=>({encrypted:true,plain:null,ciphertext:'CIPHER',iv:'IV',authTag:'TAG',keyId:'KEY'})),assignment:vi.fn()};service=createPlotlineSupportService(d);
});
it('identifies the product and platform operator, prefills only known contact details, and exposes no answers or owner IDs',async()=>{
 const meta=await service.publicMeta(token);expect(meta).toMatchObject({productName:'Plotline',operatorName:'PlotTwistCo',contact:{name:'QA Referee',email:'referee@example.test'},recaptchaRequired:false});expect(JSON.stringify(meta)).not.toMatch(/PRIVATE|questionnaire|owner|47|463/);
});
it('always sends platform tickets to the operator, with Michael’s authorized assignment, never to the hiring company',async()=>{
 expect(await service.createTicket(token,{...body(),agencyId:464,operatorAgencyId:464,ownerUserId:1434,actorUserId:1434,isQa:true},{})).toEqual({ok:true,ticketId:501});
 const insert=conn.execute.mock.calls.find(([s])=>s.startsWith('INSERT INTO support_tickets'));
 expect(insert[0]).toContain("'platform','plotline'");expect(insert[1]).toEqual([1,'plotline_platform_support',1,'Plotline · Reference form help',null,'referee@example.test',7,'CIPHER','IV','TAG','KEY']);
 expect(d.assignment).toHaveBeenCalledWith(expect.objectContaining({actorUserId:null,assigneeUserId:7,agencyId:1,reason:'Plotline platform support · PlotTwistCo'}),conn);
 expect(conn.execute.mock.calls.find(([s])=>s.startsWith('INSERT INTO notifications'))[1]).toEqual([7,1,501,JSON.stringify({productKey:'plotline',targetScope:'platform'})]);
 expect(JSON.stringify(conn.execute.mock.calls)).not.toContain(token);expect(JSON.stringify(conn.execute.mock.calls)).not.toContain(body().message);expect(conn.commit).toHaveBeenCalledOnce();
});
it('requires an active platform grant for the initial Michael match, or an explicit configured owner; no hiring role or Jordan fallback',async()=>{
 await service.publicMeta();const sql=db.execute.mock.calls.find(([s])=>s.includes('FROM users WHERE'))[0];expect(sql).toContain('has_platform_support=1');expect(sql).toContain("LOWER(TRIM(first_name))='michael'");expect(sql).toContain('is_active=1');
 people=[];await expect(service.publicMeta()).rejects.toHaveProperty('status',503);
 people=[{id:7},{id:8}];await expect(service.publicMeta()).rejects.toHaveProperty('status',503);
 product.default_owner_user_id=9;people=[{id:9}];await service.publicMeta();expect(db.execute.mock.calls.at(-1)[1]).toEqual([9]);
 product.default_owner_user_id=9;people=[];await expect(service.publicMeta()).rejects.toHaveProperty('status',503);
});
it('can move future tickets to a separately configured operator without rewriting old tickets',async()=>{
 product={...product,operator_agency_id:99,operator_name:'Plotline, Inc.',default_owner_user_id:7};await service.createTicket(token,body(),{});
 expect(d.assignment.mock.calls[0][0]).toMatchObject({agencyId:99,reason:'Plotline platform support · Plotline, Inc.'});
 expect(conn.execute.mock.calls.some(([s])=>s.startsWith('UPDATE support_tickets'))).toBe(false);
});
it('returns the same ticket after a lost response and rejects changed payloads using that key',async()=>{
 await service.createTicket(token,body(),{});expect(await service.createTicket(token,body(),{})).toEqual({ok:true,ticketId:501});
 expect(d.assignment).toHaveBeenCalledOnce();expect(conn.execute.mock.calls.filter(([s])=>s.startsWith('INSERT INTO support_tickets'))).toHaveLength(1);
 await expect(service.createTicket(token,{...body(),message:'Different question for the same request'},{})).rejects.toHaveProperty('status',409);
});
it('does not claim success when assignment or encryption cannot be saved',async()=>{
 d.assignment.mockRejectedValueOnce(Error('Audit unavailable'));await expect(service.createTicket(token,body(),{})).rejects.toThrow('Audit unavailable');expect(conn.rollback).toHaveBeenCalled();expect(conn.commit).not.toHaveBeenCalled();
 const options={...d};delete options.encrypt;await expect(createPlotlineSupportService(options).createTicket(token,body(),{})).rejects.toHaveProperty('status',503);
});
it('keeps CAPTCHA required on the generic platform form, even with forged QA and company fields',async()=>{
 expect(await service.publicMeta()).toMatchObject({recaptchaRequired:true,recaptchaSiteKey:'PUBLIC-KEY'});
 await expect(service.createTicket(null,{...body(),isQa:true,isDemo:true,agencyId:463},{})).rejects.toThrow('Human verification');expect(db.getConnection).not.toHaveBeenCalled();
 d.captcha.mockResolvedValueOnce({ok:true,score:0.1});await expect(service.createTicket(null,{...body(),captchaToken:'proof'},{})).rejects.toThrow('human verification');
 await service.createTicket(null,{...body(),captchaToken:'proof'},{});expect(d.captcha).toHaveBeenLastCalledWith(expect.objectContaining({expectedAction:'plotline_support',token:'proof'}));
});
it.each([{status:'expired'},{status:'send_failed'},{status:'cancelled',declined:false},{token_expires_at:'2001-01-01'}])('fails closed for revoked or unusable invitations: %j',async change=>{
 Object.assign(reference,change);await expect(service.publicMeta(token)).rejects.toHaveProperty('status');expect(db.execute).not.toHaveBeenCalled();
});
it('offers support after completion or decline, without exposing reference answers or reopening the questionnaire',async()=>{
 for(const change of [{status:'completed',responses_json:{referenceName:'Corrected QA',referenceEmail:'corrected@example.test',strengths:'PRIVATE'}},{status:'cancelled',declined:true}]){Object.assign(reference,change);const meta=await service.publicMeta(token);expect(meta.contact.name).toBe('Corrected QA');expect(JSON.stringify(meta)).not.toContain('PRIVATE');}
});
it('limits repeated questions for a valid capability and rechecks revocation inside the transaction',async()=>{
 const original=conn.execute.getMockImplementation();conn.execute.mockImplementation(async(s,v)=>s.startsWith('SELECT COUNT')?[[{total:6}]]:original(s,v));
 await expect(service.createTicket(token,body(),{})).rejects.toHaveProperty('status',429);expect(conn.commit).not.toHaveBeenCalled();
 links.clear();conn.execute.mockImplementation(async(s,v)=>s.startsWith('SELECT id FROM hiring_reference_requests')?[[]]:original(s,v));await expect(service.createTicket(token,body(),{})).rejects.toHaveProperty('status',410);
});
it('suppresses the honeypot and validates fields without creating users or tickets',async()=>{
 expect(await service.createTicket(token,{...body(),website:'spam'},{})).toEqual({ok:true,suppressed:true});
 await expect(service.createTicket(token,{...body(),email:'invalid'},{})).rejects.toHaveProperty('status',400);expect(db.getConnection).not.toHaveBeenCalled();
});


it('rolls back when the assigned owner notification cannot be saved',async()=>{
 const original=conn.execute.getMockImplementation();conn.execute.mockImplementation(async(s,v)=>{if(s.startsWith('INSERT INTO notifications'))throw Error('Notification storage unavailable');return original(s,v);});
 await expect(service.createTicket(token,body(),{})).rejects.toThrow('Notification storage unavailable');expect(conn.rollback).toHaveBeenCalled();expect(conn.commit).not.toHaveBeenCalled();
});
