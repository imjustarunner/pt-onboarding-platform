import pool from '../../config/database.js';
import { billingError } from '../familyBillingPolicy.service.js';
import { requireBillingStaff,transaction } from './policy.js';
import { requireReadySender } from './senders.js';
import { receiptFor,renderReceiptPdf } from './views.js';

async function authorize(actorUserId,agencyId){
  const [[actor]]=await pool.execute('SELECT id,role FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[actorUserId]);
  if(!actor)throw billingError(403,'Active billing staff access is required.');
  await requireBillingStaff(actor,agencyId);
}
/** Rebuild private attachments from the encrypted payment record. Generic email
 * approval keeps only its HTML body, so its retry must not send a bare receipt. */
export async function receiptRetryAttachments({communication,actorUserId,senderIdentityId}){
  const agencyId=Number(communication.agency_id);
  await authorize(actorUserId,agencyId);
  const [[event]]=await pool.execute(`SELECT d.payment_id,p.payer_user_id,u.email FROM family_receipt_deliveries d
    JOIN family_ledger_payments p ON p.id=d.payment_id AND p.agency_id=d.agency_id JOIN users u ON u.id=p.payer_user_id
    WHERE d.communication_id=? AND d.agency_id=?`,[communication.id,agencyId]);
  if(!event)throw billingError(409,'The linked receipt is not ready. Refresh the communication before approving it.');
  if(Number(communication.user_id)!==Number(event.payer_user_id)||String(communication.recipient_address).trim().toLowerCase()!==String(event.email).trim().toLowerCase())throw billingError(409,'A receipt can be sent only to its original payer’s current account email.');
  const sender=await requireReadySender(agencyId,'billing');
  if(Number(sender.id)!==Number(senderIdentityId))throw billingError(409,'Use this organization’s verified billing sender for its receipt.');
  const receipt=await receiptFor({agencyId,paymentId:event.payment_id,userId:actorUserId,staff:true});
  return [{filename:`${receipt.receiptNumber}.pdf`,contentType:'application/pdf',contentBase64:(await renderReceiptPdf(receipt)).toString('base64')}];
}

/** An explicit retry is safe only before any communication was created. A
 * queued or uncertain communication must be approved/reconciled in place. */
export async function retryHeldReceipt({agencyId,deliveryId,actorUserId}){
  await authorize(actorUserId,agencyId);
  const event=await transaction(async db=>{
    const [[row]]=await db.execute('SELECT * FROM family_receipt_deliveries WHERE id=? AND agency_id=? FOR UPDATE',[deliveryId,agencyId]);
    if(!row)throw billingError(404,'Receipt delivery not found.');
    if(row.status==='sent')return row;
    if(row.communication_id||!['held','pending'].includes(row.status))throw billingError(409,'Review the existing communication or uncertain delivery before sending another copy.');
    await db.execute("UPDATE family_receipt_deliveries SET status='pending' WHERE id=?",[deliveryId]);
    return row;
  });
  if(event.status!=='sent'){
    const {sendPendingReceiptEmails}=await import('./receiptEmails.js');
    await sendPendingReceiptEmails({agencyId,paymentId:event.payment_id,deliveryId});
  }
  const [[current]]=await pool.execute('SELECT status,communication_id AS communicationId FROM family_receipt_deliveries WHERE id=? AND agency_id=?',[deliveryId,agencyId]);
  return current;
}
