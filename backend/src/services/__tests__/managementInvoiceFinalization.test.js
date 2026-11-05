// All people, organizations and payment records in this fixture are synthetic.
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { agreementHash } from '../auricwell/agreements.js';
import { managementInvoiceExecution } from '../managementInvoiceFinalization.service.js';
import { createBusinessLifecycleService } from '../businessLifecycle.service.js';
import { emptyLifecycle } from '../businessLifecyclePolicy.js';

const reference = '11111111-1111-4111-8111-111111111111';
const proposal = () => ({ id: 7, agency_id: 7001, period_start: '2026-11-01', status: 'draft', payment_status: 'unpaid', invoice_delivery_status: 'not_sent',
  line_items_json: { businessAgreement: { contractReference: reference, requiresSignatures: true, signedOn: '', ready: false } } });
const lifecycle = () => ({ ...emptyLifecycle(), agreements: [{ status: 'active', startMonth: '2026-11', endMonth: '',
  contractReference: reference, signedOn: '2026-11-05', mode: 'a_la_carte', revenueBasis: 'Monthly collected coaching revenue',
  revenueShareBps: 0, thresholdCents: 0, services: [{ id: 'management', name: 'Management', amountCents: 18000, cadence: 'monthly', month: '' }] }] });
const document = () => {
  const data = { type: 'management_agreement', status: 'completed', body: 'Agreed business support', terms: '$300 monthly',
    effectiveDate: '2026-11-05', parties: { practice: { legalName: 'Synthetic Coaching' }, operator: { legalName: 'Synthetic Manager' } },
    signers: [{ accountId: '4002', capacity: 'Manager' }, { accountId: '4001', capacity: 'Owner' }] };
  data.contentHash = agreementHash(data);
  data.signatures = data.signers.map(signer => ({ ...signer, name: 'Synthetic signer', signedAt: '2026-11-05T20:00:00Z', contentHash: data.contentHash }));
  return data;
};
const row = (kind, id, payload) => ({ id, kind, agency_id: 7001, revision: 3,
  payload: encryptFamilyBilling(payload, `organization-agreement:7001:${kind}:${id}`) });

beforeEach(() => vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')));
afterEach(() => vi.unstubAllEnvs());

function archive(data = document(), corrupt = false) {
  const bytes = Buffer.from('%PDF-1.7 synthetic executed copy');
  const retained = { agreementId: reference, contentHash: data.contentHash, base64: bytes.toString('base64'),
    pdfHash: corrupt ? 'wrong-hash' : crypto.createHash('sha256').update(bytes).digest('hex') };
  return { execute: vi.fn(async (sql, params) => {
    expect(params).toEqual([7001, reference]);
    return [[row(sql.includes("kind='agreement_pdf'") ? 'agreement_pdf' : 'agreement', sql.includes("kind='agreement_pdf'") ? 'retained-copy-id' : reference,
      sql.includes("kind='agreement_pdf'") ? retained : data)]];
  }) };
}

describe('management proposal finalization evidence', () => {
  it('requires the exact tenant, active contract, two real signatures and intact retained copy', async () => {
    const db = archive();
    await expect(managementInvoiceExecution(proposal(), lifecycle(), '2026-11', db, { lock: true })).resolves.toMatchObject({
      documentId: reference, revision: 3, signerAccountIds: ['4002', '4001'], signedOn: '2026-11-05'
    });
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls.every(([sql]) => sql.endsWith('FOR UPDATE'))).toBe(true);
  });
  it('keeps draft, mismatched contract, and date-unconfirmed lifecycles on hold', async () => {
    for (const patch of [{ status: 'draft' }, { contractReference: 'another-document' }, { signedOn: '2026-11-04' }]) {
      const state = lifecycle(); Object.assign(state.agreements[0], patch); const db = archive();
      await expect(managementInvoiceExecution(proposal(), state, '2026-11', db)).resolves.toBeNull();
      if (patch.status || patch.contractReference) expect(db.execute).not.toHaveBeenCalled();
    }
  });
  it('keeps the invoice on hold while the second designated signer is pending', async () => {
    const data = document(); data.status = 'partially_signed'; data.signatures.pop();
    await expect(managementInvoiceExecution(proposal(), lifecycle(), '2026-11', archive(data))).resolves.toBeNull();
  });
  it('rejects changed content, missing signer evidence, and a corrupt retained PDF', async () => {
    const changed = document(); changed.terms = 'Unreviewed new amount';
    const missing = document(); missing.signatures.pop();
    for (const db of [archive(changed), archive(missing), archive(document(), true)]) {
      await expect(managementInvoiceExecution(proposal(), lifecycle(), '2026-11', db)).rejects.toMatchObject({ status: 409 });
    }
  });
});

describe('lifecycle proposal exception', () => {
  function persistence(invoice) {
    let current = { id: 'lifecycle', revision: 1, state_json: emptyLifecycle() };
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, params) => {
      if (sql.startsWith('SELECT id, organization_type')) return [[{ id: 7001, organization_type: 'life_coach' }]];
      if (sql.startsWith('SELECT * FROM business_lifecycles')) return [[current]];
      if (sql.startsWith('SELECT * FROM agency_billing_invoices')) return [[invoice]];
      if (sql.startsWith('UPDATE business_lifecycles')) { current = { ...current, state_json: JSON.parse(params[0]), revision: params[1] }; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO business_lifecycle_events')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected synthetic statement: ${sql}`);
    }) };
    return { db, service: createBusinessLifecycleService({ getConnection: async () => db }) };
  }
  it('allows the platform admin to activate signed pricing while an untouched proposal exists', async () => {
    const { service, db } = persistence(proposal());
    await expect(service.save({ agencyId: 7001 }, { revision: 1, state: lifecycle() }, { id: 4002, role: 'super_admin' })).resolves.toMatchObject({ revision: 2 });
    expect(db.commit).toHaveBeenCalledOnce();
  });
  it.each([{ line_items_json: {} }, { status: 'sent' }, { payment_status: 'paid' }])('keeps ordinary, issued, and paid invoice terms frozen (%j)', async patch => {
    const { service, db } = persistence({ ...proposal(), ...patch });
    await expect(service.save({ agencyId: 7001 }, { revision: 1, state: lifecycle() }, { id: 4002, role: 'super_admin' })).rejects.toMatchObject({ status: 409 });
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.commit).not.toHaveBeenCalled();
  });
});
