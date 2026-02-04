import pool from '../config/database.js';

class IntakeLink {
  static async create(data) {
    const {
      publicKey,
      title = null,
      description = null,
      scopeType = 'agency',
      organizationId = null,
      programId = null,
      isActive = true,
      createClient = true,
      createGuardian = false,
      allowedDocumentTemplateIds = null,
      intakeFields = null,
      intakeSteps = null,
      createdByUserId = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO intake_links
       (public_key, title, description, scope_type, organization_id, program_id, is_active,
        create_client, create_guardian, allowed_document_template_ids, intake_fields, intake_steps, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        publicKey,
        title,
        description,
        scopeType,
        organizationId,
        programId,
        isActive ? 1 : 0,
        createClient ? 1 : 0,
        createGuardian ? 1 : 0,
        allowedDocumentTemplateIds ? JSON.stringify(allowedDocumentTemplateIds) : null,
        intakeFields ? JSON.stringify(intakeFields) : null,
        intakeSteps ? JSON.stringify(intakeSteps) : null,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_links WHERE id = ? LIMIT 1',
      [id]
    );
    return this.normalize(rows[0] || null);
  }

  static async findByPublicKey(publicKey) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_links WHERE public_key = ? LIMIT 1',
      [publicKey]
    );
    return this.normalize(rows[0] || null);
  }

  static async findByScope({ scopeType, organizationId = null, programId = null }) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_links
       WHERE scope_type = ?
         AND (organization_id = ? OR (organization_id IS NULL AND ? IS NULL))
         AND (program_id = ? OR (program_id IS NULL AND ? IS NULL))
       ORDER BY updated_at DESC, id DESC`,
      [scopeType, organizationId, organizationId, programId, programId]
    );
    return rows.map(row => this.normalize(row));
  }

  static normalize(row) {
    if (!row) return null;
    let allowed = null;
    if (row.allowed_document_template_ids) {
      try {
        allowed = typeof row.allowed_document_template_ids === 'string'
          ? JSON.parse(row.allowed_document_template_ids)
          : row.allowed_document_template_ids;
      } catch {
        allowed = null;
      }
    }
    let intakeFields = null;
    if (row.intake_fields) {
      try {
        intakeFields = typeof row.intake_fields === 'string'
          ? JSON.parse(row.intake_fields)
          : row.intake_fields;
      } catch {
        intakeFields = null;
      }
    }
    let intakeSteps = null;
    if (row.intake_steps) {
      try {
        intakeSteps = typeof row.intake_steps === 'string'
          ? JSON.parse(row.intake_steps)
          : row.intake_steps;
      } catch {
        intakeSteps = null;
      }
    }
    return { ...row, allowed_document_template_ids: allowed, intake_fields: intakeFields, intake_steps: intakeSteps };
  }
}

export default IntakeLink;
