import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCodexAssistantMail, sendCodexAssistantMail } from '../codexAssistantMail.service.js';

const payload = {
  requestId: '4d7772d8-e76a-4b42-a6df-053ce47e2e97',
  agencyId: 2, from: 'technology@practice.example', replyTo: 'support@practice.example',
  to: 'family@example.net', cc: ['provider@practice.example'], subject: 'Email correction',
  text: 'Please use our work address. <Test>', portalButton: true
};
const grants = JSON.stringify({
  2: [payload.from, payload.replyTo],
  6: ['messages@another.example']
});

function fixtures() {
  const deliveries = new Map();
  const sends = [];
  const logs = [];
  const options = {
    principal: '111111111111111111111',
    configuration: grants,
    db: { async execute(sql, params) {
      if (sql.includes('FROM email_sender_identities')) {
        const [id, address] = params;
        const known = (id === 2 && [payload.from, payload.replyTo].includes(address)) ||
          (id === 6 && address === 'messages@another.example');
        return [known ? [{ id: id * 10, slug: 'practice' }] : []];
      }
      if (sql.includes('INSERT INTO codex_assistant_mail_deliveries')) {
        const [key, agency_id, , automation_subject, payload_hash] = params;
        if (deliveries.has(key)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        deliveries.set(key, { request_id: key, agency_id, automation_subject, payload_hash, status: 'sending' });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT request_id')) {
        const [key, agency, subject] = params;
        const row = deliveries.get(key);
        return [[row?.agency_id === agency && row?.automation_subject === subject ? row : null]];
      }
      const [value, key] = params;
      const field = sql.includes('SET communication_id') ? 'communication_id' : 'status';
      deliveries.get(key)[field] = value;
      return [{ affectedRows: 1 }];
    } },
    async log(entry) { logs.push(entry); return { id: 54 }; },
    async send(input) { sends.push(input); return { id: 'accepted-synthetic' }; }
  };
  return { deliveries, sends, logs, options, send: input => sendCodexAssistantMail({ ...options, input }) };
}

test('rejects extra sender and audience overrides, header injection and bulk recipients', () => {
  for (const input of [
    { ...payload, generatedByUserId: 4 },
    { ...payload, requestId: [payload.requestId] },
    { ...payload, to: 'a@example.com,b@example.com' },
    { ...payload, subject: 'Message\r\nBcc: other@example.com' },
    { ...payload, cc: ['no-address'] }
  ]) assert.throws(() => parseCodexAssistantMail(input), { status: 400 });
});

test('records the automation actor before sending from an agency-granted alias', async () => {
  const f = fixtures();
  const result = await f.send(payload);
  assert.deepEqual(result, { requestId: payload.requestId, status: 'sent', communicationId: 54, reused: false });
  const [log] = f.logs;
  assert.equal(log.generatedByUserId, undefined);
  assert.equal(log.metadata.actorType, 'automation');
  assert.equal(log.metadata.actorKey, 'codex_assistant');
  assert.equal(log.metadata.automationSubject, f.options.principal);
  const [send] = f.sends;
  assert.equal(send.source, 'manual');
  assert.equal(send.senderIdentityId, 20);
  assert.equal(send.replyToOverride, payload.replyTo);
  assert.equal(send.existingCommunicationId, 54);
  assert.match(send.html, /https:\/\/auricwell\.com\/practice\/login/);
  assert.match(send.html, /&lt;Test&gt;/);
});

test('supports another tenant using its own alias and checks Reply-To using the same grant', async () => {
  const f = fixtures();
  await assert.rejects(f.send({ ...payload, agencyId: 6 }), { code: 'MAIL_ALIAS_UNAVAILABLE' });
  await assert.rejects(f.send({ ...payload, replyTo: 'messages@another.example' }), { code: 'MAIL_ALIAS_NOT_GRANTED' });
  await assert.rejects(sendCodexAssistantMail({ ...f.options, configuration: 'null', input: payload }), { code: 'MAIL_ALIAS_NOT_GRANTED' });
  await f.send({ ...payload, agencyId: 6, from: 'messages@another.example', replyTo: null });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].senderIdentityId, 60);
  assert.equal(f.sends[0].replyToOverride, 'messages@another.example');
});

test('holds sends when an authorized alias no longer has a shared mailbox', async () => {
  const f = fixtures();
  await assert.rejects(sendCodexAssistantMail({ ...f.options, configuration: '{"2":["other@practice.example"]}',
    input: { ...payload, from: 'other@practice.example', replyTo: null } }), { code: 'MAIL_ALIAS_UNAVAILABLE' });
  assert.equal(f.logs.length, 0);
  assert.equal(f.sends.length, 0);
});

test('retains one attempt with the same request ID even when calls overlap', async () => {
  const f = fixtures();
  const [first, second] = await Promise.all([f.send(payload), f.send(payload)]);
  assert.equal(first.status, 'sent');
  assert.equal(second.reused, true);
  assert.equal((await f.send(payload)).status, 'sent');
  await assert.rejects(f.send({ ...payload, text: 'Changed scope' }), { code: 'MAIL_REQUEST_CHANGED' });
  assert.equal(f.sends.length, 1);
});

test('holds mail without an audit record and never repeats an ambiguous delivery', async () => {
  const f = fixtures();
  const second = { ...payload, requestId: 'b705bc0f-5b11-483d-93c9-37738aef51cb' };
  f.options.log = async () => null;
  assert.equal((await f.send(payload)).status, 'held');
  assert.equal(f.sends.length, 0);
  f.options.log = async () => ({ id: 90 });
  let attempts = 0;
  f.options.send = async () => { attempts++; throw new Error('delivery confirmation unavailable'); };
  assert.equal((await f.send(second)).status, 'delivery_unknown');
  assert.equal((await f.send(second)).status, 'delivery_unknown');
  assert.equal(attempts, 1);
});

test('counts no queued, skipped or redirected send as delivered', async () => {
  const f = fixtures();
  f.options.send = async () => ({ id: 'test-inbox-copy', redirected: true });
  const result = await f.send(payload);
  assert.equal(result.status, 'held');
});

test('keeps personalized account setup and reset URLs out of the general sender', () => {
  assert.throws(() => parseCodexAssistantMail({ ...payload,
    text: 'Use https://auricwell.com/practice/new_account/synthetic to set up the account.' }),
  { code: 'MAIL_CREDENTIAL_LINK' });
});

test('preflight checks the route without creating communications or sending', async () => {
  const f = fixtures();
  const result = await sendCodexAssistantMail({ ...f.options, input: payload, preflight: true });
  assert.equal(result.status, 'ready');
  assert.equal(f.deliveries.size, 0);
  assert.equal(f.logs.length, 0);
  assert.equal(f.sends.length, 0);
});

test('enrolls an agency by its stored slug, regardless of its numeric ID', async () => {
  const f = fixtures();
  const result = await sendCodexAssistantMail({ ...f.options, input: payload, preflight: true,
    configuration: JSON.stringify({ practice: [payload.from, payload.replyTo] }) });
  assert.equal(result.status, 'ready');
});

test('chooses the canonical shared department identity over a secondary workflow using the same address', async () => {
  const f = fixtures();
  const execute = f.options.db.execute;
  f.options.db.execute = async (sql, params) => {
    if (sql.includes('FROM email_sender_identities') && params[1] === payload.from) {
      assert.match(sql, /ORDER BY canonical DESC/);
      return [[{ id: 87, slug: 'practice', canonical: 1 }, { id: 88, slug: 'practice', canonical: 0 }]];
    }
    return execute(sql, params);
  };
  await f.send(payload);
  assert.equal(f.sends[0].senderIdentityId, 87);
});

test('rejects ambiguous shared identities without a canonical match', async () => {
  const f = fixtures();
  f.options.db.execute = async () => [[{ id: 87, canonical: 0 }, { id: 88, canonical: 0 }]];
  await assert.rejects(f.send(payload), { code: 'MAIL_ALIAS_UNAVAILABLE' });
  assert.equal(f.sends.length, 0);
});
