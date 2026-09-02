import pool from '../config/database.js';

class NoteAidAgencyCatalog {
  static async listSettings(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_agency_aid_settings WHERE agency_id = ? ORDER BY sort_order ASC, catalog_aid_id ASC`,
      [aid]
    );
    return rows || [];
  }

  static async upsertSetting(agencyId, catalogAidId, patch = {}) {
    const aid = Number(agencyId || 0);
    const key = String(catalogAidId || '').trim();
    if (!aid || !key) throw new Error('agencyId and catalogAidId required');
    const enabled = patch.enabled === false || patch.enabled === 0 || patch.enabled === '0' ? 0 : 1;
    const title = patch.titleOverride != null ? String(patch.titleOverride).slice(0, 255) : null;
    const attachSession = patch.attachableToSession == null ? null : (patch.attachableToSession ? 1 : 0);
    const attachClaim = patch.attachableToClaim == null ? null : (patch.attachableToClaim ? 1 : 0);
    const sortOrder = Number.isFinite(Number(patch.sortOrder)) ? Number(patch.sortOrder) : 0;
    await pool.execute(
      `INSERT INTO note_aid_agency_aid_settings
       (agency_id, catalog_aid_id, enabled, title_override, attachable_to_session, attachable_to_claim, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         title_override = VALUES(title_override),
         attachable_to_session = VALUES(attachable_to_session),
         attachable_to_claim = VALUES(attachable_to_claim),
         sort_order = VALUES(sort_order),
         updated_at = CURRENT_TIMESTAMP`,
      [aid, key, enabled, title, attachSession, attachClaim, sortOrder]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_agency_aid_settings WHERE agency_id = ? AND catalog_aid_id = ? LIMIT 1`,
      [aid, key]
    );
    return rows?.[0] || null;
  }

  static async listCustomAids(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_custom_aids WHERE agency_id = ? ORDER BY title ASC`,
      [aid]
    );
    return (rows || []).map((row) => ({
      ...row,
      kbFolders: this.parseKbFolders(row.kb_folders)
    }));
  }

  static parseKbFolders(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((f) => String(f || '').trim()).filter(Boolean);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((f) => String(f || '').trim()).filter(Boolean);
      } catch {
        return String(raw)
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
      }
    }
    return [];
  }

  static serializeKbFolders(list) {
    const folders = Array.isArray(list)
      ? list.map((f) => String(f || '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_')).filter(Boolean)
      : [];
    return JSON.stringify([...new Set(folders)].slice(0, 20));
  }

  static async findCustomAid(id, agencyId) {
    const cid = Number(id || 0);
    const aid = Number(agencyId || 0);
    if (!cid || !aid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM note_aid_custom_aids WHERE id = ? AND agency_id = ? LIMIT 1`,
      [cid, aid]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return { ...row, kbFolders: this.parseKbFolders(row.kb_folders) };
  }

  static async createCustomAid(agencyId, data = {}, actorUserId = null) {
    const aid = Number(agencyId || 0);
    if (!aid) throw new Error('agencyId required');
    const title = String(data.title || '').trim();
    if (!title) throw new Error('title required');
    const kbFoldersJson = this.serializeKbFolders(data.kbFolders || data.kb_folders || []);
    const [result] = await pool.execute(
      `INSERT INTO note_aid_custom_aids
       (agency_id, title, guidance, system_prompt, training_notes, kb_folders, base_tool_id, service_code,
        attachable_to_session, attachable_to_claim, enabled, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?)`,
      [
        aid,
        title.slice(0, 255),
        data.guidance ? String(data.guidance) : null,
        data.systemPrompt ? String(data.systemPrompt) : null,
        data.trainingNotes ? String(data.trainingNotes) : null,
        kbFoldersJson,
        data.baseToolId ? String(data.baseToolId).slice(0, 96) : null,
        data.serviceCode ? String(data.serviceCode).toUpperCase().slice(0, 16) : null,
        data.attachableToSession ? 1 : 0,
        data.attachableToClaim ? 1 : 0,
        data.enabled === false ? 0 : 1,
        actorUserId || null
      ]
    );
    return this.findCustomAid(result.insertId, aid);
  }

  static async updateCustomAid(id, agencyId, data = {}) {
    const cid = Number(id || 0);
    const aid = Number(agencyId || 0);
    if (!cid || !aid) throw new Error('id and agencyId required');
    const fields = [];
    const vals = [];
    const map = {
      title: 'title',
      guidance: 'guidance',
      systemPrompt: 'system_prompt',
      trainingNotes: 'training_notes',
      baseToolId: 'base_tool_id',
      serviceCode: 'service_code',
      attachableToSession: 'attachable_to_session',
      attachableToClaim: 'attachable_to_claim',
      enabled: 'enabled'
    };
    for (const [js, col] of Object.entries(map)) {
      if (!(js in data)) continue;
      fields.push(`${col} = ?`);
      if (js === 'attachableToSession' || js === 'attachableToClaim' || js === 'enabled') {
        vals.push(data[js] ? 1 : 0);
      } else if (js === 'serviceCode') {
        vals.push(data[js] ? String(data[js]).toUpperCase().slice(0, 16) : null);
      } else {
        vals.push(data[js] != null ? String(data[js]) : null);
      }
    }
    if ('kbFolders' in data || 'kb_folders' in data) {
      fields.push('kb_folders = CAST(? AS JSON)');
      vals.push(this.serializeKbFolders(data.kbFolders || data.kb_folders || []));
    }
    if (!fields.length) return this.findCustomAid(cid, aid);
    vals.push(cid, aid);
    await pool.execute(
      `UPDATE note_aid_custom_aids SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      vals
    );
    return this.findCustomAid(cid, aid);
  }

  static async userCanAccessCustomAid(agencyId, userId, customAidId) {
    const scoped = await this.listPeopleScopedKeys(agencyId);
    if (!scoped.custom.has(Number(customAidId))) return true;
    const [rows] = await pool.execute(
      `SELECT 1 FROM note_aid_aid_user_assignments
       WHERE agency_id = ? AND custom_aid_id = ? AND user_id = ? AND is_enabled = 1
       LIMIT 1`,
      [Number(agencyId), Number(customAidId), Number(userId)]
    );
    return !!(rows && rows.length);
  }

  static async listAssignments(agencyId, { catalogAidId = null, customAidId = null } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    let sql = `SELECT a.*, u.first_name, u.last_name, u.email
               FROM note_aid_aid_user_assignments a
               LEFT JOIN users u ON u.id = a.user_id
               WHERE a.agency_id = ?`;
    const vals = [aid];
    if (catalogAidId) {
      sql += ' AND a.catalog_aid_id = ?';
      vals.push(String(catalogAidId));
    }
    if (customAidId) {
      sql += ' AND a.custom_aid_id = ?';
      vals.push(Number(customAidId));
    }
    sql += ' ORDER BY u.last_name ASC, u.first_name ASC';
    const [rows] = await pool.execute(sql, vals);
    return rows || [];
  }

  static async setUserAssignment({
    agencyId,
    userId,
    catalogAidId = null,
    customAidId = null,
    isEnabled = true
  }) {
    const aid = Number(agencyId || 0);
    const uid = Number(userId || 0);
    if (!aid || !uid) throw new Error('agencyId and userId required');
    if (!catalogAidId && !customAidId) throw new Error('catalogAidId or customAidId required');
    await pool.execute(
      `INSERT INTO note_aid_aid_user_assignments
       (agency_id, catalog_aid_id, custom_aid_id, user_id, is_enabled)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_at = CURRENT_TIMESTAMP`,
      [
        aid,
        catalogAidId ? String(catalogAidId) : null,
        customAidId ? Number(customAidId) : null,
        uid,
        isEnabled ? 1 : 0
      ]
    );
    return true;
  }

  static async listPeopleScopedKeys(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return { catalog: new Set(), custom: new Set() };
    const [rows] = await pool.execute(
      `SELECT catalog_aid_id, custom_aid_id
       FROM note_aid_aid_user_assignments
       WHERE agency_id = ? AND is_enabled = 1`,
      [aid]
    );
    const catalog = new Set();
    const custom = new Set();
    for (const r of rows || []) {
      if (r.catalog_aid_id) catalog.add(String(r.catalog_aid_id));
      if (r.custom_aid_id) custom.add(Number(r.custom_aid_id));
    }
    return { catalog, custom };
  }

  static async listEnabledCatalogIdsForUser(agencyId, userId) {
    const aid = Number(agencyId || 0);
    const uid = Number(userId || 0);
    if (!aid) {
      return {
        settings: [],
        assignments: [],
        customAids: [],
        peopleScopedCatalogIds: [],
        peopleScopedCustomIds: []
      };
    }
    const settings = await this.listSettings(aid);
    const customAids = await this.listCustomAids(aid);
    const scoped = await this.listPeopleScopedKeys(aid);
    let assignments = [];
    if (uid) {
      const [rows] = await pool.execute(
        `SELECT * FROM note_aid_aid_user_assignments
         WHERE agency_id = ? AND user_id = ? AND is_enabled = 1`,
        [aid, uid]
      );
      assignments = rows || [];
    }
    return {
      settings,
      assignments,
      customAids,
      peopleScopedCatalogIds: [...scoped.catalog],
      peopleScopedCustomIds: [...scoped.custom]
    };
  }

  static async adminBundle(agencyId) {
    const aid = Number(agencyId || 0);
    if (!aid) return { settings: [], customAids: [], assignments: [] };
    const settings = await this.listSettings(aid);
    const customAids = await this.listCustomAids(aid);
    const assignments = await this.listAssignments(aid);
    return { settings, customAids, assignments };
  }
}

export default NoteAidAgencyCatalog;
