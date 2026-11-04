import pool from '../../config/database.js';
import { receiptFor, renderReceiptPdf } from './views.js';
import { paymentCreditState } from './copayCredits.js';
import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { requireReadySender } from './senders.js';
import { isGuardianTestAccountId } from '../guardianTestAccess.service.js';
import { escapePortalHtml as e } from '../portalEmailBranding.service.js';

import { COPAY_CANCELLATION_NOTICE } from './receiptEmailPolicy.js';
export { COPAY_CANCELLATION_NOTICE } from './receiptEmailPolicy.js';
export function receiptLinks(context,{agencyId,paymentId}) {
  const url=context.url(`billing/receipts/${paymentId}?agencyId=${agencyId}`);
  const refundUrl=new URL(url);refundUrl.searchParams.set('action','refund');
  return {url,refundUrl:refundUrl.toString()};
}
export function buildReceiptEmail({receipt,kind='payment',url,refundUrl,credit}) {
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:receipt.currency||'USD'}).format(Number(value)/100);
  const copay=receipt.responsibilityType==='Copay';
  const heading=kind==='refund'?'Your refund is confirmed':kind==='credit_available'?'Your canceled-session copay is available as credit':kind==='credit_applied'?'Your copay credit has been applied':'Payment received';
  const status=kind==='refund'?`Refunded to date: ${money(receipt.refundedCents)}.`:kind==='credit_available'||kind==='credit_applied'?`Available credit: ${money(credit?.availableCents||0)}. Applied to later visits: ${money(credit?.appliedCents||0)}.${credit?.refundRequested?' Your refund request is under review; the related credit is on hold.':''}`:`Amount received: ${money(receipt.amountCents)}.`;
  const details=[`${receipt.agencyName} · Receipt ${receipt.receiptNumber}`,`Payment date: ${String(receipt.receivedAt).slice(0,10)}`,status,receipt.method?`Payment method: ${receipt.method}`:null].filter(Boolean);
  const intro='Your receipt is attached as a PDF and summarized below. Sign in to view the current payment, refund and credit history.';
  const action=kind==='payment'?'View your payment and receipt':'View your payment, refund and credit history';
  const notice=copay?`\n\n${COPAY_CANCELLATION_NOTICE}\n\nRequest a refund for this payment:\n${refundUrl}`:'';
  const linkedNotice=e(COPAY_CANCELLATION_NOTICE).replace('issue a refund at your request',`<a href="${e(refundUrl)}">issue a refund at your request</a>`);
  return {subject:`${receipt.agencyName}: ${heading.toLowerCase()} · ${receipt.receiptNumber}`,
    text:`${heading}\n\n${intro}\n\n${details.join('\n')}\n\n${action}:\n${url}${notice}\n\nThis receipt records a payment. It is not a new bill. A refund request requires billing review; opening the link does not issue a refund.`,
    html:`<h1 style="font-size:25px;color:#163e70;margin:0 0 12px">${e(heading)}</h1><p>${e(intro)}</p><table role="presentation" width="100%" style="border:1px solid #dce4ed;border-radius:8px;background:#f6f9fc"><tr><td style="padding:18px;line-height:1.8">${details.map(e).join('<br>')}</td></tr></table><p style="margin:24px 0"><a href="${e(url)}" style="background:#16457c;color:#fff;display:inline-block;padding:13px 20px;border-radius:7px;text-decoration:none">${e(action)}</a></p>${copay?`<h2 style="font-size:18px">If your session did not occur</h2><p>${linkedNotice}</p>`:''}<p style="font-size:12px;color:#627187">This receipt records a payment. It is not a new bill. A refund request requires billing review; opening the link does not issue a refund.</p>`,linkUrl:url};
}

/** One durable event per settlement. A crash or ambiguous transport response
 * stays visible for review instead of automatically sending another copy. */
export async function sendPendingReceiptEmails({agencyId=null,paymentId=null}={}) {
  await pool.execute("UPDATE family_receipt_deliveries d JOIN user_communications c ON c.id=d.communication_id SET d.status='sent',d.sent_at=c.sent_at WHERE d.status IN ('held','sending','unknown') AND c.delivery_status='sent'");
  const args=[];let filter='';
  if(agencyId){filter+=' AND d.agency_id=?';args.push(agencyId);}
  if(paymentId){filter+=' AND d.payment_id=?';args.push(paymentId);}
  const [events]=await pool.execute(`SELECT d.* FROM family_receipt_deliveries d WHERE d.status='pending'${filter} ORDER BY d.id LIMIT 50`,args);
  const results=[];
  for(const event of events){
    const db=await pool.getConnection();let locked=false,claimed=false;
    try{
      const [[lock]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[`family-receipt:${event.id}`]);
      locked=Number(lock.acquired)===1;if(!locked)continue;
      const [[current]]=await db.execute('SELECT status FROM family_receipt_deliveries WHERE id=?',[event.id]);
      if(current.status!=='pending')continue;
      const [[payment]]=await db.execute(`SELECT p.*,r.client_id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id WHERE p.id=? AND p.agency_id=? AND p.status='succeeded'`,[event.payment_id,event.agency_id]);
      if(!payment)throw new Error('Receipt payment unavailable');
      if(await isGuardianTestAccountId(payment.payer_user_id))continue;
      await requireReadySender(event.agency_id,'billing');
      const [[user]]=await db.execute('SELECT email FROM users WHERE id=? AND is_active=1',[payment.payer_user_id]);
      if(!user?.email)throw new Error('Receipt recipient unavailable');
      // A receipt is delivered only to the original payer, including after an
      // account relationship changes. It is never copied to other guardians.
      const receipt=await receiptFor({agencyId:event.agency_id,paymentId:payment.id,userId:payment.payer_user_id});
      const context=await clientEmailContext({agencyId:event.agency_id,clientId:payment.client_id});
      const credit=await paymentCreditState(payment.id);
      const links=receiptLinks(context,{agencyId:event.agency_id,paymentId:payment.id});
      const pdf=await renderReceiptPdf({...receipt,portalBrand:context.brand.clinical?'AuricWell':context.brand.displayName});
      const [updated]=await db.execute("UPDATE family_receipt_deliveries SET status='sending' WHERE id=? AND status='pending'",[event.id]);
      if(!updated.affectedRows)continue;claimed=true;
      const result=await sendClientPortalEmail({agencyId:event.agency_id,clientId:payment.client_id,context,billing:true,to:user.email,userId:payment.payer_user_id,
        ...buildReceiptEmail({receipt,kind:event.kind,...links,credit}),attachments:[{filename:`${receipt.receiptNumber}.pdf`,contentBase64:pdf.toString('base64'),contentType:'application/pdf'}],
        templateType:'family_payment_receipt',source:'family_payment_receipt'});
      const sent=!!result?.id&&!result.queued&&!result.pendingApproval&&!result.skipped&&!result.blocked&&!result.redirected;
      await db.execute('UPDATE family_receipt_deliveries SET status=?,communication_id=?,sent_at=IF(?=1,CURRENT_TIMESTAMP,NULL) WHERE id=?',[sent?'sent':'held',result?.communicationId||null,sent?1:0,event.id]);
      results.push({agencyId:event.agency_id,paymentId:payment.id,status:sent?'sent':'held'});
    }catch(error){
      await db.execute('UPDATE family_receipt_deliveries SET status=? WHERE id=?',[claimed?'unknown':'held',event.id]);
      results.push({agencyId:event.agency_id,paymentId:event.payment_id,status:claimed?'unknown':'held'});
    }finally{
      if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`family-receipt:${event.id}`]);
      db.release();
    }
  }
  return results;
}
