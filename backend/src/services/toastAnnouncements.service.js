import pool from '../config/database.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const DAY = 86400000;

export function requireToastOperator(ctx) {
  if (!ctx.profile?.operator) throw fail(403, 'AuricWell operator access required.');
}

export function practiceToastAgency(ctx, manage = false) {
  if (ctx.actorType !== 'staff') throw fail(403, 'Staff access required.');
  if (manage && !ctx.permissions?.includes('admin') && !ctx.permissions?.includes('announcements') && !ctx.profile?.operator) {
    throw fail(403, 'Practice admin or support announcements permission required.');
  }
  if (!ctx.agencyId) throw fail(409, 'Practice agency is not configured.');
  return ctx.agencyId;
}

export function validateToast(input, now = Date.now()) {
  if ((input.display_type || input.displayType || 'toast') !== 'toast') {
    throw fail(400, 'Only toast announcements are supported here.');
  }
  const title = String(input.title || '').trim();
  const message = String(input.message || '').trim();
  const publishStatus = input.publish_status || 'published';
  if (!['draft', 'published'].includes(publishStatus)) throw fail(400, 'Choose draft or published.');
  if (title.length > 255 || message.length > 1200) throw fail(400, 'Title or message is too long.');
  if (!message && publishStatus !== 'draft') throw fail(400, 'Message is required.');
  const startsAt = new Date(input.starts_at || '');
  const endsAt = new Date(input.ends_at || '');
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw fail(400, 'Choose a valid start and a later end time.');
  }
  if (endsAt - startsAt > 14 * DAY) throw fail(400, 'Announcements may last at most two weeks.');
  if (startsAt.getTime() > now + 730 * DAY) throw fail(400, 'Schedule announcements within the next two years.');
  return { title, message, publishStatus, startsAt, endsAt };
}

// Every mutation derives scope from the authenticated route, never from request data.
export function toastScope(agencyId) {
  if (agencyId == null) return { sql: "agency_id IS NULL AND delivery_scope = 'auricwell_support'", args: [] };
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) throw fail(400, 'Invalid agency.');
  return { sql: "agency_id = ? AND delivery_scope = 'agency'", args: [Number(agencyId)] };
}

const generalToast = "display_type = 'toast' AND audience IN ('everyone', 'all_staff') AND (recipient_user_ids IS NULL OR JSON_LENGTH(recipient_user_ids) = 0)";

export async function listToasts({ agencyId = null, active = false, includeSupport = false }, db = pool) {
  const scope = toastScope(agencyId);
  const where = includeSupport && agencyId != null
    ? `(${scope.sql}) OR (agency_id IS NULL AND delivery_scope = 'auricwell_support')`
    : scope.sql;
  const [rows] = await db.execute(
    `SELECT id, title, message, display_type, starts_at, ends_at, updated_at, publish_status, delivery_scope
     FROM agency_scheduled_announcements WHERE (${where}) AND ${generalToast}
     ${active ? "AND publish_status = 'published' AND starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()" : ''}
     ORDER BY starts_at DESC, id DESC`, scope.args
  );
  return rows;
}

export async function saveToast({ agencyId = null, userId = null, accountId = null, id = null, input }, db = pool) {
  const value = validateToast(input);
  const scope = toastScope(agencyId);
  const params = [value.title, value.message, value.startsAt, value.endsAt, value.publishStatus];
  if (id != null) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw fail(400, 'Invalid announcement.');
    const [result] = await db.execute(
      `UPDATE agency_scheduled_announcements SET title = ?, message = ?, starts_at = ?, ends_at = ?, publish_status = ?
       WHERE id = ? AND (${scope.sql}) AND ${generalToast}`, [...params, Number(id), ...scope.args]
    );
    if (!result.affectedRows) throw fail(404, 'Announcement not found.');
    return { id: Number(id) };
  }
  const [result] = await db.execute(
    `INSERT INTO agency_scheduled_announcements
      (title, message, starts_at, ends_at, publish_status, agency_id, created_by_user_id,
       created_by_auricwell_account_id, delivery_scope, display_type, audience, recipient_user_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'toast', 'everyone', JSON_ARRAY())`,
    [...params, agencyId, userId, accountId, agencyId == null ? 'auricwell_support' : 'agency']
  );
  return { id: result.insertId };
}

export async function deleteToast({ agencyId = null, id }, db = pool) {
  const scope = toastScope(agencyId);
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw fail(400, 'Invalid announcement.');
  const [result] = await db.execute(
    `DELETE FROM agency_scheduled_announcements WHERE id = ? AND (${scope.sql}) AND ${generalToast}`,
    [Number(id), ...scope.args]
  );
  if (!result.affectedRows) throw fail(404, 'Announcement not found.');
  return { deleted: true };
}
