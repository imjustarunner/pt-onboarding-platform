import pool from '../config/database.js';
import GuardianPaymentCard, { paymentCardSummary } from '../models/GuardianPaymentCard.model.js';
import GuardianInsuranceProfile from '../models/GuardianInsuranceProfile.model.js';
import { BILLING_TERMS, BILLING_TERMS_VERSION, linkAllowsBilling, requireBillingLink, requireResponsiblePayer, billingError, positiveId, auditBilling, recordBillingConsent } from './familyBillingPolicy.service.js';
import { normalizePolicy, applySubmittedClientInsurance, readClientInsurance, claimInsuranceIssues } from './clientInsurance.service.js';
import { getStripePublishableKey } from './stripePayments.service.js';

export async function getFamilyBillingSummary(userId, agencyId) {
  const [clients] = await pool.execute(`SELECT c.id, c.full_name, c.initials, cg.access_enabled, cg.relationship_type, cg.permissions_json
    FROM client_guardians cg JOIN clients c ON c.id = cg.client_id WHERE cg.guardian_user_id = ? AND c.agency_id = ? AND cg.access_enabled = 1 ORDER BY c.full_name`, [userId, agencyId]);
  const items = [];
  for (const c of clients) {
    const [payers] = await pool.execute(`SELECT p.guardian_user_id, p.payment_card_id, p.consent_id, p.recurring_limit_cents, u.first_name, u.last_name
      FROM client_billing_payers p JOIN users u ON u.id = p.guardian_user_id
      JOIN client_guardians cg ON cg.client_id = p.client_id AND cg.guardian_user_id = p.guardian_user_id
      WHERE p.agency_id = ? AND p.client_id = ? AND p.status = 'active' AND cg.access_enabled = 1 AND cg.relationship_type <> 'self'`, [agencyId, c.id]);
    const own = linkAllowsBilling(c) ? payers.find(p => Number(p.guardian_user_id) === Number(userId)) : null;
    items.push({ clientId: c.id, clientName: c.full_name || c.initials, responsiblePayers: payers.map(p => ({ name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Responsible payer' })), canAcceptResponsibility: linkAllowsBilling(c), canManageBilling: !!own,
      ...(own ? { paymentCardId: own.payment_card_id, recurringEnabled: !!own.consent_id, recurringLimitCents: own.recurring_limit_cents, paymentOnFileRequired: !own.payment_card_id } : {}) });
  }
  const canManage = items.some(c => c.canManageBilling);
  const cards = canManage ? (await GuardianPaymentCard.findActiveByGuardian(userId, agencyId)).map(paymentCardSummary) : [];
  const profiles = canManage ? await GuardianInsuranceProfile.findByGuardian(userId, agencyId) : [];
  const visibleProfiles = [];
  for (const profile of profiles) {
    const [assignments] = await pool.execute('SELECT client_id FROM guardian_insurance_clients WHERE profile_id = ? AND agency_id = ?', [profile.id, agencyId]);
    const clientIds = [...new Set(assignments.map(a => Number(a.client_id)).concat(profile.client_id ? [Number(profile.client_id)] : []))].filter(id => items.some(c => Number(c.clientId) === id && c.canManageBilling));
    if (profile.client_id && !items.some(c => Number(c.clientId) === Number(profile.client_id) && c.canManageBilling)) continue;
    visibleProfiles.push({ id: profile.id, clientIds, primary: profile.primary || {}, secondary: profile.secondary || null, coverageScope: profile.coverageScope || 'client', missingClaimFields: claimInsuranceIssues(profile.primary), collectedAt: profile.collected_at,
      hasPrimaryFront: !!profile.primary_card_front_url, hasPrimaryBack: !!profile.primary_card_back_url });
  }
  if (canManage) await auditBilling({ agencyId, userId, action: 'view_own_billing' });
  const [merchant] = await pool.execute('SELECT stripe_connect_account_id, stripe_connect_status FROM agency_billing_accounts WHERE agency_id = ?', [agencyId]);
  const connectedAccountId = merchant[0]?.stripe_connect_status === 'active' ? merchant[0].stripe_connect_account_id : null;
  return { clients: items, cards, profiles: visibleProfiles, terms: BILLING_TERMS, termsVersion: BILLING_TERMS_VERSION, stripe: { enabled: !!connectedAccountId && !!getStripePublishableKey(), connectedAccountId, publishableKey: getStripePublishableKey() } };
}
export async function acceptPayer({ userId, agencyId, clientId, consent, ip, userAgent }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await requireBillingLink(userId, clientId, agencyId, db);
    await recordBillingConsent({ userId, agencyId, clientId, purpose: 'responsible_payer', consent, ip, userAgent }, db);
    await db.execute(`INSERT INTO client_billing_payers (agency_id, client_id, guardian_user_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = 'active'`, [agencyId, clientId, userId]);
    await auditBilling({ agencyId, userId, clientId, action: 'accept_responsibility' }, db);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
export async function assignCard({ userId, agencyId, clientId, cardId, recurring, limitCents, consent, ip, userAgent }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await requireResponsiblePayer(userId, clientId, agencyId, db);
    const [clients] = await db.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ? FOR UPDATE', [clientId, agencyId]);
    if (!clients.length) throw billingError(404, 'Client not found');
    const cards = await GuardianPaymentCard.findActiveByGuardian(userId, agencyId, db);
    const card = cards.find(c => Number(c.id) === positiveId(cardId));
    if (!card || card.legacyRequiresReview || card.payment_provider !== 'STRIPE' || !card.connected_account_id) throw billingError(403, 'Select your own verified payment method');
    let consentId = null;
    if (recurring === true) {
      positiveId(limitCents);
      if (limitCents > 1000000) throw billingError(400, 'Recurring charge limit is too high');
      const [other] = await db.execute("SELECT guardian_user_id FROM client_billing_payers WHERE agency_id = ? AND client_id = ? AND guardian_user_id <> ? AND status = 'active' AND consent_id IS NOT NULL", [agencyId, clientId, userId]);
      if (other.length) throw billingError(409, 'A responsible payer already has recurring billing enabled for this client. Contact the office to change the arrangement.');
      consentId = await recordBillingConsent({ userId, agencyId, clientId, cardId: card.id, purpose: 'recurring', consent: { ...consent, limitCents }, ip, userAgent }, db);
    }
    await db.execute("UPDATE guardian_billing_consents SET revoked_at = CURRENT_TIMESTAMP WHERE agency_id = ? AND guardian_user_id = ? AND client_id = ? AND purpose = 'recurring' AND revoked_at IS NULL AND id <> ?", [agencyId, userId, clientId, consentId || 0]);
    await db.execute('UPDATE client_billing_payers SET payment_card_id = ?, consent_id = ?, recurring_limit_cents = ? WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ?', [card.id, consentId, recurring ? limitCents : null, agencyId, clientId, userId]);
    await auditBilling({ agencyId, userId, clientId, action: recurring ? 'authorize_recurring' : 'assign_card', objectId: card.id }, db);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
export async function revokeRecurring({ userId, agencyId, clientId }) {
  await requireResponsiblePayer(userId, clientId, agencyId);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute("UPDATE guardian_billing_consents SET revoked_at = CURRENT_TIMESTAMP WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ? AND purpose = 'recurring' AND revoked_at IS NULL", [agencyId, clientId, userId]);
    await db.execute('UPDATE client_billing_payers SET consent_id = NULL, recurring_limit_cents = NULL WHERE agency_id = ? AND client_id = ? AND guardian_user_id = ?', [agencyId, clientId, userId]);
    await auditBilling({ agencyId, userId, clientId, action: 'revoke_recurring' }, db);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
export async function saveFamilyInsurance({ userId, agencyId, clientIds, primary, secondary, coverageScope, coverageConfirmed, profileId }) {
  if (coverageConfirmed !== true || !Array.isArray(clientIds) || !clientIds.length || clientIds.length > 30) throw billingError(400, 'Confirm the clients covered by this policy');
  const ids = [...new Set(clientIds.map(positiveId))];
  for (const id of ids) await requireResponsiblePayer(userId, id, agencyId);
  if (ids.length > 1 && coverageScope !== 'account_holder') throw billingError(400, 'A client-specific policy cannot be applied to siblings');
  const p = normalizePolicy(primary), secondaryPolicy = secondary ? normalizePolicy(secondary) : null;
  if (!p.insurerName || !p.memberId || !p.subscriberName || !p.relationshipToSubscriber) throw billingError(400, 'Carrier, member ID, subscriber name, and relationship are required');
  if (ids.length > 1 && (p.isMedicaid || secondaryPolicy?.isMedicaid)) throw billingError(400, 'Primary or secondary Medicaid requires each client’s own member ID');
  if (profileId) {
    const own = (await GuardianInsuranceProfile.findByGuardian(userId, agencyId)).find(p => Number(p.id) === positiveId(profileId));
    if (!own) throw billingError(403, 'Insurance profile is not yours');
    if (ids.some(id => id !== Number(own.client_id)) && own.coverageScope !== 'account_holder') throw billingError(400, 'This policy is specific to one client');
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    for (const clientId of ids) await requireResponsiblePayer(userId, clientId, agencyId, db);
    if (profileId) {
      const [oldAssignments] = await db.execute('SELECT client_id FROM guardian_insurance_clients WHERE profile_id = ? AND agency_id = ? FOR UPDATE', [profileId, agencyId]);
      for (const assignment of oldAssignments) {
        await requireResponsiblePayer(userId, assignment.client_id, agencyId, db);
        if (!ids.includes(Number(assignment.client_id))) {
          const previous = await readClientInsurance(assignment.client_id, agencyId, db);
          if (Number(previous?.profileId) === Number(profileId)) await db.execute('UPDATE clients SET billing_insurance_payload = NULL, primary_insurer_name = NULL WHERE id = ? AND agency_id = ?', [assignment.client_id, agencyId]);
          await auditBilling({agencyId,userId,clientId:assignment.client_id,action:'unassign_insurance',objectId:profileId},db);
        }
      }
      await db.execute('DELETE FROM guardian_insurance_clients WHERE profile_id = ? AND agency_id = ?', [profileId, agencyId]);
    }
    const id = await GuardianInsuranceProfile.upsert({ guardianUserId:userId, agencyId, profileId, createNew:!profileId, clientId:coverageScope === 'account_holder' ? null : ids[0], primary:p, secondary:secondaryPolicy, coverageScope }, db);
    for (const clientId of ids) {
      await db.execute('INSERT IGNORE INTO guardian_insurance_clients (profile_id, client_id, agency_id, confirmed_by_user_id) VALUES (?, ?, ?, ?)', [id, clientId, agencyId, userId]);
      await applySubmittedClientInsurance({agencyId,clientId,primary:p,secondary:secondaryPolicy,profileId:id,confirmedBy:userId},db);
      await auditBilling({agencyId,userId,clientId,action:'assign_insurance',objectId:id},db);
    }
    await db.commit(); return id;
  } catch(e) {await db.rollback();throw e;} finally{db.release();}
}
