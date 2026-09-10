/**
 * Cross-agency hiring / pre-hire pipeline for People Ops dashboard widgets.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';

const HIRE_STATUSES = new Set([
  'PROSPECTIVE',
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING'
]);

function daysSince(raw) {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function bucketForRow(row) {
  const status = String(row.status || '').toUpperCase();
  const stage = String(row.stage || '').toLowerCase();
  const pendingSig = Number(row.pending_signatures || 0);
  const pendingDocs = Number(row.pending_docs || 0);

  if (pendingSig > 0) return 'pendingSignature';
  if (status === 'PREHIRE_REVIEW' || (status === 'PREHIRE_OPEN' && pendingDocs === 0 && pendingSig === 0)) {
    return 'readyForOnboarding';
  }
  if (['PENDING_SETUP', 'PREHIRE_OPEN'].includes(status) && pendingDocs > 0) return 'awaitingDocuments';
  if (['PENDING_SETUP', 'PREHIRE_OPEN', 'ONBOARDING'].includes(status)) return 'inPrehire';
  if (status === 'PROSPECTIVE' || ['applied', 'review', 'interview', 'offered'].includes(stage)) {
    return 'newApplicants';
  }
  return 'inPrehire';
}

function nextStepFor(bucket, row) {
  const map = {
    newApplicants: 'Review application',
    inPrehire: 'Continue pre-hire',
    awaitingDocuments: 'Awaiting documents',
    readyForOnboarding: 'Ready for onboarding',
    pendingSignature: 'Pending signature'
  };
  if (bucket === 'pendingSignature' && Number(row.pending_signatures || 0) > 1) {
    return `${row.pending_signatures} signatures remaining`;
  }
  return map[bucket] || 'Review';
}

function attentionTab(bucket, days) {
  if (['newApplicants', 'awaitingDocuments', 'pendingSignature'].includes(bucket)) return 'needs';
  if (bucket === 'readyForOnboarding' && days >= 3) return 'needs';
  if (bucket === 'readyForOnboarding') return 'completed';
  return 'progress';
}

export async function loadPipelineBoard({ userId, role } = {}) {
  const r = String(role || '').toLowerCase();
  let agencies = [];
  try {
    agencies = (await User.getAgencies(userId)) || [];
  } catch {
    agencies = [];
  }
  agencies = (agencies || [])
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() !== 'school')
    .map((a) => ({ id: Number(a.id), name: a.name || `Agency ${a.id}` }))
    .filter((a) => a.id);

  if (!agencies.length && (r === 'super_admin' || r === 'support')) {
    const [rows] = await pool.execute(
      `SELECT id, name FROM agencies
       WHERE (organization_type IS NULL OR organization_type = 'agency')
         AND (is_active = 1 OR is_active IS NULL)
       ORDER BY name ASC
       LIMIT 80`
    );
    agencies = (rows || []).map((a) => ({ id: Number(a.id), name: a.name }));
  }

  if (!agencies.length) {
    return {
      agencies: [],
      counts: {
        newApplicants: 0,
        inPrehire: 0,
        awaitingDocuments: 0,
        readyForOnboarding: 0,
        pendingSignature: 0
      },
      candidates: []
    };
  }

  const ids = agencies.map((a) => a.id);
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       u.id AS user_id,
       u.first_name,
       u.last_name,
       u.email,
       u.personal_email,
       u.status,
       u.created_at,
       u.hired_at,
       hp.stage,
       hp.applied_role,
       hp.updated_at AS profile_updated_at,
       a.id AS agency_id,
       a.name AS agency_name,
       jd.title AS job_title,
       (
         SELECT COUNT(*) FROM tasks t
         WHERE t.assigned_to_user_id = u.id
           AND t.task_type = 'document'
           AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
           AND t.status != 'completed'
       ) AS pending_docs,
       (
         SELECT COUNT(*) FROM tasks t
         WHERE t.assigned_to_user_id = u.id
           AND t.task_type = 'document'
           AND t.document_action_type = 'signature'
           AND t.status != 'completed'
       ) AS pending_signatures
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     JOIN agencies a ON a.id = ua.agency_id
     LEFT JOIN hiring_profiles hp ON hp.id = (
       SELECT hp_latest.id FROM hiring_profiles hp_latest
       WHERE hp_latest.candidate_user_id = u.id
       ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
       LIMIT 1
     )
     LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
     WHERE a.id IN (${placeholders})
       AND (u.is_archived = 0 OR u.is_archived IS NULL)
       AND u.status != 'ARCHIVED'
       AND (
         u.status IN ('PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING')
         OR hp.id IS NOT NULL
       )
       AND LOWER(COALESCE(hp.stage, 'applied')) != 'not_hired'
     ORDER BY COALESCE(hp.updated_at, u.hired_at, u.created_at) DESC
     LIMIT 400`,
    ids
  );

  const seen = new Set();
  const candidates = [];
  const counts = {
    newApplicants: 0,
    inPrehire: 0,
    awaitingDocuments: 0,
    readyForOnboarding: 0,
    pendingSignature: 0
  };

  for (const row of rows || []) {
    const status = String(row.status || '').toUpperCase();
    if (!HIRE_STATUSES.has(status) && !row.stage) continue;
    const key = `${row.user_id}:${row.agency_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = bucketForRow(row);
    counts[bucket] = (counts[bucket] || 0) + 1;
    const since = daysSince(row.hired_at || row.profile_updated_at || row.created_at);
    candidates.push({
      userId: Number(row.user_id),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: row.personal_email || row.email || '',
      agencyId: Number(row.agency_id),
      agencyName: row.agency_name || '',
      stage: row.stage || null,
      status,
      jobTitle: row.job_title || row.applied_role || '',
      bucket,
      nextStep: nextStepFor(bucket, row),
      daysSince: since,
      tab: attentionTab(bucket, since),
      pendingDocs: Number(row.pending_docs || 0),
      pendingSignatures: Number(row.pending_signatures || 0)
    });
  }

  return { agencies, counts, candidates };
}

export default { loadPipelineBoard };
