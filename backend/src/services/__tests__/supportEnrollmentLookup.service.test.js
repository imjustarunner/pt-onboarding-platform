import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupSupportEnrollment, enrollmentReferences } from '../supportEnrollmentLookup.service.js';
import { buildSupportEmailDraftContext, validateSupportEmailDraft } from '../../utils/supportEmailDraft.shared.js';
import { generateSupportEmailDraft, prepareSupportEmailDraftInput, assessSupportEmailDraftReuse } from '../supportEmailDraft.service.js';

const question = 'Did we receive an intake packet for a kiddo first\nname Lopez. Mom filled it out using the QR code and wasn’t sure it submitted when she clicked End Intake.';
const input = (body = question, more = {}) => ({ ticket: { id: 494, agency_id: 2, school_organization_id: 5, question: body, subject: 'New intake', ...more }, knowledgeMatches: [], promptNotes: [] });
const row = (more = {}) => ({ id: 1283, status: 'consented', language_code: 'en', form_type: 'intake',
  created_at: '2026-10-27T17:55:03Z', updated_at: '2026-10-27T18:12:25Z',
  reminder_opt_out_at: '2026-10-27T18:12:26Z', session_token: null, submitted_at: null,
  intake_data: { clients: [{ firstName: 'Crispin', lastName: 'Lopez Huggett' }, { firstName: 'Wendell', lastName: 'Lopez Huggett' }],
    guardian: { email: 'PRIVATE@example.test', phone: 'PRIVATE_PHONE' },
    clinicalAnswers: 'PRIVATE_CLINICAL', progressSnapshot: { savedAt: '2026-10-27T18:07:57Z', currentFlowStepId: 'waivers', sessionToken: 'PRIVATE_TOKEN' } }, ...more });
function fixture({ rows = [row()], clients = [], allowed = true, decrypt = r => r, children = [], documents = [], notifications = [] } = {}) {
  const queries = [];
  return { queries, decryptSubmission: decrypt, database: { async execute(sql, params) {
    queries.push({ sql, params });
    if (sql.includes('FROM organization_affiliations')) { assert.deepEqual(params, [2, 5]); return [allowed ? [{ allowed: 1 }] : []]; }
    if (sql.includes('FROM clients c')) { assert.deepEqual(params, [2, 5, 5]); return [clients]; }
    if (sql.includes('FROM intake_submissions s')) { assert.deepEqual(params, [5, 2, 5]); return [rows]; }
    if (sql.includes('FROM intake_submission_clients')) return [children];
    if (sql.includes('FROM user_communications')) return [notifications];
    if (sql.includes('FROM intake_submission_documents')) return [documents];
    if (sql.includes('FROM agency_school_intake_masters')) return [[{ language_code: 'en', intake_steps: [{ id: 'waivers', type: 'guardian_waiver', label: 'Guardian waivers & safety' }] }]];
    assert.fail(`Unexpected SQL: ${sql}`);
  } } };
}

test('finds an ended multi-child form from a one-word reference without claiming an exact child', async () => {
  const context = buildSupportEmailDraftContext(input());
  assert.deepEqual(enrollmentReferences(context), ['lopez']);
  const f = fixture(), result = await lookupSupportEnrollment(context, f);
  assert.equal(result.status, 'possible_match');
  assert.equal(result.records[0].status, 'ended_without_submission');
  assert.equal(result.records[0].lastSavedStep, 'Guardian waivers & safety');
  assert.equal(result.records[0].resumeAvailable, false);
  assert.equal(result.records[0].packetAvailable, false);
  assert.equal(result.records[0].clientRecordLinked, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Crispin|Wendell|Huggett/);
  assert.ok(f.queries.every(q => /^\s*SELECT/.test(q.sql)));
});

test('searches English and Spanish, distinguishing a submitted form from a generated packet', async () => {
  for (const hasPacket of [false, true]) {
    const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake for Jane Smith submitted?')),
      fixture({ rows: [row({ language_code: 'es', status: 'submitted', submitted_at: '2026-10-27T20:00:00Z',
        combined_pdf_path: hasPacket ? 'private/path.pdf' : null, intake_data: { clients: [{ fullName: 'Jane Smith' }] } })] }));
    assert.equal(result.status, 'verified_match');
    assert.equal(result.records[0].language, 'es');
    assert.equal(result.records[0].status, hasPacket ? 'submitted' : 'submitted_packet_needs_review');
    assert.doesNotMatch(JSON.stringify(result), /private\/path/);
  }
});

test('does not turn a missing packet for one sibling into complete packet generation', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake for Crispin Lopez Huggett submitted?')),
    fixture({ rows: [row({ status: 'submitted', submitted_at: '2026-10-27T20:00:00Z' })],
      children: [{ intake_submission_id: 1283, client_id: 22, bundle_pdf_path: 'one.pdf' }] }));
  assert.equal(result.records[0].status, 'submitted_packet_needs_review');
});

test('scope denial prevents all intake reads and decryption', async () => {
  const f = fixture({ allowed: false, decrypt: () => assert.fail('out-of-scope decrypt') });
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input()), f);
  assert.equal(result.status, 'unavailable');
  assert.equal(f.queries.length, 1);
});

test('query failures, decryption failures, and search limits never establish nonreceipt', async () => {
  for (const f of [fixture({ decrypt: () => { throw new Error('key missing'); } }), fixture({ rows: Array.from({ length: 501 }, (_, i) => row({ id: i, intake_data: {} })) }),
    { database: { execute: () => { throw new Error('DB offline'); } } }]) {
    const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input()), f);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.coverage, 'incomplete');
  }
});

test('a scoped roster match is recorded even when no digital enrollment matches', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake for Jane Smith submitted?')),
    fixture({ rows: [], clients: [{ id: 22, full_name: 'Jane Smith' }] }));
  assert.equal(result.status, 'no_match'); assert.equal(result.knownClientFound, true);
  assert.match(result.limitation, /email, fax, or paper/);
});

test('two full-name matches with different signers stay ambiguous', async () => {
  const rows = ['Parent One', 'Parent Two'].map((signer, i) => row({ id: i + 1, signer_name: signer, intake_data: { clients: [{ fullName: 'Jane Smith' }] } }));
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake for Jane Smith submitted?')), fixture({ rows }));
  assert.equal(result.status, 'possible_match');
});

test('a caller-supplied child id in saved answers cannot manufacture a linked-client match', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake submitted?', { client_id: 22 })),
    fixture({ rows: [row({ intake_data: { clients: [{ fullName: 'Other Child', clientId: 22 }] } })], clients: [{ id: 22, full_name: 'Jane Smith' }] }));
  assert.equal(result.status, 'no_match');
});

test('the old ticket client does not override a follow-up asking about another child', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake for Jane Smith submitted?', { client_id: 22 })),
    fixture({ rows: [row({ client_id: 22, intake_data: { clients: [{ fullName: 'Other Child' }] } })], clients: [{ id: 22, full_name: 'Other Child' }] }));
  assert.equal(result.status, 'no_match');
});

test('a relational per-child link finds a completed multi-child submission without names in the message', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input('Was the intake submitted?', { client_id: 22 })),
    fixture({ rows: [row({ status: 'submitted', submitted_at: '2026-10-27T20:00:00Z', intake_data: {} })], clients: [{ id: 22, full_name: 'Jane Smith' }],
      children: [{ intake_submission_id: 1283, client_id: 22, bundle_pdf_path: 'private.pdf' }] }));
  assert.equal(result.status, 'verified_match');
  assert.equal(result.records[0].status, 'submitted');
});

test('a later thank-you does not rerun an old enrollment lookup', async () => {
  const context = buildSupportEmailDraftContext({ ...input(), messages: [{ id: 9, body: 'Thank you for confirming.', author_role: 'school_staff' }] });
  assert.equal(await lookupSupportEnrollment(context, { database: { execute: () => assert.fail('no query') } }), null);
});

test('grounded status is included in generation and invalidates a same-message cached draft', async () => {
  const args = await prepareSupportEmailDraftInput(input(), fixture());
  const previous = assessSupportEmailDraftReuse(input()).context;
  const current = assessSupportEmailDraftReuse(args).context;
  assert.notEqual(previous.evidenceFingerprint, current.evidenceFingerprint);
  const result = await generateSupportEmailDraft(args, { generateText: async ({ prompt }) => {
    assert.match(prompt, /ended_without_submission/); assert.match(prompt, /Guardian waivers/);
    assert.doesNotMatch(prompt, /PRIVATE|Crispin|Wendell|Huggett/);
    return { text: JSON.stringify({ reply: 'I found a possible saved English enrollment that was ended without submitting. Could you confirm the child’s full name so I can verify that it is the right record?', usedEvidenceIds: ['intake_submission:1283'] }) };
  } });
  assert.ok(result.metadata.draftSources.some(s => s.type === 'intake_submission'));
  assert.deepEqual(result.metadata.usedEvidenceIds, ['intake_submission:1283']);
  assert.ok(result.metadata.reviewWarnings.includes('enrollment_possible_match'));
  const after = structuredClone(args); after.enrollmentLookup.records[0].status = 'submitted';
  assert.notEqual(current.evidenceFingerprint, assessSupportEmailDraftReuse(after).context.evidenceFingerprint);
});

test('rejects generic promises and unsafe status/resume claims once a saved record is known', async () => {
  const context = buildSupportEmailDraftContext(await prepareSupportEmailDraftInput(input(), fixture()));
  assert.ok(validateSupportEmailDraft('I will look for the packet and let you know.', context).includes('omits_enrollment_lookup_result'));
  assert.ok(validateSupportEmailDraft('The enrollment is complete.', context).includes('contradicts_saved_enrollment_status'));
  assert.ok(validateSupportEmailDraft('I found a possible saved enrollment. Please resume using the reminder link.', context).includes('ended_enrollment_cannot_resume'));
});

test('a verified submitted digital packet can be acknowledged without an email attachment', async () => {
  const args = await prepareSupportEmailDraftInput(input('Was the intake for Jane Smith submitted?'), fixture({ rows: [row({ status: 'submitted', submitted_at: '2026-10-27T20:00:00Z', combined_pdf_path: 'packet.pdf', intake_data: { clients: [{ fullName: 'Jane Smith' }] } })] }));
  const context = buildSupportEmailDraftContext(args);
  assert.deepEqual(validateSupportEmailDraft('We received the digital intake packet.', context), []);
  assert.ok(validateSupportEmailDraft('We received the attachment in your email.', context).includes('unsupported_attachment_receipt'));
});


test('includes recorded recovery email status without addresses or resume links', async () => {
  const result = await lookupSupportEnrollment(buildSupportEmailDraftContext(input()), fixture({ notifications: [
    { id: 4319, submission_id: 1283, template_type: 'enrollment_unfinished_reminder_manual', delivery_status: 'sent', sent_at: '2026-10-28T14:16:42Z', recipient_address: 'PRIVATE@example.test', metadata: { linkUrl: 'PRIVATE_TOKEN' } }
  ] }));
  assert.deepEqual(result.records[0].notifications, [{ communicationId: 4319, status: 'sent', sentAt: '2026-10-28T14:16:42Z', kind: 'support_recovery_email' }]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('a confirmed sent recovery email supports a notification claim, not other completed actions', () => {
  const notice = { status: 'sent', sentAt: '2026-10-28T14:16:42Z' };
  const context = buildSupportEmailDraftContext({ ...input(), enrollmentLookup: { status: 'verified_match', records: [{ status: 'saved_not_submitted', notifications: [notice] }] } });
  assert.deepEqual(validateSupportEmailDraft('The enrollment is saved but not submitted. We sent a recovery email with a resume link.', context), []);
  assert.ok(validateSupportEmailDraft('The enrollment is saved. We updated the account.', context).includes('unsupported_completed_action'));
  notice.status = 'pending'; notice.sentAt = null;
  assert.ok(validateSupportEmailDraft('The enrollment is saved. We sent a recovery email.', context).includes('unsupported_completed_action'));
});
