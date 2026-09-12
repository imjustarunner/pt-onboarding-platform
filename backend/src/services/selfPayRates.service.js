import pool from '../config/database.js';
import User from '../models/User.model.js';
import TenantService from '../models/TenantService.model.js';
import StaffServiceAssignment from '../models/StaffServiceAssignment.model.js';
import { resolveEffectivePracticeCategories, serviceBusinessTypesForCategories } from './practiceCategories.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export async function assertSelfPayRateAccess(actor, agencyId, providerId = 0) {
  if (!['admin', 'super_admin'].includes(actor?.role)) throw fail('Admin or superadmin access required', 403);
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw fail('Invalid agency');
  if (actor.role !== 'super_admin' && !(await User.getAgencies(actor.id)).some(a => Number(a.id) === Number(agencyId))) {
    throw fail('Access denied for this agency', 403);
  }
  if (!Number.isSafeInteger(Number(providerId)) || Number(providerId) < 0) throw fail('Invalid provider');
  if (providerId && !(await User.getAgencies(providerId)).some(a => Number(a.id) === Number(agencyId))) {
    throw fail('Provider does not belong to this agency', 403);
  }
}

export async function eligibleSelfPayServices(agencyId, providerId = 0) {
  const services = await TenantService.listForAgency(agencyId);
  if (!providerId) return services;
  const [practice, assigned] = await Promise.all([
    resolveEffectivePracticeCategories(agencyId, providerId),
    StaffServiceAssignment.listServiceIdsForUser(agencyId, providerId)
  ]);
  // Do not use the legacy all-categories fallback for a provider's rate settings.
  const categories = practice.categories.filter(c => ['default', 'grant'].includes(practice.sources[c]));
  const types = new Set(serviceBusinessTypesForCategories(categories));
  return services.filter(s => types.has(s.businessType) && (!assigned.length || assigned.includes(s.id)));
}

export function validateSelfPayRate(row) {
  if (!row || typeof row !== 'object') throw fail('Invalid rate entry');
  const serviceId = Number(row.serviceId);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1) throw fail('Invalid service');
  if (row.rateCents === null) return { serviceId, rateCents: null, rateUnit: 'session' };
  if (!Number.isSafeInteger(row.rateCents) || row.rateCents < 0 || row.rateCents > 100000000) {
    throw fail('Rate must be a nonnegative whole number of cents, up to $1,000,000');
  }
  if (!['session', 'hour'].includes(row.rateUnit)) throw fail('Choose per session or per hour');
  return { serviceId, rateCents: row.rateCents, rateUnit: row.rateUnit };
}

export async function getAgencySelfPayOnly(agencyId) {
  const [rows] = await pool.execute('SELECT self_pay_only FROM agency_self_pay_settings WHERE agency_id = ?', [agencyId]);
  return Number(rows[0]?.self_pay_only) === 1;
}

export async function getSelfPayRates(agencyId, providerId = 0) {
  const [services, selfPayOnly, [rates]] = await Promise.all([
    eligibleSelfPayServices(agencyId, providerId), getAgencySelfPayOnly(agencyId),
    pool.execute('SELECT * FROM self_pay_service_rates WHERE agency_id = ? AND provider_user_id IN (0, ?)', [agencyId, providerId])
  ]);
  const rate = r => r ? { rateCents: Number(r.rate_cents), rateUnit: r.rate_unit } : null;
  return { agencyId: Number(agencyId), providerId: Number(providerId), selfPayOnly, services: services.map(s => {
    const agencyRate = rate(rates.find(r => Number(r.tenant_service_id) === s.id && Number(r.provider_user_id) === 0));
    const providerRate = providerId ? rate(rates.find(r => Number(r.tenant_service_id) === s.id && Number(r.provider_user_id) === Number(providerId))) : null;
    return { serviceId: s.id, name: s.name, businessType: s.businessType, durationMinutes: s.defaultDurationMinutes,
      agencyRate, providerRate, effectiveRate: providerRate || agencyRate || (s.priceCents == null ? null : { rateCents: s.priceCents, rateUnit: 'session' }),
      catalogRateCents: s.priceCents };
  }) };
}

export async function saveSelfPayRates({ agencyId, providerId = 0, rows, selfPayOnly, actorUserId }) {
  if (!Array.isArray(rows) || rows.length > 500) throw fail('Supply up to 500 service rates');
  if (selfPayOnly !== undefined && (providerId || typeof selfPayOnly !== 'boolean')) throw fail('Self-pay-only is an agency setting');
  const normalized = rows.map(validateSelfPayRate);
  const eligible = new Set((await eligibleSelfPayServices(agencyId, providerId)).map(s => s.id));
  if (normalized.some(r => !eligible.has(r.serviceId))) throw fail('A service is not eligible for this provider or agency', 403);
  if (new Set(normalized.map(r => r.serviceId)).size !== normalized.length) throw fail('Duplicate service');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of normalized) {
      if (row.rateCents === null) {
        await conn.execute('DELETE FROM self_pay_service_rates WHERE agency_id = ? AND tenant_service_id = ? AND provider_user_id = ?', [agencyId, row.serviceId, providerId]);
      } else {
        await conn.execute(`INSERT INTO self_pay_service_rates (agency_id, tenant_service_id, provider_user_id, rate_cents, rate_unit, updated_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rate_cents = VALUES(rate_cents), rate_unit = VALUES(rate_unit), updated_by_user_id = VALUES(updated_by_user_id)`,
        [agencyId, row.serviceId, providerId, row.rateCents, row.rateUnit, actorUserId]);
      }
    }
    if (selfPayOnly !== undefined) await conn.execute(`INSERT INTO agency_self_pay_settings (agency_id, self_pay_only, updated_by_user_id)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE self_pay_only = VALUES(self_pay_only), updated_by_user_id = VALUES(updated_by_user_id)`, [agencyId, selfPayOnly ? 1 : 0, actorUserId]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  return getSelfPayRates(agencyId, providerId);
}

export function calculateSelfPayQuote({ rateCents, rateUnit = 'session', durationMinutes }) {
  if (rateCents == null) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw fail('Invalid session duration');
  const amount = rateUnit === 'hour' ? Math.round(rateCents * durationMinutes / 60) : rateCents;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) throw fail('Session charge exceeds the supported amount');
  return amount;
}

export async function resolveSelfPayQuote({ agencyId, providerId, service, durationMinutes }) {
  if (!service) return null;
  const [rows] = await pool.execute(`SELECT rate_cents, rate_unit, provider_user_id FROM self_pay_service_rates
    WHERE agency_id = ? AND tenant_service_id = ? AND provider_user_id IN (0, ?) ORDER BY provider_user_id DESC`,
  [agencyId, service.id, providerId || 0]);
  const row = rows[0];
  const rateCents = row ? Number(row.rate_cents) : service.priceCents;
  const rateUnit = row?.rate_unit || 'session';
  return { amountCents: calculateSelfPayQuote({ rateCents, rateUnit, durationMinutes }), rateCents, rateUnit,
    source: row ? (Number(row.provider_user_id) ? 'provider' : 'agency') : 'catalog' };
}
