import pool from '../config/database.js';
import TaskAssignmentService from './taskAssignment.service.js';
import SignedDocument from '../models/SignedDocument.model.js';
import { isPilotSchoolStaffUser } from '../utils/pilotOrgs.js';

export const SCHOOL_STAFF_WAIVER_TEMPLATE_NAME = 'School Staff Account & Access Waiver (Pilot)';
export const SCHOOL_STAFF_WAIVER_TASK_TITLE = 'Sign School Staff Waiver';
export const SCHOOL_STAFF_WAIVER_METADATA_KEY = 'school_staff_waiver_pilot_v1';

async function findActiveWaiverTemplate() {
  const [rows] = await pool.execute(
    `SELECT id, name, version
     FROM document_templates
     WHERE name = ?
       AND is_active = TRUE
       AND agency_id IS NULL
     ORDER BY version DESC, id DESC
     LIMIT 1`,
    [SCHOOL_STAFF_WAIVER_TEMPLATE_NAME]
  );
  return rows?.[0] || null;
}

async function findExistingWaiverTask({ userId, templateId }) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM tasks
     WHERE task_type = 'document'
       AND assigned_to_user_id = ?
       AND reference_id = ?
       AND title = ?
     ORDER BY
       CASE status
         WHEN 'pending' THEN 0
         WHEN 'in_progress' THEN 1
         WHEN 'completed' THEN 2
         WHEN 'overridden' THEN 3
         ELSE 4
       END ASC,
       id DESC
     LIMIT 1`,
    [userId, templateId, SCHOOL_STAFF_WAIVER_TASK_TITLE]
  );
  return rows?.[0] || null;
}

async function ensureWaiverTask({ userId, templateId }) {
  const existing = await findExistingWaiverTask({ userId, templateId });
  if (existing) return existing;
  return TaskAssignmentService.assignDocumentTask({
    title: SCHOOL_STAFF_WAIVER_TASK_TITLE,
    description: 'Required once for pilot school staff access.',
    documentTemplateId: Number(templateId),
    assignedByUserId: Number(userId),
    assignedToUserId: Number(userId),
    metadata: {
      waiverKey: SCHOOL_STAFF_WAIVER_METADATA_KEY,
      source: 'school_staff_my_documents_gate'
    },
    documentActionType: 'signature'
  });
}

export async function resolveSchoolStaffWaiverStatus({ user, organization }) {
  const role = String(user?.role || '').toLowerCase();
  const userId = Number(user?.id || 0);
  const isPilotUser = isPilotSchoolStaffUser({ role, organization });

  if (!isPilotUser || !userId) {
    return {
      pilotEnabled: false,
      required: false,
      isSigned: false,
      taskId: null,
      templateId: null
    };
  }

  const template = await findActiveWaiverTemplate();
  if (!template?.id) {
    throw new Error('School staff waiver template is not available.');
  }

  const task = await ensureWaiverTask({ userId, templateId: template.id });
  const signed = task?.id ? await SignedDocument.findByTask(task.id) : null;
  const signedPdfPath = String(signed?.signed_pdf_path || '').trim();
  const isSigned = Boolean(signed?.id) && Boolean(signedPdfPath);

  return {
    pilotEnabled: true,
    required: true,
    isSigned,
    taskId: Number(task?.id || 0) || null,
    taskStatus: String(task?.status || '').trim().toLowerCase() || null,
    templateId: Number(template.id),
    templateName: template.name || SCHOOL_STAFF_WAIVER_TEMPLATE_NAME,
    signedDocumentId: Number(signed?.id || 0) || null
  };
}

