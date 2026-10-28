import pool from '../config/database.js';
import User from '../models/User.model.js';
import { requestPasswordRecoveryEmail } from './passwordRecovery.service.js';
import { clientPortalInviteUrl, intakeClientPortal } from './clientPortalContext.service.js';

export async function enrollmentPortalAccess({ submission, agency, schoolOrganizationId, enrollmentChannel, sendSetupEmail, invitationDeferred, req }, { users = User, recover = requestPasswordRecoveryEmail, db = pool } = {}) {
  const fail = message => Object.assign(new Error(message), { status:409 });
  if (submission?.status !== 'submitted' || !submission.guardian_user_id) throw fail('Portal access is available after enrollment is submitted and the account is linked.');
  if ((invitationDeferred || schoolOrganizationId) && sendSetupEmail !== true) return { invitationDeferred: true, deliveryStatus: 'not_requested',
    note: 'Portal setup is optional. You may request a password setup email now or wait for your care team’s invitation.' };
  const guardian = await users.findById(submission.guardian_user_id);
  if (!guardian || guardian.role !== 'client_guardian') throw fail('Please contact the agency for help with portal access.');
  let deliveryStatus = null;
  if (sendSetupEmail === true) {
    const connection = await db.getConnection();
    const lock = `enrollment-access:${Number(agency?.id)}:${guardian.id}`;
    let locked = false;
    try {
      const [[claim]] = await connection.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
      if (!Number(claim?.acquired)) deliveryStatus = 'pending';
      else {
        locked = true;
        const [[recent]] = await connection.execute(`SELECT delivery_status FROM user_communications
          WHERE agency_id=? AND user_id=? AND recipient_address=? AND template_type='password_reset'
            AND delivery_status IN ('pending','sent','delivered')
            AND generated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)
          ORDER BY id DESC LIMIT 1`, [agency.id,guardian.id,guardian.email]);
        if (recent) deliveryStatus = recent.delivery_status === 'pending' ? 'pending' : 'sent';
        else {
          const result = await recover({ targetUser:guardian, email:guardian.email, organizationSlug:agency?.portal_url || agency?.slug, req,
            enrollment: { agencyId: agency?.id, channel: enrollmentChannel, schoolOrganizationId:schoolOrganizationId || null } });
          deliveryStatus = result.deliveryStatus || result.outcome;
        }
      }
    } finally {
      try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); }
      finally { connection.release(); }
    }
  }
  // A session is not proof of email ownership. Never disclose tokens/passwords.
  return { username:guardian.email,portalLoginUrl:clientPortalInviteUrl({portal:intakeClientPortal(agency,{channel:enrollmentChannel,school:!!schoolOrganizationId}),existingAccount:true}),needsPasswordSetup:!guardian.password_hash,deliveryStatus,
    note:'Open the setup link in your email to choose a password. Existing account passwords remain unchanged.' };
}
