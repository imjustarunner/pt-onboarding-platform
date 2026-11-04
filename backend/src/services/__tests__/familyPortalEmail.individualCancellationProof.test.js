import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { prepareIndividualCancellationReview, individualCancellationEmailContext } from '../appointmentCancellationEmail.service.js';

let appointment, workflow, facts, review, snapshot, communication, metadata, rows, payload, db, dependencies;
beforeEach(async () => {
  facts = { eventType: 'canceled', signatureConfirmed: true, notificationMode: 'send', reasonCategory: 'illness', followUpAction: 'keep_next_or_support' };
  appointment = { id: 17, agencyId: 2, providerUserId: 776, status: 'canceled_by_provider', startAt: '2026-11-05T16:00:00Z' };
  workflow = { appointment_id: 17, agency_id: 2, status: 'completing', signed_by_user_id: 776, signed_at: '2026-11-04 15:00:00' };
  const contacts = [1, 2].map(id => ({ key: `guardian:${id}`, role: 'guardian', userId: id,
    name: `Guardian ${id}`, email: `parent${id}@example.test`, operationalOnly: true, source: 'affiliated_guardian' }));
  review = { mode: 'guardian', channels: ['email'], contacts, recipients: contacts.map(contact => ({ ...contact, enabled: true })) };
  metadata = { appointmentIds: [17], scheduleNoticeBatchId: 41 };
  communication = { agency_id: 2, client_id: 8, recipient_address: 'parent1@example.test', template_type: 'session_cancellation', channel: 'email', generated_by_user_id: 776 };
  db = { execute: vi.fn(async sql => {
    if (sql.includes('FROM appointment_change_workflows')) return [workflow ? [{ ...workflow, facts_json: JSON.stringify(facts) }] : []];
    if (sql.includes('FROM user_communications')) return [communication ? [{ ...communication, metadata: JSON.stringify(metadata) }] : []];
    if (sql.includes('FROM appointment_schedule_notices')) return [rows.map(row => ({ ...row, payload_json: row.payload_json ?? `encrypted:${JSON.stringify(payload)}` }))];
    throw new Error(`Unexpected query: ${sql}`);
  }) };
  dependencies = { database: db, appointment: vi.fn(async () => appointment), participants: vi.fn(async () => [{ clientId: 8 }]),
    review: vi.fn(async () => review), currentRecipient: vi.fn(async () => true), domain: vi.fn(async () => 'itsco.health'),
    decrypt: vi.fn(value => { if (!value.startsWith('encrypted:')) throw new Error('Unreadable encrypted notice'); return value.slice(10); }) };
  snapshot = await prepareIndividualCancellationReview({ appointment, clientId: 8, actorUserId: 776 }, dependencies);
  payload = { eventType: 'canceled', facts: { ...facts }, individualCancellationReview: snapshot };
  rows = [{ id: 41, batch_id: 41, appointment_id: 17, agency_id: 2, provider_id: 776, client_id: 8,
    event_type: 'canceled', status: 'sending', created_by_user_id: 776 }];
  vi.clearAllMocks();
});
const input = changes => ({ agencyId: 2, clientId: 8, to: 'parent1@example.test', templateType: 'session_cancellation',
  existingCommunicationId: 77, generatedByUserId: 776, cc: ['support@itsco.health'], ...changes });
const prepare = () => prepareIndividualCancellationReview({ appointment, clientId: 8, actorUserId: 776 }, dependencies);
const context = (changes, options) => individualCancellationEmailContext(input(changes), { ...dependencies, ...options });

it('snapshots every affiliated guardian from the saved staff signature without granting portal access', async () => {
  const result = await prepare();
  expect(result).toMatchObject({ appointmentId: 17, clientId: 8, providerId: 776, signedAt: '2026-11-04T15:00:00.000Z', mode: 'guardian', channels: ['email'] });
  expect(result.factsHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.recipients.map(recipient => recipient.userId)).toEqual([1, 2]);
  expect(dependencies.review).toHaveBeenCalledWith(8, 2, undefined, { required: false, allowMissingEmail: true });
  review.contacts[0].email = 'changed@example.test';
  expect(result.contacts[0].email).toBe('parent1@example.test');
  expect(db.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it.each(['missing', 'draft', 'unsigned', 'wrong_signer', 'wrong_agency', 'wrong_appointment'])('does not create authority from a %s workflow', async state => {
  if (state === 'missing') workflow = null;
  if (state === 'draft') workflow.status = 'draft';
  if (state === 'unsigned') workflow.signed_at = null;
  if (state === 'wrong_signer') workflow.signed_by_user_id = 99;
  if (state === 'wrong_agency') workflow.agency_id = 6;
  if (state === 'wrong_appointment') workflow.appointment_id = 18;
  expect(await prepare()).toBeNull();
  expect(dependencies.review).not.toHaveBeenCalled();
});
it.each([{ eventType: 'no_show' }, { eventType: 'rescheduled' }, { notificationMode: 'none' }, { signatureConfirmed: false },
  { suppressionReason: 'Retrospective record correction.' }, { cancellationActorRole: 'guardian' },
  { reviewedCancellation: true }, { reviewedCancellationToken: 'opaque-day-token' }, { notificationRecipients: [] }])
('does not elevate suppressed, unsigned, guardian or day-workflow facts %j', async changed => {
  Object.assign(facts, changed);
  expect(await prepare()).toBeNull();
});
it('requires the current canceled appointment and current client participation', async () => {
  appointment.status = 'scheduled'; expect(await prepare()).toBeNull();
  appointment.status = 'no_show'; expect(await prepare()).toBeNull();
  appointment.status = 'canceled'; dependencies.participants.mockResolvedValue([]); expect(await prepare()).toBeNull();
});
it('supports mysql Date signatures, a completed workflow and a missing-contact snapshot', async () => {
  workflow.signed_at = new Date('2026-11-04T15:00:00Z'); workflow.status = 'completed';
  review = { mode: 'client', contacts: [{ key: 'client', userId: null, email: '' }], recipients: [{ key: 'client', userId: null, email: '' }] };
  expect(await prepare()).toMatchObject({ signedAt: snapshot.signedAt, mode: 'client', recipients: [{ email: '' }] });
});
it('never accepts raw caller snapshots or a template alone as proof', async () => {
  expect(await context({ existingCommunicationId: null, individualCancellationReview: snapshot })).toBeNull();
  expect(await context({ templateType: 'session_change' })).toBeNull();
  delete payload.individualCancellationReview;
  expect(await context({ individualCancellationReview: snapshot })).toBeNull();
  delete metadata.scheduleNoticeBatchId;
  expect(await context({ individualCancellationReview: snapshot })).toBeNull();
});
it('allows the first encrypted signed email before sender copy metadata is stored', async () => {
  expect(await context({}, { verifyEnvelope: true })).toMatchObject({ providerId: 776, actorUserId: 776, individualCancellation: true,
    plan: { facts: { providerAuthored: true } } });
  expect(dependencies.decrypt).toHaveBeenCalledWith(expect.stringContaining('encrypted:'));
  expect(dependencies.currentRecipient).toHaveBeenCalledWith(8, 2, snapshot.recipients[0], snapshot.contacts);
});
it('reloads persisted authority on a later staff retry and preserves the original signer', async () => {
  workflow.status = 'completed'; rows[0].status = 'processed'; metadata.cc = ['support@itsco.health'];
  expect(await context({ generatedByUserId: 99, individualCancellationReview: { ...snapshot, providerId: 99 } }, { verifyEnvelope: true }))
    .toMatchObject({ providerId: 776, actorUserId: 776 });
});
it('identifies a staff cancellation on behalf of the provider without impersonating the provider', async () => {
  workflow.signed_by_user_id = 99; rows[0].created_by_user_id = 99; communication.generated_by_user_id = 99;
  payload.individualCancellationReview = await prepareIndividualCancellationReview({ appointment, clientId: 8, actorUserId: 99 }, dependencies);
  expect(await context({ generatedByUserId: 99 })).toMatchObject({ actorUserId: 99, plan: { facts: { providerAuthored: false } } });
});
it.each([{ agencyId: 6 }, { clientId: 9 }, { to: 'outsider@example.test' }, { to: ['parent1@example.test', 'parent2@example.test'] }])
('rejects changed communication scope or destination %j', async changed => {
  await expect(context(changed)).rejects.toHaveProperty('status', 403);
});
it.each(['agency', 'client', 'provider', 'actor', 'batch', 'status', 'event', 'communication_actor', 'appointment_list'])
('rejects a mismatched persisted %s', async changed => {
  if (changed === 'agency') rows[0].agency_id = 6;
  if (changed === 'client') rows[0].client_id = 9;
  if (changed === 'provider') rows[0].provider_id = 99;
  if (changed === 'actor') rows[0].created_by_user_id = 99;
  if (changed === 'batch') rows[0].batch_id = 42;
  if (changed === 'status') rows[0].status = 'superseded';
  if (changed === 'event') rows[0].event_type = 'created';
  if (changed === 'communication_actor') communication.generated_by_user_id = 99;
  if (changed === 'appointment_list') metadata.appointmentIds = [17, 18];
  await expect(context()).rejects.toHaveProperty('status', 403);
});
it.each(['facts', 'signature', 'workflow_status', 'appointment_status', 'provider', 'participant'])
('revalidates the current %s even when the stored signature snapshot once matched', async changed => {
  if (changed === 'facts') facts.clientFacingReason = 'A changed decision';
  if (changed === 'signature') workflow.signed_at = '2026-11-04 16:00:00';
  if (changed === 'workflow_status') workflow.status = 'draft';
  if (changed === 'appointment_status') appointment.status = 'confirmed';
  if (changed === 'provider') appointment.providerUserId = 99;
  if (changed === 'participant') dependencies.participants.mockResolvedValue([]);
  await expect(context()).rejects.toHaveProperty('status', 403);
});
it('hashes saved facts independently of JSON key order and permits server fallback follow-up wording', async () => {
  facts.followUpAction = 'private_slots';
  payload.individualCancellationReview = await prepare();
  payload.facts = { ...facts, followUpAction: 'keep_next_or_support' };
  facts = Object.fromEntries(Object.entries(facts).reverse());
  expect(await context()).toMatchObject({ individualCancellation: true });
});
it('denies removed/revoked caregivers, changed source addresses and actual opt-outs through a fresh current lookup', async () => {
  dependencies.currentRecipient.mockResolvedValue(false);
  await expect(context({}, { verifyEnvelope: true })).rejects.toThrow('contact or notification permission has changed');
  expect(dependencies.currentRecipient).toHaveBeenCalledWith(8, 2, expect.objectContaining({ key: 'guardian:1' }), snapshot.contacts);
});
it('requires every destination to be in the saved selected recipients', async () => {
  payload.individualCancellationReview.recipients = [snapshot.recipients[1]];
  await expect(context()).rejects.toThrow('contact or notification permission has changed');
});
it('rejects a mixed batch instead of granting unsigned notices the signed exception', async () => {
  rows.push({ ...rows[0], id: 42, payload_json: `encrypted:${JSON.stringify({ eventType: 'canceled', facts })}` });
  await expect(context()).rejects.toThrow('does not authorize');
});
it('fails closed for missing or unreadable persisted notice data', async () => {
  rows[0].payload_json = 'corrupt'; await expect(context()).rejects.toThrow('could not be read');
  rows = []; await expect(context()).rejects.toThrow('no longer available');
});
it.each([{ cc: null }, { cc: ['outsider@example.test'] }, { cc: ['support@itsco.health', 'outsider@example.test'] },
  { bcc: 'outsider@example.test' }])('requires the exact actual support copy and rejects BCC %j', async changed => {
  await expect(context(changed, { verifyEnvelope: true })).rejects.toThrow('approved support mailbox');
});
it.each([{ cc: ['outsider@example.test'] }, { cc: null }, { bcc: ['outsider@example.test'] }])
('rejects saved retry copy tampering even if the actual envelope looks safe %j', async changed => {
  Object.assign(metadata, changed);
  await expect(context({}, { verifyEnvelope: true })).rejects.toThrow('approved support mailbox');
});
