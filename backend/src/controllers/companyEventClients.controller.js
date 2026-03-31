import pool from '../config/database.js';
import User from '../models/User.model.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user?.id);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
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

export const listCompanyEventClients = async (req, res, next) => {
  try {
    const eventId = parsePositiveInt(req.params.eventId);
    const agencyId = parsePositiveInt(req.query.agencyId);
    if (!eventId || !agencyId) {
      return res.status(400).json({ error: { message: 'eventId and agencyId are required' } });
    }
    if (!(await canManageProgramEvent(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this event' } });
    }

    const event = await loadEventForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Event not found' } });

    const [rows] = await pool.execute(
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
       ORDER BY COALESCE(NULLIF(TRIM(c.full_name), ''), c.initials, c.identifier_code, CONCAT('Client ', c.id)) ASC`,
      [eventId, agencyId]
    );

    res.json({
      ok: true,
      clients: (rows || []).map((r) => ({
        clientId: Number(r.clientId),
        initials: r.initials || null,
        fullName: r.fullName || null,
        identifierCode: r.identifierCode || null,
        status: r.status || null,
        documentStatus: r.documentStatus || null,
        isActive: r.isActive === true || r.isActive === 1,
        enrolledAt: r.enrolledAt || null,
        notes: r.notes || null
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
