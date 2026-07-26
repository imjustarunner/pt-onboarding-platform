import pool from '../config/database.js';

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeGoalItem(item, idx = 0) {
  const id = String(item?.id || `g-${idx}-${Date.now()}`).slice(0, 64);
  const text = String(item?.text || '').trim().slice(0, 500);
  return { id, text, done: !!item?.done };
}

function normalizeActionItem(item, idx = 0) {
  const id = String(item?.id || `a-${idx}-${Date.now()}`).slice(0, 64);
  const text = String(item?.text || '').trim().slice(0, 500);
  const assigneeRaw = item?.assigneeUserId ?? item?.assignee_user_id ?? null;
  const assigneeUserId = Number(assigneeRaw || 0) > 0 ? Number(assigneeRaw) : null;
  const ticketRaw = item?.escalationTicketId ?? item?.escalation_ticket_id ?? null;
  const escalationTicketId = Number(ticketRaw || 0) > 0 ? Number(ticketRaw) : null;
  return {
    id,
    text,
    done: !!item?.done,
    assigneeUserId,
    isEscalation: !!(item?.isEscalation ?? item?.is_escalation ?? escalationTicketId),
    escalationTicketId
  };
}

class ProviderScheduleEventArtifact {
  static async findByEventId(eventId) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM provider_schedule_event_artifacts
       WHERE event_id = ?
       LIMIT 1`,
      [eid]
    );
    return rows?.[0] || null;
  }

  static toWorkspaceDto(row) {
    if (!row) {
      return { focusTitle: '', goals: [], actionItems: [] };
    }
    return {
      focusTitle: String(row.focus_title || '').trim(),
      goals: parseJsonArray(row.goals_json).map(normalizeGoalItem).filter((g) => g.text).slice(0, 50),
      actionItems: parseJsonArray(row.action_items_json).map(normalizeActionItem).filter((a) => a.text).slice(0, 50)
    };
  }

  static async ensureTagged({ eventId, updatedByUserId = null }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;
    await pool.execute(
      `INSERT INTO provider_schedule_event_artifacts
        (event_id, tagged_at, updated_by_user_id)
       VALUES (?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(tagged_at, NOW()),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [eid, updatedBy]
    );
    return this.findByEventId(eid);
  }

  static async upsertByEventId({
    eventId,
    taggedAt = null,
    transcriptUrl = undefined,
    transcriptText = undefined,
    summaryText = undefined,
    summaryModel = undefined,
    summaryGeneratedAt = undefined,
    recordingUrl = undefined,
    recordingPath = undefined,
    updatedByUserId = null
  }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const updatedBy = updatedByUserId ? parseInt(updatedByUserId, 10) : null;

    await pool.execute(
      `INSERT INTO provider_schedule_event_artifacts
        (
          event_id,
          tagged_at,
          transcript_url,
          transcript_text,
          summary_text,
          summary_model,
          summary_generated_at,
          recording_url,
          recording_path,
          updated_by_user_id
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tagged_at = COALESCE(VALUES(tagged_at), tagged_at),
         transcript_url = CASE WHEN VALUES(transcript_url) IS NULL THEN transcript_url ELSE VALUES(transcript_url) END,
         transcript_text = CASE WHEN VALUES(transcript_text) IS NULL THEN transcript_text ELSE VALUES(transcript_text) END,
         summary_text = CASE WHEN VALUES(summary_text) IS NULL THEN summary_text ELSE VALUES(summary_text) END,
         summary_model = CASE WHEN VALUES(summary_model) IS NULL THEN summary_model ELSE VALUES(summary_model) END,
         summary_generated_at = CASE
           WHEN VALUES(summary_generated_at) IS NULL THEN summary_generated_at
           ELSE VALUES(summary_generated_at)
         END,
         recording_url = CASE WHEN VALUES(recording_url) IS NULL THEN recording_url ELSE VALUES(recording_url) END,
         recording_path = CASE WHEN VALUES(recording_path) IS NULL THEN recording_path ELSE VALUES(recording_path) END,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        eid,
        taggedAt || null,
        transcriptUrl === undefined ? null : (transcriptUrl || null),
        transcriptText === undefined ? null : (transcriptText || null),
        summaryText === undefined ? null : (summaryText || null),
        summaryModel === undefined ? null : (summaryModel || null),
        summaryGeneratedAt === undefined ? null : (summaryGeneratedAt || null),
        recordingUrl === undefined ? null : (recordingUrl || null),
        recordingPath === undefined ? null : (recordingPath || null),
        updatedBy
      ]
    );

    return this.findByEventId(eid);
  }

  static async upsertWorkspace({
    eventId,
    focusTitle = undefined,
    goals = undefined,
    actionItems = undefined,
    updatedByUserId = null
  }) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const existing = await this.ensureTagged({ eventId: eid, updatedByUserId });
    const current = this.toWorkspaceDto(existing);

    const nextFocus = focusTitle === undefined
      ? current.focusTitle
      : String(focusTitle || '').trim().slice(0, 500);
    const nextGoals = goals === undefined
      ? current.goals
      : (Array.isArray(goals) ? goals : [])
        .map(normalizeGoalItem)
        .filter((g) => g.text)
        .slice(0, 50);
    const nextActions = actionItems === undefined
      ? current.actionItems
      : (Array.isArray(actionItems) ? actionItems : [])
        .map(normalizeActionItem)
        .filter((a) => a.text)
        .slice(0, 50);

    try {
      await pool.execute(
        `UPDATE provider_schedule_event_artifacts
         SET focus_title = ?,
             goals_json = ?,
             action_items_json = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE event_id = ?
         LIMIT 1`,
        [
          nextFocus || null,
          JSON.stringify(nextGoals),
          JSON.stringify(nextActions),
          updatedByUserId ? Number(updatedByUserId) : null,
          eid
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      // Migration not applied yet — still return in-memory shape for graceful degrade.
      return { focusTitle: nextFocus, goals: nextGoals, actionItems: nextActions };
    }

    const row = await this.findByEventId(eid);
    return this.toWorkspaceDto(row);
  }

  static async syncActionItemAssigneeByEscalationTicket({
    escalationTicketId,
    actionItemId = null,
    eventId = null,
    assigneeUserId = null,
    updatedByUserId = null
  }) {
    const ticketId = Number(escalationTicketId || 0);
    const eid = Number(eventId || 0);
    if (!ticketId && !eid) return false;

    let targetEventId = eid;
    let targetItemId = actionItemId;
    if (!targetEventId || !targetItemId) {
      const [rows] = await pool.execute(
        `SELECT linked_schedule_event_id, linked_action_item_id
         FROM support_tickets
         WHERE id = ?
         LIMIT 1`,
        [ticketId]
      );
      if (!targetEventId) targetEventId = Number(rows?.[0]?.linked_schedule_event_id || 0);
      if (!targetItemId) targetItemId = rows?.[0]?.linked_action_item_id || null;
    }
    if (!targetEventId || !targetItemId) return false;

    const row = await this.findByEventId(targetEventId);
    if (!row) return false;
    const workspace = this.toWorkspaceDto(row);
    let changed = false;
    const nextAssignee = Number(assigneeUserId || 0) > 0 ? Number(assigneeUserId) : null;
    const nextActions = workspace.actionItems.map((item) => {
      const matchesTicket = ticketId > 0 && Number(item.escalationTicketId || 0) === ticketId;
      const matchesId = targetItemId && String(item.id) === String(targetItemId);
      if (!matchesTicket && !matchesId) return item;
      if (Number(item.assigneeUserId || 0) === Number(nextAssignee || 0)) return item;
      changed = true;
      return {
        ...item,
        assigneeUserId: nextAssignee,
        isEscalation: true,
        escalationTicketId: item.escalationTicketId || ticketId || null
      };
    });
    if (!changed) return false;
    await this.upsertWorkspace({
      eventId: targetEventId,
      actionItems: nextActions,
      updatedByUserId
    });
    return true;
  }

  static async markActionItemDoneByEscalationTicket({
    escalationTicketId,
    actionItemId = null,
    eventId = null,
    done = true
  }) {
    const ticketId = Number(escalationTicketId || 0);
    const eid = Number(eventId || 0);
    if (!ticketId && !eid) return false;

    let targetEventId = eid;
    if (!targetEventId) {
      const [rows] = await pool.execute(
        `SELECT linked_schedule_event_id, linked_action_item_id
         FROM support_tickets
         WHERE id = ?
         LIMIT 1`,
        [ticketId]
      );
      targetEventId = Number(rows?.[0]?.linked_schedule_event_id || 0);
      if (!actionItemId) actionItemId = rows?.[0]?.linked_action_item_id || null;
    }
    if (!targetEventId) return false;

    const row = await this.findByEventId(targetEventId);
    if (!row) return false;
    const workspace = this.toWorkspaceDto(row);
    let changed = false;
    const nextActions = workspace.actionItems.map((item) => {
      const matchesTicket = ticketId > 0 && Number(item.escalationTicketId || 0) === ticketId;
      const matchesId = actionItemId && String(item.id) === String(actionItemId);
      if (!matchesTicket && !matchesId) return item;
      changed = true;
      return { ...item, done: !!done, isEscalation: true, escalationTicketId: item.escalationTicketId || ticketId || null };
    });
    if (!changed) return false;
    await this.upsertWorkspace({
      eventId: targetEventId,
      actionItems: nextActions
    });
    return true;
  }
}

export default ProviderScheduleEventArtifact;
export { normalizeGoalItem, normalizeActionItem };
