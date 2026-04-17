import pool from '../config/database.js';
import { checkPublicAvailabilityGate } from './publicAvailabilityGate.service.js';
import { listAffiliatedProgramOrganizationIds } from './skillBuildersSkillsGroup.service.js';
import {
  attachDistanceScoresToPublicEvents,
  loadPublicAgencyHubEventRows,
  loadPublicProgramEventRowsMerged,
  respondNearestDistanceError
} from './skillBuildersPublicEvents.service.js';
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

/** Normalize agency `color_palette` primary/secondary to `#RRGGBB` for public hub JSON. */
function normalizeHexColor(v) {
  const s = String(v || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '';
}

function hubAgencyBrandColorsFromRow(row) {
  const parsed = parseJsonObject(row?.color_palette);
  const primary = normalizeHexColor(parsed?.primary || parsed?.primaryColor);
  const secondary = normalizeHexColor(
    parsed?.secondary || parsed?.secondaryColor || parsed?.accent || parsed?.accentColor
  );
  return { primary, secondary };
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

/** Build absolute logo URL for hub source agencies (matches portal theme pattern). */
async function resolveHubDisplayAgencyRow(conn, sourceRow) {
  if (!sourceRow) return null;
  const orgType = String(sourceRow.org_type || 'agency').toLowerCase();
  if (orgType !== 'program') return sourceRow;
  const pid = Number(sourceRow.id);
  if (!Number.isFinite(pid) || pid <= 0) return sourceRow;
  const [parRows] = await conn.execute(
    `SELECT pa.id, pa.name, pa.slug, pa.logo_path, pa.logo_url,
            LOWER(COALESCE(pa.organization_type, 'agency')) AS org_type,
            pa.theme_settings, pa.color_palette,
            i.file_path AS icon_file_path
     FROM organization_affiliations oa
     INNER JOIN agencies pa ON pa.id = oa.agency_id
     LEFT JOIN icons i ON pa.icon_id = i.id
     WHERE oa.organization_id = ?
       AND oa.is_active = TRUE
       AND (pa.is_archived = FALSE OR pa.is_archived IS NULL)
       AND LOWER(COALESCE(pa.organization_type, 'agency')) = 'agency'
     ORDER BY oa.id ASC
     LIMIT 1`,
    [pid]
  );
  return parRows?.[0] || sourceRow;
}

export function resolveAgencyLogoUrlForHub(baseUrl, agencyRow) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base || !agencyRow) return null;
  const logoPath = String(agencyRow.logo_path || '').trim();
  const iconPath = String(agencyRow.icon_file_path || '').trim();
  const logoUrlRaw = String(agencyRow.logo_url || '').trim();
  if (logoUrlRaw && /^https?:\/\//i.test(logoUrlRaw)) return logoUrlRaw;
  const rel = logoPath || iconPath;
  if (rel) {
    const cleaned = rel.replace(/^\//, '').replace(/^uploads\//, '');
    return cleaned ? `${base}/uploads/${cleaned}` : null;
  }
  if (logoUrlRaw) {
    if (logoUrlRaw.startsWith('/')) return `${base}${logoUrlRaw}`;
    return `${base}/${logoUrlRaw}`;
  }
  return null;
}

export function hubRequestBaseUrl(req) {
  if (!req || typeof req.get !== 'function') return '';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  return host ? `${proto}://${host}` : '';
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
export async function loadHubPublicEvents(conn, sources, opts = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const byEventId = new Map();
  const baseUrl = String(opts.baseUrl || '').trim();

  for (const src of list) {
    if (!src || (src.isActive !== undefined && src.isActive === false)) continue;
    const st = String(src.sourceType || '').toLowerCase();
    const sid = Number(src.sourceId);
    if (!Number.isFinite(sid) || sid <= 0) continue;

    let batch = [];
    /** Resolved agency row for branding (parent when source is a program org). */
    let displayRow = null;
    /** Partner row uses parent agency id/name/logo when the hub source is a program org. */
    let meta = { sourceAgencyId: sid, sourceAgencyName: '', sourceAgencySlug: '', sourceAgencyLogoUrl: null };

    if (st === 'agency') {
      // icon_file_path comes from icons via icon_id (not a column on agencies)
      const [agRows] = await conn.execute(
        `SELECT a.id, a.name, a.slug, a.logo_path, a.logo_url,
                LOWER(COALESCE(a.organization_type, 'agency')) AS org_type,
                a.color_palette,
                i.file_path AS icon_file_path
         FROM agencies a
         LEFT JOIN icons i ON a.icon_id = i.id
         WHERE a.id = ? LIMIT 1`,
        [sid]
      );
      const ag = agRows?.[0];
      displayRow = await resolveHubDisplayAgencyRow(conn, ag);
      const orgType = String(ag?.org_type || 'agency');
      const displayId = Number(displayRow?.id);
      const idOk = Number.isFinite(displayId) && displayId > 0;

      meta.sourceAgencyId = idOk ? displayId : sid;
      meta.sourceAgencyName =
        String(displayRow?.name || ag?.name || '').trim() || (idOk ? `Agency ${displayId}` : `Agency ${sid}`);
      meta.sourceAgencySlug = String(displayRow?.slug || '').trim().toLowerCase() || '';
      meta.sourceAgencyLogoUrl =
        baseUrl && displayRow ? resolveAgencyLogoUrlForHub(baseUrl, displayRow) : null;

      if (orgType === 'program') {
        meta.sourceOrganizationId = sid;
        batch = await loadPublicProgramEventRowsMerged(conn, sid);
      } else {
        const programOrgIds = await listAffiliatedProgramOrganizationIds(conn, sid);
        batch = await loadPublicAgencyHubEventRows(conn, sid, programOrgIds);
      }
    } else if (st === 'organization') {
      const [orgRows] = await conn.execute(
        `SELECT a.id, a.name, a.slug, a.logo_path, a.logo_url,
                LOWER(COALESCE(a.organization_type, 'agency')) AS org_type,
                a.color_palette,
                i.file_path AS icon_file_path
         FROM agencies a
         LEFT JOIN icons i ON a.icon_id = i.id
         WHERE a.id = ? LIMIT 1`,
        [sid]
      );
      const org = orgRows?.[0];
      displayRow = await resolveHubDisplayAgencyRow(conn, org);
      const displayId = Number(displayRow?.id);
      const idOk = Number.isFinite(displayId) && displayId > 0;

      meta.sourceAgencyId = idOk ? displayId : sid;
      meta.sourceAgencyName =
        String(displayRow?.name || org?.name || '').trim() || (idOk ? `Agency ${displayId}` : `Organization ${sid}`);
      meta.sourceAgencySlug = String(displayRow?.slug || '').trim().toLowerCase() || '';
      meta.sourceAgencyLogoUrl =
        baseUrl && displayRow ? resolveAgencyLogoUrlForHub(baseUrl, displayRow) : null;
      meta.sourceOrganizationId = sid;
      batch = await loadPublicProgramEventRowsMerged(conn, sid);
    } else {
      continue;
    }

    const brand = hubAgencyBrandColorsFromRow(displayRow);
    const partnerPayload = {
      sourceAgencyId: meta.sourceAgencyId,
      sourceAgencyName: meta.sourceAgencyName,
      sourceAgencySlug: meta.sourceAgencySlug,
      sourceAgencyLogoUrl: meta.sourceAgencyLogoUrl,
      sourceOrganizationId: meta.sourceOrganizationId || null,
      sourceAgencyBrandPrimary: brand.primary || null,
      sourceAgencyBrandSecondary: brand.secondary || null
    };

    for (const ev of batch) {
      const id = Number(ev.id);
      if (!byEventId.has(id)) {
        byEventId.set(id, {
          ...ev,
          hubSourcePartners: [partnerPayload]
        });
      } else {
        const cur = byEventId.get(id);
        cur.hubSourcePartners = cur.hubSourcePartners || [];
        const dup = cur.hubSourcePartners.some(
          (x) => Number(x.sourceAgencyId) === Number(partnerPayload.sourceAgencyId)
        );
        if (!dup) cur.hubSourcePartners.push(partnerPayload);
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

function hubPublicWebsiteUrlFromRow(row) {
  const ts = parseJsonObject(row?.theme_settings);
  const u = String(ts.publicWebsiteUrl || '').trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

/**
 * Hub footer: one row per participating **parent agency** (program sources resolve to parent),
 * with logo URL, optional main website (theme_settings.publicWebsiteUrl), and provider-finder flag.
 */
export async function loadHubFooterPartners(sources, baseUrl) {
  const list = Array.isArray(sources) ? sources : [];
  const base = String(baseUrl || '').trim();
  const byId = new Map();

  for (const src of list) {
    if (!src || src.isActive === false) continue;
    const st = String(src.sourceType || '').toLowerCase();
    if (st !== 'agency' && st !== 'organization') continue;
    const sid = Number(src.sourceId);
    if (!Number.isFinite(sid) || sid <= 0) continue;

    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.slug, a.logo_path, a.logo_url,
              LOWER(COALESCE(a.organization_type, 'agency')) AS org_type,
              a.theme_settings, a.color_palette,
              i.file_path AS icon_file_path
       FROM agencies a
       LEFT JOIN icons i ON a.icon_id = i.id
       WHERE a.id = ? LIMIT 1`,
      [sid]
    );
    const row = rows?.[0];
    if (!row) continue;
    const displayRow = await resolveHubDisplayAgencyRow(pool, row);
    if (!displayRow) continue;
    const aid = Number(displayRow.id);
    if (!Number.isFinite(aid) || aid <= 0) continue;
    if (byId.has(aid)) continue;

    const gate = await checkPublicAvailabilityGate(aid);
    const brand = hubAgencyBrandColorsFromRow(displayRow);
    byId.set(aid, {
      agencyId: aid,
      agencyName: String(displayRow.name || '').trim() || `Agency ${aid}`,
      agencySlug: String(displayRow.slug || '').trim().toLowerCase() || '',
      logoUrl: base ? resolveAgencyLogoUrlForHub(base, displayRow) : null,
      websiteUrl: hubPublicWebsiteUrlFromRow(displayRow),
      publicAvailabilityEnabled: gate.ok === true,
      findProviderPath: `/find-provider/${aid}`,
      requiresAccessKey: true,
      brandPrimaryHex: brand.primary || null,
      brandSecondaryHex: brand.secondary || null
    });
  }

  return [...byId.values()].sort((a, b) =>
    String(a.agencyName || '').localeCompare(String(b.agencyName || ''), undefined, { sensitivity: 'base' })
  );
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

  const origin = { addressText: addr };

  const conn = await pool.getConnection();
  try {
    const sources = await listSourcesForPage(page.id);
    const baseUrl = hubRequestBaseUrl(res.req);
    const events = await loadHubPublicEvents(conn, sources, { baseUrl });
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
          latitude: null,
          longitude: null,
          formattedAddress: addr
        },
        events: scored
      }
    };
  } finally {
    conn.release();
  }
}

export { normalizeSlug, parseJsonObject };
