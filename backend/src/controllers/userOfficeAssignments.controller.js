import pool from '../config/database.js';

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const s = String(value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function addressLine(row) {
  return [
    row?.street_address || '',
    row?.city || '',
    row?.state || '',
    row?.postal_code || ''
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(', ');
}

async function listAssignableOfficeOptionsForUser(targetUserId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        ol.id,
        ol.name,
        ol.street_address,
        ol.city,
        ol.state,
        ol.postal_code,
        COALESCE(ol.is_active, TRUE) AS is_active
     FROM office_locations ol
     JOIN office_location_agencies ola ON ola.office_location_id = ol.id
     JOIN user_agencies ua ON ua.agency_id = ola.agency_id
     WHERE ua.user_id = ?
       AND COALESCE(ol.is_active, TRUE) = TRUE
     ORDER BY ol.name ASC`,
    [targetUserId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: r.name || `Office #${r.id}`,
    street_address: r.street_address || '',
    city: r.city || '',
    state: r.state || '',
    postal_code: r.postal_code || '',
    addressLine: addressLine(r)
  }));
}

async function listAssignedOfficesForUser(targetUserId) {
  const [rows] = await pool.execute(
    `SELECT
        ol.id,
        ol.name,
        ol.street_address,
        ol.city,
        ol.state,
        ol.postal_code,
        COALESCE(uol.is_active, TRUE) AS is_active,
        COALESCE(uol.is_primary, FALSE) AS is_primary
     FROM user_office_locations uol
     JOIN office_locations ol ON ol.id = uol.office_location_id
     WHERE uol.user_id = ?
     ORDER BY COALESCE(uol.is_primary, FALSE) DESC, ol.name ASC`,
    [targetUserId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: r.name || `Office #${r.id}`,
    street_address: r.street_address || '',
    city: r.city || '',
    state: r.state || '',
    postal_code: r.postal_code || '',
    addressLine: addressLine(r),
    isActive: toBool(r.is_active, true),
    isPrimary: toBool(r.is_primary, false)
  }));
}

export const getUserOfficeAssignments = async (req, res, next) => {
  try {
    const targetUserId = toInt(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    const options = await listAssignableOfficeOptionsForUser(targetUserId);
    const assigned = await listAssignedOfficesForUser(targetUserId);
    res.json({
      options,
      assigned
    });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({
        error: {
          message: 'Office assignments table is not available yet. Run migration 383_user_office_locations.sql first.'
        }
      });
    }
    next(e);
  }
};

export const upsertUserOfficeAssignments = async (req, res, next) => {
  let conn;
  try {
    const targetUserId = toInt(req.params.id);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const payload = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    const normalized = payload
      .map((a) => ({
        officeLocationId: toInt(a?.officeLocationId),
        isActive: toBool(a?.isActive, true),
        isPrimary: toBool(a?.isPrimary, false)
      }))
      .filter((a) => !!a.officeLocationId);

    const dedup = new Map();
    for (const item of normalized) dedup.set(item.officeLocationId, item);
    const rows = Array.from(dedup.values());

    const options = await listAssignableOfficeOptionsForUser(targetUserId);
    const allowed = new Set(options.map((o) => Number(o.id)));
    for (const item of rows) {
      if (!allowed.has(Number(item.officeLocationId))) {
        return res.status(400).json({
          error: { message: 'One or more selected offices are not available for this user’s agency assignments.' }
        });
      }
    }

    const activeRows = rows.filter((r) => r.isActive);
    let primaryOfficeId = activeRows.find((r) => r.isPrimary)?.officeLocationId || null;
    if (!primaryOfficeId && activeRows.length) {
      primaryOfficeId = activeRows[0].officeLocationId;
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Deactivate all first; selected rows will be re-upserted below.
    await conn.execute(
      `UPDATE user_office_locations
       SET is_active = FALSE,
           is_primary = FALSE,
           linked_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [req.user?.id || null, targetUserId]
    );

    for (const item of rows) {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO user_office_locations
           (user_id, office_location_id, is_primary, is_active, linked_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_primary = VALUES(is_primary),
           is_active = VALUES(is_active),
           linked_by_user_id = VALUES(linked_by_user_id),
           updated_at = CURRENT_TIMESTAMP`,
        [
          targetUserId,
          item.officeLocationId,
          item.isActive && Number(item.officeLocationId) === Number(primaryOfficeId),
          item.isActive,
          req.user?.id || null
        ]
      );
    }

    await conn.commit();
    const assigned = await listAssignedOfficesForUser(targetUserId);
    res.json({ ok: true, assigned });
  } catch (e) {
    if (conn) await conn.rollback();
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({
        error: {
          message: 'Office assignments table is not available yet. Run migration 383_user_office_locations.sql first.'
        }
      });
    }
    next(e);
  } finally {
    if (conn) conn.release();
  }
};

