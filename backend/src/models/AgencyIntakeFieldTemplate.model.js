import pool from '../config/database.js';

/**
 * Default a question's `category` from common signals on the question itself.
 * This is the persistence-side fallback for templates that were saved before
 * the Phase 3 category field landed. The frontend now also stamps a category
 * on save, so templates created going forward will carry the value already.
 *
 * Allowed values: 'demographic' | 'clinical' | 'consent' | 'profile' | 'guardian' | 'other'
 */
function defaultCategoryForTemplateField(field, templateType) {
  if (field?.category) return field.category;
  const tt = String(templateType || '').toLowerCase();
  if (tt === 'demographics' || tt === 'demographics_template') return 'demographic';
  if (tt === 'clinical' || tt === 'clinical_template') return 'clinical';
  if (tt === 'consent' || tt === 'document') return 'consent';
  const scope = String(field?.scope || '').toLowerCase();
  if (scope === 'clinical') return 'clinical';
  if (scope === 'guardian') return 'guardian';
  if (scope === 'profile') return 'profile';
  // Heuristic key/label sniff
  const haystack = `${field?.key || ''} ${field?.label || ''}`.toLowerCase();
  if (/^psc[_-]?\d/.test(field?.key || '')) return 'clinical';
  if (/dob|birth|gender|ethnicity|address|zip|city|state|grade|school|phone/.test(haystack)) return 'demographic';
  if (/guardian|parent|emergency contact/.test(haystack)) return 'guardian';
  return 'other';
}

function applyCategoryDefaults(fieldsJson, templateType) {
  if (!Array.isArray(fieldsJson)) return fieldsJson;
  return fieldsJson.map((f) => {
    if (!f || typeof f !== 'object') return f;
    if (f.category) return f;
    return { ...f, category: defaultCategoryForTemplateField(f, templateType) };
  });
}

class AgencyIntakeFieldTemplate {
  static async create({ agencyId, name, fieldsJson, isActive = true, templateType = 'field_template' }) {
    const stamped = applyCategoryDefaults(fieldsJson || [], templateType);
    const [result] = await pool.execute(
      `INSERT INTO agency_intake_field_templates
       (agency_id, name, template_type, fields_json, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, name, templateType, JSON.stringify(stamped), isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM agency_intake_field_templates WHERE id = ? LIMIT 1',
      [id]
    );
    return this.normalize(rows[0] || null);
  }

  static async listByAgency(agencyId, templateType = null) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_intake_field_templates
       WHERE agency_id = ?${templateType ? ' AND template_type = ?' : ''}
       ORDER BY updated_at DESC, id DESC`,
      templateType ? [agencyId, templateType] : [agencyId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async update(id, { name, fieldsJson, isActive }) {
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (fieldsJson !== undefined) {
      // Look up the existing template_type so we can default categories
      // correctly when the caller didn't include them explicitly.
      let templateType = null;
      try {
        const [tRows] = await pool.execute(
          'SELECT template_type FROM agency_intake_field_templates WHERE id = ? LIMIT 1',
          [id]
        );
        templateType = tRows?.[0]?.template_type || null;
      } catch { /* best-effort */ }
      const stamped = applyCategoryDefaults(fieldsJson, templateType);
      fields.push('fields_json = ?');
      values.push(JSON.stringify(stamped));
    }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE agency_intake_field_templates SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.execute('DELETE FROM agency_intake_field_templates WHERE id = ?', [id]);
  }

  static normalize(row) {
    if (!row) return null;
    let fields = [];
    try {
      fields = typeof row.fields_json === 'string' ? JSON.parse(row.fields_json) : row.fields_json;
    } catch {
      fields = [];
    }
    return { ...row, fields_json: fields };
  }
}

export default AgencyIntakeFieldTemplate;
