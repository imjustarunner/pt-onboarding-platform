import pool from '../config/database.js';
import { assertFamilyBenefit, requireHousehold, familyHash } from './familyAuth.service.js';
import { familyError, json } from './familyPolicy.js';
import { getFamilyPocket, getFamilyDeliveryIdentity, getFamilyEmailRecipients, sendFamilyEmailReply } from './familyEmail.service.js';
import { familySummaryText } from './familyEmailPolicy.js';
import { getGmailClient } from './unifiedEmail/gmailClient.js';

export const FAMILY_DELIVERY_SECTIONS=['grocery','shopping','chore','upcoming'];
export function normalizeFamilyDelivery(body={}) {
  const to=typeof body.to==='string'?body.to.trim().toLowerCase():'';
  // One mailbox only. Reject display-name syntax, address lists and header injection.
  if(to.length>254||!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(to)||to.endsWith('.invalid'))throw familyError('Enter one valid family email address.');
  if(!Array.isArray(body.sections)||!body.sections.length||body.sections.some(s=>!FAMILY_DELIVERY_SECTIONS.includes(s)))throw familyError('Choose at least one list or upcoming plans.');
  if(typeof body.requestId!=='string'||!/^[a-z0-9-]{16,80}$/i.test(body.requestId))throw familyError('Refresh this page before sending.');
  return {to,sections:FAMILY_DELIVERY_SECTIONS.filter(s=>body.sections.includes(s)),requestId:body.requestId};
}
async function findSentMessage({identity,requestHash}) {
  const gmail=await getGmailClient();
  const messageId=`family-${requestHash}@${identity.from_email.split('@')[1]}`;
  const {data}=await gmail.users.messages.list({userId:'me',q:`in:sent rfc822msgid:${messageId}`,maxResults:1});
  return data.messages?.[0]?.id || null;
}

export async function sendFamilyPocketEmail(session,id,body,{send=sendFamilyEmailReply,findSent=findSentMessage}={}) {
  const {to,sections,requestId}=normalizeFamilyDelivery(body);
  await assertFamilyBenefit(session.userId,session.agencyId);
  const household=await requireHousehold(session,id);
  const recipients=await getFamilyEmailRecipients(id);
  if(household.role!=='parent'&&!recipients.some(r=>r.email.toLowerCase()===to))throw familyError('A parent can send to another family email address.',403);
  const identity=await getFamilyDeliveryIdentity(session.agencyId);
  if(!identity)throw familyError('Your organization’s family email sender is not configured yet.',503);
  const hash=familyHash(`family-push:${session.agencyId}:${session.userId}:${id}:${requestId}`);
  const payloadHash=familyHash(JSON.stringify({to,sections}));
  const db=await pool.getConnection(),lock=`family-email-${session.userId}`;
  let locked=false;
  try {
    const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);
    if(!Number(locks[0]?.acquired))throw familyError('Another email is sending. Please try again in a moment.',409);
    locked=true;
    const [rows]=await db.execute('SELECT * FROM family_email_requests WHERE request_hash=?',[hash]);
    const old=rows[0];
    if(old&&json(old.result_json).payloadHash!==payloadHash)throw familyError('This send request has different selections. Start a new email.',409);
    if(old?.replied_at)return {sent:true,to,sections,duplicate:true};
    if(old?.applied_at){
      // A lost HTTP response is not permission to send a second copy. Reconcile using Message-ID.
      const found=await findSent({identity,requestHash:hash});
      if(!found)throw familyError('Delivery is not confirmed yet. Check your inbox, then use Check delivery. We will not send a second copy automatically.',409);
      await db.execute('UPDATE family_email_requests SET replied_at=NOW() WHERE request_hash=?',[hash]);
      return {sent:true,to,sections,duplicate:true};
    }
    const [counts]=await db.execute('SELECT COUNT(*) count FROM family_email_requests WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)',[session.userId]);
    if(Number(counts[0]?.count)>=20)throw familyError('You’ve sent 20 family emails this hour. Please try again later.',429);
    const summary=await getFamilyPocket(session,id,db);
    const selected={...summary,sections:summary.sections.filter(s=>sections.includes(s.key))};
    const text=familySummaryText(selected)+(summary.truncated?'\nThere are more entries in the dashboard.':'');
    await db.execute('INSERT INTO family_email_requests(request_hash,user_id,agency_id,household_id,result_json,applied_at) VALUES (?,?,?,?,?,NOW())',[hash,session.userId,session.agencyId,id,JSON.stringify({payloadHash})]);
    try {
      await send({identity,to,text,householdId:id,requestHash:hash,actorUserId:session.userId,automaticReply:false,subject:`[Family #${id}] ${selected.sections.length===1?selected.sections[0].title:'Family summary'}`});
    } catch(e) {
      // Definite pre-send rejections can be safely retried; transport errors may have reached Gmail.
      const status=Number(e.status || e.response?.status || e.code);
      if((status>=400&&status<500&&status!==408)||e.deliveryStarted===false)await db.execute('DELETE FROM family_email_requests WHERE request_hash=? AND replied_at IS NULL',[hash]);
      throw familyError(status>=400&&status<500?e.message:'Email delivery could not be confirmed. Check your inbox, then use Check delivery.',status>=400&&status<500?status:503);
    }
    await db.execute('UPDATE family_email_requests SET replied_at=NOW() WHERE request_hash=?',[hash]);
    return {sent:true,to,sections};
  } finally {
    if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});
    db.release();
  }
}
