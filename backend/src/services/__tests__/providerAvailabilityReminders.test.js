import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderAvailabilityReminders} from '../providerAvailabilityReminders.service.js';
test('missing slots create one assigned task and notification per format, then resolve when openings appear',async()=>{
 const rows=new Map();let creations=0,notifications=0,available=false;const statuses=[],viewerUpdates=[];
 const pool={getConnection:async()=>({query:async sql=>[[{acquired:1}]],release(){}}),execute:async(sql,args)=>{
 if(sql.startsWith('SELECT requested_start_at'))return [[]];
 if(sql.startsWith('INSERT IGNORE')){if(!rows.has(args[2]))rows.set(args[2],{id:rows.size+1,format:args[2],is_missing:0});return [{}];}
 if(sql.startsWith('SELECT * FROM provider_availability'))return [[rows.get(args[2])]];
 if(sql.startsWith('SELECT id FROM tasks')||sql.startsWith('SELECT id FROM notifications'))return [[]];
 if(sql.startsWith('UPDATE provider_availability')){const row=[...rows.values()].find(r=>r.id===args.at(-1));row.is_missing=sql.includes('is_missing=1')?1:0;if(row.is_missing){row.task_id=args[0];row.notification_id=args[1];}return [{}];}
 throw Error(sql);
 }};
 const h=createProviderAvailabilityReminders({pool,User:{findById:async()=>({provider_accepting_new_clients:1})},Profile:{getForProvider:async()=>({details:{inPersonEnabled:true,virtualEnabled:false}})},Task:{create:async data=>{creations++;assert.equal(data.assignedToUserId,9);assert.equal(data.sourceRefType,'provider_availability');return{id:11,status:'pending'};},findById:async()=>({id:11,status:'pending'}),updateStatus:async(id,status)=>statuses.push(status)},Notification:{create:async data=>{notifications++;assert.equal(data.userId,9);return{id:21};},setViewerState:async(id,user,data)=>{viewerUpdates.push(data);return true;}},Availability:{computeWeekAvailability:async()=>({inPersonSlots:available?[{startAt:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+90000000).toISOString()}]:[],virtualSlots:[]})}});
 await h.checkProviderAvailability(9,2);await h.checkProviderAvailability(9,2);
 assert.equal(creations,1);assert.equal(notifications,1);assert.equal(viewerUpdates.length,0,'repeated checks preserve a user snooze');
 available=true;await h.checkProviderAvailability(9,2);assert.deepEqual(statuses,['completed']);assert.equal(viewerUpdates[0].dismissed,true);assert.equal(rows.get('IN_PERSON').is_missing,0);
});

test('closing participation or global availability hides stale reminders while the scheduled task cleanup runs',async()=>{
 for(const user of [{sees_clients:0,provider_accepting_new_clients:1},{sees_clients:1,provider_accepting_new_clients:0}]) {
  const h=createProviderAvailabilityReminders({pool:{execute:async()=>[[{is_missing:1,format:'IN_PERSON'}]]},User:{findById:async()=>user},Profile:{getForProvider:async()=>({})}});
  assert.deepEqual((await h.readProviderAvailabilitySettings(9,2)).reminders,[]);
 }
});
