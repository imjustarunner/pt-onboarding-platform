// These guards only narrow existing authorization on explicitly registered
// clinical-content and agency-configuration endpoints. They grant no access.
export const isSupportActor = user => String(user?.role || '').trim().toLowerCase() === 'support';
export function excludeSupportClinicalContent(req, res, next) {
  if (isSupportActor(req.user)) return res.status(403).json({ error: {
    code: 'SUPPORT_CLINICAL_CONTENT_RESTRICTED',
    message: 'Support can view documentation status, but cannot open clinical records.'
  } });
  return next();
}

// Families use guardian-portal endpoints, which enforce signer ownership or an
// explicit recipient share. The staff chart endpoints expose the whole chart.
export function excludeFamilyClinicalWorkspace(req, res, next) {
  if (['client_guardian', 'guardian', 'client'].includes(String(req.user?.role || '').trim().toLowerCase())) {
    return res.status(403).json({ error: {
      code: 'FAMILY_CLINICAL_WORKSPACE_RESTRICTED',
      message: 'Use your family portal to view your own enrollment or files shared with you.'
    } });
  }
  return next();
}
export function excludeSupportSettings(req, res, next) {
  if (isSupportActor(req.user)) return res.status(403).json({ error: {
    code: 'SUPPORT_SETTINGS_RESTRICTED', message: 'Administrator access is required for agency configuration.'
  } });
  return next();
}

export function supportOwnAccountOnly(req, res, next) {
  if (isSupportActor(req.user) && req.params?.id != null && Number(req.params.id) !== Number(req.user.id)) {
    return excludeSupportSettings(req, res, next);
  }
  return next();
}

// Staff provisioning, role changes and permission grants belong to the owner.
// Support can still edit its own ordinary profile, with downstream validation.
export function supportProfileUpdateOnly(req, res, next) {
  if (!isSupportActor(req.user)) return next();
  const allowed = new Set(['preferredName','firstName','lastName','personalPhone','workPhone','workPhoneExtension',
    'homeStreetAddress','homeAddressLine2','homeCity','homeState','homePostalCode']);
  if (Number(req.params?.id) !== Number(req.user.id) || Object.keys(req.body || {}).some(key => !allowed.has(key))) {
    return excludeSupportSettings(req, res, next);
  }
  return next();
}

// Account provisioning is not a support, provider, or staff capability.
export function requireAccountAdministrator(req, res, next) {
  if (!['admin', 'super_admin'].includes(String(req.user?.role || '').trim().toLowerCase())) {
    return res.status(403).json({ error: { code: 'ACCOUNT_ADMIN_REQUIRED', message: 'An administrator must manage user accounts.' } });
  }
  return next();
}
