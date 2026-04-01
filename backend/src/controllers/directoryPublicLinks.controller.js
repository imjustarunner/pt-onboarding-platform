import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import { isPublicProviderFinderFeatureEnabled } from '../services/publicAvailabilityGate.service.js';

const isSuperAdmin = (role) => String(role || '').toLowerCase() === 'super_admin';

const asNumberOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const canAccessIntakeLink = ({ link, userOrgIds, userId }) => {
  const orgId = asNumberOrNull(link?.organization_id);
  if (orgId) return userOrgIds.includes(orgId);
  return asNumberOrNull(link?.created_by_user_id) === asNumberOrNull(userId);
};

async function getUserOrganizationIds(userId) {
  const memberships = await User.getAgencies(userId);
  return (memberships || [])
    .map((row) => asNumberOrNull(row?.id))
    .filter((id) => Number.isFinite(id));
}

function buildProviderFinderPublicUrl({ agencyId, key }) {
  const rawBase = String(
    process.env.FRONTEND_URL ||
      process.env.APP_BASE_URL ||
      process.env.CORS_ORIGIN ||
      'http://localhost:5173'
  ).trim();
  const base = rawBase.replace(/\/+$/, '');
  const qs = key ? `?key=${encodeURIComponent(String(key))}` : '';
  return `${base}/find-provider/${Number(agencyId)}${qs}`;
}

function getFrontendOrigin() {
  const rawBase = String(
    process.env.FRONTEND_URL ||
      process.env.APP_BASE_URL ||
      process.env.CORS_ORIGIN ||
      'http://localhost:5173'
  ).trim();
  return rawBase.replace(/\/+$/, '');
}

async function resolveAgencyIdForDirectory(req) {
  const raw = req.query.agencyId ?? req.user?.agencyId ?? null;
  const agencyId = asNumberOrNull(raw);
  if (agencyId) return agencyId;
  try {
    const agencies = await User.getAgencies(req.user.id);
    const first = agencies?.[0]?.id ? Number(agencies[0].id) : null;
    return first || null;
  } catch {
    return null;
  }
}

async function assertAgencyMembership(req, res, agencyId) {
  if (!agencyId) return false;
  if (isSuperAdmin(req.user?.role)) return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
    [req.user.id, agencyId]
  );
  if (!rows?.[0]) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

/**
 * GET /api/directory/public-links?agencyId=
 * Aggregates shareable URLs for the Directory menu: digital forms (intake), public marketing hubs,
 * and the agency public provider finder when enabled. Auth: backoffice admin (same as /api/intake-links).
 */
export const listDirectoryPublicLinks = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    let userOrgIds = [];
    if (!isSuperAdmin(req.user?.role)) {
      userOrgIds = await getUserOrganizationIds(userId);
    }

    let intakeLinksOut = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id, public_key, title, form_type, scope_type, organization_id, is_active, created_by_user_id, updated_at
         FROM intake_links
         ORDER BY updated_at DESC, id DESC`
      );
      let links = (rows || []).map((row) => IntakeLink.normalize(row));
      if (!isSuperAdmin(req.user?.role)) {
        links = links.filter((link) => canAccessIntakeLink({ link, userOrgIds, userId }));
      }
      intakeLinksOut = links
        .filter((l) => l.is_active && String(l.public_key || '').trim())
        .map((l) => ({
          id: l.id,
          title: l.title || `Link ${l.id}`,
          formType: l.form_type || 'intake',
          scopeType: l.scope_type,
          organizationId: l.organization_id,
          publicKey: String(l.public_key || '').trim()
        }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let marketingHubs = [];
    try {
      if (isSuperAdmin(req.user?.role)) {
        const [rows] = await pool.execute(
          `SELECT slug, title FROM public_marketing_pages WHERE is_active = 1 ORDER BY updated_at DESC`
        );
        marketingHubs = (rows || []).map((r) => ({
          slug: String(r.slug || '').trim().toLowerCase(),
          title: String(r.title || r.slug || '').trim() || String(r.slug || '').toLowerCase()
        }));
      } else if (userOrgIds.length) {
        const placeholders = userOrgIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT p.slug AS slug, p.title AS title
           FROM public_marketing_pages p
           INNER JOIN public_marketing_page_sources s ON s.page_id = p.id AND s.is_active = 1
           WHERE p.is_active = 1
             AND s.source_id IN (${placeholders})
             AND LOWER(s.source_type) IN ('agency','organization')
           GROUP BY p.id, p.slug, p.title
           ORDER BY MAX(p.updated_at) DESC`,
          userOrgIds
        );
        marketingHubs = (rows || []).map((r) => ({
          slug: String(r.slug || '').trim().toLowerCase(),
          title: String(r.title || r.slug || '').trim() || String(r.slug || '').toLowerCase()
        }));
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let providerFinder = null;
    let publicEventPages = [];
    const agencyId = await resolveAgencyIdForDirectory(req);
    if (agencyId) {
      const ok = await assertAgencyMembership(req, res, agencyId);
      if (!ok) return;

      const [agRows] = await pool.execute(
        `SELECT id, slug, name, public_availability_enabled, public_availability_access_key, feature_flags
         FROM agencies
         WHERE id = ?
         LIMIT 1`,
        [agencyId]
      );
      const agency = agRows?.[0] || null;
      if (agency && isPublicProviderFinderFeatureEnabled(agency)) {
        let key = String(agency.public_availability_access_key || '').trim();
        if (!key) {
          key = crypto.randomBytes(18).toString('base64url');
          await pool.execute(`UPDATE agencies SET public_availability_access_key = ? WHERE id = ?`, [key, agencyId]);
        }
        providerFinder = {
          label: 'Public provider finder',
          url: buildProviderFinderPublicUrl({ agencyId, key })
        };
      }

      const agencySlug = String(agency?.slug || '').trim().toLowerCase();
      if (agencySlug) {
        const origin = getFrontendOrigin();
        publicEventPages.push({
          label: 'Agency events',
          kind: 'agency_events',
          url: `${origin}/${encodeURIComponent(agencySlug)}/events`
        });
        publicEventPages.push({
          label: 'Skill Builders events',
          kind: 'skill_builders_events',
          url: `${origin}/open-events/${encodeURIComponent(agencySlug)}/skill-builders`
        });

        let hasAffiliatedAgencyId = false;
        try {
          const [colRows] = await pool.execute(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'affiliated_agency_id'"
          );
          hasAffiliatedAgencyId = Number(colRows?.[0]?.cnt || 0) > 0;
        } catch {
          hasAffiliatedAgencyId = false;
        }

        const childWhere = hasAffiliatedAgencyId
          ? `(
              EXISTS (
                SELECT 1
                FROM organization_affiliations oa
                WHERE oa.organization_id = child.id
                  AND oa.agency_id = ?
                  AND oa.is_active = TRUE
              )
              OR child.affiliated_agency_id = ?
            )`
          : `EXISTS (
              SELECT 1
              FROM organization_affiliations oa
              WHERE oa.organization_id = child.id
                AND oa.agency_id = ?
                AND oa.is_active = TRUE
            )`;
        const childParams = hasAffiliatedAgencyId ? [agencyId, agencyId] : [agencyId];
        const [programRows] = await pool.execute(
          `SELECT DISTINCT child.id AS organization_id, child.slug, child.name
           FROM agencies child
           WHERE ${childWhere}
             AND LOWER(COALESCE(child.organization_type, '')) IN ('program', 'learning')
             AND child.slug IS NOT NULL
             AND TRIM(child.slug) <> ''
             AND (child.is_archived = FALSE OR child.is_archived IS NULL)
             AND (child.is_active = TRUE OR child.is_active IS NULL)
           ORDER BY child.name ASC, child.id ASC`,
          childParams
        );
        for (const row of programRows || []) {
          const programSlug = String(row?.slug || '').trim().toLowerCase();
          if (!programSlug) continue;
          const programName = String(row?.name || '').trim() || programSlug;
          publicEventPages.push({
            label: `${programName} events`,
            kind: 'program_events',
            url: `${origin}/${encodeURIComponent(agencySlug)}/programs/${encodeURIComponent(programSlug)}/events`
          });
        }
      }
    }

    res.json({
      ok: true,
      intakeLinks: intakeLinksOut,
      marketingHubs,
      providerFinder,
      publicEventPages
    });
  } catch (e) {
    next(e);
  }
};
