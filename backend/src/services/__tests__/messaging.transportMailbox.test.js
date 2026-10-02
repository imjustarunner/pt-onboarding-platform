import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAppEmailTransport } from '../unifiedEmail/transportMailbox.js';
const mocks = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn(), alias: vi.fn(), protect: vi.fn() }));
vi.mock('../unifiedEmail/gmailClient.js', async () => {
  const { resolveAppEmailTransport } = await import('../unifiedEmail/transportMailbox.js');
  return { getGmailClient: mocks.client, getImpersonatedUser: () => resolveAppEmailTransport() };
});
vi.mock('../activityProtection.service.js', () => ({ protectOutboundEmail: mocks.protect }));
vi.mock('../../utils/hogwartsTestEmail.js', () => ({ rewriteHogwartsOutboundRecipient: async value => value }));
import Email from '../googleWorkspaceEmail.service.js';

describe('one app email transport', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GMAIL_IMPERSONATE_USER', 'ai@plottwistco.com');
    vi.stubEnv('GOOGLE_WORKSPACE_IMPERSONATE_USER', 'directory-admin@example.test');
    mocks.client.mockResolvedValue({ users: { settings: { sendAs: { get: mocks.alias } }, messages: { send: mocks.send } } });
    mocks.alias.mockResolvedValue({data: {sendAsEmail:'notifications@tenant.test',verificationStatus:'accepted'}});
    mocks.send.mockResolvedValue({data:{id:'accepted'}});
  });
  it('defaults to AI and normalizes the explicit mailbox', () => {
    expect(resolveAppEmailTransport({})).toBe('ai@plottwistco.com');
    expect(resolveAppEmailTransport({}, ' AI@PlotTwistCo.com ')).toBe('ai@plottwistco.com');
  });
  it('keeps the dedicated Gmail account separate from directory impersonation', () => {
    expect(resolveAppEmailTransport({GMAIL_IMPERSONATE_USER:'ai@plottwistco.com',GOOGLE_WORKSPACE_IMPERSONATE_USER:'admin@example.test'})).toBe('ai@plottwistco.com');
  });
  it.each([
    [{GMAIL_IMPERSONATE_USER:'employee@example.test'},null],
    [{GOOGLE_WORKSPACE_IMPERSONATE_USER:'admin@example.test'},null],
    [{},'employee@example.test']
  ])('rejects another sending account before authentication', (env, explicit) => {
    expect(() => resolveAppEmailTransport(env,explicit)).toThrow('must use ai@plottwistco.com');
  });
  it('uses the shared Gmail transport and preserves tenant From and Reply-To in legacy sends', async () => {
    await Email.sendEmail({to:'parent@example.test',subject:'Receipt',text:'Received',fromAddress:'notifications@tenant.test',replyTo:'support@tenant.test'});
    expect(mocks.client).toHaveBeenCalledOnce();
    expect(mocks.alias).toHaveBeenCalledWith({userId:'me',sendAsEmail:'notifications@tenant.test'});
    const mime=Buffer.from(mocks.send.mock.calls[0][0].requestBody.raw,'base64url').toString();
    expect(mime).toContain('From: notifications@tenant.test');
    expect(mime).toContain('Reply-To: support@tenant.test');
    expect(mime).not.toContain('directory-admin@example.test');
  });
  it('blocks a legacy send rather than switching to an employee mailbox', async () => {
    vi.stubEnv('GMAIL_IMPERSONATE_USER','employee@example.test');
    await expect(Email.sendEmail({to:'parent@example.test',subject:'Receipt',text:'Received',fromAddress:'notifications@tenant.test'})).rejects.toHaveProperty('code','EMAIL_TRANSPORT_MISCONFIGURED');
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
