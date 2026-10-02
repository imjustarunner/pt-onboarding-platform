import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Icon from '../models/Icon.model.js';
import PlatformBranding from '../models/PlatformBranding.model.js';

const validAssignment = ({ surface, key, iconId }) =>
  ['dashboard', 'admin'].includes(surface) &&
  typeof key === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(key) &&
  (iconId === null || (Number.isSafeInteger(iconId) && iconId > 0));

// Separate from the general organization form: changing one icon must not reset
// other branding fields, certificates, or settings. JSON_MERGE_PATCH is atomic.
export async function updateDashboardIcon(req, res, next) {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin access required.' } });
    }
    const agencyId = Number(req.params.id);
    const { surface, key, iconId } = req.body;
    if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !validAssignment(req.body)) {
      return res.status(400).json({ error: { message: 'Invalid dashboard icon assignment.' } });
    }
    if (!(await Agency.findById(agencyId))) {
      return res.status(404).json({ error: { message: 'Organization not found.' } });
    }
    if (iconId !== null && !(await Icon.findById(iconId))) {
      return res.status(404).json({ error: { message: 'Icon not found.' } });
    }
    await pool.execute(
      `UPDATE agencies SET theme_settings = JSON_MERGE_PATCH(
         COALESCE(theme_settings, JSON_OBJECT()), CAST(? AS JSON)
       ) WHERE id = ?`,
      [JSON.stringify({ dashboardIconOverrides: { [surface]: { [key]: iconId } } }), agencyId]
    );
    res.json(await Agency.findById(agencyId));
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformDashboardIcon(req, res, next) {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin access required.' } });
    }
    if (!validAssignment(req.body)) {
      return res.status(400).json({ error: { message: 'Invalid dashboard icon assignment.' } });
    }
    const { surface, key, iconId } = req.body;
    if (iconId !== null && !(await Icon.findById(iconId))) {
      return res.status(404).json({ error: { message: 'Icon not found.' } });
    }
    const current = await PlatformBranding.get();
    if (!current?.id) {
      return res.status(409).json({ error: { message: 'Save platform branding before assigning dashboard icons.' } });
    }
    await pool.execute(
      `UPDATE platform_branding SET dashboard_icon_overrides = JSON_MERGE_PATCH(
         COALESCE(dashboard_icon_overrides, JSON_OBJECT()), CAST(? AS JSON)
       ), updated_by_user_id = ? WHERE id = ?`,
      [JSON.stringify({ [surface]: { [key]: iconId } }), req.user.id, current.id]
    );
    res.json(await PlatformBranding.get());
  } catch (error) {
    next(error);
  }
}
