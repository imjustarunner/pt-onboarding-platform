import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { PASSWORD_RECOVERY_SUPPORT_MESSAGE } from '../services/passwordRecoveryPolicy.service.js';

export const createSchoolStaffRecoveryHandler = (hasSchoolAccess) => async (req, res, next) => {
  try {
    const orgId = Number(req.params.organizationId);
    const targetUserId = Number(req.params.userId);
    if (!Number.isSafeInteger(orgId) || orgId <= 0 || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid organizationId or userId' } });
    }

    const actorId = req.user?.id;
    const actorRole = String(req.user?.role || '').toLowerCase();
    const allowedRoles = ['super_admin', 'admin', 'staff', 'support', 'clinical_practice_assistant', 'provider_plus', 'school_staff'];
    if (!allowedRoles.includes(actorRole)) {
      return res.status(403).json({ error: { message: 'Only school staff or agency staff can send school account recovery emails' } });
    }
    const hasAccess = await hasSchoolAccess({
      userId: actorId, role: actorRole, user: req.user, schoolOrganizationId: orgId
    });
    if (!hasAccess) return res.status(403).json({ error: { message: 'You do not have access to this school organization' } });

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school staff accounts can receive recovery emails from this screen' } });
    }
    if (!await User.getAgencyMembership(targetUserId, orgId)) {
      return res.status(400).json({ error: { message: 'User is not assigned to this school' } });
    }

    const school = await Agency.findById(orgId);
    const { requestPasswordRecoveryEmail } = await import('../services/passwordRecovery.service.js');
    const result = await requestPasswordRecoveryEmail({
      targetUser: user,
      email: user.email || user.username,
      organizationSlug: school?.portal_url || school?.slug,
      generatedByUserId: actorId,
      req
    });
    if (result.outcome === 'support_requested') {
      return res.json({ ok: true, emailSent: false, message: PASSWORD_RECOVERY_SUPPORT_MESSAGE });
    }
    if (result.outcome !== 'sent') {
      return res.status(result.outcome === 'sso_required' ? 409 : 502).json({
        error: { message: result.outcome === 'sso_required'
          ? 'Password recovery is disabled for SSO accounts. Use Google sign-in.'
          : 'The recovery email was not sent. Please try again or contact your administrator.' }
      });
    }
    return res.json({
      ok: true,
      emailSent: true,
      message: 'Recovery email sent. They can ignore it if no change is needed. Their password stays the same until they open the email link and save a new password.'
    });
  } catch (error) {
    next(error);
  }
};
