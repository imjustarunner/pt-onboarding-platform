/**
 * School-events kiosk staff photos for marketing (table setup / at-table shots).
 */
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function decodePhotoBase64(photoRaw) {
  const raw = String(photoRaw || '').trim();
  if (!raw) return null;
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const contentType = m ? m[1] : 'image/jpeg';
  const b64 = m ? m[2] : raw.replace(/^data:[^;]+;base64,/, '');
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/** List marketing / kiosk staff photos for an event (portal Photos section). */
export async function listSchoolEventStaffPhotosForEvent(companyEventId) {
  const eventId = parsePositiveInt(companyEventId);
  if (!eventId) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.agency_id, p.company_event_id, p.provider_user_id,
              p.photo_path, p.photo_url, p.uploaded_via, p.bypassed, p.bypass_acknowledged, p.created_at,
              TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS provider_name,
              u.email AS provider_email
       FROM school_event_staff_photos p
       LEFT JOIN users u ON u.id = p.provider_user_id
       WHERE p.company_event_id = ?
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 200`,
      [eventId]
    );
    return (rows || []).map((r) => {
      const bypassed = Number(r.bypassed) === 1;
      const url = bypassed
        ? null
        : (r.photo_url || publicUploadsUrlFromStoredPath(r.photo_path) || null);
      return {
        id: Number(r.id),
        agencyId: Number(r.agency_id),
        companyEventId: Number(r.company_event_id),
        providerUserId: Number(r.provider_user_id) || null,
        providerName: String(r.provider_name || '').trim() || null,
        providerEmail: r.provider_email || null,
        photoUrl: url,
        photoPath: r.photo_path || null,
        uploadedVia: r.uploaded_via || null,
        bypassed,
        bypassAcknowledged: Number(r.bypass_acknowledged) === 1,
        createdAt: r.created_at
      };
    });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/** Resolve company_event_id from a school_event_staff_photos row id (notification deeplinks). */
export async function getCompanyEventIdForStaffPhoto(photoId) {
  const id = parsePositiveInt(photoId);
  if (!id) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT company_event_id FROM school_event_staff_photos WHERE id = ? LIMIT 1`,
      [id]
    );
    return parsePositiveInt(rows?.[0]?.company_event_id);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

export async function getSchoolEventPhotoStatus({ companyEventId, providerUserId }) {
  const eventId = parsePositiveInt(companyEventId);
  const userId = parsePositiveInt(providerUserId);
  if (!eventId || !userId) return { hasPhoto: false, photoUrl: null, bypassed: false };

  try {
    const [rows] = await pool.execute(
      `SELECT id, photo_url, photo_path, bypassed
       FROM school_event_staff_photos
       WHERE company_event_id = ? AND provider_user_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      [eventId, userId]
    );
    const list = rows || [];
    const photoRow = list.find((r) => !Number(r.bypassed) && (r.photo_path || r.photo_url));
    if (photoRow) {
      const url = photoRow.photo_url || publicUploadsUrlFromStoredPath(photoRow.photo_path);
      return { hasPhoto: true, photoUrl: url, bypassed: false, photoId: Number(photoRow.id) };
    }
    const bypassRow = list.find((r) => Number(r.bypassed) === 1);
    if (bypassRow) {
      return { hasPhoto: false, photoUrl: null, bypassed: true, photoId: Number(bypassRow.id) };
    }
    return { hasPhoto: false, photoUrl: null, bypassed: false };
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { hasPhoto: false, photoUrl: null, bypassed: false, tableMissing: true };
    }
    throw err;
  }
}

export async function listMarketingContactUserIds(agencyId) {
  const aid = parsePositiveInt(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT ua.user_id
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND ua.is_marketing_contact = 1
         AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(COALESCE(u.status, '')) = 'active')`,
      [aid]
    );
    return (rows || []).map((r) => Number(r.user_id)).filter((n) => n > 0);
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/** Returns IDs of admin/support/CPA/provider_plus active users in the agency. */
async function listEventPhotoManagerUserIds(agencyId) {
  const aid = parsePositiveInt(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.role IN ('super_admin','admin','support','provider_plus','clinical_practice_assistant')
         AND (u.status = 'ACTIVE_EMPLOYEE' OR LOWER(COALESCE(u.status,'')) = 'active')`,
      [aid]
    );
    return (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  } catch {
    return [];
  }
}

async function notifyMarketingContacts({
  agencyId,
  type,
  title,
  message,
  actorUserId,
  relatedEntityId,
  companyEventId = null
}) {
  const [marketingIds, managerIds] = await Promise.all([
    listMarketingContactUserIds(agencyId),
    listEventPhotoManagerUserIds(agencyId)
  ]);
  const userIds = [...new Set([...marketingIds, ...managerIds])];
  const eventId = parsePositiveInt(companyEventId) || null;
  for (const userId of userIds) {
    try {
      await createNotificationAndDispatch({
        type,
        severity: 'info',
        title,
        message,
        userId,
        agencyId,
        // Deeplink to the company event portal Photos section (not the budget portal).
        relatedEntityType: eventId ? 'company_event' : 'school_event_staff_photo',
        relatedEntityId: eventId || relatedEntityId || null,
        actorUserId: actorUserId || null,
        actorSource: 'school_events_kiosk'
      });
    } catch (err) {
      console.warn('[school-event-photo] marketing notify failed', err?.message || err);
    }
  }
  return userIds.length;
}

export async function saveSchoolEventStaffPhoto({
  agencyId,
  companyEventId,
  providerUserId,
  photoBase64,
  uploadedVia = 'mid_shift',
  eventTitle = null,
  staffDisplayName = null
}) {
  const aid = parsePositiveInt(agencyId);
  const eventId = parsePositiveInt(companyEventId);
  const userId = parsePositiveInt(providerUserId);
  if (!aid || !eventId || !userId) {
    return { error: { status: 400, message: 'agencyId, event, and user are required' } };
  }

  const decoded = decodePhotoBase64(photoBase64);
  if (!decoded) {
    return { error: { status: 400, message: 'A valid photo is required' } };
  }

  const ext = decoded.contentType.includes('png') ? 'png' : 'jpg';
  const stored = await StorageService.saveSchoolEventStaffPhoto({
    agencyId: aid,
    eventId,
    userId,
    fileBuffer: decoded.buffer,
    filename: `event-${eventId}-user-${userId}.${ext}`,
    contentType: decoded.contentType
  });

  const photoUrl = publicUploadsUrlFromStoredPath(stored.path || stored.key);
  const via = String(uploadedVia || 'mid_shift').slice(0, 32);

  let insertId;
  try {
    const [ins] = await pool.execute(
      `INSERT INTO school_event_staff_photos
       (agency_id, company_event_id, provider_user_id, photo_path, photo_url, uploaded_via, bypassed, bypass_acknowledged)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [aid, eventId, userId, stored.path || stored.key, photoUrl, via]
    );
    insertId = Number(ins.insertId);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 503, message: 'Run migration 1025 for school event photos' } };
    }
    throw err;
  }

  const who = String(staffDisplayName || 'A staff member').trim() || 'A staff member';
  const what = String(eventTitle || 'School event').trim() || 'School event';
  await notifyMarketingContacts({
    agencyId: aid,
    type: 'school_event_marketing_photo',
    title: 'School event photo ready',
    message: `${who} uploaded a marketing photo for “${what}”. ${photoUrl || ''}`.trim(),
    actorUserId: userId,
    relatedEntityId: insertId,
    companyEventId: eventId
  });

  return { ok: true, photoId: insertId, photoUrl, hasPhoto: true };
}

export async function recordSchoolEventPhotoBypass({
  agencyId,
  companyEventId,
  providerUserId,
  eventTitle = null,
  staffDisplayName = null
}) {
  const aid = parsePositiveInt(agencyId);
  const eventId = parsePositiveInt(companyEventId);
  const userId = parsePositiveInt(providerUserId);
  if (!aid || !eventId || !userId) {
    return { error: { status: 400, message: 'agencyId, event, and user are required' } };
  }

  let insertId;
  try {
    const [ins] = await pool.execute(
      `INSERT INTO school_event_staff_photos
       (agency_id, company_event_id, provider_user_id, photo_path, photo_url, uploaded_via, bypassed, bypass_acknowledged)
       VALUES (?, ?, ?, NULL, NULL, 'bypass_ack', 1, 1)`,
      [aid, eventId, userId]
    );
    insertId = Number(ins.insertId);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 503, message: 'Run migration 1025 for school event photos' } };
    }
    throw err;
  }

  const who = String(staffDisplayName || 'A staff member').trim() || 'A staff member';
  const what = String(eventTitle || 'School event').trim() || 'School event';
  await notifyMarketingContacts({
    agencyId: aid,
    type: 'school_event_marketing_photo_missing',
    title: 'School event photo not provided',
    message: `${who} checked out of “${what}” without a marketing photo and acknowledged that the marketing team would be notified.`,
    actorUserId: userId,
    relatedEntityId: insertId,
    companyEventId: eventId
  });

  return { ok: true, photoId: insertId, bypassed: true };
}

/**
 * Ensure photo requirement is met before checkout. May save a photo or record bypass.
 */
export async function ensureSchoolEventPhotoForCheckout({
  agencyId,
  companyEventId,
  providerUserId,
  photoBase64,
  bypassPhoto,
  bypassAcknowledged,
  eventTitle,
  staffDisplayName
}) {
  const status = await getSchoolEventPhotoStatus({ companyEventId, providerUserId });
  if (status.tableMissing) {
    return { error: { status: 503, message: 'Run migration 1025 for school event photos' } };
  }
  if (status.hasPhoto) {
    return { ok: true, alreadyHadPhoto: true, photoUrl: status.photoUrl };
  }

  if (photoBase64) {
    return saveSchoolEventStaffPhoto({
      agencyId,
      companyEventId,
      providerUserId,
      photoBase64,
      uploadedVia: 'checkout',
      eventTitle,
      staffDisplayName
    });
  }

  const bypass =
    bypassPhoto === true ||
    bypassPhoto === 1 ||
    String(bypassPhoto || '').toLowerCase() === 'true';
  const ack =
    bypassAcknowledged === true ||
    bypassAcknowledged === 1 ||
    String(bypassAcknowledged || '').toLowerCase() === 'true';

  if (bypass && ack) {
    return recordSchoolEventPhotoBypass({
      agencyId,
      companyEventId,
      providerUserId,
      eventTitle,
      staffDisplayName
    });
  }

  return {
    error: {
      status: 400,
      message:
        'Please upload a photo of the table setup (or yourself at the table) for marketing, or acknowledge that you cannot provide one.',
      code: 'SCHOOL_EVENT_PHOTO_REQUIRED'
    }
  };
}
