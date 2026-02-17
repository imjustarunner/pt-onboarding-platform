import pool from '../config/database.js';

/**
 * Client Model
 * 
 * Manages client records with permission-based filtering:
 * - Agency users: Full access to all fields
 * - School users: Restricted access (no sensitive data)
 */
class Client {
  static normalizePhone(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    // Keep + if present, otherwise strip to digits and assume US if 10 digits.
    if (str.startsWith('+')) {
      return '+' + str.slice(1).replace(/[^\d]/g, '');
    }
    const digits = str.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
  }

  static async findByContactPhone(contactPhone) {
    const normalized = this.normalizePhone(contactPhone);
    if (!normalized) return null;
    const [rows] = await pool.execute(
      'SELECT * FROM clients WHERE contact_phone = ? LIMIT 1',
      [normalized]
    );
    return rows[0] || null;
  }

  /**
   * Create a new client record
   * @param {Object} clientData - Client data
   * @param {number} clientData.organization_id - School organization ID
   * @param {number} clientData.agency_id - Agency organization ID
   * @param {number|null} clientData.provider_id - Assigned provider ID (nullable)
   * @param {string} clientData.initials - Client initials
   * @param {string} clientData.status - Client status
   * @param {Date|string} clientData.submission_date - Submission date
   * @param {string} clientData.document_status - Document status
   * @param {string} clientData.source - Source of client creation
   * @param {number} clientData.created_by_user_id - User who created the client
   * @returns {Promise<Object>} Created client object
   */
  static async create(clientData) {
    const {
      organization_id,
      agency_id,
      provider_id,
      initials,
      full_name,
      contact_phone,
      status = 'PENDING_REVIEW',
      submission_date,
      document_status = 'NONE',
      source,
      created_by_user_id,
      referral_date,
      client_status_id,
      paperwork_status_id,
      insurance_type_id,
      paperwork_delivery_method_id,
      doc_date,
      roi_expires_at,
      grade,
      gender,
      identifier_code,
      primary_client_language,
      primary_parent_language,
      skills,
      internal_notes,
      service_day,
      paperwork_received_at,
      cleared_to_start,
      client_type = 'basic_nonclinical',
      client_type_transitioned_at = null,
      client_type_transitioned_by_user_id = null
    } = clientData;

    // Build insert dynamically so older DBs won't break if a column doesn't exist yet.
    const fields = [
      'organization_id',
      'agency_id',
      'provider_id',
      'initials',
      'contact_phone',
      'status',
      'submission_date',
      'document_status',
      'source',
      'created_by_user_id'
    ];
    const values = [
      organization_id,
      agency_id,
      provider_id || null,
      initials,
      contact_phone ? this.normalizePhone(contact_phone) : null,
      status,
      submission_date,
      document_status,
      source,
      created_by_user_id || null
    ];

    const optional = [
      ['full_name', full_name],
      ['referral_date', referral_date],
      ['client_status_id', client_status_id],
      ['paperwork_status_id', paperwork_status_id],
      ['insurance_type_id', insurance_type_id],
      ['paperwork_delivery_method_id', paperwork_delivery_method_id],
      ['doc_date', doc_date],
      ['roi_expires_at', roi_expires_at],
      ['grade', grade],
      ['school_year', clientData.school_year],
      ['gender', gender],
      ['identifier_code', identifier_code],
      ['primary_client_language', primary_client_language],
      ['primary_parent_language', primary_parent_language],
      ['skills', skills !== undefined ? (skills ? 1 : 0) : undefined],
      ['guardian_portal_enabled', clientData.guardian_portal_enabled !== undefined ? (clientData.guardian_portal_enabled ? 1 : 0) : undefined],
      ['internal_notes', internal_notes],
      ['service_day', service_day],
      ['paperwork_received_at', paperwork_received_at],
      ['cleared_to_start', cleared_to_start !== undefined ? (cleared_to_start ? 1 : 0) : undefined],
      ['client_type', client_type],
      ['client_type_transitioned_at', client_type_transitioned_at],
      ['client_type_transitioned_by_user_id', client_type_transitioned_by_user_id]
    ];

    for (const [col, val] of optional) {
      if (val !== undefined) {
        fields.push(col);
        values.push(val);
      }
    }

    const placeholders = fields.map(() => '?').join(', ');
    const query = `INSERT INTO clients (${fields.join(', ')}) VALUES (${placeholders})`;

    const [result] = await pool.execute(query, values);
    return this.findById(result.insertId);
  }

  /**
   * Find client by ID with optional sensitive data filtering
   * @param {number} id - Client ID
   * @param {Object} options - Query options
   * @param {boolean} options.includeSensitive - Include sensitive fields (default: true for agency users)
   * @returns {Promise<Object|null>} Client object or null
   */
  static async findById(id, options = {}) {
    const { includeSensitive = true } = options;

    // Best-effort: if per-client checklist exists, include a needed-count for UI summary.
    let hasChecklist = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [t] = await pool.execute(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
        [dbName]
      );
      hasChecklist = (t || []).length > 0;
    } catch {
      hasChecklist = false;
    }

    let query = `
      SELECT 
        c.*,
        org.name as organization_name,
        org.slug as organization_slug,
        org.organization_type as organization_type,
        org.feature_flags as organization_feature_flags,
        provider.first_name as provider_first_name,
        provider.last_name as provider_last_name,
        cs.label as client_status_label,
        cs.status_key as client_status_key,
        ps.label as paperwork_status_label,
        ps.status_key as paperwork_status_key,
        it.label as insurance_type_label,
        it.insurance_key as insurance_type_key,
        pdm.label as paperwork_delivery_method_label,
        pdm.method_key as paperwork_delivery_method_key,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
        ${hasChecklist ? `,
        (
          SELECT COUNT(*)
          FROM client_paperwork_items cpi
          WHERE cpi.client_id = c.id
            AND cpi.is_needed = 1
        ) AS paperwork_needed_count` : ''}
      FROM clients c
      LEFT JOIN agencies org ON c.organization_id = org.id
      LEFT JOIN users provider ON c.provider_id = provider.id
      LEFT JOIN client_statuses cs ON c.client_status_id = cs.id
      LEFT JOIN paperwork_statuses ps ON c.paperwork_status_id = ps.id
      LEFT JOIN insurance_types it ON c.insurance_type_id = it.id
      LEFT JOIN paperwork_delivery_methods pdm ON c.paperwork_delivery_method_id = pdm.id
      LEFT JOIN users creator ON c.created_by_user_id = creator.id
      WHERE c.id = ?
    `;

    const [rows] = await pool.execute(query, [id]);
    if (rows.length === 0) return null;

    const client = rows[0];
    
    // Format provider name
    if (client.provider_first_name && client.provider_last_name) {
      client.provider_name = `${client.provider_first_name} ${client.provider_last_name}`;
    } else {
      client.provider_name = null;
    }

    // Format created by name
    if (client.created_by_first_name && client.created_by_last_name) {
      client.created_by_name = `${client.created_by_first_name} ${client.created_by_last_name}`;
    } else {
      client.created_by_name = null;
    }

    return client;
  }

  /**
   * Find all clients with filtering options
   * @param {Object} options - Query options
   * @param {number} options.agency_id - Filter by agency ID
   * @param {number} options.organization_id - Filter by organization (school) ID
   * @param {number} options.provider_id - Filter by provider ID
   * @param {string} options.status - Filter by status
   * @param {string} options.search - Search by initials
   * @param {boolean} options.includeSensitive - Include sensitive fields (default: true)
   * @returns {Promise<Array>} Array of client objects
   */
  static async findAll(options = {}) {
    const {
      agency_id,
      organization_id,
      provider_id,
      status,
      search,
      client_status_id,
      paperwork_status_id,
      insurance_type_id,
      skills,
      includeSensitive = true
    } = options;

    const values = [];
    const useOrgAssignments = !!organization_id;

    // Best-effort: if per-client checklist exists, include a needed-count for UI summary.
    let hasChecklist = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [t] = await pool.execute(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
        [dbName]
      );
      hasChecklist = (t || []).length > 0;
    } catch {
      hasChecklist = false;
    }

    let query = `
      SELECT 
        c.*,
        ${useOrgAssignments ? 'COALESCE(orgf.name, org.name) as organization_name,' : 'org.name as organization_name,'}
        ${useOrgAssignments ? 'COALESCE(orgf.slug, org.slug) as organization_slug,' : 'org.slug as organization_slug,'}
        provider.first_name as provider_first_name,
        provider.last_name as provider_last_name,
        cs.label as client_status_label,
        cs.status_key as client_status_key,
        ps.label as paperwork_status_label,
        ps.status_key as paperwork_status_key,
        it.label as insurance_type_label,
        it.insurance_key as insurance_type_key,
        pdm.label as paperwork_delivery_method_label,
        pdm.method_key as paperwork_delivery_method_key
        ${hasChecklist ? `,
        (
          SELECT COUNT(*)
          FROM client_paperwork_items cpi
          WHERE cpi.client_id = c.id
            AND cpi.is_needed = 1
        ) AS paperwork_needed_count` : ''}
      FROM clients c
    `;

    if (useOrgAssignments) {
      query += `
        JOIN client_organization_assignments coa
          ON coa.client_id = c.id
         AND coa.organization_id = ?
         AND coa.is_active = TRUE
        LEFT JOIN agencies orgf ON orgf.id = coa.organization_id
      `;
      values.push(organization_id);
    }

    query += `
      LEFT JOIN agencies org ON c.organization_id = org.id
      LEFT JOIN users provider ON c.provider_id = provider.id
      LEFT JOIN client_statuses cs ON c.client_status_id = cs.id
      LEFT JOIN paperwork_statuses ps ON c.paperwork_status_id = ps.id
      LEFT JOIN insurance_types it ON c.insurance_type_id = it.id
      LEFT JOIN paperwork_delivery_methods pdm ON c.paperwork_delivery_method_id = pdm.id
      WHERE 1=1
    `;

    if (agency_id) {
      query += ' AND c.agency_id = ?';
      values.push(agency_id);
    }

    if (provider_id) {
      query += ' AND c.provider_id = ?';
      values.push(provider_id);
    }

    if (status) {
      query += ' AND c.status = ?';
      values.push(status);
    }

    if (search) {
      query += ' AND c.initials LIKE ?';
      values.push(`%${search}%`);
    }

    if (client_status_id) {
      query += ' AND c.client_status_id = ?';
      values.push(client_status_id);
    }
    if (paperwork_status_id) {
      query += ' AND c.paperwork_status_id = ?';
      values.push(paperwork_status_id);
    }
    if (insurance_type_id) {
      query += ' AND c.insurance_type_id = ?';
      values.push(insurance_type_id);
    }
    if (skills !== undefined) {
      query += ' AND c.skills = ?';
      values.push(skills ? 1 : 0);
    }

    query += ' ORDER BY c.submission_date DESC, c.created_at DESC';

    let rows = [];
    try {
      const [r] = await pool.execute(query, values);
      rows = r || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing || !useOrgAssignments) throw e;

      // Legacy fallback: filter by clients.organization_id.
      const legacyValues = [];
      let legacyQuery = `
        SELECT 
          c.*,
          org.name as organization_name,
          org.slug as organization_slug,
          provider.first_name as provider_first_name,
          provider.last_name as provider_last_name,
          cs.label as client_status_label,
          cs.status_key as client_status_key,
          ps.label as paperwork_status_label,
          ps.status_key as paperwork_status_key,
          it.label as insurance_type_label,
          it.insurance_key as insurance_type_key,
          pdm.label as paperwork_delivery_method_label,
          pdm.method_key as paperwork_delivery_method_key
        FROM clients c
        LEFT JOIN agencies org ON c.organization_id = org.id
        LEFT JOIN users provider ON c.provider_id = provider.id
        LEFT JOIN client_statuses cs ON c.client_status_id = cs.id
        LEFT JOIN paperwork_statuses ps ON c.paperwork_status_id = ps.id
        LEFT JOIN insurance_types it ON c.insurance_type_id = it.id
        LEFT JOIN paperwork_delivery_methods pdm ON c.paperwork_delivery_method_id = pdm.id
        WHERE 1=1
      `;

      if (agency_id) {
        legacyQuery += ' AND c.agency_id = ?';
        legacyValues.push(agency_id);
      }
      legacyQuery += ' AND c.organization_id = ?';
      legacyValues.push(organization_id);
      if (provider_id) {
        legacyQuery += ' AND c.provider_id = ?';
        legacyValues.push(provider_id);
      }
      if (status) {
        legacyQuery += ' AND c.status = ?';
        legacyValues.push(status);
      }
      if (search) {
        legacyQuery += ' AND c.initials LIKE ?';
        legacyValues.push(`%${search}%`);
      }
      if (client_status_id) {
        legacyQuery += ' AND c.client_status_id = ?';
        legacyValues.push(client_status_id);
      }
      if (paperwork_status_id) {
        legacyQuery += ' AND c.paperwork_status_id = ?';
        legacyValues.push(paperwork_status_id);
      }
      if (insurance_type_id) {
        legacyQuery += ' AND c.insurance_type_id = ?';
        legacyValues.push(insurance_type_id);
      }
      legacyQuery += ' ORDER BY c.submission_date DESC, c.created_at DESC';

      const [r2] = await pool.execute(legacyQuery, legacyValues);
      rows = r2 || [];
    }

    // Format provider names
    return rows.map(row => {
      if (row.provider_first_name && row.provider_last_name) {
        row.provider_name = `${row.provider_first_name} ${row.provider_last_name}`;
      } else {
        row.provider_name = null;
      }
      return row;
    });
  }

  /**
   * Update client record
   * @param {number} id - Client ID
   * @param {Object} clientData - Updated client data
   * @param {number} updated_by_user_id - User making the update
   * @returns {Promise<Object|null>} Updated client object or null
   */
  static async update(id, clientData, updated_by_user_id = null) {
    const updates = [];
    const values = [];

    const allowedFields = [
      'organization_id',
      'agency_id',
      'provider_id',
      'initials',
      'full_name',
      'status',
      'submission_date',
      'document_status',
      'guardian_portal_enabled',
      'source',
      'referral_date',
      'client_status_id',
      'paperwork_status_id',
      'insurance_type_id',
      'paperwork_delivery_method_id',
      'doc_date',
      'roi_expires_at',
      'grade',
      'school_year',
      'gender',
      'identifier_code',
      'primary_client_language',
      'primary_parent_language',
      'skills',
      'internal_notes',
      'service_day',
      'paperwork_received_at',
      'cleared_to_start',
      'client_type',
      'client_type_transitioned_at',
      'client_type_transitioned_by_user_id'
    ];

    for (const field of allowedFields) {
      if (clientData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(clientData[field]);
      }
    }

    if (updated_by_user_id !== undefined) {
      updates.push('updated_by_user_id = ?');
      values.push(updated_by_user_id);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('last_activity_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`;
    await pool.execute(query, values);

    return this.findById(id);
  }

  /**
   * Find clients by organization ID (school-scoped, excludes sensitive fields)
   * @param {number} organizationId - School organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of client objects (restricted view)
   */
  static async findByOrganizationId(organizationId, options = {}) {
    return this.findAll({
      ...options,
      organization_id: organizationId,
      includeSensitive: false
    });
  }

  /**
   * Find clients by agency ID (agency-scoped, includes all fields)
   * @param {number} agencyId - Agency organization ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of client objects (full view)
   */
  static async findByAgencyId(agencyId, options = {}) {
    return this.findAll({
      ...options,
      agency_id: agencyId,
      includeSensitive: true
    });
  }

  /**
   * Find clients by provider ID
   * @param {number} providerId - Provider user ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of client objects
   */
  static async findByProviderId(providerId, options = {}) {
    return this.findAll({
      ...options,
      provider_id: providerId
    });
  }

  /**
   * Update client status with history logging
   * @param {number} clientId - Client ID
   * @param {string} newStatus - New status value
   * @param {number} changedByUserId - User making the change
   * @param {string|null} note - Optional note explaining the change
   * @returns {Promise<Object>} Updated client object
   */
  static async updateStatus(clientId, newStatus, changedByUserId, note = null) {
    // Get current client to get old status
    const currentClient = await this.findById(clientId);
    if (!currentClient) {
      throw new Error('Client not found');
    }

    const oldStatus = currentClient.status;

    // Update client status
    await this.update(clientId, { status: newStatus }, changedByUserId);

    // Log to history
    const ClientStatusHistory = (await import('./ClientStatusHistory.model.js')).default;
    await ClientStatusHistory.create({
      client_id: clientId,
      changed_by_user_id: changedByUserId,
      field_changed: 'status',
      from_value: oldStatus,
      to_value: newStatus,
      note: note
    });

    return this.findById(clientId);
  }

  /**
   * Assign provider to client with history logging
   * @param {number} clientId - Client ID
   * @param {number|null} providerId - Provider user ID (null to unassign)
   * @param {number} changedByUserId - User making the change
   * @param {string|null} note - Optional note explaining the change
   * @returns {Promise<Object>} Updated client object
   */
  static async assignProvider(clientId, providerId, changedByUserId, note = null) {
    // Get current client to get old provider
    const currentClient = await this.findById(clientId);
    if (!currentClient) {
      throw new Error('Client not found');
    }

    const oldProviderId = currentClient.provider_id;

    // Update client provider
    await this.update(clientId, { provider_id: providerId }, changedByUserId);

    // Log to history
    const ClientStatusHistory = (await import('./ClientStatusHistory.model.js')).default;
    await ClientStatusHistory.create({
      client_id: clientId,
      changed_by_user_id: changedByUserId,
      field_changed: 'provider_id',
      from_value: oldProviderId ? oldProviderId.toString() : null,
      to_value: providerId ? providerId.toString() : null,
      note: note
    });

    return this.findById(clientId);
  }

  /**
   * Find client by match key (for deduplication)
   * @param {number} agencyId - Agency ID
   * @param {number} organizationId - Organization (school) ID
   * @param {string} initials - Client initials
   * @returns {Promise<Object|null>} Matching client or null
   */
  static async findByMatchKey(agencyId, organizationId, initials) {
    const query = `
      SELECT * FROM clients
      WHERE agency_id = ? AND organization_id = ? AND initials = ?
      LIMIT 1
    `;

    const [rows] = await pool.execute(query, [agencyId, organizationId, initials]);
    return rows.length > 0 ? rows[0] : null;
  }
}

export default Client;
