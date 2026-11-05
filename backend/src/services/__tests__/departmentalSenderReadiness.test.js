import { expect, it, vi } from 'vitest';
import { ensureDepartmentalSenderReady } from '../departmentalSenderReadiness.service.js';

it.each(['technology', 'compliance', 'payroll'])('provisions accepted %s send-as on the app transport with group Reply-To', async key => {
  const email = `${key}@agency.test`;
  const ensureAlias = vi.fn(async () => ({ ok: true, sendAs: { sendAsEmail: email, verificationStatus: 'accepted' } }));
  expect(await ensureDepartmentalSenderReady({ email, displayName: key }, { ensureAlias })).toEqual({ ready: true, transport: 'gmail_send_as' });
  expect(ensureAlias).toHaveBeenCalledWith({ sendAsEmail: email, displayName: key, treatAsAlias: false, replyToAddress: email });
});

it('recognizes the separately verified SMTP relay transport', async () => {
  const ensureAlias = vi.fn(async () => ({ ok: true, transport: 'workspace_smtp_relay', sendAs: { sendAsEmail: 'payroll@agency.test', verificationStatus: 'accepted' } }));
  expect(await ensureDepartmentalSenderReady({ email: 'payroll@agency.test', displayName: 'Payroll' }, { ensureAlias })).toMatchObject({ ready: true, transport: 'workspace_smtp_relay' });
});

it.each([
  { ok: true, sendAs: { sendAsEmail: 'compliance@agency.test', verificationStatus: 'pending' } },
  { ok: true, sendAs: { sendAsEmail: 'other@agency.test', verificationStatus: 'accepted' } },
  { ok: false, error: 'Alias authorization denied' }
])('does not report an unauthorized or mismatched From address as ready', async result => {
  await expect(ensureDepartmentalSenderReady({ email: 'compliance@agency.test', displayName: 'Compliance' }, { ensureAlias: async () => result })).rejects.toHaveProperty('code', 'DEPARTMENTAL_SEND_AS_NOT_READY');
});
