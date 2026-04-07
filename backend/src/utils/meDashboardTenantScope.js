import pool from '../config/database.js';
import User from '../models/User.model.js';

export function parsePositiveInt(raw) {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Prefer SPA current-agency header; fall back to JWT primary agency. */
export function pickDashboardContextAgencyId(req) {
  const h = parsePositiveInt(req.headers['x-agency-id']);
  if (h) return h;
  return parsePositiveInt(req.user?.agencyId);
}

/**
 * Resolve the tenant "root" agency for a context org (agency row, or affiliated child school/program/club).
 */
export async function resolveTenantRootAgencyId(agencyId) {
  const id = parsePositiveInt(agencyId);
  if (!id) return null;
  const [rows] = await pool.execute(
    `SELECT id, COALESCE(organization_type, 'agency') AS organization_type
     FROM agencies WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = rows?.[0];
  if (!row) return null;
  const t = String(row.organization_type || 'agency').toLowerCase();
  if (t === 'agency') return Number(row.id);

  const [parents] = await pool.execute(
    `SELECT agency_id FROM organization_affiliations
     WHERE organization_id = ?
       AND (is_active = TRUE OR is_active IS NULL)
     ORDER BY id ASC
     LIMIT 1`,
    [id]
  );
  const pid = parsePositiveInt(parents?.[0]?.agency_id);
  return pid || Number(row.id);
}

/**
 * Tenant root plus every active affiliated organization_id under that tenant.
 */
export async function listAgencyIdsInTenantTree(tenantRootId) {
  const root = parsePositiveInt(tenantRootId);
  if (!root) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT z.id FROM (
       SELECT ? AS id
       UNION
       SELECT oa.organization_id AS id
       FROM organization_affiliations oa
       WHERE oa.agency_id = ?
         AND (oa.is_active = TRUE OR oa.is_active IS NULL)
     ) AS z
     WHERE z.id IS NOT NULL`,
    [root, root]
  );
  return [...new Set((rows || []).map((r) => Number(r.id)).filter((n) => n > 0))];
}

/**
 * Agency ids whose company_events / learning classes should appear on "My Dashboard" for this request.
 * User must belong to at least one org in the tree; then the full tree is used (tenant + affiliates).
 */
export async function resolveScopedAgencyIdsForMyDashboard(req) {
  const userId = parsePositiveInt(req.user?.id);
  if (!userId) return [];

  const role = String(req.user?.role || '').toLowerCase();
  let ctx = pickDashboardContextAgencyId(req);
  if (!ctx) {
    const ua = await User.getAgencies(userId);
    if ((ua || []).length === 1) ctx = Number(ua[0].id);
    if (!ctx) return [];
  }

  const userAgencies = await User.getAgencies(userId);
  const userSet = new Set((userAgencies || []).map((a) => Number(a.id)).filter((n) => n > 0));

  const root = await resolveTenantRootAgencyId(ctx);
  const anchor = root || ctx;
  const tree = await listAgencyIdsInTenantTree(anchor);
  const treeSet = new Set(tree);
  if (!treeSet.size) return [];

  if (role === 'super_admin') {
    return [...treeSet];
  }

  const inTenant = [...treeSet].some((id) => userSet.has(id));
  if (!inTenant) return [];
  return [...treeSet];
}
