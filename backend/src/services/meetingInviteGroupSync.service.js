import pool from '../config/database.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import AgencyMeetingInviteGroup from '../models/AgencyMeetingInviteGroup.model.js';
import ProviderScheduleEventInviteGroup from '../models/ProviderScheduleEventInviteGroup.model.js';

function normalizeAgencyIds(agencyIds) {
  if (agencyIds == null) return null;
  const ids = Array.from(new Set((Array.isArray(agencyIds) ? agencyIds : [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0)));
  return ids.length ? ids : null;
}

export async function collectMemberUserIds(groupIds = []) {
  const ids = Array.from(new Set((groupIds || []).map((n) => Number(n)).filter((n) => n > 0)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT DISTINCT user_id
     FROM agency_meeting_invite_group_members
     WHERE group_id IN (${placeholders})`,
    ids
  );
  return (rows || []).map((r) => Number(r.user_id || 0)).filter((n) => n > 0);
}

export async function linkGroupsToEvent(eventId, groupIds = []) {
  await ProviderScheduleEventInviteGroup.replaceForEvent(eventId, groupIds);
}

export async function syncMemberAddedToGroup(groupId, userId) {
  const gid = Number(groupId || 0);
  const uid = Number(userId || 0);
  if (!gid || !uid) return { eventIds: [] };
  const eventIds = await ProviderScheduleEventInviteGroup.listFutureEventIdsForGroup(gid);
  for (const eid of eventIds) {
    // eslint-disable-next-line no-await-in-loop
    await ProviderScheduleEventAttendee.upsertForEvent(eid, [uid]);
  }
  return { eventIds };
}

export async function syncMemberRemovedFromGroup(groupId, userId) {
  const gid = Number(groupId || 0);
  const uid = Number(userId || 0);
  if (!gid || !uid) return { eventIds: [] };
  const eventIds = await ProviderScheduleEventInviteGroup.listFutureEventIdsForGroup(gid);
  if (!eventIds.length) return { eventIds: [] };
  const placeholders = eventIds.map(() => '?').join(',');
  await pool.execute(
    `DELETE FROM provider_schedule_event_attendees
     WHERE user_id = ? AND event_id IN (${placeholders})`,
    [uid, ...eventIds]
  );
  return { eventIds };
}

export async function replaceGroupMembersWithSync(groupId, nextUserIds = []) {
  const group = await AgencyMeetingInviteGroup.findById(groupId);
  if (!group) return { ok: false, reason: 'not_found' };
  const oldIds = new Set((group.userIds || []).map((n) => Number(n)).filter((n) => n > 0));
  const newIds = Array.from(new Set((nextUserIds || []).map((n) => Number(n)).filter((n) => n > 0)));
  const newSet = new Set(newIds);
  const added = newIds.filter((id) => !oldIds.has(id));
  const removed = [...oldIds].filter((id) => !newSet.has(id));
  await AgencyMeetingInviteGroup.replaceMembers(groupId, newIds);
  for (const uid of added) {
    // eslint-disable-next-line no-await-in-loop
    await syncMemberAddedToGroup(groupId, uid);
  }
  for (const uid of removed) {
    // eslint-disable-next-line no-await-in-loop
    await syncMemberRemovedFromGroup(groupId, uid);
  }
  return { ok: true, added, removed, userIds: newIds };
}

/**
 * Remove a user from invite groups and future schedule / supervision attendance.
 * @param {number} userId
 * @param {{ agencyIds?: number[]|null }} opts - when set, limit cleanup to those agencies
 */
export async function detachUserFromMeetingInvites(userId, { agencyIds = null } = {}) {
  const uid = Number(userId || 0);
  if (!uid) return;
  const scopedAgencyIds = normalizeAgencyIds(agencyIds);

  if (scopedAgencyIds?.length) {
    const placeholders = scopedAgencyIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE m FROM agency_meeting_invite_group_members m
       INNER JOIN agency_meeting_invite_groups g ON g.id = m.group_id
       WHERE m.user_id = ? AND g.agency_id IN (${placeholders})`,
      [uid, ...scopedAgencyIds]
    );
  } else {
    await pool.execute(`DELETE FROM agency_meeting_invite_group_members WHERE user_id = ?`, [uid]);
  }

  const futureEventFilter = `UPPER(COALESCE(pse.status, 'ACTIVE')) = 'ACTIVE'
    AND (
      (pse.start_at IS NOT NULL AND pse.start_at >= NOW())
      OR (pse.all_day = 1 AND pse.end_date >= CURDATE())
      OR (pse.start_at IS NULL AND pse.start_date IS NOT NULL AND pse.start_date >= CURDATE())
    )`;
  if (scopedAgencyIds?.length) {
    const placeholders = scopedAgencyIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE psea FROM provider_schedule_event_attendees psea
       INNER JOIN provider_schedule_events pse ON pse.id = psea.event_id
       WHERE psea.user_id = ?
         AND pse.agency_id IN (${placeholders})
         AND ${futureEventFilter}`,
      [uid, ...scopedAgencyIds]
    );
  } else {
    await pool.execute(
      `DELETE psea FROM provider_schedule_event_attendees psea
       INNER JOIN provider_schedule_events pse ON pse.id = psea.event_id
       WHERE psea.user_id = ?
         AND ${futureEventFilter}`,
      [uid]
    );
  }

  try {
    if (scopedAgencyIds?.length) {
      const placeholders = scopedAgencyIds.map(() => '?').join(',');
      await pool.execute(
        `DELETE ssa FROM supervision_session_attendees ssa
         INNER JOIN supervision_sessions ss ON ss.id = ssa.session_id
         WHERE ssa.user_id = ?
           AND (ss.status IS NULL OR UPPER(ss.status) != 'CANCELLED')
           AND ss.start_at >= NOW()
           AND ss.agency_id IN (${placeholders})`,
        [uid, ...scopedAgencyIds]
      );
    } else {
      await pool.execute(
        `DELETE ssa FROM supervision_session_attendees ssa
         INNER JOIN supervision_sessions ss ON ss.id = ssa.session_id
         WHERE ssa.user_id = ?
           AND (ss.status IS NULL OR UPPER(ss.status) != 'CANCELLED')
           AND ss.start_at >= NOW()`,
        [uid]
      );
    }
  } catch {
    /* supervision_session_attendees optional */
  }
}
