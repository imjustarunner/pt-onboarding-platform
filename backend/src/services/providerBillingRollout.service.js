import pool from '../config/database.js';
import { parseFeatureFlags } from './medicalBillingFlags.service.js';
import { auditBilling } from './familyBillingPolicy.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const empty = () => ({ revision: 0, entries: [] });

// Shared by both products. Billing is available to all otherwise-ready providers.
// Optional transition records can hold a provider/payer or apply cutover dates;
// no record is needed merely to participate in the general billing workflow.
export function evaluateProviderBillingRollout(policy, { providerUserId, payerId, serviceDate }) {
  if (serviceDate instanceof Date) serviceDate = serviceDate.toISOString().slice(0, 10);
  const entry = policy?.entries?.find(e => Number(e.providerUserId) === Number(providerUserId)
    && e.payerId === String(payerId || '').trim());
  let reason = null;
  if (!Number.isSafeInteger(Number(providerUserId)) || Number(providerUserId) < 1 || !String(payerId || '').trim() || !date(serviceDate))
    reason = 'A treating provider, payer and valid service date are required for billing.';
  else if (!entry) return { ready: true, reason: null, revision: Number(policy?.revision || 0), entry: null };
  else if (entry.status !== 'active') reason = 'This provider and payer are on hold in the optional billing transition settings.';
  else if (!date(serviceDate) || serviceDate < entry.startDate || (entry.endDate && serviceDate > entry.endDate))
    reason = 'The service date is outside this provider’s billing cutover dates. Review it in the prior billing workflow.';
  else if (entry.eraDestination !== 'therapynotes' || entry.routingVerified !== true)
    reason = 'Confirm the payer’s existing TherapyNotes ERA routing before submitting.';
  return { ready: !reason, reason, revision: Number(policy?.revision || 0), entry: entry || null };
}

export async function readProviderBillingRollout(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) throw fail(404, 'Billing practice not found.');
  const policy = parseFeatureFlags(agency.feature_flags).providerBillingRollout;
  return policy && Array.isArray(policy.entries) ? policy : empty();
}

export async function providerBillingRolloutReview(scope, db = pool) {
  const review = evaluateProviderBillingRollout(await readProviderBillingRollout(scope.agencyId, db), scope);
  // An optional transition must not impose a new active-employment requirement
  // on historical claims that continue through the established billing workflow.
  if (review.ready && review.entry && !(await billingRolloutProviders(scope.agencyId, db)).some(p => p.id === Number(scope.providerUserId)))
    return { ...review, ready: false, reason: 'The provider is no longer active in this billing practice.' };
  return review;
}

export async function billingRolloutProviders(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT u.id, u.first_name, u.last_name FROM users u
    JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND ua.is_active = 1 AND u.is_active = 1
      AND COALESCE(u.is_archived, 0) = 0
      AND u.status IN ('ACTIVE', 'ACTIVE_EMPLOYEE', 'EHR_ONLY')
    ORDER BY u.last_name, u.first_name`, [agencyId]);
  return rows.map(u => ({ id: Number(u.id), name: `${u.first_name || ''} ${u.last_name || ''}`.trim() }));
}

export async function saveProviderBillingRollout({ agencyId, actorUserId, input }, dbPool = pool) {
  const providerUserId = Number(input.providerUserId);
  const payerId = String(input.payerId || '').trim();
  const payerName = String(input.payerName || '').trim();
  if (payerName.length > 255) throw fail(400, 'Payer name must be 255 characters or fewer.');
  if (!Number.isSafeInteger(providerUserId) || providerUserId < 1 || !/^[A-Za-z0-9_-]{1,80}$/.test(payerId))
    throw fail(400, 'Choose a provider and an exact electronic payer ID.');
  if (!['draft', 'active', 'paused'].includes(input.status)) throw fail(400, 'Choose a valid rollout status.');
  if (!date(input.startDate) || (input.endDate && (!date(input.endDate) || input.endDate < input.startDate)))
    throw fail(400, 'Review the service-date cutover range.');
  const reference = String(input.reference || '').trim();
  if (!reference || reference.length > 1000) throw fail(400, 'Record the payer/routing review reference (up to 1000 characters; no patient information).');
  if (input.status === 'active' && (input.routingVerified !== true || input.cutoverReviewed !== true))
    throw fail(400, 'Confirm ERA routing and the duplicate-submission cutover before activation.');
  if (typeof input.requiresSupervision !== 'boolean') throw fail(400, 'Review whether this provider requires supervised billing.');
  const supervisorUserId = input.requiresSupervision ? Number(input.supervisorUserId) : null;
  if (input.requiresSupervision && (!Number.isSafeInteger(supervisorUserId) || supervisorUserId < 1 || supervisorUserId === providerUserId))
    throw fail(400, 'Choose the responsible supervising clinician.');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (!agency) throw fail(404, 'Billing practice not found.');
    const flags = parseFeatureFlags(agency.feature_flags);
    const current = flags.providerBillingRollout || empty();
    if (Number(input.revision) !== Number(current.revision)) throw fail(409, 'The rollout changed. Reload before saving.');
    const providers = await billingRolloutProviders(agencyId, db);
    if (!providers.some(p => p.id === providerUserId) || (supervisorUserId && !providers.some(p => p.id === supervisorUserId)))
      throw fail(403, 'The provider must be active in this billing practice.');
    const entry = { providerUserId, payerId, payerName: payerName || null, status: input.status, startDate: input.startDate,
      endDate: input.endDate || null, eraDestination: 'therapynotes', routingVerified: input.routingVerified === true,
      requiresSupervision: input.requiresSupervision, supervisorUserId,
      reference, updatedByUserId: actorUserId, updatedAt: new Date().toISOString() };
    const entries = current.entries.filter(e => !(Number(e.providerUserId) === providerUserId && e.payerId === payerId));
    if (entries.length >= 1000) throw fail(409, 'Review the practice rollout capacity before adding more providers.');
    const policy = { revision: Number(current.revision) + 1, entries: [...entries, entry] };
    await db.execute('UPDATE agencies SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), \'$.providerBillingRollout\', CAST(? AS JSON)) WHERE id = ?', [JSON.stringify(policy), agencyId]);
    await auditBilling({ agencyId, userId: actorUserId, action: 'provider_billing_rollout_updated', objectId: providerUserId }, db);
    await db.commit();
    return policy;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
