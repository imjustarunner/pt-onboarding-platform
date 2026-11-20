import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {recordSchoolGroupEmail,recordSentSchoolGroupEmail,packetNotificationSubject,findDirectSchoolGroup,recordDirectSchoolGroupEmail,schoolGroupPersonalAddresses} from '../schoolGroupEmailInbox.service.js';
import {resolveNotificationTypePreference} from '../notificationPreferences.service.js';
test.after(()=>pool.end());
const input={agencyId:2,to:['bradley@itsco.health'],cc:['support@itsco.health'],fromEmail:'schools@itsco.health',subject:'Example School - Paper Enrollment Packet Uploaded',messageId:'<packet@app.test>',bodyText:'A packet has been uploaded.',receivedAt:'2026-11-10T15:00:00Z'};
function fixture(){
 const notifications=[],copies=[],pushes=[],keys=new Set();
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
  assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);
  if(sql.startsWith('INSERT IGNORE')){const k=args.join(':');if(keys.has(k))return [{affectedRows:0}];keys.add(k);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO notifications')){notifications.push(args);return [{insertId:100+notifications.length}];}
  return [{affectedRows:1}];
 }};
 const db={getConnection:async()=>conn,execute:async(sql,args)=>{
  assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);
  if(sql.includes('FROM school_profiles'))return [[{school_organization_id:77,itsco_email:'bradley@itsco.health',name:'Example School'}]];
  if(sql.includes('FROM email_sender_identities'))return [[{id:12,from_email:'schools@itsco.health'}]];
  if(sql.includes('FROM communication_inboxes'))return [[{id:12}]];
  if(sql.includes('FROM users'))return [[{id:1},{id:2}]];
  return [{affectedRows:1}];
 }};
 const deps={database:db,groupKeys:async({userId})=>userId===1?['schools']:[],persistEmail:async value=>{copies.push(value);return {messageId:20,conversationId:30};},dispatchPush:async value=>pushes.push(value)};
 return {deps,notifications,copies,pushes};
}
test('real receipt mail is stored as group email without tickets, draft generation, or resend',async()=>{
 const f=fixture();const result=await recordSchoolGroupEmail(input,f.deps);
 assert.equal(result.handled,true);assert.equal(result.notificationCount,0);assert.equal(f.copies[0].standalone,true);assert.equal(f.copies[0].isGroupEmail,true);assert.equal(f.copies[0].inboxId,12);assert.equal(f.copies[0].suppressPush,true);assert.equal(f.notifications.length,0);assert.equal(f.pushes.length,0);
 assert.equal((await recordSchoolGroupEmail(input,f.deps)).notificationCount,0);assert.equal(f.pushes.length,0);
});
test('restoring a previously sent receipt preserves its date and suppresses old device/browser alerts',async()=>{
 const f=fixture();await recordSchoolGroupEmail({...input,historical:true},f.deps);assert.equal(f.copies[0].suppressPush,true);assert.equal(f.copies[0].receivedAt.toISOString(),new Date(input.receivedAt).toISOString());assert.equal(f.pushes.length,0);
});
test('a human reply to a confirmation keeps normal ticket handling',async()=>{
 const f=fixture();assert.equal(packetNotificationSubject('Re: '+input.subject),false);assert.equal((await recordSchoolGroupEmail({...input,subject:'Re: '+input.subject},f.deps)).handled,false);assert.equal(f.copies.length,0);
});
test('a packet email from an unknown sender or another school cannot be promoted into Schools',async()=>{
 for(const target of ['sender','school']){const f=fixture(),execute=f.deps.database.execute;f.deps.database.execute=async(sql,args)=>sql.includes(target==='sender'?'FROM email_sender_identities':'FROM school_profiles')?[[]]:execute(sql,args);assert.equal((await recordSchoolGroupEmail(input,f.deps)).handled,false);assert.equal(f.copies.length,0);}
});
test('an unsent, queued, redirected or unverified transport never creates received email',async()=>{
 for(const result of [{queued:true},{id:'test',redirected:true},{id:'test'},{}]){const f=fixture();assert.equal((await recordSentSchoolGroupEmail({...input,result},f.deps)).handled,false);assert.equal(f.copies.length,0);}
});
test('school-email alerts default on for support, can be muted, and cannot send another email or text',()=>{
 const context={userRole:'support',globalPreferences:{},legacyCategories:{},typePreferences:new Map()};
 const on=resolveNotificationTypePreference('school_group_email_received',context);assert.equal(on.effective.inApp,true);assert.equal(on.capabilities.email,false);assert.equal(on.capabilities.sms,false);assert.equal(on.locked,false);
 context.typePreferences.set('school_group_email_received',{inApp:false});assert.equal(resolveNotificationTypePreference('school_group_email_received',context).effective.inApp,false);
});

test('other automatic school-group notifications remain email and do not require packet wording',async()=>{
 const f=fixture();const result=await recordSchoolGroupEmail({...input,automated:true,subject:'Example School - Clinician assigned'},f.deps);
 assert.equal(result.handled,true);assert.equal(f.copies[0].autoReplyKind,'school_group_notification');assert.equal(f.notifications.length,0);
});


test('matches an explicit school recipient only when the affiliation and school are unambiguous', async () => {
  const matched = { school_organization_id: 77, school_name: 'Sample School', itsco_email: 'team@example.test' };
  const database = { execute: async (sql, args) => {
    if (sql.includes('SELECT DISTINCT affiliation.agency_id')) {
      assert.deepEqual(args, ['team@example.test']);
      return [[{ agency_id: 2 }]];
    }
    if (sql.includes('SELECT DISTINCT a.id')) return [[matched]];
    return [[]];
  }};
  const school = await findDirectSchoolGroup(['Team@example.test'], [], database);
  assert.deepEqual(school, { agencyId: 2, schoolOrganizationId: 77, schoolName: 'Sample School', mailboxAddress: 'team@example.test' });
  assert.deepEqual(schoolGroupPersonalAddresses({
    to: ['team@example.test'], cc: ['direct@example.test'], deliveryAddresses: ['relay@other.example.test'], school
  }), ['direct@example.test']);
  database.execute = async () => [[{ agency_id: 2 }, { agency_id: 3 }]];
  assert.equal(await findDirectSchoolGroup(['team@example.test'], [], database), null);
});

test('files school correspondence in the school reply inbox with its original recipient and school context', async () => {
  const school = { agencyId: 2, schoolOrganizationId: 77, schoolName: 'Sample School' };
  let saved;
  await recordDirectSchoolGroupEmail({ ...input, school, threadId: 'thread-10' }, {
    inboxes: {
      ensureFromSenderIdentities: async () => {},
      listForAgency: async () => [
        { id: 11, kind: 'personal', identity_key: 'personal_9', owner_user_id: 9 },
        { id: 12, kind: 'shared', identity_key: 'schools' }, { id: 13, kind: 'shared', identity_key: 'schoolreply' }
      ]
    },
    prepareAttachments: async () => [],
    readHtml: async () => '<p>School correspondence</p>',
    persistEmail: async email => { saved = email; return { ingested: true }; }
  });
  assert.equal(saved.inboxId, 13);
  assert.equal(saved.agencyId, 2);
  assert.equal(saved.threadId, 'school:77:thread-10');
  assert.equal(saved.isGroupEmail, true);
  assert.deepEqual(saved.verifiedSchoolGroup, school);
  assert.deepEqual(saved.to, [{ email: 'bradley@itsco.health' }]);
});
