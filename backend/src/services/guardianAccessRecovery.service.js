import User from '../models/User.model.js';
export const GUARDIAN_RECOVERY_MESSAGE = 'If this email matches a parent or guardian account, we will email a link to set or reset your password. If an invitation needs review, the care team will follow up.';
export function createGuardianAccessRecovery({ users = User,
  recover = async input => (await import('./passwordRecovery.service.js')).requestPasswordRecoveryEmail(input),
  help = async input => (await import('./coGuardianInvite.service.js')).fileGuardianAccessHelpTicket(input)
} = {}) {
  return async ({ email, orgSlug, req }) => {
    const user = await users.findByEmail(email);
    if (user?.id && ['client_guardian','guardian'].includes(String(user.role || '').toLowerCase())) {
      await recover({ email, organizationSlug: orgSlug, req, targetUser: user });
    } else {
      await help({ email, user: null, orgSlug, req });
    }
    return { message: GUARDIAN_RECOVERY_MESSAGE };
  };
}
export default createGuardianAccessRecovery();
