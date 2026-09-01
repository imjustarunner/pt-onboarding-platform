import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sessionMatchKey(row = {}) {
  const oe = Number(row.officeEventId || row.office_event_id || 0);
  if (oe > 0) return `oe:${oe}`;
  const cs = Number(row.clinicalSessionId || row.clinical_session_id || 0);
  if (cs > 0) return `cs:${cs}`;
  const cid = Number(row.clientId || row.client_id || 0);
  const dos = String(row.dateOfService || row.date_of_service || row.date || '').slice(0, 10);
  const raw = String(row.serviceCode || row.service_code || '').toUpperCase();
  const m = raw.match(/\b(90\d{3}|H\d{4}|T\d{4}|G\d{4})\b/);
  let code = m ? m[1] : '';
  if (/^9083[24789]$/.test(code)) code = '90837';
  if (cid && dos && code) return `cdc:${cid}:${dos}:${code}`;
  if (cid && dos) return `cd:${cid}:${dos}`;
  return null;
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function initialsFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const parts = raw.replace(/,/g, ' ').split(/\s+/).filter((p) => /[A-Za-z]/.test(p) && !/^(iv|iii|ii|jr|sr)$/i.test(p));
  if (!parts.length) return raw.slice(0, 3).toUpperCase();
  if (parts.length === 1) return `${parts[0].slice(0, 1).toUpperCase()}.`;
  return `${parts[0].slice(0, 1).toUpperCase()}. ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

async function attachClientLabels(sessions = []) {
  const ids = [...new Set((sessions || []).map((s) => Number(s.clientId || 0)).filter((n) => n > 0))];
  if (!ids.length) return sessions;
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.full_name, c.initials, a.name AS agency_name
       FROM clients c
       LEFT JOIN agencies a ON a.id = c.agency_id
       WHERE c.id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byId = new Map((rows || []).map((r) => [Number(r.id), r]));
    return sessions.map((s) => {
      const c = byId.get(Number(s.clientId || 0));
      if (!c) return s;
      const full = String(c.full_name || '').trim();
      const initials = String(c.initials || '').trim() || initialsFromName(full);
      return {
        ...s,
        clientName: full || s.clientName || null,
        client_full_name: full || s.client_full_name || null,
        initials: initials || s.initials || null,
        agencyName: c.agency_name || s.agencyName || null
      };
    });
  } catch {
    return sessions;
  }
}

/**
 * Signed clinical notes used to retire leftover Note Aid drafts and mark
 * matching work-queue items done.
 */
export async function listSignedNoteSessions({ userId = null, clientIds = [], limit = 400 } = {}) {
  const uid = safeInt(userId);
  const cids = [...new Set((clientIds || []).map(safeInt).filter(Boolean))];
  if (!uid && !cids.length) return [];
  const lim = Math.max(1, Math.min(800, Number(limit) || 400));
  const where = ['n.is_deleted = 0', 'n.provider_signed_at IS NOT NULL'];
  const params = [];
  if (cids.length && uid) {
    where.push(`(n.created_by_user_id = ? OR n.client_id IN (${cids.map(() => '?').join(',')}))`);
    params.push(uid, ...cids);
  } else if (cids.length) {
    where.push(`n.client_id IN (${cids.map(() => '?').join(',')})`);
    params.push(...cids);
  } else {
    where.push('n.created_by_user_id = ?');
    params.push(uid);
  }

  try {
    const [rows] = await clinicalPool.execute(
      `SELECT n.id, n.client_id, n.clinical_session_id, n.provider_signed_at, n.metadata_json,
              n.created_at, cs.service_code, cs.scheduled_start_at, cs.office_event_id
       FROM clinical_notes n
       LEFT JOIN clinical_sessions cs ON cs.id = n.clinical_session_id
       WHERE ${where.join(' AND ')}
       ORDER BY n.provider_signed_at DESC
       LIMIT ${lim}`,
      params
    );
    const sessions = (rows || []).map((r) => {
      const meta = parseMeta(r.metadata_json);
      const dos = String(meta.dateOfService || r.scheduled_start_at || r.created_at || '').slice(0, 10);
      return {
        noteId: r.id,
        clientId: r.client_id,
        clinicalSessionId: r.clinical_session_id || null,
        officeEventId: r.office_event_id || meta.officeEventId || null,
        dateOfService: dos,
        serviceCode: r.service_code || meta.serviceCode || null,
        signedAt: r.provider_signed_at,
        draftId: safeInt(meta.draftId) || null
      };
    });
    return attachClientLabels(sessions);
  } catch (e) {
    console.warn('[listSignedNoteSessions]', e?.message || e);
    return [];
  }
}

export { sessionMatchKey };
export default { listSignedNoteSessions, sessionMatchKey };
