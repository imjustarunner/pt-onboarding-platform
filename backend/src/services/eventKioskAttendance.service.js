import pool from '../config/database.js';
import StorageService from './storage.service.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

function normalizeYmd(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return '';
    return input.toISOString().slice(0, 10);
  }
  const m = String(input).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function displayName(first, last, fallback = '') {
  const n = `${String(first || '').trim()} ${String(last || '').trim()}`.trim();
  return n || fallback;
}

/**
 * Event portal: kiosk station check-ins + client release log for an event.
 */
export async function listEventKioskAttendanceForPortal(eventId, agencyId, { kioskDate = null } = {}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  if (!eid || !aid) return { clientRows: [], employeeRows: [], dates: [] };

  const dateFilter = normalizeYmd(kioskDate);
  const checkinParams = [eid, aid];
  let checkinDateSql = '';
  if (dateFilter) {
    checkinDateSql = ' AND edk.kiosk_date = ?';
    checkinParams.push(dateFilter);
  }

  let checkinRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT edk.id, edk.client_id, edk.user_id, edk.person_type, edk.action,
              edk.checked_in_at, edk.checked_out_at, edk.kiosk_date, edk.ip_address,
              c.full_name AS client_full_name, c.initials AS client_initials, c.identifier_code,
              u.first_name AS user_first_name, u.last_name AS user_last_name, u.profile_photo_path
       FROM event_day_kiosk_checkins edk
       LEFT JOIN clients c ON c.id = edk.client_id
       LEFT JOIN users u ON u.id = edk.user_id
       WHERE edk.company_event_id = ? AND edk.agency_id = ?${checkinDateSql}
       ORDER BY edk.kiosk_date DESC, edk.checked_in_at DESC, edk.id DESC`,
      checkinParams
    );
    checkinRows = rows || [];
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  const releaseParams = [eid, aid];
  let releaseDateSql = '';
  if (dateFilter) {
    releaseDateSql = ' AND DATE(r.signed_at) = ?';
    releaseParams.push(dateFilter);
  }

  let releaseRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.client_id, r.released_to_name, r.released_to_relationship, r.released_to_phone,
              r.walk_home_alone, r.signer_signature_source_method, r.signed_at, r.signed_ip,
              r.photo_storage_key, r.notes,
              c.full_name AS client_full_name, c.initials AS client_initials, c.identifier_code
       FROM company_event_releases r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.company_event_id = ? AND r.agency_id = ?${releaseDateSql}
       ORDER BY r.signed_at DESC, r.id DESC`,
      releaseParams
    );
    releaseRows = rows || [];
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  const dateSet = new Set();
  for (const r of checkinRows) {
    const d = normalizeYmd(r.kiosk_date);
    if (d) dateSet.add(d);
  }
  for (const r of releaseRows) {
    const d = normalizeYmd(r.signed_at);
    if (d) dateSet.add(d);
  }

  const clientMap = new Map();
  for (const r of checkinRows) {
    if (String(r.person_type) !== 'client' || !r.client_id) continue;
    const cid = Number(r.client_id);
    const day = normalizeYmd(r.kiosk_date);
    if (!cid || !day) continue;
    const key = `${cid}:${day}`;
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        clientId: cid,
        clientName: r.client_full_name || r.client_initials || `Client #${cid}`,
        clientInitials: r.client_initials || null,
        identifierCode: r.identifier_code || null,
        kioskDate: day,
        checkInAt: null,
        checkOutAt: null,
        release: null
      });
    }
    const row = clientMap.get(key);
    if (r.checked_in_at && (!row.checkInAt || new Date(r.checked_in_at) < new Date(row.checkInAt))) {
      row.checkInAt = r.checked_in_at;
    }
    if (r.checked_out_at) {
      row.checkOutAt = r.checked_out_at;
    }
    if (String(r.action) === 'check_out' && r.checked_out_at) {
      row.checkOutAt = r.checked_out_at;
    }
  }

  for (const r of releaseRows) {
    const cid = Number(r.client_id);
    const day = normalizeYmd(r.signed_at);
    if (!cid || !day) continue;
    const key = `${cid}:${day}`;
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        clientId: cid,
        clientName: r.client_full_name || r.client_initials || `Client #${cid}`,
        clientInitials: r.client_initials || null,
        identifierCode: r.identifier_code || null,
        kioskDate: day,
        checkInAt: null,
        checkOutAt: null,
        release: null
      });
    }
    const row = clientMap.get(key);
    if (!row.release || new Date(r.signed_at) > new Date(row.release.signedAt)) {
      row.release = {
        id: Number(r.id),
        releasedToName: r.released_to_name || null,
        releasedToRelationship: r.released_to_relationship || null,
        releasedToPhone: r.released_to_phone || null,
        walkHomeAlone: !!(r.walk_home_alone === 1 || r.walk_home_alone === true),
        signerSourceMethod: r.signer_signature_source_method || null,
        signedAt: r.signed_at,
        signedIp: r.signed_ip || null,
        notes: r.notes || null,
        hasPhoto: !!r.photo_storage_key
      };
      row.checkOutAt = row.checkOutAt || r.signed_at;
    }
  }

  const employeeMap = new Map();
  for (const r of checkinRows) {
    if (String(r.person_type) !== 'employee' || !r.user_id) continue;
    const uid = Number(r.user_id);
    const day = normalizeYmd(r.kiosk_date);
    if (!uid || !day) continue;
    const key = `${uid}:${day}`;
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        userId: uid,
        displayName: displayName(r.user_first_name, r.user_last_name, `Staff #${uid}`),
        firstName: r.user_first_name || null,
        lastName: r.user_last_name || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path || null),
        kioskDate: day,
        checkInAt: null,
        checkOutAt: null,
        status: 'checked_in'
      });
    }
    const row = employeeMap.get(key);
    if (r.checked_in_at && (!row.checkInAt || new Date(r.checked_in_at) < new Date(row.checkInAt))) {
      row.checkInAt = r.checked_in_at;
    }
    if (r.checked_out_at) {
      row.checkOutAt = r.checked_out_at;
    }
    if (String(r.action) === 'check_out') {
      row.checkOutAt = row.checkOutAt || r.checked_out_at;
      row.status = 'checked_out';
    }
  }

  const clientRows = [...clientMap.values()].sort((a, b) => {
    const dc = String(b.kioskDate).localeCompare(String(a.kioskDate));
    if (dc !== 0) return dc;
    return String(a.clientName).localeCompare(String(b.clientName));
  });

  const employeeRows = [...employeeMap.values()].sort((a, b) => {
    const dc = String(b.kioskDate).localeCompare(String(a.kioskDate));
    if (dc !== 0) return dc;
    return String(a.displayName).localeCompare(String(b.displayName));
  });

  return {
    clientRows,
    employeeRows,
    dates: [...dateSet].sort((a, b) => b.localeCompare(a))
  };
}

export async function loadEventReleasePhotoForPortal(releaseId, eventId, agencyId) {
  const rid = Number(releaseId);
  const eid = Number(eventId);
  const aid = Number(agencyId);
  if (!rid || !eid || !aid) return null;

  const [rows] = await pool.execute(
    `SELECT id, company_event_id, agency_id, client_id,
            photo_storage_key, photo_content_type,
            photo_encryption_key_id, photo_encryption_wrapped_key_b64,
            photo_encryption_iv_b64, photo_encryption_auth_tag_b64, photo_encryption_aad
     FROM company_event_releases
     WHERE id = ? AND company_event_id = ? AND agency_id = ?
     LIMIT 1`,
    [rid, eid, aid]
  );
  const row = rows?.[0];
  if (!row?.photo_storage_key) return null;

  const encryptedBuffer = await StorageService.readObject(row.photo_storage_key);
  const decryptedBuffer = await DocumentEncryptionService.decryptBuffer({
    encryptedBuffer,
    encryptionKeyId: row.photo_encryption_key_id,
    encryptionWrappedKeyB64: row.photo_encryption_wrapped_key_b64,
    encryptionIvB64: row.photo_encryption_iv_b64,
    encryptionAuthTagB64: row.photo_encryption_auth_tag_b64,
    aad: row.photo_encryption_aad
  });

  return {
    buffer: decryptedBuffer,
    contentType: row.photo_content_type || 'image/jpeg'
  };
}
