/**
 * School-portal marketing campaigns owned by an agency.
 *
 * Manager (agency admin/support/super_admin) creates a "campaign" tied to a
 * real registratable destination (public marketing page, agency event, skill-
 * builders program, program enrollment, agency enrollment). Each campaign:
 *   - targets one or more of the agency's schools (or "all" by default)
 *   - can be paused per-school (quick action) without deleting
 *   - carries an optional PDF flier (downloadable from the toast)
 *   - is rendered as a slide-out toast on each targeted school portal for
 *     school_staff users (controlled by audience_school_staff_only)
 *
 * Mount paths:
 *   /api/agency-marketing-splashes/...     (manager surface, agency-scoped)
 *   /api/school-portal/marketing-splashes/...  (school-portal surface, member)
 */

import multer from 'multer';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';

const ALLOWED_MANAGER_ROLES = new Set(['admin', 'super_admin', 'support']);
const VALID_KINDS = new Set([
  'marketing_page',
  'event',
  'agency_events',
  'program_events',
  'program_enrollment',
  'agency_enrollment'
]);
const VALID_INITIAL_STATES = new Set(['peek', 'expanded', 'tab']);
const VALID_POSITIONS = new Set(['right', 'bottom-right', 'bottom']);
const VALID_ACK_KINDS = new Set(['snoozed', 'clicked', 'downloaded', 'closed']);

// Audience role keys recognized for both school portal + dashboard surfaces.
// 'school_staff' is the historical default and matches the school portal mount.
// '*' wildcard is allowed (means "every signed-in user"); rarely useful but cheap.
const VALID_AUDIENCE_KINDS = new Set([
  '*',
  'school_staff',
  'admin',
  'support',
  'staff',
  'provider',
  'intern',
  'clinical_practice_assistant',
  'supervisor',
  'schedule_manager',
  'provider_plus',
  'club_manager'
]);
const STAFF_DASHBOARD_AUDIENCES = new Set(VALID_AUDIENCE_KINDS);
STAFF_DASHBOARD_AUDIENCES.delete('school_staff'); // school_staff is rendered via portal, not dashboard

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const toBoolInt = (v) => (v === 1 || v === true || v === '1' || v === 'true' ? 1 : 0);
const toNullableTimestamp = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
};

function parseJsonArray(raw) {
  if (raw == null) return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(v)) return v;
  } catch (_) { /* fall through */ }
  return null;
}

function sanitizeAudienceKinds(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const v of input) {
    const s = String(v || '').toLowerCase().trim();
    if (VALID_AUDIENCE_KINDS.has(s) && !out.includes(s)) out.push(s);
  }
  return out.length ? out : null;
}

function effectiveAudienceKinds(row) {
  const stored = parseJsonArray(row?.audience_kinds);
  if (stored && stored.length) return stored;
  return row?.audience_school_staff_only ? ['school_staff'] : ['*'];
}

function sanitizeCrossTenantIds(input) {
  if (!Array.isArray(input)) return null;
  const ids = [];
  for (const v of input) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids.length ? ids : null;
}

const requireManagerForAgency = async (req, res, agencyId) => {
  if (!req.user?.id) {
    res.status(401).json({ error: { message: 'Sign in required' } });
    return false;
  }
  const role = String(req.user.role || '').toLowerCase();
  if (!ALLOWED_MANAGER_ROLES.has(role)) {
    res.status(403).json({ error: { message: 'Agency admin / support access required' } });
    return false;
  }
  if (role === 'super_admin') return true;
  // Confirm membership in the agency.
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies
     WHERE user_id = ? AND agency_id = ? AND is_active = 1
     LIMIT 1`,
    [req.user.id, agencyId]
  );
  if (!rows?.length) {
    res.status(403).json({ error: { message: 'Not a member of this agency' } });
    return false;
  }
  return true;
};

// ──────────────────────────────────────────────────────────────────
// Destination resolution
// ──────────────────────────────────────────────────────────────────

/**
 * Resolve a destination_kind + destination_id (+ optional subset) into the
 * data needed to render the toast: title/dates/hero/url. The manager UI calls
 * this when the user picks something from the dropdown so it can pre-fill
 * fields. The portal also calls it at read-time so URLs stay current.
 */
async function resolveDestination({ kind, id, subsetJson, agencyId, overrideUrl }) {
  const slugRow = agencyId
    ? (await pool.execute(`SELECT slug FROM agencies WHERE id = ? LIMIT 1`, [agencyId]))[0]?.[0]
    : null;
  const agencySlug = slugRow?.slug || null;
  const safeUrl = (u) => (typeof u === 'string' && u.length > 0 ? u : null);

  switch (kind) {
    case 'marketing_page': {
      if (!id) return null;
      const [rows] = await pool.execute(
        `SELECT id, slug, title, hero_title, hero_subtitle, hero_image_url, is_active
         FROM public_marketing_pages WHERE id = ? LIMIT 1`,
        [id]
      );
      const row = rows?.[0];
      if (!row) return null;
      return {
        kind,
        id: Number(row.id),
        title: row.hero_title || row.title || '',
        subtitle: row.hero_subtitle || '',
        heroImageUrl: row.hero_image_url || null,
        url: safeUrl(overrideUrl) || `/p/${row.slug}`,
        isLive: !!row.is_active
      };
    }

    case 'event':
    case 'program_events':
    case 'program_enrollment': {
      if (!id) return null;
      const [rows] = await pool.execute(
        `SELECT id, agency_id, title, description, starts_at, ends_at, is_active, event_type
         FROM company_events WHERE id = ? LIMIT 1`,
        [id]
      );
      const row = rows?.[0];
      if (!row) return null;
      // Build a stable public URL based on the agency slug.
      let url = safeUrl(overrideUrl);
      if (!url && agencySlug) {
        if (kind === 'event') {
          url = `/${agencySlug}/events#event-${row.id}`;
        } else if (kind === 'program_events') {
          url = `/${agencySlug}/programs/${row.id}/events`;
        } else if (kind === 'program_enrollment') {
          url = `/${agencySlug}/programs/${row.id}/enroll`;
        }
      }
      let featuredCount = null;
      if (kind === 'program_events' && Array.isArray(subsetJson) && subsetJson.length) {
        featuredCount = subsetJson.length;
      }
      return {
        kind,
        id: Number(row.id),
        title: row.title || '',
        subtitle: row.description ? String(row.description).slice(0, 240) : '',
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        url: url || null,
        isLive: !!row.is_active,
        featuredCount
      };
    }

    case 'agency_events': {
      return {
        kind,
        id: null,
        title: 'Upcoming events',
        url: agencySlug ? safeUrl(overrideUrl) || `/${agencySlug}/events` : safeUrl(overrideUrl),
        isLive: !!agencySlug
      };
    }

    case 'agency_enrollment': {
      return {
        kind,
        id: null,
        title: 'Enroll',
        url: agencySlug ? safeUrl(overrideUrl) || `/${agencySlug}/enroll` : safeUrl(overrideUrl),
        isLive: !!agencySlug
      };
    }

    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Manager: destination picker options
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/agency-marketing-splashes/agencies/:agencyId/destination-options?kind=...
 * Returns candidate destination entities for the requested kind, scoped to
 * the agency. The picker UI uses these to populate a typeahead.
 */
export const listDestinationOptions = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;
    const kind = String(req.query?.kind || '').trim();
    if (!VALID_KINDS.has(kind)) {
      return res.status(400).json({ error: { message: 'Invalid destination kind' } });
    }
    const q = String(req.query?.q || '').trim().toLowerCase();
    const limit = Math.min(50, Math.max(5, toInt(req.query?.limit) || 25));

    let options = [];
    if (kind === 'marketing_page') {
      const [rows] = await pool.execute(
        `SELECT id, slug, title, hero_title, hero_image_url, is_active
         FROM public_marketing_pages
         ${q ? `WHERE LOWER(title) LIKE ? OR LOWER(slug) LIKE ?` : ''}
         ORDER BY is_active DESC, title ASC
         LIMIT ${limit}`,
        q ? [`%${q}%`, `%${q}%`] : []
      );
      options = (rows || []).map((r) => ({
        id: Number(r.id),
        label: r.hero_title || r.title || r.slug,
        sublabel: `/p/${r.slug}`,
        isActive: !!r.is_active,
        heroImageUrl: r.hero_image_url || null
      }));
    } else if (kind === 'event' || kind === 'program_events' || kind === 'program_enrollment') {
      const eventTypeFilter = kind === 'program_events' || kind === 'program_enrollment'
        ? `AND (LOWER(COALESCE(event_type, '')) LIKE 'skill_builders%' OR LOWER(COALESCE(event_type, '')) LIKE '%program%')`
        : '';
      const params = [agencyId];
      let where = `agency_id = ? ${eventTypeFilter}`;
      if (q) {
        where += ` AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)`;
        params.push(`%${q}%`, `%${q}%`);
      }
      const [rows] = await pool.execute(
        `SELECT id, title, starts_at, ends_at, is_active, event_type
         FROM company_events
         WHERE ${where}
         ORDER BY (ends_at >= NOW()) DESC, starts_at ASC
         LIMIT ${limit}`,
        params
      );
      options = (rows || []).map((r) => ({
        id: Number(r.id),
        label: r.title || `Event #${r.id}`,
        sublabel: r.starts_at
          ? `${new Date(r.starts_at).toISOString().slice(0, 10)}${r.ends_at ? ' → ' + new Date(r.ends_at).toISOString().slice(0, 10) : ''}`
          : (r.event_type || ''),
        isActive: !!r.is_active
      }));
      // For program_events: surface child sessions for the subset multi-select
      if (kind === 'program_events' && options.length === 1) {
        const programId = options[0].id;
        try {
          const [sessRows] = await pool.execute(
            `SELECT id, name, scheduled_at FROM skill_builders_event_sessions
             WHERE company_event_id = ? ORDER BY scheduled_at ASC, id ASC LIMIT 100`,
            [programId]
          );
          options[0].sessions = (sessRows || []).map((s) => ({
            id: Number(s.id),
            label: s.name || `Session #${s.id}`,
            scheduledAt: s.scheduled_at
          }));
        } catch (_) {
          options[0].sessions = [];
        }
      }
    } else if (kind === 'agency_events' || kind === 'agency_enrollment') {
      // Singleton "destination" — the agency itself.
      options = [{ id: null, label: 'This agency', sublabel: '', isActive: true }];
    }

    return res.json({ kind, options });
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────────────────────────
// Manager: list / create / update / delete campaigns
// ──────────────────────────────────────────────────────────────────

async function loadSplashRow(splashId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT * FROM agency_marketing_splashes WHERE id = ? AND agency_id = ? LIMIT 1`,
    [splashId, agencyId]
  );
  return rows?.[0] || null;
}

async function loadTargetSchools(splashId) {
  const [rows] = await pool.execute(
    `SELECT splash_id, school_organization_id, is_enabled, paused_at
     FROM agency_marketing_splash_schools WHERE splash_id = ?`,
    [splashId]
  );
  return rows || [];
}

async function loadAgencySchools(agencyId, crossTenantAgencyIds = null) {
  const ids = [Number(agencyId), ...((crossTenantAgencyIds || []).map((n) => Number(n)).filter(Boolean))];
  const uniq = [...new Set(ids)];
  const ph = uniq.map(() => '?').join(', ');
  const [direct] = await pool.execute(
    `SELECT s.id, s.name, s.slug, asx.agency_id AS owner_agency_id
     FROM agency_schools asx
     INNER JOIN agencies s ON s.id = asx.school_organization_id
     WHERE asx.agency_id IN (${ph}) AND asx.is_active = TRUE AND s.organization_type = 'school'
     ORDER BY s.name ASC`,
    uniq
  );
  const [aff] = await pool.execute(
    `SELECT s.id, s.name, s.slug, oa.agency_id AS owner_agency_id
     FROM organization_affiliations oa
     INNER JOIN agencies s ON s.id = oa.organization_id
     WHERE oa.agency_id IN (${ph}) AND oa.is_active = TRUE AND s.organization_type = 'school'
     ORDER BY s.name ASC`,
    uniq
  );
  const map = new Map();
  for (const row of [...(direct || []), ...(aff || [])]) {
    const id = Number(row.id);
    const ownerId = Number(row.owner_agency_id);
    const isCross = ownerId !== Number(agencyId);
    if (!map.has(id)) {
      map.set(id, { id, name: row.name, slug: row.slug, ownerAgencyId: ownerId, crossTenant: isCross });
    } else if (!isCross) {
      // Prefer marking it owned by the originating agency if both apply.
      map.get(id).crossTenant = false;
      map.get(id).ownerAgencyId = ownerId;
    }
  }
  return [...map.values()];
}

async function shapeSplashRow(row, agencyId) {
  const targets = await loadTargetSchools(row.id);
  const subset = (() => {
    if (!row.destination_subset_json) return null;
    try {
      return typeof row.destination_subset_json === 'string'
        ? JSON.parse(row.destination_subset_json)
        : row.destination_subset_json;
    } catch { return null; }
  })();
  const destination = await resolveDestination({
    kind: row.destination_kind,
    id: row.destination_id,
    subsetJson: subset,
    agencyId,
    overrideUrl: row.destination_override_url
  });
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    ctaLabel: row.cta_label,
    accentColor: row.accent_color,
    logoPath: row.logo_path,
    flierPath: row.flier_path,
    flierFilename: row.flier_filename,
    flierUrl: row.flier_path ? `/uploads/${row.flier_path.replace(/^uploads\//, '')}` : null,
    destination: {
      kind: row.destination_kind,
      id: row.destination_id ? Number(row.destination_id) : null,
      subsetJson: subset,
      overrideUrl: row.destination_override_url,
      resolved: destination
    },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: !!row.is_active,
    priority: Number(row.priority || 0),
    initialState: row.initial_state,
    position: row.position,
    showQr: !!row.show_qr,
    showFlier: !!row.show_flier,
    reshowAfterHours: Number(row.reshow_after_hours || 0),
    audienceSchoolStaffOnly: !!row.audience_school_staff_only,
    audienceKinds: effectiveAudienceKinds(row),
    crossTenantTargetAgencyIds: parseJsonArray(row.cross_tenant_target_agency_ids) || [],
    isCrossTenant: !!row.is_cross_tenant,
    targetSchools: targets.map((t) => ({
      schoolOrganizationId: Number(t.school_organization_id),
      isEnabled: !!t.is_enabled,
      pausedAt: t.paused_at
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * GET /api/agency-marketing-splashes/agencies/:agencyId
 */
export const listSplashes = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;
    const [rows] = await pool.execute(
      `SELECT * FROM agency_marketing_splashes
       WHERE agency_id = ?
       ORDER BY is_active DESC, priority DESC, created_at DESC`,
      [agencyId]
    );
    const splashes = await Promise.all((rows || []).map((r) => shapeSplashRow(r, agencyId)));
    // Union all cross-tenant agencies referenced by any active campaign so the
    // editor can show the right schools without round-tripping per row.
    const crossSet = new Set();
    for (const s of splashes) {
      for (const id of (s.crossTenantTargetAgencyIds || [])) crossSet.add(Number(id));
    }
    const schools = await loadAgencySchools(agencyId, [...crossSet]);
    return res.json({ splashes, schools });
  } catch (e) { next(e); }
};

/**
 * GET /api/agency-marketing-splashes/agencies/:agencyId/tenant-options
 * super_admin: lists all tenants on the platform (id, name, slug) so the
 * editor can build the "cross-tenant target tenants" multi-select.
 * Non-superadmin gets a 403.
 */
export const listTenantOptions = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;
    const role = String(req.user.role || '').toLowerCase();
    if (role !== 'super_admin') return res.status(403).json({ error: { message: 'Super admin only' } });
    const [rows] = await pool.execute(
      `SELECT id, name, slug, organization_type
       FROM agencies
       WHERE id <> ? AND COALESCE(organization_type, '') IN ('agency', 'affiliation', 'program', 'learning')
       ORDER BY name ASC
       LIMIT 500`,
      [agencyId]
    );
    return res.json({
      tenants: (rows || []).map((r) => ({
        id: Number(r.id),
        name: r.name,
        slug: r.slug,
        kind: r.organization_type
      }))
    });
  } catch (e) { next(e); }
};

/**
 * POST /api/agency-marketing-splashes/agencies/:agencyId
 * Body: { title, subtitle?, body?, ctaLabel?, accentColor?, destinationKind,
 *         destinationId?, destinationSubsetJson?, destinationOverrideUrl?,
 *         startsAt?, endsAt?, isActive?, priority?, initialState?, position?,
 *         showQr?, showFlier?, reshowAfterHours?,
 *         audienceSchoolStaffOnly?, targetSchoolIds? (array, null = all),
 *         pausedSchoolIds? (array of schools to opt out) }
 */
export const createSplash = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;

    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 180);
    if (!title) return res.status(400).json({ error: { message: 'Title is required' } });
    const kind = String(body.destinationKind || '').trim();
    if (!VALID_KINDS.has(kind)) return res.status(400).json({ error: { message: 'Invalid destination kind' } });

    const initialState = VALID_INITIAL_STATES.has(body.initialState) ? body.initialState : 'peek';
    const position = VALID_POSITIONS.has(body.position) ? body.position : 'right';
    const subsetJson = Array.isArray(body.destinationSubsetJson) ? JSON.stringify(body.destinationSubsetJson) : null;
    const isSuperAdmin = String(req.user.role || '').toLowerCase() === 'super_admin';

    const audienceKinds = sanitizeAudienceKinds(body.audienceKinds);
    // Legacy compat: fall back to a single-kind audience based on the boolean.
    const finalAudience = audienceKinds || (body.audienceSchoolStaffOnly === false ? ['*'] : ['school_staff']);

    // Cross-tenant only when superadmin.
    const crossIds = isSuperAdmin ? sanitizeCrossTenantIds(body.crossTenantTargetAgencyIds) : null;

    const [result] = await pool.execute(
      `INSERT INTO agency_marketing_splashes (
        agency_id, created_by_user_id, updated_by_user_id,
        title, subtitle, body, cta_label, accent_color,
        destination_kind, destination_id, destination_subset_json, destination_override_url,
        starts_at, ends_at, is_active, priority,
        initial_state, position, show_qr, show_flier, reshow_after_hours,
        audience_school_staff_only, audience_kinds, cross_tenant_target_agency_ids, is_cross_tenant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId, req.user.id, req.user.id,
        title,
        body.subtitle ? String(body.subtitle).slice(0, 240) : null,
        body.body ? String(body.body) : null,
        body.ctaLabel ? String(body.ctaLabel).slice(0, 64) : null,
        body.accentColor ? String(body.accentColor).slice(0, 16) : null,
        kind,
        toInt(body.destinationId),
        subsetJson,
        body.destinationOverrideUrl ? String(body.destinationOverrideUrl).slice(0, 1024) : null,
        toNullableTimestamp(body.startsAt),
        toNullableTimestamp(body.endsAt),
        toBoolInt(body.isActive),
        toInt(body.priority) || 0,
        initialState,
        position,
        body.showQr === false ? 0 : 1,
        body.showFlier === false ? 0 : 1,
        toInt(body.reshowAfterHours) ?? 24,
        // Keep legacy boolean in sync with audience for safety.
        finalAudience.includes('school_staff') && finalAudience.length === 1 ? 1 : 0,
        JSON.stringify(finalAudience),
        crossIds ? JSON.stringify(crossIds) : null,
        crossIds && crossIds.length ? 1 : 0
      ]
    );
    const splashId = Number(result.insertId);
    await replaceTargetSchools(splashId, agencyId, body.targetSchoolIds, body.pausedSchoolIds, crossIds);

    const row = await loadSplashRow(splashId, agencyId);
    return res.status(201).json(await shapeSplashRow(row, agencyId));
  } catch (e) { next(e); }
};

/**
 * PATCH /api/agency-marketing-splashes/agencies/:agencyId/:id
 */
export const updateSplash = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    const splashId = toInt(req.params.id);
    if (!agencyId || !splashId) return res.status(400).json({ error: { message: 'Invalid identifiers' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;

    const existing = await loadSplashRow(splashId, agencyId);
    if (!existing) return res.status(404).json({ error: { message: 'Splash not found' } });

    const updates = [];
    const params = [];
    const body = req.body || {};

    const set = (col, val) => { updates.push(`${col} = ?`); params.push(val); };

    if (body.title !== undefined) set('title', String(body.title || '').slice(0, 180));
    if (body.subtitle !== undefined) set('subtitle', body.subtitle == null ? null : String(body.subtitle).slice(0, 240));
    if (body.body !== undefined) set('body', body.body == null ? null : String(body.body));
    if (body.ctaLabel !== undefined) set('cta_label', body.ctaLabel == null ? null : String(body.ctaLabel).slice(0, 64));
    if (body.accentColor !== undefined) set('accent_color', body.accentColor == null ? null : String(body.accentColor).slice(0, 16));
    if (body.destinationKind !== undefined) {
      if (!VALID_KINDS.has(body.destinationKind)) return res.status(400).json({ error: { message: 'Invalid destination kind' } });
      set('destination_kind', body.destinationKind);
    }
    if (body.destinationId !== undefined) set('destination_id', toInt(body.destinationId));
    if (body.destinationSubsetJson !== undefined) {
      set('destination_subset_json', Array.isArray(body.destinationSubsetJson) ? JSON.stringify(body.destinationSubsetJson) : null);
    }
    if (body.destinationOverrideUrl !== undefined) {
      set('destination_override_url', body.destinationOverrideUrl == null ? null : String(body.destinationOverrideUrl).slice(0, 1024));
    }
    if (body.startsAt !== undefined) set('starts_at', toNullableTimestamp(body.startsAt));
    if (body.endsAt !== undefined) set('ends_at', toNullableTimestamp(body.endsAt));
    if (body.isActive !== undefined) set('is_active', toBoolInt(body.isActive));
    if (body.priority !== undefined) set('priority', toInt(body.priority) || 0);
    if (body.initialState !== undefined) {
      if (!VALID_INITIAL_STATES.has(body.initialState)) return res.status(400).json({ error: { message: 'Invalid initial state' } });
      set('initial_state', body.initialState);
    }
    if (body.position !== undefined) {
      if (!VALID_POSITIONS.has(body.position)) return res.status(400).json({ error: { message: 'Invalid position' } });
      set('position', body.position);
    }
    if (body.showQr !== undefined) set('show_qr', body.showQr ? 1 : 0);
    if (body.showFlier !== undefined) set('show_flier', body.showFlier ? 1 : 0);
    if (body.reshowAfterHours !== undefined) set('reshow_after_hours', toInt(body.reshowAfterHours) ?? 24);
    if (body.audienceSchoolStaffOnly !== undefined) set('audience_school_staff_only', body.audienceSchoolStaffOnly ? 1 : 0);
    if (body.audienceKinds !== undefined) {
      const kinds = sanitizeAudienceKinds(body.audienceKinds) || ['school_staff'];
      set('audience_kinds', JSON.stringify(kinds));
      set('audience_school_staff_only', kinds.length === 1 && kinds[0] === 'school_staff' ? 1 : 0);
    }
    let crossIdsForTargets;
    if (body.crossTenantTargetAgencyIds !== undefined) {
      const isSuperAdmin = String(req.user.role || '').toLowerCase() === 'super_admin';
      if (!isSuperAdmin) {
        return res.status(403).json({ error: { message: 'Only super admins can edit cross-tenant targets' } });
      }
      const crossIds = sanitizeCrossTenantIds(body.crossTenantTargetAgencyIds);
      set('cross_tenant_target_agency_ids', crossIds ? JSON.stringify(crossIds) : null);
      set('is_cross_tenant', crossIds && crossIds.length ? 1 : 0);
      crossIdsForTargets = crossIds;
    }

    set('updated_by_user_id', req.user.id);

    if (updates.length) {
      await pool.execute(
        `UPDATE agency_marketing_splashes SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
        [...params, splashId, agencyId]
      );
    }

    if (
      body.targetSchoolIds !== undefined
      || body.pausedSchoolIds !== undefined
      || crossIdsForTargets !== undefined
    ) {
      // If we already changed cross-tenant targets above, use those; otherwise
      // fall back to whatever's currently stored so we recompute the correct
      // "allowed schools" universe.
      const cross = crossIdsForTargets !== undefined
        ? crossIdsForTargets
        : parseJsonArray(existing.cross_tenant_target_agency_ids);
      await replaceTargetSchools(splashId, agencyId, body.targetSchoolIds, body.pausedSchoolIds, cross);
    }

    const fresh = await loadSplashRow(splashId, agencyId);
    return res.json(await shapeSplashRow(fresh, agencyId));
  } catch (e) { next(e); }
};

/**
 * DELETE /api/agency-marketing-splashes/agencies/:agencyId/:id
 */
export const deleteSplash = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    const splashId = toInt(req.params.id);
    if (!agencyId || !splashId) return res.status(400).json({ error: { message: 'Invalid identifiers' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;

    const row = await loadSplashRow(splashId, agencyId);
    if (!row) return res.status(404).json({ error: { message: 'Splash not found' } });
    await pool.execute(`DELETE FROM agency_marketing_splashes WHERE id = ? AND agency_id = ?`, [splashId, agencyId]);
    if (row.flier_path) {
      try { await StorageService.deleteAgencyMarketingFlier(row.flier_path); } catch (_) { /* best effort */ }
    }
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

async function replaceTargetSchools(splashId, agencyId, targetIds, pausedIds, crossTenantAgencyIds = null) {
  // Validate that every requested school is one of this agency's schools (or
  // a cross-tenant target agency's schools when applicable).
  const allowed = new Set((await loadAgencySchools(agencyId, crossTenantAgencyIds)).map((s) => s.id));
  const tIds = Array.isArray(targetIds)
    ? targetIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && allowed.has(n))
    : null;
  const pIds = Array.isArray(pausedIds)
    ? new Set(pausedIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && allowed.has(n)))
    : new Set();

  await pool.execute(`DELETE FROM agency_marketing_splash_schools WHERE splash_id = ?`, [splashId]);

  // Build the explicit row set:
  //   - if targetIds is null → no rows (resolver treats as "all schools")
  //     UNLESS there are pIds, in which case we explicitly enable all-allowed
  //     and disable the paused ones.
  //   - otherwise insert one row per targetId (enabled), and optionally
  //     additional disabled rows for pIds not already in targetIds.
  const explicitRows = new Map();
  if (tIds && tIds.length) {
    for (const id of tIds) explicitRows.set(id, true);
  } else if (pIds.size) {
    for (const id of allowed) explicitRows.set(id, !pIds.has(id));
  }
  for (const id of pIds) explicitRows.set(id, false);

  if (explicitRows.size === 0) return;
  const values = [];
  const placeholders = [];
  for (const [schoolId, enabled] of explicitRows.entries()) {
    placeholders.push('(?, ?, ?, ?)');
    values.push(splashId, schoolId, enabled ? 1 : 0, enabled ? null : new Date());
  }
  await pool.execute(
    `INSERT INTO agency_marketing_splash_schools (splash_id, school_organization_id, is_enabled, paused_at) VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * POST /api/agency-marketing-splashes/agencies/:agencyId/:id/schools/:schoolId/pause
 * Quick action used from the school overview / portal toolbars.
 * Body: { paused: boolean }
 */
export const pauseSplashAtSchool = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    const splashId = toInt(req.params.id);
    const schoolId = toInt(req.params.schoolId);
    if (!agencyId || !splashId || !schoolId) {
      return res.status(400).json({ error: { message: 'Invalid identifiers' } });
    }
    if (!(await requireManagerForAgency(req, res, agencyId))) return;

    const allowed = new Set((await loadAgencySchools(agencyId)).map((s) => s.id));
    if (!allowed.has(schoolId)) {
      return res.status(403).json({ error: { message: 'School not under this agency' } });
    }

    const paused = req.body?.paused !== false;
    await pool.execute(
      `INSERT INTO agency_marketing_splash_schools
         (splash_id, school_organization_id, is_enabled, paused_at, paused_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled = VALUES(is_enabled),
         paused_at = IF(VALUES(is_enabled) = 0, NOW(), NULL),
         paused_by_user_id = IF(VALUES(is_enabled) = 0, VALUES(paused_by_user_id), NULL)`,
      [splashId, schoolId, paused ? 0 : 1, paused ? new Date() : null, paused ? req.user.id : null]
    );
    return res.json({ ok: true, paused });
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────────────────────────
// Manager: flier upload
// ──────────────────────────────────────────────────────────────────

const flierUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF or image files are allowed'));
  }
});

export const uploadSplashFlier = [
  flierUpload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = toInt(req.params.agencyId);
      const splashId = toInt(req.params.id);
      if (!agencyId || !splashId) return res.status(400).json({ error: { message: 'Invalid identifiers' } });
      if (!(await requireManagerForAgency(req, res, agencyId))) return;

      const existing = await loadSplashRow(splashId, agencyId);
      if (!existing) return res.status(404).json({ error: { message: 'Splash not found' } });
      if (!req.file) return res.status(400).json({ error: { message: 'File is required' } });

      // Replace any prior flier.
      const oldPath = existing.flier_path;
      const saved = await StorageService.saveAgencyMarketingFlier({
        agencyId,
        splashId,
        uploadedByUserId: req.user.id,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      await pool.execute(
        `UPDATE agency_marketing_splashes
         SET flier_path = ?, flier_filename = ?, updated_by_user_id = ?
         WHERE id = ? AND agency_id = ?`,
        [saved.path, saved.filename, req.user.id, splashId, agencyId]
      );
      if (oldPath) {
        try { await StorageService.deleteAgencyMarketingFlier(oldPath); } catch (_) { /* best effort */ }
      }
      const row = await loadSplashRow(splashId, agencyId);
      return res.json(await shapeSplashRow(row, agencyId));
    } catch (e) { next(e); }
  }
];

export const deleteSplashFlier = async (req, res, next) => {
  try {
    const agencyId = toInt(req.params.agencyId);
    const splashId = toInt(req.params.id);
    if (!agencyId || !splashId) return res.status(400).json({ error: { message: 'Invalid identifiers' } });
    if (!(await requireManagerForAgency(req, res, agencyId))) return;
    const existing = await loadSplashRow(splashId, agencyId);
    if (!existing) return res.status(404).json({ error: { message: 'Splash not found' } });
    if (existing.flier_path) {
      try { await StorageService.deleteAgencyMarketingFlier(existing.flier_path); } catch (_) { /* best effort */ }
    }
    await pool.execute(
      `UPDATE agency_marketing_splashes SET flier_path = NULL, flier_filename = NULL WHERE id = ? AND agency_id = ?`,
      [splashId, agencyId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ──────────────────────────────────────────────────────────────────
// School-portal side: active queue + dismiss
// ──────────────────────────────────────────────────────────────────

/**
 * GET /api/school-portal/marketing-splashes/active?schoolId=...
 * Returns the active (live + scheduled) campaigns the current user should
 * see for the given school. Filters:
 *   - is_active = 1 AND (starts_at IS NULL OR starts_at <= NOW())
 *                  AND (ends_at IS NULL OR ends_at > NOW())
 *   - school is not paused for that splash
 *   - audience: school_staff only when audience_school_staff_only = 1
 *   - excludes splashes the user has dismissed within reshow_after_hours
 */
export const listActiveForPortal = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    const schoolId = toInt(req.query?.schoolId);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId required' } });

    const userRole = String(req.user.role || '').toLowerCase();
    // Determine the agencies that have access to this school (so the queue
    // joins the right campaigns).
    const [agencyRows] = await pool.execute(
      `SELECT DISTINCT agency_id FROM (
         SELECT agency_id FROM agency_schools
         WHERE school_organization_id = ? AND is_active = TRUE
         UNION
         SELECT agency_id FROM organization_affiliations
         WHERE organization_id = ? AND is_active = TRUE
       ) AS combined`,
      [schoolId, schoolId]
    );
    const agencyIds = (agencyRows || []).map((r) => Number(r.agency_id)).filter(Boolean);
    if (!agencyIds.length) return res.json({ splashes: [] });
    const agPh = agencyIds.map(() => '?').join(', ');
    // Also include splashes whose cross_tenant_target_agency_ids overlaps any
    // of this school's owning agencies — this is how a superadmin pushes a
    // campaign from agency A into school portals of agency B.
    const crossClauses = agencyIds.map(() => `JSON_CONTAINS(s.cross_tenant_target_agency_ids, JSON_ARRAY(?))`).join(' OR ');

    const [rows] = await pool.execute(
      `SELECT s.*
       FROM agency_marketing_splashes s
       LEFT JOIN agency_marketing_splash_schools ss
         ON ss.splash_id = s.id AND ss.school_organization_id = ?
       LEFT JOIN agency_marketing_splash_dismissals d
         ON d.splash_id = s.id AND d.user_id = ?
       WHERE (s.agency_id IN (${agPh}) OR (${crossClauses}))
         AND s.is_active = 1
         AND (s.starts_at IS NULL OR s.starts_at <= NOW())
         AND (s.ends_at IS NULL OR s.ends_at > NOW())
         AND (ss.is_enabled IS NULL OR ss.is_enabled = 1)
         AND (
           d.id IS NULL
           OR d.dismissed_at < (NOW() - INTERVAL s.reshow_after_hours HOUR)
         )
       ORDER BY s.priority DESC, s.created_at DESC`,
      [schoolId, req.user.id, ...agencyIds, ...agencyIds]
    );

    // Audience filter (in JS, since audience_kinds may be the legacy NULL/0/1 or new JSON)
    const audienceFiltered = (rows || []).filter((row) => {
      const kinds = effectiveAudienceKinds(row);
      if (kinds.includes('*')) return true;
      return kinds.includes('school_staff') ? userRole === 'school_staff' : kinds.includes(userRole);
    });
    rows.length = 0;
    rows.push(...audienceFiltered);

    // Targeting policy: if any explicit (enabled) row exists for this splash
    // AND no row matches this school, the splash is NOT for this school.
    const splashIds = (rows || []).map((r) => Number(r.id));
    let explicitMap = new Map();
    if (splashIds.length) {
      const ph = splashIds.map(() => '?').join(', ');
      const [explicitRows] = await pool.execute(
        `SELECT splash_id, school_organization_id, is_enabled
         FROM agency_marketing_splash_schools
         WHERE splash_id IN (${ph})`,
        splashIds
      );
      for (const r of explicitRows || []) {
        const sid = Number(r.splash_id);
        if (!explicitMap.has(sid)) explicitMap.set(sid, { enabled: new Set(), disabled: new Set() });
        const bucket = explicitMap.get(sid);
        if (r.is_enabled) bucket.enabled.add(Number(r.school_organization_id));
        else bucket.disabled.add(Number(r.school_organization_id));
      }
    }

    const filtered = (rows || []).filter((row) => {
      const buckets = explicitMap.get(Number(row.id));
      if (!buckets) return true;
      if (buckets.disabled.has(Number(schoolId))) return false;
      // If the splash uses an explicit allow-list, only those schools pass.
      if (buckets.enabled.size > 0 && !buckets.enabled.has(Number(schoolId))) return false;
      return true;
    });

    const splashes = await Promise.all(
      filtered.map((row) => shapeSplashRow(row, Number(row.agency_id)))
    );
    return res.json({ splashes });
  } catch (e) { next(e); }
};

/**
 * GET /api/marketing-splashes/dashboard-active
 * Returns the active campaigns the current user should see on the regular
 * staff/provider dashboard (not school portal). Filters by:
 *   - User's owning agency (via user_agencies) plus any agency that's listed
 *     in cross_tenant_target_agency_ids of an active splash.
 *   - audience_kinds matches the user role and is NOT school_staff-only
 *     (school_staff lives on the portal mount).
 *   - Same is_active + window + dismissal/reshow rules as the portal feed.
 */
export const listActiveForDashboard = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    const userRole = String(req.user.role || '').toLowerCase();

    // Find every agency this user is meaningfully in. We use user_agencies as
    // the source of truth for "this is your tenant".
    const [agencyRows] = await pool.execute(
      `SELECT DISTINCT agency_id FROM user_agencies WHERE user_id = ? AND is_active = 1`,
      [req.user.id]
    );
    const agencyIds = (agencyRows || []).map((r) => Number(r.agency_id)).filter(Boolean);
    if (!agencyIds.length) return res.json({ splashes: [] });
    const agPh = agencyIds.map(() => '?').join(', ');
    const crossClauses = agencyIds.map(() => `JSON_CONTAINS(s.cross_tenant_target_agency_ids, JSON_ARRAY(?))`).join(' OR ');

    const [rows] = await pool.execute(
      `SELECT s.*
       FROM agency_marketing_splashes s
       LEFT JOIN agency_marketing_splash_dismissals d
         ON d.splash_id = s.id AND d.user_id = ?
       WHERE (s.agency_id IN (${agPh}) OR (${crossClauses}))
         AND s.is_active = 1
         AND (s.starts_at IS NULL OR s.starts_at <= NOW())
         AND (s.ends_at IS NULL OR s.ends_at > NOW())
         AND (
           d.id IS NULL
           OR d.dismissed_at < (NOW() - INTERVAL s.reshow_after_hours HOUR)
         )
       ORDER BY s.priority DESC, s.created_at DESC`,
      [req.user.id, ...agencyIds, ...agencyIds]
    );

    // Filter audience: must NOT be school_staff-only (those live on the portal),
    // must include the current user's role (or '*').
    const filtered = (rows || []).filter((row) => {
      const kinds = effectiveAudienceKinds(row);
      if (kinds.length === 1 && kinds[0] === 'school_staff') return false;
      if (kinds.includes('*')) return true;
      return kinds.includes(userRole);
    });

    const splashes = await Promise.all(
      filtered.map((row) => shapeSplashRow(row, Number(row.agency_id)))
    );
    return res.json({ splashes });
  } catch (e) { next(e); }
};

/**
 * POST /api/school-portal/marketing-splashes/:id/dismiss
 * Body: { ackKind: 'snoozed' | 'clicked' | 'downloaded' | 'closed' }
 */
export const dismissSplash = async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    const splashId = toInt(req.params.id);
    if (!splashId) return res.status(400).json({ error: { message: 'Invalid splash' } });
    const ackKind = String(req.body?.ackKind || 'snoozed').toLowerCase();
    if (!VALID_ACK_KINDS.has(ackKind)) {
      return res.status(400).json({ error: { message: 'Invalid ack kind' } });
    }
    await pool.execute(
      `INSERT INTO agency_marketing_splash_dismissals (splash_id, user_id, ack_kind)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ack_kind = VALUES(ack_kind), dismissed_at = NOW()`,
      [splashId, req.user.id, ackKind]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};
