import BookingPackage from '../models/BookingPackage.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import {
  getCapabilitiesForAgency,
  isFeatureAllowedForBusinessTypes
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

function canManage(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(r);
}

export const listPackages = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (String(req.query.ensureSuites || 'true') === 'true') {
      await ensureTenantServiceSuitesForAgency(agencyId);
    }
    const packages = await BookingPackage.listForAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === 'true',
      businessType: req.query.businessType || null
    });
    res.json({ ok: true, packages });
  } catch (e) {
    next(e);
  }
};

export const createPackage = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can create packages' } });
    }
    const agency = await Agency.findById(agencyId);
    const caps = await getCapabilitiesForAgency(agencyId, {
      ensureDefaults: true,
      organizationType: agency?.organization_type || agency?.organizationType
    });
    const bt = String(req.body?.businessType || req.body?.business_type || '').toLowerCase();
    if (caps.enabledBusinessTypes.length && !caps.enabledBusinessTypes.includes(bt)) {
      return res.status(400).json({
        error: { message: `Business type "${bt}" is not enabled for this tenant.` }
      });
    }
    const pkg = await BookingPackage.create(agencyId, req.body || {}, req.user?.id || null);
    res.status(201).json({ ok: true, package: pkg });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updatePackage = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const packageId = parseInt(req.params.packageId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update packages' } });
    }
    const pkg = await BookingPackage.update(packageId, agencyId, req.body || {});
    if (!pkg) return res.status(404).json({ error: { message: 'Package not found' } });
    res.json({ ok: true, package: pkg });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listClientEntitlements = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const entitlements = await BookingPackage.listEntitlementsForClient(agencyId, clientId, {
      status: req.query.status || 'ACTIVE'
    });
    res.json({ ok: true, entitlements });
  } catch (e) {
    next(e);
  }
};

export const activateEntitlement = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can activate packages' } });
    }
    const entitlement = await BookingPackage.activateEntitlement({
      agencyId,
      clientId: req.body?.clientId || req.body?.client_id,
      packageId: req.body?.packageId || req.body?.package_id,
      paymentStatus: req.body?.paymentStatus || req.body?.payment_status || 'PAID',
      createdByUserId: req.user?.id || null,
      practitionerEntitlementId: req.body?.practitionerEntitlementId || null
    });
    res.status(201).json({ ok: true, entitlement });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** Expose capability audit for admin/UI nesting checks. */
export const getAgencyCapabilities = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agency = await Agency.findById(agencyId);
    const capabilities = await getCapabilitiesForAgency(agencyId, {
      ensureDefaults: String(req.query.ensureDefaults || 'true') === 'true',
      organizationType: agency?.organization_type || agency?.organizationType
    });
    const featureKey = String(req.query.featureKey || '').trim();
    res.json({
      ok: true,
      capabilities,
      featureCheck: featureKey
        ? {
            featureKey,
            allowed: isFeatureAllowedForBusinessTypes(
              featureKey,
              (capabilities.enabledBusinessTypes || []).map((businessType) => ({ businessType, isEnabled: true }))
            )
          }
        : null
    });
  } catch (e) {
    next(e);
  }
};
