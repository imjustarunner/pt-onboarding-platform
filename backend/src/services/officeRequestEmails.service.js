import pool from "../config/database.js";
import User from "../models/User.model.js";
import OfficeLocationAgency from "../models/OfficeLocationAgency.model.js";
import StorageService from "./storage.service.js";
import { resolveMeetingRecipient } from "./meetingRecipientIdentity.service.js";
import { tenantMeetingBase } from "../utils/tenantMeetingUrl.js";
import { sendNotificationEmail } from "./unifiedEmail/unifiedEmailSender.service.js";
import { buildOfficeRequestEmail } from "./officeRequestEmailContent.js";
import { parseUtcDate } from "../utils/officeEventDateTime.util.js";
import { recurrenceLabel } from "../utils/scheduleRecurrence.js";

const managers = new Set([
  "super_admin",
  "superadmin",
  "admin",
  "support",
  "staff",
  "clinical_practice_assistant",
  "provider_plus",
]);
const active = (user) =>
  user &&
  !["ARCHIVED", "TERMINATED", "TERMINATED_PENDING", "INACTIVE", "INACTIVE_EMPLOYEE", "DELETED"].includes(
    String(user.status || "").toUpperCase(),
  );
const decode = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
const lockName = (kind, agencyId, userId) =>
  `office-email:${kind}:${agencyId}:${userId}`;

async function withMailLock(kind, agencyId, userId, timeout, work) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[row]] = await db.execute("SELECT GET_LOCK(?,?) AS acquired", [
      lockName(kind, agencyId, userId),
      timeout,
    ]);
    locked = Number(row?.acquired) === 1;
    if (!locked) {
      if (timeout) throw new Error("Office email queue is busy");
      return;
    }
    return await work(db);
  } finally {
    if (locked)
      await db
        .execute("SELECT RELEASE_LOCK(?)", [lockName(kind, agencyId, userId)])
        .catch(() => {});
    db.release();
  }
}

export async function enqueueOfficeEmail({
  kind,
  agencyId,
  userId,
  key,
  payload = null,
}) {
  if (!["review", "decision"].includes(kind) || !agencyId || !userId)
    throw new Error("Invalid office email destination");
  return withMailLock(kind, agencyId, userId, 8, async (db) => {
    const [insert] = await db.execute(
      `INSERT IGNORE INTO office_request_email_queue
      (kind,agency_id,user_id,request_key,payload_json,ready_at)
      VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND))`,
      [
        kind,
        agencyId,
        userId,
        key,
        payload ? JSON.stringify(payload) : null,
        kind === "review" ? 60 : 300,
      ],
    );
    // Duplicate hooks must not prolong the quiet period or re-send a completed item.
    if (insert.affectedRows)
      await db.execute(
        `UPDATE office_request_email_queue
      SET ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)
      WHERE kind=? AND agency_id=? AND user_id=? AND status='pending'`,
        [kind === "review" ? 60 : 300, kind, agencyId, userId],
      );
  });
}

export async function queueOfficeRequestReview({
  source,
  id,
  providerId,
  officeId,
  agencyId,
}) {
  const [officeAgencies, providerAgencies] = await Promise.all([
    officeId
      ? OfficeLocationAgency.listAgenciesForOffice(officeId)
      : Promise.resolve([]),
    User.getAgencies(providerId),
  ]);
  const agencyIds = agencyId
    ? [Number(agencyId)]
    : officeAgencies
        .filter((a) =>
          providerAgencies.some((p) => Number(p.id) === Number(a.id)),
        )
        .map((a) => Number(a.id));
  if (!agencyIds.length) return;
  const [reviewers] = await pool.query(
    `SELECT DISTINCT u.id,u.role,u.status,ua.agency_id
    FROM office_approval_email_reviewers r JOIN users u ON u.id=r.user_id
    JOIN office_location_agencies ola ON ola.office_location_id=r.office_location_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=ola.agency_id
    WHERE ua.agency_id IN (?) ${officeId ? "AND r.office_location_id=?" : ""}`,
    officeId ? [agencyIds, officeId] : [agencyIds],
  );
  const seen = new Set();
  for (const user of reviewers) {
    if (seen.has(Number(user.id)) || !active(user) || !managers.has(user.role))
      continue;
    seen.add(Number(user.id));
    await enqueueOfficeEmail({
      kind: "review",
      agencyId: Number(user.agency_id),
      userId: Number(user.id),
      key: `${source}:${id}`,
    });
  }
}

export async function officeDecisionSnapshot({
  request,
  action,
  selected,
  comment,
  agencyId,
  result = {},
}) {
  const window = selected?.window;
  const snapshot = {
    key: request.key,
    providerName: request.providerName,
    clientLinked: request.clientLinked,
    officeId: selected?.officeId || request.officeId,
    roomId: selected?.roomId || request.roomId,
    officeName: selected?.officeName || request.officeName,
    roomLabel: selected?.roomLabel || request.roomLabel,
    startDate: window?.startDate || request.startDate,
    slots: window
      ? [{ startHour: window.startHour, endHour: window.endHour }]
      : request.slots,
    timezone: selected?.timezone || request.timezone,
    recurrence: request.recurrence,
    frequencyLabel: window
      ? recurrenceLabel(request.recurrence, window.occurrenceCount)
      : request.frequencyLabel,
    lastDate: window?.occurrenceCount ? window.checkedDates?.at(-1) : null,
    action,
    comment: comment ? String(comment).slice(0, 2000) : "",
    sessions: [],
  };
  if (action === "approve" && request.clientLinked) {
    const ids = [
      ...new Set(
        [...(result.linkedEventIds || []), result.event?.id]
          .map(Number)
          .filter(Boolean),
      ),
    ];
    const standingId = Number(result.standingAssignment?.id) || 0;
    if (ids.length || standingId) {
      const [appointments] = await pool.query(
        `SELECT DISTINCT a.start_at,a.end_at FROM appointments a
        JOIN office_events e ON e.id=a.office_event_id
        WHERE a.provider_user_id=? AND a.agency_id=? AND e.room_id=? AND e.status='BOOKED'
          AND a.status IN ('scheduled','confirmed','client_confirmed')
          AND (e.id IN (?) OR (? > 0 AND e.standing_assignment_id=?)) ORDER BY a.start_at`,
        [
          request.providerId,
          agencyId || request.agencyId,
          snapshot.roomId,
          ids.length ? ids : [0],
          standingId,
          standingId,
        ],
      );
      snapshot.sessions = appointments.map((a) => ({
        start: parseUtcDate(a.start_at).toISOString(),
        end: parseUtcDate(a.end_at).toISOString(),
      }));
    }
  }
  return snapshot;
}

export async function queueOfficeDecisionEmail(options) {
  const { request, agencyId } = options;
  if (!agencyId || !request.roomRequest) return;
  const payload = await officeDecisionSnapshot(options);
  await enqueueOfficeEmail({
    kind: "decision",
    agencyId,
    userId: request.providerId,
    key: request.key,
    payload,
  });
}

export function officePhotoKey(path, roomId) {
  const value = String(path || "").replace(/^\//, "");
  return new RegExp(
    `^uploads/office_room_photos/room_${Number(roomId)}/[A-Za-z0-9_.-]+\\.(?:png|jpe?g|gif|webp)$`,
    "i",
  ).test(value) && !value.includes("..")
    ? value
    : null;
}

export async function enrichOfficeEmailItems(
  items,
  { includePhotos = false } = {},
) {
  const attachments = [],
    photos = new Map();
  for (const item of items) {
    if (!item.officeId) continue;
    const [[room]] = await pool.execute(
      `SELECT l.name AS office_name,l.street_address,l.city,l.state,l.postal_code,
      r.id,r.name,r.room_number,r.photo_url FROM office_locations l
      LEFT JOIN office_rooms r ON r.location_id=l.id AND r.id=? WHERE l.id=?`,
      [item.roomId || 0, item.officeId],
    );
    if (!room) continue;
    item.officeName = room.office_name;
    item.address = [
      room.street_address,
      room.city,
      room.state,
      room.postal_code,
    ]
      .filter(Boolean)
      .join(", ");
    if (room.id)
      item.roomLabel = [
        room.room_number != null ? `Office #${room.room_number}` : "",
        room.name,
      ]
        .filter(Boolean)
        .join(" · ");
    if (!includePhotos || item.action !== "approve" || !room.photo_url)
      continue;
    if (photos.has(room.id)) {
      item.photoAttached = photos.get(room.id);
      continue;
    }
    const key = officePhotoKey(room.photo_url, room.id);
    if (!key) continue;
    try {
      const buffer = await StorageService.readObjectBuffer(key);
      // One copy per room; larger galleries remain in the app instead of inflating email.
      if (
        buffer.length > 5 * 1024 * 1024 ||
        attachments.reduce((n, a) => n + a.contentBase64.length, 0) +
          (buffer.length * 4) / 3 >
          15 * 1024 * 1024
      )
        continue;
      const ext = key.split(".").at(-1).toLowerCase();
      const filename = `office-${room.room_number ?? room.id}-photo.${ext}`;
      attachments.push({
        filename,
        contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
        contentBase64: buffer.toString("base64"),
      });
      photos.set(room.id, filename);
      item.photoAttached = filename;
    } catch (error) {
      console.warn(
        "[office emails] Photo unavailable",
        room.id,
        error.code || "storage_error",
      );
    }
  }
  return attachments;
}

async function currentItems(rows, user) {
  const items = [];
  const { findOfficeApproval } = await import(
    "./officeApprovalWorkflow.service.js"
  );
  for (const row of rows) {
    if (row.kind === "decision") {
      items.push({ row, item: decode(row.payload_json) });
      continue;
    }
    try {
      // Recheck authorization and pending state at send time, not just enqueue time.
      const request = await findOfficeApproval(user, row.request_key);
      const [[reviewer]] = await pool.query(
        `SELECT r.user_id FROM office_approval_email_reviewers r
        JOIN office_location_agencies ola ON ola.office_location_id=r.office_location_id
        WHERE r.user_id=? AND ola.agency_id=? ${request.officeId ? "AND r.office_location_id=?" : ""} LIMIT 1`,
        request.officeId
          ? [user.id, row.agency_id, request.officeId]
          : [user.id, row.agency_id],
      );
      if (!reviewer) continue;
      items.push({ row, item: request });
    } catch (error) {
      if (![403, 404].includes(error.status)) throw error;
    }
  }
  return items;
}

/** Called every minute on each server. The shared lock prevents concurrent copies.
 * An interrupted/ambiguous send is held for review, never blindly replayed.
 */
export async function sendDueOfficeRequestEmails() {
  await pool.execute(`UPDATE office_request_email_queue SET status='needs_review',last_error='Delivery interrupted; verify communication history before retrying'
    WHERE status='sending' AND updated_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)`);
  const [groups] =
    await pool.execute(`SELECT kind,agency_id,user_id FROM office_request_email_queue
    WHERE status='pending' GROUP BY kind,agency_id,user_id HAVING MAX(ready_at)<=UTC_TIMESTAMP() LIMIT 100`);
  for (const group of groups)
    await withMailLock(
      group.kind,
      group.agency_id,
      group.user_id,
      0,
      async (db) => {
        let sendingIds = [];
        try {
          const [rows] = await db.execute(
            `SELECT * FROM office_request_email_queue WHERE kind=? AND agency_id=? AND user_id=? AND status='pending' ORDER BY id`,
            [group.kind, group.agency_id, group.user_id],
          );
          if (
            !rows.length ||
            rows.some((r) => parseUtcDate(r.ready_at) > new Date())
          )
            return;
          const user = await User.findById(group.user_id);
          const memberships = user ? await User.getAgencies(user.id) : [];
          const allowed =
            active(user) &&
            memberships.some((a) => Number(a.id) === Number(group.agency_id));
          const live = allowed ? await currentItems(rows, user) : [];
          const dropped = rows
            .filter((r) => !live.some((l) => l.row.id === r.id))
            .map((r) => r.id);
          if (dropped.length)
            await db.query(
              "UPDATE office_request_email_queue SET status='skipped',last_error='Request resolved or access removed' WHERE id IN (?)",
              [dropped],
            );
          if (!live.length) return;
          const items = live.map((l) => l.item);
          const attachments = await enrichOfficeEmailItems(items, {
            includePhotos: group.kind === "decision",
          });
          const recipient = await resolveMeetingRecipient({
            agencyId: group.agency_id,
            user,
          });
          if (!recipient.email) throw new Error("Recipient email unavailable");
          const content = buildOfficeRequestEmail({
            kind: group.kind,
            items,
            base: await tenantMeetingBase(group.agency_id),
            name: user.first_name,
          });
          sendingIds = live.map((l) => l.row.id);
          await db.query(
            "UPDATE office_request_email_queue SET status='sending',last_error=NULL WHERE id IN (?)",
            [sendingIds],
          );
          const triggerKey =
            group.kind === "review"
              ? "office_request_review"
              : "office_request_decision";
          const result = await sendNotificationEmail({
            agencyId: group.agency_id,
            triggerKey,
            templateType: triggerKey,
            userId: user.id,
            to: recipient.email,
            ...content,
            attachments,
            source: "auto",
          });
          if (result?.skipped) {
            await db.query(
              `UPDATE office_request_email_queue SET status='pending',ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),last_error=? WHERE id IN (?)`,
              [
                String(
                  result.reason || "Email settings delayed delivery",
                ).slice(0, 255),
                sendingIds,
              ],
            );
          } else if (result?.pendingApproval) {
            await db.query(
              "UPDATE office_request_email_queue SET status='approval',communication_id=? WHERE id IN (?)",
              [result.communicationId || null, sendingIds],
            );
          } else if (result?.messageId || result?.id || result?.sent) {
            await db.query(
              "UPDATE office_request_email_queue SET status='sent',sent_at=UTC_TIMESTAMP(),communication_id=? WHERE id IN (?)",
              [result.communicationId || null, sendingIds],
            );
          } else throw new Error("Email provider did not confirm delivery");
        } catch (error) {
          console.warn(
            "[office emails] Delivery needs attention",
            group.user_id,
            error.code || error.message,
          );
          if (sendingIds.length)
            await db.query(
              "UPDATE office_request_email_queue SET status='needs_review',last_error=? WHERE id IN (?)",
              [String(error.code || error.message).slice(0, 255), sendingIds],
            );
          else
            await db.execute(
              `UPDATE office_request_email_queue SET ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),last_error=?
        WHERE kind=? AND agency_id=? AND user_id=? AND status='pending'`,
              [
                String(error.code || error.message).slice(0, 255),
                group.kind,
                group.agency_id,
                group.user_id,
              ],
            );
        }
      },
    );
}
