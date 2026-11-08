import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../../config/database.js',()=>({default:mocks}));
import {pendingSecureContact,prepareAdultSecureRecipient,reserveSecureDelivery,secureDeliveryReceipt} from '../secureInvitation.service.js';
const client={id:20,full_name:'Synthetic Adult',date_of_birth:'1990-01-01',contact_email:'adult@example.invalid',guardian_portal_enabled:1};
const link={guardian_user_id:30,access_enabled:1,is_active:1,role:'client',status:'PENDING_SETUP',email:'adult@example.invalid',permissions_json:{}};
const access={reviewRequired:false,scopes:['clinical_messages']};
beforeEach(()=>vi.resetAllMocks());
it('offers setup only for an enabled, authorized family contact with stored birth date',()=>{
 expect(pendingSecureContact(link,client,access)).toBe(true);
 for(const changed of [{access_enabled:0},{is_active:0},{role:'provider'},{status:'DISABLED'},{permissions_json:{noView:true}},{permissions_json:{noViewOtherGuardian:true}},{permissions_json:{dependentSelfAccess:true}},{permissions_json:{canMessage:false}}])expect(pendingSecureContact({...link,...changed},client,access)).toBe(false);
 expect(pendingSecureContact(link,{...client,date_of_birth:null},access)).toBe(false);
 expect(pendingSecureContact(link,{...client,guardian_portal_enabled:0},access)).toBe(false);
 expect(pendingSecureContact(link,client,{...access,reviewRequired:true})).toBe(false);
 expect(pendingSecureContact(link,client,{...access,scopes:[]})).toBe(false);
});
function dbFixture({person=client,links=[],existing=[],independent=null}={}){
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
  if(sql.startsWith('SELECT * FROM clients'))return [[person]];
  if(sql.includes('client_portal_independence'))return [[independent]];
  if(sql.startsWith('SELECT guardian_user_id'))return [links];
  if(sql.startsWith('SELECT id FROM users'))return [existing];
  if(sql.startsWith('INSERT INTO users'))return [{insertId:30}];
  return [{affectedRows:1}];
 })};mocks.getConnection.mockResolvedValue(db);return db;
}
it('creates a pending adult self account and never substitutes guardian authority',async()=>{
 const db=dbFixture();expect(await prepareAdultSecureRecipient(20,3)).toBe(30);
 expect(db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO users'))).toEqual([expect.stringContaining("'client','PENDING_SETUP'"),['Synthetic','Adult','adult@example.invalid']]);
 expect(db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_guardians'))).toEqual([expect.stringContaining("'self','Self'"),[20,30,JSON.stringify({canMessage:true}),3]]);
 expect(db.commit).toHaveBeenCalledOnce();expect(db.release).toHaveBeenCalledOnce();
});
it.each([
 ['minor',{person:{...client,date_of_birth:'2020-01-01'}}],['missing DOB',{person:{...client,date_of_birth:null}}],
 ['missing email',{person:{...client,contact_email:null}}],['email collision',{existing:[{id:99}]}],
 ['disabled self relationship',{links:[{guardian_user_id:99,relationship_type:'self',access_enabled:0}]}],
 ['existing guardian',{links:[{guardian_user_id:99,relationship_type:'guardian',access_enabled:1}]}],
 ['independent portal',{independent:{user_id:99}}]
])('does not auto-link or restore %s',async(_,options)=>{
 const db=dbFixture(options);await expect(prepareAdultSecureRecipient(20,3)).rejects.toMatchObject({status:409});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(db.rollback).toHaveBeenCalledOnce();
});
it('reserves one content-bound request and returns only a receipt without message text or claim credentials',async()=>{
 const args={senderId:3,requestKey:'synthetic-send-00000001',agencyId:2,clientId:20,recipientKey:'client',text:'SYNTHETIC NARRATIVE'};
 let stored; mocks.execute.mockImplementation(async(sql,params)=>{
  if(sql.startsWith('INSERT')){const fresh=!stored;stored ||= {id:1,content_hash:params[5],message_id:90,thread_id:40,delivery_status:'queued'};return [{affectedRows:fresh?1:0}];}return [[stored]];
 });
 expect((await reserveSecureDelivery(args)).fresh).toBe(true);const retry=await reserveSecureDelivery(args);expect(retry.fresh).toBe(false);
 expect(secureDeliveryReceipt(retry.row)).toEqual({ok:true,messageId:90,threadId:40,deliveryStatus:'queued'});
 await expect(reserveSecureDelivery({...args,text:'different'})).rejects.toMatchObject({status:409});
 await expect(reserveSecureDelivery({...args,requestKey:'invalid'})).rejects.toMatchObject({status:400});
 expect(JSON.stringify(mocks.execute.mock.calls)).not.toContain(args.text);
});
