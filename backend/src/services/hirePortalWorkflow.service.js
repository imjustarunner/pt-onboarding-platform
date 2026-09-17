import pool from '../config/database.js';
import { encryptGuardianIntake, decryptGuardianIntake } from './guardianIntakeEncryption.service.js';
import { PREEMPLOYMENT_FIELDS, composeWorkflow, jsonObject, summarizeSteps, validatePreemployment } from '../utils/hirePortalWorkflow.js';

export async function portalPacket(userId, agencyId) {
  const [[saved]] = await pool.execute('SELECT config_json FROM hire_portal_packets WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
  if (saved) return jsonObject(saved.config_json);
  const [[agency]] = await pool.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
  const [[job]] = await pool.execute(`SELECT jd.prehire_config_json FROM hiring_profiles hp
    JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id AND jd.agency_id = ? WHERE hp.candidate_user_id = ?`, [agencyId, userId]);
  const settings = jsonObject(agency?.prehire_settings);
  return { workflow: composeWorkflow(settings.portal_workflow, jsonObject(job?.prehire_config_json).workflow), handbookUrl: settings.handbook_full_url || '', documents: null };
}

export async function portalStepSubmissions(userId) {
  const [rows] = await pool.execute('SELECT phase, step_key, encrypted_value, completed_at FROM hire_portal_submissions WHERE user_id = ?', [userId]);
  return Object.fromEntries(rows.map((r) => [`${r.phase}:${r.step_key}`, { value: JSON.parse(decryptGuardianIntake(jsonObject(r.encrypted_value))), completedAt: r.completed_at }]));
}

export function requiredSubmissionKeys(steps, hasWorkEmail = false) {
  const savedKinds = new Set(['profile', 'headshot', 'handbook', 'work-email', 'upload', 'video', 'meeting', 'link', 'acknowledgement']);
  return steps.filter((step) => step.required !== false && savedKinds.has(step.kind)
    && !(step.kind === 'work-email' && hasWorkEmail)).map((step) => step.key);
}

export async function assertPortalStepCompletion(userId, phase, keys, db = pool) {
  if (!keys.length) return;
  const [rows] = await db.execute('SELECT step_key FROM hire_portal_submissions WHERE user_id = ? AND phase = ? AND completed_at IS NOT NULL', [userId, phase]);
  const completed = new Set(rows.map((row) => row.step_key));
  if (keys.some((key) => !completed.has(key))) throw Object.assign(new Error('Complete all required steps before submitting.'), { status: 400 });
}

// Every write locks the same user row as phase completion. A concurrent submit cannot
// leave a closed package with a newly edited profile or a late resource acknowledgement.
export async function savePortalStep({ userId, agencyId, phase, key, value, complete = true, profile = false, file = null }) {
  const encrypted = JSON.stringify(encryptGuardianIntake(JSON.stringify(value)));
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[user]] = await db.execute('SELECT status FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [[journey]] = await db.execute('SELECT prehire_completed_at, onboarding_completed_at FROM hire_journeys WHERE user_id = ?', [userId]);
    const open = phase === 'pre_hire' ? ['PENDING_SETUP', 'PREHIRE_OPEN'].includes(user?.status) && !journey?.prehire_completed_at
      : user?.status === 'ONBOARDING' && !journey?.onboarding_completed_at;
    if (!open) throw Object.assign(new Error('This package is closed. Contact People Operations to request a correction.'), { status: 409 });
    await db.execute(`INSERT INTO hire_portal_submissions (user_id, phase, step_key, encrypted_value, completed_at)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE encrypted_value = VALUES(encrypted_value), completed_at = VALUES(completed_at)`,
    [userId, phase, key, encrypted, complete ? new Date() : null]);
    if (profile) {
      for (const field of PREEMPLOYMENT_FIELDS) {
        const [[existing]] = await db.execute(`SELECT id FROM user_info_field_definitions WHERE field_key = ? AND (agency_id = ? OR agency_id IS NULL)
          ORDER BY agency_id DESC, id ASC LIMIT 1`, [field.key, agencyId]);
        let id = existing?.id;
        if (!id) {
          const [insert] = await db.execute(`INSERT INTO user_info_field_definitions (field_key, field_label, field_type, agency_id, is_required, order_index)
            VALUES (?, ?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [field.key, field.label, field.type, agencyId]);
          id = insert.insertId;
        }
        await db.execute(`INSERT INTO user_info_values (user_id, field_definition_id, value) VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)`, [userId, id, value[field.key] || '']);
      }
      await db.execute(`UPDATE users SET personal_email = COALESCE(NULLIF(?, ''), personal_email), preferred_name = ?, personal_phone = ? WHERE id = ?`,
        [value.permanent_personal_email || value.personal_email, value.preferred_name || null, value.cell_number || null, userId]);
    }
    if (file) {
      await db.execute(`INSERT INTO user_admin_docs (user_id, title, doc_type, storage_path, original_name, mime_type, created_by_user_id, is_legal_hold)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [userId, file.title, file.docType || 'prehire_upload', file.path, file.name, file.mime, userId]);
      if (key === 'headshot') {
        await db.execute('UPDATE users SET profile_photo_path = ? WHERE id = ?', [file.profilePath, userId]);
        await db.execute('UPDATE user_photos SET is_profile = 0 WHERE user_id = ?', [userId]);
        await db.execute("INSERT INTO user_photos (user_id, file_path, is_profile, source) VALUES (?, ?, 1, 'direct_upload')", [userId, file.profilePath]);
      }
    }
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function buildPortalWorkflow({ user, agencyId, tasks, prehireTasks, extras, backgroundCheck, handbookUrl, hireAccountMode, journey }) {
  const packet = await portalPacket(user.id, agencyId);
  const config = packet.workflow || {};
  const submissions = await portalStepSubmissions(user.id);
  const stored = (phase, key) => submissions[`${phase}:${key}`];
  const prehireClosed = !!journey.prehireCompletedAt || ['PREHIRE_REVIEW', 'ONBOARDING'].includes(user.status);
  const onboardingClosed = !!journey.onboardingCompletedAt;
  const steps = { pre_hire: [], onboarding: [] };
  const add = (phase, step) => steps[phase].push({ required: true, ...step });
  const pTasks = user.status === 'ONBOARDING' ? prehireTasks : tasks;
  const contract = (pTasks || []).filter((t) => t.metadata?.contractGeneration || t.metadata?.employmentContract || t.metadata?.autoFromSendPreHire);
  add('pre_hire', { key: 'background', kind: 'background', title: 'Background check authorization', complete: !!backgroundCheck.signed });
  add('pre_hire', { key: 'job-description', kind: 'job-description', title: 'Your job description', complete: !!extras.jdAcknowledged });
  for (const task of contract) add('pre_hire', { key: `task-${task.id}`, kind: 'task', title: task.title, task, complete: task.status === 'completed' });
  if (!contract.length) add('pre_hire', { key: 'agreement', kind: 'unavailable', title: 'Employment agreement', complete: false, instructions: 'People Operations needs to prepare your employment agreement.' });
  add('pre_hire', { key: 'work-email', kind: 'work-email', title: 'Choose your work email', complete: !!user.work_email || !!stored('pre_hire', 'work-email')?.completedAt });
  if (!prehireClosed || stored('pre_hire', 'profile')) add('pre_hire', { key: 'profile', kind: 'profile', title: 'Pre-employment information', complete: !!stored('pre_hire', 'profile')?.completedAt });
  if (!prehireClosed || stored('pre_hire', 'headshot')) add('pre_hire', { key: 'headshot', kind: 'headshot', title: 'Your professional headshot', complete: !!stored('pre_hire', 'headshot')?.completedAt });
  const handbook = packet.handbookUrl || handbookUrl;
  if (!prehireClosed || stored('pre_hire', 'handbook')) add('pre_hire', { key: 'handbook', kind: 'handbook', title: 'Workplace handbook', url: handbook, complete: !!stored('pre_hire', 'handbook')?.completedAt });
  for (const doc of extras.prehireDocs || []) {
    // Template-backed documents already have a signing task; do not ask twice.
    if (doc.kind === 'acknowledgement') continue; // Legacy alias for the built-in job-description signature.
    if (doc.templateId && (pTasks || []).some((t) => Number(t.referenceId) === Number(doc.templateId))) continue;
    add('pre_hire', { key: `doc-${doc.id}`, kind: 'document', title: doc.title, doc, required: doc.kind !== 'reference' && doc.kind !== 'print_only', complete: !!doc.signed });
  }
  for (const task of pTasks || []) if (!contract.includes(task)) add('pre_hire', { key: `task-${task.id}`, kind: 'task', title: task.title, task, required: !!task.isRequired, complete: task.status === 'completed' });
  add('onboarding', { key: 'account', kind: 'account', title: 'Account setup', required: hireAccountMode === 'group_password', complete: [true, 1, '1'].includes(user.sso_password_override), instructions: 'Set your password and review your login and supervisor.' });
  for (const task of user.status === 'ONBOARDING' ? tasks : []) add('onboarding', { key: `task-${task.id}`, kind: 'task', title: task.title, task, required: !!task.isRequired, complete: task.status === 'completed' });
  add('onboarding', { key: 'handbook', kind: 'handbook', title: 'Handbook acknowledgement', url: handbook, complete: !!stored('onboarding', 'handbook')?.completedAt });
  for (const resource of config.resources || []) {
    if (resource.kind === 'document') {
      const assigned = (resource.phase === 'pre_hire' ? pTasks : tasks).find((t) => t.taskType === 'document' && Number(t.referenceId) === Number(resource.templateId));
      if (!assigned) add(resource.phase, { key: resource.id, kind: 'unavailable', title: resource.title, required: resource.required, complete: false, instructions: 'People Operations needs to assign this document.' });
      continue;
    }
    const saved = stored(resource.phase, resource.id);
    add(resource.phase, { ...resource, key: resource.id, complete: !!saved?.completedAt, submission: saved?.value || null });
  }
  for (const phase of ['pre_hire', 'onboarding']) {
    add(phase, { key: 'review', kind: 'review', title: 'Final review', required: false, complete: phase === 'pre_hire' ? prehireClosed : onboardingClosed });
  }
  const profile = stored('pre_hire', 'profile')?.value || { personal_email: user.personal_email || user.email || '', full_legal_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() };
  const [[supervisor]] = await pool.execute(`SELECT u.id, u.first_name, u.last_name FROM supervisor_assignments sa JOIN users u ON u.id = sa.supervisor_id
    WHERE sa.supervisee_id = ? AND sa.agency_id = ? ORDER BY sa.is_primary DESC, sa.id ASC LIMIT 1`, [user.id, agencyId]);
  return { config, steps, progress: { pre_hire: summarizeSteps(steps.pre_hire), onboarding: summarizeSteps(steps.onboarding) },
    profile, profileFields: PREEMPLOYMENT_FIELDS, headshot: stored('pre_hire', 'headshot')?.value ? { uploaded: true, version: stored('pre_hire', 'headshot').completedAt } : null,
    resume: stored('pre_hire', 'resume')?.value ? { uploaded: true, name: stored('pre_hire', 'resume').value.name } : null,
    preferredWorkEmail: stored('pre_hire', 'work-email')?.value?.email || '',
    supervisor: supervisor ? { id: supervisor.id, name: `${supervisor.first_name} ${supervisor.last_name}` } : { name: config.supervisorName || '' } };
}

export { validatePreemployment };
