import { expect, it } from 'vitest';
import { enrollmentGuardianAccess } from '../enrollmentGuardianAccess.js';

it('gives a completed enrollment guardian the normal care permissions', () => {
  expect(enrollmentGuardianAccess(null, { confirmed: true })).toMatchObject({ accessEnabled: true, permissionsJson: {
    canViewDocs: true, canSignDocs: true, canViewLinks: true, canViewProgramMaterials: true, canViewProgress: true, canMessage: true
  } });
});
it.each([{ intakeLinkGuardianProfile: true }, { intakeLink: 4 }, { pendingGuardianVerification: true, accountPreparationSource: 'saved_guardian_contact' }])(
  'confirms a system-prepared guardian only after a complete packet: %j', permissions_json => {
    const link = { access_enabled: 0, permissions_json };
    expect(enrollmentGuardianAccess(link).accessEnabled).toBe(false);
    const result = enrollmentGuardianAccess(link, { confirmed: true });
    expect(result.accessEnabled).toBe(true);
    expect(result.permissionsJson.pendingGuardianVerification).toBeUndefined();
    expect(result.permissionsJson.canMessage).toBe(true);
  }
);
it.each([{ noView: true }, { noViewOtherGuardian: true }, { billingOnly: true }, { coGuardianInviteRestricted: true }, { portalAccessDecision: 'none' }])(
  'replaces old portal settings with full care access after confirmed enrollment: %j', restrictions => {
    const permissions_json = { intakeLinkGuardianProfile: true, ...restrictions };
    const result = enrollmentGuardianAccess({ access_enabled: 0, permissions_json }, { confirmed: true });
    expect(result).toMatchObject({ accessEnabled: true, permissionsJson: {canViewDocs:true,canMessage:true,enrollmentAccessConfirmed:true,portalAccessDecision:'care',hideOtherGuardianAnswers:true} });
    expect(result.permissionsJson.noView).toBeUndefined();expect(result.permissionsJson.billingOnly).toBeUndefined();
  }
);
it('uses completed enrollment to confirm an existing guardian even without an old preparation marker', () => {
  expect(enrollmentGuardianAccess({ access_enabled: 0, permissions_json: {} }, {
    confirmed: true, permissions: { intakeLinkGuardianProfile: true }
  }).accessEnabled).toBe(true);
});
it('restores full care permissions while retaining the guardian’s language', () => {
  const result = enrollmentGuardianAccess({ access_enabled: 1, permissions_json: { canViewDocs: false, portalLanguage: 'es' } }, { confirmed: true });
  expect(result).toMatchObject({ accessEnabled: true, permissionsJson: { canViewDocs: true, canMessage: true, portalLanguage: 'es' } });
});
it('keeps a recorded client privacy choice closed despite enrollment and old portal settings', () => {
  const link={access_enabled:1,permissions_json:{billingOnly:true,portalLanguage:'es'}};
  expect(enrollmentGuardianAccess(link,{confirmed:true,privacyProtected:true}))
    .toEqual({accessEnabled:false,permissionsJson:link.permissions_json});
});
it.each(['{', '[]', '"bad"'])('keeps malformed permission data closed: %s', permissions_json => {
  expect(() => enrollmentGuardianAccess({ access_enabled: 1, permissions_json }, { confirmed: true })).toThrow('need review');
});
