import {loadExchangeOfficeCoverage} from './clientExchangeOfficeCoverage.service.js';
import { loadExchangeWaivers } from './clientExchangeWaivers.service.js';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Profile from '../models/ProviderPublicProfile.model.js';
import { listClinicalFacetsForUsers } from './providerClinicalFacets.service.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { eligibleExchangeProvider, exchangeProviderSql } from '../utils/clientExchangeProvider.js';
import { evaluateExchangeListing, exchangeInsuranceLabel, exchangeNeedsOpenings } from '../utils/clientExchangeMatching.js';
import { loadClientExchangeSummary } from './clientExchangeSummary.service.js';
import { mergeCurrentExchangeSummary } from '../utils/clientExchangeSummary.js';

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

export async function assertExchangeRequestEligible({ listing, userId, database = pool, client, forAssignment = false }) {
  if (!client) {
    const [rows] = await database.execute(`SELECT c.*, i.label AS insurance_type_label FROM clients c
      LEFT JOIN insurance_types i ON i.id = c.insurance_type_id WHERE c.id = ? AND c.agency_id = ?`, [listing.client_id, listing.agency_id]);
    client = rows[0];
  } else if (client.insurance_type_id) {
    const [rows] = await database.execute('SELECT label FROM insurance_types WHERE id = ? AND agency_id = ?', [client.insurance_type_id, listing.agency_id]);
    client = { ...client, insurance_type_label: rows[0]?.label || client.insurance_type_label };
  }
  if (!client) throw Object.assign(new Error('Client no longer belongs to this exchange'), { status: 409 });
  if (forAssignment) {
    const { assertClientCoverageAdmission } = await import('./clientCoverageAdmission.service.js');
    await assertClientCoverageAdmission(client.id, { db: database, client });
  }
  if (['ARCHIVED', 'DECLINED'].includes(String(client.status || '').toUpperCase())) throw Object.assign(new Error('This client is no longer available for requests'), { status: 409 });
  const provider = await loadExchangeProvider({ userId, agencyId: listing.agency_id, database });
  const current = exchangeListingForEvaluation(listing, client);
  const saved = await loadClientExchangeSummary({ client });
  const summary = mergeCurrentExchangeSummary(saved, { demographics: current.demographics, preferences: current.preferences,
    presentingProblems: current.preferences.additionalPresentingProblems ?? (saved.presentingProblems.length ? [] : current.presentingProblems) }, client);
  const waivers = await loadExchangeWaivers({ listingId: listing.id, userId, database });
  const fit = await evaluateCurrentExchangeFit({ context: { ...provider, waivers }, listing: { ...current, ...summary }, client });
  if (!fit.canRequest) throw Object.assign(new Error(fit.blockers.map(reason => reason.message).join(' ')), { status: 409, fit });
  if (forAssignment && !fit.canAssign) throw Object.assign(new Error('Resolve or waive the remaining fit differences in the matching audit before assignment. ' + fit.assignmentBlockers.map(r => r.message).join(' ')), { status: 409, fit });
  return fit;
}

/** Read only: reuses the scheduling engine without publishing or reserving times. */
export async function loadExchangeOpenings({ userId, agencyId, scheduleAgencyId = agencyId, now = new Date() }) {
  // Most providers have not published intake times. Avoid four full calendar
  // computations for them. This conservative probe only skips when ALL sources
  // are absent; the scheduling engine remains authoritative when any exist.
  try {
    const horizon = new Date(+now + 28 * 86400000);
    const [[source]] = await pool.execute(`SELECT (
      EXISTS(SELECT 1 FROM provider_virtual_working_hours WHERE provider_id=? AND agency_id IN (?,?)
        AND (available_for_intake=1 OR session_type IN ('INTAKE','BOTH')) AND (end_date IS NULL OR end_date>=DATE(?)) AND (start_date IS NULL OR start_date<=DATE(?)))
      OR EXISTS(SELECT 1 FROM provider_virtual_slot_availability WHERE provider_id=? AND agency_id IN (?,?) AND is_active=1 AND end_at>? AND start_at<?
        AND (available_for_intake=1 OR (available_for_intake IS NULL AND (session_type IS NULL OR session_type IN ('INTAKE','BOTH')))))
      OR EXISTS(SELECT 1 FROM provider_in_person_slot_availability WHERE provider_id=? AND agency_id IN (?,?) AND is_active=1 AND available_for_intake=1 AND end_at>? AND start_at<?)
    ) AS published`, [userId, agencyId, scheduleAgencyId, now, horizon, userId, agencyId, scheduleAgencyId, now, horizon, userId, agencyId, scheduleAgencyId, now, horizon]);
    if (Number(source?.published) === 0) return { slots: [], availabilityKnown: false };
  } catch (error) {
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) throw error;
  }
  const { default: Availability } = await import('./providerAvailability.service.js');
  const [offices] = await pool.execute(`SELECT ol.id, ol.city FROM office_locations ol
    JOIN office_location_agencies ola ON ola.office_location_id = ol.id WHERE ola.agency_id = ?`, [agencyId]);
  const cities = new Map(offices.map(office => [Number(office.id), office.city]));
  const result = await Availability.computeWeekAvailability({ agencyId, providerId: userId,
    weekStartYmd: now.toISOString().slice(0, 10), weekCount: 4, intakeOnly: true, materializeOfficeEvents: false, includeExternalBusy: false, includeDiagnostics: true });
  if (!result) throw new Error('Availability could not be checked');
  const slots = [...(result.inPersonSlots || []).map(slot => ({ ...slot, format: 'IN_PERSON', city: cities.get(Number(slot.buildingId)) })),
    ...(result.virtualSlots || []).map(slot => ({ ...slot, format: 'VIRTUAL' }))];
  const availabilityKnown = slots.some(slot => Date.parse(slot.endAt) > +now) || (result.diagnostics || []).some(row => Date.parse(row.endAt) > +now);
  return { slots, availabilityKnown };
}

export async function evaluateCurrentExchangeFit({ context, listing, client }) {
  const waivers = context.waivers || await loadExchangeWaivers({ listingId: listing.id, userId: context.user?.id });
  const modality=String(listing.preferences?.modality || listing.preferences?.preferredModality || '').toLowerCase();
  if(context.user && ['in_person','either'].includes(modality)) {
    let officeCoverage;
    try { officeCoverage=await loadExchangeOfficeCoverage({userId:context.user.id,agencyId:listing.agencyId||listing.agency_id,officeIds:context.profile?.agencyAvailability?.officeIds}); }
    catch { officeCoverage={known:false,cities:[],officeIds:[]}; }
    context={...context,officeCoverage};
  }
  // Matching uses typical availability. Requesting an actual opening has its own
  // scheduling validation; do not run four weeks of calendars on a referral POST.
  return evaluateExchangeListing({ ...context, waivers, listing, client });
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
