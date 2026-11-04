import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => String(value || ''), maybeEncryptNotePayload: value => String(value || '') }));
vi.mock('../sessionAiPrivacy.service.js', () => ({ createSessionPrivacyContext: vi.fn(() => ({ redact: async text => text })) }));
import { buildClinicalReviewPacket, inventoryEligibleCharts, readSourceRevision } from '../assistantReviewPackets.service.js';
const sourceQueue = vi.hoisted(() => vi.fn());
vi.mock('../assistantTeams.service.js', () => ({ queueAssistantSourceChange: sourceQueue }));
import { appendClinicalNoteAmendment } from '../clinicalNoteAmendment.service.js';
import { noteReviewContent } from '../clinicalReviewDocument.service.js';
import crypto from 'node:crypto';

const approved = () => ({ enabled: true, baaVerified: true, approved: true, sampleReviewPassed: true, revision: 'reviewed-v1', externalService: 'Synthetic external vendor', baaReference: 'synthetic-baa-evidence', sampleReviewReference: 'synthetic-sample-review' });
const input = overrides => ({ agencyId: 2, clientId: 99, subrole: 'clinical', privacyPolicy: approved(), ...overrides });
const note = (id = 21, encounter = '2026-10-30') => ({ id, agency_id: 2, client_id: 99, note_type: 'PROGRESS_NOTE', encounter_at: encounter, provider_signed_at: '2026-11-02', created_by_user_id: 70, note_payload: JSON.stringify({ sections: { Subjective: 'Synthetic Alice reports practicing coping skills.', Assessment: 'Response and next steps reviewed.' }, patientName: 'Never serialize top-level demographics' }), title: 'PRIVATE TITLE', metadata_json: { patientName: 'PRIVATE META' } });
const sources = () => ({
  client: { id: 99, agency_id: 2, status: 'ACTIVE', full_name: 'Synthetic Alice', email: 'synthetic@example.com' },
  notes: [note()],
  plan: { id: 11, agency_id: 2, client_id: 99, status: 'active', presenting_problem: 'Synthetic Alice reports stress.', discharge_plan: 'Continue existing plan.', title: 'PRIVATE PLAN TITLE', goals: [{ id: 12, goal_text: 'Practice coping skills.', objectives: [{ id: 13, objective_text: 'Rate ability to cope.', scale_start: 3, scale_current: 4, scale_target: 8, measurement_method: 'Self-report', interventions_json: '["Skills practice"]' }] }] },
  addenda: [{ id: 31, agency_id: 2, client_id: 99, clinical_note_id: 21, body: 'Synthetic Alice clarified progress. Requested by user #70; clinical_note_id:21.', entry_reason: 'Client requested clarification.', entry_kind: 'addendum', author_signed_at: '2026-11-02' }],
  ratings: [{ id: 41, agency_id: 2, client_id: 99, clinical_note_id: 21, objective_id: 13, scale_value: 4, scale_target_at_rating: 8, disposition: 'rated', rater_kind: 'client', rater_label: 'PRIVATE NAME', notes: 'PRIVATE RATING FREE TEXT' }],
  claims: [{ id: 51, agency_id: 2, client_id: 99, clinical_note_id: 21, date_of_service: '2026-10-30', place_of_service: '11', claim_lifecycle: 'draft', billing_revision: 1, payer_name: 'PRIVATE PAYER', member_id: 'PRIVATE MEMBER' }],
  lines: [{ id: 61, clinical_claim_id: 51, procedure_code: '90834', units: 1, modifiers_json: '["95"]', service_date: '2026-10-30', charge_cents: 12345 }],
  knownIdentifiers: ['Synthetic Alice', 'synthetic@example.com'], clientNames: ['Synthetic Alice'], providerNames: ['Synthetic Provider']
});
const fakePrivacy = () => ({ redact: vi.fn(async text => String(text).replaceAll('Synthetic Alice', 'Client')) });
const depsFor = source => ({ loadSources: vi.fn(async () => structuredClone(source)), createPrivacyContext: vi.fn(fakePrivacy) });
beforeEach(() => vi.clearAllMocks());

describe('external assistant clinical packet boundary', () => {
  it.each(['enabled', 'baaVerified', 'approved', 'sampleReviewPassed', 'revision', 'externalService', 'baaReference', 'sampleReviewReference'])('requires trusted privacy and BAA gates before source access: %s', async field => {
    const deps = depsFor(sources()), policy = approved(); policy[field] = field === 'revision' ? '' : false;
    expect(await buildClinicalReviewPacket(input({ privacyPolicy: policy }), deps)).toMatchObject({ status: 'blocked', reasonCode: 'PRIVACY_POLICY_NOT_APPROVED', packet: null, mapping: null });
    expect(deps.loadSources).not.toHaveBeenCalled(); expect(deps.createPrivacyContext).not.toHaveBeenCalled();
  });

  it('releases only screened positive-allowlisted clinical content with opaque private mapping', async () => {
    const source = sources(), deps = depsFor(source);
    const result = await buildClinicalReviewPacket(input(), deps);
    expect(result.status).toBe('ready'); expect(result.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
    const text = JSON.stringify(result.packet);
    expect(text).toContain('Client reports practicing coping skills');
    expect(text).not.toMatch(/Synthetic Alice|synthetic@example|PRIVATE|2026-|clientId|agencyId|created_by|charge_cents|patientName|member_id|user #70|clinical_note_id:21/);
    expect(result.packet.ratings).toEqual([expect.objectContaining({ value: 4, raterRole: 'client' })]);
    expect(result.packet.plan.goals[0].objectives[0].interventions).toBe('Skills practice');
    expect(result.mapping).toMatchObject({ agencyId: 2, clientId: 99 });
    for (const ref of Object.keys(result.mapping.sources)) expect(ref).toMatch(/^src_[a-f0-9]{32}$/);
    expect(result.mapping.sources[result.packet.notes[0].sourceRef]).toMatchObject({ kind: 'note', id: 21 });
    expect(deps.createPrivacyContext).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'session', clientNames: ['Synthetic Alice'], identifiers: expect.arrayContaining(['synthetic@example.com']) }));
    expect(result.packet.sourceHandling).toBe('privacy_screened_not_certified_deidentified');
  });

  it('selects the five latest signed shared progress notes by encounter chronology, not signature date', async () => {
    const source = sources(); source.notes = Array.from({ length: 7 }, (_, i) => note(21 + i, `2026-10-${20 + i}`));
    source.notes[0].provider_signed_at = '2026-11-20';
    source.notes.push({ ...note(200, '2026-11-01'), metadata_json: { restricted: true } }, { ...note(201, '2026-11-02'), metadata_json: { privatePsychotherapyNote: true } }, { ...note(202, '2026-11-03'), provider_signed_at: null }, { ...note(203, '2026-11-04'), note_type: 'CONTACT_NOTE' }, { ...note(204, '2026-11-05'), agency_id: 6 });
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.status).toBe('ready');
    const retained = result.packet.notes.map(row => result.mapping.sources[row.sourceRef].id);
    expect(retained).toEqual([23, 24, 25, 26, 27]);
    expect(result.packet.notes.map(row => row.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never releases unsigned, cross-chart or restricted entries/ratings, and discloses missing evidence', async () => {
    const source = sources(); source.plan.status = 'draft';
    source.addenda.push({ ...source.addenda[0], id: 32, author_signed_at: null }, { ...source.addenda[0], id: 33, agency_id: 6 }, { ...source.addenda[0], id: 34, client_id: 100 });
    source.ratings.push({ ...source.ratings[0], id: 42, clinical_note_id: 100 });
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.status).toBe('ready'); expect(result.packet.plan).toBeNull(); expect(result.packet.ratings).toEqual([]);
    expect(result.packet.notes[0].entries).toHaveLength(1);
    expect(result.packet.limitations).toEqual(expect.arrayContaining(['NO_ACTIVE_TREATMENT_PLAN', 'FEWER_THAN_FIVE_SIGNED_PROGRESS_NOTES']));
  });

  it.each([source => { source.client.agency_id = 6; }, source => { source.client.status = 'ARCHIVED'; }, source => { source.client.status = 'PENDING_REVIEW'; }, source => { source.client.status = 'DECLINED'; }, source => { source.client.status = 'ON_HOLD'; }, source => { source.client.terminated_at = '2026-10-01'; }, source => { source.notes[0].encounter_at = null; }])('fails closed on ineligible or unorderable source data', async mutate => {
    const source = sources(); mutate(source);
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result).toMatchObject({ status: 'blocked', packet: null, mapping: null, sourceRevision: null });
  });

  it('fails closed without partial packets or source error text when privacy inspection fails', async () => {
    const deps = depsFor(sources()); deps.createPrivacyContext = () => ({ redact: async () => { throw Object.assign(new Error('PRIVATE PROVIDER RESPONSE'), { code: 'SESSION_PRIVACY_UNAVAILABLE' }); } });
    const result = await buildClinicalReviewPacket(input(), deps);
    expect(result).toEqual({ status: 'blocked', reasonCode: 'PRIVACY_INSPECTION_FAILED', packet: null, mapping: null, sourceRevision: null });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('blocks residual identifiers detected only in the assembled packet and incomplete source payloads', async () => {
    const deps = depsFor(sources()); deps.createPrivacyContext = () => ({ redact: async text => text.startsWith('{"version"') ? '[REDACTED]' : text });
    expect(await buildClinicalReviewPacket(input(), deps)).toMatchObject({ status: 'blocked', reasonCode: 'PRIVACY_RESIDUAL_DETECTED' });
    const source = sources(); source.notes[0].note_payload = '{"_enc":true,"ciphertext":"unreadable"}';
    expect(await buildClinicalReviewPacket(input(), depsFor(source))).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_UNREADABLE' });
  });

  it('source revisions are deterministic and change with signed entries, plan, ratings or policy; stale checks invoke no privacy processor', async () => {
    const source = sources(), deps = depsFor(source), original = await readSourceRevision(input(), deps);
    expect(deps.createPrivacyContext).not.toHaveBeenCalled();
    const packet = await buildClinicalReviewPacket(input(), deps); expect(packet.sourceRevision).toBe(original);
    for (const mutate of [s => { s.addenda[0].body += ' Changed'; }, s => { s.ratings[0].scale_value = 5; }, s => { s.plan.goals[0].goal_text += ' Changed'; }, s => { s.notes[0].provider_signed_at = '2026-11-03'; }]) {
      const changed = structuredClone(source); mutate(changed);
      expect(await readSourceRevision(input(), depsFor(changed))).not.toBe(original);
    }
    expect(await readSourceRevision(input({ privacyPolicy: { ...approved(), revision: 'reviewed-v2' } }), deps)).not.toBe(original);
    expect(await readSourceRevision(input({ privacyPolicy: { ...approved(), externalService: 'Changed approved vendor' } }), deps)).not.toBe(original);
    expect(await readSourceRevision(input({ privacyPolicy: { ...approved(), baaReference: 'changed-baa-evidence' } }), deps)).not.toBe(original);
  });

  it('exports sanitized compliance service fields and reviewed applicable rules, retaining payer reference privately', async () => {
    const deps = depsFor(sources()); deps.loadCompliancePolicy = async () => ({ approved: true, version: 'v2', reference: 'PRIVATE PAYER URL', payerId: 'PRIVATE-PAYER-ID', rules: [{ id: 10, applicabilityVerified: true, effectiveFrom: '2026-01-01', effectiveThrough: '2026-12-31', instruction: 'Verify actual duration and delivery setting.' }] });
    const result = await buildClinicalReviewPacket(input({ subrole: 'compliance' }), deps);
    expect(result.status).toBe('ready');
    expect(result.packet.services[0]).toMatchObject({ code: '90834', units: 1, placeOfService: '11', modifiers: ['95'] });
    expect(result.packet.policy).toMatchObject({ status: 'OWNER_APPROVED_RULES_SUPPLIED', rules: [{ sourceRef: expect.any(String), instruction: 'Verify actual duration and delivery setting.' }] });
    expect(JSON.stringify(result.packet)).not.toMatch(/PRIVATE|2026-|payerId|claimId|member_id|charge_cents/);
    expect(result.mapping.policy.reference).toBe('PRIVATE PAYER URL');
  });

  it.each([null, { approved: true, version: 'v1', reference: 'source', rules: [{ applicabilityVerified: false, instruction: 'Do not guess' }] }, { approved: true, version: 'v1', reference: 'source', rules: [{ applicabilityVerified: true, effectiveFrom: '2025-01-01', effectiveThrough: '2025-12-31', instruction: 'Expired' }] }])('flags unknown/unverified/out-of-date payer policy rather than inventing compliance', async policy => {
    const deps = depsFor(sources()); deps.loadCompliancePolicy = async () => policy;
    const result = await buildClinicalReviewPacket(input({ subrole: 'compliance' }), deps);
    expect(result.status).toBe('ready'); expect(result.packet.policy).toEqual({ status: 'APPLICABLE_POLICY_UNVERIFIED', rules: [] });
    expect(result.packet.limitations).toContain('NO_VERIFIED_APPLICABLE_PAYER_POLICY');
  });

  it('drops foreign claim lines and rejects unexpected code/modifier values without exposing arbitrary metadata', async () => {
    const source = sources(); source.lines.push({ id: 70, clinical_claim_id: 888, procedure_code: 'PRIVATE_CODE' });
    source.lines[0].procedure_code = 'PRIVATE_CODE'; source.lines[0].modifiers_json = '["95","PRIVATE_MOD"]';
    const result = await buildClinicalReviewPacket(input({ subrole: 'compliance' }), depsFor(source));
    expect(result.packet.services).toHaveLength(1); expect(result.packet.services[0]).toMatchObject({ code: null, modifiers: ['95'] });
    expect(JSON.stringify(result.packet)).not.toContain('PRIVATE');
  });
});

describe('eligible-chart pagination', () => {
  it('includes active charts without signed notes and advances through every page without a fixed cap', async () => {
    const mainDb = { execute: vi.fn().mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]).mockResolvedValueOnce([[{ id: 3 }]]) };
    const clinicalDb = { execute: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ client_id: 3 }]]) };
    const first = await inventoryEligibleCharts({ agencyId: 2, limit: 2 }, { mainDb, clinicalDb });
    expect(first).toEqual({ charts: [{ clientId: 1 }, { clientId: 2 }], nextCursor: 2 });
    const second = await inventoryEligibleCharts({ agencyId: 2, afterId: first.nextCursor, limit: 2 }, { mainDb, clinicalDb });
    expect(second).toEqual({ charts: [{ clientId: 3 }], nextCursor: null });
    expect(mainDb.execute.mock.calls[1][1]).toEqual([2, 2]);
    expect(clinicalDb.execute).not.toHaveBeenCalled();
    expect(mainDb.execute.mock.calls[0][0]).toContain("c.status='ACTIVE'");
  });
});

describe('default source adapters', () => {
  it('loads only one agency/client, canonical active-plan context and latest signed-note chronology without exposing source identifiers', async () => {
    const source = sources();
    const mainDb = { execute: vi.fn(async sql => {
      if (sql.includes('FROM clients')) return [[source.client]];
      if (sql.includes('FROM users')) return [[{ id: 70, first_name: 'Synthetic', last_name: 'Provider', email: 'provider@example.com' }]];
      if (sql.includes('client_guardians')) return [[]];
      throw new Error('Unexpected source query');
    }) };
    const clinicalDb = { execute: vi.fn(async (sql, params) => {
      if (sql.includes('FROM clinical_notes n')) return [[{ ...source.notes[0], encounter_minutes: 45, encounter_pos: '11', is_telehealth: 0 }]];
      if (sql.includes('FROM clinical_treatment_plans')) return [[source.plan]];
      if (sql.includes('FROM clinical_treatment_plan_goals')) return [[source.plan.goals[0]]];
      if (sql.includes('FROM clinical_treatment_plan_objectives')) return [[source.plan.goals[0].objectives[0]]];
      if (sql.includes('FROM clinical_note_addenda')) return [source.addenda];
      if (sql.includes('FROM clinical_claims')) return [source.claims];
      if (sql.includes('FROM clinical_claim_lines')) return [source.lines];
      if (sql.includes('FROM clinical_treatment_objective_ratings')) return [source.ratings];
      throw new Error(`Unexpected query ${params?.length}`);
    }) };
    const result = await buildClinicalReviewPacket(input(), { mainDb, clinicalDb, createPrivacyContext: fakePrivacy,
      loadEffectiveNote: async ({ note }) => ({ ...note, clinical_version_addenda: source.addenda }) });
    expect(result.status).toBe('ready');
    const sql = clinicalDb.execute.mock.calls[0][0];
    expect(sql).toContain('s.scheduled_start_at'); expect(sql).toContain('LIMIT 5'); expect(sql).toContain('n.provider_signed_at IS NOT NULL');
    expect(sql).toContain("NULLIF(n.note_type,'')"); expect(sql).toContain('v.snapshot_json');
    expect(clinicalDb.execute.mock.calls[0][1].slice(0, 2)).toEqual([2, 99]);
    expect(result.packet.notes[0].encounter).toEqual({ durationMinutes: 45, placeOfService: '11', modality: 'in_person' });
    expect(JSON.stringify(result.packet)).not.toMatch(/provider@example.com|PRIVATE|Synthetic Alice/);
    for (const [query] of [...mainDb.execute.mock.calls, ...clinicalDb.execute.mock.calls]) expect(query.trim()).toMatch(/^SELECT/);
  });
});

describe('packet integration with the existing session privacy processor', () => {
  it('locally minimizes known identifiers, screens unknown Unicode names, and never invokes a language model', async () => {
    const { createSessionPrivacyContext } = await vi.importActual('../sessionAiPrivacy.service.js');
    vi.stubEnv('GCP_PROJECT_ID', 'synthetic-project'); vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED', 'true');
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
    const source = sources();
    source.notes[0].note_payload = JSON.stringify({ sections: { Subjective: 'Synthetic Alice discussed coping with Zoë Privée. Email synthetic@example.com or call 202-555-0107. MRN: TEST12345.' } });
    const fetchImpl = vi.fn(async (_url, options) => {
      const text = JSON.parse(options.body).item.value;
      expect(text).not.toMatch(/Synthetic Alice|synthetic@example.com|202-555-0107|TEST12345/);
      const bytes = Buffer.from(text), needle = Buffer.from('Zoë Privée'), start = bytes.indexOf(needle);
      return { ok: true, json: async () => ({ result: { findings: start < 0 ? [] : [{ location: { byteRange: { start, end: start + needle.length } } }] } }) };
    });
    try {
      const result = await buildClinicalReviewPacket(input(), { loadSources: async () => source, createPrivacyContext: options => createSessionPrivacyContext({ ...options, fetchImpl, tokenProvider: async () => 'synthetic-token' }) });
      expect(result.status).toBe('ready');
      expect(JSON.stringify(result.packet)).not.toMatch(/Synthetic Alice|Zoë Privée|synthetic@example.com|202-555-0107|TEST12345/);
      expect(fetchImpl).toHaveBeenCalled();
      for (const [url] of fetchImpl.mock.calls) expect(url).toContain('dlp.googleapis.com');
    } finally { vi.unstubAllEnvs(); }
  });
});


describe('active charts without recent documentation', () => {
  it('returns zero notes explicitly so a missing context cannot be called reviewed or mistaken for no change', async () => {
    const source = sources(); source.notes = []; source.addenda = []; source.ratings = []; source.claims = []; source.lines = [];
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.status).toBe('ready'); expect(result.packet.notes).toEqual([]);
    expect(result.packet.limitations).toEqual(expect.arrayContaining(['NO_SIGNED_PROGRESS_NOTES', 'FEWER_THAN_FIVE_SIGNED_PROGRESS_NOTES']));
    expect(result.packet.humanReviewRequired).toBe(true);
  });
});


describe('signed entry source-change queue', () => {
  const input = { noteId: 21, agencyId: 2, body: 'Synthetic signed clarification.', actorUserId: 70, entryKind: 'addendum', reason: 'New information.', authorAttested: true };
  const setup = () => {
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
      if (sql.startsWith('SELECT * FROM clinical_notes')) return [[{ id: 21, agency_id: 2, client_id: 99, provider_signed_at: '2026-11-01', metadata_json: {} }]];
      if (sql.startsWith('SELECT * FROM clinical_note_revision_heads')) return [[{ original_revision_id: 101, effective_revision_id: 101 }]];
      if (sql.startsWith('SELECT * FROM clinical_note_revisions')) return [[{ id: 101, clinical_note_id: 21, agency_id: 2, content_hash: 'signed-content' }]];
      if (sql.startsWith('SELECT id,author_signed_at')) return [[{ id: 31, author_signed_at: '2026-11-04T18:00:00Z' }]];
      if (sql.startsWith('SELECT a.*,s.id')) return [[]];
      if (sql.startsWith('INSERT INTO clinical_note_addenda')) return [{ insertId: 31 }];
      return [{ affectedRows: 1, insertId: 41 }];
    }) };
    return { db, source: { getConnection: async () => db } };
  };
  it('enqueues after commit without waiting for review or privacy preparation', async () => {
    const { db, source } = setup();
    sourceQueue.mockImplementation(() => { expect(db.commit).toHaveBeenCalled(); return new Promise(() => {}); });
    await appendClinicalNoteAmendment(input, source);
    expect(db.release).toHaveBeenCalled();
    await vi.waitFor(() => expect(sourceQueue).toHaveBeenCalledWith({ agencyId: 2, clientId: 99, sourceKind: 'note_entry', sourceId: 31 }));
  });
  it('does not enqueue an amendment that did not commit', async () => {
    const { db, source } = setup(); db.commit.mockRejectedValueOnce(new Error('Synthetic commit failed'));
    await expect(appendClinicalNoteAmendment(input, source)).rejects.toThrow('Synthetic commit failed');
    expect(db.rollback).toHaveBeenCalled(); expect(sourceQueue).not.toHaveBeenCalled();
  });
});


describe('incremental eligible-chart inventory', () => {
  it('advances an empty unchanged page and includes later changed source IDs without reading clinical text', async () => {
    const old = '2026-10-01 00:00:00';
    const mainDb = { execute: vi.fn().mockResolvedValueOnce([[{ id: 1, updated_at: old }, { id: 2, updated_at: old }, { id: 3, updated_at: old }]]).mockResolvedValueOnce([[{ id: 3, updated_at: old }]]) };
    const clinicalDb = { execute: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ client_id: 3 }]]) };
    const args = { agencyId: 2, limit: 2, changedSince: '2026-11-01 12:00:00' };
    const first = await inventoryEligibleCharts(args, { mainDb, clinicalDb });
    expect(first).toEqual({ charts: [], nextCursor: 2 });
    const second = await inventoryEligibleCharts({ ...args, afterId: first.nextCursor }, { mainDb, clinicalDb });
    expect(second).toEqual({ charts: [{ clientId: 3 }], nextCursor: null });
    expect(mainDb.execute.mock.calls[1][1]).toEqual([2, 2]);
    const [sql, values] = clinicalDb.execute.mock.calls[0];
    for (const table of ['clinical_notes', 'clinical_note_addenda', 'clinical_note_revisions', 'clinical_note_revision_signatures', 'clinical_note_revision_approvals', 'clinical_treatment_plans', 'clinical_treatment_plan_goals', 'clinical_treatment_plan_objectives', 'clinical_treatment_objective_ratings', 'clinical_sessions', 'clinical_claims', 'clinical_claim_lines']) expect(sql).toContain(table);
    expect(sql).not.toMatch(/note_payload|goal_text|objective_text|first_name|last_name|SELECT \*/);
    expect(sql).not.toContain('is_deleted=0'); // Deletion/restoration invalidates a previous source too.
    expect(values.filter(value => value instanceof Date).every(value => value.toISOString() === '2026-11-01T12:00:00.000Z')).toBe(true);
    expect(values.filter(value => value instanceof Date)).toHaveLength(16);
    expect(values.slice(0, 3)).toEqual([2, 1, 2]);
  });
  it('includes a newly activated zero-note chart from main updated_at alone', async () => {
    const mainDb = { execute: vi.fn(async () => [[{ id: 10, updated_at: new Date('2026-11-02T00:00:00Z') }]]) }, clinicalDb = { execute: vi.fn(async () => [[]]) };
    expect(await inventoryEligibleCharts({ agencyId: 2, changedSince: new Date('2026-11-01T12:00:00Z') }, { mainDb, clinicalDb })).toEqual({ charts: [{ clientId: 10 }], nextCursor: null });
  });
  it('uses a full active-chart inventory only when no previous cutoff exists, and rejects an invalid cutoff', async () => {
    const mainDb = { execute: vi.fn(async () => [[{ id: 10, updated_at: '2026-01-01' }]]) }, clinicalDb = { execute: vi.fn() };
    expect(await inventoryEligibleCharts({ agencyId: 2, changedSince: null }, { mainDb, clinicalDb })).toEqual({ charts: [{ clientId: 10 }], nextCursor: null });
    expect(clinicalDb.execute).not.toHaveBeenCalled();
    await expect(inventoryEligibleCharts({ agencyId: 2, changedSince: 'not-a-timestamp' }, { mainDb, clinicalDb })).rejects.toMatchObject({ reasonCode: 'INVALID_CHANGE_CURSOR' });
  });
});


describe('signature status in screened packets', () => {
  it('reports a current responsible cosign over the exact signed note and addenda without names or signature dates', async () => {
    const source = sources(); source.documentationPolicies = { 21: { version: 1, supervisorUserId: 80, nonBillableReview: 'all', noteTypes: [] } };
    const currentHash = crypto.createHash('sha256').update(noteReviewContent(source.notes[0].note_payload, source.addenda)).digest('hex');
    source.notes[0].supervisor_cosigned_at = '2026-11-02'; source.notes[0].supervisor_cosigned_by_user_id = 80;
    source.notes[0].metadata_json.supervisorCosign = { contentHash: currentHash, signerLabel: 'PRIVATE SIGNER' };
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.packet.notes[0].signature).toEqual({ providerSigned: true, cosignRequired: true, supervisorCosigned: true, signedEntriesPresent: true, status: 'current' });
    expect(JSON.stringify(result.packet)).not.toMatch(/PRIVATE SIGNER|supervisorUserId|2026-11-02|provider_signed/);
    expect(result.packet.checklist.version).toBe('clinical-documentation-review-v1');
  });
  it('marks a formerly signed note stale when a signed amendment changes the current source', async () => {
    const source = sources(); source.documentationPolicies = { 21: { supervisorUserId: 80, nonBillableReview: 'all' } };
    source.notes[0].supervisor_cosigned_at = '2026-11-01'; source.notes[0].supervisor_cosigned_by_user_id = 80;
    source.notes[0].metadata_json.supervisorCosign = { contentHash: 'old-version' };
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: true, cosignRequired: true, supervisorCosigned: false, status: 'stale' });
  });
  it('requires signoff on amendments even when current supervisor policy is unavailable, and preserves unknown status', async () => {
    const result = await buildClinicalReviewPacket(input(), depsFor(sources()));
    expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: true, cosignRequired: true, supervisorCosigned: null, status: 'unknown' });
    expect(result.packet.limitations).toContain('SIGNATURE_POLICY_UNAVAILABLE');
  });
  it('distinguishes an established independent-provider policy from missing policy data and invalidates revisions on reassignment', async () => {
    const source = sources(); source.addenda = []; source.documentationPolicies = { 21: { supervisorUserId: null, nonBillableReview: 'all' } };
    const deps = depsFor(source), oldRevision = await readSourceRevision(input(), deps);
    const result = await buildClinicalReviewPacket(input(), deps);
    expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: true, cosignRequired: false, supervisorCosigned: false, status: 'not_required' });
    source.documentationPolicies[21].supervisorUserId = 80;
    expect(await readSourceRevision(input(), depsFor(source))).not.toBe(oldRevision);
  });
});


describe('legacy entry signature uncertainty', () => {
  it('does not call an old cosign current when an unsigned legacy entry was excluded from the packet', async () => {
    const source = sources(); source.documentationPolicies = { 21: { supervisorUserId: 80, nonBillableReview: 'all' } };
    source.notes[0].total_addendum_count = 2; source.notes[0].supervisor_cosigned_at = '2026-11-01'; source.notes[0].supervisor_cosigned_by_user_id = 80;
    const result = await buildClinicalReviewPacket(input(), depsFor(source));
    expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: true, cosignRequired: true, supervisorCosigned: null, status: 'unknown' });
  });
});


describe('local narrative identifier minimization', () => {
  it('removes labeled member/policy/subscriber identifiers, initials and signature blocks even when DLP finds nothing', async () => {
    const source = sources();
    source.notes[0].note_payload = JSON.stringify({ sections: { Subjective: 'Member ID: CANARY-A739241. Policy number ZX 1234 5678. subscriberId: SUB-987654. Insurance ID: INS-246810. Client initials: AX. Practiced coping skills and identified progress.', Signature: '\nSigned by: Synthetic Provider, LPC, License CANARY-LIC-1234.' } });
    const deps = depsFor(source); deps.createPrivacyContext = () => ({ redact: async value => value.replaceAll('Synthetic Alice', 'Client') });
    const result = await buildClinicalReviewPacket(input(), deps);
    expect(result.status).toBe('ready');
    const released = JSON.stringify(result.packet);
    expect(released).not.toMatch(/CANARY|739241|ZX|1234 5678|SUB-987654|INS-246810|Client initials: AX|Synthetic Provider|License/);
    expect(released).toContain('Practiced coping skills and identified progress');
  });
  it('blocks a labeled identifier with an unsupported value rather than releasing it incompletely', async () => {
    const source = sources(); source.notes[0].note_payload = JSON.stringify({ sections: { Subjective: 'Member ID: 🧩 ABC-123' } });
    expect(await buildClinicalReviewPacket(input(), depsFor(source))).toMatchObject({ status: 'blocked', reasonCode: 'IDENTIFIER_REQUIRES_REVIEW' });
  });
  it('labels supplied payer-policy applicability as requiring human verification', async () => {
    const deps = depsFor(sources()); deps.loadCompliancePolicy = async () => ({ approved: true, version: 'v1', reference: 'owner-reviewed-policy', rules: [{ id: 1, applicabilityVerified: true, effectiveFrom: '2026-01-01', effectiveThrough: '2026-12-31', instruction: 'Verify documented service setting.' }] });
    const result = await buildClinicalReviewPacket(input({ subrole: 'compliance' }), deps);
    expect(result.packet.policy.status).toBe('OWNER_APPROVED_RULES_SUPPLIED');
    expect(result.packet.limitations).toContain('PAYER_APPLICABILITY_REQUIRES_HUMAN_VERIFICATION');
  });
});
