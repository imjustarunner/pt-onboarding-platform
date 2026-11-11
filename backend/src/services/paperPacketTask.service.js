import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import Notification from '../models/Notification.model.js';

export async function ensurePaperPacketTask({ draft, clientId = null }, { db = pool, tasks = Task, notifications = Notification } = {}) {
  const linkedClientId = Number(clientId || draft?.created_client_id) || null;
  if (!draft?.id || !draft.agency_id || !draft.phi_document_id || draft.status !== 'submitted' || !linkedClientId) return null;
  const [[uploader]] = await db.execute('SELECT role FROM users WHERE id=?', [draft.uploaded_by_user_id]);
  if (uploader?.role !== 'school_staff') return null;
  const conn = await db.getConnection();
  const lock = `paper-task:${Number(draft.id)}`;
  try {
    const [[result]] = await conn.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (!result.acquired) throw new Error('Packet task is being prepared. Refresh before retrying.');
    const [[existing]] = await conn.execute("SELECT id FROM tasks WHERE source_ref_type='paper_packet_processing' AND source_ref_id=? AND assigned_to_agency_id=? LIMIT 1", [String(draft.id), draft.agency_id]);
    const [[source]] = await db.execute(`SELECT d.original_name, a.name AS school_name, c.initials
      FROM client_phi_documents d JOIN clients c ON c.id=d.client_id AND c.agency_id=d.agency_id
      JOIN agencies a ON a.id=? WHERE d.id=? AND d.client_id=? AND d.agency_id=? AND d.school_organization_id=? AND d.removed_at IS NULL`,
      [draft.organization_id, draft.phi_document_id, linkedClientId, draft.agency_id, draft.organization_id]);
    if (!source) throw new Error('The packet must finish attaching to this client before creating its Support task.');
    const childLabel = source.initials || draft.initials || `Record ${linkedClientId}`;
    const title = `Process paper packet enrollment · ${childLabel} · #${linkedClientId} · ${source.original_name || 'Paper packet'}`.slice(0,255);
    const metadata = { referralDraftId: Number(draft.id), schoolOrganizationId: Number(draft.organization_id),
      schoolName: source.school_name || '', documentId: Number(draft.phi_document_id),
      packetFilename: source.original_name || 'Paper packet', clientId: linkedClientId, clientInitials: childLabel };
    const task = existing || await tasks.create({ taskType: 'custom', title,
      description: 'Review the uploaded school packet, match the child, and complete the paper enrollment steps. Uncertain signatures or missing information must remain pending.',
      assignedToAgencyId: draft.agency_id, assignedToRole: 'support', assignedByUserId: draft.uploaded_by_user_id,
      sourceRefType: 'paper_packet_processing', sourceRefId: String(draft.id), categories: ['client'],
      metadata
    });
    // The task may already exist from a prior draft-only upload. Keep its identity,
    // assignment and history, but bind it to the now-saved client and exact source.
    if (existing) await conn.execute(`UPDATE tasks SET title=?, metadata=JSON_MERGE_PATCH(COALESCE(metadata,JSON_OBJECT()),CAST(? AS JSON)),updated_at=NOW() WHERE id=? AND assigned_to_agency_id=?`,
      [title, JSON.stringify(metadata), task.id, draft.agency_id]);
    const [recipients] = await db.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND u.role='support' AND u.is_active=1`, [draft.agency_id]);
    for (const recipient of recipients) {
      const [[notice]] = await conn.execute(`SELECT id FROM notifications WHERE type='new_packet_uploaded'
        AND agency_id=? AND user_id=? AND related_entity_type='paper_packet_task' AND related_entity_id=? LIMIT 1`,
      [draft.agency_id, recipient.id, task.id]);
      if (notice) await conn.execute(`UPDATE notifications SET title=?,message=? WHERE id=? AND agency_id=? AND user_id=?`,
        [title, `${childLabel} · Record #${linkedClientId} · ${source.original_name || 'Paper packet'} · ${source.school_name || 'School'}. Open the Support task to process this saved packet.`, notice.id, draft.agency_id, recipient.id]);
      if (!notice) await notifications.create({ type: 'new_packet_uploaded', severity: 'info',
        title, message: `${childLabel} · Record #${linkedClientId} · ${source.original_name || 'Paper packet'} · ${source.school_name || 'School'}. Open the Support task to process this saved packet.`,
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
  await db.execute(`UPDATE tasks t JOIN referral_packet_upload_drafts d
    ON t.source_ref_id=CAST(d.id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
    JOIN clients c ON c.id=d.created_client_id AND c.agency_id=d.agency_id
    JOIN client_phi_documents p ON p.id=d.phi_document_id AND p.client_id=c.id
      AND p.agency_id=c.agency_id AND p.school_organization_id=d.organization_id AND p.removed_at IS NULL
    SET t.status='completed',t.completed_at=NOW(),t.updated_at=NOW()
    WHERE t.source_ref_type='paper_packet_processing' AND t.assigned_to_agency_id=d.agency_id
      AND d.created_client_id=? AND d.phi_document_id=? AND d.status='submitted'
      AND t.status NOT IN ('completed','overridden')`, [clientId, state.documentId]);
  return true;
}

/** Scoped operational tasks; draft linkage also finds tasks created before client matching. */
export async function listPaperPacketTasks({clientId, agencyId}, db = pool) {
  const [rows] = await db.execute(`SELECT t.id,t.title,t.status,t.created_at,t.updated_at,
    d.id AS draft_id,d.phi_document_id AS document_id,p.original_name AS packet_filename
    FROM tasks t JOIN referral_packet_upload_drafts d
      ON t.source_ref_type='paper_packet_processing'
      AND t.source_ref_id=CAST(d.id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
      AND t.assigned_to_agency_id=d.agency_id
    JOIN clients c ON c.id=d.created_client_id AND c.agency_id=d.agency_id
    LEFT JOIN client_phi_documents p ON p.id=d.phi_document_id AND p.client_id=d.created_client_id AND p.agency_id=d.agency_id AND p.school_organization_id=d.organization_id AND p.removed_at IS NULL
    WHERE d.created_client_id=? AND d.agency_id=? AND d.status='submitted'
      AND COALESCE(t.is_private,0)=0
      AND t.status NOT IN ('completed','overridden') ORDER BY t.created_at,t.id`, [Number(clientId), Number(agencyId)]);
  return rows;
}
