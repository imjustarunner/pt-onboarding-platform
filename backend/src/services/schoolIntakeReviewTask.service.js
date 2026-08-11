/**
 * Creates shared-list tasks when a real ITSCO school digital packet intake
 * is submitted with PSC-17 questionnaire data (clinical summary for billing).
 * Limited to Medicaid or unknown insurance. Description is encrypted at rest.
 */
import pool from '../config/database.js';
import Task from '../models/Task.model.js';
import TaskList from '../models/TaskList.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import Client from '../models/Client.model.js';
import {
  isHogwartsDemoSchoolOrg,
  resolveOrganizationSlug
} from '../constants/schoolPrintablePacket.js';
import { notifyTaskAddedToList } from './taskNotifications.service.js';

const ITSCO_AGENCY_ID = Number(process.env.SCHOOL_INTAKE_REVIEW_AGENCY_ID || 2);
const TASK_LIST_NAME = 'School Intake Review';
const SOURCE_REF_TYPE = 'school_intake_review';
const MIN_PSC_ANSWERS = Number(process.env.SCHOOL_INTAKE_REVIEW_MIN_PSC_ANSWERS || 10);

const MEDICAID_KEYWORDS = [
  'medicaid',
  'health first colorado',
  'ccha',
  'colorado community health alliance',
  'chp+',
  'child health plan',
  'aetna better health',
  'beacon health options',
  'colorado access medicaid',
  'denver health medicaid',
  'rocky mountain health plans medicaid',
  'intellisource',
  'denver health advantage',
  'colorado choice health plans'
];

function parseMemberUserIds() {
  const raw = process.env.SCHOOL_INTAKE_REVIEW_USER_IDS || '8,501';
  return [...new Set(
    String(raw)
      .split(',')
      .map((s) => parseInt(String(s).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
}

function defaultAssigneeUserId() {
  const ids = parseMemberUserIds();
  return ids[0] || 8;
}

function countPscAnswers(intakeData, clientIndex = 0) {
  const responses = intakeData?.responses || intakeData || {};
  const clientResponses = Array.isArray(responses?.clients)
    ? (responses.clients[clientIndex] || {})
    : {};
  let answered = 0;
  for (let i = 1; i <= 17; i += 1) {
    const raw = clientResponses[`psc_${i}`];
    if (raw === undefined || raw === null) continue;
    if (String(raw).trim() === '') continue;
    answered += 1;
  }
  return answered;
}

function isExcludedDemoSchool(org) {
  if (!org) return true;
  if (isHogwartsDemoSchoolOrg(org)) return true;
  const slug = resolveOrganizationSlug(org);
  const demoSlugs = new Set(['demo-school', 'demo', 'demo-itsco-legacy', 'demo-program', 'demo-k8-school']);
  if (demoSlugs.has(slug) || slug.startsWith('demo-')) return true;
  const name = String(org.name || '').trim().toLowerCase();
  if (name.startsWith('demo ') || name === 'demo') return true;
  return false;
}

function isMedicaidInsurerName(name = '') {
  const lower = String(name || '').trim().toLowerCase();
  if (!lower) return false;
  return MEDICAID_KEYWORDS.some((kw) => lower.includes(kw));
}

function normalizeIntakeSubmissionBag(intakeData) {
  const responses = intakeData?.responses && typeof intakeData.responses === 'object'
    ? intakeData.responses
    : {};
  const submission = responses?.submission && typeof responses.submission === 'object'
    ? responses.submission
    : (intakeData?.submission && typeof intakeData.submission === 'object' ? intakeData.submission : {});
  return submission;
}

/**
 * @returns {'medicaid'|'unknown'|'other'}
 */
export function resolveSchoolIntakeInsuranceCategory({ client = null, intakeData = null } = {}) {
  const insuranceKey = String(client?.insurance_type_key || '').trim().toLowerCase();
  if (insuranceKey === 'medicaid') return 'medicaid';
  if (insuranceKey === 'unknown') return 'unknown';

  const submission = normalizeIntakeSubmissionBag(intakeData);
  const insInfo = submission?.insuranceInfo && typeof submission.insuranceInfo === 'object'
    ? submission.insuranceInfo
    : null;

  const payerType = String(
    submission?.registrationPayerType || submission?.registration_payer_type || ''
  ).trim().toLowerCase();
  if (payerType === 'medicaid') return 'medicaid';

  if (insInfo?.primaryIsMedicaid) return 'medicaid';

  const nestedPrimary = String(insInfo?.primary?.insurerName || '').trim();
  if (isMedicaidInsurerName(nestedPrimary)) return 'medicaid';

  const flatPrimary = String(
    submission?.primary_insurance || submission?.primaryInsurance || ''
  ).trim();
  if (isMedicaidInsurerName(flatPrimary)) return 'medicaid';

  if (!nestedPrimary && !flatPrimary) return 'unknown';

  const combined = (nestedPrimary || flatPrimary).toLowerCase();
  if (combined === 'unknown' || combined.includes('unknown insurance')) return 'unknown';
  if (combined === 'other (not listed)' || combined === 'other not listed') return 'unknown';

  return 'other';
}

export function isEligibleSchoolIntakeInsuranceCategory(category) {
  return category === 'medicaid' || category === 'unknown';
}

async function findTaskBySource(submissionId, clientId) {
  const sourceRefId = `${Number(submissionId)}:${Number(clientId)}`;
  const [rows] = await pool.execute(
    `SELECT id FROM tasks WHERE source_ref_type = ? AND source_ref_id = ? LIMIT 1`,
    [SOURCE_REF_TYPE, sourceRefId]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

export async function ensureSchoolIntakeReviewTaskList({ actorUserId = 501 } = {}) {
  const envListId = Number(process.env.SCHOOL_INTAKE_REVIEW_TASK_LIST_ID || 0);
  if (envListId > 0) {
    const existing = await TaskList.findById(envListId);
    if (existing) return existing;
  }

  const [rows] = await pool.execute(
    `SELECT id FROM task_lists WHERE agency_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
    [ITSCO_AGENCY_ID, TASK_LIST_NAME]
  );
  let list = rows?.[0]?.id ? await TaskList.findById(rows[0].id) : null;
  if (!list) {
    list = await TaskList.create({
      agencyId: ITSCO_AGENCY_ID,
      name: TASK_LIST_NAME,
      createdByUserId: actorUserId || defaultAssigneeUserId()
    });
  }

  for (const userId of parseMemberUserIds()) {
    const role = Number(userId) === Number(actorUserId) ? 'admin' : 'editor';
    await TaskListMember.add(list.id, userId, role);
  }

  return list;
}

function formatDob(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatInsuranceLabel(category, { client, intakeData } = {}) {
  if (category === 'medicaid') return 'Medicaid';
  if (category === 'unknown') return 'Unknown';
  const submission = normalizeIntakeSubmissionBag(intakeData);
  const insInfo = submission?.insuranceInfo;
  const name = String(
    insInfo?.primary?.insurerName
    || submission?.primary_insurance
    || client?.insurance_type_label
    || client?.primary_insurer_name
    || 'Other'
  ).trim();
  return name || 'Other';
}

/**
 * @returns {Promise<{ created: boolean, taskId: number|null, reason?: string }>}
 */
export async function maybeCreateSchoolIntakeReviewTask({
  clientId,
  submissionId,
  clientIndex = 0,
  link,
  intakeData,
  actorUserId = null,
  submittedAt = null
} = {}) {
  const cid = Number(clientId || 0);
  const sid = Number(submissionId || 0);
  if (!cid || !sid) return { created: false, taskId: null, reason: 'missing_ids' };

  const scope = String(link?.scope_type || '').toLowerCase();
  const formType = String(link?.form_type || 'intake').toLowerCase();
  if (scope !== 'school' || formType !== 'intake') {
    return { created: false, taskId: null, reason: 'not_school_intake' };
  }

  const pscCount = countPscAnswers(intakeData, clientIndex);
  if (pscCount < MIN_PSC_ANSWERS) {
    return { created: false, taskId: null, reason: `insufficient_psc_${pscCount}` };
  }

  const client = await Client.findById(cid, { includeSensitive: true });
  if (!client) return { created: false, taskId: null, reason: 'client_not_found' };

  const insuranceCategory = resolveSchoolIntakeInsuranceCategory({ client, intakeData });
  if (!isEligibleSchoolIntakeInsuranceCategory(insuranceCategory)) {
    return { created: false, taskId: null, reason: `insurance_${insuranceCategory}` };
  }

  const agencyId = Number(client.agency_id || link?.agency_id || 0);
  if (agencyId !== ITSCO_AGENCY_ID) {
    return { created: false, taskId: null, reason: 'not_itsco_agency' };
  }

  const schoolOrgId = Number(client.organization_id || link?.organization_id || 0);
  let schoolOrg = null;
  if (schoolOrgId) {
    const [schoolRows] = await pool.execute(
      `SELECT id, name, slug, portal_url, organization_type FROM agencies WHERE id = ? LIMIT 1`,
      [schoolOrgId]
    );
    schoolOrg = schoolRows?.[0] || null;
  }
  if (isExcludedDemoSchool(schoolOrg)) {
    return { created: false, taskId: null, reason: 'demo_school' };
  }

  const existingTaskId = await findTaskBySource(sid, cid);
  if (existingTaskId) return { created: false, taskId: existingTaskId, reason: 'already_exists' };

  const { buildClinicalSummaryText } = await import('../controllers/publicIntake.controller.js');
  const clinicalSummaryText = buildClinicalSummaryText({ link, intakeData, clientIndex });
  const clientName =
    String(client.full_name || '').trim() ||
    `${String(client.first_name || '').trim()} ${String(client.last_name || '').trim()}`.trim() ||
    `Client #${cid}`;
  const schoolName = String(schoolOrg?.name || client.organization_name || 'School').trim();
  const submittedLabel = submittedAt
    ? new Date(submittedAt).toISOString()
    : new Date().toISOString();
  const insuranceLabel = formatInsuranceLabel(insuranceCategory, { client, intakeData });

  const list = await ensureSchoolIntakeReviewTaskList({ actorUserId: actorUserId || 501 });
  const assigneeId = defaultAssigneeUserId();
  const title = `New school intake: ${clientName} (${schoolName})`;
  const description = [
    'A school digital packet intake with PSC-17 was submitted.',
    '',
    `Client: ${clientName}`,
    `DOB: ${formatDob(client.date_of_birth)}`,
    `School: ${schoolName}`,
    `Insurance: ${insuranceLabel}`,
    `Submitted: ${submittedLabel}`,
    `Submission ID: ${sid}`,
    `Client ID: ${cid}`,
    `PSC-17 items answered: ${pscCount} / 17`,
    '',
    '--- Clinical summary (for note + claim) ---',
    clinicalSummaryText || '(Clinical summary text unavailable.)'
  ].join('\n');

  const task = await Task.create({
    taskType: 'custom',
    title,
    description,
    encryptDescription: true,
    isPrivate: true,
    assignedToUserId: assigneeId,
    assignedToAgencyId: ITSCO_AGENCY_ID,
    assignedByUserId: actorUserId || assigneeId,
    taskListId: list.id,
    urgency: 'high',
    categories: ['schools'],
    sourceRefType: SOURCE_REF_TYPE,
    sourceRefId: `${sid}:${cid}`,
    metadata: {
      clientId: cid,
      submissionId: sid,
      schoolOrganizationId: schoolOrgId || null,
      schoolName,
      pscAnswerCount: pscCount,
      insuranceCategory,
      submittedAt: submittedLabel
    }
  });

  notifyTaskAddedToList({
    task,
    listId: list.id,
    listName: list.name || TASK_LIST_NAME,
    agencyId: ITSCO_AGENCY_ID,
    actorUserId: actorUserId || assigneeId
  }).catch((err) => {
    console.warn('[schoolIntakeReviewTask] notifyTaskAddedToList failed:', err?.message || err);
  });

  return { created: true, taskId: task.id };
}

/**
 * Backfill candidates: submitted ITSCO school packet intakes since a date.
 */
export async function listSchoolIntakeReviewBackfillCandidates({ since = null } = {}) {
  const sinceDate = since ? new Date(since) : new Date('2026-08-06T00:00:00.000Z');
  const sinceIso = Number.isNaN(sinceDate.getTime())
    ? '2026-08-06 00:00:00'
    : sinceDate.toISOString().slice(0, 19).replace('T', ' ');

  const [rows] = await pool.execute(
    `SELECT DISTINCT
        c.id AS client_id,
        s.id AS submission_id,
        s.submitted_at,
        sch.id AS school_organization_id,
        sch.name AS school_name,
        sch.slug AS school_slug,
        sch.portal_url AS school_portal_url,
        sch.organization_type AS school_organization_type,
        c.insurance_type_id,
        it.insurance_key AS insurance_type_key,
        it.label AS insurance_type_label
     FROM clients c
     JOIN agencies sch ON sch.id = c.organization_id
     JOIN intake_submissions s ON (
       s.client_id = c.id
       OR s.id IN (
         SELECT isc.intake_submission_id FROM intake_submission_clients isc WHERE isc.client_id = c.id
       )
     )
     JOIN intake_links il ON il.id = s.intake_link_id
     LEFT JOIN insurance_types it ON it.id = c.insurance_type_id
     WHERE c.agency_id = ?
       AND LOWER(COALESCE(c.client_type, '')) = 'school'
       AND UPPER(COALESCE(c.source, '')) = 'PUBLIC_INTAKE_LINK'
       AND LOWER(COALESCE(il.scope_type, '')) = 'school'
       AND LOWER(COALESCE(il.form_type, 'intake')) = 'intake'
       AND LOWER(COALESCE(s.status, '')) = 'submitted'
       AND s.submitted_at IS NOT NULL
       AND s.submitted_at >= ?
       AND LOWER(COALESCE(sch.organization_type, '')) = 'school'
     ORDER BY s.submitted_at ASC, c.id ASC`,
    [ITSCO_AGENCY_ID, sinceIso]
  );

  return (rows || []).filter((row) => !isExcludedDemoSchool({
    id: row.school_organization_id,
    name: row.school_name,
    slug: row.school_slug,
    portal_url: row.school_portal_url,
    organization_type: row.school_organization_type
  }));
}
