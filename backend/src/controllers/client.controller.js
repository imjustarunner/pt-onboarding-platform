import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import pool from '../config/database.js';
import { adjustProviderSlots } from '../services/providerSlots.service.js';
import { notifyClientBecameCurrent, notifyPaperworkReceived } from '../services/clientNotifications.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import crypto from 'crypto';

function normalizeSixDigitClientCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length !== 6) return '';
  return digits;
}

async function generateUniqueSixDigitClientCode({ agencyId }) {
  // Best-effort uniqueness within an agency. Retry a few times to avoid collisions.
  for (let i = 0; i < 25; i++) {
    const n = crypto.randomInt(0, 1000000);
    const code = String(n).padStart(6, '0');
    const [rows] = await pool.execute(
      `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
      [agencyId, code]
    );
    if (!rows?.[0]?.id) return code;
  }
  throw new Error('Unable to generate unique client code');
}

/**
 * Get all clients (agency view)
 * GET /api/clients
 */
export const getClients = async (req, res, next) => {
  try {
    const { status, organization_id, provider_id, search, client_status_id, paperwork_status_id, insurance_type_id, skills, agency_id } = req.query;
    const includeArchived =
      String(req.query.includeArchived || '').toLowerCase() === 'true' || String(req.query.includeArchived || '') === '1';
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

    // Optional: scope to a single agency for performance (used by Admin Client Management).
    const requestedAgencyId = agency_id ? parseInt(agency_id, 10) : null;
    if (requestedAgencyId) {
      if (userRole === 'super_admin') {
        agencyIds = [requestedAgencyId];
      } else if (agencyIds.includes(requestedAgencyId)) {
        agencyIds = [requestedAgencyId];
      }
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
      insurance_type_id: insurance_type_id ? parseInt(insurance_type_id, 10) : undefined,
      skills: skills === undefined ? undefined : (String(skills).toLowerCase() === 'true' || String(skills) === '1')
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

    // Default behavior: archived clients should not appear in the main client list.
    // They are managed via Settings -> Archive, or by explicitly requesting status=ARCHIVED/includeArchived=true.
    const statusNorm = String(status || '').toUpperCase();
    const out =
      includeArchived || statusNorm === 'ARCHIVED'
        ? uniqueClients
        : uniqueClients.filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');

    res.json(out);
  } catch (error) {
    console.error('Get clients error:', error);
    next(error);
  }
};

/**
 * Get clients assigned to a user (supervisor viewing supervisee's caseload).
 * GET /api/clients/for-user/:userId?agencyId=
 * Requires supervisor access to the user in the given agency.
 */
export const getClientsForUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId || !Number.isFinite(userId)) {
      return res.status(400).json({ error: { message: 'userId is required' } });
    }
    if (!agencyId || !Number.isFinite(agencyId)) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (requesterId === userId) {
      // Own clients: use normal getClients with provider_id (handled by getClients with user's agencies)
      req.query.provider_id = userId;
      req.query.agency_id = agencyId;
      return await getClients(req, res, next);
    }

    const hasAccess = await User.supervisorHasAccess(requesterId, userId, agencyId);
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'You can only view clients for your assigned supervisees.' } });
    }

    const clients = await Client.findByAgencyId(agencyId, { provider_id: userId });
    const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true';
    const out = includeArchived
      ? clients
      : (clients || []).filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
    res.json(out);
  } catch (error) {
    console.error('Get clients for user error:', error);
    next(error);
  }
};

/**
 * Get archived clients (agency view)
 * GET /api/clients/archived
 */
export const getArchivedClients = async (req, res, next) => {
  try {
    // Force archived-only view; reuse the same access rules as getClients.
    req.query.status = 'ARCHIVED';
    req.query.includeArchived = 'true';
    return await getClients(req, res, next);
  } catch (e) {
    next(e);
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
      logClientAccess(req, client.id, 'view_client').catch(() => {});
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
        organization_slug: client.organization_slug,

        // Compliance checklist fields (non-clinical / operational)
        parents_contacted_at: client.parents_contacted_at || null,
        parents_contacted_successful:
          client.parents_contacted_successful === null || client.parents_contacted_successful === undefined
            ? null
            : !!client.parents_contacted_successful,
        intake_at: client.intake_at || null,
        first_service_at: client.first_service_at || null,
        checklist_updated_at: client.checklist_updated_at || null,
        checklist_updated_by_name: client.checklist_updated_by_name || null
      };
      logClientAccess(req, client.id, 'view_client_restricted').catch(() => {});
      return res.json(restrictedClient);
    }

    // Agency user: Return full client data
    // Best-effort: attach checklist audit name if present.
    try {
      if (client?.checklist_updated_by_user_id) {
        const u = await User.findById(client.checklist_updated_by_user_id);
        if (u?.first_name || u?.last_name) {
          client.checklist_updated_by_name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        }
      }
    } catch {
      // ignore
    }

    logClientAccess(req, client.id, 'view_client').catch(() => {});
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
      identifier_code,
      client_status_id,
      school_year,
      grade,
      submission_date,
      document_status = 'NONE',
      source = 'ADMIN_CREATED',
      referral_date,
      insurance_type_id,
      paperwork_delivery_method_id,
      doc_date,
      primary_client_language,
      primary_parent_language,
      skills
    } = req.body;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Permission check: agency-side only (admin/staff/support/provider with provider access), or super_admin
    const { hasProviderAccess } = await import('../utils/accessControl.js');
    const roleNorm = String(userRole || '').toLowerCase();
    const isAgencyStaffRole = roleNorm === 'admin' || roleNorm === 'staff' || roleNorm === 'support';
    if (!hasProviderAccess(req.user) && !isAgencyStaffRole && userRole !== 'super_admin') {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to create clients' } 
      });
    }

    // Validate required fields
    if (!organization_id || !initials || !submission_date) {
      return res.status(400).json({ 
        error: { message: 'Missing required fields: organization_id, initials, submission_date' } 
      });
    }

    const parsedOrganizationId = parseInt(organization_id, 10);
    if (!parsedOrganizationId) {
      return res.status(400).json({ error: { message: 'organization_id must be a valid integer' } });
    }

    // Resolve agency_id (must be an agency org). Prefer explicit agency_id, but fall back to the org affiliation.
    let parsedAgencyId = agency_id ? parseInt(agency_id, 10) : null;
    if (!parsedAgencyId) {
      // Try org->agency affiliation
      parsedAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(parsedOrganizationId);
      // Legacy fallback for school links (if org affiliations are not yet migrated)
      if (!parsedAgencyId) {
        parsedAgencyId = await AgencySchool.getActiveAgencyIdForSchool(parsedOrganizationId);
      }
    }
    if (!parsedAgencyId) {
      return res.status(400).json({
        error: { message: 'Unable to resolve agency_id for organization_id. Please select an organization that is affiliated with an agency.' }
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

    // Verify organization is linked to the agency (enforces nested/associated rule).
    // Prefer organization_affiliations (supports schools + programs + learning). Fall back to legacy agency_schools.
    let isLinked = false;
    try {
      const orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(parsedAgencyId);
      isLinked = (orgs || []).some((o) => parseInt(o?.id, 10) === parsedOrganizationId);
    } catch {
      isLinked = false;
    }
    if (!isLinked) {
      try {
        const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
        const links = await AgencySchool.listByAgency(parsedAgencyId, { includeInactive: false });
        isLinked = (links || []).some((l) => parseInt(l?.school_organization_id, 10) === parsedOrganizationId);
      } catch {
        // ignore
      }
    }
    if (!isLinked) {
      return res.status(400).json({
        error: { message: 'Selected organization is not linked to this agency' }
      });
    }

    const warnings = [];
    let warningMeta = null;

    // Check for an existing client with the same initials at the same school (agency-scoped).
    // This is a warning only (we still allow creating a new client).
    // IMPORTANT: preserve user-entered casing in storage/display, but use uppercase for matching/dedup checks.
    const initialsForSave = String(initials || '').trim();
    const normalizedInitials = initialsForSave.toUpperCase();
    try {
      const existingByMatchKey = await Client.findByMatchKey(parsedAgencyId, parsedOrganizationId, normalizedInitials);
      if (existingByMatchKey?.id) {
        warnings.push(
          `A client with initials "${normalizedInitials}" already exists at this school (clientId ${existingByMatchKey.id}).`
        );
      }
    } catch {
      // ignore (best-effort)
    }

    // Duplicate detection (entire DB) by initials (user-facing identifier).
    // This is a warning only (we still allow creating a new client).
    if (normalizedInitials) {
      const [dupes] = await pool.execute(
        `SELECT
           c.id AS client_id,
           c.status AS client_status_workflow,
           c.client_status_id AS client_status_id,
           cs.label AS client_status_label,
           cs.status_key AS client_status_key,
           c.organization_id,
           org.name AS organization_name,
           org.slug AS organization_slug,
           c.provider_id,
           CONCAT(p.first_name, ' ', p.last_name) AS provider_name,
           c.agency_id,
           a.name AS agency_name
         FROM clients c
         LEFT JOIN agencies org ON c.organization_id = org.id
         LEFT JOIN agencies a ON c.agency_id = a.id
         LEFT JOIN users p ON c.provider_id = p.id
         LEFT JOIN client_statuses cs ON c.client_status_id = cs.id
         WHERE UPPER(c.initials) = ?
         ORDER BY c.id DESC
         LIMIT 10`,
        [normalizedInitials]
      );
      const matches = (dupes || []).map((r) => ({
        clientId: Number(r.client_id),
        workflowStatus: r.client_status_workflow || null,
        clientStatusId: r.client_status_id || null,
        clientStatusLabel: r.client_status_label || null,
        clientStatusKey: r.client_status_key || null,
        organizationId: r.organization_id || null,
        organizationName: r.organization_name || null,
        organizationSlug: r.organization_slug || null,
        providerId: r.provider_id || null,
        providerName: r.provider_name || null,
        agencyId: r.agency_id || null,
        agencyName: r.agency_name || null
      }));
      if (matches.length > 0) {
        const nonArchived = matches.find((m) => String(m.workflowStatus || '').toUpperCase() !== 'ARCHIVED');
        const archived = matches.find((m) => String(m.workflowStatus || '').toUpperCase() === 'ARCHIVED');
        warningMeta = { matches, canUnarchive: !!archived };
        if (nonArchived) warnings.push(`A client with initials "${normalizedInitials}" already exists (active). Please review duplicates.`);
        if (archived) warnings.push(`A client with initials "${normalizedInitials}" exists but is archived. You may want to restore it instead of creating a duplicate.`);
      }
    }

    // Identifier code: a stable 6-digit client code. Not editable once set.
    const providedCode = normalizeSixDigitClientCode(identifier_code);
    let clientIdentifierCode = providedCode;
    if (clientIdentifierCode) {
      const [dupes] = await pool.execute(
        `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
        [parsedAgencyId, clientIdentifierCode]
      );
      if (dupes?.[0]?.id) {
        return res.status(409).json({
          error: { message: `Client code "${clientIdentifierCode}" already exists in this agency.` }
        });
      }
    } else {
      clientIdentifierCode = await generateUniqueSixDigitClientCode({ agencyId: parsedAgencyId });
    }

    // Create client
    // Auto-archive for terminal client statuses (Dead/Terminated).
    let workflowStatus = 'PENDING_REVIEW';
    try {
      const csId = client_status_id ? parseInt(client_status_id, 10) : null;
      if (csId) {
        const [rows] = await pool.execute(
          `SELECT status_key, label FROM client_statuses WHERE id = ? LIMIT 1`,
          [csId]
        );
        const key = String(rows?.[0]?.status_key || '').toLowerCase();
        const lbl = String(rows?.[0]?.label || '').toLowerCase();
        if (key === 'dead' || key === 'terminated' || lbl.includes('dead') || lbl.includes('terminated')) {
          workflowStatus = 'ARCHIVED';
        }
      }
    } catch {
      // best-effort only
    }

    const client = await Client.create({
      organization_id: parsedOrganizationId,
      agency_id: parsedAgencyId,
      provider_id: provider_id || null,
      initials: initialsForSave,
      identifier_code: clientIdentifierCode,
      // "status" is treated as internal workflow/archive flag; new clients are not archived.
      status: workflowStatus,
      submission_date,
      document_status,
      source,
      created_by_user_id: userId,
      client_status_id: client_status_id ? parseInt(client_status_id, 10) : null,
      insurance_type_id: insurance_type_id ? parseInt(insurance_type_id, 10) : null,
      school_year: school_year ? String(school_year).trim() : null,
      grade: grade ? String(grade).trim() : null,
      doc_date: doc_date ? String(doc_date).slice(0, 10) : null,

      // New intake fields (optional)
      referral_date: referral_date || null,
      paperwork_delivery_method_id: paperwork_delivery_method_id || null,
      primary_client_language: primary_client_language ? String(primary_client_language).trim() : null,
      primary_parent_language: primary_parent_language ? String(primary_parent_language).trim() : null,
      skills: skills === undefined || skills === null ? undefined : !!skills
    });

    // Seed multi-agency affiliation table so access control works immediately.
    // Best-effort only: table may not exist in older environments.
    try {
      const dbName2 = process.env.DB_NAME || 'onboarding_stage';
      const [t2] = await pool.execute(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_agency_assignments' LIMIT 1",
        [dbName2]
      );
      const hasAgencyAffiliationsTable = (t2 || []).length > 0;
      if (hasAgencyAffiliationsTable) {
        await pool.execute(
          `INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active)
           VALUES (?, ?, TRUE, TRUE)
           ON DUPLICATE KEY UPDATE is_primary = TRUE, is_active = TRUE`,
          [client.id, parsedAgencyId]
        );
      }
    } catch {
      // ignore (older DBs)
    }

    // Seed multi-org affiliation table so the primary org appears in the Affiliations UI immediately.
    // Best-effort only: table may not exist in older environments.
    try {
      const dbName2 = process.env.DB_NAME || 'onboarding_stage';
      const [t2] = await pool.execute(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_organization_assignments' LIMIT 1",
        [dbName2]
      );
      const hasAffiliationsTable = (t2 || []).length > 0;
      if (hasAffiliationsTable) {
        await pool.execute(
          `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
           VALUES (?, ?, TRUE, TRUE)
           ON DUPLICATE KEY UPDATE is_primary = TRUE, is_active = TRUE`,
          [client.id, parsedOrganizationId]
        );
      }
    } catch {
      // ignore (older DBs)
    }

    // Seed per-client document status checklist (best-effort; migration may not be applied yet).
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [t] = await pool.execute(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
        [dbName]
      );
      const hasChecklistTable = (t || []).length > 0;
      if (hasChecklistTable) {
        // For this agency, seed all paperwork statuses except 'completed' as needed.
        const [statusRows] = await pool.execute(
          `SELECT id, status_key, label
           FROM paperwork_statuses
           WHERE agency_id = ?
           ORDER BY label ASC`,
          [parsedAgencyId]
        );
        const toSeed = (statusRows || []).filter((s) => String(s.status_key || '').toLowerCase() !== 'completed');
        for (const s of toSeed) {
          try {
            await pool.execute(
              `INSERT INTO client_paperwork_items (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
               VALUES (?, ?, 1, NULL, NULL)
               ON DUPLICATE KEY UPDATE client_id = client_id`,
              [client.id, s.id]
            );
          } catch {
            // ignore individual failures
          }
        }
      }
    } catch {
      // ignore (older DBs)
    }

    // Log initial creation to history
    await ClientStatusHistory.create({
      client_id: client.id,
      changed_by_user_id: userId,
      field_changed: 'created',
      from_value: null,
      to_value: JSON.stringify({ status: 'PENDING_REVIEW', source }),
      note: 'Client created'
    });

    res.status(201).json(warnings.length ? { ...client, warnings, warningMeta } : client);
  } catch (error) {
    console.error('Create client error:', error);
    next(error);
  }
};

/**
 * Set a client identifier code (6-digit, permanent once set)
 * PUT /api/clients/:id/identifier-code
 * body: { identifier_code }
 */
export const setClientIdentifierCode = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const canManage = ['super_admin', 'admin', 'support', 'staff', 'supervisor'].includes(roleNorm);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });

    const access = await ensureAgencyAccessToClient({ userId, role: roleNorm, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const code = normalizeSixDigitClientCode(req.body?.identifier_code);
    if (!code) return res.status(400).json({ error: { message: 'identifier_code must be a 6-digit number' } });

    // Only allow setting when missing/invalid.
    const current = String(access.client?.identifier_code || '').trim();
    if (current && /^\d{6}$/.test(current)) {
      return res.status(409).json({ error: { message: 'Client code is already set' } });
    }

    // Ensure uniqueness within agency.
    const [dupes] = await pool.execute(
      `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
      [parseInt(access.client.agency_id, 10), code]
    );
    if (dupes?.[0]?.id) {
      return res.status(409).json({ error: { message: `Client code "${code}" already exists in this agency.` } });
    }

    await pool.execute(
      `UPDATE clients
       SET identifier_code = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (identifier_code IS NULL OR identifier_code = '' OR identifier_code NOT REGEXP '^[0-9]{6}$')`,
      [code, clientId]
    );

    const refreshed = await Client.findById(clientId, { includeSensitive: true });
    return res.json({ client: refreshed });
  } catch (e) {
    next(e);
  }
};

/**
 * Generate a client identifier code (6-digit, permanent once set)
 * POST /api/clients/:id/identifier-code/generate
 */
export const generateClientIdentifierCode = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const canManage = ['super_admin', 'admin', 'support', 'staff', 'supervisor'].includes(roleNorm);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });

    const access = await ensureAgencyAccessToClient({ userId, role: roleNorm, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const current = String(access.client?.identifier_code || '').trim();
    if (current && /^\d{6}$/.test(current)) {
      const refreshed = await Client.findById(clientId, { includeSensitive: true });
      return res.json({ client: refreshed });
    }

    const agencyId = parseInt(access.client.agency_id, 10);
    const code = await generateUniqueSixDigitClientCode({ agencyId });
    await pool.execute(
      `UPDATE clients
       SET identifier_code = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (identifier_code IS NULL OR identifier_code = '' OR identifier_code NOT REGEXP '^[0-9]{6}$')`,
      [code, clientId]
    );

    const refreshed = await Client.findById(clientId, { includeSensitive: true });
    return res.json({ client: refreshed });
  } catch (e) {
    next(e);
  }
};

/**
 * Get per-client Document Status checklist (Needed/Received).
 * GET /api/clients/:id/document-status
 */
export const getClientDocumentStatus = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    // Only agency-side access (admin/staff/support/provider via agency); no school-only access.
    if (userRole !== 'super_admin') {
      const userOrgs = await User.getAgencies(userId);
      const ids = (userOrgs || []).map((o) => o.id);
      const hasAgencyAccess = ids.includes(client.agency_id);
      if (!hasAgencyAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this client' } });
      }
    }

    // Best-effort: table may not exist yet.
    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [t] = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
      [dbName]
    );
    const hasChecklistTable = (t || []).length > 0;
    if (!hasChecklistTable) {
      return res.json({ clientId, agencyId: client.agency_id, items: [], summary: { neededCount: null, statusLabel: client.paperwork_status_label || '—' } });
    }

    // Load agency paperwork statuses (fixed set defined by BULK_CLIENT_UPLOAD.md).
    const keys = ['completed', 're_auth', 'new_insurance', 'insurance_payment_auth', 'emailed_packet', 'roi', 'renewal', 'new_docs', 'disclosure_consent', 'balance'];
    const placeholders = keys.map(() => '?').join(',');
    const [statusRows] = await pool.execute(
      `SELECT id, status_key, label
       FROM paperwork_statuses
       WHERE agency_id = ?
         AND LOWER(status_key) IN (${placeholders})`,
      [client.agency_id, ...keys]
    );
    const statusByKey = new Map((statusRows || []).map((s) => [String(s.status_key || '').toLowerCase(), s]));

    // Seed rows if missing (all non-completed items default to needed).
    for (const k of keys) {
      const row = statusByKey.get(k);
      if (!row) continue;
      if (k === 'completed') continue;
      await pool.execute(
        `INSERT INTO client_paperwork_items (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
         VALUES (?, ?, 1, NULL, NULL)
         ON DUPLICATE KEY UPDATE client_id = client_id`,
        [clientId, row.id]
      );
    }

    const orderBy = keys.map(() => '?').join(',');
    const [itemRows] = await pool.execute(
      `SELECT cpi.paperwork_status_id, cpi.is_needed, cpi.received_at, cpi.received_by_user_id,
              ps.status_key, ps.label
       FROM client_paperwork_items cpi
       INNER JOIN paperwork_statuses ps ON ps.id = cpi.paperwork_status_id
       WHERE cpi.client_id = ?
         AND ps.agency_id = ?
         AND LOWER(ps.status_key) IN (${placeholders})
       ORDER BY FIELD(LOWER(ps.status_key), ${orderBy})`,
      [clientId, client.agency_id, ...keys, ...keys]
    );

    const items = (itemRows || []).map((r) => ({
      paperwork_status_id: r.paperwork_status_id,
      status_key: r.status_key,
      label: r.label,
      is_needed: !!r.is_needed,
      received_at: r.received_at || null,
      received_by_user_id: r.received_by_user_id || null
    }));

    const neededCount = items.filter((x) => x.status_key !== 'completed' && x.is_needed).length;
    res.json({
      clientId,
      agencyId: client.agency_id,
      items: [
        {
          paperwork_status_id: statusByKey.get('completed')?.id || null,
          status_key: 'completed',
          label: statusByKey.get('completed')?.label || 'Completed',
          is_needed: false,
          received_at: null,
          received_by_user_id: null,
          is_completed: neededCount === 0
        },
        ...items.filter((x) => x.status_key !== 'completed')
      ],
      summary: {
        neededCount,
        statusLabel: neededCount === 0 ? (statusByKey.get('completed')?.label || 'Completed') : (neededCount > 1 ? 'Multiple Needed' : `${items.find((x) => x.status_key !== 'completed' && x.is_needed)?.label || 'Needed'} Needed`)
      }
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Update Document Status checklist items (Needed/Received).
 * PUT /api/clients/:id/document-status
 * body: { updates: [{ paperwork_status_id, is_needed }] } OR { paperwork_status_id, is_needed }
 */
export const updateClientDocumentStatus = async (req, res, next) => {
  let connection;
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const roleNorm = String(req.user.role || '').toLowerCase();
    const canEdit = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);
    if (!canEdit) return res.status(403).json({ error: { message: 'You do not have permission to update document status' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    // Agency access check (non-super-admin)
    if (roleNorm !== 'super_admin') {
      const userOrgs = await User.getAgencies(userId);
      const ids = (userOrgs || []).map((o) => o.id);
      const hasAgencyAccess = ids.includes(client.agency_id);
      if (!hasAgencyAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this client' } });
      }
    }

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [t] = await pool.execute(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_paperwork_items' LIMIT 1",
      [dbName]
    );
    const hasChecklistTable = (t || []).length > 0;
    if (!hasChecklistTable) {
      return res.status(400).json({ error: { message: 'Document status checklist is not available yet (missing migration).' } });
    }

    const rawUpdates = Array.isArray(req.body?.updates) ? req.body.updates : [req.body];
    const updates = (rawUpdates || [])
      .map((u) => ({
        paperworkStatusId: u?.paperwork_status_id ? parseInt(String(u.paperwork_status_id), 10) : null,
        isNeeded: u?.is_needed === undefined ? null : !!u.is_needed
      }))
      .filter((u) => u.paperworkStatusId && u.isNeeded !== null);
    if (!updates.length) return res.status(400).json({ error: { message: 'No updates provided' } });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Validate statuses belong to agency and are not 'completed' (completed is computed).
    for (const u of updates) {
      const [rows] = await connection.execute(
        `SELECT id, status_key, label
         FROM paperwork_statuses
         WHERE id = ? AND agency_id = ?
         LIMIT 1`,
        [u.paperworkStatusId, client.agency_id]
      );
      const s = rows?.[0] || null;
      if (!s) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Invalid paperwork_status_id for this agency' } });
      }
      if (String(s.status_key || '').toLowerCase() === 'completed') {
        // Ignore attempts to toggle completed directly.
        continue;
      }

      await connection.execute(
        `INSERT INTO client_paperwork_items (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_needed = VALUES(is_needed),
           received_at = VALUES(received_at),
           received_by_user_id = VALUES(received_by_user_id)`,
        [
          clientId,
          u.paperworkStatusId,
          u.isNeeded ? 1 : 0,
          u.isNeeded ? null : new Date(),
          u.isNeeded ? null : userId
        ]
      );

      // Audit trail: record a dated entry when something is marked received (needed -> received).
      if (!u.isNeeded) {
        const effectiveDate = new Date().toISOString().split('T')[0];
        await connection.execute(
          `INSERT INTO client_paperwork_history
            (client_id, paperwork_status_id, paperwork_delivery_method_id, effective_date, roi_expires_at, note, changed_by_user_id)
           VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
          [clientId, u.paperworkStatusId, effectiveDate, 'Marked received via Document Status checklist', userId]
        );
      }
    }

    // Recompute summary + update clients.paperwork_status_id for reporting/search.
    const [neededRows] = await connection.execute(
      `SELECT COUNT(*) AS cnt,
              MIN(paperwork_status_id) AS single_id
       FROM client_paperwork_items
       WHERE client_id = ?
         AND is_needed = 1`,
      [clientId]
    );
    const neededCount = parseInt(String(neededRows?.[0]?.cnt ?? 0), 10) || 0;
    const singleId = neededRows?.[0]?.single_id ? parseInt(String(neededRows[0].single_id), 10) : null;

    let nextPaperworkStatusId = null;
    let markReceivedAt = null;
    if (neededCount === 0) {
      const [completedRows] = await connection.execute(
        `SELECT id FROM paperwork_statuses WHERE agency_id = ? AND LOWER(status_key) = 'completed' LIMIT 1`,
        [client.agency_id]
      );
      nextPaperworkStatusId = completedRows?.[0]?.id ? parseInt(String(completedRows[0].id), 10) : null;
      markReceivedAt = new Date();
    } else if (neededCount === 1 && singleId) {
      nextPaperworkStatusId = singleId;
    } else {
      nextPaperworkStatusId = null;
    }

    await connection.execute(
      `UPDATE clients
       SET paperwork_status_id = ?,
           paperwork_received_at = CASE WHEN ? IS NULL THEN paperwork_received_at ELSE COALESCE(paperwork_received_at, ?) END,
           updated_by_user_id = ?,
           last_activity_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextPaperworkStatusId, markReceivedAt, markReceivedAt, userId, clientId]
    );

    await connection.commit();

    const updatedClient = await Client.findById(clientId, { includeSensitive: true });
    res.json({ ok: true, client: updatedClient, summary: { neededCount } });
  } catch (e) {
    try {
      if (connection) await connection.rollback();
    } catch {
      // ignore
    }
    next(e);
  } finally {
    try {
      if (connection) connection.release();
    } catch {
      // ignore
    }
  }
};

function normalizeSchoolYearLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Accept YYYY-YYYY
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  // Accept YYYY/YYYY
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return s;
}

function computeNextSchoolYearLabel(fromLabel = null) {
  const lbl = normalizeSchoolYearLabel(fromLabel);
  const m = lbl ? lbl.match(/^(\d{4})-(\d{4})$/) : null;
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b) && b === a + 1) {
      return `${a + 1}-${b + 1}`;
    }
  }
  // Default: infer current school year by date (Jul+ => year-year+1 else year-1-year)
  const now = new Date();
  const y = now.getFullYear();
  const mth = now.getMonth() + 1;
  const start = mth >= 7 ? y : y - 1;
  return `${start + 1}-${start + 2}`;
}

function bumpGrade(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'K' || upper === 'KG' || upper === 'KINDERGARTEN') return '1';
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  const next = Math.min(12, n + 1);
  return String(next);
}

/**
 * Bulk promote clients to the next school year (and bump grade +1 when numeric).
 * POST /api/clients/bulk/promote-school-year
 * body: { clientIds: number[], toSchoolYear?: string }
 */
export const bulkPromoteSchoolYear = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const roleNorm = String(userRole || '').toLowerCase();
    const canManage = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (!canManage) {
      return res.status(403).json({ error: { message: 'Only admin/staff can promote clients' } });
    }

    const ids = Array.isArray(req.body?.clientIds) ? req.body.clientIds : [];
    const clientIds = ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
    if (!clientIds.length) return res.status(400).json({ error: { message: 'clientIds is required' } });

    const toSchoolYear = normalizeSchoolYearLabel(req.body?.toSchoolYear || null);
    const resetDocs = req.body?.resetDocs === undefined ? true : !!req.body.resetDocs;
    const resetPaperworkStatusKey = String(req.body?.paperworkStatusKey || 'new_docs').trim().toLowerCase();

    // Fetch clients in one query (include agency_id for access checks).
    const placeholders = clientIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, agency_id, school_year, grade, status
       FROM clients
       WHERE id IN (${placeholders})`,
      clientIds
    );

    // Access check: non-super_admin must have agency access.
    let allowedAgencyIds = null;
    if (roleNorm !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      allowedAgencyIds = new Set((userAgencies || []).map((a) => Number(a?.id)).filter(Boolean));
    }

    const updated = [];
    const skipped = [];
    const newDocsPaperworkStatusIdByAgencyId = new Map();
    for (const r of rows || []) {
      const id = Number(r.id);
      if (!id) continue;
      if (allowedAgencyIds && !allowedAgencyIds.has(Number(r.agency_id))) {
        skipped.push({ id, reason: 'no_access' });
        continue;
      }
      // Don't promote archived clients automatically; they should be unarchived first.
      if (String(r.status || '').toUpperCase() === 'ARCHIVED') {
        skipped.push({ id, reason: 'archived' });
        continue;
      }

      const nextYear = toSchoolYear || computeNextSchoolYearLabel(r.school_year || null);
      const nextGrade = bumpGrade(r.grade);
      const patch = { school_year: nextYear };
      if (nextGrade !== null) patch.grade = nextGrade;

      // Default rollover behavior: reset document workflow for the new year.
      if (resetDocs) {
        // Paperwork status: attempt to set to "New Docs" if present for this agency.
        const agencyId = Number(r.agency_id);
        if (agencyId) {
          if (!newDocsPaperworkStatusIdByAgencyId.has(agencyId)) {
            try {
              const [ps] = await pool.execute(
                `SELECT id
                 FROM paperwork_statuses
                 WHERE agency_id = ?
                   AND LOWER(status_key) = ?
                 LIMIT 1`,
                [agencyId, resetPaperworkStatusKey]
              );
              newDocsPaperworkStatusIdByAgencyId.set(agencyId, ps?.[0]?.id || null);
            } catch {
              newDocsPaperworkStatusIdByAgencyId.set(agencyId, null);
            }
          }
          const psId = newDocsPaperworkStatusIdByAgencyId.get(agencyId);
          if (psId) patch.paperwork_status_id = psId;
        }
        patch.paperwork_received_at = null;
        patch.paperwork_delivery_method_id = null;
        patch.doc_date = null;
        patch.roi_expires_at = null;
        patch.document_status = 'NONE';
      }

      await Client.update(id, patch, userId);
      updated.push({ id, school_year: nextYear, grade: patch.grade ?? null });
    }

    res.json({ success: true, updated, skipped, requested: clientIds.length, found: (rows || []).length });
  } catch (e) {
    next(e);
  }
};

/**
 * Rollover all clients in a scope to next school year.
 * POST /api/clients/bulk/rollover-school-year
 * body: { organizationId?: number, agencyId?: number, toSchoolYear?: string, confirm?: boolean, resetDocs?: boolean }
 */
export const rolloverSchoolYear = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const roleNorm = String(userRole || '').toLowerCase();
    const canManage = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (!canManage) {
      return res.status(403).json({ error: { message: 'Only admin/staff can rollover clients' } });
    }

    const organizationId = req.body?.organizationId ? parseInt(req.body.organizationId, 10) : null;
    const agencyIdFromBody = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const toSchoolYear = normalizeSchoolYearLabel(req.body?.toSchoolYear || null);
    const resetDocs = req.body?.resetDocs === undefined ? true : !!req.body.resetDocs;
    const keepSchoolYear = req.body?.keepSchoolYear === true || req.body?.keepSchoolYear === 'true';
    const paperworkStatusKey = String(req.body?.paperworkStatusKey || 'new_docs').trim().toLowerCase();
    const confirm = !!req.body?.confirm;
    if (keepSchoolYear && !resetDocs) {
      return res.status(400).json({ error: { message: 'keepSchoolYear requires resetDocs=true' } });
    }

    // Access check: non-super_admin must have the agency in their org list.
    let allowedAgencyIds = null;
    if (roleNorm !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      allowedAgencyIds = new Set((userAgencies || []).map((a) => Number(a?.id)).filter(Boolean));
    }

    // Determine agency scope if provided; otherwise infer from org if possible.
    const scopedAgencyId = agencyIdFromBody || null;
    if (scopedAgencyId && allowedAgencyIds && !allowedAgencyIds.has(scopedAgencyId)) {
      return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    }

    // Preview eligible rows.
    const where = [];
    const vals = [];
    where.push(`status <> 'ARCHIVED'`);
    if (organizationId) {
      where.push('organization_id = ?');
      vals.push(organizationId);
    }
    if (scopedAgencyId) {
      where.push('agency_id = ?');
      vals.push(scopedAgencyId);
    } else if (allowedAgencyIds) {
      const ids = Array.from(allowedAgencyIds);
      if (ids.length) {
        where.push(`agency_id IN (${ids.map(() => '?').join(',')})`);
        vals.push(...ids);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [cntRows] = await pool.execute(`SELECT COUNT(*) AS cnt FROM clients ${whereSql}`, vals);
    const cnt = Number(cntRows?.[0]?.cnt || 0);
    if (!confirm) {
      return res.json({
        dryRun: true,
        willUpdate: cnt,
        organizationId,
        agencyId: scopedAgencyId,
        toSchoolYear: keepSchoolYear ? '(unchanged)' : (toSchoolYear || '(computed per client)'),
        resetDocs,
        keepSchoolYear
      });
    }

    // Fetch ids (we reuse the existing bulkPromoteSchoolYear logic by chunking).
    const [idRows] = await pool.execute(`SELECT id FROM clients ${whereSql}`, vals);
    const idsToUpdate = (idRows || []).map((r) => Number(r.id)).filter(Boolean);
    const updated = [];
    const skipped = [];
    const chunkSize = 500;
    for (let i = 0; i < idsToUpdate.length; i += chunkSize) {
      const chunk = idsToUpdate.slice(i, i + chunkSize);
      // eslint-disable-next-line no-await-in-loop
      const resp = await new Promise((resolve, reject) => {
        // call handler directly without HTTP roundtrip
        // emulate req/res by calling underlying logic: easiest is to call bulkPromoteSchoolYear via function,
        // but it expects req/res; so we duplicate by invoking internal helper through a synthetic request.
        resolve({ chunk });
      });
      // We can't reuse without refactor; do per-client updates by calling Client.update via existing logic:
      // We'll do it simply here.
      // eslint-disable-next-line no-await-in-loop
      const placeholders = chunk.map(() => '?').join(',');
      // eslint-disable-next-line no-await-in-loop
      const [rows] = await pool.execute(
        `SELECT id, agency_id, school_year, grade, status FROM clients WHERE id IN (${placeholders})`,
        chunk
      );
      const newDocsPaperworkStatusIdByAgencyId = new Map();
      for (const r of rows || []) {
        const id = Number(r.id);
        if (!id) continue;
        const nextYear = toSchoolYear || computeNextSchoolYearLabel(r.school_year || null);
        const nextGrade = bumpGrade(r.grade);
        const patch = {};
        if (!keepSchoolYear) {
          patch.school_year = nextYear;
          if (nextGrade !== null) patch.grade = nextGrade;
        }
        if (resetDocs) {
          const aId = Number(r.agency_id);
          if (aId) {
            if (!newDocsPaperworkStatusIdByAgencyId.has(aId)) {
              try {
                const [ps] = await pool.execute(
                  `SELECT id FROM paperwork_statuses WHERE agency_id = ? AND LOWER(status_key) = ? LIMIT 1`,
                  [aId, paperworkStatusKey]
                );
                newDocsPaperworkStatusIdByAgencyId.set(aId, ps?.[0]?.id || null);
              } catch {
                newDocsPaperworkStatusIdByAgencyId.set(aId, null);
              }
            }
            const psId = newDocsPaperworkStatusIdByAgencyId.get(aId);
            if (psId) patch.paperwork_status_id = psId;
          }
          patch.paperwork_received_at = null;
          patch.paperwork_delivery_method_id = null;
          patch.doc_date = null;
          patch.roi_expires_at = null;
          patch.document_status = 'NONE';
        }
        await Client.update(id, patch, userId);
        updated.push({ id, school_year: nextYear });
      }
    }

    res.json({ success: true, updatedCount: updated.length, willUpdate: cnt, organizationId, agencyId: scopedAgencyId });
  } catch (e) {
    next(e);
  }
};

/**
 * Unarchive client (optionally update affiliation/provider)
 * POST /api/clients/:id/unarchive
 */
export const unarchiveClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const currentClient = await Client.findById(id, { includeSensitive: true });
    if (!currentClient) return res.status(404).json({ error: { message: 'Client not found' } });

    // Permission: only admin/staff/support/super_admin can unarchive.
    const roleNorm = String(userRole || '').toLowerCase();
    const canUnarchive = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (!canUnarchive) {
      return res.status(403).json({ error: { message: 'Only admin/staff can unarchive clients' } });
    }

    const isArchived = String(currentClient.status || '').toUpperCase() === 'ARCHIVED';
    if (!isArchived) {
      return res.status(400).json({ error: { message: 'Client is not archived' } });
    }

    const nextOrgId = req.body?.organization_id ? parseInt(req.body.organization_id, 10) : null;
    const nextProviderId = req.body?.provider_id === null ? null : (req.body?.provider_id ? parseInt(req.body.provider_id, 10) : undefined);

    // Unarchive + optional reassignment.
    await Client.updateStatus(id, 'PENDING_REVIEW', userId, 'Unarchived');
    if (nextOrgId || nextProviderId !== undefined) {
      const patch = {};
      if (nextOrgId) patch.organization_id = nextOrgId;
      if (nextProviderId !== undefined) patch.provider_id = nextProviderId;
      await Client.update(id, patch, userId);
    }

    const updated = await Client.findById(id, { includeSensitive: true });
    res.json(updated);
  } catch (e) {
    next(e);
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

    // School staff (role) cannot update clients (read-only). Admins/support/super_admin can.
    const roleLower = String(userRole || '').toLowerCase();
    if (roleLower === 'school_staff') {
      return res.status(403).json({
        error: { message: 'School staff cannot update clients' }
      });
    }

    // Client identifier code (6-digit, permanent):
    // Use the existing update endpoint so the UI doesn't depend on a brand-new route.
    // - If missing/invalid: allow setting to a provided 6-digit code, or generating a new one.
    // - If already set: do not allow editing.
    const wantsGenerateCode =
      req.body?.generate_identifier_code === true ||
      String(req.body?.generate_identifier_code || '').toLowerCase() === 'true';
    const providedCode = normalizeSixDigitClientCode(req.body?.identifier_code);
    const currentCode = String(currentClient.identifier_code || '').trim();
    const currentCodeValid = /^\d{6}$/.test(currentCode);

    if (!currentCodeValid && (wantsGenerateCode || providedCode)) {
      const agencyId = parseInt(currentClient.agency_id, 10);
      const codeToSet = providedCode || (await generateUniqueSixDigitClientCode({ agencyId }));

      // Uniqueness within agency
      const [dupes] = await pool.execute(
        `SELECT id FROM clients WHERE agency_id = ? AND identifier_code = ? LIMIT 1`,
        [agencyId, codeToSet]
      );
      if (dupes?.[0]?.id) {
        return res.status(409).json({ error: { message: `Client code "${codeToSet}" already exists in this agency.` } });
      }

      // Set it in stone (only if still missing/invalid at write time)
      await pool.execute(
        `UPDATE clients
         SET identifier_code = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND (identifier_code IS NULL OR identifier_code = '' OR identifier_code NOT REGEXP '^[0-9]{6}$')`,
        [codeToSet, parseInt(id, 10)]
      );
    }

    // If changing the client's primary organization (school/program/learning), validate the target org up front.
    // IMPORTANT: School Portal rosters are assignment-driven (client_organization_assignments), so we also
    // sync that table below when this field changes.
    const requestedOrgIdRaw = req.body?.organization_id;
    const requestedOrgId =
      requestedOrgIdRaw === null || requestedOrgIdRaw === '' || requestedOrgIdRaw === undefined
        ? null
        : parseInt(String(requestedOrgIdRaw), 10);
    const curOrgId = currentClient.organization_id ? parseInt(String(currentClient.organization_id), 10) : null;
    const wantsOrgChange = Number.isFinite(requestedOrgId) && requestedOrgId > 0 && requestedOrgId !== curOrgId;
    if (wantsOrgChange) {
      const org = await Agency.findById(requestedOrgId);
      if (!org) {
        return res.status(400).json({ error: { message: 'Selected organization not found' } });
      }
      const t = String(org.organization_type || 'agency').toLowerCase();
      if (!['school', 'program', 'learning'].includes(t)) {
        return res.status(400).json({ error: { message: 'Clients can only be assigned to a school/program/learning organization' } });
      }
      // Ensure org is linked to the client's agency for non-super-admins.
      if (String(userRole || '').toLowerCase() !== 'super_admin') {
        const connection = await pool.getConnection();
        try {
          const linked = await isOrgLinkedToAgency({
            connection,
            agencyId: parseInt(currentClient.agency_id, 10),
            organizationId: requestedOrgId
          });
          if (!linked) {
            return res.status(400).json({ error: { message: 'Selected organization is not linked to this agency' } });
          }
        } finally {
          connection.release();
        }
      }
    }

    // Update client
    let updatedClient = await Client.update(id, req.body, userId);

    // Keep multi-org assignments in sync when the primary organization is changed via the client profile.
    // Without this, the profile can show the "new" school (clients.organization_id) while the School Portal
    // roster still shows the client under the "old" school (client_organization_assignments).
    if (wantsOrgChange) {
      const clientId = parseInt(String(id), 10);
      const newOrgId = updatedClient.organization_id ? parseInt(String(updatedClient.organization_id), 10) : null;
      const oldOrgId = curOrgId;
      if (clientId && newOrgId && oldOrgId) {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const hasTable = async (tableName) => {
          try {
            const [t] = await pool.execute(
              "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
              [dbName, tableName]
            );
            return (t || []).length > 0;
          } catch {
            return false;
          }
        };

        const hasAffTable = await hasTable('client_organization_assignments');
        const hasProviderAssignmentsTable = await hasTable('client_provider_assignments');

        if (hasAffTable || hasProviderAssignmentsTable) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();

            // Move primary affiliation from old org -> new org.
            if (hasAffTable) {
              await conn.execute(
                `UPDATE client_organization_assignments
                 SET is_active = FALSE, is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
                 WHERE client_id = ? AND organization_id = ?`,
                [clientId, oldOrgId]
              );
              await conn.execute(
                `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
                 VALUES (?, ?, TRUE, TRUE)
                 ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = TRUE`,
                [clientId, newOrgId]
              );
              // Ensure only one primary.
              await conn.execute(
                `UPDATE client_organization_assignments
                 SET is_primary = CASE WHEN organization_id = ? THEN TRUE ELSE FALSE END
                 WHERE client_id = ?`,
                [newOrgId, clientId]
              );
            }

            // Deactivate provider assignments tied to the old org (if present) and refund slots.
            if (hasProviderAssignmentsTable) {
              try {
                const [assignRows] = await conn.execute(
                  `SELECT id, provider_user_id, service_day
                   FROM client_provider_assignments
                   WHERE client_id = ? AND organization_id = ? AND is_active = TRUE
                   FOR UPDATE`,
                  [clientId, oldOrgId]
                );
                for (const a of assignRows || []) {
                  if (a?.provider_user_id && a?.service_day) {
                    // eslint-disable-next-line no-await-in-loop
                    await adjustProviderSlots(conn, {
                      providerUserId: a.provider_user_id,
                      schoolId: oldOrgId,
                      dayOfWeek: a.service_day,
                      delta: +1
                    });
                  }
                  // eslint-disable-next-line no-await-in-loop
                  await conn.execute(
                    `UPDATE client_provider_assignments
                     SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [userId, a.id]
                  );
                }
              } catch (e) {
                const msg = String(e?.message || '');
                const missing =
                  msg.includes("doesn't exist") ||
                  msg.includes('ER_NO_SUCH_TABLE') ||
                  msg.includes('Unknown column') ||
                  msg.includes('ER_BAD_FIELD_ERROR');
                if (!missing) throw e;
              }
            }

            await conn.commit();
          } catch {
            try { await conn.rollback(); } catch { /* ignore */ }
          } finally {
            conn.release();
          }
        }
      }
    }

    // If client_status_id changes:
    // - auto-archive for Dead/Terminated
    // - adjust provider slots only when status is "current"
    // This keeps availability aligned with "current" as the capacity-driving status.
    if (req.body.client_status_id !== undefined) {
      try {
        const agencyId = currentClient.agency_id;
        const [statusRows] = await pool.execute(
          `SELECT id, status_key, label FROM client_statuses WHERE agency_id = ?`,
          [agencyId]
        );
        const currentStatusId = (statusRows || []).find((r) => String(r?.status_key || '').toLowerCase() === 'current')?.id || null;
        const newStatusRow = (statusRows || []).find((r) => parseInt(r?.id, 10) === parseInt(updatedClient.client_status_id || 0, 10)) || null;
        const newKey = String(newStatusRow?.status_key || '').toLowerCase();
        const newLabel = String(newStatusRow?.label || '').toLowerCase();
        const shouldArchive = newKey === 'dead' || newKey === 'terminated' || newLabel.includes('dead') || newLabel.includes('terminated');

        // Waitlist tracking: if a client enters waitlist and doesn't have a start date yet,
        // set waitlist_started_at so we can compute days + rank in school rosters.
        // (Best-effort: column may not exist until migration 298.)
        if (newKey === 'waitlist') {
          try {
            await pool.execute(
              `UPDATE clients
               SET waitlist_started_at = COALESCE(waitlist_started_at, CURDATE())
               WHERE id = ?`,
              [parseInt(id, 10)]
            );
            // Keep updatedClient in sync for immediate response.
            updatedClient = await Client.findById(id);
          } catch {
            // ignore
          }
        }

        const oldWorkflowArchived = String(currentClient.status || '').toUpperCase() === 'ARCHIVED';
        const newWorkflowArchived = shouldArchive || String(updatedClient.status || '').toUpperCase() === 'ARCHIVED';

        const oldProviderId = currentClient.provider_id ? parseInt(currentClient.provider_id, 10) : null;
        const oldDay = currentClient.service_day ? String(currentClient.service_day) : null;
        const oldOrgId = currentClient.organization_id ? parseInt(currentClient.organization_id, 10) : null;

        const newProviderId = updatedClient.provider_id ? parseInt(updatedClient.provider_id, 10) : null;
        const newDay = updatedClient.service_day ? String(updatedClient.service_day) : null;
        const newOrgId = updatedClient.organization_id ? parseInt(updatedClient.organization_id, 10) : null;

        const oldWasCurrent = !!(currentStatusId && parseInt(currentClient.client_status_id || 0, 10) === parseInt(currentStatusId, 10));
        const newIsCurrent = !!(currentStatusId && parseInt(updatedClient.client_status_id || 0, 10) === parseInt(currentStatusId, 10));

        const oldConsumesSlot = !!(oldWasCurrent && !oldWorkflowArchived && oldProviderId && oldDay && oldOrgId);
        const newConsumesSlot = !!(newIsCurrent && !newWorkflowArchived && newProviderId && newDay && newOrgId);

        const assignmentSame =
          oldProviderId &&
          oldDay &&
          oldOrgId &&
          newProviderId &&
          newDay &&
          newOrgId &&
          oldProviderId === newProviderId &&
          oldDay === newDay &&
          oldOrgId === newOrgId;

        if (currentStatusId && (oldConsumesSlot || newConsumesSlot) && (!assignmentSame || oldConsumesSlot !== newConsumesSlot)) {
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();

            if (oldConsumesSlot && (!newConsumesSlot || !assignmentSame)) {
              await adjustProviderSlots(conn, { providerUserId: oldProviderId, schoolId: oldOrgId, dayOfWeek: oldDay, delta: +1 });
            }

            if (newConsumesSlot && (!oldConsumesSlot || !assignmentSame)) {
              const take = await adjustProviderSlots(conn, {
                providerUserId: newProviderId,
                schoolId: newOrgId,
                dayOfWeek: newDay,
                delta: -1
              });
              if (!take.ok) {
                // Best-effort: do not block the update if capacity cannot be adjusted.
              }
            }

            await conn.commit();
          } catch {
            try { await conn.rollback(); } catch { /* ignore */ }
          } finally {
            conn.release();
          }
        }

        // Auto-archive after adjusting capacity (so we can release slots as needed).
        if (shouldArchive && String(updatedClient.status || '').toUpperCase() !== 'ARCHIVED') {
          try {
            updatedClient = await Client.update(id, { status: 'ARCHIVED' }, userId);
          } catch {
            // best-effort
          }
        }
      } catch {
        // best-effort: never block the update if slot adjustment fails
      }
    }

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

    // Archive permission: only admin/staff/support/super_admin may archive.
    const roleNorm = String(userRole || '').toLowerCase();
    const canArchive = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (String(status || '').toUpperCase() === 'ARCHIVED' && !canArchive) {
      return res.status(403).json({ error: { message: 'Only admin/staff can archive clients' } });
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
 * Update client compliance checklist (operational)
 * PUT /api/clients/:id/compliance-checklist
 */
export const updateClientComplianceChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const clientId = parseInt(id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const userRole = req.user.role;

    const currentClient = await Client.findById(clientId, { includeSensitive: true });
    if (!currentClient) return res.status(404).json({ error: { message: 'Client not found' } });

    // Permission: provider assigned to client, or agency staff/admin/support/super_admin.
    const isSuper = userRole === 'super_admin';
    const roleNorm = String(userRole || '').toLowerCase();
    const isAgencyStaffRole = ['admin', 'support', 'staff'].includes(roleNorm);
    let isAssignedProvider = false;
    if (roleNorm === 'provider') {
      // Prefer new multi-provider assignment table; fall back to legacy clients.provider_id.
      try {
        const [rows] = await pool.execute(
          `SELECT 1
           FROM client_provider_assignments
           WHERE client_id = ?
             AND provider_user_id = ?
             AND is_active = TRUE
           LIMIT 1`,
          [clientId, userId]
        );
        isAssignedProvider = !!rows?.[0];
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (!missing) throw e;
        isAssignedProvider = parseInt(currentClient.provider_id || 0, 10) === parseInt(userId, 10);
      }
    }
    if (!isSuper && !isAgencyStaffRole && !isAssignedProvider) {
      return res.status(403).json({ error: { message: 'You do not have permission to update this checklist' } });
    }

    // Validate user has access to the agency/org (unless super admin).
    if (!isSuper) {
      const userOrgs = await User.getAgencies(userId);
      const ids = (userOrgs || []).map((o) => o.id);
      const hasAgencyAccess = ids.includes(currentClient.agency_id);
      const hasOrgAccess = ids.includes(currentClient.organization_id);
      if (!hasAgencyAccess && !hasOrgAccess && !isAssignedProvider) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const parseDate = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const s = String(v).trim();
      // Expect YYYY-MM-DD from <input type="date">
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      return s;
    };

    const parentsContactedAt = parseDate(req.body?.parentsContactedAt);
    const intakeAt = parseDate(req.body?.intakeAt);
    const firstServiceAt = parseDate(req.body?.firstServiceAt);
    const pcs = req.body?.parentsContactedSuccessful;
    const parentsContactedSuccessful =
      pcs === null || pcs === undefined || pcs === ''
        ? null
        : (pcs === true || pcs === 'true' || pcs === 1 || pcs === '1');

    await pool.execute(
      `UPDATE clients
       SET parents_contacted_at = ?,
           parents_contacted_successful = ?,
           intake_at = ?,
           first_service_at = ?,
           checklist_updated_by_user_id = ?,
           checklist_updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        parentsContactedAt,
        parentsContactedSuccessful === null ? null : (parentsContactedSuccessful ? 1 : 0),
        intakeAt,
        firstServiceAt,
        userId,
        clientId
      ]
    );

    // History entry (lightweight)
    try {
      await pool.execute(
        `INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
         VALUES (?, ?, 'compliance_checklist', ?, ?, ?)`,
        [
          clientId,
          userId,
          null,
          JSON.stringify({ parentsContactedAt, parentsContactedSuccessful, intakeAt, firstServiceAt }),
          'Updated compliance checklist'
        ]
      );
    } catch {
      // ignore
    }

    const updated = await Client.findById(clientId, { includeSensitive: true });
    // Attach audit name for display (best-effort)
    let updatedByName = null;
    if (updated?.checklist_updated_by_user_id) {
      try {
        const u = await User.findById(updated.checklist_updated_by_user_id);
        if (u?.first_name || u?.last_name) updatedByName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      } catch {
        updatedByName = null;
      }
    }

    res.json({ ...updated, checklist_updated_by_name: updatedByName });
  } catch (e) {
    next(e);
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

    // Permission check: agency-side admin/staff/support/super_admin can assign providers
    const roleNorm = String(userRole || '').toLowerCase();
    const canAssign = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (!canAssign) {
      return res.status(403).json({ 
        error: { message: 'Only admin/staff can assign providers' } 
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
        `SELECT id, agency_id, provider_id, organization_id, service_day, client_status_id
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
      const workflowArchived = String(currentClient.status || '').toUpperCase() === 'ARCHIVED';
      const [curStatusRows] = await connection.execute(
        `SELECT id FROM client_statuses WHERE agency_id = ? AND status_key = 'current' LIMIT 1`,
        [currentClient.agency_id]
      );
      const currentStatusId = curStatusRows?.[0]?.id || null;
      const clientStatusId = currentClient.client_status_id ? parseInt(currentClient.client_status_id, 10) : null;
      const oldConsumesSlot = !!(currentStatusId && clientStatusId === currentStatusId && oldProviderId && oldDay && !workflowArchived);

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

      // Slot adjustments only apply to CURRENT client status.
      const newConsumesSlot = !!(currentStatusId && clientStatusId === currentStatusId && providerId && targetDay && !workflowArchived);
      const sameAssignment = providerId === oldProviderId && targetDay === oldDay;

      if (oldConsumesSlot && (!sameAssignment || !newConsumesSlot)) {
        await adjustProviderSlots(connection, { providerUserId: oldProviderId, schoolId, dayOfWeek: oldDay, delta: +1 });
      }

      if (newConsumesSlot && (!sameAssignment || !oldConsumesSlot)) {
        let take = await adjustProviderSlots(connection, {
          providerUserId: providerId,
          schoolId,
          dayOfWeek: targetDay,
          delta: -1
        });
        if (!take.ok && String(take.reason || '').toLowerCase().includes('not scheduled')) {
          // Best-effort: auto-create a default schedule entry (08:00–15:00, 7 slots) then retry.
          // Also ensure the provider is affiliated to the school organization for portal/profile visibility.
          try {
            await connection.execute(
              `INSERT INTO user_agencies (user_id, agency_id)
               VALUES (?, ?)
               ON DUPLICATE KEY UPDATE user_id = user_id`,
              [providerId, schoolId]
            );
          } catch {
            // ignore (best-effort)
          }

          let currentCount = 0;
          if (currentStatusId) {
            try {
              const [cntRows] = await connection.execute(
                `SELECT COUNT(*) AS cnt
                 FROM client_provider_assignments cpa
                 JOIN clients c ON c.id = cpa.client_id
                 WHERE c.agency_id = ?
                   AND cpa.organization_id = ?
                   AND cpa.provider_user_id = ?
                   AND cpa.service_day = ?
                   AND cpa.is_active = TRUE
                   AND c.status <> 'ARCHIVED'
                   AND c.client_status_id = ?`,
                [currentClient.agency_id, schoolId, providerId, targetDay, currentStatusId]
              );
              currentCount = parseInt(String(cntRows?.[0]?.cnt ?? 0), 10) || 0;
            } catch (e) {
              const msg = String(e?.message || '');
              const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
              if (!missing) throw e;
              const [cntRows] = await connection.execute(
                `SELECT COUNT(*) AS cnt
                 FROM clients
                 WHERE agency_id = ?
                   AND organization_id = ?
                   AND provider_id = ?
                   AND service_day = ?
                   AND status <> 'ARCHIVED'
                   AND client_status_id = ?`,
                [currentClient.agency_id, schoolId, providerId, targetDay, currentStatusId]
              );
              currentCount = parseInt(String(cntRows?.[0]?.cnt ?? 0), 10) || 0;
            }
          }

          const slotsTotal = 7;
          const slotsAvailable = Math.max(0, slotsTotal - currentCount);
          await connection.execute(
            `INSERT INTO provider_school_assignments
              (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active)
             VALUES (?, ?, ?, ?, ?, '08:00:00', '15:00:00', TRUE)
             ON DUPLICATE KEY UPDATE is_active = TRUE`,
            [providerId, schoolId, targetDay, slotsTotal, slotsAvailable]
          );
          take = await adjustProviderSlots(connection, {
            providerUserId: providerId,
            schoolId,
            dayOfWeek: targetDay,
            delta: -1
          });
        }
        if (!take.ok) {
          await connection.rollback();
          return res.status(400).json({ error: { message: take.reason } });
        }
      }

      // If provider cleared, clear day too.
      const finalProviderId = providerId;
      const finalDay = finalProviderId ? targetDay : null;
      const newConsumesSlotFinal = !!(currentStatusId && clientStatusId === currentStatusId && finalProviderId && finalDay);

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
      // Notifications: client is current and newly assigned a provider/day (slot-consuming)
      if (!oldConsumesSlot && newConsumesSlotFinal) {
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
 * Permanently delete a client (archived-only safety).
 * DELETE /api/clients/:id
 */
export const deleteClient = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user?.id;
    const role = req.user?.role;
    const roleNorm = String(role || '').toLowerCase();
    if (roleNorm !== 'admin' && roleNorm !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    // Access check (agency-side only).
    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT id, status
         FROM clients
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [clientId]
      );
      const c = rows?.[0] || null;
      if (!c) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Client not found' } });
      }
      if (String(c.status || '').toUpperCase() !== 'ARCHIVED') {
        await conn.rollback();
        return res.status(409).json({ error: { message: 'Client must be archived before it can be deleted.' } });
      }

      // Rely on ON DELETE CASCADE wherever available; the base clients row must be removed last.
      // Best-effort deletes first for tables that may not be cascading in older DBs.
      const bestEffortDelete = async (sql, params) => {
        try {
          await conn.execute(sql, params);
        } catch (e) {
          const msg = String(e?.message || '');
          const missing = msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist");
          if (!missing) throw e;
        }
      };

      await bestEffortDelete(`DELETE FROM client_note_reads WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_notes WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_status_history WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_paperwork_history WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_paperwork_items WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_access_logs WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_phi_documents WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_guardians WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_provider_assignments WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM client_organization_assignments WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM soft_schedule_slots WHERE client_id = ?`, [clientId]);
      await bestEffortDelete(`DELETE FROM school_provider_schedule_entries WHERE client_id = ?`, [clientId]);

      const [del] = await conn.execute(`DELETE FROM clients WHERE id = ?`, [clientId]);
      await conn.commit();

      res.json({ ok: true, deleted: (del?.affectedRows || 0) > 0 });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
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

const parseYmdDateOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  // Expect YYYY-MM-DD from <input type="date">
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
};

/**
 * Get client paperwork/document status history (agency-only)
 * GET /api/clients/:id/paperwork-history
 */
export const getClientPaperworkHistory = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const userRole = req.user.role;

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    // Only agency-side access (admin/staff/support/provider via agency); no school-only access.
    if (userRole !== 'super_admin') {
      const userOrgs = await User.getAgencies(userId);
      const ids = (userOrgs || []).map((o) => o.id);
      const hasAgencyAccess = ids.includes(client.agency_id);
      if (!hasAgencyAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this client' } });
      }
    }

    // Best-effort: table may not exist yet in older environments.
    try {
      const [rows] = await pool.execute(
        `SELECT h.*,
                ps.label AS paperwork_status_label,
                ps.status_key AS paperwork_status_key,
                pdm.label AS paperwork_delivery_method_label,
                pdm.method_key AS paperwork_delivery_method_key,
                CONCAT(u.first_name, ' ', u.last_name) AS changed_by_name
         FROM client_paperwork_history h
         LEFT JOIN paperwork_statuses ps ON ps.id = h.paperwork_status_id
         LEFT JOIN paperwork_delivery_methods pdm ON pdm.id = h.paperwork_delivery_method_id
         LEFT JOIN users u ON u.id = h.changed_by_user_id
         WHERE h.client_id = ?
         ORDER BY h.effective_date DESC, h.id DESC
         LIMIT 500`,
        [clientId]
      );
      return res.json(rows || []);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (missing) return res.json([]);
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Create a dated paperwork/document status entry (updates current client fields too).
 * POST /api/clients/:id/paperwork-history
 * body: { paperwork_status_id, paperwork_delivery_method_id?, effective_date, note? }
 */
export const createClientPaperworkHistory = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const roleNorm = String(req.user.role || '').toLowerCase();
    const canWrite = roleNorm === 'super_admin' || roleNorm === 'admin' || roleNorm === 'support' || roleNorm === 'staff';
    if (!canWrite) {
      return res.status(403).json({ error: { message: 'Only admin/staff can update document status history' } });
    }

    const paperworkStatusIdRaw = req.body?.paperwork_status_id;
    const paperworkStatusId = paperworkStatusIdRaw === null || paperworkStatusIdRaw === '' || paperworkStatusIdRaw === undefined
      ? null
      : parseInt(paperworkStatusIdRaw, 10);
    if (!paperworkStatusId) {
      return res.status(400).json({ error: { message: 'paperwork_status_id is required' } });
    }

    const deliveryIdRaw = req.body?.paperwork_delivery_method_id;
    const paperworkDeliveryMethodId =
      deliveryIdRaw === null || deliveryIdRaw === '' || deliveryIdRaw === undefined ? null : parseInt(deliveryIdRaw, 10);

    const effectiveDate = parseYmdDateOrNull(req.body?.effective_date);
    if (!effectiveDate) {
      return res.status(400).json({ error: { message: 'effective_date is required (YYYY-MM-DD)' } });
    }

    const note = req.body?.note ? String(req.body.note).trim() : null;
    const roiExpiresAt = parseYmdDateOrNull(req.body?.roi_expires_at);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [clientRows] = await connection.execute(
        `SELECT id, agency_id, organization_id, paperwork_status_id, paperwork_delivery_method_id, doc_date, paperwork_received_at
         FROM clients
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [clientId]
      );
      const currentClient = clientRows?.[0] || null;
      if (!currentClient) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Client not found' } });
      }

      // Access: must have agency access (unless super_admin).
      if (roleNorm !== 'super_admin') {
        const userOrgs = await User.getAgencies(userId);
        const ids = (userOrgs || []).map((o) => o.id);
        const hasAgencyAccess = ids.includes(currentClient.agency_id);
        if (!hasAgencyAccess) {
          await connection.rollback();
          return res.status(403).json({ error: { message: 'You do not have access to this client' } });
        }
      }

      // Validate paperwork status belongs to the client's agency.
      const [statusRows] = await connection.execute(
        `SELECT id, status_key FROM paperwork_statuses WHERE id = ? AND agency_id = ? LIMIT 1`,
        [paperworkStatusId, currentClient.agency_id]
      );
      const statusRow = statusRows?.[0] || null;
      if (!statusRow) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Invalid paperwork_status_id for this client' } });
      }
      const statusKey = String(statusRow.status_key || '').toLowerCase();

      // ROI expiration: required when status is ROI.
      let nextRoiExpiresAt = null;
      if (statusKey === 'roi') {
        if (!roiExpiresAt) {
          await connection.rollback();
          return res.status(400).json({ error: { message: 'roi_expires_at is required when paperwork status is ROI (YYYY-MM-DD)' } });
        }
        nextRoiExpiresAt = roiExpiresAt;
      }

      // Validate delivery method belongs to the client's school/org, if provided.
      if (paperworkDeliveryMethodId) {
        const [deliveryRows] = await connection.execute(
          `SELECT id FROM paperwork_delivery_methods WHERE id = ? AND school_organization_id = ? LIMIT 1`,
          [paperworkDeliveryMethodId, currentClient.organization_id]
        );
        if (!deliveryRows?.[0]?.id) {
          await connection.rollback();
          return res.status(400).json({ error: { message: 'Invalid paperwork_delivery_method_id for this school' } });
        }
      }

      // Insert history row.
      await connection.execute(
        `INSERT INTO client_paperwork_history
          (client_id, paperwork_status_id, paperwork_delivery_method_id, effective_date, roi_expires_at, note, changed_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [clientId, paperworkStatusId, paperworkDeliveryMethodId, effectiveDate, nextRoiExpiresAt, note, userId]
      );

      // Update current fields on clients.
      const completed = statusKey === 'completed';
      const nextReceivedAt = completed && !currentClient.paperwork_received_at ? effectiveDate : undefined;

      // NOTE: doc_date is treated as "effective date of current paperwork status".
      const updates = [
        `paperwork_status_id = ?`,
        `paperwork_delivery_method_id = ?`,
        `doc_date = ?`,
        `roi_expires_at = ?`,
        `updated_by_user_id = ?`,
        `last_activity_at = CURRENT_TIMESTAMP`
      ];
      const values = [paperworkStatusId, paperworkDeliveryMethodId, effectiveDate, nextRoiExpiresAt, userId];
      if (nextReceivedAt !== undefined) {
        updates.push(`paperwork_received_at = ?`);
        values.push(nextReceivedAt);
      }
      values.push(clientId);

      await connection.execute(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      await connection.commit();

      // Return the latest client snapshot + history (best-effort).
      const updatedClient = await Client.findById(clientId, { includeSensitive: true });
      res.status(201).json({ ok: true, client: updatedClient });
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
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
    const roleNorm = String(userRole || '').toLowerCase();
    const canViewInternalNotes = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);

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
    const notes = await ClientNotes.findByClientId(id, {
      hasAgencyAccess: userRole === 'super_admin' ? true : hasAgencyAccess,
      canViewInternalNotes
    });
    logClientAccess(req, parseInt(id, 10), 'view_client_notes').catch(() => {});
    res.json(notes);
  } catch (error) {
    console.error('Get client notes error:', error);
    next(error);
  }
};

/**
 * Get client admin note (single internal note shown on Overview).
 * GET /api/clients/:id/admin-note
 */
export const getClientAdminNote = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const canViewInternalNotes = ['super_admin', 'admin', 'support', 'staff', 'supervisor'].includes(roleNorm);
    if (!canViewInternalNotes) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const currentClient = await Client.findById(clientId);
    if (!currentClient) return res.status(404).json({ error: { message: 'Client not found' } });

    // Agency access (super admin can always view)
    let hasAgencyAccess = roleNorm === 'super_admin';
    if (!hasAgencyAccess) {
      const orgs = await User.getAgencies(userId);
      const ids = (orgs || []).map((o) => o.id);
      hasAgencyAccess = ids.includes(currentClient.agency_id);
      if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'You do not have access to this client' } });
    }

    const notes = await ClientNotes.findByClientId(clientId, { hasAgencyAccess: true, canViewInternalNotes: true });
    const adminNote =
      (notes || []).find((n) => n && n.is_internal_only && String(n.category || '').toLowerCase() === 'administrative') ||
      (notes || []).find((n) => n && n.is_internal_only) ||
      null;

    res.json({ note: adminNote ? { id: adminNote.id, message: adminNote.message, updated_at: adminNote.updated_at, created_at: adminNote.created_at } : null });
  } catch (e) {
    next(e);
  }
};

/**
 * Upsert client admin note (single internal note shown on Overview).
 * PUT /api/clients/:id/admin-note
 * body: { message }
 */
export const upsertClientAdminNote = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });

    const userId = req.user?.id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const canViewInternalNotes = ['super_admin', 'admin', 'support', 'staff', 'supervisor'].includes(roleNorm);
    if (!canViewInternalNotes) return res.status(403).json({ error: { message: 'Access denied' } });

    const currentClient = await Client.findById(clientId);
    if (!currentClient) return res.status(404).json({ error: { message: 'Client not found' } });

    if (roleNorm !== 'super_admin') {
      const orgs = await User.getAgencies(userId);
      const ids = (orgs || []).map((o) => o.id);
      const hasAgencyAccess = ids.includes(currentClient.agency_id);
      if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'You do not have access to this client' } });
    }

    const notes = await ClientNotes.findByClientId(clientId, { hasAgencyAccess: true, canViewInternalNotes: true });
    const existing =
      (notes || []).find((n) => n && n.is_internal_only && String(n.category || '').toLowerCase() === 'administrative') ||
      (notes || []).find((n) => n && n.is_internal_only) ||
      null;

    let saved = null;
    if (existing?.id) {
      try {
        saved = await ClientNotes.update(existing.id, { message }, userId, roleNorm);
      } catch (e) {
        return res.status(403).json({ error: { message: e?.message || 'Unable to update admin note' } });
      }
    } else {
      saved = await ClientNotes.create(
        { client_id: clientId, author_id: userId, message, is_internal_only: true, category: 'administrative', urgency: 'low' },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
    }

    res.status(201).json({ note: saved });
  } catch (e) {
    next(e);
  }
};

/**
 * Create client note
 * POST /api/clients/:id/notes
 */
export const createClientNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, is_internal_only = false, category = 'general', urgency = 'low' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const roleNorm = String(userRole || '').toLowerCase();
    const canViewInternalNotes = ['super_admin', 'admin', 'support', 'staff'].includes(roleNorm);

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
      category,
      urgency
    }, {
      hasAgencyAccess: userRole === 'super_admin' ? true : hasAgencyAccess,
      canViewInternalNotes
    });
    logClientAccess(req, parseInt(id, 10), 'create_client_note').catch(() => {});

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
      // Do not notify providers for internal-only notes (they cannot view them).
      if (!is_internal_only && currentClient.provider_id && currentClient.provider_id !== userId) {
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
 * Get client access log (admin/support/staff)
 * GET /api/clients/:id/access-log
 */
export const getClientAccessLog = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userRole = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'support', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const access = await ensureAgencyAccessToClient({ userId: req.user.id, role: userRole, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      `SELECT l.*,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email
       FROM client_access_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.client_id = ?
       ORDER BY l.created_at DESC
       LIMIT 200`,
      [clientId]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * Mark client notes as read for the current user (per-client thread).
 * POST /api/clients/:id/notes/read
 */
export const markClientNotesRead = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // Permission check: reuse the same access rule as notes fetch.
    const currentClient = await Client.findById(clientId);
    if (!currentClient) return res.status(404).json({ error: { message: 'Client not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userOrgIds = (userAgencies || []).map(a => a.id);
      const hasAgencyAccess = userOrgIds.includes(currentClient.agency_id);
      const hasSchoolAccess = userOrgIds.includes(currentClient.organization_id);
      if (!hasAgencyAccess && !hasSchoolAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this client' } });
      }
    }

    // Best-effort insert/update; table may not exist yet in older environments.
    try {
      await pool.execute(
        `INSERT INTO client_note_reads (client_id, user_id, last_read_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE last_read_at = CURRENT_TIMESTAMP`,
        [clientId, userId]
      );
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

const isBackofficeRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff';
};

async function ensureAgencyAccessToClient({ userId, role, clientId }) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) return { ok: false, status: 404, message: 'Client not found', client: null };
  if (String(role || '').toLowerCase() === 'super_admin') return { ok: true, client };
  const orgs = await User.getAgencies(userId);
  const userAgencyIds = (orgs || []).map((o) => parseInt(o.id, 10)).filter(Boolean);

  // Prefer multi-agency client affiliations when available.
  let hasAgencyAccess = false;
  try {
    const placeholders = userAgencyIds.length ? userAgencyIds.map(() => '?').join(',') : '';
    if (placeholders) {
      const [rows] = await pool.execute(
        `SELECT 1
         FROM client_agency_assignments
         WHERE client_id = ?
           AND is_active = TRUE
           AND agency_id IN (${placeholders})
         LIMIT 1`,
        [parseInt(clientId, 10), ...userAgencyIds]
      );
      hasAgencyAccess = !!rows?.[0]?.['1'] || rows.length > 0;
    }
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (!missing) throw e;
    // Fall back to legacy single-agency check.
    hasAgencyAccess = userAgencyIds.some((id) => id === parseInt(client.agency_id, 10));
  }
  // Safety fallback: if the multi-agency table exists but doesn't have a row yet
  // (e.g., client created before seeding), fall back to the legacy primary agency_id.
  if (!hasAgencyAccess) {
    const legacyAgencyId = parseInt(client?.agency_id, 10);
    if (Number.isFinite(legacyAgencyId) && legacyAgencyId > 0) {
      hasAgencyAccess = userAgencyIds.some((id) => id === legacyAgencyId);
    }
  }
  if (!hasAgencyAccess) return { ok: false, status: 403, message: 'You do not have access to this client', client };
  return { ok: true, client };
}

async function isOrgLinkedToAgency({ connection, agencyId, organizationId }) {
  // Prefer organization_affiliations; fall back to legacy agency_schools.
  const [rows] = await connection.execute(
    `SELECT id
     FROM organization_affiliations
     WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE
     LIMIT 1`,
    [agencyId, organizationId]
  );
  if (rows?.[0]?.id) return true;
  try {
    const [legacy] = await connection.execute(
      `SELECT id
       FROM agency_schools
       WHERE agency_id = ? AND school_organization_id = ? AND (is_active = TRUE OR is_active IS NULL)
       LIMIT 1`,
      [agencyId, organizationId]
    );
    return !!legacy?.[0]?.id;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return false;
    throw e;
  }
}

/**
 * List client affiliations (multi-org)
 * GET /api/clients/:id/affiliations
 */
export const listClientAffiliations = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    try {
      const [rows] = await pool.execute(
        `SELECT coa.organization_id,
                coa.is_primary,
                coa.is_active,
                org.name AS organization_name,
                org.slug AS organization_slug,
                org.organization_type
         FROM client_organization_assignments coa
         JOIN agencies org ON org.id = coa.organization_id
         WHERE coa.client_id = ?
           AND coa.is_active = TRUE
         ORDER BY coa.is_primary DESC, org.name ASC`,
        [clientId]
      );
      return res.json(rows || []);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      // Fallback: legacy single org
      const c = access.client;
      return res.json(
        c?.organization_id
          ? [
              {
                organization_id: c.organization_id,
                is_primary: true,
                is_active: true,
                organization_name: c.organization_name || null,
                organization_slug: c.organization_slug || null,
                organization_type: null
              }
            ]
          : []
      );
    }
  } catch (e) {
    next(e);
  }
};

/**
 * List client agency affiliations (multi-agency)
 * GET /api/clients/:id/agency-affiliations
 */
export const listClientAgencyAffiliations = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Best-effort: table may not exist yet.
    try {
      const [rows] = await pool.execute(
        `SELECT ca.agency_id,
                ca.is_primary,
                ca.is_active,
                a.name AS agency_name
         FROM client_agency_assignments ca
         LEFT JOIN agencies a ON a.id = ca.agency_id
         WHERE ca.client_id = ?
           AND ca.is_active = TRUE
         ORDER BY ca.is_primary DESC, a.name ASC`,
        [clientId]
      );
      return res.json(rows || []);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      const c = access.client;
      return res.json(
        c?.agency_id
          ? [{ agency_id: c.agency_id, is_primary: true, is_active: true, agency_name: c.agency_name || null }]
          : []
      );
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Add/update a client agency affiliation (and optionally set primary)
 * POST /api/clients/:id/agency-affiliations
 * body: { agency_id, is_primary? }
 */
export const upsertClientAgencyAffiliation = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const agencyId = parseInt(req.body?.agency_id, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agency_id is required' } });
    const makePrimary = req.body?.is_primary === true || req.body?.is_primary === 'true' || req.body?.is_primary === 1 || req.body?.is_primary === '1';

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Ensure the user has access to the target agency unless super_admin.
    if (String(role || '').toLowerCase() !== 'super_admin') {
      const orgs = await User.getAgencies(userId);
      const has = (orgs || []).some((o) => Number(o?.id) === Number(agencyId));
      if (!has) return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Best-effort: table may not exist yet. If missing, fall back to updating clients.agency_id only.
      let tableExists = true;
      try {
        await connection.execute(`SELECT 1 FROM client_agency_assignments LIMIT 1`);
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (missing) tableExists = false;
        else throw e;
      }

      if (tableExists) {
        await connection.execute(
          `INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active)
           VALUES (?, ?, ?, TRUE)
           ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = GREATEST(is_primary, VALUES(is_primary))`,
          [clientId, agencyId, makePrimary ? 1 : 0]
        );
        if (makePrimary) {
          await connection.execute(
            `UPDATE client_agency_assignments
             SET is_primary = CASE WHEN agency_id = ? THEN TRUE ELSE FALSE END
             WHERE client_id = ?`,
            [agencyId, clientId]
          );
        }
      }

      if (makePrimary) {
        // Switching primary agency changes agency-scoped fields; reset to avoid cross-agency foreign keys.
        await connection.execute(
          `UPDATE clients
           SET agency_id = ?,
               client_status_id = NULL,
               paperwork_status_id = NULL,
               insurance_type_id = NULL,
               updated_by_user_id = ?,
               last_activity_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [agencyId, userId, clientId]
        );
      }

      await connection.commit();
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }

    const updated = await Client.findById(clientId, { includeSensitive: true });
    res.json({ ok: true, client: updated });
  } catch (e) {
    next(e);
  }
};

/**
 * Remove (deactivate) a client agency affiliation
 * DELETE /api/clients/:id/agency-affiliations/:agencyId
 */
export const removeClientAgencyAffiliation = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!clientId || !agencyId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    // Best-effort: table may not exist yet.
    try {
      const [rows] = await pool.execute(
        `SELECT agency_id, is_primary
         FROM client_agency_assignments
         WHERE client_id = ? AND agency_id = ?
         LIMIT 1`,
        [clientId, agencyId]
      );
      const row = rows?.[0] || null;
      if (!row) return res.json({ ok: true });
      if (row.is_primary === 1 || row.is_primary === true) {
        return res.status(400).json({ error: { message: 'Cannot remove the primary agency. Set another primary first.' } });
      }
      await pool.execute(
        `UPDATE client_agency_assignments
         SET is_active = FALSE
         WHERE client_id = ? AND agency_id = ?`,
        [clientId, agencyId]
      );
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      // No-op if table missing.
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * Add/update a client affiliation
 * POST /api/clients/:id/affiliations
 * body: { organization_id, is_primary? }
 */
export const upsertClientAffiliation = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const orgId = parseInt(req.body?.organization_id, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'organization_id is required' } });
    const makePrimary = req.body?.is_primary === true || req.body?.is_primary === 'true' || req.body?.is_primary === 1 || req.body?.is_primary === '1';

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const client = access.client;

      // Ensure the org exists and is a child org type
      const org = await Agency.findById(orgId);
      if (!org) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Organization not found' } });
      }
      const t = String(org.organization_type || 'agency').toLowerCase();
      if (!['school', 'program', 'learning'].includes(t)) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Affiliations must be school/program/learning organizations' } });
      }

      // Ensure org is linked to the client’s agency
      const linked = await isOrgLinkedToAgency({ connection, agencyId: client.agency_id, organizationId: orgId });
      if (!linked && String(role || '').toLowerCase() !== 'super_admin') {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Selected organization is not linked to this agency' } });
      }

      // Upsert affiliation
      await connection.execute(
        `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
         VALUES (?, ?, ?, TRUE)
         ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = GREATEST(is_primary, VALUES(is_primary))`,
        [clientId, orgId, makePrimary ? 1 : 0]
      );

      if (makePrimary) {
        // Ensure only one primary and keep legacy primary org column in sync.
        await connection.execute(
          `UPDATE client_organization_assignments
           SET is_primary = CASE WHEN organization_id = ? THEN TRUE ELSE FALSE END
           WHERE client_id = ?`,
          [orgId, clientId]
        );
        await connection.execute(`UPDATE clients SET organization_id = ?, updated_by_user_id = ? WHERE id = ?`, [orgId, userId, clientId]);
      }

      await connection.commit();
      // Return updated list
      const [rows] = await pool.execute(
        `SELECT coa.organization_id,
                coa.is_primary,
                coa.is_active,
                org.name AS organization_name,
                org.slug AS organization_slug,
                org.organization_type
         FROM client_organization_assignments coa
         JOIN agencies org ON org.id = coa.organization_id
         WHERE coa.client_id = ?
           AND coa.is_active = TRUE
         ORDER BY coa.is_primary DESC, org.name ASC`,
        [clientId]
      );
      res.status(201).json(rows || []);
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Remove a client affiliation (also deactivates provider assignments for that org and refunds slots).
 * DELETE /api/clients/:id/affiliations/:organizationId
 */
export const removeClientAffiliation = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const orgId = parseInt(req.params.organizationId, 10);
    if (!clientId || !orgId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Prevent removing the primary affiliation (must pick a new primary first).
      const [primaryRows] = await connection.execute(
        `SELECT is_primary FROM client_organization_assignments WHERE client_id = ? AND organization_id = ? LIMIT 1 FOR UPDATE`,
        [clientId, orgId]
      );
      if (primaryRows?.[0]?.is_primary) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Cannot remove the primary affiliation. Set a different primary first.' } });
      }

      // Refund slots for all active provider assignments in this org and deactivate them.
      try {
        const [assignRows] = await connection.execute(
          `SELECT id, provider_user_id, service_day
           FROM client_provider_assignments
           WHERE client_id = ? AND organization_id = ? AND is_active = TRUE
           FOR UPDATE`,
          [clientId, orgId]
        );
        for (const a of assignRows || []) {
          if (a?.provider_user_id && a?.service_day) {
            // eslint-disable-next-line no-await-in-loop
            await adjustProviderSlots(connection, { providerUserId: a.provider_user_id, schoolId: orgId, dayOfWeek: a.service_day, delta: +1 });
          }
          // eslint-disable-next-line no-await-in-loop
          await connection.execute(
            `UPDATE client_provider_assignments SET is_active = FALSE, updated_by_user_id = ? WHERE id = ?`,
            [userId, a.id]
          );
        }
      } catch (e) {
        const msg = String(e?.message || '');
        const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
        if (!missing) throw e;
      }

      // Deactivate affiliation
      await connection.execute(
        `UPDATE client_organization_assignments
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE client_id = ? AND organization_id = ?`,
        [clientId, orgId]
      );

      await connection.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * List provider assignments for a client (optionally scoped to an org).
 * GET /api/clients/:id/provider-assignments?organizationId=123
 */
export const listClientProviderAssignments = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const orgId = req.query?.organizationId ? parseInt(req.query.organizationId, 10) : null;

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const where = ['cpa.client_id = ?', 'cpa.is_active = TRUE'];
    const vals = [clientId];
    if (orgId) {
      where.push('cpa.organization_id = ?');
      vals.push(orgId);
    }

    try {
      const [rows] = await pool.execute(
        `SELECT cpa.id,
                cpa.client_id,
                cpa.organization_id,
                org.name AS organization_name,
                org.slug AS organization_slug,
                org.organization_type,
                cpa.provider_user_id,
                u.first_name AS provider_first_name,
                u.last_name AS provider_last_name,
                cpa.service_day,
                cpa.is_primary,
                cpa.created_at,
                cpa.updated_at
         FROM client_provider_assignments cpa
         JOIN agencies org ON org.id = cpa.organization_id
         JOIN users u ON u.id = cpa.provider_user_id
         WHERE ${where.join(' AND ')}
         ORDER BY org.name ASC, u.last_name ASC, u.first_name ASC`,
        vals
      );
      return res.json(rows || []);
    } catch (e) {
      const msg = String(e?.message || '');
      const missingTable = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (missingTable) return res.json([]);
      const missingIsPrimary = msg.includes('Unknown column') && msg.includes('cpa.is_primary');
      if (!missingIsPrimary) throw e;

      // Backward-compatible DB: no cpa.is_primary column yet.
      const [rows] = await pool.execute(
        `SELECT cpa.id,
                cpa.client_id,
                cpa.organization_id,
                org.name AS organization_name,
                org.slug AS organization_slug,
                org.organization_type,
                cpa.provider_user_id,
                u.first_name AS provider_first_name,
                u.last_name AS provider_last_name,
                cpa.service_day,
                cpa.created_at,
                cpa.updated_at
         FROM client_provider_assignments cpa
         JOIN agencies org ON org.id = cpa.organization_id
         JOIN users u ON u.id = cpa.provider_user_id
         WHERE ${where.join(' AND ')}
         ORDER BY org.name ASC, u.last_name ASC, u.first_name ASC`,
        vals
      );
      return res.json((rows || []).map((r) => ({ ...r, is_primary: false })));
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Upsert a provider assignment for a client+org (slot-accounted).
 * POST /api/clients/:id/provider-assignments
 * body: { organization_id, provider_user_id, service_day }
 */
export const upsertClientProviderAssignment = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const orgId = parseInt(req.body?.organization_id, 10);
    const providerUserId = parseInt(req.body?.provider_user_id, 10);
    const rawDay = req.body?.service_day ? String(req.body.service_day).trim() : '';
    const requestedPrimary = req.body?.is_primary === true || req.body?.is_primary === 1 || req.body?.is_primary === '1';
    // Note: client_provider_assignments.service_day is an ENUM of weekdays (NULL allowed).
    // We support "Unknown" in the API as a UI convenience, but store it as NULL.
    const allowedDays = ['Unknown', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (!orgId || !providerUserId || !rawDay || !allowedDays.includes(rawDay)) {
      return res.status(400).json({ error: { message: 'organization_id, provider_user_id, and valid service_day are required (Unknown or weekday)' } });
    }
    const serviceDay = rawDay === 'Unknown' ? null : rawDay;

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const client = access.client;

      // Ensure client is affiliated to this org
      const [affRows] = await connection.execute(
        `SELECT is_active FROM client_organization_assignments WHERE client_id = ? AND organization_id = ? LIMIT 1`,
        [clientId, orgId]
      );
      if (!affRows?.[0]?.is_active) {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Client is not affiliated to the selected organization' } });
      }

      // Ensure provider belongs to client's agency (best-effort)
      const [provAgencyRows] = await connection.execute(
        `SELECT 1
         FROM user_agencies ua
         WHERE ua.user_id = ? AND ua.agency_id = ?
         LIMIT 1`,
        [providerUserId, client.agency_id]
      );
      if (!provAgencyRows?.[0] && String(role || '').toLowerCase() !== 'super_admin') {
        await connection.rollback();
        return res.status(400).json({ error: { message: 'Provider is not part of this agency' } });
      }

      // Upsert with slot accounting
      const [existingRows] = await connection.execute(
        `SELECT id, is_active, service_day
         FROM client_provider_assignments
         WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [clientId, orgId, providerUserId]
      );
      const existing = existingRows?.[0] || null;

      const oldDay = existing?.service_day ? String(existing.service_day) : null;
      const wasActive = existing ? (existing.is_active === 1 || existing.is_active === true) : false;
      const oldConsumesSlot = wasActive && oldDay; // oldDay is NULL or weekday enum
      const newConsumesSlot = !!serviceDay;

      // Refund old slot if active and day changed
      if (oldConsumesSlot && oldDay !== serviceDay) {
        await adjustProviderSlots(connection, { providerUserId, schoolId: orgId, dayOfWeek: oldDay, delta: +1 });
      }

      // Take new slot if newly active or day changed
      if (newConsumesSlot && (!wasActive || oldDay !== serviceDay || !oldConsumesSlot)) {
        const take = await adjustProviderSlots(connection, { providerUserId, schoolId: orgId, dayOfWeek: serviceDay, delta: -1 });
        if (!take.ok) {
          await connection.rollback();
          return res.status(400).json({ error: { message: take.reason } });
        }
      }

      // Ensure "primary provider" is tracked (best-effort if column exists).
      if (requestedPrimary) {
        try {
          await connection.execute(
            `UPDATE client_provider_assignments
             SET is_primary = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE client_id = ?`,
            [userId, clientId]
          );
        } catch {
          // ignore (older DBs may not have column yet)
        }
      }

      if (!existing) {
        await connection.execute(
          `INSERT INTO client_provider_assignments
            (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id${requestedPrimary ? ', is_primary' : ''})
           VALUES (?, ?, ?, ?, TRUE, ?, ?${requestedPrimary ? ', TRUE' : ''})`,
          [clientId, orgId, providerUserId, serviceDay, userId, userId]
        );
      } else {
        await connection.execute(
          `UPDATE client_provider_assignments
           SET service_day = ?, is_active = TRUE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP${requestedPrimary ? ', is_primary = TRUE' : ''}
           WHERE id = ?`,
          [serviceDay, userId, existing.id]
        );
      }

      // Keep legacy single-provider fields in sync with the primary provider.
      if (requestedPrimary) {
        try {
          await connection.execute(
            `UPDATE clients
             SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [providerUserId, serviceDay, userId, clientId]
          );
        } catch {
          // ignore (best-effort)
        }
      }

      await connection.commit();
      res.status(201).json({ ok: true });
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Remove a provider assignment (slot refund).
 * DELETE /api/clients/:id/provider-assignments/:assignmentId
 */
export const removeClientProviderAssignment = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    if (!clientId || !assignmentId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const userId = req.user.id;
    const role = req.user.role;
    if (!isBackofficeRole(role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const access = await ensureAgencyAccessToClient({ userId, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        `SELECT id, client_id, organization_id, provider_user_id, service_day, is_active
         FROM client_provider_assignments
         WHERE id = ? AND client_id = ?
         LIMIT 1
         FOR UPDATE`,
        [assignmentId, clientId]
      );
      const a = rows?.[0] || null;
      if (!a) {
        await connection.rollback();
        return res.status(404).json({ error: { message: 'Assignment not found' } });
      }
      const active = a.is_active === 1 || a.is_active === true;
      if (active && a.provider_user_id && a.service_day) {
        await adjustProviderSlots(connection, { providerUserId: a.provider_user_id, schoolId: a.organization_id, dayOfWeek: a.service_day, delta: +1 });
      }
      await connection.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, assignmentId]
      );

      // Keep legacy single-provider fields in sync (snap back to Not assigned when none remain).
      // Prefer explicit primary if column exists, otherwise pick most recent active assignment.
      let next = null;
      try {
        const [nextRows] = await connection.execute(
          `SELECT provider_user_id, service_day
           FROM client_provider_assignments
           WHERE client_id = ? AND is_active = TRUE
           ORDER BY (CASE WHEN is_primary = TRUE THEN 1 ELSE 0 END) DESC, updated_at DESC
           LIMIT 1`,
          [clientId]
        );
        next = nextRows?.[0] || null;
      } catch (e) {
        const msg = String(e?.message || '');
        const missingIsPrimary = msg.includes('Unknown column') && msg.includes('is_primary');
        if (!missingIsPrimary) throw e;
        const [nextRows] = await connection.execute(
          `SELECT provider_user_id, service_day
           FROM client_provider_assignments
           WHERE client_id = ? AND is_active = TRUE
           ORDER BY updated_at DESC
           LIMIT 1`,
          [clientId]
        );
        next = nextRows?.[0] || null;
      }

      try {
        await connection.execute(
          `UPDATE clients
           SET provider_id = ?, service_day = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [next?.provider_user_id || null, next?.service_day || null, userId, clientId]
        );
      } catch {
        // best-effort
      }

      await connection.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await connection.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    next(e);
  }
};
