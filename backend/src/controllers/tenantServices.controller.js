import AgencyBusinessType, { BUSINESS_TYPE_CODES } from '../models/AgencyBusinessType.model.js';
import TenantService from '../models/TenantService.model.js';
import StaffServiceAssignment from '../models/StaffServiceAssignment.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { resolveBookingOptions } from '../services/appointment.service.js';
import {
  buildCapabilitiesPayload,
  getCapabilitiesForAgency
} from '../services/businessTypeCapabilities.service.js';
import { ensureTenantServiceSuitesForAgency } from '../services/tenantServiceSuiteDefaults.service.js';

async function assertAgencyAccess(req, agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin') return true;
  const membership = await User.getAgencyMembership?.(req.user.id, aid);
  if (membership) return true;
  try {
    const agencies = await User.getAgencies(req.user.id);
    return (agencies || []).some((a) => Number(a.id) === aid);
  } catch {
    return false;
  }
}

function canManageCatalog(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(r);
}

export const listBusinessTypeCatalog = async (_req, res) => {
  res.json({ ok: true, businessTypes: BUSINESS_TYPE_CODES });
};

export const listAgencyBusinessTypes = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agency = await Agency.findById(agencyId);
    const ensureDefaults = String(req.query.ensureDefaults || 'true') === 'true';
    let rows = await AgencyBusinessType.listForAgency(agencyId);
    if (ensureDefaults && !rows.length) {
      const caps = await getCapabilitiesForAgency(agencyId, {
        ensureDefaults: true,
        organizationType: agency?.organization_type || agency?.organizationType
      });
      rows = await AgencyBusinessType.listForAgency(agencyId);
    }
    const enabled = rows.filter((t) => t.isEnabled);
    const suites = await ensureTenantServiceSuitesForAgency(agencyId, {
      businessTypes: enabled.map((t) => t.businessType)
    });
    res.json({
      ok: true,
      businessTypes: rows,
      catalog: BUSINESS_TYPE_CODES,
      capabilities: buildCapabilitiesPayload(enabled),
      suites
    });
  } catch (e) {
    next(e);
  }
};

export const putAgencyBusinessTypes = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can edit business types' } });
    }
    const rows = await AgencyBusinessType.setForAgency(agencyId, req.body?.businessTypes || req.body?.types || []);
    const enabled = rows.filter((t) => t.isEnabled);
    const suites = await ensureTenantServiceSuitesForAgency(agencyId, {
      businessTypes: enabled.map((t) => t.businessType)
    });
    res.json({
      ok: true,
      businessTypes: rows,
      capabilities: buildCapabilitiesPayload(enabled),
      suites
    });
  } catch (e) {
    next(e);
  }
};

export const listTenantServices = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    if (String(req.query.ensureSuites || 'true') === 'true') {
      await ensureTenantServiceSuitesForAgency(agencyId);
      try {
        const { reconcileAgencyServiceCodeCatalog } = await import('../services/agencyServiceCodeCatalog.service.js');
        await reconcileAgencyServiceCodeCatalog(agencyId, { actorUserId: req.user?.id || null });
      } catch {
        /* best-effort catalog sync */
      }
    }
    const services = await TenantService.listForAgency(agencyId, { includeInactive });
    res.json({ ok: true, services });
  } catch (e) {
    next(e);
  }
};

export const createTenantService = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can create services' } });
    }
    const agency = await Agency.findById(agencyId);
    const caps = await getCapabilitiesForAgency(agencyId, {
      ensureDefaults: true,
      organizationType: agency?.organization_type || agency?.organizationType
    });
    const bt = AgencyBusinessType.normalizeType(req.body?.businessType || req.body?.business_type);
    if (caps.enabledBusinessTypes.length && bt && !caps.enabledBusinessTypes.includes(bt)) {
      return res.status(400).json({
        error: { message: `Business type "${bt}" is not enabled for this tenant.` }
      });
    }
    const service = await TenantService.create(agencyId, req.body || {});
    if (service?.serviceCode) {
      try {
        const { syncClinicalCodePresent } = await import('../services/agencyServiceCodeCatalog.service.js');
        await syncClinicalCodePresent(agencyId, service.serviceCode, {
          actorUserId: req.user?.id || null,
          businessType: service.businessType
        });
      } catch {
        /* best-effort */
      }
    }
    res.status(201).json({ ok: true, service });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateTenantService = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update services' } });
    }
    const before = await TenantService.findById(serviceId, agencyId);
    const service = await TenantService.update(serviceId, agencyId, req.body || {});
    if (!service) return res.status(404).json({ error: { message: 'Service not found' } });
    try {
      const { syncClinicalCodePresent, removeServiceCodeEverywhere } = await import('../services/agencyServiceCodeCatalog.service.js');
      const prevCode = String(before?.serviceCode || '').trim().toUpperCase();
      const nextCode = String(service.serviceCode || '').trim().toUpperCase();
      if (prevCode && prevCode !== nextCode) {
        // Drop the old shared code from payroll/medical/other tenant rows.
        await removeServiceCodeEverywhere(agencyId, prevCode, { forceAllSurfaces: true });
        // Re-ensure the row we just edited still exists if its code changed away
        // (remove may have soft-deleted siblings only; current row already has nextCode).
      }
      if (nextCode) {
        await syncClinicalCodePresent(agencyId, nextCode, {
          actorUserId: req.user?.id || null,
          businessType: service.businessType
        });
      }
    } catch {
      /* best-effort */
    }
    res.json({ ok: true, service });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const deleteTenantService = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can delete services' } });
    }
    const existing = await TenantService.findById(serviceId, agencyId);
    if (!existing) return res.status(404).json({ error: { message: 'Service not found' } });
    if (existing.serviceCode) {
      // Shared clinical code: remove from payroll + medical + all tenant rows with this code.
      try {
        const { removeServiceCodeEverywhere } = await import('../services/agencyServiceCodeCatalog.service.js');
        await removeServiceCodeEverywhere(agencyId, existing.serviceCode, { forceAllSurfaces: true });
      } catch {
        await TenantService.softDelete(serviceId, agencyId);
      }
    } else {
      const ok = await TenantService.softDelete(serviceId, agencyId);
      if (!ok) return res.status(404).json({ error: { message: 'Service not found' } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listServiceStaff = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const staff = await StaffServiceAssignment.listForService(agencyId, serviceId);
    res.json({ ok: true, staff });
  } catch (e) {
    next(e);
  }
};

export const putServiceStaff = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can assign staff' } });
    }
    const service = await TenantService.findById(serviceId, agencyId);
    if (!service) return res.status(404).json({ error: { message: 'Service not found' } });
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const staff = await StaffServiceAssignment.replaceForService(agencyId, serviceId, userIds);
    res.json({ ok: true, staff });
  } catch (e) {
    next(e);
  }
};

export const getBookingOptions = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Match listTenantServices: seed business types + default suites before resolving options.
    try {
      const agency = await Agency.findById(agencyId);
      await getCapabilitiesForAgency(agencyId, {
        ensureDefaults: true,
        organizationType: agency?.organization_type || agency?.organizationType
      });
      await ensureTenantServiceSuitesForAgency(agencyId);
    } catch {
      /* best-effort suite seed */
    }
    const options = await resolveBookingOptions({
      agencyId,
      serviceId: req.query.serviceId ? Number(req.query.serviceId) : null,
      providerId: req.query.providerId ? Number(req.query.providerId) : null,
      clientId: req.query.clientId ? Number(req.query.clientId) : null
    });
    res.json({ ok: true, ...options });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
