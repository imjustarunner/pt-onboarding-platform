import test from 'node:test';
import assert from 'node:assert/strict';
import { answerAppQuestion, ANSWER_READ_TOOLS } from '../assistantAnswers.service.js';
import { readAcceptingProviders, readNextClientAppointment } from '../assistantOperationalReads.service.js';

function fixture(overrides = {}) {
  const calls = [];
  const params = {
    agencyId: 7, allowedToolNames: ANSWER_READ_TOOLS,
    execute: async call => { calls.push(call); return { ok: true, tool: call.name, result: {} }; },
    detect: async () => null, format: () => 'Verified record result', research: async () => null,
    ...overrides
  };
  return { calls, ask: (prompt, extra = {}) => answerAppQuestion({ ...params, prompt, ...extra }) };
}

test('ambiguous availability asks a clarification without a presence lookup', async () => {
  const f = fixture(); const r = await f.ask('Who is free today?');
  assert.match(r.assistantText, /Chat presence does not/);
  assert.equal(r.nextActions.length, 3); assert.equal(f.calls.length, 0);
});
for (const [prompt, tool, args] of [
  ['Who is accepting clients?', 'listAcceptingProviders', {}],
  ['Who sees clients with ADHD?', 'findProvidersByApproach', { approach: 'ADHD' }],
  ['I need to refer a client to psychiatry', 'searchReferralDirectory', { query: 'psychiatry' }],
  ["When's my next client?", 'findMyNextClientAppointment', {}]
]) test(prompt, async () => {
  const f = fixture(); const r = await f.ask(prompt);
  assert.equal(f.calls[0].name, tool);
  for (const [key, value] of Object.entries(args)) assert.equal(f.calls[0].args[key], value);
  assert.equal(f.calls[0].args.agencyId, 7); assert.deepEqual(r.uiCommands, []);
});
test('kids requires age, then uses the given age rather than a guessed child band', async () => {
  const f = fixture(); const r = await f.ask('Who sees kids?');
  assert.match(r.assistantText, /How old/); assert.equal(f.calls.length, 0);
  await f.ask('15', { history: [{ role: 'assistant', text: r.assistantText }] });
  assert.equal(f.calls[0].args.approach, 'Teen (14-18)');
});
test('workflow help is actionable and does not navigate', async () => {
  const f = fixture();
  assert.match((await f.ask('How do I submit a reimbursement?')).assistantText, /receipt.*attestation/);
  assert.match((await f.ask('Who can post an announcement?')).assistantText, /Admin, Super Admin, and Support/);
  assert.match((await f.ask('Where can I send a message?')).assistantText, /Direct Messages/);
  assert.equal(f.calls.length, 0);
});
test('message recipients are scoped and ambiguous matches require user selection; never sends', async () => {
  const calls = [];
  const f = fixture({ execute: async c => { calls.push(c); return { ok: true, result: { people: [{ id: 3, name: 'Michael A' }, { id: 4, name: 'Michael B' }] } }; } });
  const r = await f.ask('Send a message to Michael');
  assert.equal(calls[0].name, 'listTeamPresence'); assert.equal(calls[0].args.nameQuery, 'Michael');
  assert.equal(r.nextActions.length, 2); assert.equal(r.nextActions[0].type, 'compose_message');
  assert.match(r.assistantText, /Nothing is sent/); assert.deepEqual(r.uiCommands, []);
});
test('permissions, missing tenant and write/navigation actions cannot be bypassed', async () => {
  const f = fixture();
  await f.ask('Who is accepting clients?', { allowedToolNames: new Set() });
  await f.ask('Who is accepting clients?', { agencyId: null });
  await f.ask('', { clientToolCalls: [{ name: 'createTask', args: {} }] });
  await f.ask('', { clientToolCalls: [{ name: 'navigateTo', args: {} }] });
  assert.equal(f.calls.length, 0);
});
test('tool arguments cannot substitute another tenant and response cannot navigate', async () => {
  const f = fixture({ detect: async () => ({ toolCalls: [{ name: 'searchProviders', args: { agencyId: 888 } }] }) });
  const r = await f.ask('Find my providers');
  assert.equal(f.calls[0].args.agencyId, 7); assert.deepEqual(r.uiCommands, []);
});
test('failed lookup is not reported as no matching people', async () => {
  const f = fixture({ execute: async () => { throw new Error('DB unavailable'); } });
  assert.match((await f.ask('Who is accepting clients?')).assistantText, /could not load/);
});
test('next appointment reports timezone and no-record limitation', async () => {
  const f = fixture({ execute: async () => ({ ok: true, result: { appointment: { start_at: '2026-09-29T16:00:00Z', source_timezone: 'America/Denver', status: 'confirmed', title: 'Client appointment' } } }) });
  assert.match((await f.ask('When is my next client?')).assistantText, /America\/Denver/);
  assert.match((await fixture().ask('When is my next client?')).assistantText, /external calendar/);
});
test('operational queries scope accepting status and appointments to tenant and signed-in provider', async () => {
  const calls = []; const db = { execute: async (...args) => { calls.push(args); return [[]]; } };
  await readAcceptingProviders(db, 7); await readNextClientAppointment(db, 7, 501);
  assert.match(calls[0][0], /provider_accepting_new_clients = 1/);
  assert.match(calls[0][0], /ua.is_active/); assert.deepEqual(calls[0][1], [7]);
  assert.match(calls[1][0], /a.provider_user_id = \?/);
  assert.match(calls[1][0], /appointment_participants/); assert.match(calls[1][0], /a.status IN/);
  assert.deepEqual(calls[1][1], [7, 7, 501]);
});

test('multiple specialty matches include names and evidence, not a navigation-only count', async () => {
  const f = fixture({ execute: async () => ({ ok: true, result: { approach: 'ADHD', providers: [
    { id: 1, name: 'Alex One', matchedFieldLabel: 'Specialty', matchedOption: 'ADHD' },
    { id: 2, name: 'Sam Two', matchedFieldLabel: 'Mental health focus', matchedOption: 'ADHD' }
  ] } }) });
  const r = await f.ask('Who sees clients with ADHD?');
  assert.match(r.assistantText, /Alex One/); assert.match(r.assistantText, /Sam Two/);
  assert.match(r.assistantText, /Specialty/); assert.doesNotMatch(r.assistantText, /Pick one to open/);
});
test('message content remains an unsent draft', async () => {
  const f = fixture({ execute: async () => ({ ok: true, result: { people: [{ id: 4, name: 'Michael' }] } }) });
  const r = await f.ask('Send a message to Michael saying Can we talk?');
  assert.equal(r.nextActions[0].draft, 'Can we talk?');
  assert.equal(r.nextActions[0].type, 'compose_message');
  assert.deepEqual(r.uiCommands, []);
});
