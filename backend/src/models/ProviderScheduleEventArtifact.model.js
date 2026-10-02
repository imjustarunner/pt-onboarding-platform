import pool from '../config/database.js';
import { encryptSensitiveArtifact } from '../services/supervisionArtifactEncryption.service.js';
import { mapSupervisionArtifact } from './SupervisionSessionArtifact.model.js';

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
  static async findByEventId(eventId, db = pool, forUpdate = false) {
    const eid = parseInt(eventId, 10);
    if (!eid) return null;
    const [rows] = await db.execute(
      `SELECT *
       FROM provider_schedule_event_artifacts
       WHERE event_id = ?
       LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [eid]
    );
    const row = rows?.[0];
    if (!row) return null;
    const mapped = mapSupervisionArtifact(row);
    return { ...mapped, recording_url: mapped.recordingUrl, recording_path: mapped.recordingPath };
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

  static async upsertByEventId(fields, transaction = null) {
    const { eventId, updatedByUserId = null } = fields;
    const eid = Number(eventId);
    if (!eid) return null;
    const db = transaction || await pool.getConnection();
    try {
      if (!transaction) await db.beginTransaction();
      await db.execute(`INSERT INTO provider_schedule_event_artifacts (event_id,tagged_at)
        VALUES (?,NOW()) ON DUPLICATE KEY UPDATE event_id=VALUES(event_id)`, [eid]);
      const existing = await this.findByEventId(eid, db, true);
      const next = {};
      const keys = { transcriptUrl:'transcript_url', transcriptText:'transcript_text', summaryText:'summary_text',
        focusTitle:'focus_title', goals:'goals_json', actionItems:'action_items_json', recordingUrl:'recording_url', recordingPath:'recording_path' };
      for (const [key,column] of Object.entries(keys)) next[key] = fields[key] === undefined ? existing?.[column] : fields[key];
      const enc = encryptSensitiveArtifact(next);
      await db.execute(`UPDATE provider_schedule_event_artifacts SET
        tagged_at=COALESCE(?,tagged_at), transcript_url=NULL,transcript_text=NULL,summary_text=NULL,
        focus_title=NULL,goals_json=NULL,action_items_json=NULL,recording_url=NULL,recording_path=NULL,
        sensitive_ciphertext=?,sensitive_iv=?,sensitive_auth_tag=?,encryption_key_id=?,
        summary_model=COALESCE(?,summary_model),summary_generated_at=COALESCE(?,summary_generated_at),
        updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE event_id=?`,
        [fields.taggedAt || null,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId,
          fields.summaryModel || null,fields.summaryGeneratedAt || null,updatedByUserId,eid]);
      const result = await this.findByEventId(eid, db);
      if (!transaction) await db.commit();
      return result;
    } catch (error) { if (!transaction) await db.rollback(); throw error; }
    finally { if (!transaction) db.release(); }
  }

  // Serialize read/decrypt/append/encrypt with concurrent speakers and pause/stop.
  static async appendTranscriptChunk({ eventId, text, updatedByUserId = null, expectedRevision = undefined }) {
    const chunk = String(text || '').trim().slice(0,120000);
    if (!chunk) return this.findByEventId(eventId);
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const existing = await this.findByEventId(eventId, db, true);
      if (!existing || Number(existing.transcript_paused) || existing.transcript_stopped_at || (expectedRevision !== undefined && Number(existing.transcript_revision || 0) !== Number(expectedRevision))) {
        throw Object.assign(new Error('Transcription is paused or stopped.'), { status:409 });
      }
      const previous = String(existing.transcript_text || '').trim();
      const transcriptText = previous.includes(chunk) ? previous : [previous,chunk].filter(Boolean).join('\n').slice(0,120000);
      const result = await this.upsertByEventId({eventId,transcriptText,updatedByUserId}, db);
      await db.commit();
      return result;
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
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

    await this.upsertByEventId({ eventId:eid, updatedByUserId,
      ...(focusTitle === undefined ? {} : {focusTitle:nextFocus}),
      ...(goals === undefined ? {} : {goals:nextGoals}),
      ...(actionItems === undefined ? {} : {actionItems:nextActions}) });

    const row = await this.findByEventId(eid);
    const dto = this.toWorkspaceDto(row);
    try {
      const { syncMeetingActionTasks } = await import('../services/taskHubSync.service.js');
      await syncMeetingActionTasks({
        eventId: eid,
        actionItems: dto.actionItems,
        actorUserId: updatedByUserId
      });
    } catch (syncErr) {
      console.warn('[workspace] sync meeting action tasks failed', syncErr?.message || syncErr);
    }
    return dto;
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
