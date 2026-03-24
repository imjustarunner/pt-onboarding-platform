import pool from '../config/database.js';
import {
  buildHubThemeResponse,
  computeHubScopedMetrics,
  getMarketingPageRowBySlug,
  isValidHubSlug,
  listSourcesForPage,
  loadBookingHintsForHub,
  loadHubPublicEvents,
  normalizeSlug,
  parseJsonObject,
  rankHubEventsByAddress
} from '../services/publicMarketingHub.service.js';

function mapPageOut(row, sources = null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: String(row.slug || '').toLowerCase(),
    title: row.title || '',
    isActive: !!(row.isActive === 1 || row.isActive === true),
    pageType: row.pageType || 'event_hub',
    heroTitle: row.heroTitle || null,
    heroSubtitle: row.heroSubtitle || null,
    heroImageUrl: row.heroImageUrl || null,
    brandingJson: parseJsonObject(row.brandingJson),
    seoJson: parseJsonObject(row.seoJson),
    metricsProfile: row.metricsProfile || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sources: Array.isArray(sources)
      ? sources.map((s) => ({
          id: Number(s.id),
          sourceType: s.sourceType,
          sourceId: Number(s.sourceId),
          sortOrder: Number(s.sortOrder) || 0,
          isActive: !!(s.isActive === 1 || s.isActive === true)
        }))
      : undefined
  };
}

async function assertAgencyExists(conn, agencyId) {
  const [rows] = await conn.execute(`SELECT id FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
  return !!rows?.[0];
}

async function replacePageSources(conn, pageId, sourcesRaw) {
  await conn.execute(`DELETE FROM public_marketing_page_sources WHERE page_id = ?`, [pageId]);
  const list = Array.isArray(sourcesRaw) ? sourcesRaw : [];
  let order = 0;
  for (const s of list) {
    const st = String(s.sourceType || s.source_type || 'agency').toLowerCase();
    if (st !== 'agency' && st !== 'organization') continue;
    const sid = Number(s.sourceId ?? s.source_id);
    if (!Number.isFinite(sid) || sid <= 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await assertAgencyExists(conn, sid);
    if (!ok) continue;
    const active = s.isActive === false || s.is_active === false ? 0 : 1;
    const sortOrder = Number(s.sortOrder ?? s.sort_order ?? order) || order;
    // eslint-disable-next-line no-await-in-loop
    await conn.execute(
      `INSERT INTO public_marketing_page_sources (page_id, source_type, source_id, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [pageId, st, sid, sortOrder, active]
    );
    order += 1;
  }
}

/** GET /api/public/marketing-pages/:slug */
export const getPublicMarketingPage = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const page = await getMarketingPageRowBySlug(slug);
    if (!page || !page.isActive) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    const sources = await listSourcesForPage(page.id);
    res.json({
      ok: true,
      page: {
        slug: String(page.slug || '').toLowerCase(),
        title: page.title || '',
        pageType: page.pageType || 'event_hub',
        heroTitle: page.heroTitle || null,
        heroSubtitle: page.heroSubtitle || null,
        heroImageUrl: page.heroImageUrl || null,
        metricsEnabled: !!(page.metricsProfile && String(page.metricsProfile).trim()),
        seo: parseJsonObject(page.seoJson),
        sources: sources
          .filter((s) => s.isActive)
          .map((s) => ({
            sourceType: s.sourceType,
            sourceId: Number(s.sourceId)
          }))
      }
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/marketing-pages/:slug/theme */
export const getPublicMarketingPageTheme = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const page = await getMarketingPageRowBySlug(slug);
    if (!page || !page.isActive) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    res.json(buildHubThemeResponse(page, req));
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/marketing-pages/:slug/events */
export const getPublicMarketingPageEvents = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const page = await getMarketingPageRowBySlug(slug);
    if (!page || !page.isActive) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    const sources = await listSourcesForPage(page.id);
    const conn = await pool.getConnection();
    try {
      const events = await loadHubPublicEvents(conn, sources);
      res.json({
        ok: true,
        hubSlug: String(page.slug || '').toLowerCase(),
        events
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

/** POST /api/public/marketing-pages/:slug/events/nearest */
export const postPublicMarketingPageEventsNearest = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const address = String(req.body?.address || '').trim();
    const result = await rankHubEventsByAddress({ slug, address, res });
    if (result?.handled) return;
    if (result?.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    res.json(result.json);
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/marketing-pages/:slug/metrics */
export const getPublicMarketingPageMetrics = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const page = await getMarketingPageRowBySlug(slug);
    if (!page || !page.isActive) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    const profile = String(page.metricsProfile || '').trim();
    if (!profile) {
      return res.status(404).json({ error: { message: 'Metrics are not enabled for this page' } });
    }
    const sources = await listSourcesForPage(page.id);
    const agencyIds = [];
    for (const s of sources) {
      if (String(s.sourceType).toLowerCase() === 'agency') {
        agencyIds.push(Number(s.sourceId));
      }
    }
    const computed = await computeHubScopedMetrics(agencyIds, profile);
    if (!computed.ok) {
      return res.status(404).json({ error: { message: 'Metrics unavailable' } });
    }
    res.json({ ok: true, hubSlug: slug, ...computed });
  } catch (e) {
    next(e);
  }
};

/** GET /api/public/marketing-pages/:slug/booking-hints */
export const getPublicMarketingPageBookingHints = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const page = await getMarketingPageRowBySlug(slug);
    if (!page || !page.isActive) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    const sources = await listSourcesForPage(page.id);
    const bookingHints = await loadBookingHintsForHub(sources);
    res.json({
      ok: true,
      hubSlug: slug,
      pageType: page.pageType || 'event_hub',
      bookingHints
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/platform/public-marketing-pages */
export const listMarketingPagesAdmin = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, slug, title, is_active AS isActive, page_type AS pageType,
              hero_title AS heroTitle, hero_subtitle AS heroSubtitle, hero_image_url AS heroImageUrl,
              branding_json AS brandingJson, seo_json AS seoJson, metrics_profile AS metricsProfile,
              created_at AS createdAt, updated_at AS updatedAt
       FROM public_marketing_pages
       ORDER BY updated_at DESC`
    );
    const pages = [];
    for (const row of rows || []) {
      // eslint-disable-next-line no-await-in-loop
      const [srcRows] = await pool.execute(
        `SELECT id, page_id AS pageId, source_type AS sourceType, source_id AS sourceId,
                sort_order AS sortOrder, is_active AS isActive
         FROM public_marketing_page_sources WHERE page_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [row.id]
      );
      pages.push(mapPageOut(row, srcRows || []));
    }
    res.json({ ok: true, pages });
  } catch (e) {
    next(e);
  }
};

/** POST /api/platform/public-marketing-pages */
export const createMarketingPageAdmin = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const body = req.body || {};
    let slug = normalizeSlug(body.slug || '');
    if (!isValidHubSlug(slug)) {
      return res.status(400).json({ error: { message: 'Invalid slug (use lowercase letters, numbers, hyphens)' } });
    }
    const title = String(body.title || '').trim().slice(0, 255) || slug;
    const pageType = String(body.pageType || body.page_type || 'event_hub').slice(0, 64);
    const isActive = body.isActive === false || body.is_active === false ? 0 : 1;
    const heroTitle = body.heroTitle != null ? String(body.heroTitle).slice(0, 512) : null;
    const heroSubtitle = body.heroSubtitle != null ? String(body.heroSubtitle) : null;
    const heroImageUrl = body.heroImageUrl != null ? String(body.heroImageUrl).slice(0, 1024) : null;
    const brandingJson = JSON.stringify(body.brandingJson || body.branding_json || {});
    const seoJson = JSON.stringify(body.seoJson || body.seo_json || {});
    const metricsProfile =
      body.metricsProfile != null || body.metrics_profile != null
        ? String(body.metricsProfile || body.metrics_profile).slice(0, 64)
        : null;

    await conn.beginTransaction();
    try {
      const [dup] = await conn.execute(`SELECT id FROM public_marketing_pages WHERE LOWER(slug) = ? LIMIT 1`, [slug]);
      if (dup?.length) {
        await conn.rollback();
        return res.status(409).json({ error: { message: 'Slug already in use' } });
      }
      const [ins] = await conn.execute(
        `INSERT INTO public_marketing_pages
         (slug, title, is_active, page_type, hero_title, hero_subtitle, hero_image_url, branding_json, seo_json, metrics_profile)
         VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
        [slug, title, isActive, pageType, heroTitle, heroSubtitle, heroImageUrl, brandingJson, seoJson, metricsProfile]
      );
      const pageId = Number(ins.insertId);
      await replacePageSources(conn, pageId, body.sources);
      await conn.commit();
      const [rows] = await conn.execute(
        `SELECT id, slug, title, is_active AS isActive, page_type AS pageType,
                hero_title AS heroTitle, hero_subtitle AS heroSubtitle, hero_image_url AS heroImageUrl,
                branding_json AS brandingJson, seo_json AS seoJson, metrics_profile AS metricsProfile,
                created_at AS createdAt, updated_at AS updatedAt
         FROM public_marketing_pages WHERE id = ? LIMIT 1`,
        [pageId]
      );
      const [srcRows] = await conn.execute(
        `SELECT id, page_id AS pageId, source_type AS sourceType, source_id AS sourceId,
                sort_order AS sortOrder, is_active AS isActive
         FROM public_marketing_page_sources WHERE page_id = ? ORDER BY sort_order ASC, id ASC`,
        [pageId]
      );
      res.status(201).json({ ok: true, page: mapPageOut(rows[0], srcRows || []) });
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } catch (e) {
    next(e);
  } finally {
    conn.release();
  }
};

/** PUT /api/platform/public-marketing-pages/:id */
export const updateMarketingPageAdmin = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    const body = req.body || {};
    const [existing] = await conn.execute(
      `SELECT id, slug, title FROM public_marketing_pages WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing?.[0]) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }

    const ex = existing[0];
    let slug = ex.slug;
    if (body.slug != null) {
      const ns = normalizeSlug(body.slug);
      if (!isValidHubSlug(ns)) {
        return res.status(400).json({ error: { message: 'Invalid slug' } });
      }
      const [dup] = await conn.execute(
        `SELECT id FROM public_marketing_pages WHERE LOWER(slug) = ? AND id != ? LIMIT 1`,
        [ns, id]
      );
      if (dup?.length) {
        return res.status(409).json({ error: { message: 'Slug already in use' } });
      }
      slug = ns;
    }

    const title = body.title != null ? String(body.title).trim().slice(0, 255) : String(ex.title || '').trim();
    const pageType =
      body.pageType != null || body.page_type != null
        ? String(body.pageType || body.page_type).slice(0, 64)
        : undefined;
    const isActive =
      body.isActive !== undefined || body.is_active !== undefined
        ? body.isActive === false || body.is_active === false
          ? 0
          : 1
        : undefined;

    await conn.beginTransaction();
    try {
      const sets = ['slug = ?', 'title = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [slug, title];
      if (pageType !== undefined) {
        sets.push('page_type = ?');
        params.push(pageType);
      }
      if (isActive !== undefined) {
        sets.push('is_active = ?');
        params.push(isActive);
      }
      if (body.heroTitle !== undefined) {
        sets.push('hero_title = ?');
        params.push(body.heroTitle != null ? String(body.heroTitle).slice(0, 512) : null);
      }
      if (body.heroSubtitle !== undefined) {
        sets.push('hero_subtitle = ?');
        params.push(body.heroSubtitle != null ? String(body.heroSubtitle) : null);
      }
      if (body.heroImageUrl !== undefined) {
        sets.push('hero_image_url = ?');
        params.push(body.heroImageUrl != null ? String(body.heroImageUrl).slice(0, 1024) : null);
      }
      if (body.brandingJson !== undefined || body.branding_json !== undefined) {
        sets.push('branding_json = CAST(? AS JSON)');
        params.push(JSON.stringify(body.brandingJson || body.branding_json || {}));
      }
      if (body.seoJson !== undefined || body.seo_json !== undefined) {
        sets.push('seo_json = CAST(? AS JSON)');
        params.push(JSON.stringify(body.seoJson || body.seo_json || {}));
      }
      if (body.metricsProfile !== undefined || body.metrics_profile !== undefined) {
        sets.push('metrics_profile = ?');
        params.push(
          body.metricsProfile != null || body.metrics_profile != null
            ? String(body.metricsProfile || body.metrics_profile).slice(0, 64)
            : null
        );
      }
      params.push(id);
      await conn.execute(`UPDATE public_marketing_pages SET ${sets.join(', ')} WHERE id = ?`, params);

      if (Array.isArray(body.sources)) {
        await replacePageSources(conn, id, body.sources);
      }

      await conn.commit();
      const [rows] = await conn.execute(
        `SELECT id, slug, title, is_active AS isActive, page_type AS pageType,
                hero_title AS heroTitle, hero_subtitle AS heroSubtitle, hero_image_url AS heroImageUrl,
                branding_json AS brandingJson, seo_json AS seoJson, metrics_profile AS metricsProfile,
                created_at AS createdAt, updated_at AS updatedAt
         FROM public_marketing_pages WHERE id = ? LIMIT 1`,
        [id]
      );
      const [srcRows] = await conn.execute(
        `SELECT id, page_id AS pageId, source_type AS sourceType, source_id AS sourceId,
                sort_order AS sortOrder, is_active AS isActive
         FROM public_marketing_page_sources WHERE page_id = ? ORDER BY sort_order ASC, id ASC`,
        [id]
      );
      res.json({ ok: true, page: mapPageOut(rows[0], srcRows || []) });
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } catch (e) {
    next(e);
  } finally {
    conn.release();
  }
};

/** DELETE /api/platform/public-marketing-pages/:id */
export const deleteMarketingPageAdmin = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    const [r] = await pool.execute(`DELETE FROM public_marketing_pages WHERE id = ?`, [id]);
    if (!r.affectedRows) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
