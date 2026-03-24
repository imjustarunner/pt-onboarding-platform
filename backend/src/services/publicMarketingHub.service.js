import pool from '../config/database.js';
import { checkPublicAvailabilityGate } from './publicAvailabilityGate.service.js';
import { listAffiliatedProgramOrganizationIds } from './skillBuildersSkillsGroup.service.js';
import {
  attachDistanceScoresToPublicEvents,
  loadPublicAgencyHubEventRows,
  loadPublicProgramEventRowsMerged,
  respondNearestDistanceError
} from './skillBuildersPublicEvents.service.js';
import { geocodeAddressWithGoogle } from './googleGeocode.service.js';

function parseJsonObject(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidHubSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,188}$/.test(s);
}

export async function getMarketingPageRowBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  const [rows] = await pool.execute(
    `SELECT id, slug, title, is_active AS isActive, page_type AS pageType,
            hero_title AS heroTitle, hero_subtitle AS heroSubtitle, hero_image_url AS heroImageUrl,
            branding_json AS brandingJson, seo_json AS seoJson, metrics_profile AS metricsProfile,
            created_at AS createdAt, updated_at AS updatedAt
     FROM public_marketing_pages
     WHERE LOWER(slug) = ?
     LIMIT 1`,
    [s]
  );
  return rows?.[0] || null;
}

export async function listSourcesForPage(pageId) {
  const pid = Number(pageId);
  if (!Number.isFinite(pid) || pid <= 0) return [];
  const [rows] = await pool.execute(
    `SELECT id, page_id AS pageId, source_type AS sourceType, source_id AS sourceId,
            sort_order AS sortOrder, is_active AS isActive
     FROM public_marketing_page_sources
     WHERE page_id = ? AND is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
    [pid]
  );
  return rows || [];
}

/**
 * Aggregated Skill Builders registratable events for hub sources.
 * @returns {Promise<Array<object>>}
 */
export async function loadHubPublicEvents(conn, sources) {
  const list = Array.isArray(sources) ? sources : [];
  const byEventId = new Map();

  for (const src of list) {
    if (!src || (src.isActive !== undefined && src.isActive === false)) continue;
    const st = String(src.sourceType || '').toLowerCase();
    const sid = Number(src.sourceId);
    if (!Number.isFinite(sid) || sid <= 0) continue;

    let batch = [];
    let meta = { sourceAgencyId: sid, sourceAgencyName: '', sourceAgencySlug: '' };

    if (st === 'agency') {
      const [agRows] = await conn.execute(
        `SELECT id, name, slug, LOWER(COALESCE(organization_type, 'agency')) AS org_type FROM agencies WHERE id = ? LIMIT 1`,
        [sid]
      );
      const ag = agRows?.[0];
      meta.sourceAgencyName = String(ag?.name || '').trim() || `Agency ${sid}`;
      meta.sourceAgencySlug = String(ag?.slug || '').trim().toLowerCase() || '';
      const orgType = String(ag?.org_type || 'agency');

      if (orgType === 'program') {
        meta.sourceOrganizationId = sid;
        batch = await loadPublicProgramEventRowsMerged(conn, sid);
      } else {
        const programOrgIds = await listAffiliatedProgramOrganizationIds(conn, sid);
        batch = await loadPublicAgencyHubEventRows(conn, sid, programOrgIds);
      }
    } else if (st === 'organization') {
      const [orgRows] = await conn.execute(
        `SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`,
        [sid]
      );
      const org = orgRows?.[0];
      meta.sourceAgencyName = String(org?.name || '').trim() || `Organization ${sid}`;
      meta.sourceAgencySlug = String(org?.slug || '').trim().toLowerCase() || '';
      meta.sourceOrganizationId = sid;
      batch = await loadPublicProgramEventRowsMerged(conn, sid);
    } else {
      continue;
    }

    for (const ev of batch) {
      const id = Number(ev.id);
      if (!byEventId.has(id)) {
        byEventId.set(id, {
          ...ev,
          hubSourcePartners: [
            {
              sourceAgencyId: meta.sourceAgencyId,
              sourceAgencyName: meta.sourceAgencyName,
              sourceAgencySlug: meta.sourceAgencySlug,
              sourceOrganizationId: meta.sourceOrganizationId || null
            }
          ]
        });
      } else {
        const cur = byEventId.get(id);
        cur.hubSourcePartners = cur.hubSourcePartners || [];
        cur.hubSourcePartners.push({
          sourceAgencyId: meta.sourceAgencyId,
          sourceAgencyName: meta.sourceAgencyName,
          sourceAgencySlug: meta.sourceAgencySlug,
          sourceOrganizationId: meta.sourceOrganizationId || null
        });
      }
    }
  }

  const merged = Array.from(byEventId.values());
  merged.sort((a, b) => {
    const ta = new Date(a.startsAt || 0).getTime();
    const tb = new Date(b.startsAt || 0).getTime();
    return ta - tb;
  });
  return merged;
}

export function buildHubThemeResponse(pageRow, req) {
  const branding = parseJsonObject(pageRow.brandingJson);
  const colorPalette = branding.colorPalette || {};
  const themeSettings = branding.themeSettings || {};
  const terminologySettings = branding.terminologySettings || {};
  const agencyName = String(pageRow.title || branding.siteName || branding.agencyName || 'Events').trim();

  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  const baseUrl = `${proto}://${host}`;

  let logoUrl = branding.logoUrl || null;
  if (!logoUrl && branding.logoPath) {
    const cleaned = String(branding.logoPath || '')
      .replace(/^\//, '')
      .replace(/^uploads\//, '');
    logoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : null;
  }

  return {
    brandingAgencyId: null,
    portalOrganizationId: null,
    colorPalette,
    logoUrl,
    themeSettings,
    terminologySettings,
    agencyName,
    hubSlug: String(pageRow.slug || '').toLowerCase(),
    publicEventsOwnBranding: true
  };
}

export async function computeHubScopedMetrics(agencyIds, profile) {
  const prof = String(profile || '').trim().toLowerCase();
  const ids = [...new Set((agencyIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length || !prof) {
    return { ok: false, reason: 'no_scope' };
  }

  // Allowlisted profiles only (no arbitrary SQL).
  if (prof !== 'hub_sources_summary' && prof !== 'plottwistco_summary') {
    return { ok: false, reason: 'unknown_profile' };
  }

  const ph = ids.map(() => '?').join(',');
  const [provRows] = await pool.execute(
    `SELECT COUNT(DISTINCT u.id) AS cnt
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${ph})
     WHERE LOWER(COALESCE(u.role, '')) IN ('provider', 'provider_plus', 'intern', 'intern_plus')
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))`,
    ids
  );
  const providerCount = Number(provRows?.[0]?.cnt || 0);

  let clientCount = 0;
  try {
    const [cRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM clients
       WHERE agency_id IN (${ph})
         AND UPPER(COALESCE(status, '')) != 'ARCHIVED'`,
      ids
    );
    clientCount = Number(cRows?.[0]?.cnt || 0);
  } catch {
    clientCount = 0;
  }

  let mileageClaimsLast365 = null;
  try {
    const [mRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM payroll_mileage_claims
       WHERE agency_id IN (${ph}) AND created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)`,
      ids
    );
    mileageClaimsLast365 = Number(mRows?.[0]?.cnt || 0);
  } catch {
    mileageClaimsLast365 = null;
  }

  return {
    ok: true,
    profile: prof,
    scopedAgencyIds: ids,
    metrics: {
      providerCount,
      activeClientCount: clientCount,
      mileageClaimsSubmittedLast365Days: mileageClaimsLast365
    },
    disclaimer:
      'Aggregated counts only; no personal data. Revenue and detailed claims are not exposed on public endpoints.'
  };
}

export async function loadBookingHintsForHub(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const hints = [];
  for (const src of list) {
    const st = String(src.sourceType || '').toLowerCase();
    if (st !== 'agency') continue;
    const aid = Number(src.sourceId);
    if (!Number.isFinite(aid) || aid <= 0) continue;
    const gate = await checkPublicAvailabilityGate(aid);
    const [rows] = await pool.execute(`SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`, [aid]);
    const a = rows?.[0];
    if (!a) continue;
    hints.push({
      agencyId: aid,
      agencyName: String(a.name || '').trim() || `Agency ${aid}`,
      agencySlug: String(a.slug || '').trim().toLowerCase() || '',
      publicAvailabilityEnabled: gate.ok === true,
      findProviderPath: `/find-provider/${aid}`,
      requiresAccessKey: true
    });
  }
  return hints;
}

export async function rankHubEventsByAddress({ slug, address, res }) {
  const page = await getMarketingPageRowBySlug(slug);
  if (!page || !page.isActive) {
    return { error: { status: 404, body: { error: { message: 'Page not found' } } } };
  }
  const addr = String(address || '').trim();
  if (!addr) {
    return { error: { status: 400, body: { error: { message: 'address is required' } } } };
  }

  let origin;
  try {
    origin = await geocodeAddressWithGoogle({ addressText: addr, countryCode: 'US' });
  } catch (err) {
    const code = err?.code || '';
    if (code === 'MAPS_KEY_MISSING') {
      return { error: { status: 503, body: { error: { message: 'Location search is not configured.' } } } };
    }
    return { error: { status: 400, body: { error: { message: err?.message || 'Could not find that address.' } } } };
  }

  const conn = await pool.getConnection();
  try {
    const sources = await listSourcesForPage(page.id);
    const events = await loadHubPublicEvents(conn, sources);
    let scored;
    try {
      scored = await attachDistanceScoresToPublicEvents(events, origin, new Map());
    } catch (err) {
      if (respondNearestDistanceError(res, err)) return { handled: true };
      throw err;
    }
    return {
      json: {
        ok: true,
        hubSlug: String(page.slug || '').toLowerCase(),
        distanceMode: 'driving',
        origin: {
          latitude: origin.latitude,
          longitude: origin.longitude,
          formattedAddress: origin.formattedAddress || null
        },
        events: scored
      }
    };
  } finally {
    conn.release();
  }
}

export { normalizeSlug, parseJsonObject };
