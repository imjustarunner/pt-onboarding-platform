import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), group: vi.fn(), members: vi.fn(), addMember: vi.fn(),
  auth: vi.fn(), gmail: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { getGroup: m.group,
  listGroupMembers: m.members, addGroupMember: m.addMember } }));
vi.mock('../googleWorkspaceAuth.service.js', () => ({ buildImpersonatedJwtClient: m.auth,
  GOOGLE_WORKSPACE_SCOPES: [], logGoogleUnauthorizedHint: vi.fn() }));
vi.mock('../../utils/googleApis.js', () => ({ google: { gmail: m.gmail } }));
import { ensureSendAsAlias } from '../gmailSendAs.service.js';
import { assertVerifiedGmailSender } from '../unifiedEmail/verifiedSender.js';
import { relaySelected } from '../workspaceRelayConfig.js';
import { deliverWorkspaceMime } from '../workspaceMimeDelivery.js';
import { buildMimeMessage, base64UrlEncode } from '../unifiedEmail/mime.js';

const fromEmail = 'notifications@auricwell.com';
const relayUrl = 'https://workspace-relay-123.us-west3.run.app';
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries({ WORKSPACE_EMAIL_RELAY_MODE: 'domains',
    WORKSPACE_EMAIL_RELAY_DOMAINS: 'itsco.health,auricwell.com',
    WORKSPACE_EMAIL_RELAY_GMAIL_SENDERS: 'existingstaff@itsco.health',
    WORKSPACE_EMAIL_RELAY_URL: relayUrl, WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED: 'true',
    GMAIL_IMPERSONATE_USER: 'ai@plottwistco.com', GOOGLE_WORKSPACE_IMPERSONATE_USER: 'ai@plottwistco.com' })) vi.stubEnv(key, value);
  m.execute.mockResolvedValue([[{ id: 4 }]]);
  m.group.mockResolvedValue({ id: 'auricwell-notifications-group', email: fromEmail });
  m.members.mockResolvedValue([{ email: 'ai@plottwistco.com', type: 'USER', status: 'ACTIVE' }]);
});
afterEach(() => vi.unstubAllEnvs());

function dependencies() {
  const send = vi.fn();
  const gmail = { users: { settings: { sendAs: { get: vi.fn() } }, messages: { send,
    list: vi.fn(async () => ({ data: { messages: [] } })),
    import: vi.fn(async () => ({ data: { id: 'archived-message' } })) } } };
  const client = { request: vi.fn(async () => ({ data: { status: 'accepted', id: 'relay-42', messageId: '<comm-42@auricwell.com>' } })) };
  return { gmail, client };
}
function message(gmail) {
  return { gmail, fromEmail, communicationId: 42, requestBody: { raw: base64UrlEncode(buildMimeMessage({
    from: `AuricWell Notifications <${fromEmail}>`, to: 'parent@example.test', cc: 'provider@itsco.health',
    replyTo: 'support@itsco.health', subject: 'School session notice',
    text: 'Your dependent will be seen today at school. No confirmation is needed.',
    html: '<p>Your dependent will be seen today at school. No confirmation is needed.</p>'
  })) } };
}

it('selects the AuricWell Group domain while preserving explicitly pinned existing senders', () => {
  expect(relaySelected(fromEmail)).toBe(true);
  expect(relaySelected('Notifications@AuricWell.com')).toBe(true);
  expect(relaySelected('existingstaff@itsco.health')).toBe(false);
  expect(relaySelected('notifications@foreign.example')).toBe(false);
});

it('verifies the appointment Group through SMTP relay without creating or checking a Gmail alias', async () => {
  const receipt = await ensureSendAsAlias({ sendAsEmail: fromEmail, displayName: 'AuricWell Notifications', treatAsAlias: false });
  expect(receipt).toMatchObject({ ok: true, created: false, transport: 'workspace_smtp_relay',
    groupId: 'auricwell-notifications-group', sendAs: { sendAsEmail: fromEmail, transport: 'workspace_smtp_relay' } });
  expect(m.auth).not.toHaveBeenCalled(); expect(m.gmail).not.toHaveBeenCalled();
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('is_active=1'), [fromEmail]);
  const d = dependencies();
  await assertVerifiedGmailSender(d.gmail, fromEmail);
  expect(d.gmail.users.settings.sendAs.get).not.toHaveBeenCalled();
});

it('sends the exact notification identity, provider CC and care-team Reply-To through relay', async () => {
  const d = dependencies();
  const result = await deliverWorkspaceMime(message(d.gmail), { client: d.client });
  expect(d.client.request).toHaveBeenCalledWith(expect.objectContaining({ url: `${relayUrl}/send`,
    method: 'POST', retry: false, data: expect.objectContaining({ key: 'communication:42', from: fromEmail }) }));
  const mime = Buffer.from(d.client.request.mock.calls[0][0].data.raw, 'base64url').toString();
  expect(mime).toContain(`From: "AuricWell Notifications" <${fromEmail}>`);
  expect(mime).toContain('Cc: provider@itsco.health');
  expect(mime).toContain('Reply-To: support@itsco.health');
  expect(mime).toContain('Message-ID: <comm-42@auricwell.com>');
  expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
  expect(result.data.relay).toMatchObject({ accepted: true, archivePending: false });
});

it('holds an unknown relay outcome without sending through Gmail', async () => {
  const d = dependencies(); d.client.request.mockRejectedValue(new Error('Timeout after DATA'));
  await expect(deliverWorkspaceMime(message(d.gmail), { client: d.client })).rejects.toMatchObject({
    code: 'EMAIL_RELAY_DELIVERY_UNKNOWN', communicationId: 42 });
  expect(d.client.request).toHaveBeenCalledOnce(); expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
});

it.each(['inactive identity', 'wrong Group', 'missing transport member', 'unconfirmed administrator'])
('blocks %s before any relay request or Gmail alias operation', async problem => {
  if (problem === 'inactive identity') m.execute.mockResolvedValue([[]]);
  if (problem === 'wrong Group') m.group.mockResolvedValue({ id: 'other-group', email: 'other@auricwell.com' });
  if (problem === 'missing transport member') m.members.mockResolvedValue([]);
  if (problem === 'unconfirmed administrator') vi.stubEnv('WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED', 'false');
  const d = dependencies();
  await expect(ensureSendAsAlias({ sendAsEmail: fromEmail, displayName: 'AuricWell Notifications' })).rejects.toThrow();
  await expect(deliverWorkspaceMime(message(d.gmail), { client: d.client })).rejects.toThrow();
  expect(d.client.request).not.toHaveBeenCalled(); expect(d.gmail.users.messages.send).not.toHaveBeenCalled();
  expect(m.auth).not.toHaveBeenCalled(); expect(m.gmail).not.toHaveBeenCalled();
});
