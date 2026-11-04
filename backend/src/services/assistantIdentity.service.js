// Kept separate from User so a directory filter can never hide a login identity.
const defaultDb = async () => (await import('../config/database.js')).default;

export async function loadAssistantIdentity(userId, { db } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const executor = db || await defaultDb();
  const [[row]] = await executor.execute(`SELECT u.id AS user_id, u.role AS user_role,
    u.email, u.is_active, u.is_archived, u.is_assistant_account, u.status AS user_status,
    aa.id AS assistant_account_id, aa.agency_id, aa.subrole, aa.status,
    aa.policy_revision, aa.capabilities_json, aa.schedule_json, aa.baa_status,
    aa.privacy_policy_json, a.name AS agency_name, a.slug AS agency_slug,
    a.is_active AS agency_active, a.is_archived AS agency_archived
    FROM users u LEFT JOIN assistant_accounts aa ON aa.user_id=u.id
    LEFT JOIN agencies a ON a.id=aa.agency_id WHERE u.id=? LIMIT 1`, [id]);
  if (!row || (row.user_role !== 'assistant' && !row.assistant_account_id && ![true, 1, '1'].includes(row.is_assistant_account))) return null;
  return {
    userId: id, role: 'assistant', email: row.email,
    enabled: ![false, 0, '0'].includes(row.is_active)
      && ![true, 1, '1'].includes(row.is_archived)
      && ![false, 0, '0'].includes(row.agency_active)
      && ![true, 1, '1'].includes(row.agency_archived)
      && !['ARCHIVED', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING', 'TERMINATED'].includes(row.user_status),
    account: row.assistant_account_id ? {
      id: Number(row.assistant_account_id), userId: id,
      agencyId: Number(row.agency_id), agencyName: row.agency_name,
      agencySlug: row.agency_slug, subrole: row.subrole, status: row.status,
      policyRevision: Number(row.policy_revision), capabilitiesJson: row.capabilities_json,
      scheduleJson: row.schedule_json, baaStatus: row.baa_status, privacyPolicyJson: row.privacy_policy_json
    } : null
  };
}

export async function assertAssistantMembership(identity, { db } = {}) {
  if (!identity?.account) return false;
  const executor = db || await defaultDb();
  const [memberships] = await executor.execute(
    'SELECT agency_id,is_active FROM user_agencies WHERE user_id=?', [identity.userId]);
  return memberships.length === 1 && Number(memberships[0].agency_id) === identity.account.agencyId
    && ![false, 0, '0'].includes(memberships[0].is_active);
}

export async function filterAssistantIdentities(rows, { db } = {}) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const executor = db || await defaultDb();
  const ids = [...new Set(rows.map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return rows.filter(row => row.role !== 'assistant');
  const [profiles] = await executor.execute(
    `SELECT u.id AS user_id FROM users u LEFT JOIN assistant_accounts aa ON aa.user_id=u.id
      WHERE u.id IN (${ids.map(() => '?').join(',')})
      AND (u.role='assistant' OR u.is_assistant_account=1 OR aa.id IS NOT NULL)`, ids);
  const hidden = new Set(profiles.map(row => Number(row.user_id)));
  return rows.filter(row => row.role !== 'assistant' && !hidden.has(Number(row.id)));
}

export async function hasAssistantTargets(userIds, { db } = {}) {
  if (!userIds.length) return false;
  const executor = db || await defaultDb();
  const [[row]] = await executor.execute(`SELECT u.id FROM users u
    LEFT JOIN assistant_accounts aa ON aa.user_id=u.id
    WHERE u.id IN (${userIds.map(() => '?').join(',')})
      AND (u.role='assistant' OR u.is_assistant_account=1 OR aa.id IS NOT NULL) LIMIT 1`, userIds);
  return !!row;
}

// Public reset/setup routes are outside authenticate(). Resolve only the target
// identity; never return credentials, token fragments or recovery details.
export async function assistantRecoveryTarget(req, { db } = {}) {
  const path = String(req.originalUrl || req.path || '').split('?')[0].replace(/\/+$/, '');
  const tokenRoute = path.match(/^\/api\/auth\/(?:passwordless-login|pending\/verify-identity|validate-setup-token|initial-setup|validate-reset-token|reset-password)(?:\/([^/]+))?$/);
  const loginRoute = /^\/api\/auth\/(?:request-password-reset|request-guardian-temp-password|recover-username)$/.test(path);
  if (!tokenRoute && !loginRoute) return null;
  const executor = db || await defaultDb();
  let rows;
  if (tokenRoute) {
    let token = tokenRoute[1] || req.body?.token;
    if (tokenRoute[1]) {
      try { token = decodeURIComponent(tokenRoute[1]); } catch { return null; }
    }
    if (typeof token !== 'string' || !token || token.length > 4096) return null;
    [rows] = await executor.execute('SELECT id FROM users WHERE passwordless_token=? LIMIT 1', [token]);
  } else {
    const login = String(req.body?.email || req.body?.username || req.body?.identifier || '').trim().toLowerCase();
    if (!login || login.length > 320) return null;
    [rows] = await executor.execute(`SELECT DISTINCT u.id FROM users u
      LEFT JOIN user_login_emails le ON le.user_id=u.id
      WHERE LOWER(TRIM(u.email))=? OR LOWER(TRIM(u.username))=?
        OR LOWER(TRIM(u.work_email))=? OR LOWER(TRIM(u.personal_email))=?
        OR LOWER(TRIM(le.email))=? LIMIT 1`, [login, login, login, login, login]);
  }
  return rows?.[0] ? loadAssistantIdentity(rows[0].id, { db: executor }) : null;
}
