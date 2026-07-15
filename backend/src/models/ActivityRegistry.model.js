import pool from '../config/database.js';
import { parseJson } from './CounselingSession.model.js';

const VISIBLE_STATUSES = new Set(['live_current', 'current_pilot']);

export default class ActivityRegistry {
  static async listAll() {
    const [rows] = await pool.execute(
      `SELECT * FROM activity_registry ORDER BY sort_order ASC, display_name ASC`
    );
    return rows.map((r) => this.toPublic(r));
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM activity_registry WHERE id = ? LIMIT 1`,
      [String(id)]
    );
    return rows[0] ? this.toPublic(rows[0]) : null;
  }

  /**
   * Filter for a caller. Clients/providers see live_current + current_pilot by default.
   * Super admins may request includePlanned / includeDisabled.
   */
  static async listForCaller({
    platform = null,
    launchMode = null,
    includePlanned = false,
    includeDisabled = false,
    featureFlags = {},
    hasGamesAccess = false,
    isSuperAdmin = false
  } = {}) {
    const all = await this.listAll();
    return all.filter((activity) => {
      if (!isSuperAdmin) {
        if (!VISIBLE_STATUSES.has(activity.status)) {
          if (activity.status === 'planned' && includePlanned) {
            /* allow */
          } else if (activity.status === 'disabled' && includeDisabled) {
            /* allow */
          } else {
            return false;
          }
        }
      } else if (!includeDisabled && activity.status === 'disabled' && !activity.manifest?.adminOnly) {
        // Super admin sees planned; disabled admin harness only if includeDisabled
        if (activity.manifest?.adminOnly && !includeDisabled) return false;
      }

      if (activity.status === 'disabled' && !includeDisabled && !isSuperAdmin) return false;
      if (activity.status === 'planned' && !includePlanned && !isSuperAdmin) return false;
      if (activity.status === 'retired') return false;

      if (platform) {
        const platforms = activity.platforms || [];
        if (!platforms.includes(platform) && platform !== 'all') return false;
      }

      if (launchMode) {
        const mode = activity.launchMode || 'embedded';
        if (mode !== launchMode && mode !== 'both') return false;
      }

      if (activity.featureFlag === 'gamesPlatformEnabled') {
        if (!isSuperAdmin && featureFlags.gamesPlatformEnabled !== true) return false;
        if (activity.manifest?.requiresUserGamesAccess && !hasGamesAccess && !isSuperAdmin) {
          return false;
        }
      } else if (activity.featureFlag && featureFlags[activity.featureFlag] !== true && !isSuperAdmin) {
        // Unknown feature flags default to hidden unless explicitly enabled on org
        if (VISIBLE_STATUSES.has(activity.status) && !activity.featureFlag.startsWith('activity.')) {
          /* keep */
        } else if (activity.featureFlag.startsWith('activity.')) {
          return false;
        }
      }

      if (activity.manifest?.adminOnly && !isSuperAdmin) return false;

      return true;
    });
  }

  static toPublic(row) {
    const platforms = parseJson(row.platforms_json, []);
    const topics = parseJson(row.topics_json, []);
    const manifest = parseJson(row.manifest_json, {});
    return {
      id: row.id,
      displayName: row.display_name,
      version: row.version,
      type: row.activity_type,
      status: row.status,
      platforms,
      launchMode: row.launch_mode,
      featureFlag: row.feature_flag,
      estimatedDurationMinutes: {
        minimum: row.estimated_duration_min,
        maximum: row.estimated_duration_max
      },
      topics,
      entryUrl: row.entry_url || manifest.entryUrl || null,
      oneLineDescription: manifest.oneLineDescription || '',
      manifest,
      sortOrder: row.sort_order
    };
  }
}
