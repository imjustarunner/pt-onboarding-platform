import pool from '../config/database.js';

class IntakeLink {
  static async create(data) {
    const {
      publicKey,
      title = null,
      description = null,
      languageCode = 'en',
      scopeType = 'agency',
      formType = 'intake',
      organizationId = null,
      programId = null,
      learningClassId = null,
      companyEventId = null,
      jobDescriptionId = null,
      isActive = true,
      createClient = true,
      createGuardian = false,
      requiresAssignment = true,
      allowedDocumentTemplateIds = null,
      intakeFields = null,
      intakeSteps = null,
      retentionPolicy = null,
      customMessages = null,
      linkedEsFormId = null,
      documentTranslationMap = null,
      createdByUserId = null,
      inheritsSchoolMaster = false,
      isSchoolMaster = false,
      inheritsOfficeMaster = false,
      isOfficeMaster = false,
      masterChannel = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO intake_links
       (public_key, title, description, language_code, linked_es_form_id, document_translation_map, scope_type, form_type, organization_id, program_id, learning_class_id, company_event_id, job_description_id, is_active,
        create_client, create_guardian, requires_assignment, allowed_document_template_ids, intake_fields, intake_steps, retention_policy_json, custom_messages, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        publicKey,
        title,
        description,
        languageCode,
        linkedEsFormId ?? null,
        documentTranslationMap ? JSON.stringify(documentTranslationMap) : null,
        scopeType,
        formType,
        organizationId,
        programId,
        learningClassId,
        companyEventId,
        jobDescriptionId,
        isActive ? 1 : 0,
        createClient ? 1 : 0,
        createGuardian ? 1 : 0,
        requiresAssignment ? 1 : 0,
        allowedDocumentTemplateIds ? JSON.stringify(allowedDocumentTemplateIds) : null,
        intakeFields ? JSON.stringify(intakeFields) : null,
        intakeSteps ? JSON.stringify(intakeSteps) : null,
        retentionPolicy ? JSON.stringify(retentionPolicy) : null,
        customMessages ? JSON.stringify(customMessages) : null,
        createdByUserId
      ]
    );
    const newId = result.insertId;
    if (inheritsSchoolMaster || isSchoolMaster) {
      try {
        await pool.execute(
          `UPDATE intake_links
           SET inherits_school_master = ?, is_school_master = ?
           WHERE id = ?`,
          [inheritsSchoolMaster ? 1 : 0, isSchoolMaster ? 1 : 0, newId]
        );
      } catch {
        // columns may not exist yet
      }
    }
    if (inheritsOfficeMaster || isOfficeMaster || masterChannel) {
      try {
        await pool.execute(
          `UPDATE intake_links
           SET inherits_office_master = ?, is_office_master = ?, master_channel = ?
           WHERE id = ?`,
          [
            inheritsOfficeMaster ? 1 : 0,
            isOfficeMaster ? 1 : 0,
            masterChannel || null,
            newId
          ]
        );
      } catch {
        // columns may not exist yet
      }
    }
    return this.findById(newId);
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

  /**
   * Sort on id/updated_at only — SELECT * … ORDER BY on wide JSON rows can exhaust
   * MySQL sort_buffer_size (ER_OUT_OF_SORTMEMORY).
   */
  static async findOrderedIds({ whereSql = '', params = [] } = {}) {
    const where = String(whereSql || '').trim();
    const clause = where
      ? (where.toUpperCase().startsWith('WHERE') ? where : `WHERE ${where}`)
      : '';
    const [rows] = await pool.execute(
      `SELECT id FROM intake_links ${clause} ORDER BY updated_at DESC, id DESC`,
      params
    );
    return (rows || []).map((row) => row.id);
  }

  static async fetchByOrderedIds(ids) {
    const list = (Array.isArray(ids) ? ids : []).filter((id) => id != null);
    if (!list.length) return [];
    const placeholders = list.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM intake_links WHERE id IN (${placeholders})`,
      list
    );
    const byId = new Map((rows || []).map((row) => [row.id, row]));
    return list.map((id) => this.normalize(byId.get(id))).filter(Boolean);
  }

  static async findAllOrdered() {
    const ids = await this.findOrderedIds();
    return this.fetchByOrderedIds(ids);
  }

  static async findByCompanyEventId(companyEventId) {
    const ids = await this.findOrderedIds({
      whereSql: 'WHERE company_event_id = ?',
      params: [companyEventId]
    });
    return this.fetchByOrderedIds(ids);
  }

  static async findByScope({ scopeType, organizationId = null, programId = null, learningClassId = null }) {
    const ids = await this.findOrderedIds({
      whereSql: `WHERE scope_type = ?
         AND (organization_id = ? OR (organization_id IS NULL AND ? IS NULL))
         AND (program_id = ? OR (program_id IS NULL AND ? IS NULL))
         AND (learning_class_id = ? OR (learning_class_id IS NULL AND ? IS NULL))`,
      params: [
        scopeType,
        organizationId,
        organizationId,
        programId,
        programId,
        learningClassId,
        learningClassId
      ]
    });
    return this.fetchByOrderedIds(ids);
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
    let retentionPolicy = null;
    if (row.retention_policy_json) {
      try {
        retentionPolicy = typeof row.retention_policy_json === 'string'
          ? JSON.parse(row.retention_policy_json)
          : row.retention_policy_json;
      } catch {
        retentionPolicy = null;
      }
    }
    let customMessages = null;
    if (row.custom_messages) {
      try {
        customMessages = typeof row.custom_messages === 'string'
          ? JSON.parse(row.custom_messages)
          : row.custom_messages;
      } catch {
        customMessages = null;
      }
    }
    let documentTranslationMap = null;
    if (row.document_translation_map) {
      try {
        documentTranslationMap = typeof row.document_translation_map === 'string'
          ? JSON.parse(row.document_translation_map)
          : row.document_translation_map;
      } catch {
        documentTranslationMap = null;
      }
    }
    return {
      ...row,
      language_code: row.language_code || 'en',
      form_type: row.form_type || 'intake',
      inherits_school_master: Number(row.inherits_school_master || 0) === 1 ? 1 : 0,
      is_school_master: Number(row.is_school_master || 0) === 1 ? 1 : 0,
      inherits_office_master: Number(row.inherits_office_master || 0) === 1 ? 1 : 0,
      is_office_master: Number(row.is_office_master || 0) === 1 ? 1 : 0,
      master_channel: row.master_channel || null,
      linked_es_form_id: row.linked_es_form_id ?? null,
      document_translation_map: documentTranslationMap,
      allowed_document_template_ids: allowed,
      intake_fields: intakeFields,
      intake_steps: intakeSteps,
      retention_policy_json: retentionPolicy,
      custom_messages: customMessages
    };
  }
}

export default IntakeLink;
