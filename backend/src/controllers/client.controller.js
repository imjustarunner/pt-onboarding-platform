import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';
import { notifyClientBecameCurrent, notifyPaperworkReceived } from '../services/clientNotifications.service.js';

/**
 * Get all clients (agency view)
 * GET /api/clients
 */
export const getClients = async (req, res, next) => {
  try {
    const { status, organization_id, provider_id, search, client_status_id, paperwork_status_id, insurance_type_id } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get user's agencies for filtering
    let agencyIds = [];
    if (userRole === 'super_admin') {
      // Super admin can see all clients
      // Get all agencies
      const allAgencies = await Agency.findAll(true, false);
      agencyIds = allAgencies.map(a => a.id);
    } else {
      // Regular users: filter by their assigned agencies
      const userAgencies = await User.getAgencies(userId);
      agencyIds = userAgencies.map(a => a.id);
    }

    if (agencyIds.length === 0) {
      return res.json([]);
    }

    // Build query options
    const options = {
      includeSensitive: true, // Agency view includes all fields
      status,
      organization_id: organization_id ? parseInt(organization_id) : undefined,
      provider_id: provider_id ? parseInt(provider_id) : undefined,
      search,
      client_status_id: client_status_id ? parseInt(client_status_id, 10) : undefined,
      paperwork_status_id: paperwork_status_id ? parseInt(paperwork_status_id, 10) : undefined,
      insurance_type_id: insurance_type_id ? parseInt(insurance_type_id, 10) : undefined
    };

    // Get clients for all user's agencies
    let allClients = [];
    for (const agencyId of agencyIds) {
      const clients = await Client.findByAgencyId(agencyId, options);
      allClients = allClients.concat(clients);
    }

    // Remove duplicates (in case a client appears in multiple agencies - shouldn't happen but safety)
    const uniqueClients = Array.from(
      new Map(allClients.map(c => [c.id, c])).values()
    );

    res.json(uniqueClients);
  } catch (error) {
    console.error('Get clients error:', error);
    next(error);
  }
};

/**
 * Get client by ID
 * GET /api/clients/:id
 */
export const getClientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await Client.findById(id, { includeSensitive: true });
    if (!client) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check: Verify user has access to this client
    // Super admin: Full access
    if (userRole === 'super_admin') {
      return res.json(client);
    }

    // Get user's organizations
    const userAgencies = await User.getAgencies(userId);
    const userAgencyIds = userAgencies.map(a => a.id);
    const userOrganizationIds = userAgencies.map(a => a.id);

    // Check if user belongs to client's agency OR client's organization
    const hasAgencyAccess = userAgencyIds.includes(client.agency_id);
    const hasOrganizationAccess = userOrganizationIds.includes(client.organization_id);

    if (!hasAgencyAccess && !hasOrganizationAccess) {
      return res.status(403).json({ 
        error: { message: 'You do not have access to this client' } 
      });
    }

    // If user is accessing via a non-agency organization (school/program/learning), return restricted view
    const userOrganization = userAgencies.find(org => org.id === client.organization_id);
    const isNonAgencyOrgStaff = userOrganization && (String(userOrganization.organization_type || 'agency').toLowerCase() !== 'agency');

    if (isNonAgencyOrgStaff && !hasAgencyAccess) {
      // Return restricted view (exclude sensitive fields)
      const restrictedClient = {
        id: client.id,
        initials: client.initials,
        status: client.status,
        provider_name: client.provider_name,
        submission_date: client.submission_date,
        document_status: client.document_status,
        organization_name: client.organization_name,
        organization_slug: client.organization_slug
      };
      return res.json(restrictedClient);
    }

    // Agency user: Return full client data
    res.json(client);
  } catch (error) {
    console.error('Get client by ID error:', error);
    next(error);
  }
};

/**
 * Create new client
 * POST /api/clients
 */
export const createClient = async (req, res, next) => {
  try {
    const {
      organization_id,
      agency_id,
      provider_id,
      initials,
      status = 'PENDING_REVIEW',
      submission_date,
      document_status = 'NONE',
      source = 'ADMIN_CREATED'
    } = req.body;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Permission check: Only admin, provider (or staff with provider access), or super_admin can create clients
    const { hasProviderAccess } = await import('../utils/accessControl.js');
    if (!hasProviderAccess(req.user) && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to create clients' } 
      });
    }

    // Validate required fields
    if (!organization_id || !agency_id || !initials || !submission_date) {
      return res.status(400).json({ 
        error: { message: 'Missing required fields: organization_id, agency_id, initials, submission_date' } 
      });
    }

    const parsedAgencyId = parseInt(agency_id, 10);
    const parsedOrganizationId = parseInt(organization_id, 10);
    if (!parsedAgencyId || !parsedOrganizationId) {
      return res.status(400).json({
        error: { message: 'agency_id and organization_id must be valid integers' }
      });
    }

    // Verify user has access to the agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(parsedAgencyId)) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this agency' } 
        });
      }
    }

    // Verify agency exists and is an agency-type organization (clients can't be created "directly for agency")
    const agencyOrg = await Agency.findById(parsedAgencyId);
    if (!agencyOrg) {
      return res.status(404).json({
        error: { message: 'Agency not found' }
      });
    }
    const agencyOrgType = (agencyOrg.organization_type || 'agency').toLowerCase();
    if (agencyOrgType !== 'agency') {
      return res.status(400).json({
        error: { message: 'agency_id must refer to an agency organization' }
      });
    }

    // Verify organization exists and is NOT an agency (allow school/program/learning)
    const organization = await Agency.findById(parsedOrganizationId);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = organization.organization_type || 'agency';
    const normalizedOrgType = String(orgType).toLowerCase();
    const allowedOrgTypes = ['school', 'program', 'learning'];
    if (!allowedOrgTypes.includes(normalizedOrgType)) {
      return res.status(400).json({ 
        error: { message: `Clients must be associated with an organization of type: ${allowedOrgTypes.join(', ')}` } 
      });
    }

    // Verify organization is linked to the agency (enforces nested/associated rule)
    // Note: we reuse agency_schools as the linkage table for any non-agency organization types.
    try {
      const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
      const links = await AgencySchool.listByAgency(parsedAgencyId, { includeInactive: false });
      const isLinked = links.some((l) => parseInt(l.school_organization_id, 10) === parsedOrganizationId);
      if (!isLinked) {
        return res.status(400).json({
          error: { message: 'Selected organization is not linked to this agency' }
        });
      }
    } catch (e) {
      // If linkage table/model isn't available for some reason, fall back to permissive behavior.
      // This avoids blocking client creation in older environments.
    }

    // Create client
    const client = await Client.create({
      organization_id: parsedOrganizationId,
      agency_id: parsedAgencyId,
      provider_id: provider_id || null,
      initials: initials.toUpperCase().trim(),
      status,
      submission_date,
      document_status,
      source,
      created_by_user_id: userId
    });

    // Log initial creation to history
    await ClientStatusHistory.create({
      client_id: client.id,
      changed_by_user_id: userId,
      field_changed: 'created',
      from_value: null,
      to_value: JSON.stringify({ status, source }),
      note: 'Client created'
    });

    res.status(201).json(client);
  } catch (error) {
    console.error('Create client error:', error);
    next(error);
  }
};

/**
 * Update client
 * PUT /api/clients/:id
 */
export const updateClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(currentClient.agency_id)) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    // School staff cannot update clients (read-only access)
    const userAgencies = await User.getAgencies(userId);
    const userOrganization = userAgencies.find(org => org.id === currentClient.organization_id);
    const isSchoolStaff = userOrganization && (userOrganization.organization_type || 'agency') === 'school';
    
    if (isSchoolStaff && userRole !== 'super_admin') {
      return res.status(403).json({ 
        error: { message: 'School staff cannot update clients' } 
      });
    }

    // Update client
    let updatedClient = await Client.update(id, req.body, userId);

    // If paperwork status is set to "Completed" and paperwork_received_at isn't set, set it automatically.
    if (req.body.paperwork_status_id !== undefined) {
      try {
        const statusId = req.body.paperwork_status_id ? parseInt(req.body.paperwork_status_id, 10) : null;
        if (statusId) {
          const [rows] = await pool.execute(`SELECT status_key FROM paperwork_statuses WHERE id = ? LIMIT 1`, [statusId]);
          const isCompleted = String(rows[0]?.status_key || '').toLowerCase() === 'completed';
          if (isCompleted && !updatedClient.paperwork_received_at) {
            updatedClient = await Client.update(id, { paperwork_received_at: new Date() }, userId);
          }
        }
      } catch {
        // Best-effort only
      }
    }

    // Log changes to history (for status and provider changes, use specific methods)
    // For other fields, log here
    const changedFields = Object.keys(req.body).filter(key => 
      ['organization_id', 'agency_id', 'initials', 'submission_date', 'document_status', 'source'].includes(key)
    );

    for (const field of changedFields) {
      await ClientStatusHistory.create({
        client_id: id,
        changed_by_user_id: userId,
        field_changed: field,
        from_value: currentClient[field]?.toString() || null,
        to_value: req.body[field]?.toString() || null,
        note: `Updated ${field}`
      });
    }

    // Notifications: paperwork received
    try {
      const wasReceived = !!currentClient.paperwork_received_at;
      const nowReceived = !!updatedClient.paperwork_received_at;
      if (!wasReceived && nowReceived) {
        await notifyPaperworkReceived({
          agencyId: updatedClient.agency_id,
          schoolOrganizationId: updatedClient.organization_id,
          clientId: updatedClient.id,
          clientNameOrIdentifier: updatedClient.identifier_code || updatedClient.full_name || updatedClient.initials
        });
      }
    } catch {
      // ignore
    }

    res.json(updatedClient);
  } catch (error) {
    console.error('Update client error:', error);
    next(error);
  }
};

/**
 * Update client status
 * PUT /api/clients/:id/status
 */
export const updateClientStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(currentClient.agency_id)) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    // Validate status
    const validStatuses = ['PENDING_REVIEW', 'ACTIVE', 'ON_HOLD', 'DECLINED', 'ARCHIVED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } 
      });
    }

    // Update status with history logging
    const updatedClient = await Client.updateStatus(id, status, userId, note);

    res.json(updatedClient);
  } catch (error) {
    console.error('Update client status error:', error);
    next(error);
  }
};

/**
 * Assign provider to client
 * PUT /api/clients/:id/provider
 */
export const assignProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { provider_id, service_day, note } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Permission check: Only admin or super_admin can assign providers
    if (!['super_admin', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: { message: 'Only admins can assign providers' } 
      });
    }

    const normalizedDay = service_day ? String(service_day).trim() : null;
    const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (normalizedDay && !allowedDays.includes(normalizedDay)) {
      return res.status(400).json({ error: { message: `Invalid service_day. Must be one of: ${allowedDays.join(', ')}` } });
    }

    const providerId = provider_id === null || provider_id === '' || provider_id === undefined ? null : parseInt(provider_id, 10);

    // Verify provider exists if provided
    if (providerId !== null) {
      const provider = await User.findById(providerId);
      if (!provider) {
        return res.status(404).json({ error: { message: 'Provider not found' } });
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [clientRows] = await connection.execute(
        `SELECT id, agency_id, provider_id, organization_id, service_day
         FROM clients
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [parseInt(id, 10)]
      );
      const currentClient = clientRows[0];
      if (!currentClient) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Client not found' } });
      }

      // Verify user has access to client's agency
      if (userRole !== 'super_admin') {
        const userAgencies = await User.getAgencies(userId);
        const userAgencyIds = userAgencies.map(a => a.id);
        if (!userAgencyIds.includes(currentClient.agency_id)) {
          await connection.rollback();
          return res.status(403).json({ error: { message: 'You do not have access to this client' } });
        }
      }

      const oldProviderId = currentClient.provider_id ? parseInt(currentClient.provider_id, 10) : null;
      const oldDay = currentClient.service_day ? String(currentClient.service_day) : null;
      const schoolId = parseInt(currentClient.organization_id, 10);
      const oldIsCurrent = !!(oldProviderId && oldDay);

      // If changing provider while client has a day, require a day to be provided for slot safety.
      if (providerId !== null && oldDay && providerId !== oldProviderId && !normalizedDay) {
        await connection.rollback();
        return res.status(400).json({
          error: { message: 'service_day is required when changing provider for a client that already has a day assigned' }
        });
      }

      // Determine target day: provided value, or keep existing if not provided.
      const targetDay = normalizedDay !== null ? normalizedDay : oldDay;

      // Day must not be explicitly set without a provider
      if (normalizedDay && !providerId) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Cannot assign a day without a provider' } });
      }

      // Release old slot if needed
      if (oldProviderId && oldDay) {
        const same = providerId === oldProviderId && targetDay === oldDay;
        if (!same && (providerId === null || targetDay !== oldDay || providerId !== oldProviderId)) {
          await adjustProviderSlots(connection, { providerUserId: oldProviderId, schoolId, dayOfWeek: oldDay, delta: +1 });
        }
      }

      // Take new slot if needed
      if (providerId && targetDay) {
        const same = providerId === oldProviderId && targetDay === oldDay;
        if (!same) {
          const take = await adjustProviderSlots(connection, { providerUserId: providerId, schoolId, dayOfWeek: targetDay, delta: -1 });
          if (!take.ok) {
            await connection.rollback();
            return res.status(400).json({ error: { message: take.reason } });
          }
        }
      }

      // If provider cleared, clear day too.
      const finalProviderId = providerId;
      const finalDay = finalProviderId ? targetDay : null;
      const newIsCurrent = !!(finalProviderId && finalDay);

      await connection.execute(
        `UPDATE clients
         SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [finalProviderId, finalDay, userId, parseInt(id, 10)]
      );

      // History entries
      if (oldProviderId !== finalProviderId) {
        await connection.execute(
          `INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
           VALUES (?, ?, 'provider_id', ?, ?, ?)`,
          [parseInt(id, 10), userId, oldProviderId ? String(oldProviderId) : null, finalProviderId ? String(finalProviderId) : null, note || null]
        );
      }
      if (oldDay !== finalDay) {
        await connection.execute(
          `INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
           VALUES (?, ?, 'service_day', ?, ?, ?)`,
          [parseInt(id, 10), userId, oldDay || null, finalDay || null, note || null]
        );
      }

      await connection.commit();

      const updatedClient = await Client.findById(id);
      // Notifications: client became Current
      if (!oldIsCurrent && newIsCurrent) {
        notifyClientBecameCurrent({
          agencyId: updatedClient.agency_id,
          schoolOrganizationId: updatedClient.organization_id,
          clientId: updatedClient.id,
          providerUserId: finalProviderId,
          clientNameOrIdentifier: updatedClient.identifier_code || updatedClient.full_name || updatedClient.initials
        }).catch(() => {});
      }
      res.json(updatedClient);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Assign provider error:', error);
    next(error);
  }
};

/**
 * Delete all bulk-imported clients for a given agency (leaves organizations/schools intact).
 * DELETE /api/clients/bulk-import?agencyId=123&confirm=true
 */
export const deleteBulkImportedClients = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    if (!['super_admin', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: { message: 'Only admins can delete bulk-imported clients' } });
    }

    const agencyId = parseInt(req.query.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const confirm = String(req.query.confirm || '').toLowerCase() === 'true';
    if (!confirm) {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM clients WHERE agency_id = ? AND source = 'BULK_IMPORT'`,
        [agencyId]
      );
      return res.json({
        dryRun: true,
        agencyId,
        willDeleteClients: rows[0]?.cnt || 0,
        note: "Pass confirm=true to actually delete. This deletes clients only (schools/providers are not deleted)."
      });
    }

    const [result] = await pool.execute(
      `DELETE FROM clients WHERE agency_id = ? AND source = 'BULK_IMPORT'`,
      [agencyId]
    );

    res.json({
      success: true,
      agencyId,
      deletedClients: result.affectedRows || 0
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Get client status history
 * GET /api/clients/:id/history
 */
export const getClientHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      const userOrganizationIds = userAgencies.map(a => a.id);
      
      const hasAgencyAccess = userAgencyIds.includes(currentClient.agency_id);
      const hasSchoolAccess = userOrganizationIds.includes(currentClient.organization_id);

      if (!hasAgencyAccess && !hasSchoolAccess) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    const history = await ClientStatusHistory.findByClientId(id);
    res.json(history);
  } catch (error) {
    console.error('Get client history error:', error);
    next(error);
  }
};

/**
 * Get client notes
 * GET /api/clients/:id/notes
 */
export const getClientNotes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check
    let hasAgencyAccess = false;
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      const userOrganizationIds = userAgencies.map(a => a.id);
      
      hasAgencyAccess = userAgencyIds.includes(currentClient.agency_id);
      const hasSchoolAccess = userOrganizationIds.includes(currentClient.organization_id);

      if (!hasAgencyAccess && !hasSchoolAccess) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    // Get notes (filtered by permission)
    const notes = await ClientNotes.findByClientId(id, { hasAgencyAccess: userRole === 'super_admin' ? true : hasAgencyAccess });
    res.json(notes);
  } catch (error) {
    console.error('Get client notes error:', error);
    next(error);
  }
};

/**
 * Create client note
 * POST /api/clients/:id/notes
 */
export const createClientNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, is_internal_only = false, category = 'general' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Permission check
    let hasAgencyAccess = false;
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      const userOrganizationIds = userAgencies.map(a => a.id);
      
      hasAgencyAccess = userAgencyIds.includes(currentClient.agency_id);
      const hasSchoolAccess = userOrganizationIds.includes(currentClient.organization_id);

      if (!hasAgencyAccess && !hasSchoolAccess) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    // Validate message
    if (!message || !message.trim()) {
      return res.status(400).json({ 
        error: { message: 'Message is required' } 
      });
    }

    // Create note (with permission validation in model)
    const note = await ClientNotes.create({
      client_id: id,
      author_id: userId,
      message: message.trim(),
      is_internal_only,
      category
    }, { hasAgencyAccess: userRole === 'super_admin' ? true : hasAgencyAccess });

    // Notify support staff (and assigned provider) about new note
    try {
      const { createNotificationAndDispatch } = await import('../services/notificationDispatcher.service.js');
      const pool = (await import('../config/database.js')).default;

      // Support staff in agency
      const [supportRows] = await pool.execute(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?
         AND u.role = 'support'
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
        [currentClient.agency_id]
      );
      const supportIds = supportRows.map((r) => r.id).filter((uid) => uid !== userId);

      const recipients = new Set(supportIds);
      if (currentClient.provider_id && currentClient.provider_id !== userId) {
        recipients.add(currentClient.provider_id);
      }

      for (const rid of recipients) {
        await createNotificationAndDispatch(
          {
            type: 'client_note',
            severity: 'info',
            title: `Client update (${currentClient.initials})`,
            message: `New ${String(category || 'general').replace(/_/g, ' ')} note posted.`,
            userId: rid,
            agencyId: currentClient.agency_id,
            relatedEntityType: 'client',
            relatedEntityId: parseInt(id)
          },
          { context: { severity: 'info' } }
        );
      }
    } catch {
      // best-effort; do not block note creation
    }

    res.status(201).json(note);
  } catch (error) {
    console.error('Create client note error:', error);
    if (error.message.includes('internal notes')) {
      return res.status(403).json({ error: { message: error.message } });
    }
    next(error);
  }
};
