import pool from '../config/database.js';
import { normalizeIntakeResponsibleParty } from '../utils/intakeResponsibleParty.js';
import { saveResponsibleParty } from './clientBillingAccount.service.js';

/** Project an explicit signed enrollment choice; later submissions cannot replace a saved payer. */
export async function recordIntakeResponsibleParty({ clientId, agencyId, paymentInfo, guardianUserId, submissionId }, overrides = {}) {
  const { db = pool, save = saveResponsibleParty } = overrides;
  const choice = normalizeIntakeResponsibleParty(paymentInfo?.responsibleParty);
  if (!choice) return { saved: false, needsFollowup: true, reason: 'responsible_party_not_selected' };
  const [[previous]] = await db.execute('SELECT revision FROM client_billing_responsibility_profiles WHERE agency_id=? AND client_id=?', [agencyId, clientId]);
  if (previous) return { saved: false, preserved: true, needsFollowup: false };
  // Only a saved submission account can become the selected account or audit actor.
  if (!Number.isSafeInteger(Number(guardianUserId)) || Number(guardianUserId) < 1) return { saved: false, needsFollowup: true, reason: 'responsible_party_account_pending', submissionId };
  const party = choice.kind === 'applicant' ? { kind: 'account', userId: Number(guardianUserId) } : choice;
  try {
    const result = await save({ agencyId, clientId, party, revision: 0, actorUserId: Number(guardianUserId) });
    return { ...result, needsFollowup: false };
  } catch (error) {
    // A concurrent reviewed selection takes precedence over this initial projection.
    if (error.status === 409) return { saved: false, preserved: true, needsFollowup: false };
    throw error;
  }
}
