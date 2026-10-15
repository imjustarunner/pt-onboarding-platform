import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { portalPacket } from './hirePortalWorkflow.service.js';
import { composeWorkflow, sanitizeWorkflow, jsonObject } from '../utils/hirePortalWorkflow.js';
import { taskPhase } from './hireJourney.service.js';
import { assignPackageToUser } from './packageAssignment.service.js';
import { assertHireFormReady } from '../utils/hireDocumentFields.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const packetKey = phase => phase === 'pre_hire' ? 'prehirePackageId' : 'onboardingPackageId';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const revisionOf = packet => createHash('sha256').update(JSON.stringify(canonical(packet))).digest('hex');
export function packageClosed(phase, user, journey = {}) {
  return phase === 'pre_hire'
    ? !!journey.prehire_completed_at || !['PENDING_SETUP', 'PREHIRE_OPEN'].includes(user.status)
    : !!journey.onboarding_completed_at || !['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW', 'ONBOARDING'].includes(user.status);
}
async function context(userId, agencyId, db, lock = false) {
  const [[user]] = await db.execute(`SELECT id, first_name, last_name, personal_email, email, work_email, status FROM users WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [userId]);
  const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND COALESCE(is_active, 1) = 1', [userId, agencyId]);
  if (!user || !membership) fail('Person not found in this organization.', 404);
  const [[journey]] = await db.execute('SELECT prehire_completed_at, onboarding_started_at, onboarding_completed_at FROM hire_journeys WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
  const [[owner]] = await db.execute('SELECT agency_id FROM hire_portal_packets WHERE user_id = ?', [userId]);
  if (owner && Number(owner.agency_id) !== agencyId) fail('The hire package belongs to another organization.', 403);
  const packet = await portalPacket(userId, agencyId, db);
  const [[agency]] = await db.execute('SELECT prehire_settings FROM agencies WHERE id = ?', [agencyId]);
  const settings = jsonObject(agency?.prehire_settings);
  const [[profile]] = await db.execute('SELECT applied_role FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1', [userId]);
  const mapping = (settings.role_package_mappings || []).find(m => String(m.role || '').toLowerCase() === String(profile?.applied_role || '').toLowerCase());
  const preparing = !journey?.onboarding_started_at && user.status !== 'ONBOARDING' && user.status !== 'ACTIVE_EMPLOYEE';
  const workflow = preparing ? composeWorkflow(settings.portal_workflow, packet.workflow) : sanitizeWorkflow(packet.workflow);
  // Defaults for the future phase must not change the retained pre-hire configuration.
  workflow.resources = [...(packet.workflow?.resources || []).filter(r => r.phase === 'pre_hire'), ...workflow.resources.filter(r => r.phase === 'onboarding')];
  return { user: { ...user, applied_role: profile?.applied_role }, journey: journey || {}, packet, workflow, preparing,
    suggestedOnboardingPackageId: mapping?.packageId || settings.default_onboarding_package_id || null };
}
export async function getHirePackageWorkspace(userId, agencyId, db = pool) {
  const ctx = await context(userId, agencyId, db);
  const [tasks] = await db.execute(`SELECT id, title, task_type, document_action_type, reference_id, metadata, status FROM tasks
    WHERE assigned_to_user_id = ? AND assigned_to_agency_id = ? AND task_type IN ('document','training','intake_form','custom')
    AND (task_type <> 'custom' OR JSON_EXTRACT(metadata, '$.checklistItemId') IS NOT NULL)
    AND (document_action_type IS NULL OR document_action_type <> 'countersignature')
    AND status NOT IN ('deleted','archived','overridden') ORDER BY created_at, id`, [userId, agencyId]);
  const [submissions] = await db.execute('SELECT phase, step_key FROM hire_portal_submissions WHERE user_id = ? AND completed_at IS NOT NULL', [userId]);
  return { candidate: ctx.user, revision: revisionOf(ctx.packet), phases: Object.fromEntries(['pre_hire','onboarding'].map(phase => [phase, {
    closed: packageClosed(phase, ctx.user, ctx.journey), preparing: phase === 'onboarding' && ctx.preparing,
    packageId: ctx.packet[packetKey(phase)] || null,
    suggestedPackageId: phase === 'onboarding' ? ctx.suggestedOnboardingPackageId : null,
    workflow: { resources: ctx.workflow.resources.filter(r => r.phase === phase), excludedResourceIds: ctx.packet.workflow?.excludedResourceIds || [] },
    completedResourceIds: submissions.filter(s => s.phase === phase).map(s => s.step_key),
    tasks: tasks.filter(t => taskPhase(t, ctx.user.status) === phase).map(t => ({ id: t.id, title: t.title, status: t.status, type: t.task_type }))
  }])) };
}
export async function saveHirePackageWorkspace({ userId, agencyId, actorId, phase, input }) {
  if (!['pre_hire','onboarding'].includes(phase)) fail('Choose pre-hire or onboarding.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const ctx = await context(userId, agencyId, db, true);
    if (packageClosed(phase, ctx.user, ctx.journey)) fail('This package has been submitted and is retained for review. Its contents cannot be changed here.', 409);
    if (input.revision !== revisionOf(ctx.packet)) fail('This person’s package changed. Reload it before saving your changes.', 409);
    const raw = input.workflow?.resources;
    if (!Array.isArray(raw) || raw.length > 80 || raw.some(r => !r || r.phase !== phase || !String(r.title || '').trim())) fail('Give every step a title and keep it in the selected process.');
    const resources = sanitizeWorkflow({ resources: raw }).resources;
    if (resources.length !== raw.length) fail('Give each step a valid identifier and title.');
    const other = ctx.workflow.resources.filter(r => r.phase !== phase);
    if (resources.length + other.length > 80) fail('Keep the combined packages within 80 additional steps.');
    if (new Set([...resources, ...other].map(r => r.id)).size !== resources.length + other.length) fail('Each step must have a unique identifier across both packages.');
    const previous = ctx.workflow.resources.filter(r => r.phase === phase);
    const [completed] = await db.execute('SELECT step_key FROM hire_portal_submissions WHERE user_id = ? AND phase = ? AND completed_at IS NOT NULL', [userId, phase]);
    for (const saved of completed) {
      const old = previous.find(r => r.id === saved.step_key);
      if (old && JSON.stringify(sanitizeWorkflow({ resources: [old] }).resources[0]) !== JSON.stringify(resources.find(r => r.id === old.id))) fail('A completed step cannot be changed or removed. Add a new step for the new requirement.', 409);
    }
    const packageId = input.packageId == null || input.packageId === '' ? null : Number(input.packageId);
    if (packageId !== null && (!Number.isSafeInteger(packageId) || packageId < 1)) fail('Choose a valid collection.');
    if (packageId) {
      const [[pkg]] = await db.execute('SELECT agency_id, package_type, is_active FROM onboarding_packages WHERE id = ?', [packageId]);
      if (!pkg || !Number(pkg.is_active) || pkg.package_type !== phase || (pkg.agency_id && Number(pkg.agency_id) !== agencyId)) fail('Choose an active collection for this process and organization.');
    }
    for (const resource of resources) {
      if (resource.kind === 'document') {
        const [[doc]] = await db.execute('SELECT * FROM document_templates WHERE id = ?', [resource.templateId]);
        if (!doc || !Number(doc.is_active) || (doc.agency_id && Number(doc.agency_id) !== agencyId)) fail(`Choose an available document template for ${resource.title}.`);
        assertHireFormReady(doc);
      } else if (resource.required && !resource.url) fail(`Attach a secure link for ${resource.title}.`);
    }
    const newDocuments = resources.filter(r => r.kind === 'document' && !previous.some(p => p.kind === 'document' && Number(p.templateId) === Number(r.templateId))).map(r => r.templateId);
    const preparing = phase === 'onboarding' && ctx.preparing;
    if (!preparing && newDocuments.length && !packageId) fail('Choose a document collection to assign the additional document templates.');
    if (!preparing && packageId && (packageId !== Number(ctx.packet[packetKey(phase)]) || newDocuments.length)) {
      await assignPackageToUser({ packageId, userId, agencyId, assignedByUserId: actorId, connection: db, documentsOnly: phase === 'pre_hire', reusePhaseItems: true, additionalDocuments: resources.filter(r => r.kind === 'document').map(r => r.templateId) });
    }
    const removed = previous.filter(r => !resources.some(n => n.id === r.id)).map(r => r.id);
    const retainedExclusions = (ctx.packet.workflow?.excludedResourceIds || []).filter(id => !resources.some(r => r.id === id));
    const packet = { ...ctx.packet, [packetKey(phase)]: packageId, workflow: { ...ctx.packet.workflow,
      resources: [...other, ...resources], excludedResourceIds: [...new Set([...retainedExclusions, ...removed])] } };
    await db.execute(`INSERT INTO hire_portal_packets (user_id, agency_id, config_json) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`, [userId, agencyId, JSON.stringify(packet)]);
    await db.execute('INSERT INTO user_activity_log (action_type, user_id, agency_id, metadata) VALUES (?, ?, ?, ?)',
      ['hire_package_updated', actorId, agencyId, JSON.stringify({ targetUserId: userId, phase, packageId, preparing, resourceIds: resources.map(r => r.id) })]);
    await db.commit();
    return { revision: revisionOf(packet) };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
