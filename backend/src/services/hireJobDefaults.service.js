import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { jsonObject, composeWorkflow, sanitizeWorkflow } from '../utils/hirePortalWorkflow.js';
import { sanitizePrehireConfig } from '../utils/prehireConfigSanitize.js';
import { sanitizeHireTraining, resolveHireTraining } from '../utils/hireTrainingDefaults.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const phases = ['pre_hire', 'onboarding'];
const packageKey = phase => phase === 'pre_hire' ? 'default_prehire_package_id' : 'default_onboarding_package_id';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function phaseDefaults(settings, phase) {
  const value = { packageId: settings[packageKey(phase)] || null,
    training: sanitizeHireTraining(phase === 'onboarding' ? settings.onboarding_training : {}),
    workflow: { resources: sanitizeWorkflow(settings.portal_workflow).resources.filter(r => r.phase === phase) },
    documents: phase === 'pre_hire' ? sanitizePrehireConfig({ documents: settings.default_prehire_docs }).documents : [] };
  return { ...value, revision: createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex') };
}
export async function getSharedHireDefaults(agencyId, db = pool) {
  const [[agency]] = await db.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
  if (!agency) fail('Organization not found.', 404);
  const settings = jsonObject(agency.prehire_settings);
  const [[identity]] = await db.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [agencyId]);
  const { trainingDefinitionsFor } = await import('./documentTrainingContent.js');
  return { phases: Object.fromEntries(phases.map(phase => [phase, phaseDefaults(settings, phase)])),
    guides: trainingDefinitionsFor(identity || {}).map(d => ({ key: d.documentKey, title: d.title })) };
}
export async function validateJobHireDefaults(config, agencyId, db = pool) {
  if (!config) return;
  for (const [key, phase] of [['prehirePackageId', 'pre_hire'], ['onboardingPackageId', 'onboarding']]) {
    if (config[key] == null || config[key] === '') continue;
    if (!Number.isSafeInteger(Number(config[key])) || Number(config[key]) < 1) fail('Choose a valid package.');
    const [[pkg]] = await db.execute('SELECT agency_id, package_type, is_active FROM onboarding_packages WHERE id = ?', [Number(config[key])]);
    if (!pkg || !Number(pkg.is_active) || pkg.package_type !== phase || (pkg.agency_id != null && Number(pkg.agency_id) !== Number(agencyId))) fail(`Choose an active ${phase === 'pre_hire' ? 'pre-hire' : 'onboarding'} package in this organization.`);
  }
  const resources = config.workflow?.resources || [];
  if (resources.length > 80 || new Set(resources.map(r => r.id)).size !== resources.length) fail('Use a unique identifier for each step, with at most 80 steps.');
  for (const item of [...resources.filter(r => r.kind === 'document'), ...(config.documents || []).filter(d => d.templateId)]) {
    const [[template]] = await db.execute('SELECT agency_id, is_active FROM document_templates WHERE id = ?', [item.templateId || null]);
    if (!template || !Number(template.is_active) || (template.agency_id != null && Number(template.agency_id) !== Number(agencyId))) fail(`Choose an available document template for ${item.title}.`);
  }
  const training = sanitizeHireTraining(config.onboardingTraining);
  for (const [table, ids] of [['modules', training.moduleIds], ['training_tracks', training.trackIds]]) {
    for (const id of ids) {
      const [[item]] = await db.execute(`SELECT agency_id, is_active, is_archived FROM ${table} WHERE id = ?`, [id]);
      if (!item || !Number(item.is_active) || Number(item.is_archived) || (item.agency_id != null && Number(item.agency_id) !== Number(agencyId))) fail('Choose active training in this organization.');
    }
  }
  if (Object.keys(training.guideRequirements).length) {
    const [[agency]] = await db.execute('SELECT id, name, slug FROM agencies WHERE id = ?', [agencyId]);
    const { trainingDefinitionsFor } = await import('./documentTrainingContent.js');
    const keys = trainingDefinitionsFor(agency || {}).map(d => d.documentKey);
    if (Object.keys(training.guideRequirements).some(key => !keys.includes(key))) fail('Choose guides available in this organization.');
  }
}
export async function saveSharedHireDefaults({ agencyId, actorId, phase, input }) {
  if (!phases.includes(phase)) fail('Choose pre-hire or onboarding.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT prehire_settings FROM agencies WHERE id = ? FOR UPDATE', [agencyId]);
    if (!agency) fail('Organization not found.', 404);
    const settings = jsonObject(agency.prehire_settings);
    if (input.revision !== phaseDefaults(settings, phase).revision) fail('The all-jobs defaults changed. Reload defaults before saving.', 409);
    const raw = input.workflow?.resources;
    if (!Array.isArray(raw) || raw.length > 80 || raw.some(r => !r || r.phase !== phase || !String(r.title || '').trim())) fail('Give every step a title and keep it in the selected process.');
    const resources = sanitizeWorkflow({ resources: raw }).resources;
    const other = sanitizeWorkflow(settings.portal_workflow).resources.filter(r => r.phase !== phase);
    if (resources.length + other.length > 80 || new Set([...resources, ...other].map(r => r.id)).size !== resources.length + other.length) fail('Use unique steps across both processes, with at most 80 steps.');
    for (const item of resources) if (item.kind !== 'document' && !item.url) fail(`Add a secure link for ${item.title}.`);
    const documents = phase === 'pre_hire' ? sanitizePrehireConfig({ documents: input.documents }).documents : [];
    if (phase === 'pre_hire' && (!Array.isArray(input.documents) || documents.length !== input.documents.length)) fail('Give every document a title.');
    const key = phase === 'pre_hire' ? 'prehirePackageId' : 'onboardingPackageId';
    const training = sanitizeHireTraining(input.training);
    await validateJobHireDefaults({ [key]: input.packageId, workflow: { resources }, documents, ...(phase === 'onboarding' ? { onboardingTraining: training } : {}) }, agencyId, db);
    const merged = { ...settings, [packageKey(phase)]: Number(input.packageId) || null,
      portal_workflow: { ...jsonObject(settings.portal_workflow), resources: [...other, ...resources], excludedResourceIds: (jsonObject(settings.portal_workflow).excludedResourceIds || []).filter(id => !resources.some(r => r.id === id)) },
      ...(phase === 'onboarding' ? { onboarding_training: training } : {}),
      ...(phase === 'pre_hire' ? { default_prehire_docs: documents } : {}) };
    await db.execute('UPDATE agencies SET prehire_settings = ? WHERE id = ?', [JSON.stringify(merged), agencyId]);
    await db.execute('INSERT INTO user_activity_log (action_type, user_id, agency_id, metadata) VALUES (?, ?, ?, ?)',
      ['hire_defaults_updated', actorId, agencyId, JSON.stringify({ phase, resourceIds: resources.map(r => r.id) })]);
    await db.commit();
    return { phases: Object.fromEntries(phases.map(p => [p, phaseDefaults(merged, p)])) };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
export async function getAppliedJobHireDefaults(userId, agencyId, db = pool) {
  const [[job]] = await db.execute(`SELECT jd.prehire_config_json FROM hiring_profiles hp JOIN hiring_job_descriptions jd
    ON jd.id = hp.job_description_id AND jd.agency_id = ? WHERE hp.candidate_user_id = ? ORDER BY hp.id DESC LIMIT 1`, [agencyId, userId]);
  return sanitizePrehireConfig(job?.prehire_config_json);
}
export function resolveOnboardingDefaults({ settings, job, packet = {}, person }) {
  return { packageId: packet.onboardingPackageId || job?.onboardingPackageId || null,
    training: resolveHireTraining(settings.onboarding_training, job?.onboardingTraining, packet.onboardingTraining),
    workflow: composeWorkflow(composeWorkflow(settings.portal_workflow, job?.workflow), packet.workflow, person) };
}
