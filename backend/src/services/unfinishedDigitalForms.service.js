/**
 * Agency-scoped Unfinished Digital Forms report (school + office enrollment packets).
 * Never returns session_token or deletion_token_hash.
 */
import pool from '../config/database.js';
import { listAffiliatedSchools, safeInt } from './schoolCoverageMetrics.service.js';
import { decryptIntakeSubmissionRows, INTAKE_PAYLOAD_ENCRYPTED_COLUMNS_SQL } from './intakeResponsesEncryption.service.js';
import { NON_CLIENT_INTAKE_FORM_TYPES } from '../utils/officeIntakeLink.js';

const EXCLUDED_FORM_TYPES = [...NON_CLIENT_INTAKE_FORM_TYPES];

function isMissingSchemaError(e) {
  const code = e?.code || '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const msg = String(e?.message || '');
  return msg.includes("doesn't exist") || msg.includes('Unknown column');
}

export function normalizeReportScope(scope) {
  const s = String(scope || 'all').trim().toLowerCase();
  if (s === 'school' || s === 'office') return s;
  return 'all';
}

export function resolveRowScope(row) {
  const st = String(row?.scope_type || row?.scopeType || '').toLowerCase();
  if (st === 'school' || st === 'program') return 'school';
  if (Number(row?.inherits_school_master || row?.inheritsSchoolMaster || 0) === 1) return 'school';
  if (Number(row?.is_school_master || row?.isSchoolMaster || 0) === 1) return 'school';
  if (st === 'agency' || Number(row?.inherits_office_master || row?.inheritsOfficeMaster || 0) === 1) {
    return 'office';
  }
  return st === 'school' ? 'school' : 'office';
}

export function resolveCurrentStage(row) {
  const consent = String(row?.reminder_consent_status || row?.reminderConsentStatus || '').toLowerCase();
  if (!consent) return 'awaiting_consent';
  if (consent === 'declined') return 'declined_no_reminders';
  if (row?.reminder_7d_sent_at || row?.reminder3SentAt) return 'reminder_3_sent';
  if (row?.reminder_72h_sent_at || row?.reminder2SentAt) return 'reminder_2_sent';
  if (row?.reminder_24h_sent_at || row?.reminder1SentAt) return 'reminder_1_sent';
  return 'in_reminder_sequence';
}

export function isEnrollmentPacketFormType(formType) {
  const ft = String(formType || 'intake').trim().toLowerCase();
  if (!ft || ft === 'intake' || ft === 'public_form') return true;
  return !EXCLUDED_FORM_TYPES.includes(ft);
}

function excludedFormTypeSql(alias = 'il') {
  if (!EXCLUDED_FORM_TYPES.length) return '1=1';
  const list = EXCLUDED_FORM_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
  return `LOWER(COALESCE(${alias}.form_type, 'intake')) NOT IN (${list})`;
}

function agencyMatchSql() {
  return `(
    CASE
      WHEN il.scope_type = 'agency' THEN il.organization_id
      ELSE (
        SELECT af.agency_id FROM agency_schools af
        WHERE af.school_organization_id = il.organization_id AND af.is_active = 1
        ORDER BY af.id ASC LIMIT 1
      )
    END
  ) = ?`;
}

function scopeFilterSql(scope) {
  if (scope === 'school') {
    return `(
      LOWER(COALESCE(il.scope_type, '')) IN ('school', 'program')
      OR COALESCE(il.inherits_school_master, 0) = 1
      OR COALESCE(il.is_school_master, 0) = 1
      OR s.school_organization_id IS NOT NULL
    )`;
  }
  if (scope === 'office') {
    return `(
      LOWER(COALESCE(il.scope_type, '')) = 'agency'
      AND COALESCE(il.inherits_school_master, 0) = 0
      AND COALESCE(il.is_school_master, 0) = 0
    )`;
  }
  return `(
    (
      LOWER(COALESCE(il.scope_type, '')) IN ('school', 'program')
      OR COALESCE(il.inherits_school_master, 0) = 1
      OR COALESCE(il.is_school_master, 0) = 1
    )
    OR (
      LOWER(COALESCE(il.scope_type, '')) = 'agency'
      AND COALESCE(il.inherits_school_master, 0) = 0
    )
  )`;
}

function unfinishedWhereSql(scope) {
  return `
    LOWER(COALESCE(s.status, '')) IN ('started', 'consented')
    AND LOWER(COALESCE(s.status, '')) <> 'submitted'
    AND s.reminder_opt_out_at IS NULL
    AND (s.draft_expires_at IS NULL OR s.draft_expires_at > NOW())
    AND ${excludedFormTypeSql('il')}
    AND ${scopeFilterSql(scope)}
    AND ${agencyMatchSql()}
  `;
}

function isoOrNull(v) {
  if (!v) return null;
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function displayNameFromRow(row) {
  const first = String(row.reminder_first_name || '').trim();
  const signer = String(row.signer_name || '').trim();
  return first || signer || null;
}

function buildTimeline(row) {
  const events = [];
  const startedAt = isoOrNull(row.created_at || row.started_at);
  if (startedAt) {
    events.push({
      id: 'started',
      label: 'Form started',
      at: startedAt,
      status: 'info'
    });
  }
  const consentAt = isoOrNull(row.reminder_consent_at);
  const consent = String(row.reminder_consent_status || '').toLowerCase();
  if (consentAt && consent) {
    events.push({
      id: 'consent',
      label: consent === 'agreed' ? 'Reminders agreed' : 'Reminders declined',
      at: consentAt,
      status: consent === 'agreed' ? 'ok' : 'warn'
    });
  }
  const slots = [
    { key: '24h', at: row.reminder_24h_sent_at, status: row.reminder1_event_status, label: 'Reminder 1 (24h)' },
    { key: '72h', at: row.reminder_72h_sent_at, status: row.reminder2_event_status, label: 'Reminder 2 (72h)' },
    { key: '7d', at: row.reminder_7d_sent_at, status: row.reminder3_event_status, label: 'Reminder 3 (7d)' }
  ];
  for (const slot of slots) {
    const at = isoOrNull(slot.at);
    if (!at && !slot.status) continue;
    events.push({
      id: `reminder_${slot.key}`,
      label: slot.label,
      at: at || null,
      status: String(slot.status || (at ? 'sent' : 'pending')).toLowerCase()
    });
  }
  const expiresAt = isoOrNull(row.draft_expires_at);
  if (expiresAt) {
    events.push({
      id: 'expires',
      label: 'Draft expires',
      at: expiresAt,
      status: 'info'
    });
  }
  return events;
}

export function mapUnfinishedRow(raw) {
  const scope = resolveRowScope(raw);
  const reminder1SentAt = isoOrNull(raw.reminder_24h_sent_at);
  const reminder2SentAt = isoOrNull(raw.reminder_72h_sent_at);
  const reminder3SentAt = isoOrNull(raw.reminder_7d_sent_at);
  const reminder1Status = raw.reminder1_event_status
    ? String(raw.reminder1_event_status)
    : (reminder1SentAt ? 'sent' : null);
  const reminder2Status = raw.reminder2_event_status
    ? String(raw.reminder2_event_status)
    : (reminder2SentAt ? 'sent' : null);
  const reminder3Status = raw.reminder3_event_status
    ? String(raw.reminder3_event_status)
    : (reminder3SentAt ? 'sent' : null);

  const flat = {
    id: Number(raw.id) || null,
    displayName: displayNameFromRow(raw),
    email: raw.signer_email ? String(raw.signer_email).trim().toLowerCase() : null,
    schoolName: raw.school_name ? String(raw.school_name) : null,
    schoolOrganizationId: safeInt(raw.school_organization_id) || null,
    scope,
    formType: String(raw.form_type || 'intake').toLowerCase() || 'intake',
    linkTitle: raw.link_title ? String(raw.link_title) : null,
    startedAt: isoOrNull(raw.created_at),
    draftExpiresAt: isoOrNull(raw.draft_expires_at),
    reminderConsentStatus: raw.reminder_consent_status
      ? String(raw.reminder_consent_status).toLowerCase()
      : null,
    reminderConsentAt: isoOrNull(raw.reminder_consent_at),
    reminder1SentAt,
    reminder1Status,
    reminder2SentAt,
    reminder2Status,
    reminder3SentAt,
    reminder3Status,
    currentStage: resolveCurrentStage({
      ...raw,
      reminder1SentAt,
      reminder2SentAt,
      reminder3SentAt
    })
  };

  return {
    ...flat,
    timeline: buildTimeline(raw)
  };
}

async function countDeletedLast30Days(agencyId, { scope, schoolOrganizationId }) {
  try {
    const params = [agencyId];
    let sql = `
      SELECT COUNT(*) AS cnt
      FROM unfinished_form_deletion_audits
      WHERE agency_id = ?
        AND deleted_at >= (NOW() - INTERVAL 30 DAY)
    `;
    if (scope === 'school') {
      sql += ` AND scope_type = 'school'`;
      if (schoolOrganizationId) {
        sql += ` AND school_organization_id = ?`;
        params.push(schoolOrganizationId);
      }
    } else if (scope === 'office') {
      sql += ` AND scope_type = 'office'`;
    }
    const [rows] = await pool.execute(sql, params);
    return Number(rows?.[0]?.cnt || 0);
  } catch (e) {
    if (isMissingSchemaError(e)) return 0;
    throw e;
  }
}

async function countCompletedLast30Days(agencyId, { scope, schoolOrganizationId }) {
  try {
    const params = [agencyId];
    let sql = `
      SELECT COUNT(*) AS cnt
      FROM intake_submissions s
      INNER JOIN intake_links il ON il.id = s.intake_link_id
      WHERE LOWER(COALESCE(s.status, '')) = 'submitted'
        AND s.submitted_at IS NOT NULL
        AND s.submitted_at >= (NOW() - INTERVAL 30 DAY)
        AND ${excludedFormTypeSql('il')}
        AND ${scopeFilterSql(scope)}
        AND ${agencyMatchSql()}
    `;
    if (schoolOrganizationId && scope !== 'office') {
      sql += ` AND COALESCE(
        s.school_organization_id,
        CASE WHEN il.scope_type IN ('school','program') THEN il.organization_id ELSE NULL END
      ) = ?`;
      params.push(schoolOrganizationId);
    }
    const [rows] = await pool.execute(sql, params);
    return Number(rows?.[0]?.cnt || 0);
  } catch (e) {
    if (isMissingSchemaError(e)) return 0;
    throw e;
  }
}

async function loadUnfinishedRows(agencyId, { scope, schoolOrganizationId }) {
  const params = [agencyId];
  let sql = `
    SELECT
      s.id,
      s.status,
      s.created_at,
      s.draft_expires_at,
      s.reminder_consent_status,
      s.reminder_consent_at,
      s.reminder_first_name,
      s.signer_name,
      s.signer_email,
      s.reminder_24h_sent_at,
      s.reminder_72h_sent_at,
      s.reminder_7d_sent_at,
      s.school_organization_id,
      s.reminder_opt_out_at,
      ${INTAKE_PAYLOAD_ENCRYPTED_COLUMNS_SQL},
      il.scope_type,
      il.form_type,
      il.title AS link_title,
      il.inherits_office_master,
      il.inherits_school_master,
      il.is_school_master,
      school.name AS school_name,
      (
        SELECT e.status FROM unfinished_form_reminder_events e
        WHERE e.intake_submission_id = s.id AND e.reminder_slot = '24h'
        ORDER BY e.sent_at DESC, e.id DESC LIMIT 1
      ) AS reminder1_event_status,
      (
        SELECT e.status FROM unfinished_form_reminder_events e
        WHERE e.intake_submission_id = s.id AND e.reminder_slot = '72h'
        ORDER BY e.sent_at DESC, e.id DESC LIMIT 1
      ) AS reminder2_event_status,
      (
        SELECT e.status FROM unfinished_form_reminder_events e
        WHERE e.intake_submission_id = s.id AND e.reminder_slot = '7d'
        ORDER BY e.sent_at DESC, e.id DESC LIMIT 1
      ) AS reminder3_event_status
    FROM intake_submissions s
    INNER JOIN intake_links il ON il.id = s.intake_link_id
    LEFT JOIN agencies school ON school.id = COALESCE(
      s.school_organization_id,
      CASE WHEN il.scope_type IN ('school','program') THEN il.organization_id ELSE NULL END
    )
    WHERE ${unfinishedWhereSql(scope)}
  `;

  if (schoolOrganizationId && scope !== 'office') {
    sql += ` AND COALESCE(
      s.school_organization_id,
      CASE WHEN il.scope_type IN ('school','program') THEN il.organization_id ELSE NULL END
    ) = ?`;
    params.push(schoolOrganizationId);
  }

  sql += ` ORDER BY s.created_at DESC, s.id DESC LIMIT 2000`;

  try {
    const [rows] = await pool.execute(sql, params);
    return decryptIntakeSubmissionRows(rows || []);
  } catch (e) {
    if (isMissingSchemaError(e)) {
      // Older schema without reminder columns — return empty rather than 500.
      return [];
    }
    throw e;
  }
}

/**
 * @param {number} agencyId
 * @param {{ scope?: string, schoolOrganizationId?: number|null }} [opts]
 */
export async function getUnfinishedDigitalFormsSnapshot(agencyId, opts = {}) {
  const id = safeInt(agencyId);
  if (!id) {
    return {
      agencyId: null,
      scope: 'all',
      refreshedAt: new Date().toISOString(),
      totals: {
        unfinished: 0,
        inReminderSequence: 0,
        completedLast30Days: 0,
        deletedExpiredLast30Days: 0
      },
      schools: [],
      rows: []
    };
  }

  const scope = normalizeReportScope(opts.scope);
  const schoolOrganizationId = safeInt(opts.schoolOrganizationId);

  const [rawRows, schools, deletedExpiredLast30Days, completedLast30Days] = await Promise.all([
    loadUnfinishedRows(id, { scope, schoolOrganizationId }),
    listAffiliatedSchools(id, { orgType: 'school' }).catch(() => []),
    countDeletedLast30Days(id, { scope, schoolOrganizationId }),
    countCompletedLast30Days(id, { scope, schoolOrganizationId })
  ]);

  const rows = (rawRows || [])
    .filter((r) => isEnrollmentPacketFormType(r.form_type))
    .map(mapUnfinishedRow)
    // Defense in depth: never leak tokens
    .map((row) => {
      const { session_token, deletion_token_hash, ...safe } = row;
      void session_token;
      void deletion_token_hash;
      return safe;
    });

  const inReminderSequence = rows.filter((r) => {
    const consent = String(r.reminderConsentStatus || '').toLowerCase();
    return consent === 'agreed' && r.currentStage !== 'reminder_3_sent';
  }).length;

  return {
    agencyId: id,
    scope,
    schoolOrganizationId: schoolOrganizationId || null,
    refreshedAt: new Date().toISOString(),
    totals: {
      unfinished: rows.length,
      inReminderSequence,
      completedLast30Days,
      deletedExpiredLast30Days: deletedExpiredLast30Days
    },
    schools: (schools || []).map((s) => ({
      id: safeInt(s.id),
      name: s.name || null
    })).filter((s) => s.id),
    rows
  };
}

export default {
  getUnfinishedDigitalFormsSnapshot,
  resolveCurrentStage,
  resolveRowScope,
  normalizeReportScope,
  mapUnfinishedRow,
  isEnrollmentPacketFormType
};
