import { afterEach, expect, it, vi } from 'vitest';
import { relaySelected, relayConfiguration } from '../workspaceRelayConfig.js';
import { verifyWorkspaceRelaySender } from '../workspaceRelaySender.js';
import { deliverWorkspaceMime } from '../workspaceMimeDelivery.js';
import { buildMimeMessage, base64UrlEncode } from '../unifiedEmail/mime.js';

const env = { WORKSPACE_EMAIL_RELAY_MODE: 'pilot', WORKSPACE_EMAIL_RELAY_SENDERS: 'billing@practice.example', WORKSPACE_EMAIL_RELAY_DOMAINS: 'practice.example', WORKSPACE_EMAIL_RELAY_URL: 'https://workspace-relay-123.us-west3.run.app', WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED: 'true' };
const input = () => ({ fromEmail: 'billing@practice.example', communicationId: 42,
  requestBody: { raw: base64UrlEncode(buildMimeMessage({ from: 'Practice Billing <billing@practice.example>', to: 'payer@example.com', bcc: 'staff@practice.example', subject: 'Synthetic receipt', html: '<p>Paid $25.00</p>', replyTo: 'billing@practice.example', attachments: [{ filename: 'receipt.pdf', contentType: 'application/pdf', contentBase64: 'JVBERg==' }] })) } });
function dependencies() {
  const gmail = { users: { messages: { send: vi.fn().mockResolvedValue({ data: { id: 'gmail-existing' } }), list: vi.fn().mockResolvedValue({ data: { messages: [] } }), import: vi.fn().mockResolvedValue({ data: { id: 'gmail-archive', threadId: 'gmail-thread' } }) } } };
  const client = { request: vi.fn().mockResolvedValue({ data: { status: 'accepted', id: 'relay-42', messageId: '<comm-42@practice.example>' } }) };
  return { gmail, client, verifySender: vi.fn().mockResolvedValue({}) };
}
afterEach(() => vi.unstubAllEnvs());
it('keeps relay off by default and selects only the explicit pilot', () => {
  expect(relaySelected('billing@practice.example', {})).toBe(false);
  expect(relaySelected('billing@practice.example', env)).toBe(true);
  expect(relaySelected('other@practice.example', env)).toBe(false);
  expect(relaySelected('billing@other.example', env)).toBe(false);
  expect(relaySelected('newstaff@practice.example', { ...env, WORKSPACE_EMAIL_RELAY_MODE: 'domains' })).toBe(true);
});
it('rejects missing administrator confirmation and unsafe dispatch URLs', () => {
  expect(() => relayConfiguration({ ...env, WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED: 'false' })).toThrow('administrator');
  for (const url of ['http://workspace.run.app', 'https://evil.example', 'https://run.app.evil.example', 'https://x.run.app/send', 'https://user:pass@x.run.app/', 'https://x.run.app/?token=secret']) expect(() => relayConfiguration({ ...env, WORKSPACE_EMAIL_RELAY_URL: url })).toThrow('Cloud Run');
});
it('preserves the Gmail transport when a sender is outside the pilot', async () => {
  const d = dependencies();
  expect(await deliverWorkspaceMime({ ...input(), fromEmail: 'other@practice.example', gmail: d.gmail }, { ...d, env })).toEqual({ data: { id: 'gmail-existing' } });
  expect(d.client.request).not.toHaveBeenCalled();
});
it('preserves inline content, real PDF, Group sender, reply address and Sent copy through relay', async () => {
  const d = dependencies();
  const result = await deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env });
  const request = d.client.request.mock.calls[0][0];
  expect(request).toMatchObject({ method: 'POST', retry: false, data: { key: 'communication:42', from: 'billing@practice.example' } });
  const mime = Buffer.from(request.data.raw, 'base64url').toString();
  expect(mime).toContain('Message-ID: <comm-42@practice.example>');
  expect(mime).toContain('Reply-To: billing@practice.example');
  expect(mime).toContain('application/pdf'); expect(mime).toContain('JVBERg=='); expect(mime).toContain('Paid $25.00');
  expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
  expect(result).toMatchObject({ data: { id: 'gmail-archive', relay: { accepted: true, archivePending: false } } });
});
it('requires a saved communication and verified Group before dispatch', async () => {
  const d = dependencies();
  await expect(deliverWorkspaceMime({ ...input(), communicationId: null, gmail: d.gmail }, { ...d, env })).rejects.toMatchObject({ code: 'EMAIL_RELAY_LOG_REQUIRED' });
  d.verifySender.mockRejectedValue(new Error('Group not verified'));
  await expect(deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env })).rejects.toThrow('Group not verified');
  expect(d.client.request).not.toHaveBeenCalled();
});
it('never falls back to Gmail or retries a timed-out relay send automatically', async () => {
  const d = dependencies(); d.client.request.mockRejectedValue(new Error('Timeout after DATA'));
  await expect(deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env })).rejects.toMatchObject({ code: 'EMAIL_RELAY_DELIVERY_UNKNOWN', communicationId: 42 });
  expect(d.client.request).toHaveBeenCalledOnce(); expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
});
it('reports SMTP acceptance even if Gmail archival fails, without sending again', async () => {
  const d = dependencies(); d.gmail.users.messages.import.mockRejectedValue(new Error('Mailbox busy'));
  expect(await deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env })).toMatchObject({ data: { id: 'relay-42', relay: { archivePending: true, accepted: true } } });
  expect(d.client.request).toHaveBeenCalledOnce(); expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
});
it('reuses a located Sent copy instead of importing another on an accepted retry', async () => {
  const d = dependencies(); d.gmail.users.messages.list.mockResolvedValue({ data: { messages: [{ id: 'old-archive', threadId: 'old-thread' }] } });
  expect(await deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env })).toMatchObject({ data: { id: 'old-archive' } });
  expect(d.gmail.users.messages.import).not.toHaveBeenCalled();
});
it('holds archival if the Sent search itself failed and retains partial acceptance evidence', async () => {
  const d = dependencies(); d.gmail.users.messages.list.mockRejectedValue(new Error('cooldown'));
  d.client.request.mockResolvedValue({ data: { status: 'accepted', id: 'relay-42', messageId: '<comm-42@practice.example>', partial: true, rejectedCount: 1 } });
  expect(await deliverWorkspaceMime({ ...input(), gmail: d.gmail }, { ...d, env })).toMatchObject({ data: { relay: { archivePending: true, partial: true, rejectedCount: 1 } } });
  expect(d.gmail.users.messages.import).not.toHaveBeenCalled();
});
it('checks active app identity, exact Group and app reply membership', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 7 }]]) };
  const directory = { getGroup: vi.fn().mockResolvedValue({ id: 'group-7', email: 'billing@practice.example' }), listGroupMembers: vi.fn().mockResolvedValue([{ email: 'ai@plottwistco.com', type: 'USER', status: 'ACTIVE' }]) };
  const verify = () => verifyWorkspaceRelaySender('billing@practice.example', { db, directory, env });
  expect(await verify()).toMatchObject({ groupId: 'group-7' });
  db.execute.mockResolvedValueOnce([[]]); await expect(verify()).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
  directory.getGroup.mockResolvedValueOnce({ id: 'other', email: 'other@practice.example' }); await expect(verify()).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
  directory.listGroupMembers.mockResolvedValueOnce([{ email: 'ai@plottwistco.com', type: 'USER', status: 'SUSPENDED' }]); await expect(verify()).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
  await expect(verifyWorkspaceRelaySender('ai@plottwistco.com', { db, directory, env })).rejects.toMatchObject({ code: 'EMAIL_SENDER_FORBIDDEN' });
});
