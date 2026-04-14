import pool from '../config/database.js';

/**
 * When true, new SSTC member onboarding must use a valid club invite token:
 * - POST /auth/register-participant is rejected (use join flow with invite).
 * - POST /summit-stats/clubs/:id/apply-form requires inviteToken in the body.
 * - POST /summit-stats/clubs/:id/apply (applyToClub) requires inviteToken in the body.
 * - POST /summit-stats/clubs/:id/request-invite is available for users without a link (notifies managers).
 *
 * Env: SSTC_INVITE_ONLY_MEMBER_SIGNUP=true | 1 | yes
 */
export function isSstcInviteOnlyMemberSignup() {
  const v = String(process.env.SSTC_INVITE_ONLY_MEMBER_SIGNUP || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Active invite for this club: not revoked, not used, not expired.
 */
export async function getActiveInviteForTokenAndClub(token, clubId) {
  const t = String(token || '').trim();
  const cid = Number(clubId);
  if (!t || !Number.isFinite(cid) || cid < 1) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM challenge_member_invites
     WHERE token = ? AND agency_id = ? AND is_active = 1 LIMIT 1`,
    [t, cid]
  );
  const inv = rows?.[0];
  if (!inv) return null;
  if (inv.used_at) return null;
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return null;
  return inv;
}

export function inviteEmailMatchesInviteRow(inviteRow, email) {
  const required = String(inviteRow?.email || '').trim().toLowerCase();
  if (!required) return true;
  return String(email || '').trim().toLowerCase() === required;
}
