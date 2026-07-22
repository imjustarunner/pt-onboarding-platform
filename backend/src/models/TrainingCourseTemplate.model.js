import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  const payload = parseJson(row.payload_json, {});
  return {
    id: row.id,
    agencyId: row.agency_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    formatLabel: row.format_label,
    estimatedMinutes: row.estimated_minutes,
    lessonCount: row.lesson_count,
    payload,
    tags: parseJson(row.tags_json, []),
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class TrainingCourseTemplate {
  static async findAll({ agencyId = null, includeInactive = false } = {}) {
    const params = [];
    let sql = `SELECT * FROM training_course_templates WHERE 1=1`;
    if (!includeInactive) sql += ' AND is_active = 1';
    if (agencyId != null && agencyId !== '' && agencyId !== 'null') {
      sql += ' AND (agency_id IS NULL OR agency_id = ?)';
      params.push(Number(agencyId));
    } else {
      sql += ' AND agency_id IS NULL';
    }
    sql += ' ORDER BY sort_order ASC, title ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapRow);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM training_course_templates WHERE id = ? LIMIT 1',
      [id]
    );
    return mapRow(rows[0]);
  }

  static async findBySlug(slug, agencyId = null) {
    const [rows] = await pool.execute(
      `SELECT * FROM training_course_templates
       WHERE slug = ? AND (agency_id IS NULL OR agency_id <=> ?)
       ORDER BY agency_id DESC
       LIMIT 1`,
      [slug, agencyId]
    );
    return mapRow(rows[0]);
  }

  static async upsertPlatform(template) {
    const lessons = template.lessons || [];
    const payload = { lessons };
    const [existing] = await pool.execute(
      `SELECT id FROM training_course_templates WHERE slug = ? AND agency_id IS NULL LIMIT 1`,
      [template.slug]
    );
    if (existing[0]) {
      await pool.execute(
        `UPDATE training_course_templates
         SET title = ?, description = ?, category = ?, format_label = ?,
             estimated_minutes = ?, lesson_count = ?, payload_json = ?, tags_json = ?,
             is_active = 1, sort_order = ?
         WHERE id = ?`,
        [
          template.title,
          template.description || null,
          template.category || null,
          template.formatLabel || null,
          template.estimatedMinutes ?? null,
          lessons.length || 1,
          JSON.stringify(payload),
          JSON.stringify(template.tags || []),
          template.sortOrder ?? 0,
          existing[0].id
        ]
      );
      return this.findById(existing[0].id);
    }
    const [result] = await pool.execute(
      `INSERT INTO training_course_templates
        (agency_id, slug, title, description, category, format_label, estimated_minutes,
         lesson_count, payload_json, tags_json, is_active, sort_order)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        template.slug,
        template.title,
        template.description || null,
        template.category || null,
        template.formatLabel || null,
        template.estimatedMinutes ?? null,
        lessons.length || 1,
        JSON.stringify(payload),
        JSON.stringify(template.tags || []),
        template.sortOrder ?? 0
      ]
    );
    return this.findById(result.insertId);
  }

  static async countPlatform() {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM training_course_templates WHERE agency_id IS NULL`
    );
    return Number(rows[0]?.c || 0);
  }
}

export default TrainingCourseTemplate;
