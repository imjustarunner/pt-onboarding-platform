import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { assertInternalEmailRecipients, checkInternalEmailRecipients } from '../internalEmailRecipients.service.js';

let agency, known;
beforeEach(() => {
  agency = { id: 2, slug: 'itsco', is_active: 1, organization_type: 'agency', feature_flags: {} };
  known = ['schools@itsco.health', 'support@itsco.health', 'paigew@itsco.health', 'espanol@itsco.health', 'outside@example.org'];
  pool.execute.mockReset().mockImplementation(async sql => sql.startsWith('SELECT id,slug') ? [[agency]] : [known.map(email => ({ email }))]);
});

it.each(['to', 'cc', 'bcc'])('blocks a misspelled internal address in %s and suggests the registered mailbox', async field => {
  const input = { agencyId: 2, to: 'parent@example.org', [field]: 'schols@itsco.health' };
  await expect(assertInternalEmailRecipients(input)).rejects.toMatchObject({
    status: 400, code: 'UNRECOGNIZED_INTERNAL_RECIPIENT',
    recipientIssues: [{ field, address: 'schols@itsco.health', suggestions: ['schools@itsco.health'] }]
  });
});

it('recognizes case-insensitive staff addresses and registered group aliases, including object envelopes', async () => {
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: [{ email: ' SCHOOLS@ITSCO.HEALTH ' }, { email: 'parent@example.org' }], cc: 'paigew@itsco.health', bcc: ['espanol@itsco.health'] })).resolves.toEqual({ domain: 'itsco.health', issues: [] });
});

it('checks every internal recipient, deduplicates within each field, and suggests transposed spellings', async () => {
  const result = await checkInternalEmailRecipients({ agencyId: 2, to: 'shcools@itsco.health; SHCOOLS@itsco.health', cc: 'supprot@itsco.health', bcc: 'no-such-mailbox@itsco.health' });
  expect(result.issues).toEqual([
    { field: 'to', address: 'shcools@itsco.health', suggestions: ['schools@itsco.health'] },
    { field: 'cc', address: 'supprot@itsco.health', suggestions: ['support@itsco.health'] },
    { field: 'bcc', address: 'no-such-mailbox@itsco.health', suggestions: [] }
  ]);
});

it('leaves external recipients alone without querying the mailbox registry', async () => {
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: 'nicola_walsh@dpsk12.net', cc: 'schools@another-agency.org' })).resolves.toMatchObject({ issues: [] });
  expect(pool.execute).toHaveBeenCalledTimes(1);
});

it('uses only the current tenant registry and never treats saved contacts or sent addresses as proof', async () => {
  await checkInternalEmailRecipients({ agencyId: 2, to: 'schols@itsco.health' });
  const [sql, params] = pool.execute.mock.calls[1];
  expect(params).toEqual([2, 2, 2, 2, 2]);
  expect(sql).toContain('r.is_active=1');
  expect(sql).toContain('COALESCE(u.is_archived,0)=0');
  expect(sql).toContain('last_synced_at IS NOT NULL');
  expect(sql).not.toMatch(/contacts|communication_messages/);
});

it('supports an explicitly configured custom agency domain without suggesting other tenants', async () => {
  agency.slug = 'custom'; agency.feature_flags = JSON.stringify({ workspaceEmailDomain: 'custom.example' });
  known = ['schools@itsco.health', 'support@custom.example'];
  const result = await checkInternalEmailRecipients({ agencyId: 2, to: 'supprot@custom.example' });
  expect(result.issues[0].suggestions).toEqual(['support@custom.example']);
});

it('does not impose an invented internal domain on an agency without managed mail', async () => {
  agency.slug = 'self-service';
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: 'anything@example.org' })).resolves.toEqual({ domain: null, issues: [] });
});

it('blocks sending on registry failure without exposing database details', async () => {
  pool.execute.mockResolvedValueOnce([[agency]]).mockRejectedValueOnce(new Error('private database details'));
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: 'schools@itsco.health' })).rejects.toMatchObject({ status: 503, code: 'INTERNAL_RECIPIENT_CHECK_UNAVAILABLE' });
});

it('does not cache a failed check or a newly registered mailbox', async () => {
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: 'new@itsco.health' })).rejects.toMatchObject({ code: 'UNRECOGNIZED_INTERNAL_RECIPIENT' });
  known.push('new@itsco.health');
  await expect(assertInternalEmailRecipients({ agencyId: 2, to: 'new@itsco.health' })).resolves.toMatchObject({ issues: [] });
});

it('bounds recipient checks before querying and accepts an empty draft', async () => {
  await expect(checkInternalEmailRecipients({ agencyId: 2, to: Array(201).fill(0).map((_, i) => `${i}@itsco.health`) })).rejects.toMatchObject({ status: 400 });
  expect(pool.execute).not.toHaveBeenCalled();
  await expect(checkInternalEmailRecipients({ agencyId: 2 })).resolves.toEqual({ domain: null, issues: [] });
});
