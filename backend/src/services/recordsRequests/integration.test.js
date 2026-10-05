import test,{after} from 'node:test';
import assert from 'node:assert/strict';
if(process.env.RECORDS_TEST_DATABASE!=='local-disposable'||process.env.DB_NAME!=='records_requests_test'||process.env.DB_PORT!=='33473')throw new Error('Use the disposable records test runner.');
const s=await import('./service.js');
const {default:pool}=await import('../../config/database.js');
const input={requesterName:'Sensitive Parent',patientName:'Synthetic Patient',email:'private@example.invalid',phone:'555-1212',relationship:'parent',scope:'Sensitive requested summaries',attested:true,patientId:101};
let request;
after(()=>pool.end());
test('admin configures a primary and multiple backups without acquiring records access',async()=>{
 await s.saveOptions(15,10,{managerIds:[11,12,13],enabled:true,followUpDays:7,revision:0});
 assert.deepEqual((await s.options(15,10)).settings.managerIds,[11,12,13]);
 const publicList=await s.publicPractices();assert.equal(publicList.length,1);assert.equal(publicList[0].id,10);assert.equal(publicList[0].brandColor,'#0649ce');
 await assert.rejects(s.requests(15,10),/Records Manager/);
 await assert.rejects(s.requests(14,10),/Records Manager/);
 await assert.rejects(s.saveOptions(14,10,{managerIds:[14],enabled:true,followUpDays:7,revision:1}),/administrator/);
 await assert.rejects(s.saveOptions(15,10,{managerIds:[11,12,13],enabled:true,followUpDays:7,revision:0}),/Refresh/);
});
test('portal checks current guardian links; tickets contain no patient details and are assigned to primary',async()=>{
 await assert.rejects(s.submit(20,input,100),/unavailable/);
 await assert.rejects(s.submit(10,{...input,patientId:202},100),/link/);
 await s.submit(10,input,100);
 [request]=await s.requests(11,10);
 assert.equal(request.data.assignedAccountId,11);
 const [[ticket]]=await pool.execute('SELECT * FROM support_tickets WHERE id=?',[request.data.supportTicketId]);
 assert.equal(ticket.claimed_by_user_id,11);
 assert.equal(ticket.agency_id,10);
 for(const value of [input.requesterName,input.patientName,input.email,input.phone,input.scope])assert.ok(!JSON.stringify(ticket).includes(value));
 const [[stored]]=await pool.execute('SELECT payload FROM auricwell_record_requests WHERE id=?',[request.id]);
 assert.ok(!stored.payload.includes(input.email));
 const mine=(await s.requests(100,10,true))[0];
 assert.equal(mine.data.supportTicketId,undefined);
 await pool.execute('UPDATE client_guardians SET access_enabled=0 WHERE guardian_user_id=100');
 assert.equal((await s.requests(100,10,true)).length,0);
 await pool.execute('UPDATE client_guardians SET access_enabled=1 WHERE guardian_user_id=100');
});
test('cross-practice, stale, and unauthorized decisions are rejected',async()=>{
 await assert.rejects(s.review(15,10,request.id,{status:'closed',revision:request.revision,response:'Close'}),/Records Manager/);
 await assert.rejects(s.review(11,20,request.id,{status:'closed'}),/Records Manager/);
 await assert.rejects(s.assign(11,10,request.id,{accountId:15}),/active Records Manager/);
 await assert.rejects(s.review(11,10,request.id,{status:'approved',authorityConfirmed:true,response:'Approved',revision:0}),/Refresh/);
 await assert.rejects(s.review(11,10,request.id,{status:'approved',response:'Approve',revision:request.revision}),/authority/);
});
test('backup rotation, overdue reminders, and concurrent sync retain one support ticket',async()=>{
 await pool.execute('UPDATE users SET is_active=0 WHERE id=11');
 await s.sync(request.id);
 let record=(await s.requests(12,10))[0];assert.equal(record.data.assignedAccountId,12);
 await pool.execute('UPDATE users SET is_active=0 WHERE id=12');
 await s.sync(request.id);
 record=(await s.requests(13,10))[0];assert.equal(record.data.assignedAccountId,13);
 await pool.execute("UPDATE auricwell_record_requests SET follow_up_at='2020-01-01' WHERE id=?",[request.id]);
 await pool.execute("UPDATE support_tickets SET status='closed' WHERE id=?",[record.data.supportTicketId]);
 await Promise.all([s.sync(request.id),s.sync(request.id)]);
 const [[ticket]]=await pool.execute('SELECT * FROM support_tickets WHERE id=?',[record.data.supportTicketId]);assert.equal(ticket.status,'open');assert.equal(ticket.priority,'high');
 const [[count]]=await pool.execute('SELECT COUNT(*) n FROM support_tickets WHERE question LIKE ?',[`%request=${request.id}%`]);assert.equal(count.n,1);
 const [[before]]=await pool.execute('SELECT last_reminded_at FROM auricwell_record_requests WHERE id=?',[request.id]);await s.sync(request.id);const [[after]]=await pool.execute('SELECT last_reminded_at FROM auricwell_record_requests WHERE id=?',[request.id]);assert.equal(String(before.last_reminded_at),String(after.last_reminded_at));
});
test('public requests cannot skip identity checks; failures in tickets preserve intake for retry',async()=>{
 await pool.execute('RENAME TABLE support_tickets TO held_support_tickets');
 try{const receipt=await s.submit(10,input);assert.deepEqual(Object.keys(receipt),['message']);}finally{await pool.execute('RENAME TABLE held_support_tickets TO support_tickets');}
 await s.runFollowUpTick();
 const row=(await s.requests(13,10)).find(r=>r.data.source==='website');assert.ok(row.data.supportTicketId);assert.equal(row.data.status,'pending_verification');
 await assert.rejects(s.review(13,10,row.id,{status:'approved',revision:row.revision,response:'Skip',authorityConfirmed:true}),/not available/);
 await s.review(13,10,row.id,{status:'pending_review',revision:row.revision,response:'Verified',identityConfirmed:true,identityMethod:'on_file_callback'});
 const current=(await s.requests(13,10)).find(r=>r.id===row.id);
 await s.review(13,10,row.id,{status:'closed',revision:current.revision,response:'Requester withdrew request'});
 assert.equal((await pool.execute('SELECT status FROM support_tickets WHERE id=?',[row.data.supportTicketId]))[0][0].status,'closed');
});
