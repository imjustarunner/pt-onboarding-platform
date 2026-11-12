import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { notifySchoolTicketReply } from '../schoolTicketReplyNotifications.service.js';
test.after(()=>pool.end());
function fixture({visible=true,denied=[]}={}) {
 const receipts=new Set(),notifications=[],pushes=[];
 const database={async execute(sql,args){
  if(sql.includes('FROM support_tickets t')){
   assert.deepEqual(args,[9,7,2]);assert.match(sql,/m.is_internal/);assert.match(sql,/delivery.send_status='sent'/);
   return [visible?[{id:44,author_user_id:12}]:[]];
  }
  if(sql.includes('FROM users u')){assert.match(sql,/preference.in_app_enabled=1/);return [[{id:507,role:'admin'},{id:12,role:'admin'},{id:14,role:'support'},{id:15,role:'admin'}]];}
  throw Error('Unexpected read');
 },async getConnection(){return {
   beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
   async execute(sql,args){
    if(sql.startsWith('INSERT IGNORE')){const key=args.join(':');if(receipts.has(key))return [{affectedRows:0}];receipts.add(key);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO notifications')){notifications.push(args);return [{insertId:notifications.length}];}
    if(sql.startsWith('UPDATE school_group_email_notification_receipts'))return [{affectedRows:1}];
    throw Error('Unexpected write');
   }
  };}};
 return {notifications,pushes,dependencies:{database,groupKeys:async({userId})=>userId===15?[]:['schools'],
 requireAccess:async user=>{if(denied.includes(user.id))throw Object.assign(Error('denied'),{status:404});},dispatchPush:async n=>pushes.push(n)}};
}
const input={agencyId:2,ticketId:7,ticketMessageId:9};
test('notifies school observers once, regardless of assignment, without notifying the author or nonmembers',async()=>{
 const f=fixture();
 assert.equal((await notifySchoolTicketReply(input,f.dependencies)).notificationCount,2);
 assert.deepEqual(f.notifications.map(v=>v[2]),[507,14]);
 assert.equal((await notifySchoolTicketReply(input,f.dependencies)).notificationCount,0);
 assert.equal(f.pushes.length,2);assert.equal(f.pushes[0].related_entity_id,44);
});
test('does not notify observers without conversation access or expose internal/failed/non-school mail',async()=>{
 const f=fixture({denied:[507,14]});assert.equal((await notifySchoolTicketReply(input,f.dependencies)).notificationCount,0);
 const hidden=fixture({visible:false});assert.equal((await notifySchoolTicketReply(input,hidden.dependencies)).notificationCount,0);
 assert.equal(hidden.notifications.length,0);
});
test('rejects invalid scope before database access',async()=>{
 const f=fixture();assert.equal((await notifySchoolTicketReply({...input,agencyId:'2 OR 1'},f.dependencies)).notificationCount,0);
});
