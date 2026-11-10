import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import Notification from '../models/Notification.model.js';

export async function ensurePaperPacketTask({ draft, clientId = null }, { db = pool, tasks = Task, notifications = Notification } = {}) {
  if (!draft?.id || !draft.agency_id || !draft.phi_document_id) return null;
  const [[uploader]] = await db.execute('SELECT role FROM users WHERE id=?', [draft.uploaded_by_user_id]);
  if (uploader?.role !== 'school_staff') return null;
  const conn = await db.getConnection();
  const lock = `paper-task:${Number(draft.id)}`;
  try {
    const [[result]] = await conn.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (!result.acquired) throw new Error('Packet task is being prepared. Refresh before retrying.');
    const [[existing]] = await conn.execute("SELECT id FROM tasks WHERE source_ref_type='paper_packet_processing' AND source_ref_id=? AND assigned_to_agency_id=? LIMIT 1", [String(draft.id), draft.agency_id]);
    const task = existing || await tasks.create({ taskType: 'custom', title: 'Process paper packet enrollment',
      description: 'Review the uploaded school packet, match the child, and complete the paper enrollment steps. Uncertain signatures or missing information must remain pending.',
      assignedToAgencyId: draft.agency_id, assignedToRole: 'support', assignedByUserId: draft.uploaded_by_user_id,
      sourceRefType: 'paper_packet_processing', sourceRefId: String(draft.id), categories: ['client'],
      metadata: { referralDraftId: Number(draft.id), schoolOrganizationId: Number(draft.organization_id), documentId: Number(draft.phi_document_id), clientId: Number(clientId || draft.created_client_id) || null }
    });
    const [recipients] = await db.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND u.role='support' AND u.is_active=1`, [draft.agency_id]);
    for (const recipient of recipients) {
      const [[notice]] = await conn.execute(`SELECT id FROM notifications WHERE type='new_packet_uploaded'
        AND agency_id=? AND user_id=? AND related_entity_type='paper_packet_task' AND related_entity_id=? LIMIT 1`,
      [draft.agency_id, recipient.id, task.id]);
      if (!notice) await notifications.create({ type: 'new_packet_uploaded', severity: 'info',
        title: 'Process paper packet enrollment', message: 'A school staff member uploaded a packet. Open the Support task to review the matching child and process enrollment.',
        userId: recipient.id, agencyId: draft.agency_id, relatedEntityType: 'paper_packet_task', relatedEntityId: task.id,
        actorUserId: draft.uploaded_by_user_id, actorSource: 'school_packet_upload' });
    }
    return task.id;
  } finally {
    try { await conn.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { conn.release(); }
  }
}

export async function completePaperPacketTask({ clientId, state }, db = pool) {
  if (!state?.processedAt || !state.documentId || !state.guardian1Id
    || ![state.guardian1Id, state.guardian2Id].filter(Boolean)
      .every(id => ['sent', 'delivered', 'redirected'].includes(state.invitations?.[id]?.status))) return false;
  // A task completion never grants consent or makes the client clinically ready.
  await db.execute(`UPDATE tasks t JOIN referral_packet_upload_drafts d ON CAST(d.id AS CHAR)=t.source_ref_id
    SET t.status='completed',t.completed_at=NOW(),t.updated_at=NOW()
    WHERE t.source_ref_type='paper_packet_processing' AND t.assigned_to_agency_id=d.agency_id
      AND d.created_client_id=? AND d.phi_document_id=? AND t.status<>'completed'`, [clientId, state.documentId]);
  return true;
}
