import pool from '../config/database.js';
import { assertFamilyBenefit, requireHousehold, familyHash } from './familyAuth.service.js';
import { familyTransaction, saveFamilyEntry } from './family.service.js';
import { familyError, json, occurrenceKey, localDay } from './familyPolicy.js';
import { parseFamilyEmail, authenticatedFamilySender, buildFamilySummary, familySummaryText, familyEmailHtml, familyPocketUrl } from './familyEmailPolicy.js';
import { getGmailClient } from './unifiedEmail/gmailClient.js';
import { buildMimeMessage, base64UrlEncode } from './unifiedEmail/mime.js';

export async function getFamilyEmailIdentity(agencyId, db=pool) {
  const [rows]=await db.execute(`SELECT e.id,e.from_email FROM email_sender_identities e JOIN agencies a ON a.id=e.agency_id
    JOIN email_inbound_routes r ON r.sender_identity_id=e.id AND r.is_active=1 AND LOWER(r.email_address)=LOWER(e.from_email)
    WHERE e.agency_id=? AND e.identity_key='app' AND e.is_active=1
    AND JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.emailAppAssistantEnabled')) IN ('true','1') LIMIT 1`,[agencyId]);
  return rows[0] || null;
}

export async function getFamilyDeliveryIdentity(agencyId, db=pool) {
  const [rows]=await db.execute("SELECT id,from_email FROM email_sender_identities WHERE agency_id=? AND identity_key='app' AND is_active=1 LIMIT 1",[agencyId]);
  return rows[0] || null;
}
export async function getFamilyEmailRecipients(id,db=pool) {
  const [rows]=await db.execute("SELECT m.user_id,m.display_name,u.email FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.household_id=? AND u.email IS NOT NULL AND u.email NOT LIKE '%@members.invalid' ORDER BY m.display_name",[id]);
  return rows.map(r=>({userId:r.user_id,name:r.display_name,email:r.email}));
}

export async function getFamilyPocket(session, id, db=pool) {
  await assertFamilyBenefit(session.userId,session.agencyId,db);
  const household=await requireHousehold(session,id,db);
  const now=new Date(),week=occurrenceKey({metadata:{recurrence:'weekly'}},household.timezone,now);
  const [members]=await db.execute('SELECT user_id,display_name FROM family_members WHERE household_id=?',[id]);
  // No workplace/client data or photo payloads are read for the portable summary.
  const [entries]=await db.execute(`SELECT id,kind,title,member_user_id,start_at,end_at,JSON_OBJECT('recurrence',JSON_EXTRACT(metadata,'$.recurrence'),'rotation',JSON_EXTRACT(metadata,'$.rotation'),'address',JSON_EXTRACT(metadata,'$.address'),'allDay',JSON_EXTRACT(metadata,'$.allDay')) AS metadata,completed_at,created_at FROM family_entries
    WHERE household_id=? AND archived_at IS NULL AND (kind IN ('grocery','shopping','chore') OR
    (kind IN ('event','status') AND end_at>NOW() AND start_at<DATE_ADD(NOW(),INTERVAL 7 DAY))) ORDER BY start_at,id LIMIT 1501`,[id]);
  const [activity]=await db.execute(`SELECT entry_id,user_id,occurrence_key,state FROM family_activity WHERE household_id=? AND state IN ('pending','approved') AND occurrence_key IN ('once',?,?)`,[id,localDay(now,household.timezone),week]);
  const result=buildFamilySummary({household,members,entries:entries.slice(0,1500),activity},now);
  const identity=await getFamilyEmailIdentity(session.agencyId,db);
  const [users]=await db.execute('SELECT email FROM users WHERE id=?',[session.userId]);
  const [deliveryIdentity,recipients]=await Promise.all([getFamilyDeliveryIdentity(session.agencyId,db),getFamilyEmailRecipients(id,db)]);
  return {...result,truncated:entries.length>1500,emailAddress:identity?.from_email || null,accountEmail:users[0]?.email || null,sendEmailAvailable:!!deliveryIdentity,recipients};
}

export async function addFamilyPocketItems(session,id,{kind,items},dbConnection=null) {
  if(!['grocery','shopping','chore'].includes(kind)||!Array.isArray(items)||!items.length||items.length>30||items.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>200))throw familyError('Add 1–30 items, each up to 200 characters.');
  const save=async db=>{
    await assertFamilyBenefit(session.userId,session.agencyId,db);
    await requireHousehold(session,id,db,kind==='chore');
    await db.execute('SELECT id FROM family_households WHERE id=? FOR UPDATE',[id]);
    const [existing]=await db.execute(`SELECT title FROM family_entries WHERE household_id=? AND kind=? AND archived_at IS NULL AND completed_at IS NULL
      ${kind==='chore'?"AND NOT EXISTS (SELECT 1 FROM family_activity a WHERE a.entry_id=family_entries.id AND a.occurrence_key='once' AND a.state IN ('approved','pending'))":''}`,[id,kind]);
    const titles=new Set(existing.map(e=>e.title.trim().toLowerCase()));
    let added=0,skipped=0;
    for(const value of items){
      const title=value.trim();
      if(titles.has(title.toLowerCase())){skipped++;continue;}
      await saveFamilyEntry(session,id,{kind,title,memberUserId:kind==='chore'?session.userId:null,metadata:{recurrence:'none',points:0,approval:false}},null,null,db);
      titles.add(title.toLowerCase());added++;
    }
    return {added,skipped};
  };
  return dbConnection ? save(dbConnection) : familyTransaction(save);
}

// Family mail is private household content: don't put its body in workplace communication logs.
// Inbound replies use the account address; in-app sends validate the chosen recipient first. No fallback sender.
export async function sendFamilyEmailReply({identity,to,text,messageIdHeader,requestHash,householdId,subject=null,automaticReply=true,actorUserId=null}) {
  let deliveryStarted=false;
  try {
    const gmail=await getGmailClient();
    const {data:alias}=await gmail.users.settings.sendAs.get({userId:'me',sendAsEmail:identity.from_email});
    if(alias.verificationStatus!=='accepted')throw familyError('The family email mailbox is not ready to send replies.',503);
    const mime=buildMimeMessage({from:`Family Command Center <${identity.from_email}>`,replyTo:identity.from_email,to,
      subject:subject || (householdId?`[Family #${householdId}] Family summary`:'Family Command Center'),text,html:familyEmailHtml(text),
      inReplyTo:messageIdHeader,references:messageIdHeader,messageId:`<family-${requestHash}@${identity.from_email.split('@')[1]}>`});
    const { protectOutboundEmail } = await import('./activityProtection.service.js');
    await protectOutboundEmail({ to, actorUserId });
    deliveryStarted=true;
    const response=await gmail.users.messages.send({userId:'me',requestBody:{raw:base64UrlEncode(`Auto-Submitted: ${automaticReply?'auto-replied':'auto-generated'}\r\nX-Auto-Response-Suppress: All\r\n`+mime)}});
    return response.data?.id || null;
  } catch(error) {error.deliveryStarted=deliveryStarted;throw error;}
}

export async function handleFamilyEmailInbound({fromEmail,subject,bodyText,agencyId,senderIdentityId,headers=[],gmailMessageId,messageIdHeader,sendReply=sendFamilyEmailReply}) {
  const command=parseFamilyEmail(subject,bodyText);
  if(!command)return {handled:false};
  if(!gmailMessageId||!authenticatedFamilySender(headers,fromEmail))return {handled:true,ignored:true,reason:'unverified_sender'};
  const [users]=await pool.execute('SELECT id,email FROM users WHERE LOWER(email)=? LIMIT 2',[String(fromEmail).trim().toLowerCase()]);
  if(users.length!==1)return {handled:true,ignored:true,reason:'unknown_sender'};
  const user=users[0],session={userId:user.id,agencyId:Number(agencyId)};
  try{await assertFamilyBenefit(user.id,agencyId);}catch(e){if(e.status===403)return {handled:true,ignored:true,reason:'family_disabled'};throw e;}
  const identity=await getFamilyEmailIdentity(agencyId);
  if(!identity||Number(identity.id)!==Number(senderIdentityId))return {handled:true,ignored:true,reason:'mailbox_disabled'};
  const hash=familyHash(`family:${senderIdentityId}:${gmailMessageId}`);
  const db=await pool.getConnection();
  const lock=`family-email-${user.id}`;
  let locked=false;
  try{
    const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);
    if(!Number(locks[0]?.acquired))return {handled:true,retry:true};
    locked=true;
    const [old]=await db.execute('SELECT * FROM family_email_requests WHERE request_hash=?',[hash]);
    if(old[0]?.replied_at)return {handled:true,ignored:true,reason:'duplicate'};
    if(!old.length){
      const [counts]=await db.execute('SELECT COUNT(*) count FROM family_email_requests WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)',[user.id]);
      if(Number(counts[0]?.count)>=20)return {handled:true,ignored:true,reason:'rate_limited'};
    }
    const [homes]=await db.execute('SELECT h.id,h.name FROM family_households h JOIN family_members m ON m.household_id=h.id WHERE h.agency_id=? AND m.user_id=? ORDER BY h.id',[agencyId,user.id]);
    const selected=command.householdId?homes.find(h=>Number(h.id)===command.householdId):homes.length===1?homes[0]:null;
    let result=json(old[0]?.result_json,null),reply;
    if(!selected){
      reply=homes.length?`Choose your household by including its label at the start of the subject:\n${homes.map(h=>`[Family #${h.id}] ${h.name}`).join('\n')}\n\nFor example: [Family #${homes[0].id}] Grocery list`:'Create or join a household in Family Command Center first.';
    }else if(command.error){reply=command.error;}else if(command.action==='help'){
      reply='Email grocery list, to-do list, upcoming, or family summary.\n\nTo add items:\nAdd groceries: milk, eggs\nAdd shopping: dog food\nAdd to-do: book the dentist\n\nUse commas or put each item on its own line. To-dos are saved as one-time family chores assigned to you.\n\n'+familyPocketUrl(selected.id);
    }else{
      await assertFamilyBenefit(user.id,agencyId,db);
      await requireHousehold(session,selected.id,db,command.action==='add'&&command.section==='chore');
      if(!old[0]?.applied_at){
        await db.beginTransaction();
        try{
          if(!old.length)await db.execute('INSERT INTO family_email_requests(request_hash,user_id,agency_id,household_id) VALUES (?,?,?,?)',[hash,user.id,agencyId,selected.id]);
          result=command.action==='add'?await addFamilyPocketItems(session,selected.id,{kind:command.section,items:command.items},db):{};
          await db.execute('UPDATE family_email_requests SET applied_at=NOW(),result_json=? WHERE request_hash=?',[JSON.stringify(result),hash]);
          await db.commit();
        }catch(e){await db.rollback();throw e;}
      }
      const summary=await getFamilyPocket(session,selected.id,db);
      reply=[command.action==='add'?`Added ${result.added} item${result.added===1?'':'s'}${result.skipped?`; ${result.skipped} already on the list`:''}.\n`:null,familySummaryText(summary,command.section),summary.truncated?'This household has more entries; open the dashboard for the full view.':null,'','Reply with “family summary” for groceries, to-dos and upcoming plans.','To add items: Add groceries: milk, eggs'].filter(x=>x!==null).join('\n');
    }
    // Record help/clarification too, so retries don't flood a mailbox.
    await db.execute('INSERT IGNORE INTO family_email_requests(request_hash,user_id,agency_id) VALUES (?,?,?)',[hash,user.id,agencyId]);
    await sendReply({identity,to:user.email,text:reply,messageIdHeader,requestHash:hash,householdId:selected?.id});
    await db.execute('UPDATE family_email_requests SET replied_at=NOW() WHERE request_hash=?',[hash]);
    return {handled:true,replied:true};
  }catch(error){
    if([400,403,404].includes(error.status))return {handled:true,ignored:true,reason:'access_or_input_denied'};
    throw error;
  }finally{
    if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});
    db.release();
  }
}
