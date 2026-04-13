/**
 * Summit Stats Team Challenge: Shared access control
 * canAccessChallenge checks org membership, provider membership, and elimination status.
 */
import pool from '../config/database.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import User from '../models/User.model.js';
import ChallengeElimination from '../models/ChallengeElimination.model.js';
import { canUserManageChallengeClass } from './sscClubAccess.js';

const getUserAgencyContext = async (userId) => {
  const memberships = await User.getAgencies(userId);
  const allOrgIds = (memberships || []).map((m) => Number(m?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const agencyIds = (memberships || [])
    .filter((m) => String(m?.organization_type || '').toLowerCase() === 'agency')
    .map((m) => Number(m?.id || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { allOrgIds, agencyIds };
};

/**
 * Check if user can access a challenge. Eliminated provider members are denied.
 */
export const canAccessChallenge = async ({ user, learningClassId }) => {
  const klass = await LearningProgramClass.findById(learningClassId);
  if (!klass) return { ok: false };
  if (String(user?.role || '').toLowerCase() === 'super_admin') return { ok: true, class: klass };
  const ctx = await getUserAgencyContext(user.id);
  if (ctx.allOrgIds.includes(Number(klass.organization_id))) return { ok: true, class: klass };
  const affAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(klass.organization_id);
  if (affAgencyId && ctx.agencyIds.includes(Number(affAgencyId))) return { ok: true, class: klass };
  const [pm] = await pool.execute(
    `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
    [learningClassId, user.id]
  );
  if (pm?.length) {
    const eliminated = await ChallengeElimination.isEliminated(learningClassId, user.id);
    if (eliminated) return { ok: false, eliminated: true };
    return { ok: true, class: klass };
  }
  const [cg] = await pool.execute(
    `SELECT 1 FROM learning_class_client_memberships m
     INNER JOIN client_guardians cg ON cg.client_id = m.client_id
     WHERE m.learning_class_id = ? AND cg.guardian_user_id = ? AND m.membership_status IN ('active','completed')
       AND (cg.access_enabled IS NULL OR cg.access_enabled = TRUE) LIMIT 1`,
    [learningClassId, user.id]
  );
  if (cg?.length) return { ok: true, class: klass };
  return { ok: false };
};

/**
 * Participant / guardian access, or club-level challenge manager (read chat, mark read, etc.).
 */
export const resolveChallengeAccessOrManage = async ({ user, learningClassId }) => {
  const base = await canAccessChallenge({ user, learningClassId });
  if (base.ok) return base;
  if (base.eliminated) return base;
  if (await canUserManageChallengeClass({ user, learningClassId })) {
    const klass = await LearningProgramClass.findById(learningClassId);
    if (klass) return { ok: true, class: klass };
  }
  return base;
};
