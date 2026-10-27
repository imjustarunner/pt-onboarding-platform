import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { eligibleExchangeProvider, exchangeProviderSql } from '../utils/clientExchangeProvider.js';
import { evaluateExchangeListing, exchangeInsuranceLabel, exchangeNeedsOpenings } from '../utils/clientExchangeMatching.js';
import { loadClientExchangeSummary } from './clientExchangeSummary.service.js';
import { mergeExchangeSummary } from '../utils/clientExchangeSummary.js';

const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value || '{}'); } catch { return {}; } };

export async function loadExchangeProvider({ userId, agencyId, database = pool, agency, facets }) {
  const [rows] = await database.execute(`SELECT u.*, ua.is_active AS membership_active FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE u.id = ? AND ua.agency_id = ? AND ${exchangeProviderSql} LIMIT 1`, [userId, agencyId]);
  const user = rows[0];
  agency ||= await Agency.findById(agencyId);
  if (!eligibleExchangeProvider(user, agency)) return { user: null, profile: {}, facets: {}, agency };
  const [profile, coverage, facetMap] = await Promise.all([
    Profile.getForProvider({ providerUserId: userId, agencyId }),
    listProviderAcceptedInsurancesForDisplay({ userId, agencyId, forMatching: true }),
    facets ? Promise.resolve(facets) : listClinicalFacetsForUsers([userId], { agencyId })
  ]);
  return { user, agency, facets: facetMap.get(Number(userId)) || {}, profile: { ...profile,
    insurances: coverage.accepted.flatMap(row => [row.name, ...(row.aliases || [])]),
    excludedInsurances: coverage.excluded, insuranceCredential: coverage.credential } };
}

export function exchangeListingForEvaluation(row, client = {}) {
  const intake = parse(client.intake_preferences_json);
  const preferences = { ...parse(row.preferences_json), ...(row.preferences || {}) };
  return { ...row, currentProviderUserId: row.currentProviderUserId ?? row.current_provider_user_id,
    targetProviderUserId: row.targetProviderUserId ?? row.target_provider_user_id,
    serviceType: row.serviceType || row.service_type, demographics: row.demographics || parse(row.demographics_json),
    diagnoses: row.diagnoses || parse(row.diagnoses_json), presentingProblems: row.presentingProblems || parse(row.presenting_problems_json),
    preferences: { ...preferences, insurance: exchangeInsuranceLabel(client.insurance_type_label, intake.insurance, preferences.insurance) } };
}

export async function assertExchangeRequestEligible({ listing, userId, database = pool, client }) {
  if (!client) {
    const [rows] = await database.execute(`SELECT c.*, i.label AS insurance_type_label FROM clients c
      LEFT JOIN insurance_types i ON i.id = c.insurance_type_id WHERE c.id = ? AND c.agency_id = ?`, [listing.client_id, listing.agency_id]);
    client = rows[0];
  } else if (client.insurance_type_id) {
    const [rows] = await database.execute('SELECT label FROM insurance_types WHERE id = ? AND agency_id = ?', [client.insurance_type_id, listing.agency_id]);
    client = { ...client, insurance_type_label: rows[0]?.label || client.insurance_type_label };
  }
  if (!client) throw Object.assign(new Error('Client no longer belongs to this exchange'), { status: 409 });
  if (['ARCHIVED', 'DECLINED'].includes(String(client.status || '').toUpperCase())) throw Object.assign(new Error('This client is no longer available for requests'), { status: 409 });
  const provider = await loadExchangeProvider({ userId, agencyId: listing.agency_id, database });
  const current = exchangeListingForEvaluation(listing, client);
  const saved = await loadClientExchangeSummary({ client });
  const summary = mergeExchangeSummary(saved, { demographics: current.demographics, preferences: current.preferences,
    presentingProblems: current.preferences.additionalPresentingProblems ?? (saved.presentingProblems.length ? [] : current.presentingProblems) });
  const fit = evaluateExchangeListing({ ...provider, listing: { ...current, ...summary }, client });
  if (!fit.canRequest) throw Object.assign(new Error(fit.blockers.map(reason => reason.message).join(' ')), { status: 409, fit });
  return fit;
}

/** Read only: reuses the scheduling engine without publishing or reserving times. */
export async function loadExchangeOpenings({ userId, agencyId, now = new Date() }) {
  const { default: Availability } = await import('./providerAvailability.service.js');
  const [offices] = await pool.execute(`SELECT ol.id, ol.city FROM office_locations ol
    JOIN office_location_agencies ola ON ola.office_location_id = ol.id WHERE ola.agency_id = ?`, [agencyId]);
  const cities = new Map(offices.map(office => [Number(office.id), office.city]));
  const slots = [];
  for (let week = 0; week < 4; week++) {
    const date = new Date(+now + week * 7 * 86400000);
    const result = await Availability.computeWeekAvailability({ agencyId, providerId: userId,
      weekStartYmd: date.toISOString().slice(0, 10), intakeOnly: true, materializeOfficeEvents: false, includeExternalBusy: false });
    if (!result) throw new Error('Availability could not be checked');
    slots.push(...(result.inPersonSlots || []).map(slot => ({ ...slot, format: 'IN_PERSON', city: cities.get(Number(slot.buildingId)) })),
      ...(result.virtualSlots || []).map(slot => ({ ...slot, format: 'VIRTUAL' })));
  }
  return slots;
}

export async function evaluateCurrentExchangeFit({ context, listing, client }) {
  const initial = evaluateExchangeListing({ ...context, listing, client });
  if (!initial.canNotify || !exchangeNeedsOpenings(listing)) return initial;
  const slots = await loadExchangeOpenings({ userId: context.user.id, agencyId: listing.agencyId || listing.agency_id });
  return evaluateExchangeListing({ ...context, listing, client, slots });
}

export async function exchangeProviderAudit({ listing, agencyId }) {
  const agency = await Agency.findById(agencyId);
  const [rows] = await pool.execute(`SELECT DISTINCT u.* FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND ${exchangeProviderSql} ORDER BY u.first_name, u.last_name`, [agencyId]);
  const users = rows.filter(user => eligibleExchangeProvider(user, agency));
  const facets = await listClinicalFacetsForUsers(users.map(user => user.id), { agencyId });
  const providers = [];
  for (let i = 0; i < users.length; i += 5) {
    const batch = await Promise.all(users.slice(i, i + 5).map(async user => {
      const context = await loadExchangeProvider({ userId: user.id, agencyId, agency, facets });
      if (!context.user) return null;
      let fit;
      try { fit = await evaluateCurrentExchangeFit({ context, listing: { ...listing, agencyId } }); }
      catch { fit = evaluateExchangeListing({ ...context, listing }); }
      return { providerUserId: user.id, providerName: [user.first_name, user.last_name].filter(Boolean).join(' '), fit };
    }));
    providers.push(...batch.filter(Boolean));
  }
  return { checkedAt: new Date().toISOString(), providers };
}
