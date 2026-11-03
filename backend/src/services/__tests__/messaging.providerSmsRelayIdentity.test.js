import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { familyReplyCode, parseProviderReply, resolveRelayFamily } from '../providerSmsRelayIdentity.service.js';
const phone = '+16189107000';
const client = { id: 2271, initials: 'RowQaO', contact_phone: phone };
const guardian = { guardian_user_id: 1449, phone, access_enabled: 1, is_active: 1, relationship_type: 'parent', permissions_json: {} };
beforeEach(() => { ClientGuardian.listForClient.mockResolvedValue([guardian]); });
it('uses distinct identifiers for different clients and guardians, with no full names', () => {
  expect(familyReplyCode(client, 1449)).toBe('ROWQAO-2271-1449');
  expect(familyReplyCode({ ...client, id: 2272 }, 1449)).not.toBe(familyReplyCode(client, 1449));
  expect(familyReplyCode(client, 1450)).not.toBe(familyReplyCode(client, 1449));
});
it('requires the code at the start and preserves the authored reply', () => {
  expect(parseProviderReply('rowqao-2271-1449: Hello\nSee you tomorrow.')).toEqual({ code: 'ROWQAO-2271-1449', body: 'Hello\nSee you tomorrow.' });
  for (const text of ['yes', 'Hello', 'Hello ROWQAO-2271-1449', 'ROWQAO-2271-1449', 'ROWQAO hello']) expect(parseProviderReply(text)).toBeNull();
});
it('selects the exact guardian, not a different primary guardian', async () => {
  ClientGuardian.listForClient.mockResolvedValue([{ ...guardian, guardian_user_id: 1450, phone: '+12025550100' }, guardian]);
  expect(await resolveRelayFamily(client, phone)).toEqual({ phone, guardianUserId: 1449, guardian: true });
});
it('rejects duplicate phones, revoked access, inactive and restricted guardians without direct-contact fallback', async () => {
  for (const links of [[guardian, { ...guardian, guardian_user_id: 1450 }], [{ ...guardian, access_enabled: 0 }], [{ ...guardian, is_active: 0 }], [{ ...guardian, permissions_json: { canMessage: false } }]]) {
    ClientGuardian.listForClient.mockResolvedValue(links);
    expect(await resolveRelayFamily(client, phone)).toBeNull();
  }
});
it('permits an adult self contact and rejects archived clients', async () => {
  ClientGuardian.listForClient.mockResolvedValue([]);
  expect(await resolveRelayFamily(client, phone)).toEqual({ phone, guardianUserId: 0, guardian: false });
  expect(await resolveRelayFamily({ ...client, is_archived: 1 }, phone)).toBeNull();
  expect(await resolveRelayFamily(client, '+12025550100')).toBeNull();
});
