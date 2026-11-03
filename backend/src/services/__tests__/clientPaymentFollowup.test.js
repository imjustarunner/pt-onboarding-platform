import {beforeEach,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Notification.model.js',()=>({default:{coalesceOrCreate:vi.fn()}}));
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../clientPaymentSetup.service.js',async()=>{const crypto=await import('node:crypto');return {clientPaymentSetup:vi.fn(),paymentSetupReviewHash:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),paymentSetupEmail:({provider,familyNotified})=>({subject:provider?'Provider':'Family',text:familyNotified?'Family notified':'Please set up payment'})};});
import {paymentFollowupPreview,sendPaymentFollowup,confirmedPaymentEmail} from '../clientPaymentFollowup.service.js';

const context=(patch={})=>({client:{full_name:'DEMO QA Person'},eligible:[{guardian_user_id:11,first_name:'DEMO QA',email:'payer@example.com'}],payers:[],summary:{medicaid:false,cardOnFile:false,paymentMethodNeeded:true,secureCollectionAvailable:true,paymentUrl:'https://auricwell.com/demo/guardian?panel=payment_methods&clientId=2',...patch}});
const previewDeps=(patch={})=>({db:{execute:vi.fn(async sql=>sql.includes('FROM users')?[[{id:12,first_name:'DEMO QA Provider',email:'provider@example.com'}]]:[[]])},setup:vi.fn(async()=>context(patch)),sender:vi.fn(async()=>({id:3,from_email:'billing@example.com'}))});
it('excludes Medicaid and clients with a card, and blocks unavailable secure collection',async()=>{
  for(const patch of [{medicaid:true},{paymentMethodNeeded:false,cardOnFile:true},{secureCollectionAvailable:false}])expect((await paymentFollowupPreview(1,2,previewDeps(patch))).ready).toBe(false);
});
it('reviews authorized recipients and from/reply identity, and rejects missing contact data',async()=>{
  const deps=previewDeps(),result=await paymentFollowupPreview(1,2,deps);
  expect(result.ready).toBe(true);expect(result.recipients.map(r=>r.kind)).toEqual(['family','provider']);expect(result.from).toBe('billing@example.com');
  deps.setup.mockResolvedValue({...context(),eligible:[{guardian_user_id:11,email:''}]});expect((await paymentFollowupPreview(1,2,deps)).ready).toBe(false);
});
it('does not interpret a redirect, queue or hold as delivery',()=>{
  expect(confirmedPaymentEmail({id:'sent'})).toBe(true);
  for(const flag of ['redirected','queued','blocked','skipped'])expect(confirmedPaymentEmail({id:'sent',[flag]:true})).toBe(false);
  expect(confirmedPaymentEmail({})).toBe(false);
});

it.skipIf(!process.env.BILLING_TEST_MYSQL_SOCKET)('MySQL: replay, tenant isolation, stale review, partial mail outcomes and provider follow-up preserve delivery evidence',async()=>{
  const socket=process.env.BILLING_TEST_MYSQL_SOCKET;
  expect(socket.startsWith('/private/tmp/pt-billing-workflow-mysql-')).toBe(true);
  const admin=await mysql.createConnection({socketPath:socket,user:'root'}),schema=`payment_followup_${randomUUID().replaceAll('-','')}`;let db;
  try{
    await admin.query(`CREATE DATABASE ${schema}`);db=mysql.createPool({socketPath:socket,user:'root',database:schema,connectionLimit:4});
    const migration=await readFile(new URL('../../../../database/migrations/1736_payment_setup_followups.sql',import.meta.url),'utf8');
    for(const statement of migration.split(';').filter(s=>s.trim()))await db.query(statement);
    await db.query('CREATE TABLE family_billing_audit(agency_id INT,actor_user_id INT,client_id INT,action VARCHAR(100),object_id BIGINT)');
    const model=await paymentFollowupPreview(1,2,previewDeps());
    const send=vi.fn(async()=>({id:'synthetic-email',communicationId:100})),notify=vi.fn(async()=>({id:99})),preview=vi.fn(async()=>model),qr=vi.fn(async()=>Buffer.from('synthetic-qr'));
    const deps={db,send,notify,preview,qr},input={agencyId:1,clientId:2,userId:5,requestKey:randomUUID(),reviewHash:model.reviewHash};
    await expect(sendPaymentFollowup({...input,reviewHash:'stale'},deps)).rejects.toMatchObject({status:409});expect(send).not.toHaveBeenCalled();
    const first=await sendPaymentFollowup(input,deps);expect(first.deliveries.map(d=>d.status)).toEqual(['sent','sent']);expect(notify).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(2);
    const again=await sendPaymentFollowup(input,deps);expect(again.id).toBe(first.id);expect(send).toHaveBeenCalledTimes(2);
    await expect(sendPaymentFollowup({...input,clientId:3},deps)).rejects.toMatchObject({status:409});
    send.mockRejectedValueOnce(new Error('Transport outcome unknown'));
    const failed=await sendPaymentFollowup({...input,clientId:4,requestKey:randomUUID()},deps);
    expect(failed.deliveries.map(d=>d.status)).toEqual(['unknown','held']);expect(send).toHaveBeenCalledTimes(3);
    const beforeChanged=send.mock.calls.length;
    preview.mockResolvedValueOnce(model).mockResolvedValueOnce(model).mockResolvedValueOnce({...model,ready:false,blockers:['Medicaid clients do not require a payment method.']});
    const changed=await sendPaymentFollowup({...input,clientId:5,requestKey:randomUUID()},deps);
    expect(changed.deliveries.map(d=>d.status)).toEqual(['sent','held']);expect(send.mock.calls.length).toBe(beforeChanged+1);
    expect(preview).toHaveBeenCalledWith(1,5,expect.objectContaining({ignoreRequestId:changed.id}));
    const beforeRevoked=send.mock.calls.length;
    preview.mockResolvedValueOnce(model).mockResolvedValueOnce({...model,reviewHash:'revoked-recipient'}).mockResolvedValueOnce({...model,reviewHash:'revoked-recipient'});
    const revoked=await sendPaymentFollowup({...input,clientId:6,requestKey:randomUUID()},deps);
    expect(revoked.deliveries.map(d=>d.status)).toEqual(['held','held']);expect(send.mock.calls.length).toBe(beforeRevoked);
    const [[audit]]=await db.query('SELECT COUNT(*) AS n FROM family_billing_audit');expect(audit.n).toBe(4);
  }finally{if(db)await db.end();await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end();}
});
