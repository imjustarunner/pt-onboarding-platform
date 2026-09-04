/**
 * Office Client Management — roster, hub summary, waitlist actions.
 * Prospective = unassigned / pending office sources / waitlist / prospective-ish status.
 * Continuing = assigned provider + active-ish workflow (not waitlist/archived).
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import TherapyEnrollmentUnit from '../models/TherapyEnrollmentUnit.model.js';
import Appointment from '../models/Appointment.model.js';
import {
  setClientLifecycleStatus,
  LIFECYCLE_STATUS_KEYS
} from './clientLifecycleStatus.service.js';
import { listPendingOfficeClients } from './clientExchange.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

export const OFFICE_CLIENT_TYPES = ['clinical', 'learning', 'basic_nonclinical'];

function normalizeAgencyIds(agencyId, agencyIds) {
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (Array.isArray(agencyIds)) agencyIds.forEach(push);
  else if (typeof agencyIds === 'string' && agencyIds.trim()) {
    agencyIds.split(',').forEach((p) => push(p.trim()));
  }
  push(agencyId);
  return out;
}

function agencyLogoUrl(row) {
  const direct = String(row?.logo_url || row?.logoUrl || '').trim();
  if (direct) return direct;
  return publicUploadsUrlFromStoredPath(row?.logo_path || row?.logoPath || '') || null;
}

function hasAssignedProvider(row) {
  if (row.providerId) return true;
  return Array.isArray(row.providers) && row.providers.length > 0;
}

const PROSPECTIVE_STATUS_KEYS = new Set([
  'prospective',
  'received',
  'packet',
  'pending',
  'pending_corrections',
  'in_process',
  'waitlist',
  'ready_to_schedule',
  'confirmation_pending'
]);

function parseJson(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ageYearsFromDob(dob) {
  const s = String(dob || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
  return years >= 0 && years < 120 ? years : null;
}

function todayYmdLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function deriveBucket(row) {
  const statusKey = String(row.statusKey || '').toLowerCase();
  const workflow = String(row.status || '').toUpperCase();
  if (statusKey === 'waitlist' || workflow === 'ON_HOLD') return 'waitlisted';
  if (!hasAssignedProvider(row)) return 'prospective';
  if (
    ['PUBLIC_OFFICE_INTAKE', 'ADAPTIVE_QUICK_PROSPECTIVE', 'PUBLIC_BOOKING_INQUIRY'].includes(row.source)
    && PROSPECTIVE_STATUS_KEYS.has(statusKey)
    && !['being_seen', 'current', 'scheduled'].includes(statusKey)
  ) {
    return 'prospective';
  }
  return 'continuing';
}

function deriveNextStep(row) {
  if (row.needsClinicalReview) return { key: 'clinical_review', label: 'Clinical review required' };
  if (row.bucket === 'waitlisted' || row.statusKey === 'waitlist') {
    return { key: 'waitlist_followup', label: 'Follow up on waitlist' };
  }
  if (!hasAssignedProvider(row)) {
    if (row.preferredProviderUserId) {
      return { key: 'assign_preferred', label: 'Assign preferred provider' };
    }
    return { key: 'assign_provider', label: 'Assign provider' };
  }
  if (!row.nextAppointmentAt) {
    return { key: 'schedule', label: 'Schedule first appointment' };
  }
  if (!row.portalEnabled && row.whoFor !== 'myself' && row.whoFor !== 'couple') {
    return { key: 'portal_invite', label: 'Send portal invite' };
  }
  return { key: 'monitor', label: 'No immediate action' };
}

function mapWhoFor(meta, prefs) {
  const who = String(meta?.whoFor || prefs?.whoFor || '').trim().toLowerCase();
  if (who === 'couple') return 'couple';
  if (who === 'family') return 'family';
  if (who === 'child' || who === 'dependent') return 'dependent';
  if (who === 'myself' || who === 'self') return 'self';
  return who || (meta?.respondent?.relationship === 'self' ? 'self' : 'self');
}

function intakeTypeLabel(whoFor) {
  if (whoFor === 'couple') return 'Couple';
  if (whoFor === 'family') return 'Family';
  if (whoFor === 'dependent' || whoFor === 'child') return 'Dependent';
  return 'Adult / Self';
}

async function loadGuardiansByClientIds(clientIds) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  let rows;
  try {
    const [r] = await pool.execute(
      `SELECT cg.client_id, cg.relationship_type, cg.relationship_title, cg.access_enabled,
              u.id AS guardian_user_id, u.first_name, u.last_name, u.email
       FROM client_guardians cg
       INNER JOIN users u ON u.id = cg.guardian_user_id
       WHERE cg.client_id IN (${placeholders})
       ORDER BY cg.client_id, cg.id`,
      ids
    );
    rows = r;
  } catch {
    const [r] = await pool.execute(
      `SELECT cg.client_id, cg.relationship_title, cg.access_enabled,
              u.id AS guardian_user_id, u.first_name, u.last_name, u.email
       FROM client_guardians cg
       INNER JOIN users u ON u.id = cg.guardian_user_id
       WHERE cg.client_id IN (${placeholders})
       ORDER BY cg.client_id, cg.id`,
      ids
    );
    rows = (r || []).map((x) => ({ ...x, relationship_type: 'guardian' }));
  }
  const map = new Map();
  for (const row of rows || []) {
    const cid = Number(row.client_id);
    const list = map.get(cid) || [];
    list.push({
      userId: Number(row.guardian_user_id),
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      email: row.email || null,
      relationship: row.relationship_title || row.relationship_type || 'Guardian',
      accessEnabled: Number(row.access_enabled) === 1
    });
    map.set(cid, list);
  }
  return map;
}

async function loadTherapyUnitsByClientIds(clientIds) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  let rows;
  try {
    const [r] = await pool.execute(
      `SELECT m.client_id, m.unit_id, m.member_role, m.participation_status,
              u.unit_type, u.status AS unit_status, u.primary_contact_client_id,
              (SELECT COUNT(*) FROM therapy_enrollment_unit_members tm WHERE tm.unit_id = u.id) AS member_count
       FROM therapy_enrollment_unit_members m
       INNER JOIN therapy_enrollment_units u ON u.id = m.unit_id
       WHERE m.client_id IN (${placeholders})`,
      ids
    );
    rows = r;
  } catch {
    return new Map();
  }
  const map = new Map();
  for (const row of rows || []) {
    map.set(Number(row.client_id), {
      id: Number(row.unit_id),
      unitType: row.unit_type,
      status: row.unit_status,
      memberRole: row.member_role,
      participationStatus: row.participation_status,
      primaryContactClientId: row.primary_contact_client_id
        ? Number(row.primary_contact_client_id)
        : null,
      memberCount: Number(row.member_count || 0)
    });
  }
  return map;
}

async function loadNextAppointmentsByClientIds(clientIds) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT a.client_id, MIN(a.start_at) AS next_start
       FROM appointments a
       WHERE a.client_id IN (${placeholders})
         AND a.start_at >= NOW()
         AND (a.status IS NULL OR LOWER(a.status) NOT IN ('cancelled', 'canceled', 'no_show'))
       GROUP BY a.client_id`,
      ids
    );
    const map = new Map();
    for (const row of rows || []) {
      map.set(Number(row.client_id), row.next_start || null);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadWaitlistNotesByClientIds(clientIds) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT cn.client_id, cn.message, cn.updated_at
       FROM client_notes cn
       INNER JOIN (
         SELECT client_id, MAX(id) AS max_id
         FROM client_notes
         WHERE client_id IN (${placeholders}) AND category = 'waitlist'
         GROUP BY client_id
       ) latest ON latest.max_id = cn.id`,
      ids
    );
    const map = new Map();
    for (const row of rows || []) {
      map.set(Number(row.client_id), {
        message: row.message || '',
        updatedAt: row.updated_at || null
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function enrichRow(base, { guardians, therapyUnit, nextAppointmentAt, waitlistNote }) {
  const prefs = base.intakePreferences || {};
  const meta = base.adaptiveMeta || {};
  const whoFor = mapWhoFor(meta, prefs);
  const needsClinicalReview = !!(
    prefs.needsClinicalReview
    || prefs.clinicalSafetyAlert
    || meta.needsClinicalReview
    || meta.clinicalSafetyAlert
  );
  const preferredProviderUserId = Number(
    prefs.preferredProviderUserId
    || meta.preferredProviderUserId
    || prefs.preferred_office_provider_ids?.[0]
    || 0
  ) || null;
  const row = {
    ...base,
    age: ageYearsFromDob(base.dateOfBirth || meta.birthdate),
    whoFor,
    intakeType: intakeTypeLabel(whoFor),
    needsClinicalReview,
    clinicalReviewHoldReason: prefs.clinicalReviewHoldReason || meta.clinicalReviewHoldReason || null,
    preferredProviderUserId,
    preferredProviderName: null,
    portalEnabled: !!base.portalEnabled,
    guardians: guardians || [],
    therapyUnit: therapyUnit || null,
    nextAppointmentAt: nextAppointmentAt || null,
    waitlistNote: waitlistNote?.message || null,
    waitlistReason: prefs.waitlist?.reason || null,
    waitlistPriority: prefs.waitlist?.priority || null,
    waitlistFollowUpAt: prefs.waitlist?.followUpAt || null
  };
  row.bucket = deriveBucket(row);
  row.nextStep = deriveNextStep(row);
  return row;
}

/**
 * Batch-load agency metadata for logos / names.
 */
async function loadAgenciesByIds(agencyIds) {
  const ids = [...new Set((agencyIds || []).map((n) => Number(n)).filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, name, slug, logo_url, logo_path
     FROM agencies
     WHERE id IN (${placeholders})`,
    ids
  );
  const map = new Map();
  for (const row of rows || []) {
    map.set(Number(row.id), {
      id: Number(row.id),
      name: row.name || null,
      slug: row.slug || null,
      logoUrl: agencyLogoUrl(row)
    });
  }
  return map;
}

async function loadAffiliationsByClientIds(clientIds, agencyLookup) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT ca.client_id, ca.agency_id, ca.is_primary,
              a.name AS agency_name, a.slug AS agency_slug, a.logo_url, a.logo_path
       FROM client_agency_assignments ca
       INNER JOIN agencies a ON a.id = ca.agency_id
       WHERE ca.client_id IN (${placeholders})
         AND ca.is_active = TRUE
       ORDER BY ca.is_primary DESC, a.name ASC`,
      ids
    );
    for (const row of rows || []) {
      const cid = Number(row.client_id);
      const agencyId = Number(row.agency_id);
      const list = map.get(cid) || [];
      list.push({
        agencyId,
        isPrimary: !!row.is_primary,
        name: row.agency_name || agencyLookup.get(agencyId)?.name || null,
        slug: row.agency_slug || agencyLookup.get(agencyId)?.slug || null,
        logoUrl: agencyLogoUrl(row) || agencyLookup.get(agencyId)?.logoUrl || null
      });
      map.set(cid, list);
    }
  } catch {
    // table may be missing on older DBs
  }
  return map;
}

async function loadProvidersByClientIds(clientIds, agencyLookup) {
  const ids = (clientIds || []).map((n) => Number(n)).filter((n) => n > 0);
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT cpa.client_id, cpa.organization_id, cpa.provider_user_id, cpa.is_primary, cpa.service_day,
              u.first_name, u.last_name,
              org.name AS organization_name, org.slug AS organization_slug,
              org.logo_url, org.logo_path
       FROM client_provider_assignments cpa
       INNER JOIN users u ON u.id = cpa.provider_user_id
       LEFT JOIN agencies org ON org.id = cpa.organization_id
       WHERE cpa.client_id IN (${placeholders})
         AND cpa.is_active = TRUE
       ORDER BY org.name ASC, u.last_name ASC, u.first_name ASC`,
      ids
    );
    const seen = new Set();
    for (const row of rows || []) {
      const cid = Number(row.client_id);
      const providerId = Number(row.provider_user_id);
      const orgId = row.organization_id ? Number(row.organization_id) : null;
      const dedupeKey = `${cid}:${orgId || 0}:${providerId}:${row.service_day || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const list = map.get(cid) || [];
      list.push({
        providerId,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || null,
        agencyId: orgId,
        agencyName: row.organization_name || agencyLookup.get(orgId)?.name || null,
        agencySlug: row.organization_slug || agencyLookup.get(orgId)?.slug || null,
        agencyLogoUrl: agencyLogoUrl(row) || agencyLookup.get(orgId)?.logoUrl || null,
        isPrimary: !!row.is_primary,
        serviceDay: row.service_day || null
      });
      map.set(cid, list);
    }
  } catch (err) {
    const msg = String(err?.message || '');
    if (!(msg.includes('Unknown column') && msg.includes('is_primary'))) return map;
    try {
      const [rows] = await pool.execute(
        `SELECT cpa.client_id, cpa.organization_id, cpa.provider_user_id, cpa.service_day,
                u.first_name, u.last_name,
                org.name AS organization_name, org.slug AS organization_slug,
                org.logo_url, org.logo_path
         FROM client_provider_assignments cpa
         INNER JOIN users u ON u.id = cpa.provider_user_id
         LEFT JOIN agencies org ON org.id = cpa.organization_id
         WHERE cpa.client_id IN (${placeholders})
           AND cpa.is_active = TRUE
         ORDER BY org.name ASC, u.last_name ASC, u.first_name ASC`,
        ids
      );
      for (const row of rows || []) {
        const cid = Number(row.client_id);
        const providerId = Number(row.provider_user_id);
        const orgId = row.organization_id ? Number(row.organization_id) : null;
        const list = map.get(cid) || [];
        list.push({
          providerId,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || null,
          agencyId: orgId,
          agencyName: row.organization_name || agencyLookup.get(orgId)?.name || null,
          agencySlug: row.organization_slug || agencyLookup.get(orgId)?.slug || null,
          agencyLogoUrl: agencyLogoUrl(row) || agencyLookup.get(orgId)?.logoUrl || null,
          isPrimary: false,
          serviceDay: row.service_day || null
        });
        map.set(cid, list);
      }
    } catch {
      // ignore
    }
  }
  return map;
}

function mergeClientAgencies({ primaryAgencyId, affiliations, agencyLookup }) {
  const byId = new Map();
  const push = (item) => {
    const id = Number(item?.agencyId || 0);
    if (!id) return;
    const prev = byId.get(id) || {};
    byId.set(id, {
      agencyId: id,
      name: item.name || prev.name || agencyLookup.get(id)?.name || null,
      slug: item.slug || prev.slug || agencyLookup.get(id)?.slug || null,
      logoUrl: item.logoUrl || prev.logoUrl || agencyLookup.get(id)?.logoUrl || null,
      isPrimary: !!(item.isPrimary || prev.isPrimary)
    });
  };
  for (const a of affiliations || []) push(a);
  if (primaryAgencyId) {
    const meta = agencyLookup.get(Number(primaryAgencyId));
    push({
      agencyId: Number(primaryAgencyId),
      name: meta?.name || null,
      slug: meta?.slug || null,
      logoUrl: meta?.logoUrl || null,
      isPrimary: !(affiliations || []).some((x) => x.isPrimary)
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function mergeClientProviders({ legacyProviderId, legacyProviderName, primaryAgencyId, providers, agencies }) {
  const list = [];
  const seen = new Set();
  for (const p of providers || []) {
    const key = `${Number(p.providerId)}:${Number(p.agencyId || 0)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }
  if (legacyProviderId) {
    const already = list.some((p) => Number(p.providerId) === Number(legacyProviderId));
    if (!already) {
      const agency = (agencies || []).find((a) => Number(a.agencyId) === Number(primaryAgencyId))
        || (agencies || [])[0]
        || null;
      list.unshift({
        providerId: Number(legacyProviderId),
        name: legacyProviderName || null,
        agencyId: agency?.agencyId || primaryAgencyId || null,
        agencyName: agency?.name || null,
        agencySlug: agency?.slug || null,
        agencyLogoUrl: agency?.logoUrl || null,
        isPrimary: true,
        serviceDay: null
      });
    }
  }
  return list;
}

/**
 * Agency-scoped office client roster (supports multi-tenant agencyIds).
 */
export async function listOfficeClients({
  agencyId,
  agencyIds = null,
  bucket = 'all',
  providerId = null,
  preferredProviderId = null,
  whoFor = null,
  needsAction = false,
  clinicalReview = false,
  search = '',
  sort = 'submitted',
  limit = 200
} = {}) {
  const aids = normalizeAgencyIds(agencyId, agencyIds);
  if (!aids.length) return { clients: [], aggregates: emptyAggregates(), agencyIds: [] };

  const typePlaceholders = OFFICE_CLIENT_TYPES.map(() => '?').join(',');
  const agencyPlaceholders = aids.map(() => '?').join(',');
  const params = [...aids, ...aids, ...OFFICE_CLIENT_TYPES];
  let sql = `
    SELECT c.id, c.initials, c.full_name, c.identifier_code, c.client_type, c.status,
           c.contact_phone, c.submission_date, c.source, c.intake_preferences_json,
           c.adaptive_intake_meta_json, c.created_at, c.date_of_birth, c.provider_id,
           c.agency_id, c.guardian_portal_enabled, c.waitlist_started_at, c.client_status_id,
           c.created_via_dev_fill,
           cs.status_key AS client_status_key, cs.label AS client_status_label,
           u.first_name AS provider_first, u.last_name AS provider_last,
           a.name AS agency_name, a.slug AS agency_slug, a.logo_url AS agency_logo_url, a.logo_path AS agency_logo_path
    FROM clients c
    LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
    LEFT JOIN users u ON u.id = c.provider_id
    LEFT JOIN agencies a ON a.id = c.agency_id
    WHERE (
        c.agency_id IN (${agencyPlaceholders})
        OR EXISTS (
          SELECT 1 FROM client_agency_assignments caa
          WHERE caa.client_id = c.id
            AND caa.is_active = TRUE
            AND caa.agency_id IN (${agencyPlaceholders})
        )
      )
      AND c.client_type IN (${typePlaceholders})
      AND c.status NOT IN ('ARCHIVED')
  `;

  if (providerId) {
    sql += ` AND (
      c.provider_id = ?
      OR EXISTS (
        SELECT 1 FROM client_provider_assignments cpa
        WHERE cpa.client_id = c.id AND cpa.is_active = TRUE AND cpa.provider_user_id = ?
      )
    )`;
    params.push(Number(providerId), Number(providerId));
  }

  sql += ` ORDER BY c.created_at DESC LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 500)}`;

  let rows;
  try {
    const [r] = await pool.execute(sql, params);
    rows = r;
  } catch (err) {
    if (!/Unknown column|doesn't exist|ER_NO_SUCH_TABLE/i.test(String(err?.message || ''))) throw err;
    const fbParams = [...aids, ...OFFICE_CLIENT_TYPES];
    const [r] = await pool.execute(
      `SELECT c.id, c.initials, c.full_name, c.identifier_code, c.client_type, c.status,
              c.contact_phone, c.submission_date, c.source, c.intake_preferences_json,
              c.created_at, c.provider_id, c.agency_id, c.client_status_id,
              cs.status_key AS client_status_key, cs.label AS client_status_label,
              u.first_name AS provider_first, u.last_name AS provider_last,
              a.name AS agency_name
       FROM clients c
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       LEFT JOIN users u ON u.id = c.provider_id
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE c.agency_id IN (${agencyPlaceholders})
         AND c.client_type IN (${typePlaceholders})
         AND c.status NOT IN ('ARCHIVED')
       ORDER BY c.created_at DESC
       LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 500)}`,
      fbParams
    );
    rows = r;
  }

  const baseRows = (rows || []).map((row) => ({
    id: Number(row.id),
    initials: row.initials,
    fullName: row.full_name,
    identifierCode: row.identifier_code,
    clientType: row.client_type,
    status: row.status,
    statusKey: row.client_status_key || null,
    statusLabel: row.client_status_label || row.status || null,
    contactPhone: row.contact_phone,
    submissionDate: row.submission_date,
    source: row.source,
    intakePreferences: parseJson(row.intake_preferences_json, {}) || {},
    adaptiveMeta: parseJson(row.adaptive_intake_meta_json, {}) || {},
    createdAt: row.created_at,
    dateOfBirth: row.date_of_birth || null,
    providerId: row.provider_id ? Number(row.provider_id) : null,
    providerName: `${row.provider_first || ''} ${row.provider_last || ''}`.trim() || null,
    agencyId: row.agency_id ? Number(row.agency_id) : null,
    agencyName: row.agency_name || null,
    agencySlug: row.agency_slug || null,
    agencyLogoUrl: agencyLogoUrl({
      logo_url: row.agency_logo_url,
      logo_path: row.agency_logo_path
    }),
    portalEnabled: Number(row.guardian_portal_enabled) === 1,
    waitlistStartedAt: row.waitlist_started_at || null,
    createdViaDevFill: Number(row.created_via_dev_fill) === 1
  }));

  const ids = baseRows.map((r) => r.id);
  const agencyIdSet = new Set(aids);
  for (const row of baseRows) {
    if (row.agencyId) agencyIdSet.add(row.agencyId);
  }
  const agencyLookup = await loadAgenciesByIds([...agencyIdSet]);

  const [guardiansMap, unitsMap, nextApptMap, waitlistNotesMap, providerNameById, affiliationsMap, providersMap] =
    await Promise.all([
      loadGuardiansByClientIds(ids),
      loadTherapyUnitsByClientIds(ids),
      loadNextAppointmentsByClientIds(ids),
      loadWaitlistNotesByClientIds(ids),
      loadPreferredProviderNames(baseRows),
      loadAffiliationsByClientIds(ids, agencyLookup),
      loadProvidersByClientIds(ids, agencyLookup)
    ]);

  let clients = baseRows.map((base) => {
    const allAgencies = mergeClientAgencies({
      primaryAgencyId: base.agencyId,
      affiliations: affiliationsMap.get(base.id) || [],
      agencyLookup
    });

    const providers = mergeClientProviders({
      legacyProviderId: base.providerId,
      legacyProviderName: base.providerName,
      primaryAgencyId: base.agencyId,
      providers: providersMap.get(base.id) || [],
      agencies: allAgencies
    });

    const enriched = enrichRow(
      {
        ...base,
        agencies: allAgencies,
        providers,
        providerName: providers.map((p) => p.name).filter(Boolean).join(', ') || base.providerName,
        agencyName: allAgencies[0]?.name || base.agencyName,
        agencyLogoUrl: allAgencies[0]?.logoUrl || base.agencyLogoUrl
      },
      {
        guardians: guardiansMap.get(base.id) || [],
        therapyUnit: unitsMap.get(base.id) || null,
        nextAppointmentAt: nextApptMap.get(base.id) || null,
        waitlistNote: waitlistNotesMap.get(base.id) || null
      }
    );
    if (enriched.preferredProviderUserId) {
      enriched.preferredProviderName =
        providerNameById.get(enriched.preferredProviderUserId) || null;
    }
    return enriched;
  });

  const aggregates = buildAggregates(clients);

  const bucketFilter = String(bucket || 'all').toLowerCase();
  if (bucketFilter === 'prospective') {
    clients = clients.filter((c) => c.bucket === 'prospective');
  } else if (bucketFilter === 'continuing') {
    clients = clients.filter((c) => c.bucket === 'continuing');
  } else if (bucketFilter === 'waitlisted') {
    clients = clients.filter((c) => c.bucket === 'waitlisted' || c.statusKey === 'waitlist');
  }

  const who = String(whoFor || '').trim().toLowerCase();
  if (who) {
    clients = clients.filter((c) => c.whoFor === who);
  }

  if (preferredProviderId) {
    const pid = Number(preferredProviderId);
    clients = clients.filter((c) => Number(c.preferredProviderUserId) === pid);
  }

  if (clinicalReview) {
    clients = clients.filter((c) => c.needsClinicalReview);
  }

  if (needsAction) {
    clients = clients.filter((c) => c.nextStep?.key && c.nextStep.key !== 'monitor');
  }

  const q = String(search || '').trim().toLowerCase();
  if (q) {
    clients = clients.filter((c) => {
      const hay = [
        c.fullName,
        c.identifierCode,
        c.contactPhone,
        c.providerName,
        c.preferredProviderName,
        ...(c.agencies || []).map((a) => a.name),
        ...(c.providers || []).map((p) => p.name),
        ...(c.guardians || []).map((g) => g.fullName),
        ...(c.guardians || []).map((g) => g.email)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const sortKey = String(sort || 'submitted').toLowerCase();
  clients.sort((a, b) => {
    if (sortKey === 'name') {
      return String(a.fullName || '').localeCompare(String(b.fullName || ''));
    }
    if (sortKey === 'agency' || sortKey === 'tenant') {
      const an = (a.agencies || []).map((x) => x.name).join(',') || a.agencyName || 'zzz';
      const bn = (b.agencies || []).map((x) => x.name).join(',') || b.agencyName || 'zzz';
      return String(an).localeCompare(String(bn))
        || String(a.fullName || '').localeCompare(String(b.fullName || ''));
    }
    if (sortKey === 'preferredprovider') {
      return String(a.preferredProviderName || 'zzz').localeCompare(String(b.preferredProviderName || 'zzz'))
        || String(a.fullName || '').localeCompare(String(b.fullName || ''));
    }
    if (sortKey === 'assignedprovider') {
      return String(a.providerName || 'zzz').localeCompare(String(b.providerName || 'zzz'))
        || String(a.fullName || '').localeCompare(String(b.fullName || ''));
    }
    if (sortKey === 'family' || sortKey === 'unit') {
      const ua = a.therapyUnit?.id || 0;
      const ub = b.therapyUnit?.id || 0;
      if (ua !== ub) return ub - ua;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return { clients, aggregates, agencyIds: aids };
}

function emptyAggregates() {
  return {
    total: 0,
    prospective: 0,
    continuing: 0,
    waitlisted: 0,
    clinicalReview: 0,
    unassigned: 0,
    portalPending: 0,
    needsAction: 0,
    newToday: 0
  };
}

function buildAggregates(source) {
  const today = todayYmdLocal();
  const agg = emptyAggregates();
  agg.total = source.length;
  for (const c of source) {
    if (c.bucket === 'prospective') agg.prospective += 1;
    if (c.bucket === 'continuing') agg.continuing += 1;
    if (c.bucket === 'waitlisted' || c.statusKey === 'waitlist') agg.waitlisted += 1;
    if (c.needsClinicalReview) agg.clinicalReview += 1;
    if (!hasAssignedProvider(c)) agg.unassigned += 1;
    if (!c.portalEnabled) agg.portalPending += 1;
    if (c.nextStep?.key && c.nextStep.key !== 'monitor') agg.needsAction += 1;
    const created = String(c.createdAt || '').slice(0, 10);
    if (created === today) agg.newToday += 1;
  }
  return agg;
}

async function loadPreferredProviderNames(baseRows) {
  const ids = new Set();
  for (const row of baseRows) {
    const prefs = row.intakePreferences || {};
    const meta = row.adaptiveMeta || {};
    const pid = Number(
      prefs.preferredProviderUserId
      || meta.preferredProviderUserId
      || prefs.preferred_office_provider_ids?.[0]
      || 0
    );
    if (pid) ids.add(pid);
  }
  if (!ids.size) return new Map();
  const list = [...ids];
  const placeholders = list.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`,
    list
  );
  const map = new Map();
  for (const row of rows || []) {
    map.set(Number(row.id), `${row.first_name || ''} ${row.last_name || ''}`.trim());
  }
  return map;
}

export async function listOfficeTherapyUnits({ agencyId }) {
  const aid = Number(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT u.*,
              (SELECT COUNT(*) FROM therapy_enrollment_unit_members m WHERE m.unit_id = u.id) AS member_count
       FROM therapy_enrollment_units u
       WHERE u.agency_id = ?
       ORDER BY u.created_at DESC
       LIMIT 200`,
      [aid]
    );
    const units = [];
    for (const row of rows || []) {
      const members = await TherapyEnrollmentUnit.listMembers(row.id).catch(() => []);
      units.push({
        id: Number(row.id),
        unitType: row.unit_type,
        pathway: row.pathway,
        status: row.status,
        primaryContactClientId: row.primary_contact_client_id
          ? Number(row.primary_contact_client_id)
          : null,
        memberCount: Number(row.member_count || 0),
        meta: parseJson(row.meta_json, null),
        createdAt: row.created_at,
        members
      });
    }
    return units;
  } catch {
    return [];
  }
}

export async function setOfficeClientWaitlist({
  clientId,
  agencyId,
  reason = '',
  priority = null,
  followUpAt = null,
  actorUserId = null,
  remove = false
}) {
  const cid = Number(clientId);
  const aid = Number(agencyId);
  if (!cid || !aid) throw Object.assign(new Error('clientId and agencyId required'), { status: 400 });

  const [rows] = await pool.execute(
    `SELECT id, agency_id, client_type, intake_preferences_json, status
     FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const client = rows?.[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  const primaryAid = Number(client.agency_id);
  let affiliated = primaryAid === aid;
  if (!affiliated) {
    try {
      const [aff] = await pool.execute(
        `SELECT 1 FROM client_agency_assignments
         WHERE client_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1`,
        [cid, aid]
      );
      affiliated = Boolean(aff?.[0]);
    } catch {
      affiliated = false;
    }
  }
  if (!affiliated) {
    throw Object.assign(new Error('Client is not in this agency'), { status: 403 });
  }
  if (!OFFICE_CLIENT_TYPES.includes(String(client.client_type || '').toLowerCase())) {
    throw Object.assign(new Error('Not an office client type'), { status: 400 });
  }

  const prefs = parseJson(client.intake_preferences_json, {}) || {};
  if (remove) {
    const nextPrefs = {
      ...prefs,
      waitlist: {
        ...(prefs.waitlist || {}),
        active: false,
        removedAt: new Date().toISOString(),
        removedByUserId: actorUserId || null
      }
    };
    await Client.update(cid, { intake_preferences_json: JSON.stringify(nextPrefs) }, actorUserId);
    await setClientLifecycleStatus({
      clientId: cid,
      statusKey: LIFECYCLE_STATUS_KEYS.READY_TO_SCHEDULE,
      actorUserId,
      note: 'Removed from office waitlist',
      extraPatch: { waitlist_started_at: null, status: 'PENDING_REVIEW' }
    });
    return { clientId: cid, waitlisted: false };
  }

  const nextPrefs = {
    ...prefs,
    waitlist: {
      active: true,
      reason: String(reason || '').trim() || null,
      priority: priority || null,
      followUpAt: followUpAt || null,
      addedAt: new Date().toISOString(),
      addedByUserId: actorUserId || null
    }
  };
  await Client.update(cid, { intake_preferences_json: JSON.stringify(nextPrefs) }, actorUserId);
  await setClientLifecycleStatus({
    clientId: cid,
    statusKey: LIFECYCLE_STATUS_KEYS.WAITLIST,
    actorUserId,
    note: reason ? `Office waitlist: ${reason}` : 'Placed on office waitlist',
    extraPatch: { waitlist_started_at: new Date() }
  });
  if (reason && actorUserId) {
    await ClientNotes.upsertSharedSingletonByClientAndCategory({
      clientId: cid,
      category: 'waitlist',
      message: String(reason).trim(),
      actorUserId
    }).catch(() => {});
  }
  return { clientId: cid, waitlisted: true };
}

export async function listHubProviders({ agencyId, agencyIds = null }) {
  const aids = normalizeAgencyIds(agencyId, agencyIds);
  if (!aids.length) return [];
  const placeholders = aids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.title, u.credential,
              COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
              (
                SELECT COUNT(*) FROM clients c
                WHERE c.provider_id = u.id
                  AND c.agency_id IN (${placeholders})
                  AND c.status NOT IN ('ARCHIVED')
                  AND c.client_type IN ('clinical','learning','basic_nonclinical')
              ) AS caseload,
              GROUP_CONCAT(DISTINCT ua.agency_id ORDER BY ua.agency_id) AS agency_ids
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
       WHERE LOWER(COALESCE(u.role, '')) IN ('provider', 'clinician', 'therapist', 'counselor', 'provider_plus')
          OR COALESCE(u.has_provider_access, 0) = 1
       GROUP BY u.id, u.first_name, u.last_name, u.title, u.credential, u.provider_accepting_new_clients
       ORDER BY u.last_name ASC, u.first_name ASC
       LIMIT 200`,
      [...aids, ...aids]
    );
    const agencyLookup = await loadAgenciesByIds(aids);
    return (rows || []).map((r) => {
      const providerAgencyIds = String(r.agency_ids || '')
        .split(',')
        .map((x) => Number(x))
        .filter((n) => n > 0);
      return {
        id: Number(r.id),
        firstName: r.first_name,
        lastName: r.last_name,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        title: r.title || null,
        credentials: r.credential || r.title || null,
        acceptingNewClients: Number(r.accepting) === 1,
        caseload: Number(r.caseload || 0),
        agencyIds: providerAgencyIds,
        agencies: providerAgencyIds.map((id) => agencyLookup.get(id)).filter(Boolean)
      };
    });
  } catch {
    try {
      const aid = aids[0];
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE LOWER(COALESCE(u.role, '')) IN ('provider', 'provider_plus')
         ORDER BY u.last_name ASC
         LIMIT 100`,
        [aid]
      );
      return (rows || []).map((r) => ({
        id: Number(r.id),
        firstName: r.first_name,
        lastName: r.last_name,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
        title: null,
        credentials: null,
        acceptingNewClients: true,
        caseload: 0,
        agencyIds: [aid],
        agencies: []
      }));
    } catch {
      return [];
    }
  }
}

export async function getOfficeHubSummary({ agencyId, agencyIds = null }) {
  const aids = normalizeAgencyIds(agencyId, agencyIds);
  if (!aids.length) {
    return {
      todaysAppointments: 0,
      newOfficeIntakes: 0,
      pendingReview: 0,
      activeProviders: 0,
      waitlisted: 0,
      unassigned: 0,
      clinicalReview: 0,
      acceptancePending: 0
    };
  }

  const [{ clients, aggregates }, providers] = await Promise.all([
    listOfficeClients({ agencyIds: aids, bucket: 'all', limit: 400 }),
    listHubProviders({ agencyIds: aids })
  ]);

  let pending = [];
  try {
    const chunks = await Promise.all(aids.map((aid) => listPendingOfficeClients({ agencyId: aid }).catch(() => [])));
    const seen = new Set();
    for (const list of chunks) {
      for (const row of list || []) {
        const id = Number(row.id || row.clientId || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        pending.push(row);
      }
    }
  } catch {
    pending = [];
  }

  const today = todayYmdLocal();
  const tomorrow = addDaysYmd(today, 1);
  let todaysAppointments = 0;
  try {
    const chunks = await Promise.all(
      aids.map((aid) =>
        Appointment.listForAgencyInWindow({
          agencyId: aid,
          windowStart: `${today} 00:00:00`,
          windowEnd: `${tomorrow} 00:00:00`
        }).catch(() => [])
      )
    );
    const seen = new Set();
    for (const appts of chunks) {
      for (const a of appts || []) {
        const id = Number(a.id || 0);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        if (['cancelled', 'canceled', 'no_show'].includes(String(a.status || '').toLowerCase())) continue;
        todaysAppointments += 1;
      }
    }
  } catch {
    todaysAppointments = 0;
  }

  let acceptancePending = 0;
  try {
    const { listPendingAcceptanceClients } = await import('./clientExchange.service.js');
    const chunks = await Promise.all(
      aids.map((aid) => listPendingAcceptanceClients({ agencyId: aid }).catch(() => []))
    );
    const seen = new Set();
    for (const list of chunks) {
      for (const row of list || []) {
        const id = Number(row.id || row.clientId || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        acceptancePending += 1;
      }
    }
  } catch {
    acceptancePending = 0;
  }

  return {
    todaysAppointments,
    newOfficeIntakes: pending.length,
    pendingReview: aggregates.clinicalReview + aggregates.unassigned,
    activeProviders: providers.filter((p) => p.acceptingNewClients).length || providers.length,
    providerCount: providers.length,
    waitlisted: aggregates.waitlisted,
    unassigned: aggregates.unassigned,
    clinicalReview: aggregates.clinicalReview,
    prospective: aggregates.prospective,
    continuing: aggregates.continuing,
    needsAction: aggregates.needsAction,
    portalPending: aggregates.portalPending,
    newToday: aggregates.newToday,
    acceptancePending,
    agencyIds: aids,
    clientsSample: clients.slice(0, 8),
    providers: providers.slice(0, 14)
  };
}
