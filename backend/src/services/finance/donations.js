import pool from '../../config/database.js';
import StripePaymentsService from '../stripePayments.service.js';
import { fail, id, text, related, audit, transaction, csvCell } from './policy.js';
import { donationInput, assertDonationPayment, publicDonor, donationReceipt, donationPage, hash } from './donationPolicy.js';

async function config(db = pool) {
  const [[row]] = await db.execute(`SELECT s.*, a.is_active, f.enabled finance_enabled, f.is_demo,
    b.stripe_connect_account_id, b.stripe_connect_status,
    e.is_active sender_active, e.agency_id sender_agency_id
    FROM finance_donation_settings s JOIN agencies a ON a.id=s.agency_id
    JOIN finance_organizations f ON f.agency_id=s.agency_id
    LEFT JOIN agency_billing_accounts b ON b.agency_id=s.agency_id
    LEFT JOIN email_sender_identities e ON e.id=s.sender_identity_id
    WHERE a.slug='mh4kidz'`);
  return row;
}
const liveStripe = () => /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || '') && !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
function ready(c) {
  return !!(c?.enabled && c.is_active && c.finance_enabled && !c.is_demo && c.tax_exempt_confirmed && c.no_benefits_confirmed && /^\d{2}-\d{7}$/.test(c.ein) && c.fund_id && c.sender_active && Number(c.sender_agency_id) === Number(c.agency_id) && c.stripe_connect_account_id && c.stripe_connect_status === 'active' && liveStripe());
}
function manager(scope) { if (scope.role !== 'manager') throw fail(403, 'Finance manager access required'); }
export async function donationSettings(scope, db = pool) {
  manager(scope);
  const c = await config(db);
  if (!c || Number(c.agency_id) !== scope.agencyId) return { available:false };
  const [senders] = await db.execute('SELECT id,display_name,from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1', [scope.agencyId]);
  return { available:true, enabled:!!c.enabled, legalName:c.legal_name, ein:c.ein, taxExemptConfirmed:!!c.tax_exempt_confirmed, noBenefitsConfirmed:!!c.no_benefits_confirmed, fundId:c.fund_id, senderIdentityId:c.sender_identity_id, revision:c.revision, stripeConnected:c.stripe_connect_status === 'active', platformPaymentsReady:liveStripe(), acceptingDonations:ready(c), senders };
}
export async function saveDonationSettings(scope, input, db = pool) {
  manager(scope);
  const c = await config(db);
  if (!c || Number(c.agency_id) !== scope.agencyId) throw fail(404, 'MH4Kidz donation settings not found');
  const legalName = text(input.legalName, 200), ein = text(input.ein, 10, false);
  if (ein && !/^\d{2}-\d{7}$/.test(ein)) throw fail(400, 'Enter the EIN as XX-XXXXXXX');
  return transaction(scope, async conn => {
    const [[current]] = await conn.execute('SELECT revision FROM finance_donation_settings WHERE agency_id=? FOR UPDATE', [scope.agencyId]);
    if (current.revision !== Number(input.revision)) throw fail(409, 'Donation settings changed; refresh first');
    const fund = await related(conn, 'finance_funds', input.fundId, scope.agencyId, true);
    if (fund && fund.kind !== 'unrestricted') throw fail(400, 'Use an unrestricted fund for these general mission donations');
    const [[sender]] = input.senderIdentityId ? await conn.execute('SELECT id FROM email_sender_identities WHERE id=? AND agency_id=? AND is_active=1', [id(input.senderIdentityId), scope.agencyId]) : [[]];
    if (input.senderIdentityId && !sender) throw fail(400, 'Choose an active MH4Kidz email sender');
    if (input.enabled === true) {
      if (!ein || input.taxExemptConfirmed !== true || input.noBenefitsConfirmed !== true || !fund || !sender || !liveStripe() || c.stripe_connect_status !== 'active' || !c.stripe_connect_account_id) throw fail(409, 'Complete the EIN, tax status, fund, receipt sender, and Stripe connection before opening donations');
      const merchant = await StripePaymentsService.retrieveConnectAccount(c.stripe_connect_account_id);
      if (!merchant.charges_enabled || !merchant.payouts_enabled) throw fail(409, 'Complete Stripe payment and payout setup first');
    }
    await conn.execute('UPDATE finance_donation_settings SET enabled=?,legal_name=?,ein=?,tax_exempt_confirmed=?,no_benefits_confirmed=?,fund_id=?,sender_identity_id=?,revision=revision+1 WHERE agency_id=?', [input.enabled === true, legalName, ein, input.taxExemptConfirmed === true, input.noBenefitsConfirmed === true, fund?.id || null, sender?.id || null, scope.agencyId]);
    await audit(conn, scope, 'donation_settings_updated', 'donations', null, { enabled:input.enabled === true });
    return { saved:true };
  }, db);
}
export async function publicDonations(db = pool) {
  const c = await config(db);
  if (!c?.is_active || c.is_demo) return { acceptingDonations:false, donors:[] };
  const [rows] = await db.execute("SELECT donor_name,city,region,amount_cents,refunded_cents,public_recognition,livemode,status FROM finance_donations WHERE agency_id=? AND public_recognition=1 AND livemode=1 AND status IN ('paid','partially_refunded') ORDER BY paid_at DESC,id DESC LIMIT 50", [c.agency_id]);
  return { acceptingDonations:ready(c), donors:rows.map(publicDonor).filter(Boolean) };
}
export async function createDonationCheckout(input, db = pool) {
  const value = donationInput(input), c = await config(db);
  if (!ready(c)) throw fail(409, 'Online donations are not open yet. Please check back soon.');
  const requestHash = hash(JSON.stringify(value));
  let row;
  // Serialize configuration changes and concurrent retries against the existing finance lock.
  await transaction({ agencyId:c.agency_id }, async conn => {
    const current = await config(conn);
    if (!ready(current) || current.revision !== c.revision) throw fail(409, 'Donation settings changed; please refresh');
    const [[existing]] = await conn.execute('SELECT * FROM finance_donations WHERE agency_id=? AND request_key=?', [c.agency_id, value.requestKey]);
    if (existing) {
      if (existing.request_hash !== requestHash) throw fail(409, 'This checkout has different details. Start a new donation.');
      row = existing; return;
    }
    await related(conn, 'finance_funds', c.fund_id, c.agency_id);
    const [r] = await conn.execute(`INSERT INTO finance_donations
      (agency_id,fund_id,request_key,request_hash,receipt_token_hash,donor_name,donor_email,city,region,public_recognition,recognition_version,amount_cents,stripe_account_id,livemode,issuer_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`, [c.agency_id,c.fund_id,value.requestKey,requestHash,hash(value.receiptToken),value.name,value.email,value.city,value.region,value.publicRecognition,value.recognitionVersion,value.amountCents,c.stripe_connect_account_id,JSON.stringify({legalName:c.legal_name,ein:c.ein})]);
    const [[created]] = await conn.execute('SELECT * FROM finance_donations WHERE id=?', [r.insertId]); row = created;
  }, db);
  if (row.status !== 'pending' || Date.now() - new Date(row.created_at).getTime() > 23 * 3600000) throw fail(409, 'This checkout is complete or expired. Start a new donation.');
  const session = await StripePaymentsService.createDonationCheckout({
    amountCents:Number(row.amount_cents), email:row.donor_email, connectedAccountId:row.stripe_account_id,
    metadata:{source:'mh4kidz_donation',agency_id:String(row.agency_id),donation_id:String(row.id)},
    successUrl:`${donationPage}?checkout=success#receipt=${value.receiptToken}`,
    cancelUrl:`${donationPage}?checkout=cancelled`, idempotencyKey:`mh4kidz-donation-${row.id}`
  });
  if (!session.livemode || !session.url?.startsWith('https://checkout.stripe.com/')) throw fail(502, 'Donation checkout is unavailable');
  await db.execute('UPDATE finance_donations SET stripe_session_id=? WHERE id=? AND agency_id=?', [session.id,row.id,row.agency_id]);
  return { url:session.url };
}

// Payment accounting must continue even if a manager pauses new donations or Finance Operations.
async function donationTransaction(donationId, fn, db) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.execute('SELECT agency_id FROM finance_donations WHERE id=?', [donationId]);
    if (!r) throw fail(404, 'Donation not found');
    await conn.execute('SELECT agency_id FROM finance_organizations WHERE agency_id=? FOR UPDATE', [r.agency_id]);
    const [[row]] = await conn.execute('SELECT * FROM finance_donations WHERE id=? FOR UPDATE', [donationId]);
    const result = await fn(conn, row); await conn.commit(); return result;
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
export async function reconcileDonationPayment(pi, account, db = pool, { deliver = true, paidAt = pi.created } = {}) {
  if (pi.metadata?.source !== 'mh4kidz_donation') return false;
  const donationId = id(pi.metadata.donation_id);
  await donationTransaction(donationId, async (conn, row) => {
    assertDonationPayment(row, pi, account);
    if (row.paid_at) return;
    const receivedAt = pi.latest_charge?.created || paidAt;
    await conn.execute("UPDATE finance_donations SET stripe_payment_intent_id=?,status='paid',paid_at=FROM_UNIXTIME(?) WHERE id=?", [pi.id, receivedAt, row.id]);
    await conn.execute('INSERT INTO finance_receipts (agency_id,fund_id,amount_cents,received_date,reference) VALUES (?,?,?,DATE(FROM_UNIXTIME(?)),?)', [row.agency_id,row.fund_id,row.amount_cents,receivedAt,`Donation ${row.id}: ${pi.id}`]);
    await audit(conn, {agencyId:row.agency_id}, 'donation_paid', 'donations', row.id, {amountCents:Number(row.amount_cents)});
  }, db);
  if (deliver) await deliverDonationReceipt(donationId, db);
  return true;
}
export async function reconcileDonationRefund(refund, account, db = pool) {
  if (!account || !refund.payment_intent || refund.status !== 'succeeded') return false;
  const pi = await StripePaymentsService.retrieveDonationPaymentIntent(typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent.id, account);
  if (pi.metadata?.source !== 'mh4kidz_donation') return false;
  await reconcileDonationPayment(pi, account, db, {deliver:false});
  const donationId = id(pi.metadata.donation_id);
  await donationTransaction(donationId, async (conn, row) => {
    assertDonationPayment(row, pi, account);
    const [[existing]] = await conn.execute('SELECT donation_id FROM finance_donation_refunds WHERE stripe_refund_id=? FOR UPDATE', [refund.id]);
    if (existing) return;
    const amount = Number(refund.amount), refunded = Number(row.refunded_cents) + amount;
    if (refund.currency !== 'usd' || !Number.isSafeInteger(amount) || amount <= 0 || refunded > Number(row.amount_cents)) throw fail(409, 'Refund does not match the donation');
    await conn.execute('INSERT INTO finance_donation_refunds (stripe_refund_id,donation_id,amount_cents) VALUES (?,?,?)', [refund.id,row.id,amount]);
    await conn.execute('UPDATE finance_donations SET refunded_cents=?,status=? WHERE id=?', [refunded, refunded === Number(row.amount_cents) ? 'refunded' : 'partially_refunded',row.id]);
    await conn.execute('INSERT INTO finance_receipts (agency_id,fund_id,amount_cents,received_date,reference) VALUES (?,?,?,DATE(FROM_UNIXTIME(?)),?)', [row.agency_id,row.fund_id,-amount,refund.created,`Donation ${row.id} refund: ${refund.id}`]);
    await audit(conn, {agencyId:row.agency_id}, 'donation_refunded', 'donations', row.id, {amountCents:amount});
  }, db);
  await deliverDonationReceipt(donationId, db);
  return true;
}

export async function deliverDonationReceipt(donationId, db = pool) {
  const [[row]] = await db.execute('SELECT d.*,s.sender_identity_id FROM finance_donations d JOIN finance_donation_settings s ON s.agency_id=d.agency_id WHERE d.id=? AND d.paid_at IS NOT NULL', [donationId]);
  if (!row) return;
  await db.execute('INSERT IGNORE INTO finance_donation_receipt_deliveries (donation_id,refunded_cents) VALUES (?,?)', [row.id,row.refunded_cents]);
  const [[delivery]] = await db.execute('SELECT * FROM finance_donation_receipt_deliveries WHERE donation_id=? AND refunded_cents=?', [row.id,row.refunded_cents]);
  if (delivery.status !== 'pending') return;
  const [claim] = await db.execute("UPDATE finance_donation_receipt_deliveries SET status='sending',attempts=attempts+1 WHERE id=? AND status='pending'", [delivery.id]);
  if (!claim.affectedRows) return;
  try {
    const [[sender]] = await db.execute('SELECT id FROM email_sender_identities WHERE id=? AND agency_id=? AND is_active=1', [row.sender_identity_id,row.agency_id]);
    if (!sender) throw fail(409, 'Configure an active MH4Kidz receipt sender');
    const {sendEmailFromIdentity} = await import('../unifiedEmail/unifiedEmailSender.service.js');
    const receipt = donationReceipt(row);
    const result = await sendEmailFromIdentity({senderIdentityId:sender.id,to:row.donor_email,subject:`MH4Kidz donation acknowledgment ${receipt.number}`,text:receipt.text,html:receipt.html,templateType:'mh4kidz_donation_receipt',fromDisplayNameOverride:'MH4Kidz',existingCommunicationId:delivery.communication_id || null,internetMessageIdOverride:`<mh4kidz-donation-${delivery.id}@mh4kidz.org>`});
    const sent = !!result?.id && !result.pendingApproval && !result.skipped && !result.blocked && !result.queued && !result.redirected;
    await db.execute('UPDATE finance_donation_receipt_deliveries SET status=?,communication_id=?,last_error=? WHERE id=?', [sent?'sent':'needs_review',result?.communicationId || null,sent?null:'Email was held or not confirmed delivered; review Communications before retrying',delivery.id]);
  } catch (e) {
    // An ambiguous transport error is reviewed, never blindly resent on a webhook replay.
    await db.execute("UPDATE finance_donation_receipt_deliveries SET status='needs_review',last_error=? WHERE id=?", ['Receipt delivery needs review in Communications',delivery.id]);
  }
}
export async function donorReceipt(token, db = pool) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) throw fail(404, 'Receipt not found');
  const [[row]] = await db.execute('SELECT * FROM finance_donations WHERE receipt_token_hash=?', [hash(token)]);
  if (!row) throw fail(404, 'Receipt not found');
  if (!row.paid_at) return {status:'processing'};
  return {status:row.status,receipt:donationReceipt(row),publicRecognition:!!row.public_recognition};
}
export async function makeDonationAnonymous(token, db = pool) {
  await donorReceipt(token, db);
  await db.execute('UPDATE finance_donations SET public_recognition=0,recognition_at=NOW() WHERE receipt_token_hash=?', [hash(token)]);
  return {saved:true};
}
export async function donationRecords(scope, db = pool) {
  manager(scope);
  const [donations] = await db.execute(`SELECT d.id,d.donor_name,d.donor_email,d.city,d.region,d.public_recognition,d.amount_cents,d.refunded_cents,d.status,d.paid_at,d.created_at,
    r.status receipt_status,r.last_error FROM finance_donations d LEFT JOIN finance_donation_receipt_deliveries r ON r.donation_id=d.id AND r.refunded_cents=d.refunded_cents
    WHERE d.agency_id=? ORDER BY d.id DESC LIMIT 200`, [scope.agencyId]);
  const [[totals]] = await db.execute('SELECT COUNT(*) gifts,COALESCE(SUM(amount_cents),0) gross,COALESCE(SUM(refunded_cents),0) refunded FROM finance_donations WHERE agency_id=? AND paid_at IS NOT NULL', [scope.agencyId]);
  return {donations,totals};
}
export async function donationExport(scope, db = pool) {
  manager(scope);
  const [rows] = await db.execute('SELECT id,donor_name,donor_email,city,region,public_recognition,amount_cents,refunded_cents,status,paid_at FROM finance_donations WHERE agency_id=? AND paid_at IS NOT NULL ORDER BY paid_at,id', [scope.agencyId]);
  await audit(db, scope, 'exported', 'donations', null);
  return [['Receipt','Donor','Email','City','State / region','Recognition','Gross USD','Refunded USD','Net USD','Status','Received at'], ...rows.map(r => [`MH4K-${r.id}`,r.donor_name,r.donor_email,r.city,r.region,r.public_recognition?'Public':'Anonymous',Number(r.amount_cents)/100,Number(r.refunded_cents)/100,(Number(r.amount_cents)-Number(r.refunded_cents))/100,r.status,new Date(r.paid_at).toISOString()])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
export async function retryDonationReceipt(scope, donationId, db = pool) {
  manager(scope);
  const row = await related(db, 'finance_donations', donationId, scope.agencyId);
  if (!row.paid_at) throw fail(409, 'Payment has not been confirmed');
  // A manager reviews Communications before retrying a held/uncertain delivery.
  await db.execute("UPDATE finance_donation_receipt_deliveries SET status='pending' WHERE donation_id=? AND refunded_cents=? AND (status='needs_review' OR (status='sending' AND updated_at < NOW() - INTERVAL 10 MINUTE))", [row.id,row.refunded_cents]);
  await audit(db, scope, 'donation_receipt_retry', 'donations', row.id);
  await deliverDonationReceipt(row.id, db); return {saved:true};
}
