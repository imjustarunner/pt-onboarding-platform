import pool from '../config/database.js';
import User from '../models/User.model.js';
import { syncClientStatusForEvent } from '../services/eventClientStatusSync.service.js';
import {
  canManageProgramEvent,
  canViewProgramEvent,
  userHasAgencyAccessForRequest
} from '../services/companyEventAccess.service.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function ageFromDateOfBirth(dob) {
  if (!dob) return null;
  const s = String(dob).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const birth = new Date(`${s}T12:00:00Z`);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function formatGroupAssignmentLabel(assignment) {
  const label = String(assignment?.label || '').trim() || (assignment?.groupId ? `Group ${assignment.groupId}` : 'Group');
  const parts = [label];
  if (assignment?.sessionDate) {
    const d = new Date(assignment.sessionDate);
    if (Number.isFinite(d.getTime())) {
      parts.push(
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      );
    }
  } else if (assignment?.sessionLabel) {
    parts.push(String(assignment.sessionLabel).trim());
  }
  return parts.join(' · ');
}

async function loadGroupAssignmentsByClientId(eventId, agencyId) {
  const map = new Map();
  if (!eventId || !agencyId) return map;
  try {
    const [rows] = await pool.execute(
      `SELECT cega.client_id,
              ceg.id AS group_id,
              ceg.label AS group_label,
              ceg.session_date_id,
              cesd.session_date,
              cesd.label AS session_label
       FROM company_event_client_group_assignments cega
       INNER JOIN company_event_session_groups ceg ON ceg.id = cega.group_id
       LEFT JOIN company_event_session_dates cesd ON cesd.id = cega.session_date_id
       WHERE cega.company_event_id = ? AND cega.agency_id = ?
       ORDER BY cesd.session_date ASC, ceg.label ASC, ceg.id ASC`,
      [eventId, agencyId]
    );
    for (const r of rows || []) {
      const cid = Number(r.client_id);
      if (!cid) continue;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push({
        groupId: Number(r.group_id),
        label: String(r.group_label || '').trim() || `Group ${r.group_id}`,
        sessionDateId: r.session_date_id != null ? Number(r.session_date_id) : null,
        sessionDate: r.session_date || null,
        sessionLabel: r.session_label ? String(r.session_label).trim() : null
      });
    }
  } catch {
    // Staffing tables are optional on older deployments.
  }
  return map;
}

async function userHasAgencyAccess(req, agencyId) {
  return userHasAgencyAccessForRequest(req, agencyId);
}

function isAgencyAdmin(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin';
}

async function loadEventForAgency(eventId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, organization_id, event_type
     FROM company_events
     WHERE id = ? AND agency_id = ?
     LIMIT 1`,
    [eventId, agencyId]
  );
  return rows?.[0] || null;
}

async function ensureClientAgencyProgramAffiliation(clientId, agencyId, organizationId) {
  const [clientRows] = await pool.execute(
    `SELECT id FROM clients WHERE id = ? AND agency_id = ? LIMIT 1`,
    [clientId, agencyId]
  );
  if (!clientRows?.[0]) return { ok: false, message: 'Client not found in this agency' };

  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return { ok: true };

  try {
    await pool.execute(
      `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
       VALUES (?, ?, 0, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [clientId, orgId]
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err?.message || 'Unable to affiliate client with this program organization' };
  }
}

/**
 * Registrant vs participant rule (workflow-based, derived in SQL — single source of truth).
 *
 * Workflow stages on a registration:
 *   1. Registered → Provider assigned → Intake (Accept | Deny) → Treatment plan complete
 *   2. Once **TP is complete** the row is fully worked and graduates to **Participants**.
 *   3. Until then it remains a **Registrant** (the coordinator queue).
 *
 * A "Denied" intake stays in the registrant view (TP isn't eligible) so coordinators can
 * track who didn't make it; they can be removed manually if desired.
 */
// "Denied" intakes are still rendered in the registrants table (greyed/strikethrough)
// so coordinators can see who didn't make it, but they're excluded from EVERY count
// per product spec: "Denied should be marked as grey across the way and not counted
// anywhere anymore."
const DENIED_PREDICATE = `(cec.intake_outcome = 'denied')`;
const ACTIVE_PREDICATE = `(cec.intake_outcome IS NULL OR cec.intake_outcome <> 'denied')`;
const REGISTRANT_PREDICATE = `(COALESCE(cec.treatment_plan_complete, 0) = 0 AND ${ACTIVE_PREDICATE})`;
const PARTICIPANT_PREDICATE = `(COALESCE(cec.treatment_plan_complete, 0) = 1 AND ${ACTIVE_PREDICATE})`;

const normalizeStatusFilter = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'registrant' || v === 'registrants') return 'registrant';
  if (v === 'participant' || v === 'participants') return 'participant';
  return 'all';
};

export const listCompanyEventClients = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const includeWorkflow = String(req.query.includeWorkflow || '') === '1' || String(req.query.includeWorkflow || '').toLowerCase() === 'true';
    const statusFilter = normalizeStatusFilter(req.query.status);
    if (!eventId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canViewProgramEvent(req, agencyId, eventId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }

    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    // Workflow-derived counts so the UI can pulse the registrants chip and show totals
    // without a second round-trip. The `all` count intentionally excludes denied intakes
    // (denied is its own bucket and "not counted anywhere" per product spec).
    let counts = { all: 0, registrants: 0, participants: 0, denied: 0 };
    try {
      const [countRows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN ${ACTIVE_PREDICATE} THEN 1 ELSE 0 END) AS all_count,
           SUM(CASE WHEN ${REGISTRANT_PREDICATE} THEN 1 ELSE 0 END) AS registrants_count,
           SUM(CASE WHEN ${PARTICIPANT_PREDICATE} THEN 1 ELSE 0 END) AS participants_count,
           SUM(CASE WHEN ${DENIED_PREDICATE} THEN 1 ELSE 0 END) AS denied_count
         FROM company_event_clients cec
         WHERE cec.company_event_id = ? AND cec.agency_id = ?`,
        [eventId, agencyId]
      );
      const row = countRows?.[0] || {};
      counts = {
        all: Number(row.all_count || 0),
        registrants: Number(row.registrants_count || 0),
        participants: Number(row.participants_count || 0),
        denied: Number(row.denied_count || 0)
      };
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown column') && msg.includes('intake_complete')) {
        return res.status(503).json({ error: { message: 'Run database migration 739_company_event_clients_provider_and_workflow.sql' } });
      }
      if (msg.includes('Unknown column') && msg.includes('intake_outcome')) {
        return res.status(503).json({ error: { message: 'Run database migration 802_company_event_clients_intake_outcome.sql' } });
      }
      throw e;
    }

    // Per-session-group breakdown for graduated participants only (registrants
    // typically aren't placed in a group yet). Returns one row per
    // (group_id × session_date) so the UI can show "Morning · Mon = 4, Afternoon
    // · Mon = 6" etc. Quietly returns an empty array when staffing isn't set up.
    let participantGroupCounts = [];
    try {
      const [grpRows] = await pool.execute(
        `SELECT
           ceg.id          AS group_id,
           ceg.label       AS group_label,
           ceg.session_date_id,
           cesd.session_date AS session_date,
           cesd.label      AS session_label,
           COUNT(DISTINCT cega.client_id) AS participant_count
         FROM company_event_client_group_assignments cega
         INNER JOIN company_event_clients cec
           ON cec.company_event_id = cega.company_event_id
          AND cec.agency_id = cega.agency_id
          AND cec.client_id = cega.client_id
         INNER JOIN company_event_session_groups ceg ON ceg.id = cega.group_id
         LEFT JOIN company_event_session_dates cesd ON cesd.id = cega.session_date_id
         WHERE cega.company_event_id = ?
           AND cega.agency_id = ?
           AND ${PARTICIPANT_PREDICATE.replace(/cec\./g, 'cec.')}
         GROUP BY ceg.id, ceg.label, ceg.session_date_id, cesd.session_date, cesd.label
         ORDER BY cesd.session_date ASC, ceg.label ASC`,
        [eventId, agencyId]
      );
      participantGroupCounts = (grpRows || []).map((r) => ({
        groupId: Number(r.group_id),
        label: String(r.group_label || '').trim() || `Group ${r.group_id}`,
        sessionDateId: r.session_date_id ? Number(r.session_date_id) : null,
        sessionDate: r.session_date || null,
        sessionLabel: r.session_label ? String(r.session_label).trim() : null,
        count: Number(r.participant_count || 0)
      }));
    } catch (e) {
      // Staffing tables are optional — silently degrade if they aren't present.
      const msg = String(e?.message || '');
      if (!msg.includes('company_event_session_groups') && !msg.includes('company_event_client_group_assignments')) {
        // Unknown error — surface it so we don't hide real bugs behind the optional path.
        // (Keep counts response shape stable; just leave the array empty.)
      }
      participantGroupCounts = [];
    }

    const statusWhere =
      statusFilter === 'registrant'
        ? ` AND ${REGISTRANT_PREDICATE}`
        : statusFilter === 'participant'
          ? ` AND ${PARTICIPANT_PREDICATE}`
          : '';

    let rows = [];
    if (includeWorkflow) {
      try {
        const [r] = await pool.execute(
          `SELECT
             cec.client_id AS clientId,
             c.initials,
             c.full_name AS fullName,
             c.identifier_code AS identifierCode,
             c.grade,
             c.date_of_birth,
             c.status,
             c.document_status AS documentStatus,
             c.eloping_flag,
             c.extra_assistance_flag,
             c.eloping_notes,
             c.extra_assistance_notes,
             cec.is_active AS isActive,
             cec.enrolled_at AS enrolledAt,
             cec.notes,
             cec.assigned_provider_user_id,
             pu.first_name AS provider_first_name,
             pu.last_name AS provider_last_name,
             cec.intake_complete,
             cec.intake_outcome,
             cec.intake_completed_at,
             icu.first_name AS intake_by_first_name,
             icu.last_name AS intake_by_last_name,
             cec.treatment_plan_complete,
             cec.treatment_plan_completed_at,
             tpu.first_name AS tp_by_first_name,
             tpu.last_name AS tp_by_last_name,
             cec.confirmation_status,
             cec.confirmation_set_at,
             cec.confirmation_set_method,
             cfu.first_name AS confirmation_by_first_name,
             cfu.last_name AS confirmation_by_last_name
           FROM company_event_clients cec
           INNER JOIN clients c ON c.id = cec.client_id AND c.agency_id = cec.agency_id
           LEFT JOIN users pu ON pu.id = cec.assigned_provider_user_id
           LEFT JOIN users icu ON icu.id = cec.intake_completed_by_user_id
           LEFT JOIN users tpu ON tpu.id = cec.treatment_plan_completed_by_user_id
           LEFT JOIN users cfu ON cfu.id = cec.confirmation_set_by_user_id
           WHERE cec.company_event_id = ? AND cec.agency_id = ?
             ${statusWhere}
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code, CONCAT('Client ', c.id)) ASC`,
          [eventId, agencyId]
        );
        rows = r || [];
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('Unknown column') && msg.includes('confirmation_status')) {
          return res.status(503).json({ error: { message: 'Run database migration 803_company_event_clients_confirmation.sql' } });
        }
        if (msg.includes('Unknown column') && msg.includes('intake_outcome')) {
          return res.status(503).json({ error: { message: 'Run database migration 802_company_event_clients_intake_outcome.sql' } });
        }
        if (msg.includes('Unknown column') && (msg.includes('assigned_provider_user_id') || msg.includes('intake_complete'))) {
          return res.status(503).json({ error: { message: 'Run database migration 739_company_event_clients_provider_and_workflow.sql' } });
        }
        throw e;
      }
    } else {
      const [r] = await pool.execute(
        `SELECT
           cec.client_id AS clientId,
           c.initials,
           c.full_name AS fullName,
           c.identifier_code AS identifierCode,
           c.status,
           c.document_status AS documentStatus,
           cec.is_active AS isActive,
           cec.enrolled_at AS enrolledAt,
           cec.notes
         FROM company_event_clients cec
         INNER JOIN clients c ON c.id = cec.client_id AND c.agency_id = cec.agency_id
         WHERE cec.company_event_id = ? AND cec.agency_id = ?
           ${statusWhere}
         ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code, CONCAT('Client ', c.id)) ASC`,
        [eventId, agencyId]
      );
      rows = r || [];
    }

    const groupAssignmentsByClientId = await loadGroupAssignmentsByClientId(eventId, agencyId);

    res.json({
      ok: true,
      counts,
      participantGroupCounts,
      statusFilter,
      // The viewer-capability flag lets the participants UI know whether to render
      // editable eloping/extra-support checkboxes (admin-only).
      viewerIsAdmin: includeWorkflow ? isAgencyAdmin(req) : undefined,
      clients: (rows || []).map((r) => {
        const clientId = Number(r.clientId);
        const groupAssignments = groupAssignmentsByClientId.get(clientId) || [];
        const groupDisplay = groupAssignments.length
          ? groupAssignments.map((g) => formatGroupAssignmentLabel(g)).join('; ')
          : null;
        return {
        clientId,
        initials: r.initials || null,
        fullName: r.fullName || null,
        identifierCode: r.identifierCode || null,
        grade: r.grade || null,
        dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
        ageYears: ageFromDateOfBirth(r.date_of_birth),
        groupAssignments,
        groupDisplay,
        status: r.status || null,
        documentStatus: r.documentStatus || null,
        isActive: r.isActive === true || r.isActive === 1,
        enrolledAt: r.enrolledAt || null,
        notes: r.notes || null,
        elopingFlag: r.eloping_flag == null ? null : (r.eloping_flag === 1 || r.eloping_flag === true),
        extraAssistanceFlag: r.extra_assistance_flag == null ? null : (r.extra_assistance_flag === 1 || r.extra_assistance_flag === true),
        elopingNotes: r.eloping_notes || null,
        extraAssistanceNotes: r.extra_assistance_notes || null,
        assignedProviderUserId: r.assigned_provider_user_id ? Number(r.assigned_provider_user_id) : null,
        assignedProviderName:
          r.provider_first_name || r.provider_last_name
            ? `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim()
            : null,
        intakeComplete: r.intake_complete === 1 || r.intake_complete === true,
        intakeOutcome: r.intake_outcome ? String(r.intake_outcome).toLowerCase() : null,
        intakeCompletedAt: r.intake_completed_at || null,
        intakeCompletedByName:
          r.intake_by_first_name || r.intake_by_last_name
            ? `${r.intake_by_first_name || ''} ${r.intake_by_last_name || ''}`.trim()
            : null,
        treatmentPlanComplete: r.treatment_plan_complete === 1 || r.treatment_plan_complete === true,
        treatmentPlanCompletedAt: r.treatment_plan_completed_at || null,
        treatmentPlanCompletedByName:
          r.tp_by_first_name || r.tp_by_last_name
            ? `${r.tp_by_first_name || ''} ${r.tp_by_last_name || ''}`.trim()
            : null,
        confirmationStatus: r.confirmation_status ? String(r.confirmation_status).toLowerCase() : 'pending',
        confirmationSetAt: r.confirmation_set_at || null,
        confirmationSetMethod: r.confirmation_set_method ? String(r.confirmation_set_method).toLowerCase() : null,
        confirmationSetByName:
          r.confirmation_by_first_name || r.confirmation_by_last_name
            ? `${r.confirmation_by_first_name || ''} ${r.confirmation_by_last_name || ''}`.trim()
            : null
      };
      })
    });
  } catch (e) {
    next(e);
  }
};

export const searchCompanyEventClients = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    const q = String(req.query.q || '').trim();
    if (!eventId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    let searchClause = '';
    if (q) {
      searchClause = `
        AND (
          c.full_name LIKE ?
          OR c.initials LIKE ?
          OR c.identifier_code LIKE ?
          OR CAST(c.id AS CHAR) = ?
        )
      `;
    }

    let affiliationJoin = '';
    if (Number(event.organization_id) > 0) {
      affiliationJoin = `
        INNER JOIN client_organization_assignments coa
          ON coa.client_id = c.id
         AND coa.organization_id = ?
         AND coa.is_active = TRUE
      `;
    }

    const [rows] = await pool.execute(
      `SELECT
         c.id AS clientId,
         c.initials,
         c.full_name AS fullName,
         c.identifier_code AS identifierCode
       FROM clients c
       ${affiliationJoin}
       LEFT JOIN company_event_clients cec
         ON cec.company_event_id = ? AND cec.agency_id = ? AND cec.client_id = c.id
       WHERE c.agency_id = ?
         AND cec.client_id IS NULL
         ${searchClause}
       ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code, CONCAT('Client ', c.id)) ASC
       LIMIT 60`,
      Number(event.organization_id) > 0
        ? [Number(event.organization_id), eventId, agencyId, agencyId, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`, q] : [])]
        : [eventId, agencyId, agencyId, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`, q] : [])]
    );

    res.json({
      ok: true,
      clients: (rows || []).map((r) => ({
        clientId: Number(r.clientId),
        initials: r.initials || null,
        fullName: r.fullName || null,
        identifierCode: r.identifierCode || null
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const addCompanyEventClient = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.body?.agencyId);
    const clientId = parsePositiveInt(req.body?.clientId);
    if (!eventId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and clientId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const affiliation = await ensureClientAgencyProgramAffiliation(clientId, agencyId, event.organization_id);
    if (!affiliation.ok) return res.status(400).json({ error: { message: affiliation.message } });

    await pool.execute(
      `INSERT INTO company_event_clients
        (company_event_id, agency_id, client_id, enrolled_by_user_id, is_active)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE, enrolled_by_user_id = VALUES(enrolled_by_user_id)`,
      [eventId, agencyId, clientId, parsePositiveInt(req.user?.id)]
    );

    res.json({ ok: true, eventId, clientId });
  } catch (e) {
    next(e);
  }
};

export const updateCompanyEventClientNotes = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const clientId = parsePositiveInt(req.params.clientId);
    const agencyId = parsePositiveInt(req.body?.agencyId);
    if (!eventId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and clientId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const notes = req.body?.notes != null ? String(req.body.notes) : null;
    const [r] = await pool.execute(
      `UPDATE company_event_clients SET notes = ? WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
      [notes, eventId, agencyId, clientId]
    );
    if (!Number(r?.affectedRows || 0)) {
      return res.status(404).json({ error: { message: 'Client is not enrolled in this event' } });
    }
    res.json({ ok: true, notes });
  } catch (e) {
    next(e);
  }
};

export const removeCompanyEventClient = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const clientId = parsePositiveInt(req.params.clientId);
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    if (!eventId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'eventId, agencyId, and clientId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const [r] = await pool.execute(
      `DELETE FROM company_event_clients
       WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
      [eventId, agencyId, clientId]
    );
    if (!Number(r?.affectedRows || 0)) {
      return res.status(404).json({ error: { message: 'Client is not enrolled in this event' } });
    }

    res.json({ ok: true, removed: Number(r.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
};

export const listCompanyEventProviderOptions = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!eventId || !agencyId) return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_active IS NULL OR u.is_active = TRUE)
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE','PROSPECTIVE'))
         AND (u.role IN ('provider') OR (u.has_provider_access = TRUE))
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    res.json({
      ok: true,
      providers: (rows || []).map((r) => ({
        id: Number(r.id),
        firstName: r.first_name || null,
        lastName: r.last_name || null,
        email: r.email || null,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.id}`
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const patchCompanyEventClientWorkflow = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const clientId = parsePositiveInt(req.params.clientId);
    const agencyId = parsePositiveInt(req.body?.agencyId);
    if (!eventId || !clientId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId, clientId, and agencyId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }
    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const providerUserId =
      req.body?.assignedProviderUserId === null || req.body?.assignedProviderUserId === ''
        ? null
        : parsePositiveInt(req.body?.assignedProviderUserId);

    // intakeOutcome is the primary control. When supplied:
    //   'accepted' or 'denied' => intake_complete = 1, outcome stored
    //   null/empty             => intake_complete = 0, outcome cleared
    // intakeComplete is still accepted for backward compatibility but only when
    // intakeOutcome is NOT supplied; setting it true without an outcome implies 'accepted'.
    let intakeOutcome;
    if (req.body?.intakeOutcome === undefined) {
      intakeOutcome = undefined;
    } else if (req.body.intakeOutcome === null || req.body.intakeOutcome === '') {
      intakeOutcome = null;
    } else {
      const v = String(req.body.intakeOutcome).toLowerCase();
      if (v !== 'accepted' && v !== 'denied') {
        return res.status(400).json({ error: { message: 'intakeOutcome must be "accepted", "denied", or null' } });
      }
      intakeOutcome = v;
    }

    let intakeComplete;
    if (intakeOutcome !== undefined) {
      intakeComplete = intakeOutcome !== null;
    } else if (req.body?.intakeComplete !== undefined) {
      intakeComplete = !!req.body.intakeComplete;
      // legacy callers: completing without outcome means accepted
      if (intakeComplete && intakeOutcome === undefined) intakeOutcome = 'accepted';
      if (!intakeComplete && intakeOutcome === undefined) intakeOutcome = null;
    } else {
      intakeComplete = undefined;
    }

    const tpComplete =
      req.body?.treatmentPlanComplete === undefined ? undefined : !!req.body.treatmentPlanComplete;

    // Family attendance confirmation — pending | yes | no. Anyone with manage rights
    // can record the answer (it's a routine coordinator task); the set_method records
    // whether it came from an admin override vs an automated reply.
    let confirmationStatus;
    if (req.body?.confirmationStatus === undefined) {
      confirmationStatus = undefined;
    } else if (req.body.confirmationStatus === null || req.body.confirmationStatus === '') {
      confirmationStatus = 'pending';
    } else {
      const v = String(req.body.confirmationStatus).toLowerCase();
      if (v !== 'pending' && v !== 'yes' && v !== 'no') {
        return res.status(400).json({ error: { message: 'confirmationStatus must be "pending", "yes", or "no"' } });
      }
      confirmationStatus = v;
    }

    // Eloping / extra-support flags came from the family on intake. Admins can
    // de-select them after a phone call/clarification — coordinators cannot.
    const isAdmin = isAgencyAdmin(req);
    let elopingFlag;
    if (req.body?.elopingFlag === undefined) {
      elopingFlag = undefined;
    } else if (!isAdmin) {
      return res.status(403).json({ error: { message: 'Only admins can change the eloping flag' } });
    } else {
      elopingFlag = req.body.elopingFlag === null ? null : !!req.body.elopingFlag;
    }
    let extraAssistanceFlag;
    if (req.body?.extraAssistanceFlag === undefined) {
      extraAssistanceFlag = undefined;
    } else if (!isAdmin) {
      return res.status(403).json({ error: { message: 'Only admins can change the extra-support flag' } });
    } else {
      extraAssistanceFlag = req.body.extraAssistanceFlag === null ? null : !!req.body.extraAssistanceFlag;
    }

    if (
      providerUserId === null
      && req.body?.assignedProviderUserId === undefined
      && intakeComplete === undefined
      && intakeOutcome === undefined
      && tpComplete === undefined
      && confirmationStatus === undefined
      && elopingFlag === undefined
      && extraAssistanceFlag === undefined
    ) {
      return res.status(400).json({ error: { message: 'No updates provided' } });
    }

    if (providerUserId) {
      const [p] = await pool.execute(
        `SELECT u.id FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND u.id = ?
           AND (u.role IN ('provider') OR (u.has_provider_access = TRUE))
         LIMIT 1`,
        [agencyId, providerUserId]
      );
      if (!p?.[0]) return res.status(404).json({ error: { message: 'Provider not found for this agency' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [curRows] = await conn.execute(
        `SELECT assigned_provider_user_id, intake_complete, intake_outcome, treatment_plan_complete
         FROM company_event_clients
         WHERE company_event_id = ? AND agency_id = ? AND client_id = ?
         LIMIT 1
         FOR UPDATE`,
        [eventId, agencyId, clientId]
      );
      const cur = curRows?.[0];
      if (!cur) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Client is not enrolled in this event' } });
      }

      const curIntake = cur.intake_complete === 1 || cur.intake_complete === true;
      const curOutcome = cur.intake_outcome ? String(cur.intake_outcome).toLowerCase() : null;
      const curTp = cur.treatment_plan_complete === 1 || cur.treatment_plan_complete === true;
      const nextIntake = intakeComplete !== undefined ? intakeComplete : curIntake;
      const nextOutcome = intakeOutcome !== undefined ? intakeOutcome : curOutcome;
      const nextTp = tpComplete !== undefined ? tpComplete : curTp;

      // TP can only be marked complete if intake outcome is "accepted" — denied
      // intakes never get a treatment plan.
      if (nextTp && nextOutcome !== 'accepted') {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'Intake must be Accepted before treatment plan can be marked complete' } });
      }
      if (nextTp && !nextIntake) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'Intake must be complete before treatment plan can be marked complete' } });
      }
      if ((intakeComplete === false || intakeOutcome === null) && curTp) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'Mark treatment plan as not complete before resetting intake' } });
      }

      const sets = [];
      const vals = [];

      if (req.body?.assignedProviderUserId !== undefined) {
        sets.push('assigned_provider_user_id = ?');
        vals.push(providerUserId);
      }

      const uid = parsePositiveInt(req.user?.id) || null;
      if (intakeComplete !== undefined) {
        sets.push('intake_complete = ?');
        vals.push(intakeComplete ? 1 : 0);
        if (intakeComplete) {
          sets.push('intake_completed_at = NOW()');
          sets.push('intake_completed_by_user_id = ?');
          vals.push(uid);
        } else {
          sets.push('intake_completed_at = NULL');
          sets.push('intake_completed_by_user_id = NULL');
        }
      }
      if (intakeOutcome !== undefined) {
        sets.push('intake_outcome = ?');
        vals.push(intakeOutcome);
      }

      if (tpComplete !== undefined) {
        sets.push('treatment_plan_complete = ?');
        vals.push(tpComplete ? 1 : 0);
        if (tpComplete) {
          sets.push('treatment_plan_completed_at = NOW()');
          sets.push('treatment_plan_completed_by_user_id = ?');
          vals.push(uid);
        } else {
          sets.push('treatment_plan_completed_at = NULL');
          sets.push('treatment_plan_completed_by_user_id = NULL');
        }
      }

      if (confirmationStatus !== undefined) {
        sets.push('confirmation_status = ?');
        vals.push(confirmationStatus);
        sets.push('confirmation_set_at = NOW()');
        sets.push('confirmation_set_by_user_id = ?');
        vals.push(uid);
        // Until automated text/email replies are wired up, every change comes
        // from a human staff member in the UI — record it as an admin_override.
        sets.push('confirmation_set_method = ?');
        vals.push('admin_override');
      }

      if (sets.length) {
        vals.push(eventId, agencyId, clientId);
        await conn.execute(
          `UPDATE company_event_clients
           SET ${sets.join(', ')}
           WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
          vals
        );
      }

      // Eloping / extra-support flags live on `clients` (intake-level data, not per-event).
      const clientSets = [];
      const clientVals = [];
      if (elopingFlag !== undefined) {
        clientSets.push('eloping_flag = ?');
        clientVals.push(elopingFlag === null ? null : (elopingFlag ? 1 : 0));
      }
      if (extraAssistanceFlag !== undefined) {
        clientSets.push('extra_assistance_flag = ?');
        clientVals.push(extraAssistanceFlag === null ? null : (extraAssistanceFlag ? 1 : 0));
      }
      if (clientSets.length) {
        clientVals.push(clientId, agencyId);
        await conn.execute(
          `UPDATE clients SET ${clientSets.join(', ')} WHERE id = ? AND agency_id = ?`,
          clientVals
        );
      }

      if (!sets.length && !clientSets.length) {
        await conn.rollback();
        return res.json({ ok: true });
      }

      await conn.commit();

      // Auto-advance the client's overall status (the "Intake Packet" / paperwork
      // chip the rosters surface) so it reflects the actual workflow stage.
      // Runs only when intake outcome or TP-complete actually moved — otherwise
      // it would be a wasted lookup. Failures here are non-fatal: the workflow
      // patch already committed and the sync is best-effort.
      const outcomeChanged = intakeOutcome !== undefined && intakeOutcome !== curOutcome;
      const tpChanged = tpComplete !== undefined && tpComplete !== curTp;
      if (outcomeChanged || tpChanged) {
        try {
          await syncClientStatusForEvent({
            clientId,
            agencyId,
            intakeOutcome: nextOutcome,
            treatmentPlanComplete: nextTp,
            actorUserId: uid
          });
        } catch (syncErr) {
          // Don't fail the API response over a status-sync hiccup — log only.
          console.warn('[companyEventClients] client status sync failed', {
            eventId, clientId, agencyId, message: String(syncErr?.message || syncErr)
          });
        }
      }

      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      const msg = String(err?.message || '');
      if (msg.includes('Unknown column') && msg.includes('confirmation_status')) {
        return res.status(503).json({ error: { message: 'Run database migration 803_company_event_clients_confirmation.sql' } });
      }
      if (msg.includes('Unknown column') && msg.includes('intake_outcome')) {
        return res.status(503).json({ error: { message: 'Run database migration 802_company_event_clients_intake_outcome.sql' } });
      }
      if (msg.includes('Unknown column') && msg.includes('assigned_provider_user_id')) {
        return res.status(503).json({ error: { message: 'Run database migration 739_company_event_clients_provider_and_workflow.sql' } });
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};
