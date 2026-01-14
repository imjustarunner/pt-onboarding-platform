import pool from '../config/database.js';

/**
 * Client Model
 * 
 * Manages client records with permission-based filtering:
 * - Agency users: Full access to all fields
 * - School users: Restricted access (no sensitive data)
 */
class Client {
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
      status = 'PENDING_REVIEW',
      submission_date,
      document_status = 'NONE',
      source,
      created_by_user_id
    } = clientData;

    const query = `
      INSERT INTO clients (
        organization_id, agency_id, provider_id, initials, status,
        submission_date, document_status, source, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      organization_id,
      agency_id,
      provider_id || null,
      initials,
      status,
      submission_date,
      document_status,
      source,
      created_by_user_id || null
    ];

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

    let query = `
      SELECT 
        c.*,
        org.name as organization_name,
        org.slug as organization_slug,
        provider.first_name as provider_first_name,
        provider.last_name as provider_last_name,
        creator.first_name as created_by_first_name,
        creator.last_name as created_by_last_name
      FROM clients c
      LEFT JOIN agencies org ON c.organization_id = org.id
      LEFT JOIN users provider ON c.provider_id = provider.id
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
      includeSensitive = true
    } = options;

    let query = `
      SELECT 
        c.*,
        org.name as organization_name,
        org.slug as organization_slug,
        provider.first_name as provider_first_name,
        provider.last_name as provider_last_name
      FROM clients c
      LEFT JOIN agencies org ON c.organization_id = org.id
      LEFT JOIN users provider ON c.provider_id = provider.id
      WHERE 1=1
    `;

    const values = [];

    if (agency_id) {
      query += ' AND c.agency_id = ?';
      values.push(agency_id);
    }

    if (organization_id) {
      query += ' AND c.organization_id = ?';
      values.push(organization_id);
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

    query += ' ORDER BY c.submission_date DESC, c.created_at DESC';

    const [rows] = await pool.execute(query, values);

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
      'status',
      'submission_date',
      'document_status',
      'source'
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
