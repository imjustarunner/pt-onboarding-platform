import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { decryptChatText } from './chatEncryption.service.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
import { viewerMaySeeNotification } from '../utils/notificationPersonalScope.js';
import { loadOfficeWorkspaceAssignments } from './superviseeWorkspaceAssignments.service.js';
import { exchangeProviderSql } from '../utils/clientExchangeProvider.js';

export const workspaceSections = new Set(['counts', 'tasks', 'documents', 'work', 'communications', 'assignments', 'performance']);

async function counts(scope, db) {
  const [[row]] = await db.execute(`SELECT
    (SELECT COUNT(*) FROM tasks t LEFT JOIN task_lists l ON l.id=t.task_list_id WHERE t.assigned_to_user_id=? AND COALESCE(t.is_private,0)=0 AND t.status NOT IN ('completed','overridden','cancelled') AND (t.task_list_id IS NULL OR l.agency_id=?) AND (t.assigned_to_agency_id=? OR (t.assigned_to_agency_id IS NULL AND l.agency_id=?))) tasks,
    (SELECT COUNT(*) FROM note_aid_work_queue_items WHERE user_id=? AND agency_id=? AND status IN ('not_started','started')) work`, [scope.providerUserId,scope.agencyId,scope.agencyId,scope.agencyId,scope.providerUserId,scope.agencyId]);
  return { tasks: Number(row.tasks), work: Number(row.work) };
}

// Small cohorts and sparse histories must not produce authoritative-looking ranks.
export function benchmarkMetric(rows, providerId, { minimumSamples = 5, minimumPeers = 5 } = {}) {
  const valid = rows.map(r => ({ providerId: Number(r.provider_id), hours: r.average_hours == null ? null : Number(r.average_hours), samples: Number(r.samples) }))
    .filter(r => r.hours != null && Number.isFinite(r.hours) && r.hours >= 0 && r.samples > 0);
  const own = valid.find(r => r.providerId === Number(providerId));
  const cohort = valid.filter(r => r.samples >= minimumSamples);
  const result = { averageHours: own?.hours ?? null, samples: own?.samples || 0, cohortSize: cohort.length, minimumSamples, minimumPeers, organizationAverageHours: null, percentile: null, band: null };
  if (cohort.length) result.organizationAverageHours = cohort.reduce((sum, r) => sum + r.hours, 0) / cohort.length;
  if (!own || own.samples < minimumSamples || cohort.length < minimumPeers) return result;
  if (cohort.every(r => r.hours === own.hours)) return { ...result, band: 'All measured providers tied' };
  const faster = cohort.filter(r => r.hours < own.hours).length;
  const tied = cohort.filter(r => r.hours === own.hours).length;
  const percentile = 100 * (faster + (tied + 1) / 2) / cohort.length;
  const band = percentile <= 5 ? 'Top 5%' : percentile <= 10 ? 'Top 10%' : percentile <= 25 ? 'Top 25%' : percentile <= 50 ? 'Top 50%' : percentile <= 75 ? 'Bottom 50%' : percentile <= 90 ? 'Bottom 25%' : percentile <= 95 ? 'Bottom 10%' : 'Bottom 5%';
  return { ...result, percentile, band };
}

const utcTime = value => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value) ? `${value.replace(' ', 'T')}Z` : value).getTime();
export function noteCompletionMetrics(notes, actualEnds, activeProviders, now = Date.now()) {
  const ends = new Map(actualEnds.map(r => [`${r.appointment_id}:${r.provider_user_id}`, utcTime(r.ended_at)]));
  const groups = new Map();
  for (const note of notes) {
    const provider = Number(note.provider_id);
    if (!activeProviders.has(provider)) continue;
    const actualEnd = ends.get(`${note.appointment_id}:${provider}`);
    const end = Number.isFinite(actualEnd) ? actualEnd : utcTime(note.scheduled_end_at);
    const signature = utcTime(note.provider_signed_at);
    if (!Number.isFinite(end) || !Number.isFinite(signature) || end < now - 90 * 86400000 || end > now || signature < end || signature > now) continue;
    const group = groups.get(provider) || { provider_id: provider, total_hours: 0, samples: 0, actualEndSamples: 0, scheduledEndSamples: 0 };
    group.total_hours += (signature - end) / 3600000;
    group.samples++;
    if (Number.isFinite(actualEnd)) group.actualEndSamples++; else group.scheduledEndSamples++;
    groups.set(provider, group);
  }
  return [...groups.values()].map(g => ({ ...g, average_hours: g.total_hours / g.samples }));
}

async function tasks(scope, db) {
  // Personal lists and private tasks remain private; assignment alone never makes
  // a task from another tenant visible through supervision.
  const where = `t.assigned_to_user_id=? AND COALESCE(t.is_private,0)=0 AND t.status NOT IN ('completed','overridden','cancelled')
    AND (t.task_list_id IS NULL OR l.agency_id=?)
    AND (t.assigned_to_agency_id=? OR (t.assigned_to_agency_id IS NULL AND l.agency_id=?))`;
  const params = [scope.providerUserId, scope.agencyId, scope.agencyId, scope.agencyId];
  const [[count]] = await db.execute(`SELECT COUNT(*) total FROM tasks t LEFT JOIN task_lists l ON l.id=t.task_list_id WHERE ${where}`, params);
  const [items] = await db.execute(`SELECT t.id,t.title,t.task_type AS type,t.status,t.due_date AS dueAt,t.urgency FROM tasks t LEFT JOIN task_lists l ON l.id=t.task_list_id WHERE ${where} ORDER BY t.due_date IS NULL,t.due_date,t.id DESC LIMIT 200`, params);
  return { items, total: Number(count.total), description: 'Open organization tasks assigned directly to this provider. Private tasks and personal lists are excluded.' };
}

async function documents(scope, db) {
  const where = `t.task_type='document' AND t.assigned_to_user_id=? AND COALESCE(t.is_private,0)=0
    AND (t.task_list_id IS NULL OR l.agency_id=?)
    AND (t.assigned_to_agency_id=? OR (t.assigned_to_agency_id IS NULL AND l.agency_id=?))`;
  const params = [scope.providerUserId, scope.agencyId, scope.agencyId, scope.agencyId];
  const [[count]] = await db.execute(`SELECT COUNT(*) total FROM tasks t LEFT JOIN task_lists l ON l.id=t.task_list_id WHERE ${where}`, params);
  const [items] = await db.execute(`SELECT t.id,t.id AS task_id,t.title AS task_title,t.title AS document_title,t.status AS task_status,t.reference_id,t.document_action_type,t.due_date AS dueAt,t.completed_at AS completedAt FROM tasks t LEFT JOIN task_lists l ON l.id=t.task_list_id
    WHERE ${where} ORDER BY t.created_at DESC,t.id DESC LIMIT 200`, params);
  return { items, total: Number(count.total), description: 'Document assignment history from organization tasks, including completed assignments. Private tasks, personal lists and assignments without an organization are excluded. Document contents keep their existing access permissions.' };
}

async function work(scope, db) {
  const params = [scope.providerUserId, scope.agencyId];
  const [[count]] = await db.execute("SELECT COUNT(*) total FROM note_aid_work_queue_items WHERE user_id=? AND agency_id=? AND status IN ('not_started','started')", params);
  const [items] = await db.execute(`SELECT id,client_id AS clientId,date_of_service AS serviceDate,note_kind AS noteKind,status,clinical_note_id AS noteId,created_at AS createdAt FROM note_aid_work_queue_items
    WHERE user_id=? AND agency_id=? AND status IN ('not_started','started') ORDER BY date_of_service,id LIMIT 200`, params);
  return { items, total: Number(count.total), description: 'Provider My Work items saved in the current Note Workspace. Personal or unscoped items are excluded. Clinical document review is a separate queue.' };
}

async function communications(scope, db, viewerId) {
  const [messages] = await db.execute(`SELECT m.id,m.thread_id AS threadId,m.sender_user_id AS senderId,m.created_at AS createdAt,m.body,m.body_ciphertext,m.body_iv,m.body_auth_tag,m.encryption_key_id,
    CONCAT(COALESCE(NULLIF(u.preferred_name,''),u.first_name),' ',u.last_name) AS senderName
    FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id JOIN users u ON u.id=m.sender_user_id
    WHERE t.agency_id=? AND EXISTS(SELECT 1 FROM chat_thread_participants p WHERE p.thread_id=t.id AND p.user_id=?)
    AND EXISTS(SELECT 1 FROM chat_thread_participants p WHERE p.thread_id=t.id AND p.user_id=?)
    AND m.sender_user_id IN (?,?) ORDER BY m.id DESC LIMIT 100`, [scope.agencyId, viewerId, scope.providerUserId, viewerId, scope.providerUserId]);
  const items = messages.map(m => {
    let body = m.body || '';
    if (!body && m.body_ciphertext) {
      try { body = decryptChatText({ ciphertextB64: m.body_ciphertext, ivB64: m.body_iv, authTagB64: m.body_auth_tag, keyId: m.encryption_key_id }); } catch { body = 'Message unavailable. Open the conversation to retry.'; }
    }
    return { id: m.id, threadId: m.threadId, senderId: m.senderId, senderName: m.senderName, createdAt: m.createdAt, body };
  });
  const [notificationRows] = await db.execute(`SELECT id,user_id,type,title,created_at AS createdAt,is_resolved AS isResolved FROM notifications WHERE agency_id=? AND user_id=? ORDER BY id DESC LIMIT 100`, [scope.agencyId, scope.providerUserId]);
  // Supervision never grants access to another user's personal notification feed.
  // Retain the central notification policy for managed operational events.
  const notifications = notificationRows.filter(n => viewerMaySeeNotification(n, viewerId, { allowManagedAgencyEvents: scope.viewerIsAdmin === true }))
    .map(n => ({ id: n.id, type: n.type, title: n.title, createdAt: n.createdAt, isResolved: n.isResolved }));
  return { items, notifications, total: items.length + notifications.length, description: 'Messages in conversations you share with this provider. App notices follow existing notification permissions; personal notifications and other private conversations are excluded.', limited: true };
}

async function assignments(scope, db) {
  const [schools] = await db.execute(`SELECT p.id,a.id AS organizationId,a.name,a.slug,a.logo_path AS logoPath,p.day_of_week AS day,p.start_time AS startTime,p.end_time AS endTime,p.slots_total AS slotsTotal,p.slots_available AS slotsAvailable,
    (SELECT COUNT(DISTINCT c.id) FROM clients c WHERE c.agency_id=? AND (c.organization_id=a.id OR EXISTS(SELECT 1 FROM client_organization_assignments ca WHERE ca.client_id=c.id AND ca.organization_id=a.id AND ca.is_active=1)) AND UPPER(COALESCE(c.status,''))<>'ARCHIVED' AND ((c.provider_id=? AND NOT EXISTS(SELECT 1 FROM client_provider_assignments current_cp WHERE current_cp.client_id=c.id AND current_cp.organization_id=a.id AND current_cp.is_active=1)) OR EXISTS(SELECT 1 FROM client_provider_assignments cp WHERE cp.client_id=c.id AND cp.organization_id=a.id AND cp.provider_user_id=? AND cp.is_active=1))) AS clients
    FROM provider_school_assignments p JOIN agencies a ON a.id=p.school_organization_id JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
    WHERE p.provider_user_id=? AND p.is_active=1 ORDER BY a.name,FIELD(p.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday')`, [scope.agencyId, scope.providerUserId, scope.providerUserId, scope.agencyId, scope.providerUserId]);
  const [legacyOffices] = await db.execute(`SELECT a.id,l.name,r.name AS room,a.assignment_type AS type,a.start_at AS startAt,a.end_at AS endAt,l.timezone FROM office_room_assignments a JOIN office_rooms r ON r.id=a.room_id JOIN office_locations l ON l.id=r.location_id
    WHERE a.assigned_user_id=? AND l.agency_id=? AND (a.end_at IS NULL OR a.end_at>=UTC_TIMESTAMP()) ORDER BY a.start_at LIMIT 200`, [scope.providerUserId, scope.agencyId]);
  const standing = await loadOfficeWorkspaceAssignments(scope, db);
  const offices = [...standing, ...legacyOffices.map(row => ({ ...row, kind: 'legacy' }))];
  return { schools, offices, total: schools.length + offices.length, description: 'Active school assignments, recurring office reservations and current or upcoming room assignments. School client counts are distinct active clients across the school, not daily booked sessions. Reservation rows describe recurrence rules; do not sum them as future session slots.' };
}

async function performance(scope, db, clinicalDb) {
  const [replyRows] = await db.execute(`SELECT provider_id,AVG(TIMESTAMPDIFF(SECOND,inquiry_at,reply_at)/3600.0) average_hours,COUNT(*) samples FROM (
    SELECT reply.sender_user_id provider_id,reply.id,MIN(inquiry.created_at) inquiry_at,reply.created_at reply_at
    FROM chat_messages inquiry JOIN users author ON author.id=inquiry.sender_user_id AND author.role IN ('client','client_guardian')
    JOIN chat_threads t ON t.id=inquiry.thread_id AND t.client_id IS NOT NULL
    JOIN chat_messages reply ON reply.id=(SELECT r.id FROM chat_messages r JOIN users ru ON ru.id=r.sender_user_id
      WHERE r.thread_id=inquiry.thread_id AND COALESCE(r.topic_id,0)=COALESCE(inquiry.topic_id,0) AND r.id>inquiry.id AND (ru.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR ru.has_provider_access=1) ORDER BY r.id LIMIT 1)
    JOIN user_agencies ua ON ua.user_id=reply.sender_user_id AND ua.agency_id=t.agency_id AND ua.is_active=1
    WHERE t.agency_id=? AND inquiry.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY) AND reply.created_at<=UTC_TIMESTAMP() AND reply.created_at>=inquiry.created_at
    GROUP BY reply.sender_user_id,reply.id,reply.created_at
    ) intervals GROUP BY provider_id`, [scope.agencyId]);
  const [members] = await db.execute(`SELECT ua.user_id FROM user_agencies ua JOIN users u ON u.id=ua.user_id
    WHERE ua.agency_id=? AND ${exchangeProviderSql}`, [scope.agencyId]);
  const activeProviders = new Set(members.map(r => Number(r.user_id)));
  const [actualEnds] = await db.execute(`SELECT appointment_id,provider_user_id,MAX(ended_at) AS ended_at FROM counseling_sessions WHERE agency_id=? AND appointment_id IS NOT NULL AND ended_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY) AND ended_at<=UTC_TIMESTAMP() GROUP BY appointment_id,provider_user_id`, [scope.agencyId]);
  const [notes] = await clinicalDb.execute(`SELECT COALESCE(n.provider_signed_by_user_id,s.provider_user_id,n.created_by_user_id) AS provider_id,s.appointment_id,s.scheduled_end_at,n.provider_signed_at
    FROM clinical_notes n JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id
    WHERE n.agency_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}
    AND n.provider_signed_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY) AND n.provider_signed_at<=UTC_TIMESTAMP()`, [scope.agencyId]);
  const noteRows = noteCompletionMetrics(notes, actualEnds, activeProviders);
  const ownNoteRow = noteRows.find(r => r.provider_id === scope.providerUserId);
  return { windowDays: 90, reply: benchmarkMetric(replyRows.filter(r => activeProviders.has(Number(r.provider_id))), scope.providerUserId), notes: { ...benchmarkMetric(noteRows, scope.providerUserId), actualEndSamples: ownNoteRow?.actualEndSamples || 0, scheduledEndSamples: ownNoteRow?.scheduledEndSamples || 0 },
    description: 'Lower elapsed time ranks higher. Comparisons use providers in this organization with at least 5 measured responses/notes; ranks require at least 5 providers. Organization average weights each eligible provider equally.',
    replyCoverage: 'Secure client/guardian conversations only. Each first provider reply is measured from the earliest unanswered client message in that topic. Unanswered inquiries, SMS, calls and email are not measured yet. Elapsed time includes nights and weekends.',
    noteCoverage: 'Shared signed clinical notes measured from recorded counseling-session end to provider signature where linked by appointment and signing provider. Other sessions use scheduled end as a proxy, with those sample counts shown separately. Unsigned notes, records without a usable end time and notes signed before session end are excluded; this average does not measure outstanding work.' };
}

export async function loadSuperviseeWorkspace(scope, section, { db = pool, clinicalDb = clinicalPool, viewerId } = {}) {
  if (!workspaceSections.has(section)) throw Object.assign(new Error('Choose a valid supervision section'), { status: 400 });
  const loaders = { counts, tasks, documents, work, assignments, communications: (s, d) => communications(s, d, viewerId), performance: (s, d) => performance(s, d, clinicalDb) };
  return loaders[section](scope, db);
}
