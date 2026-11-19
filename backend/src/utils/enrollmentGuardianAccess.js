const carePermissions = ['canViewDocs', 'canSignDocs', 'canViewLinks', 'canViewProgramMaterials', 'canViewProgress', 'canMessage'];

/** Enrolled guardians receive full care access unless the client chose privacy. */
export function enrollmentGuardianAccess(link, { confirmed = false, permissions = {}, privacyProtected = false } = {}) {
  let previous = link?.permissions_json;
  try { previous = typeof previous === 'string' ? JSON.parse(previous) : previous; }
  catch { throw Object.assign(new Error('Stored portal permissions need review before confirming enrollment access.'), { status: 409 }); }
  if (previous != null && (typeof previous !== 'object' || Array.isArray(previous))) {
    throw Object.assign(new Error('Stored portal permissions need review before confirming enrollment access.'), { status: 409 });
  }
  const p = { ...(previous || {}), ...permissions };
  const enabled = Number(link?.access_enabled) === 1;
  if (privacyProtected) return { accessEnabled: false, permissionsJson: p };
  if (confirmed) {
    for (const key of carePermissions) p[key] = true;
    for (const key of ['noView', 'noViewOtherGuardian', 'billingOnly', 'billingDetailLevel', 'beforeBillingOnly', 'coGuardianInviteRestricted']) delete p[key];
    delete p.pendingGuardianVerification;
    p.enrollmentAccessConfirmed = true;
    p.portalAccessDecision = 'care';
    p.hideOtherGuardianAnswers = true;
  }
  return { accessEnabled: confirmed || enabled, permissionsJson: p };
}
