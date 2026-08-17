/**
 * Agency follow-up when a school intake flags another guardian with
 * medical decision-making rights who still needs their own forms.
 */
import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import { notifyTaskAddedToList } from './taskNotifications.service.js';

const DEFAULT_AGENCY_ID = Number(process.env.SCHOOL_INTAKE_REVIEW_AGENCY_ID || 2);
const TASK_LIST_NAME = 'Secondary Guardian Follow-up';
const SOURCE_REF_TYPE = 'secondary_guardian_intake';

function parseMemberUserIds() {
  const raw = process.env.SECONDARY_GUARDIAN_FOLLOWUP_USER_IDS
    || process.env.SCHOOL_INTAKE_REVIEW_USER_IDS
    || '8,501';
  return [...new Set(
    String(raw)
      .split(',')
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
}

function defaultAssigneeUserId() {
  return parseMemberUserIds()[0] || 8;
}

async function ensureTaskList({ agencyId, actorUserId }) {
  const aid = Number(agencyId || DEFAULT_AGENCY_ID);
  const envListId = Number(process.env.SECONDARY_GUARDIAN_FOLLOWUP_TASK_LIST_ID || 0);
  if (envListId > 0) {
    const existing = await TaskList.findById(envListId);
    if (existing) return existing;
  }

  const [rows] = await pool.execute(
    `SELECT id FROM task_lists WHERE agency_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
    [aid, TASK_LIST_NAME]
  );
  let list = rows?.[0]?.id ? await TaskList.findById(rows[0].id) : null;
  if (!list) {
    list = await TaskList.create({
      agencyId: aid,
      name: TASK_LIST_NAME,
      createdByUserId: actorUserId || defaultAssigneeUserId()
    });
  }

  for (const userId of parseMemberUserIds()) {
    const role = Number(userId) === Number(actorUserId) ? 'admin' : 'editor';
    try {
      await TaskListMember.add(list.id, userId, role);
    } catch {
      /* already a member */
    }
  }
  return list;
}

async function findExistingTask(sourceRefId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id FROM tasks
       WHERE source_ref_type = ? AND source_ref_id = ?
       ORDER BY id DESC LIMIT 1`,
      [SOURCE_REF_TYPE, String(sourceRefId)]
    );
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ created: boolean, taskId: number|null, reason?: string }}
 */
export async function maybeCreateSecondaryGuardianFollowUpTask({
  agencyId,
  clientIds = [],
  submissionId = null,
  publicKey = null,
  guardian = {},
  invite = null,
  actorUserId = null,
  source = 'school'
} = {}) {
  const rights = String(guardian.other_guardian_has_legal_rights || '').trim().toLowerCase();
  if (rights !== 'yes' && rights !== 'shared') {
    return { created: false, taskId: null, reason: 'not_needed' };
  }
  const aid = Number(agencyId || DEFAULT_AGENCY_ID);
  if (!aid) return { created: false, taskId: null, reason: 'no_agency' };

  const ids = [...new Set((Array.isArray(clientIds) ? clientIds : []).map((n) => Number(n)).filter(Boolean))];
  const primaryClientId = ids[0] || 0;
  const sid = Number(submissionId || 0);
  const sourceRefId = sid && primaryClientId
    ? `${sid}:${primaryClientId}`
    : (invite?.inviteId ? `invite:${invite.inviteId}` : `client:${primaryClientId || 'unknown'}`);

  const existing = await findExistingTask(sourceRefId);
  if (existing) return { created: false, taskId: existing, reason: 'already_exists' };

  const name = [guardian.other_guardian_first_name, guardian.other_guardian_last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || '(name not given)';
  const email = String(guardian.other_guardian_email || '').trim() || '(none)';
  const phone = String(guardian.other_guardian_phone || '').trim() || '(none)';
  const relationship = String(guardian.other_guardian_relationship || '').trim() || '(not given)';
  const queued = String(guardian.other_guardian_send_intake_link || '').toLowerCase() === 'no'
    || String(source || '').toLowerCase() === 'school';

  const list = await ensureTaskList({ agencyId: aid, actorUserId: actorUserId || 501 });
  const assigneeId = defaultAssigneeUserId();
  const title = `Secondary guardian intake needed: ${name}`;
  const description = [
    'A school intake listed another parent/guardian with medical decision-making rights.',
    'Agency action: ensure they receive and complete their own consent/intake forms, then follow up until submitted.',
    '',
    `Secondary guardian: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Relationship: ${relationship}`,
    `Legal rights: ${rights}`,
    `Email status: ${queued ? 'queued / not auto-sent (send when Secondary Guardian email settings are ready)' : 'invite email attempted'}`,
    invite?.inviteId ? `Invite ID: ${invite.inviteId}` : '',
    invite?.inviteUrl ? `Invite URL: ${invite.inviteUrl}` : '',
    publicKey ? `Intake public key: ${publicKey}` : '',
    sid ? `Submission ID: ${sid}` : '',
    ids.length ? `Client IDs: ${ids.join(', ')}` : '',
    '',
    'Do not create a portal login or temporary password unless they request one.'
  ].filter(Boolean).join('\n');

  const task = await Task.create({
    taskType: 'custom',
    title,
    description,
    encryptDescription: true,
    isPrivate: false,
    assignedToUserId: assigneeId,
    assignedToAgencyId: aid,
    assignedByUserId: actorUserId || assigneeId,
    taskListId: list.id,
    urgency: 'high',
    categories: ['schools'],
    sourceRefType: SOURCE_REF_TYPE,
    sourceRefId,
    metadata: {
      clientIds: ids,
      submissionId: sid || null,
      inviteId: invite?.inviteId || null,
      publicKey: publicKey || null,
      source: String(source || 'school'),
      secondaryGuardian: {
        name,
        email,
        phone,
        relationship,
        rights
      }
    }
  });

  try {
    await notifyTaskAddedToList({
      taskId: task.id,
      taskListId: list.id,
      actorUserId: actorUserId || assigneeId
    });
  } catch {
    /* non-fatal */
  }

  return { created: true, taskId: task.id };
}
