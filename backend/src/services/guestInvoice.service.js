import crypto from 'node:crypto';
import pool from '../config/database.js';
import Stripe, { getStripePublishableKey } from './stripePayments.service.js';
import { billingError, requireResponsiblePayer, auditBilling } from './familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { requireLiveGuardianBilling } from './guardianTestAccess.service.js';
import { transaction, cents, allocationDue, assertCollectible, requireBillingStaff } from './familyLedger/policy.js';
import { lockAllocation, finalizePayment } from './familyLedger/payments.js';
import { findReceivable } from './familyLedger/receivables.js';
import { claimProcessorDispatch } from './familyLedger/paymentDispatch.js';
import { portalUrl } from './familyLedger/collections.js';
import { sendClientPortalEmail } from './clientPortalEmail.service.js';
import { requireClientAccountSupport } from './clientAccountSupportAccess.service.js';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const tokenHash = token => {
  if (!tokenPattern.test(String(token || ''))) throw billingError(404, 'This payment link is unavailable.');
  return crypto.createHash('sha256').update(token).digest('hex');
};
const snapshotContext = row => `ledger-payment:${row.agency_id}:${row.allocation_id}`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function guestInvoiceEmail({ agencyName, amountCents, currency, url, locale = 'en' }) {
  const spanish = locale === 'es';
  const amount = new Intl.NumberFormat(spanish ? 'es-US' : 'en-US', {style:'currency',currency}).format(amountCents / 100);
  const subject = spanish ? `${agencyName}: solicitud de pago` : `${agencyName}: payment request`;
  const text = spanish
    ? `Tiene una solicitud de pago de ${amount} de ${agencyName}.\n\nPagar de forma segura:\n${url}\n\nEste enlace permite un pago único. No da acceso a expedientes, servicios ni a la cuenta del cliente. No necesita una cuenta. El enlace vence en 7 días.`
    : `You have a payment request for ${amount} from ${agencyName}.\n\nPay securely:\n${url}\n\nThis link allows a one-time payment. It does not provide access to records, services or the client's account. No account is required. The link expires in 7 days.`;
  return { subject, text, html: `<p>${escape(text).replace(/\n/g,'<br>')}</p>`, linkUrl: url };
}

/** Guest links grant one payment capability, never an application identity. */
export function createGuestInvoiceService(overrides = {}) {
  const deps = { database:pool, transaction, stripe:Stripe, publishableKey:getStripePublishableKey,
    responsible:requireResponsiblePayer, live:requireLiveGuardianBilling, collectible:assertCollectible,
    lock:lockAllocation, findReceivable, dispatch:claimProcessorDispatch, finalize:finalizePayment,
    audit:auditBilling, encrypt:encryptFamilyBilling, decrypt:decryptFamilyBilling, url:portalUrl,
    send:sendClientPortalEmail, staffAccess:async(actor,agencyId,clientId,db)=>{
      try {await requireClientAccountSupport(actor,clientId,agencyId);}
      catch(error){if(error.status!==403)throw error;await requireBillingStaff(actor,agencyId,db);}
    }, party:async(agencyId,clientId,db)=>{
      const [[row]]=await db.execute('SELECT party_kind,contact_encrypted,revision FROM client_billing_responsibility_profiles WHERE agency_id=? AND client_id=?',[agencyId,clientId]);
      return row?{kind:row.party_kind,revision:Number(row.revision),contact:decryptFamilyBilling(row.contact_encrypted,`billing-responsibility:${agencyId}:${clientId}`)}:null;
    }, now:()=>new Date(), randomToken:()=>crypto.randomBytes(32).toString('base64url'), ...overrides };

  async function lookup(token, db = deps.database, locked = false) {
    const [rows] = await db.execute(`SELECT g.*,a.payer_user_id AS allocation_payer_user_id,a.amount_cents AS allocation_amount_cents,a.paid_cents,
      r.client_id,r.currency AS receivable_currency,ag.name AS agency_name
      FROM family_guest_invoices g JOIN family_receivable_allocations a ON a.id=g.allocation_id AND a.agency_id=g.agency_id
      JOIN family_receivables r ON r.id=a.receivable_id AND r.agency_id=g.agency_id JOIN agencies ag ON ag.id=g.agency_id
      WHERE g.token_hash=?${locked ? ' FOR UPDATE' : ''}`, [tokenHash(token)]);
    if (!rows[0]) throw billingError(404,'This payment link is unavailable.');
    return rows[0];
  }
  async function authorize(row, db = deps.database, { allowExpired = false } = {}) {
    if (row.revoked_at || (!allowExpired && +new Date(row.expires_at) <= +deps.now())) throw billingError(410,'This payment link has expired or was canceled.');
    if (!Number(row.payer_user_id) || Number(row.payer_user_id) !== Number(row.allocation_payer_user_id) || String(row.currency).toLowerCase() !== String(row.receivable_currency).toLowerCase()) throw billingError(409,'The payment responsibility changed. Ask for a new payment link.');
    await deps.live(row.payer_user_id);
    await deps.responsible(row.payer_user_id,row.client_id,row.agency_id,db);
    if(row.issuer_kind==='staff'){
      const [[issuer]]=await db.execute("SELECT id,role FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0 AND UPPER(COALESCE(status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','TERMINATED_PENDING','SUSPENDED','DISABLED')",[row.issued_by_user_id]);
      if(!issuer)throw billingError(403,'The invoice issuer no longer has access.');
      await deps.staffAccess(issuer,row.agency_id,row.client_id,db);
    }else if(Number(row.issued_by_user_id)!==Number(row.payer_user_id))throw billingError(403,'The payment request issuer changed.');
    if(row.responsible_party_revision!=null){const party=await deps.party(row.agency_id,row.client_id,db);if(party?.kind!=='other'||Number(party.revision)!==Number(row.responsible_party_revision))throw billingError(409,'The responsible billing contact changed. Ask for a new invoice.');}
  }
  const currentAmount = row => Math.min(Number(row.amount_cents), Math.max(0, Number(row.allocation_amount_cents) - Number(row.paid_cents)));
  const publicContext = (row, amount, paid = false) => ({agencyName:row.agency_name,amountCents:paid ? 0 : amount,currency:row.currency,locale:row.locale,paid});
  function link(token,locale='en') { const url=new URL(deps.url('/billing/guest'));url.hash=token;if(locale==='es')url.searchParams.set('lang','es');return url.toString(); }

  async function create({ agencyId, userId, actorRole = null, allocationId, amountCents = null, locale = 'en', externalResponsible = false }) {
    const token = deps.randomToken();
    const result = await deps.transaction(async db => {
      const {receivable,allocation} = await deps.lock(agencyId,allocationId,db);
      if(!Number(allocation.payer_user_id))throw billingError(409,'Billing must assign this balance to an accountable payer before sending a guest invoice.');
      const staffIssuer=Number(allocation.payer_user_id)!==Number(userId);
      if(staffIssuer)await deps.staffAccess({id:userId,role:actorRole},agencyId,receivable.client_id,db);
      await deps.live(allocation.payer_user_id);
      await deps.responsible(allocation.payer_user_id,receivable.client_id,agencyId,db);
      const party=externalResponsible?await deps.party(agencyId,receivable.client_id,db):null;
      if(externalResponsible&&(!party||party.kind!=='other'||!emailPattern.test(String(party.contact?.email||''))))throw billingError(409,'Select and complete the external responsible billing party first.');
      await deps.collectible(receivable,db);
      const amount = cents(amountCents ?? allocationDue(allocation));
      if (amount > allocationDue(allocation)) throw billingError(409,'The amount exceeds the current unpaid balance.');
      const expires = new Date(+deps.now() + 7 * 86400000);
      const [saved] = await db.execute('INSERT INTO family_guest_invoices (agency_id,allocation_id,issued_by_user_id,payer_user_id,issuer_kind,responsible_party_revision,token_hash,amount_cents,currency,locale,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [agencyId,allocationId,userId,allocation.payer_user_id,staffIssuer?'staff':'payer',party?.revision??null,tokenHash(token),amount,receivable.currency,locale==='es'?'es':'en',expires]);
      await deps.audit({agencyId,userId,clientId:receivable.client_id,action:'guest_invoice_created',objectId:saved.insertId},db);
      return {id:saved.insertId,amountCents:amount,currency:receivable.currency,expiresAt:expires.toISOString(),...(party?{recipientEmail:party.contact.email,recipientName:party.contact.fullName}: {})};
    });
    return {...result,token,url:link(token,locale)};
  }

  async function context(token) {
    const row = await lookup(token);await authorize(row);
    if (row.payment_id) {
      const [[payment]] = await deps.database.execute('SELECT status FROM family_ledger_payments WHERE id=? AND agency_id=?',[row.payment_id,row.agency_id]);
      if (payment?.status === 'succeeded') return publicContext(row,0,true);
    }
    const amount=currentAmount(row);
    if (!amount) return publicContext(row,0,true);
    const [[allocation]] = await deps.database.execute('SELECT receivable_id FROM family_receivable_allocations WHERE id=? AND agency_id=?',[row.allocation_id,row.agency_id]);
    if (!allocation) throw billingError(404,'This payment link is unavailable.');
    await deps.collectible(await deps.findReceivable(row.agency_id,allocation.receivable_id),deps.database);
    return publicContext(row,amount);
  }

  async function intent(token, { expectedAmountCents, consentAccepted, ip, userAgent } = {}) {
    if (consentAccepted !== true) throw billingError(400,'Authorize this one-time payment before continuing.');
    const expected=cents(expectedAmountCents);
    if (!deps.publishableKey()) throw billingError(503,'Secure card payment is not configured.');
    const initial=await lookup(token);
    const attempt=await deps.transaction(async db=>{
      const {receivable,allocation}=await deps.lock(initial.agency_id,initial.allocation_id,db);
      const row=await lookup(token,db,true);await authorize(row,db);
      if (Number(allocation.payer_user_id)!==Number(row.payer_user_id)) throw billingError(409,'The payment responsibility changed.');
      if (row.payment_id) {
        const [[previous]]=await db.execute('SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=? FOR UPDATE',[row.payment_id,row.agency_id]);
        if (!previous) throw billingError(409,'This payment needs billing review.');
        if (previous.status==='succeeded') return {...previous,guestInvoiceId:row.id};
        if (['failed','cancelled'].includes(previous.status)) throw billingError(409,'Ask for a new payment link before retrying.');
        await deps.collectible(receivable,db);
        if (Number(previous.amount_cents)!==expected || currentAmount(row)!==Number(previous.amount_cents) || Number(previous.amount_cents)>allocationDue(allocation)) throw billingError(409,'The balance changed while a payment was pending. Billing must cancel or reconcile that payment before retrying.');
        return {...previous,guestInvoiceId:row.id};
      }
      await deps.collectible(receivable,db);
      const amount=currentAmount(row);
      if (!amount || expected!==amount || amount>allocationDue(allocation)) throw billingError(409,'The amount changed. Refresh this payment request.');
      const [pending]=await db.execute("SELECT id FROM family_ledger_payments WHERE allocation_id=? AND status IN ('pending','requires_action','unknown') LIMIT 1 FOR UPDATE",[row.allocation_id]);
      if(pending.length)throw billingError(409,'Another payment is in progress. Refresh after it is resolved.');
      const [[merchant]]=await db.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id=? AND stripe_connect_status='active'",[row.agency_id]);
      if(!merchant?.stripe_connect_account_id)throw billingError(503,'Secure payment is not available for this organization.');
      const snapshot={accountId:merchant.stripe_connect_account_id,amountCents:amount,requestedAmountCents:amount,currency:String(row.currency).toLowerCase(),guestInvoiceId:row.id,brand:'Guest card',
        guestAuthorization:{acceptedAt:deps.now().toISOString(),ip:String(ip||'').slice(0,80),userAgent:String(userAgent||'').slice(0,500)}};
      const encrypted=deps.encrypt(snapshot,snapshotContext(row));
      const [saved]=await db.execute("INSERT INTO family_ledger_payments (agency_id,allocation_id,payer_user_id,processor,amount_cents,currency,idempotency_key,snapshot_encrypted,created_by_user_id) VALUES (?,?,?,'STRIPE',?,?,?,?,NULL)",[row.agency_id,row.allocation_id,allocation.payer_user_id,amount,row.currency,`guest-invoice:${row.agency_id}:${row.id}`,encrypted]);
      await db.execute('UPDATE family_guest_invoices SET payment_id=? WHERE id=? AND payment_id IS NULL',[saved.insertId,row.id]);
      await deps.audit({agencyId:row.agency_id,userId:null,clientId:row.client_id,action:'guest_payment_prepared',objectId:row.id},db);
      return {id:saved.insertId,agency_id:row.agency_id,allocation_id:row.allocation_id,amount_cents:amount,status:'pending',snapshot_encrypted:encrypted,guestInvoiceId:row.id};
    });
    if(attempt.status==='succeeded')return {paid:true};
    const current=await lookup(token);await authorize(current);
    const snapshot=deps.decrypt(attempt.snapshot_encrypted,snapshotContext(attempt));
    if(Number(snapshot.guestInvoiceId)!==Number(current.id))throw billingError(409,'Payment request binding mismatch.');
    const dispatch=await deps.dispatch({attempt,agencyId:attempt.agency_id,userId:null,allocationId:attempt.allocation_id});
    let paymentIntent;
    try {
      paymentIntent=dispatch.intentId?await deps.stripe.retrievePaymentIntent(dispatch.intentId,snapshot.accountId):await deps.stripe.createPaymentIntent({amountCents:snapshot.amountCents,currency:snapshot.currency,connectedAccountId:snapshot.accountId,
        metadata:{agency_id:String(attempt.agency_id),family_ledger_payment_id:String(attempt.id),family_guest_invoice_id:String(current.id)},idempotencyKey:`family-ledger:${attempt.agency_id}:${attempt.id}`});
    } catch {
      await deps.database.execute("UPDATE family_ledger_payments SET status='unknown' WHERE id=? AND status<>'succeeded'",[attempt.id]);
      throw billingError(409,'Payment preparation needs reconciliation. No second payment was started.');
    }
    if(Number(paymentIntent.amount)!==Number(snapshot.amountCents)||String(paymentIntent.currency).toLowerCase()!==snapshot.currency||String(paymentIntent.metadata?.family_ledger_payment_id)!==String(attempt.id)||String(paymentIntent.metadata?.family_guest_invoice_id)!==String(current.id))throw billingError(409,'The secure payment did not match this request.');
    await deps.database.execute('UPDATE family_ledger_payments SET processor_intent_id=? WHERE id=? AND agency_id=?',[paymentIntent.id,attempt.id,attempt.agency_id]);
    if(paymentIntent.status==='succeeded'){await deps.finalize(attempt.id,attempt.agency_id,paymentIntent,snapshot.accountId);return {paid:true};}
    return {paid:false,clientSecret:paymentIntent.client_secret,publishableKey:deps.publishableKey(),connectedAccountId:snapshot.accountId};
  }

  async function confirm(token) {
    const row=await lookup(token);await authorize(row,deps.database,{allowExpired:true});
    const [[payment]]=await deps.database.execute('SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=?',[row.payment_id||0,row.agency_id]);
    if(!payment?.processor_intent_id)throw billingError(409,'No payment has been started for this request.');
    const snapshot=deps.decrypt(payment.snapshot_encrypted,snapshotContext(row));
    if(Number(snapshot.guestInvoiceId)!==Number(row.id))throw billingError(409,'Payment request binding mismatch.');
    const result=await deps.stripe.retrievePaymentIntent(payment.processor_intent_id,snapshot.accountId);
    if(result.status!=='succeeded')return {paid:false};
    await deps.finalize(payment.id,row.agency_id,result,snapshot.accountId);
    return {paid:true};
  }

  async function send({token,userId,agencyId,allocationId,recipientEmail,confirmed}) {
    if(confirmed!==true)throw billingError(400,'Review the recipient and confirm sending this payment request.');
    const recipient=String(recipientEmail||'').trim().toLowerCase();
    if(recipient.length>254||!emailPattern.test(recipient))throw billingError(400,'Enter a valid recipient email.');
    const row=await lookup(token);await authorize(row);
    if(Number(row.issued_by_user_id)!==Number(userId)||Number(row.agency_id)!==Number(agencyId)||Number(row.allocation_id)!==Number(allocationId))throw billingError(403,'This payment request belongs to another payer.');
    if(!currentAmount(row))throw billingError(409,'This payment is already settled.');
    const email=guestInvoiceEmail({agencyName:row.agency_name,amountCents:currentAmount(row),currency:row.currency,url:link(token,row.locale),locale:row.locale});
    const [claimed]=await deps.database.execute("UPDATE family_guest_invoices SET delivery_status='sending',recipient_encrypted=? WHERE id=? AND delivery_status='draft'",[deps.encrypt({email:recipient},`guest-invoice-recipient:${row.agency_id}:${row.id}`),row.id]);
    if(!claimed.affectedRows)throw billingError(409,'This request has already been submitted for delivery. Review its status before creating another.');
    try {
      const result=await deps.send({agencyId:row.agency_id,billing:true,to:recipient,...email,generatedByUserId:userId,userId:null,clientId:null,templateType:'guest_payment_invoice',source:'manual'});
      const sent=!!(result?.id||result?.messageId)&&!result.queued&&!result.pendingApproval&&!result.skipped&&!result.blocked&&!result.redirected;
      await deps.database.execute('UPDATE family_guest_invoices SET delivery_status=?,communication_id=?,sent_at=IF(?=1,CURRENT_TIMESTAMP,NULL) WHERE id=?',[sent?'sent':'held',result?.communicationId||null,sent?1:0,row.id]);
      await deps.audit({agencyId:row.agency_id,userId,clientId:row.client_id,action:sent?'guest_invoice_sent':'guest_invoice_delivery_held',objectId:row.id});
      return {status:sent?'sent':'held'};
    } catch {
      await deps.database.execute("UPDATE family_guest_invoices SET delivery_status='unknown' WHERE id=?",[row.id]);
      throw billingError(409,'Delivery is uncertain. Contact billing before sending another request.');
    }
  }
  async function revoke({token,userId,agencyId,allocationId}) {
    const row=await lookup(token);await authorize(row,deps.database,{allowExpired:true});
    if(Number(row.issued_by_user_id)!==Number(userId)||Number(row.agency_id)!==Number(agencyId)||Number(row.allocation_id)!==Number(allocationId))throw billingError(403,'This payment request belongs to another payer.');
    if(row.payment_id){
      const [[payment]]=await deps.database.execute('SELECT * FROM family_ledger_payments WHERE id=? AND agency_id=?',[row.payment_id,row.agency_id]);
      if(payment?.processor_intent_id&&payment.status!=='succeeded'){
        const snapshot=deps.decrypt(payment.snapshot_encrypted,snapshotContext(row));
        const intent=await deps.stripe.retrievePaymentIntent(payment.processor_intent_id,snapshot.accountId);
        if(intent.status==='succeeded'){await deps.finalize(payment.id,row.agency_id,intent,snapshot.accountId);throw billingError(409,'This payment already completed.');}
        if(!['requires_payment_method','requires_confirmation','requires_action','canceled'].includes(intent.status))throw billingError(409,'The payment is processing. Billing must reconcile it before cancellation.');
        if(intent.status!=='canceled')await deps.stripe.cancelPaymentIntent(intent.id,snapshot.accountId);
        await deps.database.execute("UPDATE family_ledger_payments SET status='cancelled' WHERE id=? AND status<>'succeeded'",[payment.id]);
      }else if(payment&&payment.status!=='succeeded')throw billingError(409,'Payment preparation is in progress. Contact billing before cancellation.');
    }
    await deps.database.execute('UPDATE family_guest_invoices SET revoked_at=CURRENT_TIMESTAMP WHERE id=?',[row.id]);
    await deps.audit({agencyId:row.agency_id,userId,clientId:row.client_id,action:'guest_invoice_revoked',objectId:row.id});
    return {revoked:true};
  }
  async function externalPreview({agencyId,userId,actorRole,allocationId,locale='en'}) {
    return deps.transaction(async db=>{
      const {receivable,allocation}=await deps.lock(agencyId,allocationId,db);
      await deps.staffAccess({id:userId,role:actorRole},agencyId,receivable.client_id,db);
      await deps.collectible(receivable,db);
      const party=await deps.party(agencyId,receivable.client_id,db);
      if(party?.kind!=='other'||!emailPattern.test(String(party.contact?.email||'')))throw billingError(409,'Select and complete the external responsible billing party first.');
      if(!Number(allocation.payer_user_id))throw billingError(409,'Billing must assign this balance to an accountable payer before sending a guest invoice.');
      await deps.live(allocation.payer_user_id);await deps.responsible(allocation.payer_user_id,receivable.client_id,agencyId,db);
      const [[agency]]=await db.execute('SELECT name FROM agencies WHERE id=?',[agencyId]);
      const amount=cents(allocationDue(allocation));
      return {recipientEmail:party.contact.email,recipientName:party.contact.fullName,amountCents:amount,currency:receivable.currency,
        ...guestInvoiceEmail({agencyName:agency?.name||'Organization',amountCents:amount,currency:receivable.currency,url:'[Private payment link]',locale})};
    });
  }
  async function externalBalances({agencyId,userId,actorRole,clientId}) {
    await deps.staffAccess({id:userId,role:actorRole},agencyId,clientId,deps.database);
    const [rows]=await deps.database.execute(`SELECT a.id AS allocationId,a.amount_cents-a.paid_cents AS amountCents,r.currency,r.id AS receivableId
      FROM family_receivable_allocations a JOIN family_receivables r ON r.id=a.receivable_id
      WHERE a.agency_id=? AND r.agency_id=? AND r.client_id=? AND r.status='open' AND r.disputed_at IS NULL AND r.hold_reason IS NULL AND a.amount_cents>a.paid_cents
      AND NOT EXISTS(SELECT 1 FROM family_ledger_payments p WHERE p.allocation_id=a.id AND p.status IN ('pending','requires_action','unknown'))
      ORDER BY r.id,a.id LIMIT 100`,[agencyId,agencyId,clientId]);
    const balances=[];
    for(const row of rows){try{await deps.collectible(await deps.findReceivable(agencyId,row.receivableId),deps.database);balances.push({allocationId:row.allocationId,amountCents:Number(row.amountCents),currency:row.currency});}catch(error){if(error.status!==409)throw error;}}
    return {balances};
  }
  return {create,context,intent,confirm,send,revoke,externalPreview,externalBalances};
}
export default createGuestInvoiceService();
