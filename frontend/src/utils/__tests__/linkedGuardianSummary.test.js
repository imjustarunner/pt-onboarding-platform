import { describe, expect, it } from 'vitest';
import { linkedGuardianSummary } from '../linkedGuardianSummary.js';
const parent = { guardian_user_id: 1437, access_enabled: 1, is_active: 1, relationship_type: 'guardian',
  first_name: 'Dana', last_name: 'QA', email: 'testing@itsco.health' };
describe('linked guardian overview for a chart without an enrollment profile', () => {
  it('shows the actual linked contact used by the contact plan without inventing intake answers', () => {
    expect(linkedGuardianSummary([parent], { canView: true })).toEqual({ displayName: 'Dana QA', contact: 'testing@itsco.health', additionalCount: 0 });
    expect(parent).not.toHaveProperty('guardian_intake_profile');
  });
  it('fails closed when the viewer cannot open guardian links', () => {
    expect(linkedGuardianSummary([parent])).toBeNull();
    expect(linkedGuardianSummary([parent], { canView: false })).toBeNull();
  });
  it('does not show disabled, inactive or self-enrollment links as a guardian', () => {
    expect(linkedGuardianSummary([{ ...parent, access_enabled: 0 }, { ...parent, is_active: 0 },
      { ...parent, relationship_type: 'self' }], { canView: true })).toBeNull();
  });
  it('keeps a second guardian visible as another link without combining private profile fields', () => {
    expect(linkedGuardianSummary([parent, { ...parent, guardian_user_id: 1501, first_name: 'Other' }], { canView: true }))
      .toMatchObject({ displayName: 'Dana QA', additionalCount: 1 });
  });
});
