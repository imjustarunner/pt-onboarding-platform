import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalance, projectBalance, createCollectionCase, createRecovery, createSettlement, daysPastDue } from '../familyLedger/collectionDomain.js';

const now = '2026-09-25T15:00:00.000Z';
const scope = { agencyId: 1, clientId: 10, payerUserId: 20, currency: 'USD' };
const allocations = [1, 2].map(allocationId => ({ ...scope, allocationId, receivableId: allocationId + 100,
  amountCents: 5000, paidCents: 0, dueDate: '2026-07-01', status: 'open', collectionVerified: true }));
const balance = () => createBalance({ balanceId: 1, ...scope, allocations, createdAt: now });
const projected = rows => projectBalance(balance(), rows || allocations, '2026-09-25');
const transfer = b => createCollectionCase({ caseId: 1, balance: b || projected(), managingAgencyId: 2, agreementId: 1, transferredAt: now, actorUserId: 99 });
const payment = (paymentId, amountCents, extra = {}) => ({ ...scope, paymentId, allocationId: 1, amountCents, status: 'succeeded', receivedAt: '2026-09-26T00:00:00Z', ...extra });

test('two copays share one balance and case without mutating source debt or claim statuses', () => {
  const before = structuredClone(allocations), b = projected(), c = transfer(b);
  assert.equal(b.outstandingCents, 10000); assert.equal(c.transferredAmountCents, 10000);
  assert.equal(c.feeBasisPoints, 2500); assert.equal(c.items.length, 2);
  assert.deepEqual(allocations, before); assert.equal(b.status, 'open');
  assert.equal('claimStatus' in c, false);
});
test('current amounts reflect partial payments, adjustments and refunds while transfer snapshot persists', () => {
  const c = transfer(), rows = structuredClone(allocations);
  rows[0].paidCents = 4000;
  assert.equal(projected(rows).outstandingCents, 6000);
  rows[1].amountCents = 3000;
  assert.equal(projected(rows).outstandingCents, 4000);
  rows[0].paidCents = 3000;
  assert.equal(projected(rows).outstandingCents, 5000);
  assert.equal(c.transferredAmountCents, 10000);
});
test('grouping rejects duplicate, mixed payer, client, tenant or currency allocations', () => {
  for (const changed of [{ agencyId: 2 }, { clientId: 11 }, { payerUserId: 21 }, { currency: 'EUR' }, { allocationId: 1 }]) {
    assert.throws(() => createBalance({ balanceId: 1, ...scope, createdAt: now, allocations: [allocations[0], { ...allocations[1], ...changed }] }));
  }
  assert.throws(() => projected([allocations[0]]));
  assert.throws(() => projected([{ ...allocations[0], payerUserId: 99 }, allocations[1]]));
});
test('60-day eligibility is per item and blocks holds, disputes, plans and unverified debt', () => {
  assert.equal(daysPastDue('2026-07-27', '2026-09-25'), 60);
  for (const changed of [{ dueDate: '2026-07-28' }, { holdReason: 'review' }, { disputedAt: now }, { paymentPlanActive: true }, { collectionVerified: false }, { status: 'void' }]) {
    assert.throws(() => transfer(projected([allocations[0], { ...allocations[1], ...changed }])));
  }
  const b = projected(allocations.map(a => ({ ...a, dueDate: '2026-07-27' })));
  assert.equal(transfer(b).transferredAmountCents, 10000);
  assert.throws(() => transfer({ ...b, asOf: '2026-09-24' }));
  assert.throws(() => daysPastDue('2026-02-30', '2026-09-25'));
});
test('fees apply only to confirmed actual recovery; retries preserve the original recovery', () => {
  const c = transfer();
  const first = createRecovery({ recoveryId: 1, collectionCase: c, payment: payment(1, 4000) });
  assert.equal(first.collectionFeeCents, 1000); assert.equal(first.agencyShareCents, 3000);
  const second = createRecovery({ recoveryId: 2, collectionCase: c, payment: payment(2, 6000, { allocationId: 2 }), priorRecoveries: [first] });
  assert.equal(second.collectionFeeCents, 1500); assert.equal(second.agencyShareCents, 4500);
  assert.deepEqual(createRecovery({ recoveryId: 999, collectionCase: c, payment: payment(1, 4000), priorRecoveries: [first, second] }), first);
  for (const changed of [{ status: 'pending' }, { receivedAt: '2026-09-24T00:00:00Z' }, { agencyId: 2 }, { allocationId: 90 }, { amountCents: 0 }]) {
    assert.throws(() => createRecovery({ recoveryId: 3, collectionCase: c, payment: payment(3, 100, changed) }));
  }
});
test('cumulative rounding preserves the agreed fee across tiny partial recoveries', () => {
  const c = transfer(), recoveries = [];
  for (let n = 1; n <= 100; n++) recoveries.push(createRecovery({ recoveryId: n, collectionCase: c, payment: payment(n, 1), priorRecoveries: recoveries }));
  assert.equal(recoveries.reduce((n,r) => n + r.collectionFeeCents,0), 25);
  assert.equal(recoveries.reduce((n,r) => n + r.agencyShareCents,0), 75);
});
test('settlement preserves gross, fee and net; rejects duplicate or mixed-party recovery', () => {
  const recovery = createRecovery({ recoveryId: 1, collectionCase: transfer(), payment: payment(1, 4000) });
  const input = { settlementId: 1, agencyId: 1, managingAgencyId: 2, periodStart: '2026-09-01', periodEnd: '2026-09-30', createdAt: now, recoveries: [recovery] };
  const result = createSettlement(input);
  assert.equal(result.netAmountCents, 3000); assert.equal(result.status, 'draft');
  assert.equal(recovery.settlementId, undefined);
  for (const changed of [{ agencyId: 3 }, { managingAgencyId: 3 }, { currency: 'EUR' }, { settlementId: 5 }, { reversed: true }, { agencyShareCents: 1 }, { receivedAt: '2026-08-30T00:00:00Z' }]) {
    assert.throws(() => createSettlement({ ...input, recoveries: [{ ...recovery, ...changed }] }));
  }
  assert.throws(() => createSettlement({ ...input, recoveries: [recovery, recovery] }));
});
