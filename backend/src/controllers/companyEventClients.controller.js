import pool from '../config/database.js';
import User from '../models/User.model.js';
import { userHasAgencyOrAffiliatedOrgAccessForRequest } from '../utils/userAgencyAffiliationAccess.js';

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

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  return userHasAgencyOrAffiliatedOrgAccessForRequest(req, agencyId);
}

async function getProgramCoordinatorAccess(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function canManageProgramEvent(req, agencyId) {
  if (!(await userHasAgencyAccess(req, agencyId))) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff') return true;
  return getProgramCoordinatorAccess(parsePositiveInt(req.user?.id));
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
 * - **Registrant** = newly enrolled, not yet "in" the program: no provider assigned AND
 *   no intake completed. Coordinator/admin work area; these clients are not surfaced to
 *   line-level providers since nobody is responsible for them yet.
 * - **Participant** = anyone who has been touched by intake workflow — either a provider
 *   has been assigned OR intake_complete = 1.
 */
const REGISTRANT_PREDICATE = `(cec.assigned_provider_user_id IS NULL AND COALESCE(cec.intake_complete, 0) = 0)`;
const PARTICIPANT_PREDICATE = `NOT ${REGISTRANT_PREDICATE}`;

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
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }

    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    // Workflow-derived counts so the UI can pulse the registrants chip and show totals
    // without a second round-trip. Both numbers are computed even when the caller filters.
    let counts = { all: 0, registrants: 0, participants: 0 };
    try {
      const [countRows] = await pool.execute(
        `SELECT
           COUNT(*) AS all_count,
           SUM(CASE WHEN ${REGISTRANT_PREDICATE} THEN 1 ELSE 0 END) AS registrants_count,
           SUM(CASE WHEN ${PARTICIPANT_PREDICATE} THEN 1 ELSE 0 END) AS participants_count
         FROM company_event_clients cec
         WHERE cec.company_event_id = ? AND cec.agency_id = ?`,
        [eventId, agencyId]
      );
      const row = countRows?.[0] || {};
      counts = {
        all: Number(row.all_count || 0),
        registrants: Number(row.registrants_count || 0),
        participants: Number(row.participants_count || 0)
      };
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown column') && msg.includes('intake_complete')) {
        return res.status(503).json({ error: { message: 'Run database migration 739_company_event_clients_provider_and_workflow.sql' } });
      }
      throw e;
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
             cec.is_active AS isActive,
             cec.enrolled_at AS enrolledAt,
             cec.notes,
             cec.assigned_provider_user_id,
             pu.first_name AS provider_first_name,
             pu.last_name AS provider_last_name,
             cec.intake_complete,
             cec.intake_completed_at,
             icu.first_name AS intake_by_first_name,
             icu.last_name AS intake_by_last_name,
             cec.treatment_plan_complete,
             cec.treatment_plan_completed_at,
             tpu.first_name AS tp_by_first_name,
             tpu.last_name AS tp_by_last_name
           FROM company_event_clients cec
           INNER JOIN clients c ON c.id = cec.client_id AND c.agency_id = cec.agency_id
           LEFT JOIN users pu ON pu.id = cec.assigned_provider_user_id
           LEFT JOIN users icu ON icu.id = cec.intake_completed_by_user_id
           LEFT JOIN users tpu ON tpu.id = cec.treatment_plan_completed_by_user_id
           WHERE cec.company_event_id = ? AND cec.agency_id = ?
             ${statusWhere}
           ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code, CONCAT('Client ', c.id)) ASC`,
          [eventId, agencyId]
        );
        rows = r || [];
      } catch (e) {
        const msg = String(e?.message || '');
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

    res.json({
      ok: true,
      counts,
      statusFilter,
      clients: (rows || []).map((r) => ({
        clientId: Number(r.clientId),
        initials: r.initials || null,
        fullName: r.fullName || null,
        identifierCode: r.identifierCode || null,
        grade: r.grade || null,
        ageYears: ageFromDateOfBirth(r.date_of_birth),
        status: r.status || null,
        documentStatus: r.documentStatus || null,
        isActive: r.isActive === true || r.isActive === 1,
        enrolledAt: r.enrolledAt || null,
        notes: r.notes || null,
        assignedProviderUserId: r.assigned_provider_user_id ? Number(r.assigned_provider_user_id) : null,
        assignedProviderName:
          r.provider_first_name || r.provider_last_name
            ? `${r.provider_first_name || ''} ${r.provider_last_name || ''}`.trim()
            : null,
        intakeComplete: r.intake_complete === 1 || r.intake_complete === true,
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
            : null
      }))
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

    const intakeComplete =
      req.body?.intakeComplete === undefined ? undefined : !!req.body.intakeComplete;
    const tpComplete =
      req.body?.treatmentPlanComplete === undefined ? undefined : !!req.body.treatmentPlanComplete;

    if (providerUserId === null && req.body?.assignedProviderUserId === undefined && intakeComplete === undefined && tpComplete === undefined) {
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
        `SELECT assigned_provider_user_id, intake_complete, treatment_plan_complete
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
      const curTp = cur.treatment_plan_complete === 1 || cur.treatment_plan_complete === true;
      const nextIntake = intakeComplete !== undefined ? intakeComplete : curIntake;
      const nextTp = tpComplete !== undefined ? tpComplete : curTp;

      if (nextTp && !nextIntake) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'Intake must be complete before treatment plan can be marked complete' } });
      }
      if (intakeComplete === false && curTp) {
        await conn.rollback();
        return res.status(400).json({ error: { message: 'Mark treatment plan as not complete before marking intake incomplete' } });
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

      if (!sets.length) {
        await conn.rollback();
        return res.json({ ok: true });
      }

      vals.push(eventId, agencyId, clientId);
      await conn.execute(
        `UPDATE company_event_clients
         SET ${sets.join(', ')}
         WHERE company_event_id = ? AND agency_id = ? AND client_id = ?`,
        vals
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      const msg = String(err?.message || '');
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
