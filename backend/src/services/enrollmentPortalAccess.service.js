import User from '../models/User.model.js';
import { requestPasswordRecoveryEmail } from './passwordRecovery.service.js';
import { clientPortalInviteUrl, intakeClientPortal } from './clientPortalContext.service.js';

export async function enrollmentPortalAccess({ submission, agency, schoolOrganizationId, enrollmentChannel, sendSetupEmail, invitationDeferred, req }, { users = User, recover = requestPasswordRecoveryEmail } = {}) {
  const fail = message => Object.assign(new Error(message), { status:409 });
  if (submission?.status !== 'submitted' || !submission.guardian_user_id) throw fail('Portal access is available after enrollment is submitted and the account is linked.');
  if ((invitationDeferred || schoolOrganizationId) && sendSetupEmail !== true) return { invitationDeferred: true, deliveryStatus: 'not_requested',
    note: 'Portal setup is optional. You may request a password setup email now or wait for your care team’s invitation.' };
  const guardian = await users.findById(submission.guardian_user_id);
  if (!guardian || guardian.role !== 'client_guardian') throw fail('Please contact the agency for help with portal access.');
  let deliveryStatus = null;
  if (sendSetupEmail === true) {
    const result = await recover({ targetUser:guardian, email:guardian.email, organizationSlug:agency?.portal_url || agency?.slug, req,
      enrollment: { agencyId: agency?.id, channel: enrollmentChannel, schoolOrganizationId:schoolOrganizationId || null } });
    deliveryStatus = result.deliveryStatus || result.outcome;
  }
  // A session is not proof of email ownership. Never disclose tokens/passwords.
  return { username:guardian.email,portalLoginUrl:clientPortalInviteUrl({portal:intakeClientPortal(agency,{channel:enrollmentChannel,school:!!schoolOrganizationId}),existingAccount:true}),needsPasswordSetup:!guardian.password_hash,deliveryStatus,
    note:'Open the setup link in your email to choose a password. Existing account passwords remain unchanged.' };
}
