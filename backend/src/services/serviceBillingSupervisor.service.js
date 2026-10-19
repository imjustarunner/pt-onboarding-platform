import pool from '../config/database.js';
import { parseFeatureFlags } from './medicalBillingFlags.service.js';
import { isClinicalOrBillingSupervisorCredentialText } from '../utils/credentialNormalization.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const empty = () => ({ revision: 0, entries: [] });

export function normalizeServiceSupervisor(input, providerUserId) {
  const entry = {
    providerUserId: Number(providerUserId),
    serviceCode: String(input.serviceCode || '').trim().toUpperCase(),
    supervisorUserId: Number(input.supervisorUserId),
    effectiveFrom: input.effectiveFrom,
    effectiveThrough: input.effectiveThrough || null
  };
  if (!Number.isSafeInteger(entry.providerUserId) || entry.providerUserId < 1 ||
      !Number.isSafeInteger(entry.supervisorUserId) || entry.supervisorUserId < 1 || entry.supervisorUserId === entry.providerUserId)
    throw fail(400, 'Choose a different licensed billing supervisor.');
  if (!/^[A-Z0-9]{5}$/.test(entry.serviceCode)) throw fail(400, 'Enter a five-character service code.');
  if (!validDate(entry.effectiveFrom) || (entry.effectiveThrough && (!validDate(entry.effectiveThrough) || entry.effectiveThrough < entry.effectiveFrom)))
    throw fail(400, 'Enter valid effective service dates.');
  return entry;
}

export function selectServiceSupervisor(policy, { providerUserId, serviceCode, dateOfService }) {
  const date = day(dateOfService);
  if (!validDate(date)) return null;
  const matches = (policy?.entries || []).filter(e => Number(e.providerUserId) === Number(providerUserId) &&
    e.serviceCode === String(serviceCode || '').trim().toUpperCase() && e.effectiveFrom <= date &&
    (!e.effectiveThrough || e.effectiveThrough >= date));
  if (matches.length > 1) throw fail(409, 'Overlapping billing supervisor defaults require review.');
  return matches[0] ? { ...matches[0], revision: Number(policy.revision || 0) } : null;
}

export async function readServiceSupervisors(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) throw fail(404, 'Agency not found.');
  const value = parseFeatureFlags(agency.feature_flags).serviceBillingSupervisors;
  return value && Array.isArray(value.entries) ? value : empty();
}

export async function serviceSupervisorOptions(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.credential FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.status IN ('ACTIVE','ACTIVE_EMPLOYEE','EHR_ONLY')`, [agencyId]);
  return rows.filter(u => isClinicalOrBillingSupervisorCredentialText(u.credential))
    .map(u => ({ id: Number(u.id), name: [u.first_name, u.last_name].filter(Boolean).join(' '), credential: u.credential }));
}

export async function resolveServiceSupervisor(scope, db = pool) {
  // No service context means ordinary provider/clinical defaults, not today's date.
  if (!scope.serviceCode || !scope.dateOfService) return null;
  const rule = selectServiceSupervisor(await readServiceSupervisors(scope.agencyId, db), scope);
  if (!rule) return null;
  const supervisor = (await serviceSupervisorOptions(scope.agencyId, db)).find(u => u.id === rule.supervisorUserId);
  if (!supervisor) throw fail(409, 'The service billing supervisor is no longer an active eligible supervisor in this agency.');
  return { ...rule, supervisorName: supervisor.name };
}

export async function saveServiceSupervisor({ agencyId, providerUserId, actorUserId, input }, dbPool = pool) {
  const entry = normalizeServiceSupervisor(input, providerUserId);
  const reason = String(input.reason || '').trim();
  if (!reason || reason.length > 1000) throw fail(400, 'A change reason is required (up to 1000 characters).');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT feature_flags FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    if (!agency) throw fail(404, 'Agency not found.');
    const [[provider]] = await db.execute('SELECT user_id FROM user_agencies WHERE agency_id=? AND user_id=? AND is_active=1', [agencyId, providerUserId]);
    if (!provider) throw fail(404, 'Provider is not active in this agency.');
    if (!(await serviceSupervisorOptions(agencyId, db)).some(u => u.id === entry.supervisorUserId))
      throw fail(400, 'Choose an active licensed supervisor from this agency.');
    const flags = parseFeatureFlags(agency.feature_flags);
    const current = flags.serviceBillingSupervisors || empty();
    if (Number(input.revision) !== Number(current.revision)) throw fail(409, 'Service defaults changed. Reload before saving.');
    // Append dated assignments. Historical periods must not be silently reassigned.
    const overlaps = (current.entries || []).some(e => e.providerUserId === entry.providerUserId && e.serviceCode === entry.serviceCode &&
      e.effectiveFrom <= (entry.effectiveThrough || '9999-12-31') && entry.effectiveFrom <= (e.effectiveThrough || '9999-12-31'));
    if (overlaps) throw fail(409, 'This provider and service already have a billing supervisor for these dates.');
    const next = { revision: Number(current.revision) + 1, entries: [...current.entries, { ...entry, reason, changedByUserId: actorUserId, changedAt: new Date().toISOString() }] };
    await db.execute("UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.serviceBillingSupervisors',CAST(? AS JSON)) WHERE id=?", [JSON.stringify(next), agencyId]);
    const { auditBilling } = await import('./familyBillingPolicy.service.js');
    await auditBilling({ agencyId, userId: actorUserId, action: 'service_billing_supervisor_default', objectId: providerUserId }, db);
    await db.commit();
    return next;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
