import {normalizeFocusAgeValues} from '../utils/providerFacetNormalization.js';
import { FACET_FIELD_ALIASES } from '../constants/clinicalFacetFields.js';
import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { agreementsForUser, agreementPublic } from './supervisionAgreement.service.js';
import { CLINICAL_PROFILE_FIELDS, needsClinicalProfile, clinicalProfileForm } from '../utils/hireClinicalProfile.js';
import { listClinicalFacetsForUser } from './providerClinicalFacets.service.js';
import { encryptGuardianIntake, decryptGuardianIntake } from './guardianIntakeEncryption.service.js';
import { PREEMPLOYMENT_FIELDS, composeWorkflow, jsonObject, summarizeSteps, validatePreemployment, onboardingPasswordReady } from '../utils/hirePortalWorkflow.js';

export async function portalPacket(userId, agencyId) {
  const [[saved]] = await pool.execute('SELECT config_json FROM hire_portal_packets WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
  const retained = saved ? jsonObject(saved.config_json) : null;
  const [[agency]] = await pool.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
  const [[job]] = await pool.execute(`SELECT jd.prehire_config_json FROM hiring_profiles hp
    JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id AND jd.agency_id = ? WHERE hp.candidate_user_id = ?`, [agencyId, userId]);
  const settings = jsonObject(agency?.prehire_settings);
  return { workflow: composeWorkflow(settings.portal_workflow, jsonObject(job?.prehire_config_json).workflow), documents: null, ...retained,
    handbookUrl: retained?.handbookUrl || settings.handbook_full_url || settings.portal_workflow?.handbookUrl || '' };
}

export async function portalStepSubmissions(userId, { completionOnly = false } = {}) {
  const [rows] = await pool.execute(`SELECT phase, step_key, ${completionOnly ? '' : 'encrypted_value,'} completed_at FROM hire_portal_submissions WHERE user_id = ?`, [userId]);
  return Object.fromEntries(rows.map((r) => [`${r.phase}:${r.step_key}`, { value: completionOnly ? {} : JSON.parse(decryptGuardianIntake(jsonObject(r.encrypted_value))), completedAt: r.completed_at }]));
}

export function requiredSubmissionKeys(steps, hasWorkEmail = false) {
  const savedKinds = new Set(['clinical-profile', 'profile', 'headshot', 'handbook', 'work-email', 'upload', 'video', 'meeting', 'link', 'acknowledgement']);
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
    if (phase === 'onboarding' && key === 'clinical-profile' && complete) {
      for (const field of CLINICAL_PROFILE_FIELDS) {
        const keys = [field.key, ...Object.keys(FACET_FIELD_ALIASES).filter(key => FACET_FIELD_ALIASES[key] === field.key)];
        const [[existing]] = await db.execute(`SELECT id FROM user_info_field_definitions WHERE field_key IN (${keys.map(() => '?').join(',')}) AND (agency_id = ? OR agency_id IS NULL)
          ORDER BY agency_id DESC, (field_key = ?) DESC, id ASC LIMIT 1`, [...keys, agencyId, field.key]);
        let id = existing?.id;
        if (!id) {
          const [insert] = await db.execute(`INSERT INTO user_info_field_definitions (field_key, field_label, field_type, options, agency_id, is_required, order_index)
            VALUES (?, ?, 'multi_select', ?, ?, 0, 0) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
          [field.key, `${field.label} — ${field.description}`, JSON.stringify(field.options), agencyId]);
          id = insert.insertId;
        }
        await db.execute(`INSERT INTO user_info_values (user_id, field_definition_id, value) VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)`, [userId, id, JSON.stringify(value.values[field.key])]);
      }
    }
    if(phase==='onboarding'&&key==='clinical-profile'&&complete&&value.clinicalFocus){
      await db.execute("INSERT INTO provider_public_profiles(user_id,public_details_json) VALUES(?,JSON_OBJECT('clinicalFocus',CAST(? AS JSON))) ON DUPLICATE KEY UPDATE public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.clinicalFocus',CAST(? AS JSON))",[userId,JSON.stringify(value.clinicalFocus),JSON.stringify(value.clinicalFocus)]);
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

export function uniquePortalTasks(tasks = []) {
  const unique = new Map();
  for (const task of tasks || []) {
    // The portal collects this authorization once in its dedicated secure form.
    if (/^(?:Hiring:\s*)?Authorization for Background Check$/i.test(String(task.title || '').trim())) continue;
    const key = `${task.taskType}:${task.metadata?.contractGeneration ? 'contract' : 'template'}:${task.referenceId || task.id}`;
    const previous = unique.get(key);
    if (!previous || (task.status === 'completed' && previous.status !== 'completed')) unique.set(key, { ...task, isRequired: !!task.isRequired || !!previous?.isRequired });
    else if (task.isRequired) previous.isRequired = true;
  }
  return [...unique.values()];
}

export async function onboardingContactForAgency(agencyId) {
  // Preserve ITSCO's designated contact while using the actual staff profile photo.
  if (Number(agencyId) !== 2) return null;
  const email = 'Aunya@ITSCO.health';
  const [[contact]] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, u.profile_photo_path
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND u.is_active = TRUE
      AND (u.is_archived = FALSE OR u.is_archived IS NULL)
      AND (LOWER(TRIM(u.work_email)) = LOWER(?) OR LOWER(TRIM(u.email)) = LOWER(?))
    ORDER BY u.id LIMIT 1`, [agencyId, email, email]);
  return { id: contact?.id || null, name: contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Aunya Albinana',
    email, title: 'Clinical Practice Assistant', photoPath: contact?.profile_photo_path || null };
}

export async function buildPortalWorkflow({ user, agencyId, tasks, prehireTasks, extras, backgroundCheck, handbookUrl, hireAccountMode, journey, progressOnly = false }) {
  const packet = await portalPacket(user.id, agencyId);
  const config = packet.workflow || {};
  const submissions = await portalStepSubmissions(user.id, { completionOnly: progressOnly });
  const stored = (phase, key) => submissions[`${phase}:${key}`];
  const prehireClosed = !!journey.prehireCompletedAt || ['PREHIRE_REVIEW', 'ONBOARDING'].includes(user.status);
  const onboardingClosed = !!journey.onboardingCompletedAt;
  const steps = { pre_hire: [], onboarding: [] };
  const add = (phase, step) => steps[phase].push({ required: true, ...step });
  const pTasks = uniquePortalTasks(user.status === 'ONBOARDING' ? prehireTasks : tasks);
  const contract = (pTasks || []).filter((t) => t.metadata?.contractGeneration || t.metadata?.employmentContract || t.metadata?.autoFromSendPreHire);
  add('pre_hire', { key: 'background', kind: 'background', title: 'Background check authorization', complete: !!backgroundCheck.signed });
  add('pre_hire', { key: 'job-description', kind: 'job-description', title: 'Your job description', complete: !!extras.jdAcknowledged });
  for (const task of contract) add('pre_hire', { key: `task-${task.id}`, kind: 'task', title: task.title, task, complete: task.status === 'completed' });
  if (!contract.length) add('pre_hire', { key: 'agreement', kind: 'unavailable', title: 'Employment agreement', complete: false, instructions: 'People Operations needs to prepare your employment agreement.' });
  add('onboarding', { key: 'work-email', kind: 'work-email', title: 'Choose your work email', complete: !!user.work_email || !!stored('onboarding', 'work-email')?.completedAt });
  if (!prehireClosed || stored('pre_hire', 'profile')) add('pre_hire', { key: 'profile', kind: 'profile', title: 'Pre-employment information', complete: !!stored('pre_hire', 'profile')?.completedAt });
  if (!prehireClosed || stored('pre_hire', 'headshot')) add('pre_hire', { key: 'headshot', kind: 'headshot', title: 'Your professional headshot', complete: !!stored('pre_hire', 'headshot')?.completedAt });
  const handbook = packet.handbookUrl || handbookUrl;
  if (!prehireClosed || stored('pre_hire', 'handbook')) add('pre_hire', { key: 'handbook', kind: 'handbook', title: 'Workplace handbook', url: handbook, required: false, complete: !!stored('pre_hire', 'handbook')?.completedAt });
  for (const doc of extras.prehireDocs || []) {
    // Template-backed documents already have a signing task; do not ask twice.
    if (doc.kind === 'acknowledgement') continue; // Legacy alias for the built-in job-description signature.
    if (doc.templateId && (pTasks || []).some((t) => Number(t.referenceId) === Number(doc.templateId))) continue;
    add('pre_hire', { key: `doc-${doc.id}`, kind: 'document', title: doc.title, doc, required: doc.kind !== 'reference' && doc.kind !== 'print_only', complete: !!doc.signed });
  }
  for (const task of pTasks || []) if (!contract.includes(task)) add('pre_hire', { key: `task-${task.id}`, kind: 'task', title: task.title, task, required: !!task.isRequired, complete: task.status === 'completed' });
  if (user.status === 'ONBOARDING') {
    const agreements = await agreementsForUser(user.id, agencyId);
    for (const row of agreements.filter(a => Number(a.supervisee_user_id) === Number(user.id))) {
      const agreement = agreementPublic(row,user.id);
      add('onboarding', {key:`supervision-agreement-${row.id}`,kind:'supervision-agreement',title:`Supervision agreement · ${agreement.document.parties[0].name}`,agreement,complete:agreement.complete});
    }
  }
  if ((needsClinicalProfile(user) && !onboardingClosed) || stored('onboarding', 'clinical-profile')) {
    const saved = stored('onboarding', 'clinical-profile');
    const form = clinicalProfileForm(await listClinicalFacetsForUser(user.id, { agencyId }));
    const publicProfile=await ProviderPublicProfile.getForProvider({providerUserId:user.id,agencyId});
    add('onboarding', { key: 'clinical-profile', kind: 'clinical-profile', title: 'Your clinical profile',
      instructions: 'Deselect areas you do not serve and highlight up to three in each category.',
      clinicalFocus:normalizeFocusAgeValues(saved?.value?.clinicalFocus||publicProfile?.details?.clinicalFocus)||null,
      complete: !!saved?.completedAt, ...form, values: saved?.value?.values || form.values });
  }
  for (const task of uniquePortalTasks(user.status === 'ONBOARDING' ? tasks : [])) add('onboarding', { key: `task-${task.id}`, kind: 'task', title: task.title, task, required: !!task.isRequired, complete: task.status === 'completed' });
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
  add('onboarding', { key: 'account', kind: 'account', title: 'Accounts & access', required: hireAccountMode === 'group_password', complete: [true, 1, '1'].includes(user.sso_password_override), instructions: 'Review all your assigned login details here. After activation, find them in My Dashboard → My Account → Accounts & access.' });
  for (const phase of ['pre_hire', 'onboarding']) {
    add(phase, { key: 'review', kind: 'review', title: 'Final review', required: false, complete: phase === 'pre_hire' ? prehireClosed : onboardingClosed });
  }
  if (progressOnly) return { progress: { pre_hire: summarizeSteps(steps.pre_hire), onboarding: summarizeSteps(steps.onboarding) } };
  const [info] = await pool.execute(`SELECT d.field_key, v.value FROM user_info_values v
    JOIN user_info_field_definitions d ON d.id = v.field_definition_id
    WHERE v.user_id = ? AND (d.agency_id = ? OR d.agency_id IS NULL)
      AND d.field_key IN (${PREEMPLOYMENT_FIELDS.map(() => '?').join(',')}) ORDER BY d.agency_id ASC`, [user.id, agencyId, ...PREEMPLOYMENT_FIELDS.map(field => field.key)]);
  const savedInfo = Object.fromEntries(info.map(row => [row.field_key, row.value]));
  let background = {};
  if (backgroundCheck.signed) {
    const { decryptBackgroundCheckAuthorization } = await import('./backgroundCheckAuthorization.service.js');
    const payload = await decryptBackgroundCheckAuthorization(user.id, agencyId);
    // Only reusable profile fields leave the encrypted authorization; never SSN, DL or signature.
    background = { full_legal_name: payload?.legalName, date_of_birth: payload?.dateOfBirth,
      mailing_address: payload?.currentAddress, previous_addresses: payload?.previousAddresses,
      prior_names: payload?.otherNames || payload?.aliases };
  }
  const savedProfile = stored('pre_hire', 'profile')?.value || {};
  const profile = { personal_email: user.personal_email || user.email || '',
    full_legal_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    preferred_name: user.preferred_name || '', cell_number: user.personal_phone || '',
    ...savedInfo, ...Object.fromEntries(Object.entries(background).filter(([,value]) => value)), ...savedProfile };
  const [[resume]] = await pool.execute(`SELECT id, original_name FROM user_admin_docs
    WHERE user_id = ? AND doc_type = 'resume' ORDER BY id DESC LIMIT 1`, [user.id]);
  const [[supervisor]] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, u.profile_photo_path FROM supervisor_assignments sa JOIN users u ON u.id = sa.supervisor_id
    WHERE sa.supervisee_id = ? AND sa.agency_id = ? ORDER BY sa.is_primary DESC, sa.id ASC LIMIT 1`, [user.id, agencyId]);
  const onboardingContact = await onboardingContactForAgency(agencyId);
  return { onboardingContact, config, assignedOffice: user.work_location || '', steps, progress: { pre_hire: summarizeSteps(steps.pre_hire), onboarding: summarizeSteps(steps.onboarding) },
    profile, profileFields: PREEMPLOYMENT_FIELDS, headshot: stored('pre_hire', 'headshot')?.value ? { uploaded: true, version: stored('pre_hire', 'headshot').completedAt } : null,
    resume: resume ? { uploaded: true, name: resume.original_name, documentId: resume.id } : stored('pre_hire', 'resume')?.value ? { uploaded: true, name: stored('pre_hire', 'resume').value.name } : null,
    preferredWorkEmail: stored('onboarding', 'work-email')?.value?.email || '',
    supervisor: supervisor ? { id: supervisor.id, name: `${supervisor.first_name} ${supervisor.last_name}`, photoPath: supervisor.profile_photo_path || null } : { name: config.supervisorName || '' } };
}

export { validatePreemployment };

/** Enforce the same persisted checklist used by the portal, not a client flag. */
export async function assertOnboardingPasswordReady(userId, agencyId) {
  const User = (await import('../models/User.model.js')).default;
  const { getJourney, journeyTasks } = await import('./hireJourney.service.js');
  const user = await User.findById(userId);
  if (!user || user.status !== 'ONBOARDING' || !agencyId) throw Object.assign(new Error('Onboarding is not open for password setup.'), { code: 'ONBOARDING_INCOMPLETE', status: 409 });
  const journey = await getJourney(userId) || {};
  const tasks = await journeyTasks(userId, user?.status);
  const workflow = await buildPortalWorkflow({ user, agencyId,
    tasks: tasks.filter(t => t.phase === 'onboarding'), prehireTasks: tasks.filter(t => t.phase === 'pre_hire'),
    extras: {}, backgroundCheck: {}, hireAccountMode: 'group_password', journey });
  if (!onboardingPasswordReady(user, workflow, journey)) throw Object.assign(
    new Error('Complete every required onboarding step before setting your password.'),
    { code: 'ONBOARDING_INCOMPLETE', status: 409 }
  );
}
