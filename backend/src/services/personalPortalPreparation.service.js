import pool from '../config/database.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ageOn } from './guardianClinicalAccess.service.js';
import { personalContactReviewReason } from './clientChartTypes.service.js';

const reviewRequired = message => Object.assign(new Error(message), { status: 409 });
const normalized = value => String(value || '').trim().toLowerCase();

export async function preparePersonalPortal({ client, email, firstName, lastName, actorUserId, recoverPending, permissions, enableAccess, verifiedBirthDate }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT id, agency_id, email, status, date_of_birth FROM clients WHERE id=? FOR UPDATE', [client.id]);
    if (!current || normalized(current.email) !== email || Number(current.agency_id) !== Number(client.agency_id) ||
        ['archived', 'inactive', 'terminated'].includes(normalized(current.status))) {
      throw reviewRequired('The chart or its saved email changed. Refresh the chart before continuing.');
    }

    const birthDate = current.date_of_birth instanceof Date
      ? current.date_of_birth.toISOString().slice(0,10) : String(current.date_of_birth || '').slice(0,10);
    if (verifiedBirthDate && birthDate !== verifiedBirthDate) {
      throw reviewRequired('The chart’s date of birth has changed.');
    }
    const age = ageOn(current.date_of_birth);
    if (age !== null && (!Number.isFinite(age) || age < 18)) {
      throw reviewRequired('Use the client’s personal invitation workflow for a minor.');
    }

    const issue = await personalContactReviewReason(client.id, db);
    if (issue === 'shared_email') {
      throw reviewRequired('This email is shared with another chart. Confirm a separate client address in Demographics.');
    }

    let account;
    if (issue === 'review_identity') {
      // A previous non-transactional attempt could leave an unused client login.
      // Only recover a pending account with no credentials or chart relationships,
      // within this practice and with the exact identity the staff member verified.
      const [pending] = await db.execute(`SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status
        FROM users u WHERE u.email=? AND u.role='client' AND u.status='PENDING_SETUP'
        AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
        AND u.password_hash IS NULL AND u.temporary_password_hash IS NULL
        AND u.passwordless_token IS NULL AND u.invitation_token IS NULL
        AND EXISTS (SELECT 1 FROM user_agencies a WHERE a.user_id=u.id AND a.agency_id=? AND a.is_active=1)
        AND NOT EXISTS (SELECT 1 FROM user_agencies a WHERE a.user_id=u.id AND a.agency_id NOT IN (?,?))
        AND NOT EXISTS (SELECT 1 FROM users other WHERE other.id<>u.id AND
          (CONVERT(TRIM(other.username) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
          OR CONVERT(TRIM(other.personal_email) USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci))
        AND NOT EXISTS (SELECT 1 FROM client_guardians g WHERE g.guardian_user_id=u.id)
        AND NOT EXISTS (SELECT 1 FROM client_guardians g WHERE g.client_id=? AND g.relationship_type='self')
        FOR UPDATE`, [email, client.agency_id, client.agency_id, client.organization_id || client.agency_id, email, email, client.id]);
      const candidate = pending.length === 1 ? pending[0] : null;
      if (!candidate || normalized(candidate.first_name) !== normalized(firstName) || normalized(candidate.last_name) !== normalized(lastName)) {
        throw reviewRequired('An existing login needs identity review before it can be linked to this chart.');
      }
      if (!recoverPending) {
        throw Object.assign(reviewRequired('An unfinished account from a previous attempt matches this client. Confirm that it belongs to this client to continue.'), { code: 'PERSONAL_PORTAL_PENDING_RECOVERY' });
      }
      account = candidate;
    } else {
      account = await User.create({ email, firstName, lastName, personalEmail: email, role: 'client',
        phoneNumber: client.phone || null, status: 'PENDING_SETUP' }, db);
    }

    if (account.role !== 'client') throw reviewRequired('This login is already reserved for a different account type.');
    await User.assignToAgency(account.id, Number(client.agency_id), { transaction: db });
    await ClientGuardian.upsertLink({
      clientId: client.id, guardianUserId: account.id, relationshipType: 'self', relationshipTitle: 'Self',
      accessEnabled: enableAccess, permissionsJson: permissions, expectedLink: null, expectedSelfEmail: email,
      createdByUserId: actorUserId, transaction: db
    });
    if (enableAccess) await db.execute('UPDATE clients SET guardian_portal_enabled=1 WHERE id=?', [client.id]);
    await db.commit();
    return { account, recovered: issue === 'review_identity' };
  } catch (error) {
    await db.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw reviewRequired('A login already exists for this address. Refresh the chart and review the account.');
    throw error;
  } finally {
    db.release();
  }
}
