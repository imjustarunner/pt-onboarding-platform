import pool from '../config/database.js';
import {documentSignerAccess} from '../utils/documentSignerAccess.js';

export async function listDocumentCountersignTasks(actor, agencyId = null, db = pool) {
  if (!['super_admin','admin','support'].includes(actor.role)) return [];
  if (agencyId != null && (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1)) {
    throw Object.assign(Error('A valid agency is required.'), {status:400});
  }
  const [rows] = await db.execute(`SELECT t.id,t.title,t.due_date,t.assigned_to_agency_id,
      original.id AS document_task_id,original.assigned_to_user_id,original.metadata,
      CONCAT(COALESCE(NULLIF(u.preferred_name,''),u.first_name),' ',u.last_name) AS employee_name,
      a.name AS agency_name,s.user_id AS signed_user_id,s.signed_pdf_path,s.signed_at,s.audit_trail
    FROM tasks t JOIN tasks original ON original.id=t.reference_id
      AND original.assigned_to_agency_id=t.assigned_to_agency_id
    JOIN users u ON u.id=original.assigned_to_user_id
    JOIN agencies a ON a.id=t.assigned_to_agency_id
    LEFT JOIN signed_documents s ON s.task_id=original.id
    WHERE t.document_action_type='countersignature' AND t.countersign_signer_user_id=?
      AND t.assigned_to_user_id=? AND t.status<>'overridden'
      AND (? IS NULL OR t.assigned_to_agency_id=?)
      AND (?='super_admin' OR EXISTS(SELECT 1 FROM user_agencies ua
        WHERE ua.user_id=? AND ua.agency_id=t.assigned_to_agency_id AND COALESCE(ua.is_active,1)=1))
    ORDER BY s.signed_at IS NULL,s.signed_at,t.id`,
  [actor.id,actor.id,agencyId,agencyId,actor.role,actor.id]);
  return rows.flatMap(row => {
    const signed = row.signed_user_id ? {...row,user_id:row.signed_user_id} : null;
    const state = documentSignerAccess(row,signed,actor);
    if (state.superseded || state.countersigned) return [];
    return [{id:row.id,title:row.title,documentTaskId:row.document_task_id,
      employeeName:row.employee_name,agencyName:row.agency_name,agencyId:row.assigned_to_agency_id,
      signedAt:row.signed_at,dueDate:row.due_date,
      state:state.canCountersign?'ready':state.signerMismatch || state.signed?'needs_review':'waiting'}];
  });
}

export async function assertCountersignTaskCompletion(taskId, db = pool) {
  const [[task]] = await db.execute('SELECT document_action_type FROM tasks WHERE id=?',[taskId]);
  if (task?.document_action_type === 'countersignature') {
    throw Object.assign(Error('Review and countersign the document to complete this task. It closes automatically after your signature is saved.'), {status:409});
  }
}
