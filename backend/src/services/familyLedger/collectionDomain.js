// Pure domain rules. Callers must load authorized, transactionally consistent
// ledger rows; these constructors neither charge a payer nor post ledger entries.
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`Invalid ${name}`);
  return value;
}
const id = (value, name = 'identifier') => integer(value, name, 1);
const money = value => integer(value, 'amount in cents');
function sum(values) { return money(values.reduce((total, value) => total + money(value), 0)); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid calendar date');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) fail('An explicit timestamp with timezone is required');
  return new Date(value).toISOString();
}
function unique(rows, field) {
  if (!Array.isArray(rows) || !rows.length) fail('At least one item is required');
  if (new Set(rows.map(row => id(row[field]))).size !== rows.length) fail(`Duplicate ${field}`);
}
function sameOwner(a, b) {
  for (const field of ['agencyId', 'clientId', 'payerUserId', 'currency']) {
    if (a[field] !== b[field]) fail(`Mismatched ${field}`);
  }
}
function owner(value) {
  return { agencyId: id(value.agencyId), clientId: id(value.clientId), payerUserId: id(value.payerUserId), currency: 'USD' };
}
export function daysPastDue(dueDate, asOf) {
  return Math.max(0, (Date.parse(date(asOf)) - Date.parse(date(dueDate))) / 86400000);
}

/** One Balance groups allocations, never claim statuses or another copy of debt. */
export function createBalance({ balanceId, agencyId, clientId, payerUserId, allocations, createdAt }) {
  const scope = owner({ agencyId, clientId, payerUserId });
  unique(allocations, 'allocationId');
  const items = allocations.map(row => {
    sameOwner(scope, row);
    const amount = money(row.amountCents), paid = money(row.paidCents);
    if (paid > amount) fail('Payment exceeds assigned responsibility');
    if (amount === paid) fail('Only outstanding allocations can enter a balance');
    return { allocationId: row.allocationId, receivableId: id(row.receivableId),
      originalAmountCents: amount - paid, dueDate: date(row.dueDate) };
  });
  return { balanceId: id(balanceId), ...scope, createdAt: timestamp(createdAt),
    originalAmountCents: sum(items.map(row => row.originalAmountCents)), items };
}

/** Refresh from ledger allocations after every payment, refund or adjustment. */
export function projectBalance(balance, allocations, asOf) {
  date(asOf);
  unique(allocations, 'allocationId');
  if (allocations.length !== balance.items.length) fail('Incomplete balance ledger projection');
  const items = balance.items.map(item => {
    const row = allocations.find(a => a.allocationId === item.allocationId);
    if (!row || row.receivableId !== item.receivableId) fail('Missing balance allocation');
    sameOwner(balance, row);
    const amount = money(row.amountCents), paid = money(row.paidCents);
    if (paid > amount) fail('Payment exceeds assigned responsibility');
    const outstandingCents = amount - paid;
    // A positive balance paired with a paid/void label is a reconciliation error.
    const blocked = outstandingCents > 0 && (row.status !== 'open' || !!row.holdReason
      || !!row.disputedAt || row.paymentPlanActive === true || row.collectionVerified !== true);
    return { ...item, dueDate: date(row.dueDate), outstandingCents, blocked,
      daysPastDue: outstandingCents ? daysPastDue(row.dueDate, asOf) : 0 };
  });
  const outstandingCents = sum(items.map(row => row.outstandingCents));
  return { ...balance, items, asOf, outstandingCents,
    status: outstandingCents === 0 ? 'satisfied' : 'open',
    blocked: items.some(row => row.blocked),
    daysPastDue: Math.max(...items.map(row => row.daysPastDue)),
    pastDueCents: sum(items.filter(row => row.daysPastDue > 0).map(row => row.outstandingCents)) };
}

/** Escalation changes operational management, never A/R, payments or write-offs. */
export function createCollectionCase({ caseId, balance, managingAgencyId, agreementId,
  feeBasisPoints = 2500, eligibilityDays = 60, transferredAt, actorUserId }) {
  const transferred = timestamp(transferredAt);
  integer(feeBasisPoints, 'collection fee');
  if (feeBasisPoints > 10000) fail('Collection fee exceeds 100%');
  integer(eligibilityDays, 'eligibility days', 1);
  if (balance.asOf !== transferred.slice(0, 10)) fail('Refresh the balance before transfer');
  if (balance.blocked || !balance.outstandingCents) fail('Balance is not eligible for transfer');
  // A newer service cannot become eligible merely by sharing an older balance.
  if (balance.items.some(row => row.outstandingCents && row.daysPastDue < eligibilityDays)) fail('Every outstanding item must meet the escalation age');
  if (id(managingAgencyId) === balance.agencyId) fail('External manager must differ from originating agency');
  return { caseId: id(caseId), balanceId: balance.balanceId, ...owner(balance),
    managingAgencyId, agreementId: id(agreementId), feeBasisPoints, transferredAt: transferred,
    transferredAmountCents: balance.outstandingCents, actorUserId: id(actorUserId),
    status: 'active', items: balance.items.filter(row => row.outstandingCents > 0).map(row => ({
      allocationId: row.allocationId, receivableId: row.receivableId,
      transferredAmountCents: row.outstandingCents, dueDate: row.dueDate })) };
}

function feeFor(grossCents, basisPoints) {
  // BigInt multiplication preserves cents even for large settlement totals.
  return Number((BigInt(money(grossCents)) * BigInt(basisPoints) + 5000n) / 10000n);
}
function caseMatches(collectionCase, recovery) {
  for (const field of ['caseId', 'balanceId', 'agencyId', 'managingAgencyId', 'currency']) {
    if (collectionCase[field] !== recovery[field]) fail(`Recovery has mismatched ${field}`);
  }
}

/** A Recovery describes existing confirmed cash; it must never post cash twice. */
export function createRecovery({ recoveryId, collectionCase, payment, priorRecoveries = [] }) {
  sameOwner(collectionCase, payment);
  if (payment.status !== 'succeeded') fail('Recovery requires a confirmed payment');
  if (!collectionCase.items.some(item => item.allocationId === payment.allocationId)) fail('Payment is outside this collection case');
  const receivedAt = timestamp(payment.receivedAt);
  if (receivedAt < collectionCase.transferredAt) fail('Pre-transfer payments are not collection recoveries');
  id(payment.paymentId);
  integer(payment.amountCents, 'gross recovery', 1);
  const grossRecoveryCents = payment.amountCents;
  for (const recovery of priorRecoveries) caseMatches(collectionCase, recovery);
  if (priorRecoveries.length) unique(priorRecoveries, 'paymentId');
  const existing = priorRecoveries.find(row => row.paymentId === payment.paymentId);
  if (existing) {
    if (existing.grossRecoveryCents !== grossRecoveryCents || existing.allocationId !== payment.allocationId) fail('Payment reference was reused');
    return existing;
  }
  const priorGross = sum(priorRecoveries.map(row => row.grossRecoveryCents));
  const priorFees = sum(priorRecoveries.map(row => row.collectionFeeCents));
  if (priorFees !== feeFor(priorGross, collectionCase.feeBasisPoints)) fail('Recovery history needs reconciliation');
  // Cumulative rounding makes four one-cent payments equal one four-cent payment.
  const collectionFeeCents = feeFor(sum([priorGross, grossRecoveryCents]), collectionCase.feeBasisPoints) - priorFees;
  return { recoveryId: id(recoveryId), caseId: collectionCase.caseId, balanceId: collectionCase.balanceId,
    agencyId: collectionCase.agencyId, managingAgencyId: collectionCase.managingAgencyId,
    currency: collectionCase.currency, paymentId: payment.paymentId, allocationId: payment.allocationId,
    grossRecoveryCents, collectionFeeCents, agencyShareCents: grossRecoveryCents - collectionFeeCents,
    receivedAt };
}

/** Immutable statement items; DB uniqueness must reserve each recovery once. */
export function createSettlement({ settlementId, agencyId, managingAgencyId, periodStart, periodEnd,
  recoveries, createdAt }) {
  id(agencyId); id(managingAgencyId);
  if (agencyId === managingAgencyId) fail('Settlement parties must differ');
  date(periodStart); date(periodEnd);
  if (periodStart > periodEnd) fail('Invalid settlement period');
  unique(recoveries, 'recoveryId');
  const items = recoveries.map(row => {
    if (row.agencyId !== agencyId || row.managingAgencyId !== managingAgencyId || row.currency !== 'USD') fail('Settlement mixes organizations or currencies');
    const received = timestamp(row.receivedAt).slice(0, 10);
    if (received < periodStart || received > periodEnd) fail('Recovery is outside the settlement period');
    if (row.settlementId != null || row.reversed === true) fail('Recovery is already settled or reversed');
    if (money(row.collectionFeeCents) + money(row.agencyShareCents) !== money(row.grossRecoveryCents)) fail('Recovery distribution does not balance');
    return { recoveryId: row.recoveryId, grossRecoveryCents: row.grossRecoveryCents,
      collectionFeeCents: row.collectionFeeCents, agencyShareCents: row.agencyShareCents };
  });
  return { settlementId: id(settlementId), agencyId, managingAgencyId, currency: 'USD',
    periodStart, periodEnd, createdAt: timestamp(createdAt), status: 'draft', items,
    grossRecoveryCents: sum(items.map(row => row.grossRecoveryCents)),
    collectionFeeCents: sum(items.map(row => row.collectionFeeCents)),
    netAmountCents: sum(items.map(row => row.agencyShareCents)) };
}
