import pool from '../config/database.js';
import {
  resolveAffiliatedProgramOrganizationIdBySlug,
  resolveSkillBuildersProgramOrganizationId
} from '../services/skillBuildersSkillsGroup.service.js';

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function formatPublicEvent(row) {
  return {
    id: Number(row.id),
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone || 'UTC'
  };
}

/** GET /api/public/skill-builders/agency/:slug/events */
export const listPublicAgencyEvents = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: { message: 'Invalid slug' } });
    const [orgs] = await pool.execute(
      `SELECT id FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const [rows] = await pool.execute(
      `SELECT id, title, starts_at, ends_at, timezone
       FROM company_events
       WHERE agency_id = ?
         AND (is_active = TRUE OR is_active IS NULL)
         AND ends_at >= NOW()
       ORDER BY starts_at ASC
       LIMIT 100`,
      [agencyId]
    );
    res.json({ ok: true, agencyId, events: (rows || []).map(formatPublicEvent) });
  } catch (e) {
    next(e);
  }
};

async function loadPublicProgramEvents(conn, agencyId, programOrgId) {
  const [rows] = await conn.execute(
    `SELECT id, title, starts_at, ends_at, timezone
     FROM company_events
     WHERE agency_id = ?
       AND organization_id = ?
       AND (is_active = TRUE OR is_active IS NULL)
       AND ends_at >= NOW()
     ORDER BY starts_at ASC
     LIMIT 100`,
    [agencyId, programOrgId]
  );
  return (rows || []).map(formatPublicEvent);
}

/** GET /api/public/skill-builders/agency/:slug/programs/:programSlug/events */
export const listPublicProgramEventsByProgramSlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const programSlug = String(req.params.programSlug || '').trim().toLowerCase();
    if (!slug || !programSlug) {
      return res.status(400).json({ error: { message: 'Invalid agency or program slug' } });
    }
    const [orgs] = await pool.execute(
      `SELECT id FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const conn = await pool.getConnection();
    try {
      const programOrgId = await resolveAffiliatedProgramOrganizationIdBySlug(conn, agencyId, programSlug);
      if (!programOrgId) {
        return res.json({ ok: true, agencyId, organizationId: null, programSlug, events: [] });
      }
      const events = await loadPublicProgramEvents(conn, agencyId, programOrgId);
      res.json({
        ok: true,
        agencyId,
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
      `SELECT id FROM agencies WHERE LOWER(slug) = ? AND (is_archived = FALSE OR is_archived IS NULL) LIMIT 1`,
      [slug]
    );
    const agencyId = orgs?.[0]?.id ? Number(orgs[0].id) : null;
    if (!agencyId) return res.status(404).json({ error: { message: 'Agency not found' } });

    const conn = await pool.getConnection();
    try {
      const programOrgId = await resolveSkillBuildersProgramOrganizationId(conn, agencyId);
      if (!programOrgId) {
        return res.json({ ok: true, agencyId, organizationId: null, events: [] });
      }
      const events = await loadPublicProgramEvents(conn, agencyId, programOrgId);
      res.json({
        ok: true,
        agencyId,
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
