import { describe, expect, it, vi } from 'vitest';
import { routeAccountSecurityMail } from '../accountSecurityMailRouting.service.js';

vi.mock('../../config/database.js', () => ({ default: {} }));

function fixture() {
  const receivedAt = new Date('2026-11-20T16:00:00Z');
  const cutoff = new Date('2026-11-20T15:00:00Z');
  const headers = [
    { name: 'From', value: 'no-reply@grasshopper.com' },
    { name: 'To', value: 'support@itsco.health' },
    { name: 'Message-ID', value: '<example-message@grasshopper.com>' },
    { name: 'Authentication-Results', value: 'mx.google.com; dmarc=pass header.from=grasshopper.com' }
  ];
  const send = vi.fn().mockResolvedValue({ data: { id: 'synthetic-gmail-receipt' } });
  const input = {
    identity: { identity_key: 'support', is_active: 1, agency_id: 2, from_email: 'support@itsco.health' },
    subject: '[Grasshopper] One Time Password', fromEmail: 'no-reply@grasshopper.com',
    matchedAddress: 'support@itsco.health', receivedAt, gmail: { users: { messages: { send } } },
    payload: { headers, mimeType: 'text/plain', body: { data: Buffer.from('Synthetic account notice.').toString('base64url') } }
  };
  const tenant = { id: 2, slug: 'itsco', is_active: 1, organization_type: 'agency', admin_email: 'admin@itsco.health' };
  const receipt = { id: null, state: null };
  const database = { execute: vi.fn(async (sql, parameters) => {
    if (sql.includes('FROM agencies a')) return [[...(parameters[0] >= cutoff ? [tenant] : [])]];
    if (sql.startsWith('INSERT IGNORE')) {
      if (receipt.id) return [{ affectedRows: 0 }];
      receipt.id = parameters[2];
      receipt.state = 'sending';
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT 1 FROM account_security_mail_forwards')) return [[...(parameters[0] === receipt.id ? [1] : [])]];
    if (sql.startsWith('SELECT state')) return [[{ state: receipt.state }]];
    if (sql.startsWith('UPDATE')) { receipt.state = sql.includes("'sent'") ? 'sent' : 'review'; return [{}]; }
    throw new Error('Unexpected database call');
  }) };
  return { input, send, headers, tenant, receipt, database };
}

describe('account security mail for managed shared inboxes', () => {
  it('uses the receiving tenant’s admin group and forwards the same message only once', async () => {
    const { input, send, database, receipt, headers } = fixture();
    expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: true });
    await routeAccountSecurityMail(input, database);
    expect(send).toHaveBeenCalledOnce();
    const mime = Buffer.from(send.mock.calls[0][0].requestBody.raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: admin@itsco.health\r\n');
    expect(mime).toContain(Buffer.from('Account security email for support@itsco.health\nFrom: no-reply@grasshopper.com\n\nSynthetic account notice.').toString('base64').slice(0, 76));
    expect(receipt.state).toBe('sent');
    headers.find(h => h.name === 'Message-ID').value = receipt.id;
    expect(await routeAccountSecurityMail({ ...input, identity: null, subject: 'Forwarded copy' }, database)).toEqual({ handled: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it.each(['old mail', 'another agency admin', 'forged sender', 'conversation reply', 'personal copy'])('leaves %s out of forwarding', async scenario => {
    const { input, send, database, tenant, headers } = fixture();
    if (scenario === 'old mail') input.receivedAt = new Date('2026-11-19T16:00:00Z');
    if (scenario === 'another agency admin') tenant.admin_email = 'admin@another.example';
    if (scenario === 'forged sender') headers[3].value = 'mx.google.com; dmarc=fail header.from=grasshopper.com';
    if (scenario === 'conversation reply') headers.push({ name: 'In-Reply-To', value: '<earlier@example.test>' });
    if (scenario === 'personal copy') headers.push({ name: 'Cc', value: 'personal@example.test' });
    expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('requires authenticated tenant group mail and the original provider’s proof when Google Groups rewrites From', async () => {
    const { input, headers, database, send } = fixture();
    headers[0].value = 'Grasshopper via Support <support@itsco.health>';
    headers[3].value = 'mx.google.com; arc=pass (i=1 dkim=pass dkdomain=grasshopper.com dmarc=pass fromdomain=grasshopper.com); dmarc=fail header.from=itsco.health';
    expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: false });
    headers[3].value = headers[3].value.replace('dmarc=fail', 'dmarc=pass');
    expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('flags uncertain delivery for review and avoids replaying the send', async () => {
    const { input, database, send } = fixture();
    send.mockRejectedValue(new Error('Unknown Gmail outcome'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: true, review: true });
      expect(await routeAccountSecurityMail(input, database)).toEqual({ handled: true, review: true });
      expect(send).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); }
  });
});
