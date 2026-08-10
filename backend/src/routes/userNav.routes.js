import express from 'express';
import pool from '../config/database.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { normalizeAdminPageKey, extractAdminPageFromPath } from '../utils/normalizeAdminPageKey.js';

const router = express.Router();

/** Merge raw shortcut rows by canonical page key (handles legacy casing duplicates). */
function mergeShortcutRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const page = normalizeAdminPageKey(row.page) || extractAdminPageFromPath(row.path);
    const count = Number(row.visit_count || 0);
    const existing = merged.get(page);
    if (!existing) {
      merged.set(page, {
        page,
        path: row.path,
        visit_count: count,
        peakPathVisits: count,
      });
      continue;
    }
    existing.visit_count += count;
    if (count > existing.peakPathVisits) {
      existing.path = row.path;
      existing.peakPathVisits = count;
    }
  }
  return [...merged.values()]
    .map(({ peakPathVisits, ...rest }) => rest)
    .sort((a, b) => b.visit_count - a.visit_count);
}

/** Merge usage-analytics rows by user + canonical page. */
function mergePageVisitRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const page = normalizeAdminPageKey(row.page);
    const key = `${row.user_id}::${page}`;
    const count = Number(row.visit_count || 0);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row, page, visit_count: count });
    } else {
      existing.visit_count += count;
    }
  }
  return [...merged.values()];
}

router.use(authenticate);

/**
 * GET /api/user-nav/path-visits
 * Returns the current user's most-visited paths (last 90 days), including query strings.
 * Used to rank individual hub cards (not just broad page keys).
 */
router.get('/path-visits', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const safeLimit = Math.min(Math.max(1, Number(req.query.limit) || 100), 200);
    const [rows] = await pool.execute(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.path')) AS path,
         COUNT(*)                                          AS visit_count
       FROM user_activity_log
       WHERE user_id = ?
         AND action_type = 'admin_page_view'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.path')) IS NOT NULL
       GROUP BY path
       ORDER BY visit_count DESC
       LIMIT ${safeLimit}`,
      [userId]
    );

    res.json({ visits: rows });
  } catch (err) {
    console.error('[userNav] path-visits error:', err);
    res.status(500).json({ error: 'Failed to load path visits' });
  }
});

/**
 * GET /api/user-nav/shortcuts
 * Returns the current user's most-visited admin pages (last 90 days).
 * Used to render the "Frequent Pages" shortcut bar on dashboards.
 */
router.get('/shortcuts', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const limit = Math.min(Number(req.query.limit) || 8, 12);

    const safeLimit = Math.min(Math.max(1, Number(limit) || 8), 12);
    // Fetch extra rows — we merge duplicates after canonicalizing page keys.
    const fetchLimit = Math.min(safeLimit * 4, 48);
    const [rows] = await pool.execute(
      `SELECT
         JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.page'))  AS page,
         JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.path'))  AS path,
         COUNT(*)                                          AS visit_count
       FROM user_activity_log
       WHERE user_id = ?
         AND action_type = 'admin_page_view'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.path')) IS NOT NULL
       GROUP BY page, path
       ORDER BY visit_count DESC
       LIMIT ${fetchLimit}`,
      [userId]
    );

    const shortcuts = mergeShortcutRows(rows).slice(0, safeLimit);
    res.json({ shortcuts });
  } catch (err) {
    console.error('[userNav] shortcuts error:', err);
    res.status(500).json({ error: 'Failed to load shortcuts' });
  }
});

/**
 * GET /api/user-nav/action-frequencies
 * Returns per-action click counts for the current user (last N days).
 * Used to drive the quick-actions heatmap on admin/operations dashboards.
 */
router.get('/action-frequencies', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const trackingPage = String(req.query.trackingPage || 'admin-dashboard').slice(0, 100);
    const safeDays = Math.min(Math.max(1, Number(req.query.days) || 30), 180);

    const [rows] = await pool.execute(
      `SELECT tab AS action_id, COUNT(*) AS click_count
       FROM user_tab_events
       WHERE user_id = ?
         AND action_type = 'admin_action'
         AND page = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
       GROUP BY tab`,
      [userId, trackingPage]
    );

    const frequencies = {};
    for (const row of rows) {
      if (row.action_id) frequencies[row.action_id] = Number(row.click_count || 0);
    }

    res.json({ frequencies, days: safeDays });
  } catch (err) {
    console.error('[userNav] action-frequencies error:', err);
    res.status(500).json({ error: 'Failed to load frequencies' });
  }
});

/**
 * POST /api/user-nav/tab-event
 * Logs a tab switch or inline action event (deeper tracking).
 */
router.post('/tab-event', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthenticated' });

    const { actionType = 'admin_tab_view', page, tab, extra } = req.body || {};
    const agencyId = req.body.agencyId || null;

    await pool.execute(
      `INSERT INTO user_tab_events (user_id, agency_id, action_type, page, tab, extra)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        agencyId ? Number(agencyId) : null,
        String(actionType).slice(0, 50),
        page ? String(page).slice(0, 255) : null,
        tab ? String(tab).slice(0, 255) : null,
        extra ? JSON.stringify(extra) : null
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[userNav] tab-event error:', err);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

/**
 * GET /api/user-nav/usage-analytics
 * super_admin only — returns page visit heatmap data per user.
 */
router.get('/usage-analytics', requireSuperAdmin, async (req, res) => {
  try {
    const safeDays = Math.min(Math.max(1, Number(req.query.days) || 30), 180);
    const agencyId = req.query.agencyId ? Number(req.query.agencyId) : null;

    // Page visit counts per user per page (last N days)
    let query = `
      SELECT
        ual.user_id,
        CONCAT(u.first_name, ' ', u.last_name) AS user_name,
        u.email                                  AS email,
        u.role                                   AS role,
        JSON_UNQUOTE(JSON_EXTRACT(ual.metadata, '$.page')) AS page,
        COUNT(*)                                 AS visit_count
      FROM user_activity_log ual
      JOIN users u ON ual.user_id = u.id
      WHERE ual.action_type = 'admin_page_view'
        AND ual.created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
        AND JSON_UNQUOTE(JSON_EXTRACT(ual.metadata, '$.page')) IS NOT NULL
    `;
    const params = [];

    if (agencyId) {
      query += ' AND ual.agency_id = ?';
      params.push(agencyId);
    }

    query += `
      GROUP BY ual.user_id, page
      ORDER BY user_name, visit_count DESC
    `;

    const [rows] = await pool.execute(query, params);
    const pageVisits = mergePageVisitRows(rows);

    // Tab event counts per user per page
    let tabQuery = `
      SELECT
        ute.user_id,
        ute.page,
        ute.tab,
        COUNT(*) AS tab_count
      FROM user_tab_events ute
      WHERE ute.action_type = 'admin_tab_view'
        AND ute.created_at >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY)
        AND ute.page IS NOT NULL
    `;
    const tabParams = [];
    if (agencyId) {
      tabQuery += ' AND ute.agency_id = ?';
      tabParams.push(agencyId);
    }
    tabQuery += ' GROUP BY ute.user_id, ute.page, ute.tab ORDER BY tab_count DESC';

    const [tabRows] = await pool.execute(tabQuery, tabParams);

    res.json({ pageVisits, tabEvents: tabRows, days: safeDays });
  } catch (err) {
    console.error('[userNav] usage-analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

export default router;
