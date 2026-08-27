import BookingPackage from '../models/BookingPackage.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import {
  getCapabilitiesForAgency,
  isFeatureAllowedForBusinessTypes
} from '../services/businessTypeCapabilities.service.js';
import { ensureTenantServiceSuitesForAgency } from '../services/tenantServiceSuiteDefaults.service.js';
import * as unifiedPackages from '../services/unifiedPackageCatalog.service.js';

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
    const programRaw = req.query.learningProgramClassId ?? req.query.programId;
    const programId = programRaw === undefined
      ? undefined
      : (programRaw === '' || programRaw === 'null' ? null : Number(programRaw));
    const packages = await unifiedPackages.resolveCatalog({
      agencyId,
      includeInactive: String(req.query.includeInactive || '') === 'true',
      businessType: req.query.businessType || null,
      programId,
      publicOnly: String(req.query.publicOnly || '') === 'true',
      includeTenantWideWithProgram: String(req.query.includeTenantWide || '') === 'true'
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
    const pkg = await unifiedPackages.createPackageForAgency(agencyId, req.body || {}, req.user?.id || null);
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
    const pkg = await unifiedPackages.updatePackageForAgency(packageId, agencyId, req.body || {});
    if (!pkg) return res.status(404).json({ error: { message: 'Package not found' } });
    res.json({ ok: true, package: pkg });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const duplicatePackage = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const packageId = parseInt(req.params.packageId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can duplicate packages' } });
    }
    const targetProgramId = req.body?.learningProgramClassId ?? req.body?.learning_program_class_id;
    if (targetProgramId != null && targetProgramId !== '') {
      await unifiedPackages.assertProgramBelongsToAgency(targetProgramId, agencyId);
    }
    const pkg = await BookingPackage.duplicate(packageId, agencyId, {
      learningProgramClassId: targetProgramId === undefined ? undefined : (targetProgramId === null || targetProgramId === '' ? null : Number(targetProgramId)),
      nameSuffix: req.body?.nameSuffix || ' (copy)'
    });
    if (!pkg) return res.status(404).json({ error: { message: 'Package not found' } });
    res.status(201).json({ ok: true, package: pkg });
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
    const summary = await unifiedPackages.summarizeClientPackageBalance(agencyId, clientId, {
      businessType: req.query.businessType || null
    });
    const status = req.query.status || 'ACTIVE';
    if (status !== 'ACTIVE') {
      const entitlements = await BookingPackage.listEntitlementsForClient(agencyId, clientId, {
        status,
        businessType: req.query.businessType || null
      });
      return res.json({ ok: true, entitlements, totals: null });
    }
    res.json({ ok: true, entitlements: summary.entitlements, totals: summary.totals });
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
    const entitlement = await unifiedPackages.activatePackageManually({
      agencyId,
      clientId: req.body?.clientId || req.body?.client_id,
      packageId: req.body?.packageId || req.body?.package_id,
      paymentStatus: req.body?.paymentStatus || req.body?.payment_status || 'PAID',
      amountCents: req.body?.amountCents ?? req.body?.amount_cents ?? null,
      paymentMode: req.body?.paymentMode || req.body?.payment_mode || 'MANUAL',
      actorUserId: req.user?.id || null,
      purchaserUserId: req.body?.purchaserUserId || req.body?.purchaser_user_id || null,
      note: req.body?.note || null
    });
    res.status(201).json({ ok: true, entitlement });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const checkoutPackage = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const packageId = parseInt(req.params.packageId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const clientId = Number(req.body?.clientId || req.body?.client_id || 0);
    if (!clientId) {
      return res.status(400).json({ error: { message: 'clientId is required' } });
    }
    const result = await unifiedPackages.startPackageCheckout({
      agencyId,
      packageId,
      clientId,
      purchaserUserId: req.body?.purchaserUserId || req.body?.purchaser_user_id || req.user?.id || null,
      actorUserId: req.user?.id || null,
      paymentMode: req.body?.paymentMode || 'PAY_IN_FULL'
    });
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const confirmPackageCheckout = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const packageId = parseInt(req.params.packageId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const clientId = Number(req.body?.clientId || req.body?.client_id || 0);
    if (!clientId) {
      return res.status(400).json({ error: { message: 'clientId is required' } });
    }
    const result = await unifiedPackages.confirmPackageCheckout({
      agencyId,
      packageId,
      clientId,
      paymentIntentId: req.body?.paymentIntentId || req.body?.payment_intent_id || null,
      purchaserUserId: req.body?.purchaserUserId || req.user?.id || null,
      actorUserId: req.user?.id || null
    });
    res.json(result);
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

/** Program-scoped package list (also mounted under learning-program-classes). */
export const listProgramPackages = async (req, res, next) => {
  try {
    const classId = parseInt(req.params.classId || req.params.id, 10);
    const LearningProgramClass = (await import('../models/LearningProgramClass.model.js')).default;
    const row = await LearningProgramClass.findById(classId);
    if (!row) return res.status(404).json({ error: { message: 'Program not found' } });
    const agencyId = Number(row.organization_id);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await unifiedPackages.assertProgramBelongsToAgency(classId, agencyId);
    const packages = await unifiedPackages.resolveCatalog({
      agencyId,
      programId: classId,
      businessType: req.query.businessType || null,
      includeInactive: String(req.query.includeInactive || '') === 'true',
      publicOnly: String(req.query.publicOnly || '') === 'true',
      includeTenantWideWithProgram: String(req.query.includeTenantWide || '') === 'true'
    });
    res.json({ ok: true, agencyId, packages });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
