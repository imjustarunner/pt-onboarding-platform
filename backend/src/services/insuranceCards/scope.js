import pool from '../../config/database.js';
import { encouragedCardSlots } from './policy.js';

// Temporary owner-directed review team (2026-10-19), independent of billing access.
// Keep exact identities: a billing role alone must not opt anyone into this workflow.
const REVIEWERS = new Map([
  [501, ['Michael', 'Mendez']],
  [539, ['Kaitlyn', "O'Connell"]],
  [559, ['Hannah', 'Inyart']]
]);
export async function isCardReviewer(user, db = pool) {
  const identity = REVIEWERS.get(Number(user?.id));
  if (!identity) return false;
  const [[row]] = await db.execute(`SELECT first_name,last_name FROM users WHERE id=?
    AND is_active=1 AND COALESCE(is_archived,0)=0 AND status IN ('ACTIVE','ACTIVE_EMPLOYEE')`, [user.id]);
  return row?.first_name === identity[0] && row?.last_name === identity[1];
}

export function cardFollowupEligible({ profile, clients = [] }) {
  return encouragedCardSlots(profile).length > 0 && clients.length > 0 && clients.every(client =>
    client.enrolledInApp === true && client.hasRecordedCoverage === true
    && ['school', 'clinical'].includes(client.client_type));
}

export async function hasCompletedCardEnrollment(profile, client, db = pool) {
  // A legacy import, referral, ROI, event or unfinished form is not app enrollment.
  const [[row]] = await db.execute(`SELECT s.id FROM intake_submissions s
    JOIN intake_links l ON l.id=s.intake_link_id
    WHERE s.status='submitted' AND s.submitted_at IS NOT NULL
      AND s.guardian_user_id=? AND l.form_type='intake'
      AND (s.client_id=? OR EXISTS(SELECT 1 FROM intake_submission_clients ic WHERE ic.intake_submission_id=s.id AND ic.client_id=?))
      AND (l.master_channel IS NULL OR l.master_channel IN ('','office','school'))
      AND ((l.scope_type='agency' AND l.organization_id=?)
        OR (?='school' AND l.scope_type='school' AND (
          EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=l.organization_id AND oa.agency_id=? AND oa.is_active=1)
          OR EXISTS(SELECT 1 FROM agency_schools sc WHERE sc.school_organization_id=l.organization_id AND sc.agency_id=? AND sc.is_active=1))))
    LIMIT 1`, [profile.guardian_user_id, client.id, client.id, profile.agency_id, client.client_type, profile.agency_id, profile.agency_id]);
  return !!row;
}

export function assertFreshCardEmail({ templateType, existingCommunicationId }) {
  if (templateType === 'insurance_card_followup' && existingCommunicationId) {
    throw Object.assign(new Error('Reopen the insurance card task for a fresh eligibility check and email review.'), { status: 409 });
  }
}
