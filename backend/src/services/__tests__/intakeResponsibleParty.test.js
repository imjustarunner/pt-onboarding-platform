import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../clientBillingAccount.service.js', () => ({ saveResponsibleParty: vi.fn() }));
import { normalizeIntakeResponsibleParty } from '../../utils/intakeResponsibleParty.js';
import { recordIntakeResponsibleParty } from '../intakeResponsibleParty.service.js';

const contact = { fullName: 'Synthetic Billing Contact', email: 'billing@example.test', phone: '7195550101', address: '123 Synthetic St', city: 'Example', state: 'CO', postalCode: '80000' };
const input = { agencyId: 2, clientId: 4, submissionId: 9, guardianUserId: 20 };
const dependencies = () => ({ db: { execute: vi.fn(async () => [[]]) }, save: vi.fn(async () => ({ saved: true, revision: 1 })) });

it('retains an unselected responsible party as a portal todo without creating any billing record', async () => {
  const deps = dependencies();
  expect(await recordIntakeResponsibleParty(input, deps)).toMatchObject({ saved: false, needsFollowup: true });
  expect(deps.db.execute).not.toHaveBeenCalled(); expect(deps.save).not.toHaveBeenCalled();
});

it('binds Me to the saved submission account rather than a browser-supplied identity', async () => {
  const deps = dependencies();
  await recordIntakeResponsibleParty({ ...input, paymentInfo: { responsibleParty: { kind: 'applicant', userId: 999 } } }, deps);
  expect(deps.save).toHaveBeenCalledWith({ agencyId: 2, clientId: 4, party: { kind: 'account', userId: 20 }, revision: 0, actorUserId: 20 });
});

it('requires complete information for someone else and never creates their account or access', async () => {
  const deps = dependencies();
  for (const patch of [{ email: '' }, { phone: '' }, { address: '' }, { postalCode: '' }, { email: 'invalid' }]) {
    expect(() => normalizeIntakeResponsibleParty({ kind: 'other', contact: { ...contact, ...patch } })).toThrow();
  }
  await recordIntakeResponsibleParty({ ...input, paymentInfo: { responsibleParty: { kind: 'other', contact } } }, deps);
  expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ party: { kind: 'other', contact }, actorUserId: 20 }));
});

it('preserves a previously reviewed billing party and handles a concurrent selection without replacing it', async () => {
  const deps = dependencies(); deps.db.execute.mockResolvedValueOnce([[{ revision: 3 }]]);
  expect(await recordIntakeResponsibleParty({ ...input, paymentInfo: { responsibleParty: { kind: 'applicant' } } }, deps)).toMatchObject({ preserved: true });
  expect(deps.save).not.toHaveBeenCalled();
  deps.save.mockRejectedValueOnce(Object.assign(new Error('Changed'), { status: 409 }));
  expect(await recordIntakeResponsibleParty({ ...input, paymentInfo: { responsibleParty: { kind: 'applicant' } } }, deps)).toMatchObject({ preserved: true });
});

it('keeps an unlinked public applicant pending without attributing an update to a supplied human ID', async () => {
  const deps = dependencies();
  const result = await recordIntakeResponsibleParty({ ...input, guardianUserId: null, paymentInfo: { responsibleParty: { kind: 'applicant', userId: 999 } } }, deps);
  expect(result).toMatchObject({ saved: false, needsFollowup: true, reason: 'responsible_party_account_pending' });
  expect(deps.save).not.toHaveBeenCalled();
});
