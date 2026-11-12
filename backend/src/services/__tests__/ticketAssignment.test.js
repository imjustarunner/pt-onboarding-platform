import test from 'node:test';import assert from 'node:assert/strict';
import pool from '../../config/database.js';import {isEligibleTicketAssignee,listEligibleTicketAssignees} from '../ticketAssignment.service.js';
import {itscoWebsiteRouting} from '../publicWebsiteTicketRouting.service.js';test.after(()=>pool.end());
test('only active Support, Admin and Superadmin can own tickets',()=>{
 const base={role:'admin',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,membership_active:1};
 assert.equal(isEligibleTicketAssignee(base),true);
 for(const value of [{role:'school_staff'},{role:'provider'},{role:'provider_plus'},{is_active:0},{membership_active:0},{status:'PENDING_EMPLOYEE'}])assert.equal(isEligibleTicketAssignee({...base,...value}),false);
 assert.equal(isEligibleTicketAssignee({...base,role:'provider',has_payroll_access:1}),false);
 assert.equal(isEligibleTicketAssignee({...base,role:'school_staff',has_payroll_access:1}),false);
});
test('assignee discovery keeps current agency membership and excludes school staff even if queried rows contain them',async()=>{
 const users=await listEligibleTicketAssignees(2,{execute:async(sql,args)=>{assert.deepEqual(args,[2]);assert.match(sql,/ua.is_active=1/);return [[{id:1,role:'admin',is_active:1},{id:2,role:'school_staff',is_active:1},{id:3,role:'provider_plus',is_active:1}]];}});
 assert.deepEqual(users.map(u=>u.id),[1]);
});
test('requesting a provider routes to the intake team rather than giving the provider a ticket',()=>{
 assert.equal(itscoWebsiteRouting('provider').firstName,'Rachel');assert.equal(itscoWebsiteRouting('provider_waitlist').firstName,'Rachel');
});
test('assignment and the assigning person are committed atomically, with rollback if the audit write fails',async()=>{
 const {setTicketAssignment}=await import('../ticketAssignment.service.js');
 for(const auditFails of [false,true]){
  const events=[];const db={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release(){},execute:async sql=>{
   if(sql.startsWith('SELECT'))return [[{id:1,agency_id:2,claimed_by_user_id:null}]];
   if(sql.includes('INSERT INTO user_activity_log')&&auditFails)throw Error('Audit unavailable');events.push(sql);return [{affectedRows:1}];}};
  const call=()=>setTicketAssignment({ticketId:1,agencyId:2,actorUserId:5,assigneeUserId:8},{getConnection:async()=>db});
  if(auditFails){await assert.rejects(call());assert.equal(events.includes('commit'),false);assert.equal(events.includes('rollback'),true);}else{await call();assert.equal(events.includes('commit'),true);}
 }
});
