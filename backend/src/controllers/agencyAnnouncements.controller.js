import pool from '../config/database.js';
import User from '../models/User.model.js';

const DEFAULT_BIRTHDAY_TEMPLATE = 'Happy Birthday, {fullName}';

async function ensureAnnouncementsRow(agencyId) {
  if (!agencyId) return;
  await pool.execute(
    `INSERT IGNORE INTO agency_announcements (agency_id, birthday_enabled, birthday_template, updated_by_user_id)
     VALUES (?, 0, NULL, NULL)`,
    [agencyId]
  );
}

const formatNameList = (names) => {
  const list = (names || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

export const getAgencyAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId < 1) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    await ensureAnnouncementsRow(agencyId);
    const [rows] = await pool.execute(
      `SELECT agency_id, birthday_enabled, birthday_template
       FROM agency_announcements
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const row = rows?.[0] || null;
    res.json({
      agencyId,
      birthdayEnabled: row ? Boolean(row.birthday_enabled) : false,
      birthdayTemplate: row?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE
    });
  } catch (e) {
    next(e);
  }
};

export const updateAgencyAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId < 1) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    const birthdayEnabled =
      req.body?.birthdayEnabled === true ||
      req.body?.birthdayEnabled === 1 ||
      String(req.body?.birthdayEnabled || '').toLowerCase() === 'true';

    let birthdayTemplate = req.body?.birthdayTemplate;
    if (birthdayTemplate === null || birthdayTemplate === undefined) {
      birthdayTemplate = null;
    } else {
      birthdayTemplate = String(birthdayTemplate || '').trim();
      if (!birthdayTemplate) birthdayTemplate = null;
      if (birthdayTemplate && birthdayTemplate.length > 255) {
        return res.status(400).json({ error: { message: 'birthdayTemplate is too long (max 255 chars)' } });
      }
    }

    await ensureAnnouncementsRow(agencyId);
    await pool.execute(
      `UPDATE agency_announcements
       SET birthday_enabled = ?, birthday_template = ?, updated_by_user_id = ?
       WHERE agency_id = ?`,
      [birthdayEnabled ? 1 : 0, birthdayTemplate, req.user?.id || null, agencyId]
    );

    const [rows] = await pool.execute(
      `SELECT agency_id, birthday_enabled, birthday_template
       FROM agency_announcements
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const row = rows?.[0] || null;
    res.json({
      agencyId,
      birthdayEnabled: row ? Boolean(row.birthday_enabled) : false,
      birthdayTemplate: row?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE
    });
  } catch (e) {
    next(e);
  }
};

export const getAgencyDashboardBanner = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId < 1) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    // Authorization: allow super_admin to view any; otherwise restrict to agencies the user belongs to.
    if (req.user?.role !== 'super_admin') {
      const agencies = await User.getAgencies(req.user.id);
      const ok = (agencies || []).some((a) => Number(a?.id) === agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    await ensureAnnouncementsRow(agencyId);
    const [aRows] = await pool.execute(
      `SELECT birthday_enabled, birthday_template FROM agency_announcements WHERE agency_id = ? LIMIT 1`,
      [agencyId]
    );
    const cfg = aRows?.[0] || null;
    const birthdayEnabled = cfg ? Boolean(cfg.birthday_enabled) : false;
    if (!birthdayEnabled) return res.json({ banner: null });

    const template = String(cfg?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE);

    // Birthday is stored as YYYY-MM-DD in user_info_values.value for field_key = provider_birthdate
    // We match by month/day.
    const [rows] = await pool.execute(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        uiv.value AS birthdate_value,
        uifd.is_platform_template,
        uifd.agency_id
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      INNER JOIN user_info_values uiv ON uiv.user_id = u.id
      INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
      WHERE
        u.is_active = 1
        AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active')
        AND uifd.field_key = 'provider_birthdate'
        AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
        AND uiv.value IS NOT NULL AND uiv.value <> ''
        AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')
      ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
      `,
      [agencyId, agencyId]
    );

    // Pick the highest-precedence birthdate value per user, then show all birthday people.
    const seen = new Set();
    const names = [];
    for (const r of rows || []) {
      const id = Number(r?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const fullName = `${String(r?.first_name || '').trim()} ${String(r?.last_name || '').trim()}`.trim();
      if (fullName) names.push(fullName);
    }

    if (!names.length) return res.json({ banner: null });

    const fullName = formatNameList(names);
    const message = template.includes('{fullName}') ? template.replaceAll('{fullName}', fullName) : `${template} ${fullName}`;
    return res.json({
      banner: {
        type: 'birthday',
        message,
        agencyId,
        names
      }
    });
  } catch (e) {
    next(e);
  }
};

