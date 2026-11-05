import pool from '../config/database.js';

const object = (raw) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) || {} : raw || {}; }
  catch { return {}; }
};

// Public branding only: never return the agency row or the icon library.
// Resolve the configured artwork in one query, before the user signs in.
export async function dashboardIconManifest(agency, platform = null) {
  if (!platform) {
    // Only the configured IDs are needed here. Avoid the full branding model's
    // font/schema checks and dozens of joins on this early public-theme path.
    const [rows] = await pool.execute('SELECT * FROM platform_branding ORDER BY id DESC LIMIT 1').catch(() => [[]]);
    platform = rows[0] || {};
  }
  const fields = {};
  const pathsById = {};
  const ids = new Set();
  for (const source of [platform, agency]) {
    for (const [key, value] of Object.entries(source || {})) {
      if (!/^my_dashboard_\w+_icon_id$/.test(key) || !Number(value)) continue;
      const id = Number(value);
      const pathKey = key.replace(/_id$/, '_path');
      fields[key] = id;
      delete fields[pathKey];
      if (source[pathKey]) pathsById[id] = source[pathKey];
    }
  }
  for (const id of Object.values(fields)) ids.add(id);
  const overrides = object(agency?.theme_settings).dashboardIconOverrides
    || object(platform?.dashboard_icon_overrides);
  for (const value of Object.values(overrides?.dashboard || {})) {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  const missing = [...ids].filter(id => !pathsById[id]);
  if (missing.length) {
    const [rows] = await pool.execute(
      `SELECT id, file_path FROM icons WHERE id IN (${missing.map(() => '?').join(',')})`, missing
    );
    for (const row of rows) if (row.file_path) pathsById[row.id] = row.file_path;
  }
  for (const [key, id] of Object.entries(fields)) {
    if (pathsById[id]) fields[key.replace(/_id$/, '_path')] = pathsById[id];
  }
  return { fields, pathsById: Object.fromEntries([...ids].filter(id => pathsById[id]).map(id => [id, pathsById[id]])) };
}
