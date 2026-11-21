import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';

const reviewRoles = new Set(['admin', 'super_admin', 'support', 'staff']);
const linkRoles = new Set(['admin', 'super_admin', 'support']);
const chartRoles = new Set([...reviewRoles, 'provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant']);
const fail = (status, message) => Object.assign(new Error(message), { status });

export async function clientDuplicateReviewAgencies(user) {
  if (!reviewRoles.has(user?.role)) throw fail(403, 'Client duplicate review requires staff access.');
  if (user.role === 'super_admin') {
    const [agencies] = await pool.execute('SELECT id, name FROM agencies WHERE COALESCE(is_archived, 0) = 0 ORDER BY name');
    return agencies.map(a => ({ id: Number(a.id), name: a.name }));
  }
  const agencies = await User.getAgencies(user.id);
  return agencies.filter(a => !a.is_platform_access_only && !a.is_legacy_access_only)
    .map(a => ({ id: Number(a.id), name: a.name }));
}

async function loadReviewRecords(db, ids, lock = false) {
  const [rows] = await db.execute(`SELECT c.id, c.status, c.agency_id, a.name AS agency_name, i.identity_id
    FROM clients c JOIN agencies a ON a.id=c.agency_id
    LEFT JOIN client_chart_identity_members i ON i.client_id=c.id
    WHERE c.id IN (${ids.map(() => '?').join(',')}) ORDER BY c.id${lock ? ' FOR UPDATE' : ''}`, ids);
  return rows;
}

function assertReviewableRecords(rows, allowed, expectedCount) {
  if (rows.length !== expectedCount || rows.some(row => !allowed.has(Number(row.agency_id)))) {
    throw fail(403, 'Access to every selected client chart is required.');
  }
  if (rows.some(row => String(row.status).toUpperCase() === 'ARCHIVED')) {
    throw fail(409, 'Choose active client charts.');
  }
}

export async function reviewClientChartIdentity(user, keepId, sourceIds) {
  if (!linkRoles.has(user?.role)) throw fail(403, 'Client identity review requires merge access.');
  const ids = [...new Set([keepId, ...sourceIds].map(Number))];
  if (ids.length < 2 || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw fail(400, 'Select 2–20 valid client records.');
  }
  const allowed = new Set((await clientDuplicateReviewAgencies(user)).map(a => a.id));
  const records = await loadReviewRecords(pool, ids);
  assertReviewableRecords(records, allowed, ids.length);
  return { ids, records, allowed, crossAgency: new Set(records.map(record => Number(record.agency_id))).size > 1 };
}

export async function linkClientChartIdentity({ review, actorUserId }) {
  if (!review.crossAgency) throw fail(409, 'Choose records from different agencies to link.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const records = await loadReviewRecords(db, review.ids, true);
    assertReviewableRecords(records, review.allowed, review.ids.length);
    if (records.some(row => Number(row.agency_id) !== Number(review.records.find(prior => Number(prior.id) === Number(row.id))?.agency_id))) {
      throw fail(409, 'An agency assignment changed. Reopen the duplicate review.');
    }
    const existing = [...new Set(records.map(record => record.identity_id).filter(Boolean))];
    if (existing.length > 1) throw fail(409, 'The selected charts already belong to different linked sets.');
    const identityId = existing[0] || randomUUID();
    if (existing.length) {
      const [linked] = await db.execute(`SELECT c.agency_id FROM client_chart_identity_members i
        JOIN clients c ON c.id=i.client_id WHERE i.identity_id=? FOR UPDATE`, [identityId]);
      if (linked.some(row => !review.allowed.has(Number(row.agency_id)))) {
        throw fail(403, 'Access to every chart in an existing link is required.');
      }
    }
    for (const chart of records.filter(row => !row.identity_id)) {
      await db.execute('INSERT INTO client_chart_identity_members (client_id, identity_id) VALUES (?, ?)', [chart.id, identityId]);
      await db.execute(`INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, to_value, note)
        VALUES (?, ?, 'linked_client_identity', ?, 'Confirmed duplicate charts across agencies')`,
      [chart.id, actorUserId, identityId]);
    }
    await db.commit();
    return { linked: true };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function listLinkedClientCharts(user, clientId) {
  if (!chartRoles.has(user?.role)) throw fail(403, 'Client chart access is required.');
  const [[source]] = await pool.execute(`SELECT c.id, c.agency_id, c.organization_id, c.provider_id FROM clients c
    WHERE c.id=? AND COALESCE(c.status,'')<>'ARCHIVED'`, [clientId]);
  if (!source) throw fail(404, 'Client chart unavailable.');
  const access = await resolveClientRecordAccess({ userId: user.id, role: user.role, client: source });
  if (!access.ok) throw fail(access.status, access.message);
  const [rows] = await pool.execute(`SELECT c.id, c.agency_id, c.organization_id, c.provider_id,
    a.name AS agency_name, a.slug AS agency_slug
    FROM client_chart_identity_members opened
    JOIN client_chart_identity_members other ON other.identity_id=opened.identity_id
    JOIN clients c ON c.id=other.client_id
    JOIN agencies a ON a.id=c.agency_id
    WHERE opened.client_id=? AND c.id<>opened.client_id AND COALESCE(c.status,'')<>'ARCHIVED'
    ORDER BY a.name, c.id`, [clientId]);
  const permitted = [];
  for (const row of rows) {
    const result = await resolveClientRecordAccess({ userId: user.id, role: user.role, client: row });
    if (result.ok) permitted.push({ id: row.id, agencyId: row.agency_id, agencyName: row.agency_name, agencySlug: row.agency_slug });
  }
  return permitted;
}
