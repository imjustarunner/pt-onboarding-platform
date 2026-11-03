import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ effective: vi.fn(), summary: vi.fn(), pending: vi.fn(), legacy: vi.fn(), original: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../clinicalNoteVersion.service.js', () => ({ getEffectiveNote: m.effective, getRevisionSummary: m.summary, hasPendingRevision: m.pending, ensureLegacyVersion: m.legacy, ensureOriginalRevision: m.original }));
vi.mock('../supervisedBillingPolicy.service.js', () => ({ parseObject: v => typeof v === 'string' ? JSON.parse(v) : v || {}, dateOnly: v => String(v || '').slice(0, 10), policyError: (status, message) => Object.assign(Error(message), { status }) }));
import { approvedVersionBillingBlockers, assertClinicalVersionSubmission, clinicalVersionBillingState, getApprovedClinicalContext, PENDING_CLINICAL_REVISION_HOLD } from '../clinicalNoteVersionBilling.service.js';

const hash = 'b'.repeat(64);
const original = { id: 4, agency_id: 2, clinical_session_id: 6, provider_signed_at: '2026-10-01', note_payload: 'Immutable original', metadata_json: { serviceCode: '90834' } };
const approved = () => ({ ...original, note_payload: 'Fully approved corrected content', clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: hash, metadata_json: { dateOfService: '2026-10-03', serviceCode: '90837', billingPrimaryUnits: 1, billingAddons: [], structuredChart: { placeOfService: '11' } }, clinical_version_encounter_context: { dateOfService: '2026-10-03', serviceCode: '90837', durationMinutes: 60, sourceTimezone: 'America/Denver', placeOfService: '11', locationLabel: 'Frozen office', renderingProviderUserId: 7 } });
beforeEach(() => {
  vi.clearAllMocks(); m.summary.mockResolvedValue({ originalRevisionId: 10, effectiveRevisionId: 12, effectiveRevision: { id: 12, contentHash: hash }, pendingRevisionId: null }); m.effective.mockResolvedValue(approved()); m.pending.mockResolvedValue(false);
});

describe('version-bound billing preflight', () => {
  it('uses the approved snapshot and encounter even when live metadata and service details changed', async () => {
    const live = { place_of_service: '02', duration_minutes: 10, service_code: 'H0004', provider_user_id: 88, metadata_json: { locationLabel: 'Changed office' } };
    const result = await getApprovedClinicalContext({ note: original, session: live });
    expect(result.note.note_payload).toBe('Fully approved corrected content');
    expect(result.session).toMatchObject({ place_of_service: '11', duration_minutes: 60, service_code: '90837', provider_user_id: 7, metadata_json: { locationLabel: 'Frozen office', serviceDate: '2026-10-03' } });
    expect(original.note_payload).toBe('Immutable original'); expect(live.place_of_service).toBe('02');
    expect(result.version).toEqual({ revisionId: 12, revisionNumber: 2, contentHash: hash });
  });
  it('blocks stale claim date, service code, units, add-ons, and location against the current approved revision', () => {
    const note = approved(), session = { place_of_service: '11' };
    const claim = { date_of_service: '2026-10-03', place_of_service: '11' }, lines = [{ procedure_code: '90837', units: 1 }];
    expect(approvedVersionBillingBlockers({ note, session, claim, lines })).toEqual([]);
    const blockers = approvedVersionBillingBlockers({ note, session, claim: { date_of_service: '2026-10-01', place_of_service: '02' }, lines: [{ procedure_code: '90834', units: 3 }] });
    expect(blockers).toEqual(expect.arrayContaining([expect.stringContaining('service date'), expect.stringContaining('service code'), expect.stringContaining('units'), expect.stringContaining('place of service'), expect.stringContaining('add-on')]));
  });
  it('preserves the previous approved revision while an amendment is pending and holds transmission', async () => {
    m.summary.mockResolvedValue({ originalRevisionId: 10, effectiveRevisionId: 12, effectiveRevision: { id: 12, contentHash: hash }, pendingRevisionId: 13 }); m.pending.mockResolvedValue(true);
    const state = await clinicalVersionBillingState({ noteId: 4, agencyId: 2 });
    expect(state).toMatchObject({ effectiveRevisionId: 12, pendingRevisionId: 13, pending: true, blockers: [PENDING_CLINICAL_REVISION_HOLD] });
    await expect(assertClinicalVersionSubmission({ noteId: 4, agencyId: 2, expectedRevisionId: 12, expectedContentHash: hash })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects stale diagnosis pointers and service-line dates after clinical approval', () => {
    const note = approved(); note.metadata_json.diagnosisCodes = ['F43.20'];
    const blockers = approvedVersionBillingBlockers({ note, claim: { date_of_service: '2026-10-03', place_of_service: '11', diagnosis_codes_json: '["F41.1"]' }, lines: [{ procedure_code: '90837', units: 1, service_date: '2026-10-01' }] });
    expect(blockers).toEqual(expect.arrayContaining([expect.stringContaining('diagnoses'), expect.stringContaining('line dates')]));
  });
  it('rejects an approved-head or content-hash change inside the transmission lock', async () => {
    await expect(assertClinicalVersionSubmission({ noteId: 4, agencyId: 2, expectedRevisionId: 10, expectedContentHash: hash })).rejects.toMatchObject({ status: 409 });
    await expect(assertClinicalVersionSubmission({ noteId: 4, agencyId: 2, expectedRevisionId: 12, expectedContentHash: 'c'.repeat(64) })).rejects.toMatchObject({ status: 409 });
    await expect(assertClinicalVersionSubmission({ noteId: 4, agencyId: 2, expectedRevisionId: 12, expectedContentHash: hash })).resolves.toMatchObject({ id: 12 });
  });
});
