import { expect, it, vi } from 'vitest';
import { previewChartContactImport, resolveChartContactReview } from '../clientImportContactReview.service.js';

const scope = { agencyId: 12, clientId: 55 };
const paste = 'Edit\nCasey Example\nEmail\nnew@example.test\nMobile Phone\n303-555-0120\nRelationship\nParent';
const saved = {
  id: 31, agency_id: 12, agency_contact_id: 80, is_active: 1, contact_is_active: 1,
  contact_full_name: 'Casey Example', contact_email: 'old@example.test', contact_phone: '303-555-0199', relationship_type: 'Guardian'
};
const existingGuardian = {
  first_name: 'Casey', last_name: 'Example', email: 'old@example.test', phone: '303-555-0199',
  guardian_user_id: 81, relationship_type: 'guardian', access_enabled: 0
};
const deps = (overrides = {}) => ({
  contacts: vi.fn().mockResolvedValue([saved]),
  guardians: vi.fn().mockResolvedValue([existingGuardian]),
  intakeProfile: vi.fn().mockResolvedValue({ fullName: 'Casey Example' }),
  accounts: vi.fn().mockResolvedValue([]), ...overrides
});

it('reuses the contact by name even when its phone and email changed, and identifies the linked guardian', async () => {
  const review = await previewChartContactImport(scope, paste, { accountAccess: true }, deps());
  expect(review.needsReview).toBe(true);
  expect(review.rows[0]).toMatchObject({
    current: { id: 31, contactId: 80, email: 'old@example.test' },
    incoming: { email: 'new@example.test' },
    defaults: { email: 'incoming', phone: 'incoming' },
    accountStatus: 'linked', profileExists: true, detailsDiffer: true
  });
  expect(resolveChartContactReview(review, { token: review.token, choices: { 0: { phone: 'current' } } })[0].resolved)
    .toMatchObject({ email: 'new@example.test', phone: '303-555-0199' });
});

it('preserves saved values for missing paste fields and rejects a stale confirmation', async () => {
  const source = 'Edit\nCasey Example\nRelationship\nParent';
  const before = await previewChartContactImport(scope, source, {}, deps());
  expect(() => resolveChartContactReview(before, null)).toThrow('Review the side-by-side');
  expect(resolveChartContactReview(before, { token: before.token })[0].resolved.email).toBe('old@example.test');
  const after = await previewChartContactImport(scope, source, {}, deps({
    contacts: vi.fn().mockResolvedValue([{ ...saved, contact_email: 'changed@example.test' }])
  }));
  expect(() => resolveChartContactReview(after, { token: before.token })).toThrow('refresh the comparison');
});

it('blocks ambiguous saved contacts instead of overwriting a different person’s card', async () => {
  const review = await previewChartContactImport(scope, paste, {}, deps({
    contacts: vi.fn().mockResolvedValue([saved, { ...saved, id: 32, contact_full_name: 'Other Example', contact_email: 'new@example.test' }])
  }));
  expect(review.rows[0].blocked).toBe(true);
  expect(() => resolveChartContactReview(review, { token: review.token })).toThrow('share a name or email');
});

it('shows verified existing logins without returning an unrelated account’s details', async () => {
  const result = await previewChartContactImport(scope, paste, { accountAccess: true }, deps({
    contacts: vi.fn().mockResolvedValue([]), guardians: vi.fn().mockResolvedValue([]),
    accounts: vi.fn().mockResolvedValue([{ email: 'new@example.test', first_name: 'Casey', last_name: 'Example', role: 'client_guardian' }])
  }));
  expect(result.rows[0]).toMatchObject({ current: null, accountStatus: 'existing' });
  const conflict = await previewChartContactImport(scope, paste, { accountAccess: true }, deps({
    accounts: vi.fn().mockResolvedValue([{ email: 'new@example.test', first_name: 'Different', last_name: 'Person', role: 'client_guardian' }])
  }));
  expect(conflict.rows[0].accountStatus).toBe('review');
  expect(JSON.stringify(conflict)).not.toContain('Different');
});

it('does not look up portal accounts for staff with contact-only access', async () => {
  const directory = deps();
  await previewChartContactImport(scope, paste, { accountAccess: false }, directory);
  expect(directory.accounts).not.toHaveBeenCalled();
  expect(directory.guardians).not.toHaveBeenCalled();
});
