/**
 * Carry incomplete action items (and open agenda topics) from a completed
 * meeting/session to the next occurrence in the same recurrence series.
 * Goals are intentionally not carried forward.
 */
import pool from '../config/database.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import MeetingAgenda from '../models/MeetingAgenda.model.js';
import MeetingAgendaItem from '../models/MeetingAgendaItem.model.js';

function newActionId() {
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergeActionItems(existing, incoming) {
  const current = Array.isArray(existing) ? [...existing] : [];
  const existingIds = new Set(current.map((a) => String(a.id || '').trim()).filter(Boolean));
  const existingTexts = new Set(
    current.map((a) => String(a.text || '').trim().toLowerCase()).filter(Boolean)
  );
  const added = [];
  for (const item of incoming || []) {
    if (!String(item?.text || '').trim() || item.done) continue;
    const id = String(item.id || '').trim();
    const textKey = String(item.text || '').trim().toLowerCase();
    if (id && existingIds.has(id)) continue;
    if (textKey && existingTexts.has(textKey)) continue;
    const copy = {
      ...item,
      id: id || newActionId(),
      done: false
    };
    current.push(copy);
    if (id) existingIds.add(id);
    if (textKey) existingTexts.add(textKey);
    added.push(copy);
  }
  return { merged: current, added };
}

async function loadTeamMeetingEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, provider_id, recurrence_series_id, start_at, kind
     FROM provider_schedule_events
     WHERE id = ?
     LIMIT 1`,
    [eid]
  );
  return rows?.[0] || null;
}

async function findNextTeamMeetingInSeries(event) {
  const seriesId = String(event?.recurrence_series_id || '').trim();
  const providerId = Number(event?.provider_id || 0);
  const startAt = event?.start_at;
  const sourceId = Number(event?.id || 0);
  if (!seriesId || !providerId || !startAt || !sourceId) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, start_at
     FROM provider_schedule_events
     WHERE recurrence_series_id = ?
       AND provider_id = ?
       AND id <> ?
       AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
       AND meeting_completed_at IS NULL
       AND start_at > ?
     ORDER BY start_at ASC, id ASC
     LIMIT 1`,
    [seriesId, providerId, sourceId, startAt]
  );
  return rows?.[0] || null;
}

async function loadSupervisionSession(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, recurrence_series_id, start_at
     FROM supervision_sessions
     WHERE id = ?
     LIMIT 1`,
    [sid]
  );
  return rows?.[0] || null;
}

async function findNextSupervisionInSeries(session) {
  const seriesId = String(session?.recurrence_series_id || '').trim();
  const startAt = session?.start_at;
  const sourceId = Number(session?.id || 0);
  if (!seriesId || !startAt || !sourceId) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, start_at
     FROM supervision_sessions
     WHERE recurrence_series_id = ?
       AND id <> ?
       AND UPPER(COALESCE(status, 'SCHEDULED')) NOT IN ('CANCELLED', 'RESCHEDULED', 'MISSED')
       AND start_at > ?
     ORDER BY start_at ASC, id ASC
     LIMIT 1`,
    [seriesId, sourceId, startAt]
  );
  return rows?.[0] || null;
}

async function carryAgendaItems({
  meetingType,
  sourceMeetingId,
  targetMeetingId,
  agencyId,
  actorUserId
}) {
  const sourceAgenda = await MeetingAgenda.findByMeeting(meetingType, sourceMeetingId);
  if (!sourceAgenda?.id) return { carried: 0 };

  const items = await MeetingAgendaItem.findByAgendaId(sourceAgenda.id);
  const incomplete = (items || []).filter(
    (it) => String(it.status || 'pending').toLowerCase() !== 'completed'
  );
  if (!incomplete.length) return { carried: 0 };

  const targetAgenda = await MeetingAgenda.findOrCreateForMeeting({
    meetingType,
    meetingId: targetMeetingId,
    agencyId,
    createdByUserId: actorUserId
  });
  const existing = await MeetingAgendaItem.findByAgendaId(targetAgenda.id);
  const existingTitles = new Set(
    (existing || []).map((e) => String(e.title || '').trim().toLowerCase()).filter(Boolean)
  );

  let carried = 0;
  let sortOrder = (existing || []).length;
  for (const it of incomplete) {
    const title = String(it.title || '').trim();
    const key = title.toLowerCase();
    if (!title || existingTitles.has(key)) continue;
    // eslint-disable-next-line no-await-in-loop
    await MeetingAgendaItem.create({
      meetingAgendaId: targetAgenda.id,
      taskId: it.task_id,
      title,
      notes: it.notes,
      sortOrder,
      createdByUserId: actorUserId
    });
    existingTitles.add(key);
    sortOrder += 1;
    carried += 1;
  }
  return { carried };
}

async function carryWorkspaceActions({
  sourceArtifactLoader,
  targetEventId,
  targetUpsert,
  actorUserId
}) {
  const sourceRow = await sourceArtifactLoader();
  const sourceWorkspace = ProviderScheduleEventArtifact.toWorkspaceDto(sourceRow);
  const incomplete = (sourceWorkspace.actionItems || []).filter((a) => !a.done && a.text);
  if (!incomplete.length) {
    return { actionItemsAdded: 0, targetEventId };
  }

  const targetRow = await ProviderScheduleEventArtifact.findByEventId(targetEventId)
    || await ProviderScheduleEventArtifact.ensureTagged({ eventId: targetEventId, updatedByUserId: actorUserId });
  const targetWorkspace = ProviderScheduleEventArtifact.toWorkspaceDto(targetRow);
  const { merged, added } = mergeActionItems(targetWorkspace.actionItems, incomplete);
  if (!added.length) {
    return { actionItemsAdded: 0, targetEventId };
  }

  await targetUpsert({
    eventId: targetEventId,
    actionItems: merged,
    updatedByUserId: actorUserId
  });
  return { actionItemsAdded: added.length, targetEventId };
}

export async function carryForwardTeamMeetingWorkspace({ eventId, actorUserId = null } = {}) {
  const event = await loadTeamMeetingEvent(eventId);
  if (!event) return { ok: false, error: 'event_not_found' };

  const kind = String(event.kind || '').toUpperCase();
  if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
    return { ok: false, error: 'unsupported_kind' };
  }

  const next = await findNextTeamMeetingInSeries(event);
  if (!next?.id) return { ok: true, skipped: true, reason: 'no_next_occurrence' };

  const targetId = Number(next.id);
  const agencyId = Number(next.agency_id || event.agency_id || 0);

  const actionResult = await carryWorkspaceActions({
    sourceArtifactLoader: () => ProviderScheduleEventArtifact.findByEventId(event.id),
    targetEventId: targetId,
    targetUpsert: (payload) => ProviderScheduleEventArtifact.upsertWorkspace(payload),
    actorUserId
  });

  let agendaCarried = 0;
  if (kind === 'TEAM_MEETING') {
    const agendaResult = await carryAgendaItems({
      meetingType: 'provider_schedule_event',
      sourceMeetingId: Number(event.id),
      targetMeetingId: targetId,
      agencyId,
      actorUserId
    });
    agendaCarried = agendaResult.carried || 0;
  }

  return {
    ok: true,
    sourceEventId: Number(event.id),
    targetEventId: targetId,
    actionItemsAdded: actionResult.actionItemsAdded || 0,
    agendaItemsAdded: agendaCarried
  };
}

export async function carryForwardSupervisionWorkspace({ sessionId, actorUserId = null } = {}) {
  const session = await loadSupervisionSession(sessionId);
  if (!session) return { ok: false, error: 'session_not_found' };

  const next = await findNextSupervisionInSeries(session);
  if (!next?.id) return { ok: true, skipped: true, reason: 'no_next_occurrence' };

  const targetId = Number(next.id);
  const agencyId = Number(next.agency_id || session.agency_id || 0);
  const sourceId = Number(session.id);

  const sourceRow = await SupervisionSessionArtifact.findBySessionId(sourceId);
  const incomplete = (sourceRow?.actionItems || []).filter((a) => !a.done && a.text);
  let actionItemsAdded = 0;

  if (incomplete.length) {
    const targetRow = await SupervisionSessionArtifact.findBySessionId(targetId)
      || await SupervisionSessionArtifact.ensureTagged({ sessionId: targetId, updatedByUserId: actorUserId });
    const { merged, added } = mergeActionItems(targetRow?.actionItems || [], incomplete);
    if (added.length) {
      await SupervisionSessionArtifact.upsertBySessionId({
        sessionId: targetId,
        actionItems: merged,
        updatedByUserId: actorUserId
      });
      actionItemsAdded = added.length;
    }
  }

  const agendaResult = await carryAgendaItems({
    meetingType: 'supervision_session',
    sourceMeetingId: sourceId,
    targetMeetingId: targetId,
    agencyId,
    actorUserId
  });

  return {
    ok: true,
    sourceSessionId: sourceId,
    targetSessionId: targetId,
    actionItemsAdded,
    agendaItemsAdded: agendaResult.carried || 0
  };
}
