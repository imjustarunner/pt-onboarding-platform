import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';

function normOrgType(t) {
  const k = String(t || '').trim().toLowerCase();
  return k || null;
}

function isPortalOrgType(t) {
  const k = normOrgType(t);
  return k === 'school' || k === 'program' || k === 'learning';
}

function getOrgSlug(org) {
  return String(org?.portal_url || org?.slug || '').trim() || null;
}

/**
 * GET /api/guardian-portal/overview
 *
 * Guardian dashboard bootstrap payload.
 * - children: linked client rows (guardian-safe)
 * - programs: union of explicit org memberships + derived orgs from children
 */
export const getGuardianPortalOverview = async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const [children, explicitOrgsRaw] = await Promise.all([
      ClientGuardian.listClientsForGuardian({ guardianUserId: uid }),
      User.getAgencies(uid)
    ]);

    // Explicit org memberships (via user_agencies). Keep only portal org types.
    const explicitOrgs = (explicitOrgsRaw || []).filter((o) => isPortalOrgType(o?.organization_type));

    // Union programs across explicit orgs + child orgs.
    const byOrgId = new Map();

    for (const o of explicitOrgs) {
      const id = Number(o?.id);
      if (!id) continue;
      byOrgId.set(id, {
        id,
        name: o?.name || null,
        slug: getOrgSlug(o),
        organization_type: normOrgType(o?.organization_type),
        children: []
      });
    }

    for (const c of children || []) {
      const orgId = Number(c?.organization_id);
      if (!orgId) continue;

      if (!byOrgId.has(orgId)) {
        byOrgId.set(orgId, {
          id: orgId,
          name: c?.organization_name || null,
          slug: String(c?.organization_slug || '').trim() || null,
          organization_type: normOrgType(c?.organization_type),
          children: []
        });
      }

      const target = byOrgId.get(orgId);
      target.children.push({
        client_id: Number(c?.client_id) || null,
        initials: c?.initials || null
      });
    }

    const programs = Array.from(byOrgId.values()).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

    res.json({
      refreshedAt: new Date().toISOString(),
      children: children || [],
      programs
    });
  } catch (e) {
    next(e);
  }
};

