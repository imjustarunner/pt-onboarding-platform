import pool from '../config/database.js';
import User from '../models/User.model.js';

const DEFAULT_BIRTHDAY_TEMPLATE = 'Happy Birthday, {fullName}';
const DEFAULT_ANNIVERSARY_TEMPLATE = 'Happy {years}-year anniversary, {fullName}';
const MS_DAY = 24 * 60 * 60 * 1000;

async function ensureAnnouncementsRow(agencyId) {
  if (!agencyId) return;
  await pool.execute(
    `INSERT IGNORE INTO agency_announcements
     (agency_id, birthday_enabled, birthday_template, anniversary_enabled, anniversary_template, updated_by_user_id)
     VALUES (?, 0, NULL, 0, NULL, NULL)`,
    [agencyId]
  );
}

const formatNameList = (names) => {
  const list = (names || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const parseAgencyId = (raw) => {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseBooleanFlag = (raw) => (
  raw === true ||
  raw === 1 ||
  String(raw || '').toLowerCase() === 'true'
);

const normalizePositiveIntIds = (raw) => {
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(',') : []);
  return [...new Set(
    list
      .map((value) => parseInt(String(value || '').trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
};

const normalizeTemplateInput = (raw) => {
  if (raw === null || raw === undefined) return null;
  const value = String(raw || '').trim();
  return value || null;
};

const renderAnniversaryTemplate = (template, people = []) => {
  const tpl = String(template || DEFAULT_ANNIVERSARY_TEMPLATE);
  const validPeople = (people || []).filter((p) => p?.fullName && Number.isFinite(Number(p?.years)));
  if (!validPeople.length) return '';
  if (validPeople.length === 1) {
    const first = validPeople[0];
    return tpl
      .replaceAll('{fullName}', String(first.fullName))
      .replaceAll('{years}', String(first.years));
  }
  // If template references years, render per-person snippets to avoid ambiguous year substitution.
  if (tpl.includes('{years}')) {
    return validPeople
      .map((p) => tpl
        .replaceAll('{fullName}', String(p.fullName))
        .replaceAll('{years}', String(p.years)))
      .join(' | ');
  }
  return tpl.replaceAll('{fullName}', formatNameList(validPeople.map((p) => String(p.fullName))));
};

const parseAnnouncementDisplayType = (raw) => {
  const value = String(raw || 'announcement').trim().toLowerCase();
  return value === 'splash' ? 'splash' : 'announcement';
};

const parseRecipientUserIds = (raw) => {
  if (Array.isArray(raw)) return normalizePositiveIntIds(raw);
  if (raw && typeof raw === 'object') return normalizePositiveIntIds(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizePositiveIntIds(parsed);
      } catch {
        return normalizePositiveIntIds(trimmed);
      }
    }
    return normalizePositiveIntIds(trimmed);
  }
  return [];
};

const userHasAgencyAccess = async (req, agencyId) => {
  if (!agencyId) return false;
  if (req.user?.role === 'super_admin') return true;
  const userId = req.user?.id;
  if (!userId) return false;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === agencyId);
};

export const getAgencyAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    await ensureAnnouncementsRow(agencyId);
    const [rows] = await pool.execute(
      `SELECT
         agency_id,
         birthday_enabled,
         birthday_template,
         anniversary_enabled,
         anniversary_template
       FROM agency_announcements
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const row = rows?.[0] || null;
    res.json({
      agencyId,
      birthdayEnabled: row ? Boolean(row.birthday_enabled) : false,
      birthdayTemplate: row?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE,
      anniversaryEnabled: row ? Boolean(row.anniversary_enabled) : false,
      anniversaryTemplate: row?.anniversary_template || DEFAULT_ANNIVERSARY_TEMPLATE
    });
  } catch (e) {
    next(e);
  }
};

export const updateAgencyAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    const birthdayEnabled = parseBooleanFlag(req.body?.birthdayEnabled);
    const anniversaryEnabled = parseBooleanFlag(req.body?.anniversaryEnabled);

    const birthdayTemplate = normalizeTemplateInput(req.body?.birthdayTemplate);
    const anniversaryTemplate = normalizeTemplateInput(req.body?.anniversaryTemplate);
    if (birthdayTemplate && birthdayTemplate.length > 255) {
      return res.status(400).json({ error: { message: 'birthdayTemplate is too long (max 255 chars)' } });
    }
    if (anniversaryTemplate && anniversaryTemplate.length > 255) {
      return res.status(400).json({ error: { message: 'anniversaryTemplate is too long (max 255 chars)' } });
    }

    await ensureAnnouncementsRow(agencyId);
    await pool.execute(
      `UPDATE agency_announcements
       SET
         birthday_enabled = ?,
         birthday_template = ?,
         anniversary_enabled = ?,
         anniversary_template = ?,
         updated_by_user_id = ?
       WHERE agency_id = ?`,
      [
        birthdayEnabled ? 1 : 0,
        birthdayTemplate,
        anniversaryEnabled ? 1 : 0,
        anniversaryTemplate,
        req.user?.id || null,
        agencyId
      ]
    );

    const [rows] = await pool.execute(
      `SELECT
         agency_id,
         birthday_enabled,
         birthday_template,
         anniversary_enabled,
         anniversary_template
       FROM agency_announcements
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const row = rows?.[0] || null;
    res.json({
      agencyId,
      birthdayEnabled: row ? Boolean(row.birthday_enabled) : false,
      birthdayTemplate: row?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE,
      anniversaryEnabled: row ? Boolean(row.anniversary_enabled) : false,
      anniversaryTemplate: row?.anniversary_template || DEFAULT_ANNIVERSARY_TEMPLATE
    });
  } catch (e) {
    next(e);
  }
};

export const getAgencyDashboardBanner = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    // Authorization: allow super_admin to view any; otherwise restrict to agencies the user belongs to.
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    await ensureAnnouncementsRow(agencyId);
    const [aRows] = await pool.execute(
      `SELECT
         birthday_enabled,
         birthday_template,
         anniversary_enabled,
         anniversary_template
       FROM agency_announcements
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    const cfg = aRows?.[0] || null;
    const birthdayEnabled = cfg ? Boolean(cfg.birthday_enabled) : false;
    const anniversaryEnabled = cfg ? Boolean(cfg.anniversary_enabled) : false;
    if (!birthdayEnabled && !anniversaryEnabled) return res.json({ banner: null });

    const template = String(cfg?.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE);
    const anniversaryTemplate = String(cfg?.anniversary_template || DEFAULT_ANNIVERSARY_TEMPLATE);

    const messageParts = [];

    if (birthdayEnabled) {
      // Birthday is stored as YYYY-MM-DD in user_info_values.value.
      // Read both historical keys (`provider_birthdate`) and canonical key (`date_of_birth`).
      const [rows] = await pool.execute(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          uifd.field_key,
          uifd.is_platform_template,
          uifd.agency_id,
          CASE
            WHEN uifd.field_key = 'date_of_birth' THEN 2
            WHEN uifd.field_key = 'provider_birthdate' THEN 1
            ELSE 0
          END AS field_priority
        FROM users u
        INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
        INNER JOIN user_info_values uiv ON uiv.user_id = u.id
        INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
        WHERE
          u.is_active = 1
          AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active')
          AND uifd.field_key IN ('date_of_birth', 'provider_birthdate')
          AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
          AND uiv.value IS NOT NULL AND uiv.value <> ''
          AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')
        ORDER BY field_priority DESC, uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
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
      if (names.length) {
        const fullName = formatNameList(names);
        const message = template.includes('{fullName}') ? template.replaceAll('{fullName}', fullName) : `${template} ${fullName}`;
        messageParts.push(String(message || '').trim());
      }
    }

    if (anniversaryEnabled) {
      const [rows] = await pool.execute(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          uifd.is_platform_template,
          uifd.agency_id,
          uiv.value AS start_date_value,
          TIMESTAMPDIFF(YEAR, STR_TO_DATE(uiv.value, '%Y-%m-%d'), CURDATE()) AS service_years
        FROM users u
        INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
        INNER JOIN user_info_values uiv ON uiv.user_id = u.id
        INNER JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
        WHERE
          u.is_active = 1
          AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(u.status) = 'active')
          AND uifd.field_key = 'start_date'
          AND (uifd.agency_id IS NULL OR uifd.agency_id = ?)
          AND uiv.value IS NOT NULL AND uiv.value <> ''
          AND uiv.value REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND SUBSTRING(uiv.value, 6, 5) = DATE_FORMAT(CURDATE(), '%m-%d')
        ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC
        `,
        [agencyId, agencyId]
      );

      const seen = new Set();
      const anniversaries = [];
      for (const r of rows || []) {
        const id = Number(r?.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const fullName = `${String(r?.first_name || '').trim()} ${String(r?.last_name || '').trim()}`.trim();
        const years = Number(r?.service_years);
        if (!fullName || !Number.isFinite(years) || years < 1) continue;
        anniversaries.push({ fullName, years });
      }
      if (anniversaries.length) {
        const message = renderAnniversaryTemplate(anniversaryTemplate, anniversaries);
        if (message) messageParts.push(message);
      }
    }

    if (!messageParts.length) return res.json({ banner: null });

    return res.json({
      banner: {
        type: 'automated',
        message: messageParts.join(' | '),
        agencyId
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Active banner announcements (scrolling banner).
 * GET /api/agencies/:id/announcements/banner
 */
export const listAgencyBannerAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const userId = parseAgencyId(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const [rows] = await pool.execute(
      `SELECT id, title, message, starts_at, ends_at, created_at, display_type, recipient_user_ids
       FROM agency_scheduled_announcements
       WHERE agency_id = ?
         AND NOW() >= starts_at
         AND NOW() <= ends_at
         AND (
           recipient_user_ids IS NULL
           OR JSON_LENGTH(recipient_user_ids) = 0
           OR JSON_CONTAINS(recipient_user_ids, CAST(? AS JSON), '$')
         )
       ORDER BY starts_at ASC, id DESC
       LIMIT 20`,
      [agencyId, String(userId)]
    );
    const out = (rows || []).map((r) => ({
      id: r.id,
      title: r.title || 'Announcement',
      message: r.message || '',
      display_type: parseAnnouncementDisplayType(r.display_type),
      recipient_user_ids: parseRecipientUserIds(r.recipient_user_ids),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      created_at: r.created_at
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * List scheduled announcements for management UI.
 * GET /api/agencies/:id/announcements/list
 */
export const listAgencyScheduledAnnouncements = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const [rows] = await pool.execute(
      `SELECT
        asa.id,
        asa.title,
        asa.message,
        asa.display_type,
        asa.recipient_user_ids,
        asa.starts_at,
        asa.ends_at,
        asa.created_at,
        asa.created_by_user_id,
        CONCAT(TRIM(u.first_name), ' ', TRIM(u.last_name)) AS created_by_name
       FROM agency_scheduled_announcements asa
       LEFT JOIN users u ON u.id = asa.created_by_user_id
       WHERE asa.agency_id = ?
       ORDER BY asa.starts_at DESC, asa.id DESC
       LIMIT 200`,
      [agencyId]
    );
    res.json((rows || []).map((r) => ({
      id: r.id,
      title: r.title || null,
      message: r.message || '',
      display_type: parseAnnouncementDisplayType(r.display_type),
      recipient_user_ids: parseRecipientUserIds(r.recipient_user_ids),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      created_at: r.created_at,
      created_by_user_id: r.created_by_user_id || null,
      created_by_name: r.created_by_name?.trim() || null
    })));
  } catch (e) {
    next(e);
  }
};

/**
 * Create a scheduled, time-limited banner announcement for this agency.
 * POST /api/agencies/:id/announcements
 * body: { title?, message, starts_at, ends_at }
 */
export const createAgencyScheduledAnnouncement = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    const displayType = parseAnnouncementDisplayType(req.body?.displayType || req.body?.display_type);
    const recipientUserIds = parseRecipientUserIds(req.body?.recipientUserIds || req.body?.recipient_user_ids);
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const maxStart = Date.now() + 364 * MS_DAY;
    if (startsAt.getTime() > maxStart) {
      return res.status(400).json({ error: { message: 'Announcements can only be scheduled up to 364 days out' } });
    }

    const [result] = await pool.execute(
      `INSERT INTO agency_scheduled_announcements
       (agency_id, created_by_user_id, title, message, display_type, recipient_user_ids, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, userId, title, message, displayType, JSON.stringify(recipientUserIds), startsAt, endsAt]
    );

    const id = result?.insertId ? Number(result.insertId) : null;
    res.status(201).json({
      announcement: {
        id,
        agency_id: agencyId,
        title,
        message,
        display_type: displayType,
        recipient_user_ids: recipientUserIds,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by_user_id: userId
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Update a scheduled announcement.
 * PUT /api/agencies/:id/announcements/:announcementId
 */
export const updateAgencyScheduledAnnouncement = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const announcementId = parseAgencyId(req.params.announcementId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!announcementId) return res.status(400).json({ error: { message: 'Invalid announcement id' } });

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    const displayType = parseAnnouncementDisplayType(req.body?.displayType || req.body?.display_type);
    const recipientUserIds = parseRecipientUserIds(req.body?.recipientUserIds || req.body?.recipient_user_ids);
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
    const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
    if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

    const startsAt = new Date(startsAtRaw);
    const endsAt = new Date(endsAtRaw);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
    }

    const durationDays = (endsAt.getTime() - startsAt.getTime()) / MS_DAY;
    if (durationDays > 14.0001) {
      return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
    }

    const maxStart = Date.now() + 364 * MS_DAY;
    if (startsAt.getTime() > maxStart) {
      return res.status(400).json({ error: { message: 'Announcements can only be scheduled up to 364 days out' } });
    }

    const [result] = await pool.execute(
      `UPDATE agency_scheduled_announcements
       SET
         title = ?,
         message = ?,
         display_type = ?,
         recipient_user_ids = ?,
         starts_at = ?,
         ends_at = ?
       WHERE id = ? AND agency_id = ?`,
      [
        title,
        message,
        displayType,
        JSON.stringify(recipientUserIds),
        startsAt,
        endsAt,
        announcementId,
        agencyId
      ]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Announcement not found' } });
    }

    res.json({
      announcement: {
        id: announcementId,
        agency_id: agencyId,
        title,
        message,
        display_type: displayType,
        recipient_user_ids: recipientUserIds,
        starts_at: startsAt,
        ends_at: endsAt
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Delete a scheduled announcement.
 * DELETE /api/agencies/:id/announcements/:announcementId
 */
export const deleteAgencyScheduledAnnouncement = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const announcementId = parseAgencyId(req.params.announcementId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!announcementId) return res.status(400).json({ error: { message: 'Invalid announcement id' } });

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const [result] = await pool.execute(
      `DELETE FROM agency_scheduled_announcements WHERE id = ? AND agency_id = ?`,
      [announcementId, agencyId]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Announcement not found' } });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};