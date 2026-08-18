import pool from '../config/database.js';
import User from '../models/User.model.js';
import {
  CLIENT_MERGE_FIELDS,
  USER_MERGE_FIELDS,
  buildMergePreview,
  groupByConnectedPairs,
  heuristicTestReasons
} from '../utils/identityHygiene.js';

const USER_SELECT = `
  u.id, u.email, u.work_email, u.personal_email, u.username,
  u.first_name, u.last_name, u.preferred_name,
  u.phone_number, u.personal_phone, u.work_phone,
  u.title, u.credential, u.department, u.role, u.status,
  u.created_at, u.is_demo, u.is_archived
`;

async function lastLoginMap(userIds) {
  const map = {};
  if (!userIds.length) return map;
  const placeholders = userIds.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, MAX(created_at) AS last_login
       FROM user_audit_log
       WHERE user_id IN (${placeholders})
         AND action_type IN ('login', 'LOGIN', 'auth_login')
       GROUP BY user_id`,
      userIds
    );
    for (const r of rows || []) map[Number(r.user_id)] = r.last_login;
  } catch {
    try {
      const [rows] = await pool.execute(
        `SELECT user_id, MAX(created_at) AS last_login
         FROM audit_logs
         WHERE user_id IN (${placeholders})
         GROUP BY user_id`,
        userIds
      );
      for (const r of rows || []) map[Number(r.user_id)] = r.last_login;
    } catch {
      /* optional */
    }
  }
  return map;
}

function scopeRole(row) {
  return String(row.role || '').toLowerCase();
}

function matchesPersona(row, persona) {
  const role = scopeRole(row);
  if (persona === 'guardians') return role === 'client_guardian';
  if (persona === 'school_staff') return role === 'school_staff';
  if (persona === 'employees') return role !== 'client_guardian' && role !== 'school_staff';
  return true;
}

async function loadUsers({ persona = 'employees', agencyId = null, includeArchived = false } = {}) {
  const values = [];
  let sql = `
    SELECT ${USER_SELECT},
      GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agencies,
      GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') AS agency_ids,
      MAX(CASE WHEN LOWER(CONCAT(COALESCE(a.slug,''),' ',COALESCE(a.name,''),' ',COALESCE(a.portal_url,'')))
        REGEXP 'hogwarts|durmstrang' THEN 1 ELSE 0 END) AS hogwarts_member,
      MAX(CASE WHEN ua.include_on_disclosure = 0 THEN 1 ELSE 0 END) AS disclosure_excluded,
      MAX(CASE WHEN dta.user_id IS NOT NULL THEN 1 ELSE 0 END) AS in_test_switcher
    FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id = u.id
    LEFT JOIN agencies a ON a.id = ua.agency_id
    LEFT JOIN demo_test_accounts dta ON dta.user_id = u.id AND COALESCE(dta.is_active, 1) = 1
    WHERE 1=1
  `;
  if (!includeArchived) sql += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
  const aid = Number(agencyId);
  if (Number.isFinite(aid) && aid > 0) {
    sql += ` AND EXISTS (SELECT 1 FROM user_agencies x WHERE x.user_id = u.id AND x.agency_id = ?)`;
    values.push(aid);
  }
  sql += ' GROUP BY u.id';
  const [rows] = await pool.execute(sql, values);
  const people = (rows || []).filter((r) => matchesPersona(r, persona));
  const loginMap = await lastLoginMap(people.map((r) => Number(r.id)));
  return people.map((r) => ({
    ...r,
    last_login: loginMap[Number(r.id)] || null,
    include_on_disclosure: Number(r.disclosure_excluded) === 1 ? 0 : null
  }));
}

export async function findUserDuplicateGroups(opts = {}) {
  const rows = await loadUsers(opts);
  const groups = groupByConnectedPairs(rows, { minScore: 48 });
  return {
    groups: groups.map((g) => ({
      ...g,
      matchPercent: g.matchPercent,
      members: g.members.map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        phone_number: m.phone_number,
        role: m.role,
        status: m.status,
        agencies: m.agencies,
        created_at: m.created_at,
        last_login: m.last_login,
        is_demo: !!Number(m.is_demo)
      }))
    })),
    groupCount: groups.length
  };
}

export async function listTestUsers(opts = {}) {
  const rows = await loadUsers({ ...opts, includeArchived: true });
  const tests = [];
  for (const row of rows) {
    const reasons = heuristicTestReasons(row);
    if (!reasons.length) continue;
    tests.push({
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      role: row.role,
      status: row.status,
      agencies: row.agencies,
      last_login: row.last_login,
      is_demo: !!Number(row.is_demo),
      autoSelected: !!Number(row.is_demo) || reasons.includes('Known demo name')
        || reasons.includes('Removed from disclosure documents')
        || reasons.includes('Test account switcher'),
      reasons
    });
  }
  tests.sort((a, b) => Number(b.autoSelected) - Number(a.autoSelected) || String(a.last_name || '').localeCompare(String(b.last_name || '')));
  return { accounts: tests, count: tests.length };
}

async function loadClients({ agencyId = null, includeArchived = false } = {}) {
  const values = [];
  let sql = `
    SELECT
      c.id, c.full_name, c.initials, c.date_of_birth, c.contact_phone,
      c.identifier_code, c.grade, c.school_year, c.status, c.gender,
      c.address_street, c.address_city, c.address_state, c.address_zip,
      c.provider_id, c.organization_id, c.agency_id, c.created_at, c.is_demo,
      org.name AS organization_name,
      TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS provider_name
    FROM clients c
    LEFT JOIN agencies org ON org.id = c.organization_id
    LEFT JOIN users p ON p.id = c.provider_id
    WHERE 1=1
  `;
  const aid = Number(agencyId);
  if (Number.isFinite(aid) && aid > 0) {
    sql += ' AND c.agency_id = ?';
    values.push(aid);
  }
  if (!includeArchived) sql += ` AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'`;
  const [rows] = await pool.execute(sql, values);
  return rows || [];
}

export async function findClientDuplicateGroups(opts = {}) {
  const rows = await loadClients(opts);
  const groups = groupByConnectedPairs(rows, { minScore: 48 });
  return {
    groups: groups.map((g) => ({
      ...g,
      members: g.members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        initials: m.initials,
        date_of_birth: m.date_of_birth,
        contact_phone: m.contact_phone,
        identifier_code: m.identifier_code,
        status: m.status,
        organization_name: m.organization_name,
        provider_name: m.provider_name,
        created_at: m.created_at,
        is_demo: !!Number(m.is_demo)
      }))
    })),
    groupCount: groups.length
  };
}

export async function listTestClients(opts = {}) {
  const rows = await loadClients({ ...opts, includeArchived: true });
  const accounts = [];
  for (const row of rows) {
    const reasons = heuristicTestReasons({
      ...row,
      first_name: String(row.full_name || '').split(' ')[0],
      last_name: String(row.full_name || '').split(' ').slice(-1)[0],
      agencies: row.organization_name
    });
    if (!reasons.length) continue;
    accounts.push({
      id: row.id,
      full_name: row.full_name,
      initials: row.initials,
      organization_name: row.organization_name,
      status: row.status,
      is_demo: !!Number(row.is_demo),
      autoSelected: !!Number(row.is_demo) || reasons.includes('Known demo name') || reasons.includes('Hogwarts / Durmstrang'),
      reasons
    });
  }
  return { accounts, count: accounts.length };
}

async function loadUserById(id) {
  const [rows] = await pool.execute(
    `SELECT ${USER_SELECT} FROM users u WHERE u.id = ? LIMIT 1`,
    [id]
  );
  return rows?.[0] || null;
}

async function loadClientById(id) {
  const [rows] = await pool.execute(`SELECT * FROM clients WHERE id = ? LIMIT 1`, [id]);
  return rows?.[0] || null;
}

export async function previewUserMerge({ keepId, sourceIds, fieldChoices = {} }) {
  const keep = await loadUserById(keepId);
  const others = [];
  for (const id of sourceIds) {
    if (Number(id) === Number(keepId)) continue;
    const row = await loadUserById(id);
    if (row) others.push(row);
  }
  if (!keep || !others.length) throw Object.assign(new Error('Keep and source records are required'), { status: 400 });
  return {
    keep,
    others,
    fields: buildMergePreview({ keep, others, fields: USER_MERGE_FIELDS, fieldChoices })
  };
}

export async function previewClientMerge({ keepId, sourceIds, fieldChoices = {} }) {
  const keep = await loadClientById(keepId);
  const others = [];
  for (const id of sourceIds) {
    if (Number(id) === Number(keepId)) continue;
    const row = await loadClientById(id);
    if (row) others.push(row);
  }
  if (!keep || !others.length) throw Object.assign(new Error('Keep and source records are required'), { status: 400 });
  return {
    keep,
    others,
    fields: buildMergePreview({ keep, others, fields: CLIENT_MERGE_FIELDS, fieldChoices })
  };
}

async function execIgnore(sql, params, conn = pool) {
  try {
    await conn.execute(sql, params);
  } catch {
    /* table or constraint may not exist */
  }
}

export async function mergeUsers({ keepId, sourceIds, fieldChoices = {}, actorUserId = null }) {
  const preview = await previewUserMerge({ keepId, sourceIds, fieldChoices });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets = [];
    const values = [];
    for (const field of preview.fields) {
      sets.push(`${field.key} = ?`);
      values.push(field.chosenValue);
    }
    values.push(keepId);
    if (sets.length) {
      await conn.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
    }

    for (const other of preview.others) {
      await execIgnore(
        `INSERT IGNORE INTO user_agencies (user_id, agency_id, is_active)
         SELECT ?, agency_id, is_active FROM user_agencies WHERE user_id = ?`,
        [keepId, other.id],
        conn
      );
      await execIgnore(`UPDATE client_guardians SET guardian_user_id = ? WHERE guardian_user_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE clients SET provider_id = ? WHERE provider_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE tasks SET assigned_to_user_id = ? WHERE assigned_to_user_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE supervisor_assignments SET supervisor_id = ? WHERE supervisor_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE supervisor_assignments SET supervisee_id = ? WHERE supervisee_id = ?`, [keepId, other.id], conn);
      const mergedEmail = `merged+${other.id}.${String(other.email || 'user').replace('@', '.at.')}@merged.invalid`;
      try {
        await conn.execute(
          `UPDATE users
           SET email = ?, status = 'ARCHIVED', is_archived = 1, archived_at = NOW(), archived_by_user_id = ?, is_active = 0
           WHERE id = ?`,
          [mergedEmail.slice(0, 250), actorUserId, other.id]
        );
      } catch {
        await conn.execute(
          `UPDATE users SET email = ?, status = 'ARCHIVED', is_active = 0 WHERE id = ?`,
          [mergedEmail.slice(0, 250), other.id]
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return previewUserMerge({ keepId, sourceIds: [], fieldChoices: {} }).catch(() => ({ keepId, merged: true }));
}

export async function mergeClients({ keepId, sourceIds, fieldChoices = {}, actorUserId = null }) {
  const preview = await previewClientMerge({ keepId, sourceIds, fieldChoices });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets = [];
    const values = [];
    for (const field of preview.fields) {
      sets.push(`${field.key} = ?`);
      values.push(field.chosenValue);
    }
    values.push(keepId);
    if (sets.length) {
      await conn.execute(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    for (const other of preview.others) {
      await execIgnore(`UPDATE client_guardians SET client_id = ? WHERE client_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE client_organization_assignments SET client_id = ? WHERE client_id = ?`, [keepId, other.id], conn);
      await execIgnore(`UPDATE clinical_sessions SET client_id = ? WHERE client_id = ?`, [keepId, other.id], conn);
      await conn.execute(
        `UPDATE clients SET status = 'ARCHIVED', identifier_code = CONCAT(COALESCE(identifier_code,''), '-merged-', ?) WHERE id = ?`,
        [other.id, other.id]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { keepId, mergedSourceIds: sourceIds, actorUserId };
}

export async function setUserDemoFlag(userId, isDemo) {
  const flag = isDemo ? 1 : 0;
  await pool.execute('UPDATE users SET is_demo = ? WHERE id = ?', [flag, userId]);
  if (flag) {
    await execIgnore(
      'UPDATE user_agencies SET include_on_disclosure = 0 WHERE user_id = ?',
      [userId]
    );
  }
  return User.findById(userId);
}

export async function setClientDemoFlag(clientId, isDemo) {
  const flag = isDemo ? 1 : 0;
  await pool.execute('UPDATE clients SET is_demo = ? WHERE id = ?', [flag, clientId]);
  const [rows] = await pool.execute('SELECT id, is_demo, full_name FROM clients WHERE id = ?', [clientId]);
  return rows?.[0] || null;
}

export async function bulkSetUserDemo(userIds, isDemo) {
  const ids = (userIds || []).map((id) => Number(id)).filter((n) => n > 0);
  if (!ids.length) return { updated: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute(
    `UPDATE users SET is_demo = ? WHERE id IN (${placeholders})`,
    [isDemo ? 1 : 0, ...ids]
  );
  if (isDemo) {
    await execIgnore(
      `UPDATE user_agencies SET include_on_disclosure = 0 WHERE user_id IN (${placeholders})`,
      ids
    );
  }
  return { updated: result.affectedRows || 0 };
}

export async function bulkSetClientDemo(clientIds, isDemo) {
  const ids = (clientIds || []).map((id) => Number(id)).filter((n) => n > 0);
  if (!ids.length) return { updated: 0 };
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.execute(
    `UPDATE clients SET is_demo = ? WHERE id IN (${placeholders})`,
    [isDemo ? 1 : 0, ...ids]
  );
  return { updated: result.affectedRows || 0 };
}
