import pool from '../../config/database.js';
import { billingError, positiveId, requireResponsiblePayer, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { requireBillingStaff, transaction, key, dateOnly, assertCollectible } from './policy.js';
import { findReceivable, allocationsFor, sourcePayload } from './receivables.js';
import { createBalance, projectBalance, createCollectionCase } from './collectionDomain.js';

export const collectionsEnabled = () => process.env.FAMILY_COLLECTIONS_ENABLED === 'true';
const context = row => `collection-case:${row.agency_id}:${row.managing_agency_id}:${row.balance_id}`;
const marks = rows => rows.map(() => '?').join(',');

export async function collectionPermissions(user, agencyId, db = pool) {
  await requireBillingStaff(user, agencyId, db);
  if (!collectionsEnabled()) return [];
  const [rows] = await db.execute('SELECT permission FROM family_collection_permissions WHERE agency_id=? AND user_id=?', [agencyId, user.id]);
  return rows.map(row => row.permission);
}
async function authorize(user, agencyId, permission, db = pool) {
  const permissions = await collectionPermissions(user, agencyId, db);
  const allowed = permission === 'view' ? permissions.some(p => ['view','escalate','manage','admin'].includes(p)) : permissions.includes(permission);
  if (!allowed) throw billingError(403, 'Collections permission is required for this organization');
  return permissions;
}

// Used by agency reminder and automatic charge paths, independently of claim status.
export async function externallyManaged(allocationId, db = pool) {
  try {
    const [rows] = await db.execute(`SELECT c.id FROM family_collection_balance_items i
      JOIN family_collection_cases c ON c.balance_id=i.balance_id WHERE i.allocation_id=? LIMIT 1`, [allocationId]);
    // Neither closing a case nor disabling new handoffs restarts agency collection.
    return rows.length > 0;
  } catch (error) {
    // Allow rolling deployment before the additive migration, only while disabled.
    if (!collectionsEnabled() && error.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

export async function handoffWorkspace({ user, agencyId }) {
  const permissions = await collectionPermissions(user, agencyId);
  if (!permissions.some(p => ['view','escalate','manage','admin'].includes(p))) return { enabled: false };
  const [agreements] = await pool.execute(`SELECT a.id,a.managing_agency_id AS managingAgencyId,
    o.name AS managingAgencyName,a.eligibility_days AS eligibilityDays,a.fee_basis_points AS feeBasisPoints
    FROM family_collection_agreements a JOIN agencies o ON o.id=a.managing_agency_id WHERE a.agency_id=? AND a.active=1`, [agencyId]);
  const [cases] = await pool.execute(`SELECT c.id,c.balance_id AS balanceId,c.agency_id AS agencyId,
    o.name AS agencyName,c.managing_agency_id AS managingAgencyId,m.name AS managingAgencyName,
    c.status,c.transferred_amount_cents AS transferredAmountCents,c.transferred_at AS transferredAt
    FROM family_collection_cases c JOIN agencies o ON o.id=c.agency_id JOIN agencies m ON m.id=c.managing_agency_id
    WHERE c.agency_id=? OR c.managing_agency_id=? ORDER BY c.id DESC LIMIT 200`, [agencyId, agencyId]);
  return { enabled: true, canEscalate: permissions.includes('escalate'), agreements, cases };
}

async function packetHistory(db, agencyId, payerUserId, allocationIds) {
  const [payments] = await db.execute(`SELECT id AS paymentId,allocation_id AS allocationId,processor,
    amount_cents AS amountCents,currency,status,receipt_number AS receiptNumber,created_at AS createdAt,received_at AS receivedAt
    FROM family_ledger_payments WHERE agency_id=? AND payer_user_id=? AND allocation_id IN (${marks(allocationIds)}) ORDER BY id`, [agencyId, payerUserId, ...allocationIds]);
  const [refunds] = await db.execute(`SELECT f.id AS refundId,f.payment_id AS paymentId,f.amount_cents AS amountCents,
    f.status,f.completed_at AS completedAt FROM family_payment_refunds f JOIN family_ledger_payments p ON p.id=f.payment_id
    WHERE p.agency_id=? AND p.payer_user_id=? AND p.allocation_id IN (${marks(allocationIds)}) ORDER BY f.id`, [agencyId, payerUserId, ...allocationIds]);
  const [notices] = await db.execute(`SELECT * FROM family_collections_notices WHERE agency_id=? AND payer_user_id=? ORDER BY id`, [agencyId, payerUserId]);
  const communications = [];
  for (const notice of notices) {
    const snapshot = decryptFamilyBilling(notice.snapshot_encrypted, `collections:${agencyId}:${payerUserId}`);
    // Payer statements can cover other clients. Never disclose their lines or body.
    const lines = (snapshot.balances || []).filter(row => allocationIds.includes(Number(row.allocationId)));
    if (lines.length) communications.push({ noticeId: notice.id, kind: notice.notice_kind, status: notice.status,
      createdAt: notice.created_at, sentAt: notice.sent_at,
      lines: lines.map(row => ({ allocationId: Number(row.allocationId), amountCents: row.amountCents, dueDate: row.dueDate })) });
  }
  return { payments, refunds, communications };
}

export async function transferToCollections({ user, agencyId, agreementId, allocationIds,
  expectedAmountCents, idempotencyKey, mailingAddress }) {
  agencyId = positiveId(agencyId); agreementId = positiveId(agreementId);
  if (!Array.isArray(allocationIds) || !allocationIds.length || allocationIds.length > 100) throw billingError(400, 'Select between one and 100 balance items');
  allocationIds = allocationIds.map(positiveId).sort((a, b) => a - b);
  if (new Set(allocationIds).size !== allocationIds.length) throw billingError(400, 'Duplicate balance item');
  const requestKey = key(idempotencyKey);
  if (typeof mailingAddress !== 'string' || !mailingAddress.trim() || mailingAddress.length > 1000) throw billingError(400, 'Confirm the responsible payer’s mailing address for the handoff');
  return transaction(async db => {
    await authorize(user, agencyId, 'escalate', db);
    // Agreement row serializes transfer retries without locking an entire tenant.
    const [[agreement]] = await db.execute('SELECT * FROM family_collection_agreements WHERE id=? AND agency_id=? FOR UPDATE', [agreementId, agencyId]);
    if (!agreement || !agreement.active) throw billingError(409, 'An active management agreement is required');
    const [[existing]] = await db.execute('SELECT * FROM family_collection_cases WHERE agency_id=? AND request_key=?', [agencyId, requestKey]);
    if (existing) {
      const old = decryptFamilyBilling(existing.transfer_snapshot_encrypted, context(existing));
      if (Number(existing.agreement_id) !== agreementId || old.allocationIds.join(',') !== allocationIds.join(',')
        || old.balance.outstandingCents !== expectedAmountCents || old.responsibleParty.mailingAddress !== mailingAddress.trim()) throw billingError(409, 'Request reference belongs to a different handoff');
      return { caseId: existing.id, alreadyTransferred: true };
    }
    const [lookup] = await db.execute(`SELECT id,receivable_id FROM family_receivable_allocations WHERE agency_id=? AND id IN (${marks(allocationIds)})`, [agencyId, ...allocationIds]);
    if (lookup.length !== allocationIds.length) throw billingError(404, 'Balance item not found in this organization');
    const receivableIds = [...new Set(lookup.map(row => Number(row.receivable_id)))].sort((a,b) => a-b);
    const rows = [], serviceItems = [];
    for (const receivableId of receivableIds) {
      // Same lock order as payment posting: receivable, then its allocations.
      const receivable = await findReceivable(agencyId, receivableId, db, true);
      const allocations = await allocationsFor(receivableId, db, true);
      await assertCollectible(receivable, db);
      const responsibility = sourcePayload(receivable);
      for (const allocation of allocations.filter(row => allocationIds.includes(Number(row.id)))) {
        await requireResponsiblePayer(allocation.payer_user_id, receivable.client_id, agencyId, db);
        if (await externallyManaged(allocation.id, db)) throw billingError(409, 'A selected item already belongs to a collection case');
        rows.push({ agencyId, clientId: Number(receivable.client_id), payerUserId: Number(allocation.payer_user_id),
          currency: receivable.currency, allocationId: Number(allocation.id), receivableId,
          amountCents: Number(allocation.amount_cents), paidCents: Number(allocation.paid_cents),
          dueDate: dateOnly(receivable.due_date), status: receivable.status, collectionVerified: true });
        serviceItems.push({ allocationId: Number(allocation.id), receivableId,
          sourceType: receivable.source_type, sourceReference: receivable.source_key,
          serviceDate: receivable.service_date ? dateOnly(receivable.service_date) : null,
          description: 'Professional Service — Patient Responsibility',
          responsibilityType: ['copay','deductible','coinsurance','patient_balance'].includes(responsibility.responsibilityType) ? responsibility.responsibilityType : 'service_balance',
          verificationBasis: ['benefit','era'].includes(responsibility.verificationBasis) ? responsibility.verificationBasis : null,
          assignedAmountCents: Number(allocation.amount_cents), paidBeforeTransferCents: Number(allocation.paid_cents) });
      }
    }
    const [pending] = await db.execute(`SELECT id FROM family_ledger_payments WHERE allocation_id IN (${marks(allocationIds)}) AND status IN ('pending','requires_action','unknown') LIMIT 1`, allocationIds);
    const [plans] = await db.execute(`SELECT id FROM family_payment_plans WHERE allocation_id IN (${marks(allocationIds)}) AND status IN ('proposed','active') LIMIT 1`, allocationIds);
    if (pending.length || plans.length) throw billingError(409, 'Resolve pending payments and payment plans before handoff');
    const now = new Date().toISOString(), first = rows[0];
    // IDs are assigned below; pure validation happens before any persistent write.
    let balance = projectBalance(createBalance({ balanceId: 1, ...first, allocations: rows, createdAt: now }), rows, now.slice(0,10));
    if (balance.outstandingCents !== expectedAmountCents) throw billingError(409, 'The amount changed; review the current balance');
    const collectionCase = createCollectionCase({ caseId: 1, balance, managingAgencyId: Number(agreement.managing_agency_id),
      agreementId, feeBasisPoints: Number(agreement.fee_basis_points), eligibilityDays: Number(agreement.eligibility_days),
      transferredAt: now, actorUserId: Number(user.id) });
    const [[payer]] = await db.execute('SELECT first_name,last_name,email,phone_number FROM users WHERE id=?', [first.payerUserId]);
    const [[client]] = await db.execute('SELECT full_name FROM clients WHERE id=? AND agency_id=?', [first.clientId, agencyId]);
    const [organizations] = await db.execute('SELECT id,name FROM agencies WHERE id IN (?,?)', [agencyId, agreement.managing_agency_id]);
    const history = await packetHistory(db, agencyId, first.payerUserId, allocationIds);
    const [inserted] = await db.execute(`INSERT INTO family_collection_balances
      (agency_id,client_id,payer_user_id,original_amount_cents,created_by_user_id) VALUES (?,?,?,?,?)`,
    [agencyId, first.clientId, first.payerUserId, balance.originalAmountCents, user.id]);
    const balanceId = inserted.insertId;
    balance = { ...balance, balanceId };
    for (const item of balance.items) await db.execute('INSERT INTO family_collection_balance_items (balance_id,allocation_id,original_amount_cents) VALUES (?,?,?)', [balanceId, item.allocationId, item.originalAmountCents]);
    const snapshot = { version: 1, allocationIds, balance, serviceItems, ...history,
      clientName: client.full_name, organizations, agreementReference: agreement.agreement_reference,
      responsibleParty: { name: [payer.first_name,payer.last_name].filter(Boolean).join(' '), email: payer.email,
        phone: payer.phone_number, mailingAddress: mailingAddress.trim(), addressConfirmedByUserId: user.id,
        addressConfirmedAt: now, communicationConsent: 'Reverify channel preferences before contacting' } };
    const [result] = await db.execute(`INSERT INTO family_collection_cases (balance_id,agreement_id,agency_id,managing_agency_id,
      fee_basis_points,transferred_amount_cents,transfer_snapshot_encrypted,request_key,transferred_by_user_id,transferred_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [balanceId, agreementId, agencyId, agreement.managing_agency_id, collectionCase.feeBasisPoints,
      balance.outstandingCents, encryptFamilyBilling(snapshot, context({ agency_id: agencyId, managing_agency_id: agreement.managing_agency_id, balance_id: balanceId })),
      requestKey, user.id, new Date(now)]);
    await auditBilling({ agencyId, clientId: first.clientId, userId: user.id, action: 'collection_case_transferred', objectId: result.insertId }, db);
    return { caseId: result.insertId, balanceId };
  });
}

export async function collectionCaseDetail({ user, agencyId, caseId }) {
  const permissions = await authorize(user, agencyId, 'view');
  const [[row]] = await pool.execute('SELECT * FROM family_collection_cases WHERE id=? AND (agency_id=? OR managing_agency_id=?)', [positiveId(caseId), agencyId, agencyId]);
  if (!row) throw billingError(404, 'Collection case not found');
  const packet = decryptFamilyBilling(row.transfer_snapshot_encrypted, context(row));
  const currentItems = [];
  for (const item of packet.balance.items) {
    const source = await findReceivable(row.agency_id, item.receivableId);
    const allocations = await allocationsFor(source.id);
    const allocation = allocations.find(a => Number(a.id) === item.allocationId);
    let issue = null;
    if (Number(allocation?.payer_user_id) !== packet.balance.payerUserId) issue = 'Payer responsibility changed; reconcile before contacting';
    else if (Number(allocation.amount_cents) > Number(allocation.paid_cents)) {
      try { await requireResponsiblePayer(allocation.payer_user_id, source.client_id, row.agency_id); await assertCollectible(source); }
      catch (e) { if (![403,409].includes(e.status)) throw e; issue = e.message; }
    }
    const [[plan]] = await pool.execute("SELECT id FROM family_payment_plans WHERE allocation_id=? AND status IN ('proposed','active') LIMIT 1", [item.allocationId]);
    if (plan) issue = 'Payment plan requires review before collection';
    currentItems.push({ allocationId: item.allocationId, dueDate: dateOnly(source.due_date),
      outstandingCents: allocation && Number(allocation.payer_user_id) === packet.balance.payerUserId ? Number(allocation.amount_cents) - Number(allocation.paid_cents) : null,
      issue });
  }
  const outstandingCents = currentItems.some(item => item.outstandingCents === null) ? null : currentItems.reduce((n,item) => n + item.outstandingCents, 0);
  const currentHistory = await packetHistory(pool, row.agency_id, packet.balance.payerUserId, packet.allocationIds);
  for (const item of currentItems) {
    if (currentHistory.payments.some(payment => Number(payment.allocationId) === item.allocationId && ['pending','requires_action','unknown'].includes(payment.status))) {
      item.issue = 'Payment confirmation is pending; reconcile before further collection';
    }
  }
  await auditBilling({ agencyId, userId: user.id, action: 'collection_case_viewed', objectId: row.id });
  return { caseId: row.id, status: row.status, agencyId: row.agency_id, managingAgencyId: row.managing_agency_id,
    transferredAt: row.transferred_at, transferredAmountCents: Number(row.transferred_amount_cents),
    feeBasisPoints: permissions.includes('financial') ? row.fee_basis_points : undefined,
    packet, currentItems, outstandingCents, currentHistory,
    collectionBlocked: row.status !== 'active' || currentItems.some(item => item.issue) || outstandingCents === 0 };
}
