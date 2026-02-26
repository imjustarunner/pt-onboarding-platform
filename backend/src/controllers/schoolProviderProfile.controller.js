import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import {
  getSupervisorSuperviseeIds,
  isSupervisorActor,
  supervisorHasSuperviseeInSchool
} from '../utils/supervisorSchoolAccess.js';
import { isBachelorsCredentialText, normalizeCredentialToken } from '../utils/credentialNormalization.js';

const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const missingSchemaError = (e) => {
  const msg = String(e?.message || '');
  return (
    msg.includes("doesn't exist") ||
    msg.includes('ER_NO_SUCH_TABLE') ||
    msg.includes('Unknown column') ||
    msg.includes('ER_BAD_FIELD_ERROR')
  );
};

const parseBooleanLike = (raw) => {
  if (raw === true || raw === 1 || raw === '1') return true;
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y';
};

const normalizeDay = (d) => {
  const s = String(d || '').trim();
  return allowedDays.includes(s) ? s : null;
};

async function ensureSchoolAccess(req, schoolId) {
  const schoolOrgId = parseInt(schoolId, 10);
  if (!schoolOrgId) return { ok: false, status: 400, message: 'Invalid schoolId' };

  const school = await Agency.findById(schoolOrgId);
  if (!school) return { ok: false, status: 404, message: 'School organization not found' };
  const orgType = String(school.organization_type || 'agency').toLowerCase();
  if (orgType !== 'school') return { ok: false, status: 400, message: 'This endpoint is only available for school organizations' };

  if (req.user?.role !== 'super_admin') {
    const orgs = await User.getAgencies(req.user.id);
    const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === schoolOrgId);
    if (!hasDirect) {
      const role = String(req.user?.role || '').toLowerCase();
      const hasSupervisorCapability = await isSupervisorActor({ userId: req.user?.id, role, user: req.user });
      if (hasSupervisorCapability) {
        const canSupervisorAccess = await supervisorHasSuperviseeInSchool(req.user?.id, schoolOrgId);
        if (canSupervisorAccess) return { ok: true, school, supervisorLimited: true };
      }
      const canUseAgencyAffiliation = role === 'admin' || role === 'support' || role === 'staff' || role === 'supervisor';
      if (!canUseAgencyAffiliation) return { ok: false, status: 403, message: 'You do not have access to this school organization' };
      const activeAgencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(schoolOrgId)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(schoolOrgId)) ||
        null;
      const hasAgency = activeAgencyId
        ? (orgs || []).some((o) => parseInt(o.id, 10) === parseInt(activeAgencyId, 10))
        : false;
      if (!hasAgency) return { ok: false, status: 403, message: 'You do not have access to this school organization' };
    }
  }

  return { ok: true, school };
}

async function getActiveAgencyIdForSchool(schoolId) {
  const schoolOrgId = parseInt(schoolId, 10);
  if (!schoolOrgId) return null;
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(schoolOrgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(schoolOrgId)) ||
    null
  );
}

async function ensureSupervisorCanAccessProvider({ req, access, providerUserId }) {
  if (!access?.supervisorLimited) return true;
  const superviseeIds = await getSupervisorSuperviseeIds(req.user?.id, null);
  return (superviseeIds || []).some((id) => parseInt(id, 10) === parseInt(providerUserId, 10));
}

async function ensureProviderAffiliated(providerUserId, schoolId) {
  const pid = parseInt(providerUserId, 10);
  const sid = parseInt(schoolId, 10);
  if (!pid || !sid) return { ok: false };

  const orgs = await User.getAgencies(pid);
  const hasDirect = (orgs || []).some((o) => parseInt(o.id, 10) === sid);
  if (hasDirect) return { ok: true };

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id = ?
         AND psa.is_active = TRUE
       LIMIT 1`,
      [sid, pid]
    );
    if (rows?.[0]) return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [sid, pid]
    );
    if (rows?.[0]) return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM clients c
       WHERE c.organization_id = ?
         AND c.provider_id = ?
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       LIMIT 1`,
      [sid, pid]
    );
    return { ok: !!rows?.[0] };
  } catch {
    return { ok: false };
  }
}

/** Split credential text into individual tokens (e.g. "BA, LPCC" -> ["BA", "LPCC"]) */
function parseCredentialTokens(credentialText) {
  const s = String(credentialText ?? '').trim();
  if (!s) return [];
  return s
    .split(/[,;\/&]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function computeAcceptedInsurances({ agencyId, providerUserId, credentialText }) {
  const aid = parseInt(agencyId, 10);
  const uid = parseInt(providerUserId, 10);
  if (!aid || !uid) return { accepted: [], acceptsTricareOverride: false };

  try {
    const [insuranceRows] = await pool.execute(
      `SELECT id, insurance_key, label
       FROM insurance_types
       WHERE agency_id = ? AND is_active = TRUE
       ORDER BY label ASC`,
      [aid]
    );
    if (!insuranceRows?.length) return { accepted: [], acceptsTricareOverride: false };

    const insuranceById = new Map((insuranceRows || []).map((r) => [Number(r.id), r]));
    const insuranceByKey = new Map((insuranceRows || []).map((r) => [String(r.insurance_key || '').toLowerCase(), r]));

    const [credentialRows] = await pool.execute(
      `SELECT id, credential_key, label
       FROM provider_credentials
       WHERE agency_id = ? AND is_active = TRUE`,
      [aid]
    );

    // Resolve ALL credentials in the text (e.g. "BA, LPCC" -> both bachelors and lpcc)
    const tokens = parseCredentialTokens(credentialText);
    const resolvedCredentialIds = new Set();
    for (const token of tokens) {
      const norm = normalizeCredentialToken(token);
      if (!norm) continue;
      let cred =
        (credentialRows || []).find((r) => normalizeCredentialToken(r.credential_key) === norm) ||
        (credentialRows || []).find((r) => normalizeCredentialToken(r.label) === norm) ||
        null;
      // BA/B.S. etc. map to bachelors credential
      if (!cred && isBachelorsCredentialText(token)) {
        cred =
          (credentialRows || []).find((r) => normalizeCredentialToken(r.credential_key) === 'bachelors') ||
          (credentialRows || []).find((r) => normalizeCredentialToken(r.label).includes('bachelor')) ||
          null;
      }
      if (cred?.id) resolvedCredentialIds.add(Number(cred.id));
    }

    // Fallback: if no tokens matched but bachelors detected in full text, use bachelors
    const bachelorsDetected = isBachelorsCredentialText(credentialText);
    if (resolvedCredentialIds.size === 0 && bachelorsDetected) {
      const bachelorsCred =
        (credentialRows || []).find((r) => normalizeCredentialToken(r.credential_key) === 'bachelors') ||
        (credentialRows || []).find((r) => normalizeCredentialToken(r.label).includes('bachelor')) ||
        null;
      if (bachelorsCred?.id) resolvedCredentialIds.add(Number(bachelorsCred.id));
    }

    // Union insurances from ALL matched credentials (BA + LPCC = full set)
    const acceptedKeys = new Set();
    for (const credId of resolvedCredentialIds) {
      const [eligRows] = await pool.execute(
        `SELECT insurance_type_id
         FROM credential_insurance_eligibility
         WHERE credential_id = ? AND is_allowed = TRUE`,
        [credId]
      );
      for (const row of eligRows || []) {
        const insurance = insuranceById.get(Number(row.insurance_type_id));
        if (insurance?.insurance_key) acceptedKeys.add(String(insurance.insurance_key).toLowerCase());
      }
    }

    // Defensive fallback for agencies that have not configured matrix rows for bachelors yet.
    if (acceptedKeys.size === 0 && bachelorsDetected) {
      if (insuranceByKey.has('medicaid')) acceptedKeys.add('medicaid');
      if (insuranceByKey.has('self_pay')) acceptedKeys.add('self_pay');
    }

    let acceptsTricareOverride = false;
    try {
      const [tricareRows] = await pool.execute(
        `SELECT uiv.value
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
         WHERE uiv.user_id = ?
           AND uifd.field_key = 'provider_accepts_tricare'
         ORDER BY uiv.updated_at DESC, uiv.id DESC
         LIMIT 1`,
        [uid]
      );
      acceptsTricareOverride = parseBooleanLike(tricareRows?.[0]?.value);
    } catch (e) {
      if (!missingSchemaError(e)) throw e;
      acceptsTricareOverride = false;
    }

    // Tricare is provider-specific: only include when this explicit override is true.
    if (acceptsTricareOverride && insuranceByKey.has('tricare')) acceptedKeys.add('tricare');
    else acceptedKeys.delete('tricare');

    const accepted = (insuranceRows || [])
      .filter((r) => acceptedKeys.has(String(r.insurance_key || '').toLowerCase()))
      .map((r) => ({
        insurance_key: String(r.insurance_key || ''),
        label: String(r.label || r.insurance_key || '')
      }));

    return { accepted, acceptsTricareOverride };
  } catch (e) {
    if (missingSchemaError(e)) return { accepted: [], acceptsTricareOverride: false };
    throw e;
  }
}

export const getProviderSchoolProfile = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerUserId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });
    const hasSupervisorCapability = await isSupervisorActor({ userId: req.user?.id, role: req.user?.role, user: req.user });

    // Provider privacy: providers may only view their own profile in this context.
    if (
      String(req.user?.role || '').toLowerCase() === 'provider' &&
      parseInt(req.user?.id || 0, 10) !== providerUserId &&
      !hasSupervisorCapability
    ) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const aff = await ensureProviderAffiliated(providerUserId, schoolId);
    if (!aff.ok) return res.status(404).json({ error: { message: 'Provider is not affiliated with this school' } });

    const u = await User.findById(providerUserId);
    if (!u) return res.status(404).json({ error: { message: 'Provider not found' } });

    // Optional: school-specific provider blurb (admin-editable)
    let schoolInfoBlurb = null;
    try {
      const [rows] = await pool.execute(
        `SELECT school_info_blurb
         FROM provider_school_profiles
         WHERE provider_user_id = ? AND school_organization_id = ?
         LIMIT 1`,
        [providerUserId, parseInt(schoolId, 10)]
      );
      schoolInfoBlurb = rows?.[0]?.school_info_blurb ?? null;
    } catch (e) {
      if (!missingSchemaError(e)) throw e;
      schoolInfoBlurb = null;
    }

    // Optional: provider credential (from profile fields, if present)
    let credential = null;
    try {
      const [rows] = await pool.execute(
        `SELECT uiv.value
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
         WHERE uiv.user_id = ?
           AND uifd.field_key = 'provider_credential'
         ORDER BY uiv.updated_at DESC, uiv.id DESC
         LIMIT 1`,
        [providerUserId]
      );
      credential = rows?.[0]?.value ?? null;
    } catch (e) {
      if (!missingSchemaError(e)) throw e;
      credential = null;
    }

    const activeAgencyId = await getActiveAgencyIdForSchool(schoolId);
    const insuranceInfo = await computeAcceptedInsurances({
      agencyId: activeAgencyId,
      providerUserId,
      credentialText: credential
    });

    // Optional: supervisors (best-effort; all assignments under the school's affiliated agency)
    let supervisors = [];
    try {
      if (activeAgencyId) {
        // Try to include is_primary (newer DBs), fall back if column missing.
        let rows = [];
        try {
          const [r] = await pool.execute(
            `SELECT
               sa.supervisor_id,
               sa.is_primary,
               u.first_name,
               u.last_name,
               u.email,
               u.profile_photo_path
             FROM supervisor_assignments sa
             JOIN users u ON u.id = sa.supervisor_id
             WHERE sa.supervisee_id = ? AND sa.agency_id = ?
             ORDER BY sa.is_primary DESC, sa.created_at DESC, sa.id DESC`,
            [providerUserId, parseInt(activeAgencyId, 10)]
          );
          rows = r || [];
        } catch (e) {
          const msg = String(e?.message || '');
          const missing = msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
          if (!missing) throw e;
          const [r] = await pool.execute(
            `SELECT
               sa.supervisor_id,
               u.first_name,
               u.last_name,
               u.email,
               u.profile_photo_path
             FROM supervisor_assignments sa
             JOIN users u ON u.id = sa.supervisor_id
             WHERE sa.supervisee_id = ? AND sa.agency_id = ?
             ORDER BY sa.created_at DESC, sa.id DESC`,
            [providerUserId, parseInt(activeAgencyId, 10)]
          );
          rows = r || [];
        }

        // Pull credentials in one query (best-effort; field may not exist)
        const ids = rows.map((x) => Number(x?.supervisor_id)).filter(Boolean);
        let credByUserId = new Map();
        if (ids.length) {
          try {
            const placeholders = ids.map(() => '?').join(',');
            const [crows] = await pool.execute(
              `SELECT uiv.user_id, uiv.value
               FROM user_info_values uiv
               JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
               WHERE uiv.user_id IN (${placeholders})
                 AND uifd.field_key = 'provider_credential'
               ORDER BY uiv.updated_at DESC, uiv.id DESC`,
              ids
            );
            credByUserId = new Map((crows || []).map((r) => [Number(r.user_id), r.value]));
          } catch (e) {
            if (!missingSchemaError(e)) throw e;
          }
        }

        supervisors = rows.map((s) => ({
          id: Number(s.supervisor_id),
          first_name: s.first_name || null,
          last_name: s.last_name || null,
          email: s.email || null,
          credential: credByUserId.has(Number(s.supervisor_id)) ? String(credByUserId.get(Number(s.supervisor_id)) || '') : null,
          profile_photo_url: publicUploadsUrlFromStoredPath(s.profile_photo_path || null),
          is_primary: s.is_primary === 1 || s.is_primary === true
        }));
      }
    } catch (e) {
      if (!missingSchemaError(e)) throw e;
      supervisors = [];
    }

    res.json({
      provider_user_id: u.id,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      email: u.email || null,
      title: u.title || null,
      credential: credential ? String(credential) : null,
      service_focus: u.service_focus || null,
      languages_spoken: u.languages_spoken || null,
      phone_number: u.phone_number || null,
      personal_phone: u.personal_phone || null,
      work_phone: u.work_phone || null,
      work_phone_extension: u.work_phone_extension || null,
      profile_photo_url: publicUploadsUrlFromStoredPath(u.profile_photo_path || null),
      school_info_blurb: schoolInfoBlurb,
      insurances_accepted: insuranceInfo.accepted,
      accepts_tricare_override: insuranceInfo.acceptsTricareOverride,
      supervisors,
      primary_supervisor_id: (supervisors.find((s) => s.is_primary)?.id) || (supervisors[0]?.id || null)
    });
  } catch (e) {
    next(e);
  }
};

export const upsertProviderSchoolProfile = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const role = String(req.user?.role || '').toLowerCase();
    const canEdit = role === 'super_admin' || role === 'admin' || role === 'staff' || role === 'support';
    if (!canEdit) return res.status(403).json({ error: { message: 'Access denied' } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });

    const aff = await ensureProviderAffiliated(providerUserId, schoolId);
    if (!aff.ok) return res.status(404).json({ error: { message: 'Provider is not affiliated with this school' } });

    const blurb = req.body?.school_info_blurb;
    const schoolInfoBlurb = blurb === null || blurb === undefined ? null : String(blurb).trim();

    await pool.execute(
      `INSERT INTO provider_school_profiles (provider_user_id, school_organization_id, school_info_blurb)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         school_info_blurb = VALUES(school_info_blurb),
         updated_at = CURRENT_TIMESTAMP`,
      [providerUserId, parseInt(schoolId, 10), schoolInfoBlurb || null]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getProviderSchoolCaseloadSlots = async (req, res, next) => {
  try {
    const { schoolId, providerId } = req.params;
    const access = await ensureSchoolAccess(req, schoolId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const providerUserId = parseInt(providerId, 10);
    if (!providerUserId) return res.status(400).json({ error: { message: 'Invalid providerId' } });
    const providerAllowed = await ensureSupervisorCanAccessProvider({ req, access, providerUserId });
    if (!providerAllowed) return res.status(403).json({ error: { message: 'Access denied' } });
    const hasSupervisorCapability = await isSupervisorActor({ userId: req.user?.id, role: req.user?.role, user: req.user });

    // Provider privacy: providers may only view their own caseload in this context.
    if (
      String(req.user?.role || '').toLowerCase() === 'provider' &&
      parseInt(req.user?.id || 0, 10) !== providerUserId &&
      !hasSupervisorCapability
    ) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const aff = await ensureProviderAffiliated(providerUserId, schoolId);
    if (!aff.ok) return res.status(404).json({ error: { message: 'Provider is not affiliated with this school' } });

    const [assignments] = await pool.execute(
      `SELECT day_of_week, slots_total, slots_available, start_time, end_time, is_active
       FROM provider_school_assignments
       WHERE school_organization_id = ? AND provider_user_id = ?
       ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday') ASC`,
      [parseInt(schoolId, 10), providerUserId]
    );

    const activeDays = (assignments || [])
      .filter((a) => a && a.is_active)
      .map((a) => String(a.day_of_week))
      .filter((d) => normalizeDay(d));

    const clientsByDay = new Map();
    for (const d of allowedDays) clientsByDay.set(d, []);

    // Provider caseload for availability/status:
    // - Prefer `client_provider_assignments` when present
    // - ALSO include legacy `clients.provider_id/service_day` assignments (bulk upload paths),
    //   without double-counting clients that already have a matching cpa row.
    let clientRows = [];
    if (activeDays.length > 0) {
      const placeholders = activeDays.map(() => '?').join(',');
      const orgId = parseInt(schoolId, 10);

      let cpaRows = [];
      let hasCpa = true;
      try {
        const [rows] = await pool.execute(
          `SELECT c.id, c.initials, c.identifier_code, c.status, c.document_status, cpa.service_day
           FROM client_provider_assignments cpa
           JOIN clients c ON c.id = cpa.client_id
           WHERE cpa.organization_id = ?
             AND cpa.provider_user_id = ?
             AND cpa.is_active = TRUE
             AND cpa.service_day IN (${placeholders})
           ORDER BY cpa.service_day ASC, c.initials ASC`,
          [orgId, providerUserId, ...activeDays]
        );
        cpaRows = rows || [];
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (!missing) throw e;
        hasCpa = false;
        cpaRows = [];
      }

      let legacyRows = [];
      if (hasCpa) {
        const [rows] = await pool.execute(
          `SELECT c.id, c.initials, c.identifier_code, c.status, c.document_status, c.service_day
           FROM clients c
           LEFT JOIN client_provider_assignments cpa
             ON cpa.organization_id = c.organization_id
            AND cpa.client_id = c.id
            AND cpa.provider_user_id = c.provider_id
            AND cpa.service_day = c.service_day
            AND cpa.is_active = TRUE
           WHERE c.organization_id = ?
             AND c.provider_id = ?
             AND c.service_day IN (${placeholders})
             AND cpa.client_id IS NULL
           ORDER BY c.service_day ASC, c.initials ASC`,
          [orgId, providerUserId, ...activeDays]
        );
        legacyRows = rows || [];
      } else {
        const [rows] = await pool.execute(
          `SELECT id, initials, identifier_code, status, document_status, service_day
           FROM clients
           WHERE organization_id = ?
             AND provider_id = ?
             AND service_day IN (${placeholders})
           ORDER BY service_day ASC, initials ASC`,
          [orgId, providerUserId, ...activeDays]
        );
        legacyRows = rows || [];
      }

      clientRows = [...cpaRows, ...legacyRows];

      const userId = req.user?.id;
      const unreadCounts = new Map();
      try {
        const ids = (clientRows || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
        if (ids.length > 0 && userId) {
          const p2 = ids.map(() => '?').join(',');
          const [unreadRows] = await pool.execute(
            `SELECT n.client_id, COUNT(*) AS unread_count
             FROM client_notes n
             LEFT JOIN client_note_reads r
               ON r.client_id = n.client_id AND r.user_id = ?
             WHERE n.client_id IN (${p2})
               AND n.is_internal_only = FALSE
               AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
             GROUP BY n.client_id`,
            [userId, ...ids]
          );
          for (const r of unreadRows || []) unreadCounts.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      } catch {
        // ignore
      }

      for (const c of clientRows || []) {
        const d = String(c.service_day || c.service_day || '');
        const list = clientsByDay.get(d) || [];
        list.push({ ...c, unread_notes_count: unreadCounts.get(Number(c.id)) || 0 });
        clientsByDay.set(d, list);
      }
    }

    // Used count per day for display (assigned/total)
    const usedByDay = new Map();
    for (const d of allowedDays) usedByDay.set(d, (clientsByDay.get(d) || []).length);

    const out = (assignments || []).map((a) => ({
      day_of_week: a.day_of_week,
      slots_total: a.slots_total,
      slots_available: a.slots_available,
      slots_used: usedByDay.get(String(a.day_of_week)) || 0,
      start_time: a.start_time,
      end_time: a.end_time,
      is_active: !!a.is_active,
      clients: clientsByDay.get(String(a.day_of_week)) || []
    }));

    res.json({
      school_organization_id: parseInt(schoolId, 10),
      provider_user_id: providerUserId,
      assignments: out
    });
  } catch (e) {
    next(e);
  }
};

