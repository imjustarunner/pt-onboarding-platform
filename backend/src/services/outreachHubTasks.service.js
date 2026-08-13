import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import TaskLink from '../models/TaskLink.model.js';
import { getOutreachSchool } from './outreachHub.service.js';
import config from '../config/config.js';

export const OUTREACH_TASK_LIST_NAME = 'Outreach';
export const OUTREACH_SOURCE_REF = 'outreach_school';

function frontendBase() {
  return String(config.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/$/, '') || 'https://plottwisthq.com';
}

function outreachSchoolUrl(schoolId) {
  return `${frontendBase()}/admin/outreach-hub?school=${Number(schoolId)}`;
}

async function listOutreachMemberUserIds(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin', 'support')
        OR COALESCE(u.has_outreach_access, 0) = 1`,
    [aid]
  );
  return (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
}

export async function ensureOutreachTaskList({ agencyId, actorUserId = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }
  const [rows] = await pool.execute(
    `SELECT id FROM task_lists WHERE agency_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
    [aid, OUTREACH_TASK_LIST_NAME]
  );
  let list = rows?.[0]?.id ? await TaskList.findById(rows[0].id) : null;
  if (!list) {
    list = await TaskList.create({
      agencyId: aid,
      name: OUTREACH_TASK_LIST_NAME,
      createdByUserId: actorUserId || 501
    });
  }
  const memberIds = new Set(await listOutreachMemberUserIds(aid));
  if (actorUserId) memberIds.add(Number(actorUserId));
  for (const userId of memberIds) {
    const role = Number(userId) === Number(actorUserId) ? 'admin' : 'editor';
    await TaskListMember.add(list.id, userId, role);
  }
  return list;
}

export async function tagTaskToOutreachSchool(taskId, {
  agencyId,
  schoolId,
  actorUserId = null,
  school = null
} = {}) {
  const tid = Number(taskId || 0);
  const sid = Number(schoolId || 0);
  if (!tid || !sid) return null;
  const row = school || await getOutreachSchool(agencyId, sid);
  if (!row) return null;
  const existing = await Task.findById(tid);
  const prev = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
  const nextMeta = {
    ...prev,
    outreachSchoolId: sid,
    schoolName: row.name,
    districtName: row.district_name || null,
    linkedOrganizationId: row.linked_organization_id || null
  };
  try {
    await pool.execute(
      `UPDATE tasks
       SET outreach_school_id = ?,
           source_ref_type = COALESCE(source_ref_type, ?),
           source_ref_id = COALESCE(source_ref_id, ?),
           metadata = ?
       WHERE id = ?`,
      [sid, OUTREACH_SOURCE_REF, String(sid), JSON.stringify(nextMeta), tid]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await Task.updateCustomTask(tid, { metadata: nextMeta });
  }
  const links = await TaskLink.listForTask(tid);
  const already = (links || []).some((l) => String(l.url || '').includes(`school=${sid}`));
  if (!already) {
    await TaskLink.create({
      taskId: tid,
      url: outreachSchoolUrl(sid),
      label: row.name,
      createdByUserId: actorUserId || null
    });
  }
  return Task.findById(tid);
}

export function serializeOutreachTask(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === 'object'
    ? row.metadata
    : (typeof Task.parseMetadata === 'function' ? Task.parseMetadata(row.metadata) : {});
  return {
    ...row,
    metadata: meta,
    school_tag: String(row.school_tag || meta?.schoolName || '').trim() || null,
    outreach_school_id: Number(row.outreach_school_id || meta?.outreachSchoolId || 0) || null
  };
}

export async function listOutreachSchoolTasks(agencyId, schoolId) {
  const aid = Number(agencyId || 0);
  const sid = Number(schoolId || 0);
  if (!aid || !sid) return [];
  const orderBy = `ORDER BY
       CASE t.status WHEN 'completed' THEN 1 ELSE 0 END,
       CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       (t.due_date IS NULL), t.due_date ASC,
       t.created_at DESC`;
  let rows;
  try {
    const [result] = await pool.execute(
      `SELECT t.*,
              tl.name AS task_list_name,
              os.name AS school_tag,
              assignee.first_name AS assignee_first_name,
              assignee.last_name AS assignee_last_name
       FROM tasks t
       LEFT JOIN task_lists tl ON tl.id = t.task_list_id
       LEFT JOIN outreach_schools os ON os.id = t.outreach_school_id
       LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
       WHERE t.assigned_to_agency_id = ?
         AND (
           t.outreach_school_id = ?
           OR JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.outreachSchoolId')) = ?
           OR (t.source_ref_type = ? AND t.source_ref_id = ?)
         )
       ${orderBy}`,
      [aid, sid, String(sid), OUTREACH_SOURCE_REF, String(sid)]
    );
    rows = result;
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    const [result] = await pool.execute(
      `SELECT t.*,
              tl.name AS task_list_name,
              assignee.first_name AS assignee_first_name,
              assignee.last_name AS assignee_last_name
       FROM tasks t
       LEFT JOIN task_lists tl ON tl.id = t.task_list_id
       LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
       WHERE t.assigned_to_agency_id = ?
         AND (
           JSON_UNQUOTE(JSON_EXTRACT(t.metadata, '$.outreachSchoolId')) = ?
           OR (t.source_ref_type = ? AND t.source_ref_id = ?)
         )
       ${orderBy}`,
      [aid, String(sid), OUTREACH_SOURCE_REF, String(sid)]
    );
    rows = result;
  }
  return (rows || []).map((row) => serializeOutreachTask({
    ...row,
    metadata: Task.parseMetadata(row.metadata)
  }));
}

export async function createOutreachSchoolTask({
  agencyId,
  schoolId,
  actorUserId,
  title,
  description = null,
  dueDate = null,
  assignedToUserId = null,
  urgency = 'medium'
} = {}) {
  const school = await getOutreachSchool(agencyId, schoolId);
  if (!school) {
    const err = new Error('School not found');
    err.status = 404;
    throw err;
  }
  const titleStr = String(title || '').trim();
  if (!titleStr) {
    const err = new Error('title is required');
    err.status = 400;
    throw err;
  }
  const list = await ensureOutreachTaskList({ agencyId, actorUserId });
  const assignee = assignedToUserId != null && assignedToUserId !== ''
    ? Number(assignedToUserId)
    : Number(actorUserId || 0) || null;
  if (assignee) {
    await TaskListMember.add(list.id, assignee, 'editor');
  }
  const task = await Task.create({
    taskType: 'custom',
    title: titleStr,
    description: description ? String(description).trim() || null : null,
    assignedToUserId: assignee,
    assignedToAgencyId: Number(agencyId),
    assignedByUserId: actorUserId || null,
    dueDate: dueDate || null,
    taskListId: list.id,
    urgency: ['low', 'medium', 'high'].includes(String(urgency || '')) ? urgency : 'medium',
    categories: ['schools'],
    sourceRefType: OUTREACH_SOURCE_REF,
    sourceRefId: String(schoolId),
    metadata: {
      outreachSchoolId: Number(schoolId),
      schoolName: school.name,
      districtName: school.district_name || null,
      linkedOrganizationId: school.linked_organization_id || null
    }
  });
  await tagTaskToOutreachSchool(task.id, {
    agencyId,
    schoolId,
    actorUserId,
    school
  });
  const rows = await listOutreachSchoolTasks(agencyId, schoolId);
  return rows.find((t) => Number(t.id) === Number(task.id)) || serializeOutreachTask(task);
}
