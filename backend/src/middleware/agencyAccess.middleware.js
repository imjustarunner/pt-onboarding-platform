import pool from '../config/database.js';
import { resolveTenantRootAgencyId, listAgencyIdsInTenantTree } from '../utils/meDashboardTenantScope.js';
import User from '../models/User.model.js';

export const requireAgencyAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const agencyIdParam = req.params.agencyId || req.body.agencyId || req.query.agencyId;
    if (!agencyIdParam) {
      return next(); // No agency specified, allow for now (or enforce elsewhere)
    }

    const agencyId = parseInt(agencyIdParam, 10);
    if (!agencyId || isNaN(agencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agency ID' } });
    }

    const role = String(req.user.role || '').toLowerCase();

    // Backoffice and super admins get full tenant context (scoped to selected tenant for new dashboard)
    if (role === 'super_admin' || role === 'admin' || role === 'support') {
      const rootId = await resolveTenantRootAgencyId(agencyId);
      req.agencyId = agencyId;
      req.tenantRootId = rootId || agencyId;
      req.tenantAgencyIds = await listAgencyIdsInTenantTree(req.tenantRootId);
      return next();
    }

    // For other roles (including new tenant users), enforce strict tenant tree membership
    const rootId = await resolveTenantRootAgencyId(agencyId);
    if (!rootId) {
      return res.status(403).json({ error: { message: 'Invalid tenant' } });
    }

    const tenantIds = await listAgencyIdsInTenantTree(rootId);
    const userAgencies = await User.getAgencies(req.user.id);
    const userAgencyIds = new Set((userAgencies || []).map(a => Number(a.id)).filter(n => n > 0));

    const hasTenantAccess = tenantIds.some(id => userAgencyIds.has(id));
    if (!hasTenantAccess) {
      return res.status(403).json({ error: { message: 'Access denied to this tenant' } });
    }

    req.agencyId = agencyId;
    req.tenantRootId = rootId;
    req.tenantAgencyIds = tenantIds;
    next();
  } catch (error) {
    next(error);
  }
};

