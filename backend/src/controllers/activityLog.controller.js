import UserActivityLog from '../models/UserActivityLog.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import auditActionRegistry from '../config/auditActionRegistry.js';

const clamp = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

const isMissingDbArtifactError = (error) => {
  const code = String(error?.code || '');
  const sqlMessage = String(error?.sqlMessage || error?.message || '');
  // Common MySQL codes/messages when a deployment is missing migrations.
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  if (sqlMessage.includes('ER_NO_SUCH_TABLE') || sqlMessage.includes("doesn't exist")) return true;
  if (sqlMessage.includes('Unknown column') || sqlMessage.includes('ER_BAD_FIELD_ERROR')) return true;
  return false;
};

const parseMissingArtifactHint = (error) => {
  const code = String(error?.code || '');
  const msg = String(error?.sqlMessage || error?.message || '');
  // Table: Table 'db.table' doesn't exist
  const tableMatch = msg.match(/Table '([^']+)' doesn't exist/i);
  if (tableMatch?.[1]) return { kind: 'table', value: tableMatch[1], code };
  // Column: Unknown column 'col' in 'field list'
  const colMatch = msg.match(/Unknown column '([^']+)'/i);
  if (colMatch?.[1]) return { kind: 'column', value: colMatch[1], code };
  return { kind: 'unknown', value: null, code };
};

const recordDisabledSource = (diagnostics, source, error) => {
  if (!diagnostics) return;
  try {
    const hint = parseMissingArtifactHint(error);
    const entry = {
      source,
      reason: 'missing_db_artifact',
      artifact_kind: hint.kind,
      artifact: hint.value,
      code: hint.code
    };
    diagnostics.disabled_sources = Array.isArray(diagnostics.disabled_sources) ? diagnostics.disabled_sources : [];
    diagnostics.disabled_sources.push(entry);
  } catch {
    // ignore
  }
};

const isUnionCollationError = (error) => {
  const msg = String(error?.sqlMessage || error?.message || '').toLowerCase();
  return msg.includes('illegal mix of collations') && msg.includes('union');
};

const csvEscape = (value) => {
  const s = value == null ? '' : String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const isAuditCenterRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

const assertAgencyAuditAccess = async (req, agencyId) => {
  const roleNorm = String(req.user?.role || '').toLowerCase();
  if (!isAuditCenterRole(roleNorm)) return { ok: false, status: 403, message: 'Admin access required' };
  if (roleNorm === 'super_admin') return { ok: true };

  const userAgencies = await User.getAgencies(req.user.id);
  const hasAccess = (userAgencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!hasAccess) return { ok: false, status: 403, message: 'You do not have access to this agency' };
  return { ok: true };
};

const parseJsonSafe = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const sourceLabel = {
  user_activity: 'User activity',
  admin_action: 'Admin action',
  support_ticket: 'Support ticket',
  client_access: 'Client access',
  phi_document: 'Document audit'
};

const asLike = (value) => `%${String(value || '').trim().toLowerCase()}%`;

const toDateRange = (startDate, endDate) => ({
  start: startDate ? (String(startDate).includes(' ') ? String(startDate) : `${startDate} 00:00:00`) : null,
  end: endDate ? (String(endDate).includes(' ') ? String(endDate) : `${endDate} 23:59:59`) : null
});

const resolveActionTypes = (category, actionType) => {
  if (actionType && String(actionType).trim()) return [String(actionType).trim()];
  if (category && String(category).trim()) {
    const types = auditActionRegistry.getActionTypesForCategory(String(category).trim());
    return types.length > 0 ? types : null;
  }
  return null;
};

const addClientSearchWhere = (where, params, search, tableAlias = 'c') => {
  if (!search) return;
  const like = asLike(search);
  where.push(`(
    LOWER(COALESCE(${tableAlias}.initials, '')) LIKE ?
    OR LOWER(COALESCE(${tableAlias}.full_name, '')) LIKE ?
    OR LOWER(COALESCE(${tableAlias}.identifier_code, '')) LIKE ?
  )`);
  params.push(like, like, like);
};

const normalizeAuditRow = (row) => ({
  ...row,
  source_label: sourceLabel[row.log_type] || row.log_type || 'Audit',
  link_path:
    row.link_path ||
    (row.log_type === 'admin_action' && row.target_user_id ? `/admin/users/${row.target_user_id}` : null) ||
    null,
  client_full_name: String(row.client_full_name || '').trim() || null,
  client_initials: String(row.client_initials || '').trim() || null,
  metadata: parseJsonSafe(row.metadata)
});

const addActionTypeWhere = (where, params, actionTypes, column = 'l.action') => {
  if (!actionTypes || actionTypes.length === 0) return;
  if (actionTypes.length === 1) {
    where.push(`${column} = ?`);
    params.push(actionTypes[0]);
  } else {
    where.push(`${column} IN (${actionTypes.map(() => '?').join(',')})`);
    params.push(...actionTypes);
  }
};

const getClientAccessRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionTypes, search, limit = 50, offset = 0, sortOrder = 'DESC', startDate, endDate } = filters;
  const where = ['c.agency_id = ?'];
  const params = [agencyId];
  const { start, end } = toDateRange(startDate, endDate);
  if (userId) { where.push('l.user_id = ?'); params.push(userId); }
  addActionTypeWhere(where, params, actionTypes);
  if (start) { where.push('l.created_at >= ?'); params.push(start); }
  if (end) { where.push('l.created_at <= ?'); params.push(end); }
  addClientSearchWhere(where, params, search, 'c');
  if (search) {
    const like = asLike(search);
    where.push(`(
      LOWER(COALESCE(u.email, '')) LIKE ?
      OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      OR LOWER(COALESCE(l.action, '')) LIKE ?
      OR LOWER(COALESCE(l.route, '')) LIKE ?
      OR LOWER(COALESCE(l.method, '')) LIKE ?
      OR LOWER(COALESCE(l.ip_address, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const qLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 5000));
  const qOffset = Math.max(0, parseInt(offset, 10) || 0);
  try {
    const [rows] = await pool.execute(
      `SELECT l.id, l.created_at, l.action AS action_type, l.user_id,
              u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
              l.ip_address, NULL AS session_id,
              JSON_OBJECT('route', l.route, 'method', l.method, 'role', l.user_role) AS metadata,
              c.id AS client_id, c.initials AS client_initials, c.full_name AS client_full_name,
              c.client_type, c.identifier_code AS client_identifier_code,
              c.agency_id, a.name AS agency_name,
              'client_access' AS log_type,
              CONCAT('/admin/clients?clientId=', c.id, '&tab=access') AS link_path
       FROM client_access_logs l
       JOIN clients c ON c.id = l.client_id
       LEFT JOIN users u ON u.id = l.user_id
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at ${order}, l.id DESC
       LIMIT ${qLimit} OFFSET ${qOffset}`,
      params
    );
    return (rows || []).map(normalizeAuditRow);
  } catch (e) {
    if (isMissingDbArtifactError(e)) {
      recordDisabledSource(diagnostics, 'client_access', e);
      return [];
    }
    throw e;
  }
};

const countClientAccessRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionTypes, search, startDate, endDate } = filters;
  const where = ['c.agency_id = ?'];
  const params = [agencyId];
  const { start, end } = toDateRange(startDate, endDate);
  if (userId) { where.push('l.user_id = ?'); params.push(userId); }
  addActionTypeWhere(where, params, actionTypes);
  if (start) { where.push('l.created_at >= ?'); params.push(start); }
  if (end) { where.push('l.created_at <= ?'); params.push(end); }
  addClientSearchWhere(where, params, search, 'c');
  if (search) {
    const like = asLike(search);
    where.push(`(
      LOWER(COALESCE(u.email, '')) LIKE ?
      OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      OR LOWER(COALESCE(l.action, '')) LIKE ?
      OR LOWER(COALESCE(l.route, '')) LIKE ?
      OR LOWER(COALESCE(l.method, '')) LIKE ?
      OR LOWER(COALESCE(l.ip_address, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM client_access_logs l
       JOIN clients c ON c.id = l.client_id
       LEFT JOIN users u ON u.id = l.user_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    return Number(rows?.[0]?.total || 0);
  } catch (e) {
    if (isMissingDbArtifactError(e)) {
      recordDisabledSource(diagnostics, 'client_access', e);
      return 0;
    }
    throw e;
  }
};

const getSupportTicketRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionType, actionTypes, search, limit = 50, offset = 0, sortOrder = 'DESC', startDate, endDate } = filters;
  const at = actionTypes ?? (actionType ? [String(actionType)] : null);
  const supportActions = ['support_ticket_created', 'support_ticket_message'];
  if (at && at.length > 0 && !at.some((a) => supportActions.includes(String(a)))) return [];
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const qLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 5000));
  const qOffset = Math.max(0, parseInt(offset, 10) || 0);

  const includeCreated = !at || at.length === 0 || at.includes('support_ticket_created');
  const includeMessages = !at || at.length === 0 || at.includes('support_ticket_message');

  // To preserve correct ordering across both sources, fetch an expanded slice and merge/sort in JS.
  const expanded = Math.min(qOffset + qLimit, 5000);

  const { start, end } = toDateRange(startDate, endDate);

  const out = [];

  if (includeCreated) {
    const whereT = ['(t.agency_id = ? OR (t.agency_id IS NULL AND c.agency_id = ?))'];
    const paramsT = [agencyId, agencyId];
    if (userId) { whereT.push('t.created_by_user_id = ?'); paramsT.push(userId); }
    if (start) { whereT.push('t.created_at >= ?'); paramsT.push(start); }
    if (end) { whereT.push('t.created_at <= ?'); paramsT.push(end); }
    addClientSearchWhere(whereT, paramsT, search, 'c');
    if (search) {
      const like = asLike(search);
      whereT.push(`(
        LOWER(COALESCE(t.subject, '')) LIKE ?
        OR LOWER(COALESCE(t.question, '')) LIKE ?
        OR LOWER(COALESCE(u.email, '')) LIKE ?
        OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      )`);
      paramsT.push(like, like, like, like);
    }
    try {
      const [rowsT] = await pool.execute(
        `SELECT t.id AS id, t.created_at, 'support_ticket_created' AS action_type, t.created_by_user_id AS user_id,
                u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
                NULL AS ip_address, NULL AS session_id,
                JSON_OBJECT('ticketId', t.id, 'subject', t.subject, 'messageId', NULL, 'status', t.status) AS metadata,
                c.id AS client_id, c.initials AS client_initials, c.full_name AS client_full_name,
                c.client_type, c.identifier_code AS client_identifier_code,
                COALESCE(t.agency_id, c.agency_id) AS agency_id,
                a.name AS agency_name,
                'support_ticket' AS log_type,
                CASE WHEN c.id IS NULL THEN '/admin/tickets' ELSE CONCAT('/admin/clients?clientId=', c.id, '&tab=messages') END AS link_path
         FROM support_tickets t
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users u ON u.id = t.created_by_user_id
         LEFT JOIN agencies a ON a.id = COALESCE(t.agency_id, c.agency_id)
         WHERE ${whereT.join(' AND ')}
         ORDER BY t.created_at ${order}, t.id DESC
         LIMIT ${expanded} OFFSET 0`,
        paramsT
      );
      out.push(...(rowsT || []).map(normalizeAuditRow));
    } catch (e) {
      if (isMissingDbArtifactError(e) || isUnionCollationError(e)) {
        recordDisabledSource(diagnostics, 'support_ticket', e);
      } else {
        throw e;
      }
    }
  }

  if (includeMessages) {
    const whereM = ['(t.agency_id = ? OR (t.agency_id IS NULL AND c.agency_id = ?))'];
    const paramsM = [agencyId, agencyId];
    if (userId) { whereM.push('m.author_user_id = ?'); paramsM.push(userId); }
    if (start) { whereM.push('m.created_at >= ?'); paramsM.push(start); }
    if (end) { whereM.push('m.created_at <= ?'); paramsM.push(end); }
    addClientSearchWhere(whereM, paramsM, search, 'c');
    if (search) {
      const like = asLike(search);
      whereM.push(`(
        LOWER(COALESCE(t.subject, '')) LIKE ?
        OR LOWER(COALESCE(m.body, '')) LIKE ?
        OR LOWER(COALESCE(u.email, '')) LIKE ?
        OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      )`);
      paramsM.push(like, like, like, like);
    }
    try {
      const [rowsM] = await pool.execute(
        `SELECT (m.id + 1000000000) AS id, m.created_at, 'support_ticket_message' AS action_type, m.author_user_id AS user_id,
                u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
                NULL AS ip_address, NULL AS session_id,
                JSON_OBJECT('ticketId', m.ticket_id, 'subject', t.subject, 'messageId', m.id, 'status', t.status) AS metadata,
                c.id AS client_id, c.initials AS client_initials, c.full_name AS client_full_name,
                c.client_type, c.identifier_code AS client_identifier_code,
                COALESCE(t.agency_id, c.agency_id) AS agency_id,
                a.name AS agency_name,
                'support_ticket' AS log_type,
                CASE WHEN c.id IS NULL THEN '/admin/tickets' ELSE CONCAT('/admin/clients?clientId=', c.id, '&tab=messages') END AS link_path
         FROM support_ticket_messages m
         JOIN support_tickets t ON t.id = m.ticket_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users u ON u.id = m.author_user_id
         LEFT JOIN agencies a ON a.id = COALESCE(t.agency_id, c.agency_id)
         WHERE ${whereM.join(' AND ')}
         ORDER BY m.created_at ${order}, m.id DESC
         LIMIT ${expanded} OFFSET 0`,
        paramsM
      );
      out.push(...(rowsM || []).map(normalizeAuditRow));
    } catch (e) {
      if (isMissingDbArtifactError(e) || isUnionCollationError(e)) {
        recordDisabledSource(diagnostics, 'support_ticket', e);
      } else {
        throw e;
      }
    }
  }

  // Global sort (created_at desc/asc) then id desc for stability, then apply requested slice.
  out.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return order === 'ASC' ? (ta - tb) : (tb - ta);
    const ia = Number(a.id || 0);
    const ib = Number(b.id || 0);
    return ib - ia;
  });

  return out.slice(qOffset, qOffset + qLimit);
};

const countSupportTicketRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionType, actionTypes, search, startDate, endDate } = filters;
  const at = actionTypes ?? (actionType ? [String(actionType)] : null);
  const supportActions = ['support_ticket_created', 'support_ticket_message'];
  if (at && at.length > 0 && !at.some((a) => supportActions.includes(String(a)))) return 0;

  const includeCreated = !at || at.length === 0 || at.includes('support_ticket_created');
  const includeMessages = !at || at.length === 0 || at.includes('support_ticket_message');

  const { start, end } = toDateRange(startDate, endDate);

  const counts = [];

  if (includeCreated) {
    const whereT = ['(t.agency_id = ? OR (t.agency_id IS NULL AND c.agency_id = ?))'];
    const paramsT = [agencyId, agencyId];
    if (userId) { whereT.push('t.created_by_user_id = ?'); paramsT.push(userId); }
    if (start) { whereT.push('t.created_at >= ?'); paramsT.push(start); }
    if (end) { whereT.push('t.created_at <= ?'); paramsT.push(end); }
    addClientSearchWhere(whereT, paramsT, search, 'c');
    if (search) {
      const like = asLike(search);
      whereT.push(`(
        LOWER(COALESCE(t.subject, '')) LIKE ?
        OR LOWER(COALESCE(t.question, '')) LIKE ?
        OR LOWER(COALESCE(u.email, '')) LIKE ?
        OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      )`);
      paramsT.push(like, like, like, like);
    }
    try {
      const [rowsT] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM support_tickets t
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users u ON u.id = t.created_by_user_id
         WHERE ${whereT.join(' AND ')}`,
        paramsT
      );
      counts.push(Number(rowsT?.[0]?.total || 0));
    } catch (e) {
      if (isMissingDbArtifactError(e) || isUnionCollationError(e)) {
        recordDisabledSource(diagnostics, 'support_ticket', e);
        counts.push(0);
      } else {
        throw e;
      }
    }
  }

  if (includeMessages) {
    const whereM = ['(t.agency_id = ? OR (t.agency_id IS NULL AND c.agency_id = ?))'];
    const paramsM = [agencyId, agencyId];
    if (userId) { whereM.push('m.author_user_id = ?'); paramsM.push(userId); }
    if (start) { whereM.push('m.created_at >= ?'); paramsM.push(start); }
    if (end) { whereM.push('m.created_at <= ?'); paramsM.push(end); }
    addClientSearchWhere(whereM, paramsM, search, 'c');
    if (search) {
      const like = asLike(search);
      whereM.push(`(
        LOWER(COALESCE(t.subject, '')) LIKE ?
        OR LOWER(COALESCE(m.body, '')) LIKE ?
        OR LOWER(COALESCE(u.email, '')) LIKE ?
        OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      )`);
      paramsM.push(like, like, like, like);
    }
    try {
      const [rowsM] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM support_ticket_messages m
         JOIN support_tickets t ON t.id = m.ticket_id
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN users u ON u.id = m.author_user_id
         WHERE ${whereM.join(' AND ')}`,
        paramsM
      );
      counts.push(Number(rowsM?.[0]?.total || 0));
    } catch (e) {
      if (isMissingDbArtifactError(e) || isUnionCollationError(e)) {
        recordDisabledSource(diagnostics, 'support_ticket', e);
        counts.push(0);
      } else {
        throw e;
      }
    }
  }

  return counts.reduce((sum, n) => sum + (Number(n) || 0), 0);
};

const getPhiDocumentRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionTypes, search, limit = 50, offset = 0, sortOrder = 'DESC', startDate, endDate } = filters;
  const where = ['c.agency_id = ?'];
  const params = [agencyId];
  const { start, end } = toDateRange(startDate, endDate);
  if (userId) { where.push('p.actor_user_id = ?'); params.push(userId); }
  addActionTypeWhere(where, params, actionTypes, 'p.action');
  if (start) { where.push('p.created_at >= ?'); params.push(start); }
  if (end) { where.push('p.created_at <= ?'); params.push(end); }
  addClientSearchWhere(where, params, search, 'c');
  if (search) {
    const like = asLike(search);
    where.push(`(
      LOWER(COALESCE(u.email, '')) LIKE ?
      OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      OR LOWER(COALESCE(p.action, '')) LIKE ?
      OR LOWER(COALESCE(CAST(p.metadata AS CHAR), '')) LIKE ?
      OR LOWER(COALESCE(d.document_title, '')) LIKE ?
      OR LOWER(COALESCE(d.original_name, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const qLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 5000));
  const qOffset = Math.max(0, parseInt(offset, 10) || 0);
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.created_at, p.action AS action_type, p.actor_user_id AS user_id,
              u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name,
              p.ip_address, NULL AS session_id,
              JSON_OBJECT('documentId', p.document_id, 'documentTitle', d.document_title, 'originalName', d.original_name, 'auditMetadata', p.metadata) AS metadata,
              c.id AS client_id, c.initials AS client_initials, c.full_name AS client_full_name,
              c.client_type, c.identifier_code AS client_identifier_code,
              c.agency_id, a.name AS agency_name,
              p.document_id AS related_document_id,
              'phi_document' AS log_type,
              CONCAT('/admin/clients?clientId=', c.id, '&tab=phi') AS link_path
       FROM phi_document_audit_logs p
       LEFT JOIN client_phi_documents d ON d.id = p.document_id
       LEFT JOIN clients c ON c.id = COALESCE(p.client_id, d.client_id)
       LEFT JOIN users u ON u.id = p.actor_user_id
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at ${order}, p.id DESC
       LIMIT ${qLimit} OFFSET ${qOffset}`,
      params
    );
    return (rows || []).map(normalizeAuditRow);
  } catch (e) {
    if (isMissingDbArtifactError(e)) {
      recordDisabledSource(diagnostics, 'phi_document', e);
      return [];
    }
    throw e;
  }
};

const countPhiDocumentRows = async (filters = {}, diagnostics = null) => {
  const { agencyId, userId, actionTypes, search, startDate, endDate } = filters;
  const where = ['c.agency_id = ?'];
  const params = [agencyId];
  const { start, end } = toDateRange(startDate, endDate);
  if (userId) { where.push('p.actor_user_id = ?'); params.push(userId); }
  addActionTypeWhere(where, params, actionTypes, 'p.action');
  if (start) { where.push('p.created_at >= ?'); params.push(start); }
  if (end) { where.push('p.created_at <= ?'); params.push(end); }
  addClientSearchWhere(where, params, search, 'c');
  if (search) {
    const like = asLike(search);
    where.push(`(
      LOWER(COALESCE(u.email, '')) LIKE ?
      OR LOWER(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) LIKE ?
      OR LOWER(COALESCE(p.action, '')) LIKE ?
      OR LOWER(COALESCE(CAST(p.metadata AS CHAR), '')) LIKE ?
      OR LOWER(COALESCE(d.document_title, '')) LIKE ?
      OR LOWER(COALESCE(d.original_name, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM phi_document_audit_logs p
       LEFT JOIN client_phi_documents d ON d.id = p.document_id
       LEFT JOIN clients c ON c.id = COALESCE(p.client_id, d.client_id)
       LEFT JOIN users u ON u.id = p.actor_user_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    return Number(rows?.[0]?.total || 0);
  } catch (e) {
    if (isMissingDbArtifactError(e)) {
      recordDisabledSource(diagnostics, 'phi_document', e);
      return 0;
    }
    throw e;
  }
};

/**
 * Check if the requesting user has permission to view activity for the target user
 */
const checkActivityLogPermission = async (req, targetUserId) => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      console.error('[checkActivityLogPermission] Missing user in request');
      return false;
    }

    const requestingUserId = req.user.id;
    const requestingRole = req.user.role;
    const targetUserIdInt = parseInt(targetUserId);
    const requestingUserIdInt = parseInt(requestingUserId);

    if (isNaN(targetUserIdInt) || isNaN(requestingUserIdInt)) {
      console.error('[checkActivityLogPermission] Invalid user IDs:', { targetUserId, requestingUserId });
      return false;
    }

    // Users can always view their own activity
    if (requestingUserIdInt === targetUserIdInt) {
      return true;
    }

    // Get requesting user to check supervisor status
    let requestingUser;
    try {
      requestingUser = await User.findById(requestingUserIdInt);
    } catch (err) {
      console.error('[checkActivityLogPermission] Error fetching requesting user:', err);
      return false;
    }

    if (!requestingUser) {
      console.log('[checkActivityLogPermission] Requesting user not found:', requestingUserIdInt);
      return false;
    }

    // Check if requesting user is a supervisor using boolean as source of truth
    const isRequestingSupervisor = User.isSupervisor(requestingUser);
    
    // Only supervisors, CPAs, admin, super_admin, and support can view other users' activity
    if (!isRequestingSupervisor && !['clinical_practice_assistant', 'admin', 'super_admin', 'support'].includes(requestingRole)) {
      return false;
    }

    // Super admin can view all users
    if (requestingRole === 'super_admin') {
      return true;
    }

    // Get target user to check their role and agencies
    let targetUser;
    try {
      targetUser = await User.findById(targetUserIdInt);
    } catch (err) {
      console.error('[checkActivityLogPermission] Error fetching target user:', err);
      return false;
    }

    if (!targetUser) {
      console.log('[checkActivityLogPermission] Target user not found:', targetUserIdInt);
      return false;
    }

    // Supervisors can only view activity for assigned supervisees
    if (isRequestingSupervisor) {
      try {
        // Check if supervisor has access to this user (is assigned)
        const supervisorAgencies = await User.getAgencies(requestingUserIdInt);
        for (const agency of supervisorAgencies) {
          const hasAccess = await User.supervisorHasAccess(requestingUserIdInt, targetUserIdInt, agency.id);
          if (hasAccess) {
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error('[checkActivityLogPermission] Error checking supervisor access:', err);
        return false;
      }
    }

    // CPAs can view activity for all users in their agencies
    if (requestingRole === 'clinical_practice_assistant') {
      try {
        if (!['staff', 'provider', 'school_staff', 'facilitator', 'intern'].includes(targetUser.role)) {
          return false;
        }
        // Check if CPA and target user share an agency
        const requestingUserAgencies = await User.getAgencies(requestingUserIdInt);
        const targetUserAgencies = await User.getAgencies(targetUserIdInt);
        
        const requestingAgencyIds = requestingUserAgencies.map(a => a.id);
        const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
        const sharedAgencies = requestingAgencyIds.filter(id => targetUserAgencyIds.includes(id));

        return sharedAgencies.length > 0;
      } catch (err) {
        console.error('[checkActivityLogPermission] Error checking CPA access:', err);
        return false;
      }
    }

    // Admin and support: check if requesting user and target user share an agency
    try {
      const requestingUserAgencies = await User.getAgencies(requestingUserIdInt);
      const targetUserAgencies = await User.getAgencies(targetUserIdInt);
      
      const requestingAgencyIds = requestingUserAgencies.map(a => a.id);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      const sharedAgencies = requestingAgencyIds.filter(id => targetUserAgencyIds.includes(id));

      return sharedAgencies.length > 0;
    } catch (err) {
      console.error('[checkActivityLogPermission] Error checking admin/support access:', err);
      return false;
    }
  } catch (error) {
    console.error('[checkActivityLogPermission] Unexpected error:', error);
    console.error('[checkActivityLogPermission] Error stack:', error.stack);
    return false;
  }
};

/**
 * Get activity log for a specific user
 */
export const getUserActivityLog = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);
    const { actionType, startDate, endDate, limit = 100 } = req.query;

    if (isNaN(userIdInt)) {
      return res.status(400).json({ 
        error: { message: 'Invalid user ID' } 
      });
    }

    console.log(`[getUserActivityLog] Requesting user: ${req.user.id} (${req.user.role}), Target user: ${userIdInt}`);

    // Check permission
    let hasPermission = false;
    try {
      hasPermission = await checkActivityLogPermission(req, userIdInt);
      console.log(`[getUserActivityLog] Permission check result: ${hasPermission}`);
    } catch (permError) {
      console.error('[getUserActivityLog] Error in permission check:', permError);
      return res.status(500).json({ 
        error: { message: 'Error checking permissions', details: permError.message } 
      });
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s activity log' } 
      });
    }

    const filters = {
      userId: userIdInt,
      actionType: actionType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: parseInt(limit) || 100
    };

    console.log(`[getUserActivityLog] Fetching activity log with filters:`, filters);
    let activityLog;
    try {
      activityLog = await UserActivityLog.getActivityForUser(userIdInt, filters);
      console.log(`[getUserActivityLog] Successfully fetched ${activityLog.length} activity log entries`);
    } catch (dbError) {
      console.error('[getUserActivityLog] Database error:', dbError);
      console.error('[getUserActivityLog] Database error details:', {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
        sqlMessage: dbError.sqlMessage,
        sql: dbError.sql
      });
      
      // If it's a column error, return empty array
      if (dbError.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('[getUserActivityLog] Missing database columns, returning empty log');
        activityLog = [];
      } else {
        // For other errors, re-throw to be caught by outer catch
        throw dbError;
      }
    }

    res.json(activityLog);
  } catch (error) {
    console.error('[getUserActivityLog] Unexpected error:', error);
    console.error('[getUserActivityLog] Error stack:', error.stack);
    console.error('[getUserActivityLog] Error details:', {
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      message: error.message
    });
    
    // Return empty array instead of error to prevent UI crash
    // But log the error for debugging
    res.status(200).json([]);
  }
};

/**
 * Get activity summary for a specific user
 */
export const getActivitySummary = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);

    console.log(`[getActivitySummary] Requesting user: ${req.user?.id} (${req.user?.role}), Target user: ${userIdInt}`);

    if (isNaN(userIdInt)) {
      return res.status(400).json({ 
        error: { message: 'Invalid user ID' } 
      });
    }

    // Check permission
    let hasPermission = false;
    try {
      hasPermission = await checkActivityLogPermission(req, userIdInt);
      console.log(`[getActivitySummary] Permission check result: ${hasPermission}`);
    } catch (permError) {
      console.error('[getActivitySummary] Error in permission check:', permError);
      return res.status(500).json({ 
        error: { message: 'Error checking permissions', details: permError.message } 
      });
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s activity summary' } 
      });
    }

    console.log(`[getActivitySummary] Fetching summary for user: ${userIdInt}`);
    let summary;
    try {
      summary = await UserActivityLog.getActivitySummary(userIdInt);
      console.log(`[getActivitySummary] Summary data:`, summary);
    } catch (dbError) {
      console.error('[getActivitySummary] Database error:', dbError);
      console.error('[getActivitySummary] Database error details:', {
        code: dbError.code,
        errno: dbError.errno,
        sqlState: dbError.sqlState,
        sqlMessage: dbError.sqlMessage,
        sql: dbError.sql
      });
      
      // Return default summary instead of error
      summary = {
        totalLogins: 0,
        firstLogin: null,
        lastLogin: null,
        totalModuleTimeSeconds: 0,
        totalSessionTimeSeconds: 0
      };
    }

    res.json(summary);
  } catch (error) {
    console.error('[getActivitySummary] Unexpected error:', error);
    console.error('[getActivitySummary] Error stack:', error.stack);
    
    // Return default summary instead of error to prevent UI crash
    res.status(200).json({
      totalLogins: 0,
      firstLogin: null,
      lastLogin: null,
      totalModuleTimeSeconds: 0,
      totalSessionTimeSeconds: 0
    });
  }
};

/**
 * Get module time breakdown for a specific user
 */
export const getModuleTimeBreakdown = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const userIdInt = parseInt(userId);

    // Check permission
    const hasPermission = await checkActivityLogPermission(req, userIdInt);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: { message: 'You do not have permission to view this user\'s module time breakdown' } 
      });
    }

    const breakdown = await UserActivityLog.getModuleTimeBreakdown(userIdInt);

    res.json(breakdown);
  } catch (error) {
    console.error('Error in getModuleTimeBreakdown:', error);
    next(error);
  }
};

export const getAgencyActivityLog = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const access = await assertAgencyAuditAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const limit = clamp(req.query.limit, 1, 500, 50);
    const offset = clamp(req.query.offset, 0, 200000, 0);
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const source = String(req.query.source || 'all').toLowerCase();
    const diagnostics = { disabled_sources: [] };
    const actionTypes = resolveActionTypes(
      String(req.query.category || '').trim() || null,
      String(req.query.actionType || '').trim() || null
    );
    const filters = {
      agencyId,
      userId: Number.isFinite(userId) ? userId : null,
      actionType: actionTypes?.length === 1 ? actionTypes[0] : null,
      actionTypes: actionTypes,
      startDate: String(req.query.startDate || '').trim() || null,
      endDate: String(req.query.endDate || '').trim() || null,
      search: String(req.query.search || '').trim() || null,
      sortBy: String(req.query.sortBy || '').trim() || 'createdAt',
      sortOrder: String(req.query.sortOrder || '').trim() || 'DESC',
      limit,
      offset
    };
    let items = [];
    let total = 0;
    if (source === 'user_activity') {
      [items, total] = await Promise.all([
        UserActivityLog.getAgencyActivityLog(filters),
        UserActivityLog.countAgencyActivityLog(filters)
      ]);
      items = items.map((r) => normalizeAuditRow({ ...r, log_type: 'user_activity' }));
    } else if (source === 'admin_action') {
      [items, total] = await Promise.all([
        AdminAuditLog.getAgencyAuditLogPaged(filters),
        AdminAuditLog.countAgencyAuditLog(filters)
      ]);
      items = items.map((r) => normalizeAuditRow({ ...r, log_type: 'admin_action' }));
    } else if (source === 'support_ticket') {
      [items, total] = await Promise.all([
        getSupportTicketRows(filters, diagnostics),
        countSupportTicketRows(filters, diagnostics)
      ]);
    } else if (source === 'client_access') {
      [items, total] = await Promise.all([
        getClientAccessRows(filters, diagnostics),
        countClientAccessRows(filters, diagnostics)
      ]);
    } else if (source === 'phi_document') {
      [items, total] = await Promise.all([
        getPhiDocumentRows(filters, diagnostics),
        countPhiDocumentRows(filters, diagnostics)
      ]);
    } else {
      const expandedLimit = Math.min(offset + limit, 5000);
      const scoped = { ...filters, limit: expandedLimit, offset: 0, sortBy: 'createdAt' };
      const [activityRows, adminRows, supportRows, clientAccessRows, phiRows, activityTotal, adminTotal, supportTotal, clientAccessTotal, phiTotal] = await Promise.all([
        UserActivityLog.getAgencyActivityLog(scoped),
        AdminAuditLog.getAgencyAuditLogPaged(scoped),
        getSupportTicketRows(scoped, diagnostics),
        getClientAccessRows(scoped, diagnostics),
        getPhiDocumentRows(scoped, diagnostics),
        UserActivityLog.countAgencyActivityLog(filters),
        AdminAuditLog.countAgencyAuditLog(filters),
        countSupportTicketRows(filters, diagnostics),
        countClientAccessRows(filters, diagnostics),
        countPhiDocumentRows(filters, diagnostics)
      ]);
      total = activityTotal + adminTotal + supportTotal + clientAccessTotal + phiTotal;
      items = [
        ...activityRows.map((r) => normalizeAuditRow({ ...r, log_type: 'user_activity' })),
        ...adminRows.map((r) => normalizeAuditRow({ ...r, log_type: 'admin_action' })),
        ...supportRows,
        ...clientAccessRows,
        ...phiRows
      ]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + limit);
    }

    return res.json({
      items,
      pagination: {
        total,
        limit,
        offset,
        hasNextPage: offset + items.length < total
      },
      diagnostics: {
        disabled_sources: (diagnostics.disabled_sources || []).filter(Boolean)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const exportAgencyActivityLogCsv = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const access = await assertAgencyAuditAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const source = String(req.query.source || 'all').toLowerCase();
    const actionTypes = resolveActionTypes(
      String(req.query.category || '').trim() || null,
      String(req.query.actionType || '').trim() || null
    );
    const filters = {
      agencyId,
      userId: Number.isFinite(userId) ? userId : null,
      actionType: actionTypes?.length === 1 ? actionTypes[0] : null,
      actionTypes,
      startDate: String(req.query.startDate || '').trim() || null,
      endDate: String(req.query.endDate || '').trim() || null,
      search: String(req.query.search || '').trim() || null,
      sortBy: String(req.query.sortBy || '').trim() || 'createdAt',
      sortOrder: String(req.query.sortOrder || '').trim() || 'DESC',
      limit: 10000,
      offset: 0
    };
    let rows = [];
    if (source === 'user_activity') {
      rows = (await UserActivityLog.getAgencyActivityLog(filters)).map((r) => normalizeAuditRow({ ...r, log_type: 'user_activity' }));
    } else if (source === 'admin_action') {
      rows = (await AdminAuditLog.getAgencyAuditLogPaged(filters)).map((r) => normalizeAuditRow({ ...r, log_type: 'admin_action' }));
    } else if (source === 'support_ticket') {
      rows = await getSupportTicketRows(filters);
    } else if (source === 'client_access') {
      rows = await getClientAccessRows(filters);
    } else if (source === 'phi_document') {
      rows = await getPhiDocumentRows(filters);
    } else {
      const [activityRows, adminRows, supportRows, clientAccessRows, phiRows] = await Promise.all([
        UserActivityLog.getAgencyActivityLog(filters),
        AdminAuditLog.getAgencyAuditLogPaged(filters),
        getSupportTicketRows(filters),
        getClientAccessRows(filters),
        getPhiDocumentRows(filters)
      ]);
      rows = [
        ...activityRows.map((r) => normalizeAuditRow({ ...r, log_type: 'user_activity' })),
        ...adminRows.map((r) => normalizeAuditRow({ ...r, log_type: 'admin_action' })),
        ...supportRows,
        ...clientAccessRows,
        ...phiRows
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const headers = [
      'log_type',
      'timestamp_utc',
      'agency_id',
      'agency_name',
      'user_id',
      'user_name',
      'user_email',
      'client_id',
      'client_initials',
      'client_full_name',
      'client_type',
      'action_type',
      'action_label',
      'category',
      'module_id',
      'module_title',
      'duration_seconds',
      'ip_address',
      'session_id',
      'source_label',
      'link_path',
      'metadata'
    ];

    const lines = [headers.join(',')];
    for (const row of rows) {
      const userName = `${row.user_first_name || ''} ${row.user_last_name || ''}`.trim();
      const actionLabel = auditActionRegistry.getActionLabel(row.action_type);
      const category = auditActionRegistry.getActionCategory(row.action_type);
      lines.push([
        csvEscape(row.log_type || 'user_activity'),
        csvEscape(row.created_at ? new Date(row.created_at).toISOString() : ''),
        csvEscape(row.agency_id),
        csvEscape(row.agency_name),
        csvEscape(row.user_id),
        csvEscape(userName),
        csvEscape(row.user_email),
        csvEscape(row.client_id),
        csvEscape(row.client_initials),
        csvEscape(row.client_full_name),
        csvEscape(row.client_type),
        csvEscape(row.action_type),
        csvEscape(actionLabel),
        csvEscape(category),
        csvEscape(row.module_id),
        csvEscape(row.module_title),
        csvEscape(row.duration_seconds),
        csvEscape(row.ip_address),
        csvEscape(row.session_id),
        csvEscape(row.source_label || sourceLabel[row.log_type] || ''),
        csvEscape(row.link_path || ''),
        csvEscape(row.metadata ? JSON.stringify(row.metadata) : '')
      ].join(','));
    }

    const fileAgency = String(agencyId);
    const filename = `audit-center-agency-${fileAgency}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(lines.join('\n'));
  } catch (error) {
    next(error);
  }
};
