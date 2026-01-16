import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

const getDbName = () => process.env.DB_NAME || 'onboarding_stage';

const getTableColumns = async (conn, table) => {
  const dbName = getDbName();
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME as name, EXTRA as extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION ASC`,
    [dbName, table]
  );
  return rows.map((r) => ({ name: r.name, extra: r.extra || '' }));
};

const insertRow = async (conn, table, row, { overrides = {}, exclude = [] } = {}) => {
  const colsMeta = await getTableColumns(conn, table);
  const excluded = new Set(['id', 'created_at', 'updated_at', ...exclude]);
  const cols = colsMeta
    .filter((c) => !excluded.has(c.name) && !String(c.extra).toLowerCase().includes('auto_increment'))
    .map((c) => c.name);

  const final = { ...row, ...overrides };
  const values = cols.map((c) => (final[c] === undefined ? null : final[c]));

  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  const [result] = await conn.execute(sql, values);
  return result.insertId;
};

export default class OrganizationDuplicationService {
  static async duplicateOrganization({
    sourceOrganizationId,
    newName,
    newSlug,
    newPortalUrl = null,
    requestingUser
  }) {
    const sourceId = parseInt(sourceOrganizationId, 10);
    if (!sourceId) throw new Error('Invalid source organization id');

    if (!newName || !String(newName).trim()) throw new Error('New name is required');
    if (!newSlug || !String(newSlug).trim()) throw new Error('New slug is required');

    const normalizedSlug = String(newSlug).trim().toLowerCase();
    const portalUrl = (newPortalUrl && String(newPortalUrl).trim()) ? String(newPortalUrl).trim().toLowerCase() : normalizedSlug;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const sourceOrg = await Agency.findById(sourceId);
      if (!sourceOrg) {
        const err = new Error('Source organization not found');
        err.status = 404;
        throw err;
      }

      const sourceType = String(sourceOrg.organization_type || 'agency').toLowerCase();
      if (!['school', 'program', 'learning'].includes(sourceType)) {
        const err = new Error('Only school/program/learning organizations can be duplicated');
        err.status = 400;
        throw err;
      }

      // Permission: non-super-admins can only duplicate orgs they have access to
      if (requestingUser?.role !== 'super_admin') {
        const userAgencies = await User.getAgencies(requestingUser.id);
        const canAccessSource = userAgencies.some((a) => a?.id === sourceId);
        if (!canAccessSource) {
          const err = new Error('Access denied');
          err.status = 403;
          throw err;
        }
      }

      // Keep existing affiliation (deep copy uses same parent agency by default).
      const linkedAgencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(sourceId)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(sourceId));
      if (!linkedAgencyId) {
        const err = new Error('Source organization has no affiliated agency');
        err.status = 400;
        throw err;
      }

      // Duplicate the agencies row (copy all fields, override name/slug/portal_url).
      // Note: we intentionally do NOT copy created_at/updated_at.
      const newOrgId = await insertRow(conn, 'agencies', sourceOrg, {
        overrides: {
          name: String(newName).trim(),
          slug: normalizedSlug,
          portal_url: portalUrl,
          organization_type: sourceType,
          is_active: true
        },
        exclude: ['id', 'created_at', 'updated_at']
      });

      // Create affiliation
      await OrganizationAffiliation.deactivateAllForOrganization(newOrgId);
      await OrganizationAffiliation.upsert({ agencyId: linkedAgencyId, organizationId: newOrgId, isActive: true });

      // ID maps
      const trackIdMap = new Map();
      const moduleIdMap = new Map();
      const docTemplateIdMap = new Map();
      const checklistIdMap = new Map();
      const packageIdMap = new Map();

      // Copy training_tracks scoped to source org
      const [tracks] = await conn.execute('SELECT * FROM training_tracks WHERE agency_id = ?', [sourceId]);
      for (const t of tracks) {
        const newTrackId = await insertRow(conn, 'training_tracks', t, {
          overrides: {
            agency_id: newOrgId,
            source_track_id: null,
            is_archived: false,
            archived_at: null,
            archived_by_user_id: null,
            archived_by_agency_id: null
          }
        });
        trackIdMap.set(t.id, newTrackId);
      }

      // Copy modules scoped to source org
      const [modules] = await conn.execute('SELECT * FROM modules WHERE agency_id = ?', [sourceId]);
      for (const m of modules) {
        const mappedTrackId = m.track_id ? (trackIdMap.get(m.track_id) || null) : null;
        const newModuleId = await insertRow(conn, 'modules', m, {
          overrides: {
            agency_id: newOrgId,
            track_id: mappedTrackId,
            source_module_id: null,
            is_archived: false,
            archived_at: null,
            archived_by_user_id: null,
            archived_by_agency_id: null
          }
        });
        moduleIdMap.set(m.id, newModuleId);
      }

      // Copy track_modules for duplicated tracks/modules
      if (trackIdMap.size > 0) {
        const oldTrackIds = Array.from(trackIdMap.keys());
        const placeholders = oldTrackIds.map(() => '?').join(', ');
        const [trackModules] = await conn.execute(
          `SELECT * FROM track_modules WHERE track_id IN (${placeholders})`,
          oldTrackIds
        );
        for (const tm of trackModules) {
          const newTrackId = trackIdMap.get(tm.track_id);
          const newModuleId = moduleIdMap.get(tm.module_id);
          if (!newTrackId || !newModuleId) continue;
          await conn.execute(
            `INSERT INTO track_modules (track_id, module_id, order_index)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
            [newTrackId, newModuleId, tm.order_index || 0]
          );
        }
      }

      // Copy module_content
      if (moduleIdMap.size > 0) {
        const oldModuleIds = Array.from(moduleIdMap.keys());
        const placeholders = oldModuleIds.map(() => '?').join(', ');
        const [contents] = await conn.execute(
          `SELECT * FROM module_content WHERE module_id IN (${placeholders})`,
          oldModuleIds
        );
        for (const c of contents) {
          const newModuleId = moduleIdMap.get(c.module_id);
          if (!newModuleId) continue;
          await insertRow(conn, 'module_content', c, { overrides: { module_id: newModuleId } });
        }
      }

      // Copy document_templates (all versions scoped to org)
      const [docs] = await conn.execute('SELECT * FROM document_templates WHERE agency_id = ?', [sourceId]);
      for (const d of docs) {
        const newDocId = await insertRow(conn, 'document_templates', d, {
          overrides: {
            agency_id: newOrgId,
            is_archived: false,
            archived_at: null,
            archived_by_user_id: null,
            archived_by_agency_id: null
          }
        });
        docTemplateIdMap.set(d.id, newDocId);
      }

      // Copy custom_checklist_items (agency-scoped only; platform templates remain shared)
      const [checklistItems] = await conn.execute(
        'SELECT * FROM custom_checklist_items WHERE agency_id = ? AND (is_platform_template = FALSE OR is_platform_template = 0)',
        [sourceId]
      );
      // First pass insert with parent_item_id NULL so we can build map
      for (const item of checklistItems) {
        const newId = await insertRow(conn, 'custom_checklist_items', item, {
          overrides: {
            agency_id: newOrgId,
            parent_item_id: null,
            training_focus_id: item.training_focus_id ? (trackIdMap.get(item.training_focus_id) || null) : null,
            module_id: item.module_id ? (moduleIdMap.get(item.module_id) || null) : null,
            is_platform_template: false
          }
        });
        checklistIdMap.set(item.id, newId);
      }
      // Second pass update parent references
      for (const item of checklistItems) {
        if (!item.parent_item_id) continue;
        const newId = checklistIdMap.get(item.id);
        const newParentId = checklistIdMap.get(item.parent_item_id);
        if (newId && newParentId) {
          await conn.execute(
            'UPDATE custom_checklist_items SET parent_item_id = ? WHERE id = ?',
            [newParentId, newId]
          );
        }
      }

      // Copy agency_checklist_enabled_items
      if (checklistIdMap.size > 0) {
        const [enabled] = await conn.execute(
          'SELECT * FROM agency_checklist_enabled_items WHERE agency_id = ?',
          [sourceId]
        );
        for (const row of enabled) {
          const mappedChecklistId = checklistIdMap.get(row.checklist_item_id);
          if (!mappedChecklistId) continue;
          await conn.execute(
            `INSERT INTO agency_checklist_enabled_items (agency_id, checklist_item_id, enabled)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
            [newOrgId, mappedChecklistId, row.enabled ? 1 : 0]
          );
        }
      }

      // Copy onboarding_packages and their junctions
      const [packages] = await conn.execute('SELECT * FROM onboarding_packages WHERE agency_id = ?', [sourceId]);
      for (const p of packages) {
        const newPkgId = await insertRow(conn, 'onboarding_packages', p, { overrides: { agency_id: newOrgId } });
        packageIdMap.set(p.id, newPkgId);
      }
      if (packageIdMap.size > 0) {
        const oldPkgIds = Array.from(packageIdMap.keys());
        const placeholders = oldPkgIds.map(() => '?').join(', ');

        // training focuses
        const [pkgTracks] = await conn.execute(
          `SELECT * FROM onboarding_package_training_focuses WHERE package_id IN (${placeholders})`,
          oldPkgIds
        );
        for (const r of pkgTracks) {
          const newPkgId = packageIdMap.get(r.package_id);
          const newTrackId = trackIdMap.get(r.track_id);
          if (!newPkgId || !newTrackId) continue;
          await conn.execute(
            `INSERT INTO onboarding_package_training_focuses (package_id, track_id, order_index)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
            [newPkgId, newTrackId, r.order_index || 0]
          );
        }

        // modules
        const [pkgModules] = await conn.execute(
          `SELECT * FROM onboarding_package_modules WHERE package_id IN (${placeholders})`,
          oldPkgIds
        );
        for (const r of pkgModules) {
          const newPkgId = packageIdMap.get(r.package_id);
          const newModuleId = moduleIdMap.get(r.module_id);
          if (!newPkgId || !newModuleId) continue;
          await conn.execute(
            `INSERT INTO onboarding_package_modules (package_id, module_id, order_index)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
            [newPkgId, newModuleId, r.order_index || 0]
          );
        }

        // documents
        const [pkgDocs] = await conn.execute(
          `SELECT * FROM onboarding_package_documents WHERE package_id IN (${placeholders})`,
          oldPkgIds
        );
        for (const r of pkgDocs) {
          const newPkgId = packageIdMap.get(r.package_id);
          const newDocId = docTemplateIdMap.get(r.document_template_id);
          if (!newPkgId || !newDocId) continue;
          await conn.execute(
            `INSERT INTO onboarding_package_documents (package_id, document_template_id, order_index, action_type, due_date_days)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE order_index = VALUES(order_index), action_type = VALUES(action_type), due_date_days = VALUES(due_date_days)`,
            [newPkgId, newDocId, r.order_index || 0, r.action_type || 'signature', r.due_date_days ?? null]
          );
        }

        // checklist items
        const [pkgChecklist] = await conn.execute(
          `SELECT * FROM onboarding_package_checklist_items WHERE package_id IN (${placeholders})`,
          oldPkgIds
        );
        for (const r of pkgChecklist) {
          const newPkgId = packageIdMap.get(r.package_id);
          const newChecklistId = checklistIdMap.get(r.checklist_item_id);
          if (!newPkgId || !newChecklistId) continue;
          await conn.execute(
            `INSERT INTO onboarding_package_checklist_items (package_id, checklist_item_id, order_index)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
            [newPkgId, newChecklistId, r.order_index || 0]
          );
        }
      }

      await conn.commit();

      const created = await Agency.findById(newOrgId);
      return { organization: created, affiliatedAgencyId: linkedAgencyId };
    } catch (e) {
      try { await conn.rollback(); } catch (_) {}
      throw e;
    } finally {
      conn.release();
    }
  }
}

