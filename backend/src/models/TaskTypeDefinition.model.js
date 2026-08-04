import pool from '../config/database.js';

const DEFAULT_ICONS = ['circle', 'star', 'briefcase', 'file-text', 'heart', 'phone'];

function parseIcons(raw) {
  if (!raw) return DEFAULT_ICONS;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_ICONS;
  } catch {
    return DEFAULT_ICONS;
  }
}

class TaskTypeDefinition {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      agency_id: r.agency_id,
      slug: r.slug,
      label: r.label,
      color_hex: r.color_hex,
      icon_key: r.preferred_icon_key || r.icon_key,
      default_icon_key: r.icon_key,
      icon_choices: parseIcons(r.icon_choices_json),
      system_task_type: r.system_task_type,
      sort_order: r.sort_order,
      is_active: !!r.is_active,
      is_hidden: r.is_hidden != null ? !!r.is_hidden : false,
      preferred_icon_key: r.preferred_icon_key || null
    };
  }

  static async listForUser(userId, agencyId = null) {
    const aid = agencyId != null ? parseInt(agencyId, 10) : null;
    const [rows] = await pool.execute(
      `SELECT ttd.*,
              utp.is_hidden,
              utp.preferred_icon_key,
              utp.sort_order AS user_sort_order
       FROM task_type_definitions ttd
       LEFT JOIN user_task_type_prefs utp
         ON utp.task_type_definition_id = ttd.id AND utp.user_id = ?
       WHERE ttd.is_active = 1
         AND (ttd.agency_id IS NULL ${aid ? 'OR ttd.agency_id = ?' : ''})
       ORDER BY COALESCE(utp.sort_order, ttd.sort_order) ASC, ttd.label ASC`,
      aid ? [userId, aid] : [userId]
    );
    // Agency overrides win over platform for same slug
    const bySlug = new Map();
    for (const r of rows || []) {
      const existing = bySlug.get(r.slug);
      if (!existing || (r.agency_id && !existing.agency_id)) {
        bySlug.set(r.slug, r);
      }
    }
    return [...bySlug.values()]
      .filter((r) => !r.is_hidden)
      .map((r) => this.mapRow(r));
  }

  static async listAllForAgency(agencyId) {
    const aid = parseInt(agencyId, 10);
    const [rows] = await pool.execute(
      `SELECT * FROM task_type_definitions
       WHERE is_active = 1 AND (agency_id IS NULL OR agency_id = ?)
       ORDER BY sort_order ASC, label ASC`,
      [aid]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async create({ agencyId = null, slug, label, colorHex, iconKey, iconChoices, systemTaskType, sortOrder, createdByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO task_type_definitions
        (agency_id, slug, label, color_hex, icon_key, icon_choices_json, system_task_type, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        String(slug || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
        String(label || '').trim(),
        colorHex || '#64748b',
        iconKey || 'circle',
        JSON.stringify(iconChoices || DEFAULT_ICONS),
        systemTaskType || null,
        sortOrder ?? 200,
        createdByUserId || null
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM task_type_definitions WHERE id = ?', [result.insertId]);
    return this.mapRow(rows[0]);
  }

  static async update(id, { label, colorHex, iconKey, iconChoices, sortOrder, isActive }) {
    const fields = [];
    const params = [];
    if (label !== undefined) { fields.push('label = ?'); params.push(String(label).trim()); }
    if (colorHex !== undefined) { fields.push('color_hex = ?'); params.push(colorHex); }
    if (iconKey !== undefined) { fields.push('icon_key = ?'); params.push(iconKey); }
    if (iconChoices !== undefined) { fields.push('icon_choices_json = ?'); params.push(JSON.stringify(iconChoices)); }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(sortOrder); }
    if (isActive !== undefined) { fields.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    if (!fields.length) {
      const [rows] = await pool.execute('SELECT * FROM task_type_definitions WHERE id = ?', [id]);
      return this.mapRow(rows[0]);
    }
    params.push(id);
    await pool.execute(`UPDATE task_type_definitions SET ${fields.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.execute('SELECT * FROM task_type_definitions WHERE id = ?', [id]);
    return this.mapRow(rows[0]);
  }

  static async setUserPref(userId, definitionId, { isHidden, preferredIconKey, sortOrder }) {
    await pool.execute(
      `INSERT INTO user_task_type_prefs (user_id, task_type_definition_id, is_hidden, preferred_icon_key, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_hidden = VALUES(is_hidden),
         preferred_icon_key = COALESCE(VALUES(preferred_icon_key), preferred_icon_key),
         sort_order = COALESCE(VALUES(sort_order), sort_order)`,
      [
        userId,
        definitionId,
        isHidden ? 1 : 0,
        preferredIconKey || null,
        sortOrder ?? null
      ]
    );
  }
}

export default TaskTypeDefinition;
