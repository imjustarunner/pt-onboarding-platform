import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import pool from '../../config/database.js';
import { billingError, requireResponsiblePayer, linkAllowsBilling, auditBilling } from '../familyBillingPolicy.service.js';
import { decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { parseJson, today } from './policy.js';

export async function listBalances({agencyId,userId,clientId=null,staff=false,overdueOnly=false}) {
  const args=[agencyId];
  let filter='';
  if(clientId){filter+=' AND r.client_id=?';args.push(clientId);}
  if(!staff){filter+=` AND (a.payer_user_id=? OR EXISTS(SELECT 1 FROM family_statement_shares s WHERE s.agency_id=r.agency_id AND s.client_id=r.client_id AND s.guardian_user_id=? AND s.active=1)) AND EXISTS(SELECT 1 FROM client_guardians cg WHERE cg.client_id=r.client_id AND cg.guardian_user_id=? AND cg.access_enabled=1)`;args.push(userId,userId,userId);}
  if(overdueOnly)filter+=" AND r.status='open' AND r.due_date<CURRENT_DATE AND r.disputed_at IS NULL AND r.hold_reason IS NULL AND a.amount_cents>a.paid_cents";
  const [rows]=await pool.execute(`SELECT r.id AS receivableId,r.client_id AS clientId,r.source_type AS sourceType,r.source_key AS sourceKey,r.service_domain AS serviceDomain,r.service_date AS serviceDate,r.amount_cents AS totalCents,r.due_date AS dueDate,r.currency,r.status,j.status AS fulfillmentStatus,j.last_error AS fulfillmentError,r.hold_reason AS holdReason,r.disputed_at AS disputedAt,a.id AS allocationId,a.payer_user_id AS payerUserId,a.amount_cents AS amountCents,a.paid_cents AS paidCents,u.first_name AS payerFirst,u.last_name AS payerLast FROM family_receivables r JOIN family_receivable_allocations a ON a.receivable_id=r.id LEFT JOIN users u ON u.id=a.payer_user_id LEFT JOIN family_fulfillment_jobs j ON j.receivable_id=r.id WHERE r.agency_id=?${filter} ORDER BY r.due_date,r.id,a.id LIMIT 500`,args);
  const allowed=new Map();
  const result=[];
  for(const row of rows){
    if(!staff){
      if(!allowed.has(row.clientId)) {try{await requireResponsiblePayer(userId,row.clientId,agencyId);allowed.set(row.clientId,true);}catch(e){if(e.status!==403)throw e;allowed.set(row.clientId,false);}}
      if(!allowed.get(row.clientId))continue;
    }
    const value={...row,payerName:[row.payerFirst,row.payerLast].filter(Boolean).join(' '),balanceCents:Number(row.amountCents)-Number(row.paidCents),canPay:!staff&&Number(row.payerUserId)===Number(userId)&&row.status==='open'&&!row.holdReason&&!row.disputedAt};
    delete value.payerFirst;delete value.payerLast;
    if(!staff){if(value.fulfillmentError)value.fulfillmentError='Your payment is recorded. The office is reviewing service activation.';delete value.sourceKey;delete value.sourceType;delete value.serviceDate;value.serviceDomain=['clinical','mental_health','unknown'].includes(value.serviceDomain)?'Services':value.serviceDomain;}
    const [plans]=await pool.execute("SELECT id,status,amount_cents AS amountCents,paid_before_cents AS paidBeforeCents,auto_pay AS autoPay FROM family_payment_plans WHERE allocation_id=? AND status IN ('proposed','active') ORDER BY id DESC LIMIT 1",[row.allocationId]);
    if(plans.length){value.plan=plans[0];const [installments]=await pool.execute('SELECT id,sequence_number AS sequenceNumber,amount_cents AS amountCents,due_date AS dueDate FROM family_plan_installments WHERE plan_id=? ORDER BY sequence_number',[value.plan.id]);let paid=Math.max(0,Number(row.paidCents)-Number(value.plan.paidBeforeCents));value.plan.installments=installments.map(i=>{const applied=Math.min(Number(i.amountCents),paid);paid-=applied;return {...i,paidCents:applied,balanceCents:Number(i.amountCents)-applied};});}
    result.push(value);
  }
  return result;
}
export async function receiptFor({agencyId,paymentId,userId,staff=false}) {
  const [rows]=await pool.execute(`SELECT p.*,r.client_id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id WHERE p.id=? AND p.agency_id=? AND p.status='succeeded'`,[paymentId,agencyId]);
  if(!rows.length)throw billingError(404,'Receipt not found');
  const row=rows[0];let self=false;
  if(!staff){
    const [links]=await pool.execute('SELECT * FROM client_guardians WHERE client_id=? AND guardian_user_id=? AND access_enabled=1',[row.client_id,userId]);
    const link=links[0];const permissions=parseJson(link?.permissions_json,{});
    self=!!link&&link.relationship_type==='self'&&!permissions.noView&&!permissions.noViewOtherGuardian;
    if(!self){await requireResponsiblePayer(userId,row.client_id,agencyId);if(Number(row.payer_user_id)!==Number(userId)){const [shared]=await pool.execute('SELECT 1 FROM family_statement_shares WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND active=1',[agencyId,row.client_id,userId]);if(!shared.length)throw billingError(403,'Receipt is private to its payer');}}
  }
  const receipt=decryptFamilyBilling(row.receipt_encrypted,`receipt:${agencyId}:${row.payer_user_id}`);
  if(!staff&&Number(row.payer_user_id)!==Number(userId))delete receipt.method;
  const [refunds]=await pool.execute("SELECT id,amount_cents AS amountCents,completed_at AS completedAt FROM family_payment_refunds WHERE payment_id=? AND status='succeeded' ORDER BY id",[row.id]);
  receipt.refunds=refunds;receipt.refundedCents=refunds.reduce((n,r)=>n+Number(r.amountCents),0);receipt.netPaidCents=Number(receipt.amountCents)-receipt.refundedCents;
  await auditBilling({agencyId,clientId:row.client_id,userId,action:'receipt_viewed',objectId:row.id});
  return receipt;
}
export async function listReceipts({agencyId,userId,staff=false,clientId=null}) {
  const args=[agencyId];let filter='';if(clientId){filter+=' AND r.client_id=?';args.push(clientId);}
  if(!staff){filter+=' AND (p.payer_user_id=? OR EXISTS(SELECT 1 FROM family_statement_shares s WHERE s.agency_id=r.agency_id AND s.client_id=r.client_id AND s.guardian_user_id=? AND s.active=1) OR EXISTS(SELECT 1 FROM client_guardians cg WHERE cg.client_id=r.client_id AND cg.guardian_user_id=? AND cg.relationship_type=\'self\' AND cg.access_enabled=1))';args.push(userId,userId,userId);}
  const [rows]=await pool.execute(`SELECT p.id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id WHERE p.agency_id=? AND p.status='succeeded'${filter} ORDER BY p.received_at DESC LIMIT 100`,args);
  const result=[];for(const row of rows){try{result.push({paymentId:row.id,...await receiptFor({agencyId,paymentId:row.id,userId,staff})});}catch(e){if(e.status!==403)throw e;}}
  return result;
}
const printable = value => String(value??'').replace(/[^\x20-\x7E\n]/g,'?');
export async function renderPrivatePdf({title,agencyName,lines}) {
  const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page=pdf.addPage([612,792]),y=742;
  const draw=(text,size=11,font=regular)=>{const words=printable(text).split(/\s+/);let line='';for(const word of words){if(font.widthOfTextAtSize(`${line} ${word}`,size)>504&&line){if(y<55){page=pdf.addPage([612,792]);y=742;}page.drawText(line,{x:54,y,size,font,color:rgb(.1,.15,.2)});y-=18;line=word;}else line=line?`${line} ${word}`:word;}if(y<55){page=pdf.addPage([612,792]);y=742;}page.drawText(line,{x:54,y,size,font,color:rgb(.1,.15,.2)});y-=22;};
  draw(agencyName,16,bold);draw(title,20,bold);y-=12;for(const line of lines)draw(line);
  return Buffer.from(await pdf.save());
}
export async function renderReceiptPdf(receipt){const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:receipt.currency||'USD'}).format(Number(v)/100);return renderPrivatePdf({title:'Payment receipt',agencyName:receipt.agencyName,lines:[`Receipt: ${receipt.receiptNumber}`,`Received: ${String(receipt.receivedAt).slice(0,10)}`,`Responsible payer: ${receipt.payerName}`,`Service: ${receipt.service}`,`Amount received: ${money(receipt.amountCents)}`,...(receipt.method?[`Payment method: ${receipt.method}`]:[]),...(receipt.refundedCents?[`Refunded: ${money(receipt.refundedCents)}`,`Net paid: ${money(receipt.netPaidCents)}`]:[]),'This receipt confirms a recorded payment. It does not disclose clinical records.']});}
