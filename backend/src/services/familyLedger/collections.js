import pool from '../../config/database.js';
import { billingError, auditBilling, requireResponsiblePayer } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { listBalances, renderPrivatePdf } from './views.js';
import { findReceivable } from './receivables.js';
import { assertCollectible, dateOnly, today, key, transaction, parseJson } from './policy.js';
import { requireReadySender } from './senders.js';
import { sendNotificationEmail } from '../unifiedEmail/unifiedEmailSender.service.js';
export function agingFor(row,asOf=today()){
  const installments=row.plan?.status==='active'?row.plan.installments:null;
  const entries=installments?installments.filter(i=>Number(i.balanceCents)>0).map(i=>({amountCents:Number(i.balanceCents),dueDate:dateOnly(i.dueDate)})):[{amountCents:Number(row.balanceCents),dueDate:dateOnly(row.dueDate)}];
  return entries.filter(e=>e.amountCents>0&&e.dueDate<asOf).map(e=>({...e,daysPastDue:Math.floor((Date.parse(asOf)-Date.parse(e.dueDate))/86400000)}));
}
export async function aging({agencyId,userId,payerUserId=null}){
  const rows=await listBalances({agencyId,userId,staff:true}),result=[];
  for(const row of rows){if(!row.payerUserId||(payerUserId&&Number(row.payerUserId)!==Number(payerUserId))||row.status!=='open'||row.holdReason||row.disputedAt)continue;
    try{await requireResponsiblePayer(row.payerUserId,row.clientId,agencyId);await assertCollectible(await findReceivable(agencyId,row.receivableId));}catch(e){if([403,409].includes(e.status))continue;throw e;}
    const pastDue=agingFor(row);if(pastDue.length)result.push({...row,pastDueCents:pastDue.reduce((n,e)=>n+e.amountCents,0),daysPastDue:Math.max(...pastDue.map(e=>e.daysPastDue)),pastDue});
  }return result;
}
export function portalUrl(path){const base=String(process.env.FRONTEND_URL||'').split(',')[0].trim();const url=new URL(base);if(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(url.hostname)))throw billingError(503,'Configure the secure portal URL');return new URL(path,url.origin).toString();}
const aad=row=>`collections:${row.agency_id}:${row.payer_user_id}`;
export async function draftNotice({agencyId,payerUserId,actorUserId,kind='past_due',idempotencyKey,task=null}){
  if(!['statement','reminder','past_due','payment_setup'].includes(kind))throw billingError(400,'Select a notice type');
  const requestKey=key(idempotencyKey);
  const balances=kind==='payment_setup'?[]:await aging({agencyId,userId:actorUserId,payerUserId});
  if(kind!=='payment_setup'&&!balances.length)throw billingError(409,'No eligible past-due balances for this payer');
  if(kind==='payment_setup'&&!task?.token)throw billingError(400,'Create a payment task first');
  const [users]=await pool.execute('SELECT first_name,last_name,email FROM users WHERE id=?',[payerUserId]);const [agencies]=await pool.execute('SELECT name,slug FROM agencies WHERE id=?',[agencyId]);
  if(!users[0]?.email||!agencies[0])throw billingError(409,'A portal account with a confirmed contact address is required');
  const snapshot={agencyName:agencies[0].name,payerName:[users[0].first_name,users[0].last_name].filter(Boolean).join(' '),email:users[0].email,createdAt:new Date().toISOString(),taskId:task?.taskId||null,path:kind==='payment_setup'?`/billing/complete/${task.token}`:`/${agencies[0].slug}/guardian?panel=billing`,balances:balances.map(r=>({allocationId:r.allocationId,receivableId:r.receivableId,clientId:r.clientId,amountCents:r.pastDueCents,dueDate:r.dueDate})),totalCents:balances.reduce((n,r)=>n+r.pastDueCents,0)};
  // Link remains encrypted at rest and requires the exact recipient's login.
  return transaction(async db=>{const [existing]=await db.execute('SELECT * FROM family_collections_notices WHERE agency_id=? AND idempotency_key=? FOR UPDATE',[agencyId,requestKey]);if(existing.length){if(Number(existing[0].payer_user_id)!==Number(payerUserId)||existing[0].notice_kind!==kind)throw billingError(409,'This notice reference belongs to another recipient');return {noticeId:existing[0].id};}
    const [r]=await db.execute('INSERT INTO family_collections_notices (agency_id,payer_user_id,notice_kind,snapshot_encrypted,idempotency_key,created_by_user_id) VALUES (?,?,?,?,?,?)',[agencyId,payerUserId,kind,encryptFamilyBilling(snapshot,`collections:${agencyId}:${payerUserId}`),requestKey,actorUserId]);await auditBilling({agencyId,userId:actorUserId,action:'collections_notice_drafted',objectId:r.insertId},db);return {noticeId:r.insertId};});
}
export async function notice(agencyId,id){const [rows]=await pool.execute('SELECT * FROM family_collections_notices WHERE id=? AND agency_id=?',[id,agencyId]);if(!rows.length)throw billingError(404,'Notice not found');return {...rows[0],snapshot:decryptFamilyBilling(rows[0].snapshot_encrypted,aad(rows[0]))};}
export async function listNotices(agencyId){const [rows]=await pool.execute('SELECT id,payer_user_id AS payerUserId,notice_kind AS kind,status,created_at AS createdAt,sent_at AS sentAt,last_error AS lastError FROM family_collections_notices WHERE agency_id=? ORDER BY id DESC LIMIT 100',[agencyId]);return rows;}
export async function previewNotice({agencyId,noticeId}){const row=await notice(agencyId,noticeId),s=row.snapshot;const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);const lines=[`Date: ${dateOnly(s.createdAt)}`,`To: ${s.payerName}`];if(row.notice_kind==='payment_setup')lines.push('Please sign in to your portal to verify your payment method and complete the billing authorization. Your assigned payment task will guide you through the steps.');else{lines.push(`Our records show ${money(s.totalCents)} past due for your assigned share.`,...s.balances.map(b=>`Balance reference ${b.receivableId} · Due ${dateOnly(b.dueDate)} · ${money(b.amountCents)}`),'Please sign in to view your statement, make a payment, or contact our billing team to discuss a payment plan or an error. If you recently paid, contact us so we can reconcile your account.');}return renderPrivatePdf({title:row.notice_kind==='payment_setup'?'Payment setup invitation':'Account statement',agencyName:s.agencyName,lines});}
export async function sendNotice({agencyId,noticeId,actorUserId}){
  const row=await notice(agencyId,noticeId),s=row.snapshot;
  if(row.status==='sent')return {sent:true,alreadySent:true};if(!['draft','held'].includes(row.status))throw billingError(409,'This notice is already queued or its delivery needs reconciliation');
  const [users]=await pool.execute('SELECT email FROM users WHERE id=?',[row.payer_user_id]);if(users[0]?.email!==s.email)throw billingError(409,'The recipient address changed; generate a new notice');
  if(row.notice_kind==='payment_setup'){
    const [tasks]=await pool.execute("SELECT * FROM family_billing_tasks WHERE id=? AND agency_id=? AND guardian_user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP",[s.taskId,agencyId,row.payer_user_id]);if(!tasks.length)throw billingError(409,'The payment task is no longer pending');for(const clientId of parseJson(tasks[0].client_ids_json)){const {requireBillingLink}=await import('../familyBillingPolicy.service.js');await requireBillingLink(row.payer_user_id,clientId,agencyId);}
  }else{const current=await aging({agencyId,userId:actorUserId,payerUserId:row.payer_user_id});if(s.balances.some(b=>!current.some(c=>Number(c.allocationId)===Number(b.allocationId)&&c.pastDueCents===b.amountCents)))throw billingError(409,'Balances or access changed. Generate a current notice.');}
  const sender=await requireReadySender(agencyId,row.notice_kind==='payment_setup'?'billing':'collections'),url=portalUrl(s.path);
  const [claimed]=await pool.execute("UPDATE family_collections_notices SET status='queued',sender_identity_id=?,last_error=NULL WHERE id=? AND agency_id=? AND status IN ('draft','held')",[sender.id,noticeId,agencyId]);if(!claimed.affectedRows)throw billingError(409,'This notice is already being sent');
  try{
    const setup=row.notice_kind==='payment_setup',subject=setup?'Complete your payment setup':'Your account statement is ready',text=`${s.agencyName}\n\n${setup?'Please verify your payment method and complete your billing authorization.':'Please sign in to review your account statement. You can make a payment or contact our billing team for assistance.'}\n\nSign in securely: ${url}\n\nThis link opens your portal after login.`;
    const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const html=`<div style="font-family:Arial;max-width:600px;margin:auto;padding:28px"><h2>${esc(s.agencyName)}</h2><h3>${subject}</h3><p>${setup?'Please verify your payment method and sign your billing authorization.':'Your statement is available in your secure portal. Contact our billing team if you need help or would like to discuss payment arrangements.'}</p><p><a href="${esc(url)}" style="display:inline-block;background:#164c6a;color:#fff;padding:14px 22px;border-radius:6px">${setup?'Complete payment setup':'View my statement'}</a></p><p>Sign in with the account that received this invitation.</p></div>`;
    const result=await sendNotificationEmail({agencyId,triggerKey:setup?'family_payment_setup':'family_collections',senderIdentityId:sender.id,to:s.email,subject,text,html,generatedByUserId:actorUserId,userId:row.payer_user_id,templateType:setup?'family_payment_setup':'family_collections',source:'manual'});
    const held=result.skipped||result.blocked;const queued=result.queued||result.pendingApproval;
    await pool.execute('UPDATE family_collections_notices SET status=?,email_message_id=?,sent_at=?,last_error=? WHERE id=?',[held?'held':queued?'queued':'sent',result.id||result.messageId||result.communicationId||null,!held&&!queued?new Date():null,held?String(result.reason||'Sending is held by email settings').slice(0,255):null,noticeId]);
    await auditBilling({agencyId,userId:actorUserId,action:held?'notice_held':'notice_submitted',objectId:noticeId});return result;
  }catch(e){await pool.execute("UPDATE family_collections_notices SET status='failed',last_error='Delivery is uncertain. Reconcile the message log before creating another notice.' WHERE id=?",[noticeId]);throw billingError(409,'Delivery needs reconciliation. Review the communication log before sending another notice.');}
}
