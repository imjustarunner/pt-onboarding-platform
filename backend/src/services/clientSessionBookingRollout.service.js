import pool from '../config/database.js';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';
import { parseFeatureFlags } from './medicalBillingFlags.service.js';
import { staffCareEligibility, readStaffCareEligibility } from './staffCareEligibility.service.js';

export const SESSION_BOOKING_COMING_SOON = 'Client session booking is coming soon for this provider. A practice administrator must enable their transition from TherapyNotes.';
const fail = (status, message) => Object.assign(new Error(message), { status, code: 'CLIENT_SESSION_BOOKING_NOT_ENABLED' });
const empty = () => ({ revision: 0, entries: [] });
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export function evaluateClientSessionBooking(policy, providerUserId) {
  const entry = Array.isArray(policy?.entries) ? policy.entries.find(row => Number(row.providerUserId) === Number(providerUserId)) : null;
  const enabled = id(providerUserId) && entry?.enabled === true;
  return { enabled, reason: enabled ? null : SESSION_BOOKING_COMING_SOON, revision: Number(policy?.revision || 0) };
}
export async function readClientSessionBookingRollout(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) throw fail(404, 'Practice not found.');
  const policy = parseFeatureFlags(agency.feature_flags).clientSessionBookingRollout;
  return policy && Array.isArray(policy.entries) ? policy : empty();
}
export async function clientSessionBookingAccess(agencyId, providerUserId, db = pool) {
  const review = evaluateClientSessionBooking(await readClientSessionBookingRollout(agencyId, db), providerUserId);
  if (!review.enabled) return review;
  const care = await readStaffCareEligibility(providerUserId, agencyId, db);
  return care.canProvideCare ? review : { ...review, enabled: false, reason: care.reason };
}
export async function requireClientSessionBooking(agencyId, providerUserId, db = pool) {
  const review = await clientSessionBookingAccess(agencyId, providerUserId, db);
  if (!review.enabled) throw fail(403, review.reason);
  return review;
}
export async function sessionBookingProviders(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id = ?', [agencyId]);
  const qa = isAuricwellQaAgency(agency);
  const [rows] = await db.execute(`SELECT u.id,u.email,u.is_demo,u.first_name,u.preferred_name,u.last_name,u.role,u.credential,u.status,u.is_active,
      u.sees_clients,u.has_provider_access,ua.agency_role,COALESCE(ua.is_active,1) AS membership_active,p.public_details_json
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    LEFT JOIN provider_public_profiles p ON p.user_id=u.id
    WHERE COALESCE(u.is_archived,0)=0 AND (COALESCE(u.is_demo,0)=0 OR ?=1)
    ORDER BY u.last_name,u.first_name`, [agencyId, qa ? 1 : 0]);
  return rows.filter(row => (!qa ? !Number(row.is_demo) : allowQaExchangeRecipient(agency, row)) && staffCareEligibility(row, agencyId).canProvideCare).map(row => ({
    id: Number(row.id), name: `${row.preferred_name || row.first_name || ''} ${row.last_name || ''}`.trim()
  }));
}
export async function saveClientSessionBookingRollout({ agencyId, actorUserId, input }, dbPool = pool) {
  const providerUserIds = [...new Set(Array.isArray(input.providerUserIds) ? input.providerUserIds.map(Number) : [])];
  if (!providerUserIds.length || providerUserIds.length > 10 || providerUserIds.some(value => !id(value)))
    throw fail(400, 'Select between 1 and 10 providers for this cohort.');
  if (typeof input.enabled !== 'boolean') throw fail(400, 'Choose whether to enable or pause session booking.');
  if (input.enabled && input.transitionReviewed !== true) throw fail(400, 'Confirm the selected providers are ready to transition session scheduling from TherapyNotes.');
  const note = String(input.note || '').trim();
  if (!note || note.length > 1000) throw fail(400, 'Add a short transition note (up to 1000 characters; no client information).');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (!agency) throw fail(404, 'Practice not found.');
    const current = parseFeatureFlags(agency.feature_flags).clientSessionBookingRollout || empty();
    if (Number(input.revision) !== Number(current.revision)) throw fail(409, 'The rollout changed. Refresh before saving.');
    const providers = await sessionBookingProviders(agencyId, db);
    if (providerUserIds.some(providerId => !providers.some(provider => provider.id === providerId)))
      throw fail(403, 'Only active client-facing providers in this practice can be selected.');
    const updatedAt = new Date().toISOString();
    const entries = (current.entries || []).filter(entry => !providerUserIds.includes(Number(entry.providerUserId)));
    for (const providerUserId of providerUserIds) {
      entries.push({ providerUserId, enabled: input.enabled, note, updatedByUserId: actorUserId, updatedAt });

    }
    const policy = { revision: Number(current.revision) + 1, entries, history: [...(current.history || []), { providerUserIds, enabled: input.enabled, note, updatedByUserId: actorUserId, updatedAt }] };
    await db.execute(`UPDATE agencies SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.clientSessionBookingRollout', CAST(? AS JSON)) WHERE id = ?`, [JSON.stringify(policy), agencyId]);
    await db.commit();
    return policy;
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
