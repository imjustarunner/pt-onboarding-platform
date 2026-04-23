import pool from '../config/database.js';
import { resolveTenantRootAgencyId, listAgencyIdsInTenantTree } from '../utils/meDashboardTenantScope.js';
import User from '../models/User.model.js';

export const requireAgencyAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const role = String(req.user.role || '').toLowerCase();

    // Super admins see everything — no scoping needed
    if (role === 'super_admin') {
      return next();
    }

    const agencyIdParam = req.params.agencyId || req.body.agencyId || req.query.agencyId;

    if (agencyIdParam) {
      // Explicit agencyId provided — scope to that tenant's tree
      const agencyId = parseInt(agencyIdParam, 10);
      if (!agencyId || isNaN(agencyId)) {
        return res.status(400).json({ error: { message: 'Invalid agency ID' } });
      }

      const rootId = await resolveTenantRootAgencyId(agencyId);
      const tenantIds = await listAgencyIdsInTenantTree(rootId || agencyId);

      // For non-admin roles, verify the user actually belongs to this tenant tree
      if (role !== 'admin' && role !== 'support') {
        const userAgencies = await User.getAgencies(req.user.id);
        const userAgencyIds = new Set((userAgencies || []).map(a => Number(a.id)).filter(n => n > 0));
        if (!tenantIds.some(id => userAgencyIds.has(id))) {
          return res.status(403).json({ error: { message: 'Access denied to this tenant' } });
        }
      }

      req.agencyId = agencyId;
      req.tenantRootId = rootId || agencyId;
      req.tenantAgencyIds = tenantIds;
      return next();
    }

    // No agencyId in request — resolve from the user's own agency memberships.
    // This ensures that even without an explicit agencyId, admins/support only see
    // their own tenant's data and never leak cross-tenant records.
    const userAgencies = await User.getAgencies(req.user.id);
    const userAgencyIds = (userAgencies || []).map(a => Number(a.id)).filter(n => n > 0);

    if (userAgencyIds.length === 0) {
      req.tenantAgencyIds = [];
      return next();
    }

    // Resolve the tenant tree for the user's primary agency
    const primaryAgencyId = userAgencyIds[0];
    const rootId = await resolveTenantRootAgencyId(primaryAgencyId);
    const tenantIds = await listAgencyIdsInTenantTree(rootId || primaryAgencyId);

    req.agencyId = primaryAgencyId;
    req.tenantRootId = rootId || primaryAgencyId;
    req.tenantAgencyIds = tenantIds;
    next();
  } catch (error) {
    next(error);
  }
};

