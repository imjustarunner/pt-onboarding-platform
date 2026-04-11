import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import OrganizationAffiliationRequest from '../models/OrganizationAffiliationRequest.model.js';
import User from '../models/User.model.js';
import { assertSchoolPortalAccess } from './schoolPortalIntakeLinks.controller.js';

function isMissingRequestsTableError(e) {
  const code = e?.code || '';
  const msg = String(e?.message || '');
  return code === 'ER_NO_SUCH_TABLE' || msg.includes('organization_affiliation_requests');
}

async function assertNotProvider(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'provider') {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
}

async function assertOrgPortalForAffiliationManagement(req, organizationId) {
  await assertNotProvider(req);
  return assertSchoolPortalAccess(req, organizationId, { allowClinical: true });
}

/**
 * POST /api/agencies/:agencyId/organization-affiliation-requests
 * Body: { organizationId }
 */
export const createOrganizationAffiliationRequest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.params.agencyId, 10);
    const organizationId = parseInt(req.body.organizationId, 10);
    if (!agencyId || !organizationId) {
      return res.status(400).json({ error: { message: 'Invalid agency or organization' } });
    }

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const child = await Agency.findById(organizationId);
    if (!child) return res.status(404).json({ error: { message: 'Organization not found' } });

    const orgType = String(child.organization_type || 'agency').toLowerCase();
    if (!['school', 'program', 'learning', 'clinical', 'clubwebapp'].includes(orgType)) {
      return res.status(400).json({ error: { message: 'Target must be a school, program, learning, clinical, or clubwebapp organization' } });
    }

    if (agencyId === organizationId) {
      return res.status(400).json({ error: { message: 'Invalid request' } });
    }

    const already = await OrganizationAffiliation.hasActiveAffiliation(agencyId, organizationId);
    if (already) {
      return res.status(409).json({ error: { message: 'Your agency is already linked to this organization' } });
    }

    try {
      const row = await OrganizationAffiliationRequest.createOrReopen({
        organizationId,
        requestingAgencyId: agencyId,
        requestedByUserId: req.user.id
      });
      return res.status(201).json(row);
    } catch (e) {
      if (isMissingRequestsTableError(e)) {
        return res.status(503).json({
          error: { message: 'Affiliation requests are not available until the database migration is applied.' }
        });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/agencies/:agencyId/organization-affiliation-requests
 */
export const listAffiliationRequestsForAgency = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    try {
      const rows = await OrganizationAffiliationRequest.listForRequestingAgency(agencyId);
      return res.json(rows);
    } catch (e) {
      if (isMissingRequestsTableError(e)) return res.json([]);
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/organizations/:organizationId/affiliation-requests
 */
export const listAffiliationRequestsForOrganization = async (req, res, next) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    if (!organizationId) return res.status(400).json({ error: { message: 'Invalid organization' } });

    try {
      await assertOrgPortalForAffiliationManagement(req, organizationId);
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ error: { message: e.message || 'Access denied' } });
    }

    try {
      const rows = await OrganizationAffiliationRequest.listForOrganization(organizationId);
      return res.json(rows);
    } catch (e) {
      if (isMissingRequestsTableError(e)) return res.json([]);
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/organizations/:organizationId/affiliation-requests/:requestId/approve
 */
export const approveOrganizationAffiliationRequest = async (req, res, next) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    const requestId = parseInt(req.params.requestId, 10);
    if (!organizationId || !requestId) {
      return res.status(400).json({ error: { message: 'Invalid organization or request' } });
    }

    try {
      await assertOrgPortalForAffiliationManagement(req, organizationId);
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ error: { message: e.message || 'Access denied' } });
    }

    const row = await OrganizationAffiliationRequest.findById(requestId);
    if (!row || parseInt(row.organization_id, 10) !== organizationId) {
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    if (String(row.status) !== 'pending') {
      return res.status(409).json({ error: { message: `Request is already ${row.status}` } });
    }

    const requestingAgencyId = parseInt(row.requesting_agency_id, 10);

    await AgencySchool.upsert({
      agencyId: requestingAgencyId,
      schoolOrganizationId: organizationId,
      isActive: true
    });
    await OrganizationAffiliation.upsert({
      agencyId: requestingAgencyId,
      organizationId,
      isActive: true
    });

    await OrganizationAffiliationRequest.setStatus(requestId, 'approved', req.user.id);
    const updated = await OrganizationAffiliationRequest.findById(requestId);
    return res.json({ ok: true, request: updated });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/organizations/:organizationId/affiliation-requests/:requestId/reject
 */
export const rejectOrganizationAffiliationRequest = async (req, res, next) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    const requestId = parseInt(req.params.requestId, 10);
    if (!organizationId || !requestId) {
      return res.status(400).json({ error: { message: 'Invalid organization or request' } });
    }

    try {
      await assertOrgPortalForAffiliationManagement(req, organizationId);
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ error: { message: e.message || 'Access denied' } });
    }

    const row = await OrganizationAffiliationRequest.findById(requestId);
    if (!row || parseInt(row.organization_id, 10) !== organizationId) {
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    if (String(row.status) !== 'pending') {
      return res.status(409).json({ error: { message: `Request is already ${row.status}` } });
    }

    await OrganizationAffiliationRequest.setStatus(requestId, 'rejected', req.user.id);
    const updated = await OrganizationAffiliationRequest.findById(requestId);
    return res.json({ ok: true, request: updated });
  } catch (e) {
    next(e);
  }
};
