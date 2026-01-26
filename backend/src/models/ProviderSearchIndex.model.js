import pool from '../config/database.js';

function normalizeMultiSelect(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    // fall through
  }
  // fallback: comma-separated
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function isBachelorsCredentialText(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower.includes('bachelor')) return true;
  // Look for BA/BS tokens as standalone words
  if (/\bba\b/i.test(s)) return true;
  if (/\bbs\b/i.test(s)) return true;
  if (/\bb\.a\.\b/i.test(lower)) return true;
  if (/\bb\.s\.\b/i.test(lower)) return true;
  return false;
}

class ProviderSearchIndex {
  static async upsertForUserInAgency({ userId, agencyId, fieldKeys = null }) {
    const uid = Number(userId);
    const aid = Number(agencyId);
    if (!uid || !aid) return { ok: false };

    const keys = Array.isArray(fieldKeys) ? fieldKeys.map((k) => String(k || '').trim()).filter(Boolean) : [];

    // Remove existing rows for this user+agency, then reinsert from user_info_values.
    // Optimization: if fieldKeys are provided, only update those field_keys to keep imports fast.
    if (keys.length) {
      const placeholders = keys.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM provider_search_index
         WHERE user_id = ? AND agency_id = ? AND field_key IN (${placeholders})`,
        [uid, aid, ...keys]
      );
    } else {
      await pool.execute('DELETE FROM provider_search_index WHERE user_id = ? AND agency_id = ?', [uid, aid]);
    }

    // Index canonical profile fields from user_info_values (backed by user_info_field_definitions.field_key).
    const whereKeysSql = keys.length ? ` AND uifd.field_key IN (${keys.map(() => '?').join(',')})` : '';
    const [rows] = await pool.execute(
      `SELECT
         uifd.field_key,
         uifd.field_type,
         uiv.value
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
       WHERE uiv.user_id = ?${whereKeysSql}`,
      keys.length ? [uid, ...keys] : [uid]
    );

    for (const r of rows || []) {
      const fieldKey = String(r.field_key || '').trim();
      const fieldType = String(r.field_type || '').trim();
      const value = r.value;
      if (!fieldKey) continue;

      if (fieldType === 'multi_select') {
        const options = normalizeMultiSelect(value);
        for (const opt of options) {
          await pool.execute(
            `INSERT INTO provider_search_index
             (agency_id, user_id, field_key, field_type, value_text, value_option)
             VALUES (?, ?, ?, ?, NULL, ?)`,
            [aid, uid, fieldKey, fieldType, opt]
          );
        }
      } else if (fieldType === 'boolean') {
        const b = value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
        await pool.execute(
          `INSERT INTO provider_search_index
           (agency_id, user_id, field_key, field_type, value_text, value_option)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [aid, uid, fieldKey, fieldType, b ? 'true' : 'false']
        );
      } else {
        const text = value === null || value === undefined ? null : String(value);
        if (!text) continue;
        await pool.execute(
          `INSERT INTO provider_search_index
           (agency_id, user_id, field_key, field_type, value_text, value_option)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [aid, uid, fieldKey, fieldType, text]
        );

        // Derived tag: degree_level=bachelors from credentialing text
        if (fieldKey === 'provider_credential' && isBachelorsCredentialText(text)) {
          await pool.execute(
            `INSERT INTO provider_search_index
             (agency_id, user_id, field_key, field_type, value_text, value_option)
             VALUES (?, ?, 'degree_level', 'multi_select', NULL, 'bachelors')`,
            [aid, uid]
          );
        }
      }
    }

    return { ok: true };
  }

  static async rebuildForAgency({ agencyId }) {
    const aid = Number(agencyId);
    if (!aid) return { ok: false };

    // Determine providers to index: any user assigned to this agency.
    const [users] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?`,
      [aid]
    );

    for (const u of users || []) {
      await this.upsertForUserInAgency({ userId: u.id, agencyId: aid });
    }

    return { ok: true, userCount: (users || []).length };
  }

  static async search({ agencyId, filters, limit = 50, offset = 0, textQuery = '' }) {
    const aid = Number(agencyId);
    if (!aid) return { users: [], total: 0 };
    // NOTE: Some MySQL/CloudSQL setups reject prepared-statement params for LIMIT/OFFSET,
    // yielding "Incorrect arguments to mysqld_stmt_execute". We inline validated integers.
    const safeLimit = Math.trunc(Math.max(1, Math.min(200, Number(limit) || 50)));
    const safeOffset = Math.trunc(Math.max(0, Number(offset) || 0));

    const fs = Array.isArray(filters) ? filters : [];
    const clauses = [];
    const params = [];

    // We build a UNION ALL of match sets and then require count(distinct filter_idx)=N.
    const subqueries = [];
    let idx = 0;
    for (const f of fs) {
      const fieldKey = String(f?.fieldKey || '').trim();
      const op = String(f?.op || '').trim();
      const value = f?.value;
      if (!fieldKey) continue;
      idx += 1;

      if (op === 'hasOption') {
        const opt = String(value || '').trim();
        if (!opt) continue;
        subqueries.push(
          `SELECT user_id, ${idx} AS filter_idx
           FROM provider_search_index
           WHERE agency_id = ? AND field_key = ? AND value_option = ?`
        );
        params.push(aid, fieldKey, opt);
      } else if (op === 'textContains') {
        const q = String(value || '').trim();
        if (!q) continue;
        subqueries.push(
          `SELECT user_id, ${idx} AS filter_idx
           FROM provider_search_index
           WHERE agency_id = ? AND field_key = ? AND value_text LIKE ?`
        );
        params.push(aid, fieldKey, `%${q}%`);
      } else if (op === 'equals') {
        const q = String(value ?? '').trim();
        subqueries.push(
          `SELECT user_id, ${idx} AS filter_idx
           FROM provider_search_index
           WHERE agency_id = ? AND field_key = ? AND value_text = ?`
        );
        params.push(aid, fieldKey, q);
      }
    }

    // Optional global text query across provider text fields.
    const tq = String(textQuery || '').trim();
    if (tq) {
      // Reserve filter_idx = 0 for global search (does not count toward AND filter matching).
      clauses.push(
        `u.id IN (
          SELECT DISTINCT user_id
          FROM provider_search_index
          WHERE agency_id = ? AND value_text LIKE ?
        )`
      );
      params.unshift(aid, `%${tq}%`);
    }

    let whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    let baseUserIdsSql = `SELECT DISTINCT u.id
      FROM users u
      JOIN user_agencies ua ON ua.user_id = u.id
      ${whereSql}
      AND ua.agency_id = ?`;
    params.push(aid);

    if (subqueries.length) {
      const union = subqueries.join('\nUNION ALL\n');
      baseUserIdsSql = `
        SELECT user_id
        FROM (
          ${union}
        ) matches
        WHERE user_id IN (${baseUserIdsSql})
        GROUP BY user_id
        HAVING COUNT(DISTINCT filter_idx) = ${idx}
      `;
    }

    const [totalRows] = await pool.execute(`SELECT COUNT(*) AS c FROM (${baseUserIdsSql}) x`, params);
    const total = Number(totalRows?.[0]?.c || 0);

    const [userRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role
       FROM users u
       WHERE u.id IN (${baseUserIdsSql})
       ORDER BY u.last_name, u.first_name
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    return { users: userRows || [], total };
  }
}

export default ProviderSearchIndex;

