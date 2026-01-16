import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';

/**
 * Get all clients (agency view)
 * GET /api/clients
 */
export const getClients = async (req, res, next) => {
  try {
    const { status, organization_id, provider_id, search } = req.query;
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
      search
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

    // --- Provider/day/capacity enforcement ---
    const isChangingProvider = Object.prototype.hasOwnProperty.call(req.body, 'provider_id');
    const isChangingDay = Object.prototype.hasOwnProperty.call(req.body, 'assigned_day_of_week');
    const isChangingSchool = Object.prototype.hasOwnProperty.call(req.body, 'organization_id');

    const nextProviderId = isChangingProvider ? (req.body.provider_id || null) : (currentClient.provider_id || null);
    const nextDayRaw = isChangingDay ? (req.body.assigned_day_of_week || null) : (currentClient.assigned_day_of_week || null);
    const nextSchoolOrgId = isChangingSchool ? (req.body.organization_id || null) : (currentClient.organization_id || null);

    const normalizeDay = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      const allowed = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      return allowed.includes(s) ? s : null;
    };
    const nextDay = normalizeDay(nextDayRaw);

    // If day is being set, provider must already exist (either in request or on the client).
    if (isChangingDay && nextDay && !nextProviderId) {
      return res.status(400).json({ error: { message: 'Provider is required before assigning a day' } });
    }

    // If provider is cleared, day must also be cleared.
    if (isChangingProvider && !nextProviderId && (nextDay || currentClient.assigned_day_of_week)) {
      return res.status(400).json({ error: { message: 'Clear assigned day before clearing provider' } });
    }

    // If we have both provider + day (from request or existing), enforce schedule existence + capacity.
    if ((isChangingProvider || isChangingDay || isChangingSchool) && nextProviderId && nextDay) {
      const [schedRows] = await pool.execute(
        `SELECT starting_available
         FROM provider_school_schedules
         WHERE agency_id = ? AND provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
         LIMIT 1`,
        [currentClient.agency_id, nextProviderId, nextSchoolOrgId, nextDay]
      );
      if (!schedRows.length) {
        return res.status(400).json({ error: { message: 'Selected provider is not scheduled for this school/day' } });
      }

      const startingAvailable = schedRows[0].starting_available;
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM clients
         WHERE provider_id = ? AND organization_id = ? AND assigned_day_of_week = ? AND id <> ?`,
        [nextProviderId, nextSchoolOrgId, nextDay, parseInt(id, 10)]
      );
      const currentAssigned = countRows[0]?.cnt || 0;
      if (currentAssigned >= startingAvailable) {
        return res.status(400).json({ error: { message: 'No capacity available for this provider on the selected day' } });
      }

      // Auto-set client_status_id to "Current" when provider + day are set for the first time.
      const wasAssigned = !!currentClient.provider_id && !!currentClient.assigned_day_of_week;
      const becomesCurrent = !wasAssigned;
      if (becomesCurrent) {
        const [existingCurrent] = await pool.execute(
          `SELECT id
           FROM client_status_definitions
           WHERE agency_id = ? AND (LOWER(display_name) = 'current' OR LOWER(key_name) = 'current')
           LIMIT 1`,
          [currentClient.agency_id]
        );
        let currentStatusId = existingCurrent[0]?.id || null;
        if (!currentStatusId) {
          const [ins] = await pool.execute(
            `INSERT INTO client_status_definitions (agency_id, key_name, display_name, description, is_active)
             VALUES (?, 'Current', 'Current', 'Actively receiving services', TRUE)`,
            [currentClient.agency_id]
          );
          currentStatusId = ins.insertId;
        }
        req.body.client_status_id = currentStatusId;

        // Notifications (agency + provider)
        try {
          await Notification.create({
            type: 'client_became_current',
            severity: 'info',
            title: 'Client Became Current',
            message: `Client ${currentClient.initials} is now Current (assigned provider + day).`,
            userId: null,
            agencyId: currentClient.agency_id,
            relatedEntityType: 'client',
            relatedEntityId: parseInt(id, 10)
          });
          await Notification.create({
            type: 'client_became_current',
            severity: 'info',
            title: 'Client Became Current',
            message: `Client ${currentClient.initials} is now Current and assigned to you on ${nextDay}.`,
            userId: nextProviderId,
            agencyId: currentClient.agency_id,
            relatedEntityType: 'client',
            relatedEntityId: parseInt(id, 10)
          });
        } catch (e) {
          console.warn('Failed to create client_became_current notification:', e.message);
        }
      }
    }

    if (isChangingDay && req.body.assigned_day_of_week) {
      const safe = normalizeDay(req.body.assigned_day_of_week);
      if (!safe) {
        return res.status(400).json({ error: { message: 'Invalid day (must be Monday–Friday)' } });
      }
      req.body.assigned_day_of_week = safe;
    }

    // Update client
    const updatedClient = await Client.update(id, req.body, userId);

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
    const { provider_id, note } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Permission check: Only admin or super_admin can assign providers
    if (!['super_admin', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: { message: 'Only admins can assign providers' } 
      });
    }

    // Get current client
    const currentClient = await Client.findById(id);
    if (!currentClient) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Verify user has access to client's agency
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      if (!userAgencyIds.includes(currentClient.agency_id)) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this client' } 
        });
      }
    }

    // Verify provider exists if provided
    if (provider_id !== null && provider_id !== undefined) {
      const provider = await User.findById(provider_id);
      if (!provider) {
        return res.status(404).json({ error: { message: 'Provider not found' } });
      }
    }

    // If the client already has a day assigned, enforce schedule/capacity for the new provider.
    if (provider_id && currentClient.assigned_day_of_week) {
      const [schedRows] = await pool.execute(
        `SELECT starting_available
         FROM provider_school_schedules
         WHERE agency_id = ? AND provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
         LIMIT 1`,
        [currentClient.agency_id, provider_id, currentClient.organization_id, currentClient.assigned_day_of_week]
      );
      if (!schedRows.length) {
        return res.status(400).json({ error: { message: 'Selected provider is not scheduled for this school/day' } });
      }
      const startingAvailable = schedRows[0].starting_available;
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM clients
         WHERE provider_id = ? AND organization_id = ? AND assigned_day_of_week = ? AND id <> ?`,
        [provider_id, currentClient.organization_id, currentClient.assigned_day_of_week, parseInt(id, 10)]
      );
      const currentAssigned = countRows[0]?.cnt || 0;
      if (currentAssigned >= startingAvailable) {
        return res.status(400).json({ error: { message: 'No capacity available for this provider on the selected day' } });
      }
    }

    // Assign provider with history logging
    const updatedClient = await Client.assignProvider(id, provider_id || null, userId, note);

    // If day is already set and provider is being assigned for the first time, auto-set to Current and notify.
    if (provider_id && currentClient.assigned_day_of_week && !currentClient.provider_id) {
      try {
        const [existingCurrent] = await pool.execute(
          `SELECT id
           FROM client_status_definitions
           WHERE agency_id = ? AND (LOWER(display_name) = 'current' OR LOWER(key_name) = 'current')
           LIMIT 1`,
          [currentClient.agency_id]
        );
        let currentStatusId = existingCurrent[0]?.id || null;
        if (!currentStatusId) {
          const [ins] = await pool.execute(
            `INSERT INTO client_status_definitions (agency_id, key_name, display_name, description, is_active)
             VALUES (?, 'Current', 'Current', 'Actively receiving services', TRUE)`,
            [currentClient.agency_id]
          );
          currentStatusId = ins.insertId;
        }
        await Client.update(id, { client_status_id: currentStatusId }, userId);

        await Notification.create({
          type: 'client_became_current',
          severity: 'info',
          title: 'Client Became Current',
          message: `Client ${currentClient.initials} is now Current (assigned ${currentClient.assigned_day_of_week}).`,
          userId: null,
          agencyId: currentClient.agency_id,
          relatedEntityType: 'client',
          relatedEntityId: parseInt(id, 10)
        });
        await Notification.create({
          type: 'client_became_current',
          severity: 'info',
          title: 'Client Became Current',
          message: `Client ${currentClient.initials} is now Current and assigned to you on ${currentClient.assigned_day_of_week}.`,
          userId: provider_id,
          agencyId: currentClient.agency_id,
          relatedEntityType: 'client',
          relatedEntityId: parseInt(id, 10)
        });
      } catch (e) {
        console.warn('Failed to auto-set client to Current after provider assignment:', e.message);
      }
    }

    res.json(updatedClient);
  } catch (error) {
    console.error('Assign provider error:', error);
    next(error);
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

/**
 * Get referral packet URL for a client (requires auth + access)
 * GET /api/clients/:id/referral-packet
 */
export const getClientReferralPacket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const ids = userAgencies.map(a => a.id);
      const hasAgencyAccess = ids.includes(client.agency_id);
      const hasSchoolAccess = ids.includes(client.organization_id);
      if (!hasAgencyAccess && !hasSchoolAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this client' } });
      }
    }

    if (!client.referral_packet_path) {
      return res.status(404).json({ error: { message: 'No referral packet on file' } });
    }

    // Use /uploads route which will sign the URL (GCS) or serve locally (dev)
    res.json({
      clientId: client.id,
      referralPacketUrl: `/uploads/${client.referral_packet_path}`,
      referralPacketPath: client.referral_packet_path
    });
  } catch (e) {
    next(e);
  }
};
