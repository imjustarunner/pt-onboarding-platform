import pool from '../config/database.js';
import { geocodeAddressWithGoogle } from '../services/googleGeocode.service.js';
import {
  attachDistanceScoresToPublicEvents,
  loadPublicAgencyEventRows,
  loadPublicProgramEventRows,
  loadPublicProgramEventRowsMerged,
  respondNearestDistanceError
} from '../services/skillBuildersPublicEvents.service.js';
import {
  resolveAffiliatedProgramOrganizationIdBySlug,
  resolveAffiliatedProgramOrganizationIdBySlugAnyParent,
  resolveSkillBuildersProgramOrganizationId
} from '../services/skillBuildersSkillsGroup.service.js';

/**
 * Shared resolver for GET/POST `/portal/:portalSlug/programs/:programSlug/...`.
 * When the portal slug is a program organization, events are merged across all affiliated parent agencies.
 */
async function resolvePortalProgramPublicListing(conn, portalSlug, programSlug) {
  const ps = String(portalSlug || '').trim().toLowerCase();
  const prSlug = String(programSlug || '').trim().toLowerCase();
  if (!ps || !prSlug) {
    return { ok: false, status: 400, message: 'Invalid portal or program slug' };
  }

  const [agencyRows] = await conn.execute(
    `SELECT id, name, slug, COALESCE(organization_type, 'agency') AS organization_type
     FROM agencies
     WHERE LOWER(TRIM(slug)) = ?
       AND (is_archived = FALSE OR is_archived IS NULL)
     LIMIT 1`,
    [ps]
  );
  const agencyRow = agencyRows?.[0];
  const orgType = String(agencyRow?.organization_type || '').toLowerCase();

  if (agencyRow && orgType === 'agency') {
    const agencyId = Number(agencyRow.id);
    const agencyName = String(agencyRow.name || '').trim() || null;
    const agencySlugOut = String(agencyRow.slug || ps).trim().toLowerCase() || null;
    const programOrgId = await resolveAffiliatedProgramOrganizationIdBySlug(conn, agencyId, prSlug);
    if (!programOrgId) {
      return {
        ok: true,
        payload: {
          ok: true,
          agencyId,
          agencyName,
          agencySlug: agencySlugOut,
          organizationId: null,
          programSlug: prSlug,
          events: []
        }
      };
    }
    const events = await loadPublicProgramEventRows(conn, agencyId, programOrgId);
    return {
      ok: true,
      payload: {
        ok: true,
        agencyId,
        agencyName,
        agencySlug: agencySlugOut,
        organizationId: programOrgId,
        programSlug: prSlug,
        events
      }
    };
  }

  const [progRows] = await conn.execute(
    `SELECT child.id AS program_org_id
     FROM agencies child
     INNER JOIN organization_affiliations oa
       ON oa.organization_id = child.id AND oa.is_active = TRUE
     WHERE LOWER(TRIM(child.slug)) = ?
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
     LIMIT 1`,
    [ps]
  );
  const pr = progRows?.[0];
  if (!pr) {
    return { ok: false, status: 404, message: 'Organization not found' };
  }

  const portalProgramOrgId = Number(pr.program_org_id);
  const [parents] = await conn.execute(
    `SELECT a.id, a.name, a.slug
     FROM organization_affiliations oa
     INNER JOIN agencies a ON a.id = oa.agency_id
     WHERE oa.organization_id = ?
       AND oa.is_active = TRUE
     ORDER BY a.id ASC`,
    [portalProgramOrgId]
  );
  const primaryParent = parents?.[0];
  if (!primaryParent) {
    return { ok: false, status: 404, message: 'Agency not found for program' };
  }

  let programOrgId = portalProgramOrgId;
  if (prSlug !== ps) {
    programOrgId = await resolveAffiliatedProgramOrganizationIdBySlugAnyParent(conn, prSlug);
  }

  const agencyName = String(primaryParent.name || '').trim() || null;
  const agencySlugOut = String(primaryParent.slug || '').trim().toLowerCase() || null;
  const parentAgencyId = Number(primaryParent.id);

  if (!programOrgId) {
    return {
      ok: true,
      payload: {
        ok: true,
        agencyId: parentAgencyId,
        agencyName,
        agencySlug: agencySlugOut,
        organizationId: null,
        programSlug: prSlug,
        events: []
      }
    };
  }

  const events = await loadPublicProgramEventRowsMerged(conn, programOrgId);
  const payload = {
    ok: true,
    agencyId: parentAgencyId,
    agencyName,
    agencySlug: agencySlugOut,
    organizationId: programOrgId,
    programSlug: prSlug,
    events
  };
  if (parents.length > 1 && prSlug === ps && programOrgId === portalProgramOrgId) {
    payload.mergedParentAgencyCount = parents.length;
  }
  return { ok: true, payload };
}

/** GET /api/public/skill-builders/agency/:slug/events */
export const listPublicAgencyEvents = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: { message: 'Invalid slug' } });
    const [orgs] = await pool.execute(
      `SELECT id, name, slug FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });
    const agencyName = String(orgs[0].name || '').trim() || null;
    const agencySlugOut = String(orgs[0].slug || '').trim().toLowerCase() || null;

    const conn = await pool.getConnection();
    try {
      const events = await loadPublicAgencyEventRows(conn, agencyId);
      res.json({ ok: true, agencyId, agencyName, agencySlug: agencySlugOut, events });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/public/skill-builders/agency/:slug/events/nearest
 * Body: { address: string } — geocodes home address; returns events sorted by **driving** distance (Google Distance Matrix).
 */
export const rankPublicAgencyEventsByAddress = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const address = String(req.body?.address || '').trim();
    if (!slug) return res.status(400).json({ error: { message: 'Invalid slug' } });
    if (!address) return res.status(400).json({ error: { message: 'address is required' } });

    const [orgs] = await pool.execute(
      `SELECT id, name, slug FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    let origin;
    try {
      origin = await geocodeAddressWithGoogle({ addressText: address, countryCode: 'US' });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'MAPS_KEY_MISSING') {
        return res.status(503).json({ error: { message: 'Location search is not configured.' } });
      }
      return res.status(400).json({ error: { message: err?.message || 'Could not find that address.' } });
    }

    const conn = await pool.getConnection();
    try {
      const events = await loadPublicAgencyEventRows(conn, agencyId);
      let scored;
      try {
        scored = await attachDistanceScoresToPublicEvents(events, origin, new Map());
      } catch (err) {
        if (respondNearestDistanceError(res, err)) return;
        throw err;
      }
      res.json({
        ok: true,
        agencyId,
        distanceMode: 'driving',
        origin: {
          latitude: origin.latitude,
          longitude: origin.longitude,
          formattedAddress: origin.formattedAddress || null
        },
        events: scored
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/skill-builders/agency/:slug/programs/:programSlug/events */
export const listPublicProgramEventsByProgramSlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const programSlug = String(req.params.programSlug || '').trim().toLowerCase();
    if (!slug || !programSlug) {
      return res.status(400).json({ error: { message: 'Invalid agency or program slug' } });
    }
    const [orgs] = await pool.execute(
      `SELECT id, name, slug FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });
    const agencyName = String(orgs[0].name || '').trim() || null;
    const agencySlugOut = String(orgs[0].slug || '').trim().toLowerCase() || null;

    const conn = await pool.getConnection();
    try {
      const programOrgId = await resolveAffiliatedProgramOrganizationIdBySlug(conn, agencyId, programSlug);
      if (!programOrgId) {
        return res.json({
          ok: true,
          agencyId,
          agencyName,
          agencySlug: agencySlugOut,
          organizationId: null,
          programSlug,
          events: []
        });
      }
      const events = await loadPublicProgramEventRows(conn, agencyId, programOrgId);
      res.json({
        ok: true,
        agencyId,
        agencyName,
        agencySlug: agencySlugOut,
        organizationId: programOrgId,
        programSlug,
        events
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Program events when the first URL segment may be either the parent agency slug or a program org portal slug
 * (see frontend `/:organizationSlug/programs/:programSlug/events`).
 * GET /api/public/skill-builders/portal/:portalSlug/programs/:programSlug/events
 */
export const listPublicProgramEventsByPortalSlug = async (req, res, next) => {
  try {
    const portalSlug = String(req.params.portalSlug || '').trim().toLowerCase();
    const programSlug = String(req.params.programSlug || '').trim().toLowerCase();
    if (!portalSlug || !programSlug) {
      return res.status(400).json({ error: { message: 'Invalid portal or program slug' } });
    }

    const conn = await pool.getConnection();
    try {
      const result = await resolvePortalProgramPublicListing(conn, portalSlug, programSlug);
      if (!result.ok) {
        if (result.status === 400) {
          return res.status(400).json({ error: { message: result.message || 'Invalid request' } });
        }
        return res.status(404).json({ error: { message: result.message || 'Not found' } });
      }
      res.json(result.payload);
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/public/skill-builders/portal/:portalSlug/programs/:programSlug/events/nearest
 * Same event set as the portal GET (including merged multi-parent program listings), sorted by driving distance.
 */
export const rankPublicProgramPortalEventsByAddress = async (req, res, next) => {
  try {
    const portalSlug = String(req.params.portalSlug || '').trim().toLowerCase();
    const programSlug = String(req.params.programSlug || '').trim().toLowerCase();
    const address = String(req.body?.address || '').trim();
    if (!portalSlug || !programSlug) {
      return res.status(400).json({ error: { message: 'Invalid portal or program slug' } });
    }
    if (!address) return res.status(400).json({ error: { message: 'address is required' } });

    let origin;
    try {
      origin = await geocodeAddressWithGoogle({ addressText: address, countryCode: 'US' });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'MAPS_KEY_MISSING') {
        return res.status(503).json({ error: { message: 'Location search is not configured.' } });
      }
      return res.status(400).json({ error: { message: err?.message || 'Could not find that address.' } });
    }

    const conn = await pool.getConnection();
    try {
      const result = await resolvePortalProgramPublicListing(conn, portalSlug, programSlug);
      if (!result.ok) {
        if (result.status === 400) {
          return res.status(400).json({ error: { message: result.message || 'Invalid request' } });
        }
        return res.status(404).json({ error: { message: result.message || 'Not found' } });
      }
      const { events, agencyId } = result.payload;
      let scored;
      try {
        scored = await attachDistanceScoresToPublicEvents(events, origin, new Map());
      } catch (err) {
        if (respondNearestDistanceError(res, err)) return;
        throw err;
      }
      res.json({
        ok: true,
        agencyId,
        distanceMode: 'driving',
        origin: {
          latitude: origin.latitude,
          longitude: origin.longitude,
          formattedAddress: origin.formattedAddress || null
        },
        events: scored
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Public meta for the agency's affiliated "Skill Builders" program (by name), so legacy URLs can redirect to /programs/:realSlug/events.
 * GET /api/public/skill-builders/agency/:slug/skill-builders-program
 */
export const getPublicSkillBuildersProgramMeta = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: { message: 'Invalid slug' } });
    const [orgs] = await pool.execute(
      `SELECT id FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const conn = await pool.getConnection();
    try {
      const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, agencyId);
      if (!programOrgId) {
        return res.status(404).json({ error: { message: 'Skill Builders program not found for this agency' } });
      }
      const [rows] = await conn.execute(
        `SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`,
        [programOrgId]
      );
      const r = rows?.[0];
      if (!r) return res.status(404).json({ error: { message: 'Program organization not found' } });
      const portalSlug = String(r.slug || '').trim().toLowerCase();
      if (!portalSlug) {
        return res.status(422).json({
          error: { message: 'Program has no portal slug configured. Set a slug on the program organization.' }
        });
      }
      res.json({
        ok: true,
        agencyId,
        organizationId: Number(r.id),
        name: String(r.name || '').trim() || 'Program',
        portalSlug
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/skill-builders/agency/:slug/skill-builders/events */
export const listPublicSkillBuildersProgramEvents = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: { message: 'Invalid slug' } });
    const [orgs] = await pool.execute(
      `SELECT id, name, slug FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });
    const agencyName = String(orgs[0].name || '').trim() || null;
    const agencySlugOut = String(orgs[0].slug || '').trim().toLowerCase() || null;

    const conn = await pool.getConnection();
    try {
      const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, agencyId);
      if (!programOrgId) {
        return res.json({
          ok: true,
          agencyId,
          agencyName,
          agencySlug: agencySlugOut,
          organizationId: null,
          events: []
        });
      }
      const events = await loadPublicProgramEventRows(conn, agencyId, programOrgId);
      res.json({
        ok: true,
        agencyId,
        agencyName,
        agencySlug: agencySlugOut,
        organizationId: programOrgId,
        events
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};
