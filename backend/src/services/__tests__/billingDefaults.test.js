import { describe, expect, it } from 'vitest';

import { latestFeeEntries, mergeClaimModifiers, normalizeFeeMutation, resolveModifiersFromEntries } from '../../utils/feeScheduleRates.js';
import { approvedVersionBillingBlockers, clinicalClaimForReview } from '../clinicalNoteVersionBilling.service.js';
import { classifyClearinghouseRejection, suggestionForSignal } from '../billingOutcomeLearning.service.js';
import { normalizeItem } from '../remittances/normalize.js';

const modifierRow = (id, scopeKey, modifiers) => ({
  id, owner_key: 'agency:2', mode: 'insurance', record_type: 'modifier', scope_key: scopeKey, service_code: 'H0002', modifiers_json: modifiers
});
const resolve = rows => resolveModifiersFromEntries({
  agencyId: 2, serviceCode: 'H0002', payerId: 'KAISER', providerUserId: 8, credentialKey: 'hcbs_1', entries: latestFeeEntries(rows)
});

describe('modifier defaults', () => {
  it('starts H0002 at the platform starter and lets a payer replace it', () => {
    expect(resolve([]).modifiers).toEqual(['U9']);
    expect(resolve([modifierRow(1, 'payer:KAISER', ['GT'])])).toMatchObject({ modifiers: ['GT'], source: 'payer' });
  });

  it('lets a provider replace the payer and lets NONE clear an inherited modifier', () => {
    const rows = [modifierRow(1, 'payer:KAISER', ['U9']), modifierRow(2, 'provider:8:payer:KAISER', ['95'])];
    expect(resolve(rows)).toMatchObject({ modifiers: ['95'], source: 'provider' });
    expect(resolve([...rows, modifierRow(3, 'provider:8:payer:KAISER', ['NONE'])])).toMatchObject({ modifiers: [], source: 'provider', explicitNone: true });
  });

  it('applies an HCBS credential layer between the practice and the payer', () => {
    const rows = [modifierRow(1, 'practice', ['GT']), modifierRow(2, 'credential:hcbs_1', ['U9'])];
    expect(resolve(rows)).toMatchObject({ modifiers: ['U9'], source: 'credential' });
    expect(resolve([...rows, modifierRow(3, 'payer:KAISER', ['59'])])).toMatchObject({ modifiers: ['59'], source: 'payer' });
  });

  it('merges the fee-schedule modifier with the location modifier until an override replaces both', () => {
    expect(mergeClaimModifiers({ feeModifiers: ['U9'], locationModifiers: ['GT', 'U9'] })).toEqual(['U9', 'GT']);
    expect(mergeClaimModifiers({ feeModifiers: ['U9'], locationModifiers: ['GT'], overrideModifiers: ['95'] })).toEqual(['95']);
  });

  it('accepts a modifier ledger change and rejects a free-text modifier', () => {
    expect(normalizeFeeMutation({ agencyId: 2, mode: 'insurance', scope: 'practice', serviceCode: 'H0002', revision: 1, action: 'set_modifiers', modifiers: ['u9'] }).modifiers).toEqual(['U9']);
    expect(() => normalizeFeeMutation({ agencyId: 2, mode: 'insurance', scope: 'practice', serviceCode: 'H0002', revision: 1, action: 'set_modifiers', modifiers: ['telehealth'] })).toThrow(/two-character/);
  });
});

describe('place of service review', () => {
  it('compares the note with the stored visit location when the outgoing claim uses an override', () => {
    const stored = { place_of_service: '03', date_of_service: '2026-11-04', diagnosis_codes_json: ['F32.1'] };
    const outgoing = { ...stored, place_of_service: '11' };
    const claim = clinicalClaimForReview(stored, outgoing);
    const note = { clinical_version_id: 1, metadata_json: { dateOfService: '2026-11-04', serviceCode: 'H0002', diagnosisCodes: ['F32.1'], structuredChart: { placeOfService: '03' }, billingPrimaryUnits: 1 } };
    const lines = [{ procedure_code: 'H0002', units: 1, service_date: '2026-11-04' }];
    expect(approvedVersionBillingBlockers({ note, claim, lines })).not.toContain('The claim place of service differs from the latest approved clinical version.');
    expect(approvedVersionBillingBlockers({ note, claim: outgoing, lines })).toContain('The claim place of service differs from the latest approved clinical version.');
  });
});

describe('remittance adjustments', () => {
  it('records the contractual allowed amount and remark codes', () => {
    const item = normalizeItem({
      status_code: '1', ins_number: 'SYNTHETIC', pcn: '101', total_charge: '100.00', total_paid: '80.00',
      charge: [{ proc_code: 'H0002', from_dos: '20261104', units: '1', charge: '100.00', paid: '80.00', adjustment: [{ group: 'CO', code: '45', amount: '20.00' }], remark_code: 'N123' }]
    }, 0);
    expect(item.blockers).toEqual([]);
    expect(item.lines[0]).toMatchObject({ allowedCents: 8000, remarkCodes: ['N123'] });
    expect(item.lines[0].adjustments[0]).toMatchObject({ group: 'CO', code: '45', amountCents: 2000 });
  });
});

describe('rejection learning', () => {
  it('turns the November modifier and place-of-service rejections into confirmable suggestions', () => {
    expect(classifyClearinghouseRejection({ status: 'R', messages: [{ fields: 'mod1', message: 'Modifier needed' }] })).toContain('MODIFIER');
    expect(classifyClearinghouseRejection({ status: 'R', messages: [{ fields: 'place_of_service', message: 'Invalid place of service' }] })).toContain('PLACE_OF_SERVICE');
    expect(suggestionForSignal({ outcome: 'rejected', reasonCode: 'MODIFIER', serviceCode: 'H0002' })).toMatchObject({
      kind: 'modifier', prompt: 'Add a modifier to all H0002?', payload: { modifier: 'U9', serviceCode: 'H0002' }
    });
    expect(suggestionForSignal({ outcome: 'rejected', reasonCode: 'PLACE_OF_SERVICE', payerId: 'KAISER', serviceCode: 'H0002', placeOfService: '03' })).toMatchObject({
      kind: 'place_of_service', prompt: 'Send POS 11 instead of 03 for payer KAISER?', payload: { from: '03', to: '11' }
    });
  });
});
