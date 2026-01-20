import pool from '../config/database.js';

const parseAgencyId = (req) => {
  const raw = req.query.agencyId || req.body.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const normalizeDay = (d) => {
  const s = String(d || '').trim();
  const allowed = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return allowed.includes(s) ? s : null;
};

export const listProvidersForScheduling = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Backward compatible: provider_accepting_new_clients may not exist yet.
    try {
      const [rows] = await pool.execute(
        `SELECT u.id,
                u.first_name,
                u.last_name,
                u.email,
                u.role,
                u.has_provider_access,
                u.provider_accepting_new_clients
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (
             u.role IN ('clinician','provider')
             OR (u.has_provider_access = TRUE)
           )
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
      res.json(rows);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown column')) throw e;
      const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.has_provider_access
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (
             u.role IN ('clinician','provider')
             OR (u.has_provider_access = TRUE)
           )
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
      res.json((rows || []).map((r) => ({ ...r, provider_accepting_new_clients: true })));
    }
  } catch (e) {
    next(e);
  }
};

export const listProviderSchoolAssignments = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const providerUserId = req.query.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
    const schoolOrganizationId = req.query.schoolOrganizationId ? parseInt(req.query.schoolOrganizationId, 10) : null;

    const where = ['oa.agency_id = ?'];
    const values = [agencyId];
    if (providerUserId) {
      where.push('psa.provider_user_id = ?');
      values.push(providerUserId);
    }
    if (schoolOrganizationId) {
      where.push('psa.school_organization_id = ?');
      values.push(schoolOrganizationId);
    }

    const [rows] = await pool.execute(
      `SELECT psa.*,
              s.name AS school_name,
              u.first_name AS provider_first_name,
              u.last_name AS provider_last_name
       FROM provider_school_assignments psa
       JOIN agencies s ON s.id = psa.school_organization_id
       JOIN users u ON u.id = psa.provider_user_id
       JOIN organization_affiliations oa ON oa.organization_id = psa.school_organization_id AND oa.is_active = TRUE
       WHERE ${where.join(' AND ')}
       ORDER BY psa.school_organization_id ASC, psa.day_of_week ASC, u.last_name ASC, u.first_name ASC`,
      values
    );

    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertProviderSchoolAssignment = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const providerUserId = parseInt(req.body.providerUserId, 10);
    const schoolOrganizationId = parseInt(req.body.schoolOrganizationId, 10);
    const dayOfWeek = normalizeDay(req.body.dayOfWeek);
    const slotsTotal = parseInt(req.body.slotsTotal, 10);
    const startTime = req.body.startTime || null;
    const endTime = req.body.endTime || null;
    const isActive = req.body.isActive === undefined ? true : (req.body.isActive === true || req.body.isActive === 'true');
    const acceptingNewClientsOverride =
      req.body.acceptingNewClientsOverride === undefined || req.body.acceptingNewClientsOverride === null || req.body.acceptingNewClientsOverride === ''
        ? null
        : (req.body.acceptingNewClientsOverride === true || req.body.acceptingNewClientsOverride === 'true' || req.body.acceptingNewClientsOverride === 1 || req.body.acceptingNewClientsOverride === '1');

    if (!providerUserId || !schoolOrganizationId || !dayOfWeek || !Number.isFinite(slotsTotal) || slotsTotal < 0) {
      return res.status(400).json({
        error: { message: 'providerUserId, schoolOrganizationId, dayOfWeek, and non-negative slotsTotal are required' }
      });
    }

    // Ensure school is linked to agency
    const [aff] = await pool.execute(
      `SELECT id FROM organization_affiliations WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1`,
      [agencyId, schoolOrganizationId]
    );
    if (!aff[0] && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'School is not linked to this agency' } });
    }

    // Upsert: set slots_available to slotsTotal when creating; when updating, clamp slots_available to slotsTotal if needed.
    const [existing] = await pool.execute(
      `SELECT id, slots_total, slots_available FROM provider_school_assignments
       WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
       LIMIT 1`,
      [providerUserId, schoolOrganizationId, dayOfWeek]
    );

    if (!existing[0]) {
      const [result] = await pool.execute(
        `INSERT INTO provider_school_assignments
          (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active, accepting_new_clients_override)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [providerUserId, schoolOrganizationId, dayOfWeek, slotsTotal, slotsTotal, startTime, endTime, isActive ? 1 : 0, acceptingNewClientsOverride]
      );
      const [rows] = await pool.execute(`SELECT * FROM provider_school_assignments WHERE id = ?`, [result.insertId]);
      return res.status(201).json(rows[0] || null);
    }

    // Preserve used slots so reducing total doesn't incorrectly "refund" availability.
    const oldTotal = parseInt(existing[0].slots_total ?? 0, 10);
    const oldAvail = parseInt(existing[0].slots_available ?? 0, 10);
    const used = Math.max(0, oldTotal - oldAvail);
    const nextSlotsAvailable = Math.max(0, slotsTotal - used);
    await pool.execute(
      `UPDATE provider_school_assignments
       SET slots_total = ?, slots_available = ?, start_time = ?, end_time = ?, is_active = ?, accepting_new_clients_override = ?
       WHERE id = ?`,
      [slotsTotal, nextSlotsAvailable, startTime, endTime, isActive ? 1 : 0, acceptingNewClientsOverride, existing[0].id]
    );
    const [rows] = await pool.execute(`SELECT * FROM provider_school_assignments WHERE id = ?`, [existing[0].id]);
    res.json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const availabilityReport = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT
         psa.school_organization_id,
         s.name AS school_name,
         psa.day_of_week,
         SUM(psa.slots_total) AS slots_total,
         SUM(psa.slots_available) AS slots_available
       FROM provider_school_assignments psa
       JOIN agencies s ON s.id = psa.school_organization_id
       JOIN organization_affiliations oa ON oa.organization_id = psa.school_organization_id AND oa.agency_id = ? AND oa.is_active = TRUE
       WHERE psa.is_active = TRUE
       GROUP BY psa.school_organization_id, psa.day_of_week
       ORDER BY s.name ASC, psa.day_of_week ASC`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

