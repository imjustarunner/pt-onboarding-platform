/** One assignment path for both staff and lifecycle promotion. Retries reuse package items. */
import pool from '../config/database.js';
import OnboardingPackage from '../models/OnboardingPackage.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import CustomChecklistItem from '../models/CustomChecklistItem.model.js';

export async function assignPackageToUser({ packageId, userId, agencyId, assignedByUserId = null, dueDate = null, connection = null }) {
  const pkg = await OnboardingPackage.findById(packageId);
  if (!pkg || !pkg.is_active || (pkg.agency_id && Number(pkg.agency_id) !== Number(agencyId))) {
    throw Object.assign(new Error('Select an active package belonging to this organization.'), { status: 400 });
  }
  const [trainingFocuses, modules, documents, checklistItems, intakeLinks] = await Promise.all([
    OnboardingPackage.getTrainingFocuses(packageId), OnboardingPackage.getModules(packageId),
    OnboardingPackage.getDocuments(packageId), OnboardingPackage.getChecklistItems(packageId),
    OnboardingPackage.getIntakeLinks(packageId)
  ]);
  const phase = ['pre_hire', 'onboarding'].includes(pkg.package_type) ? pkg.package_type : 'ongoing';
  const planned = new Map();
  const checklists = new Map();
  const addChecklist = (ci) => checklists.set(Number(ci.checklist_item_id || ci.id), ci);
  checklistItems.forEach(addChecklist);
  const addModule = async (moduleId, extra = {}) => {
    const mod = await Module.findById(moduleId);
    if (!mod || mod.is_active === 0 || (mod.agency_id && Number(mod.agency_id) !== Number(agencyId))) throw new Error(`Module ${moduleId} is missing from the package.`);
    planned.set(`training:${moduleId}`, { type: 'training', ref: moduleId, title: mod.title,
      description: mod.description || '', meta: extra });
    (await CustomChecklistItem.findByModule(moduleId)).forEach(addChecklist);
  };
  for (const focus of trainingFocuses) {
    for (const mod of await TrainingTrack.getModules(focus.track_id)) {
      await addModule(mod.id, { trackId: focus.track_id, trackName: focus.track_name });
    }
    (await CustomChecklistItem.findByTrainingFocus(focus.track_id)).forEach(addChecklist);
  }
  for (const mod of modules) await addModule(mod.module_id);
  for (const doc of documents) {
    const template = await DocumentTemplate.findById(doc.document_template_id);
    if (!template || template.is_active === 0 || (template.agency_id && Number(template.agency_id) !== Number(agencyId))) throw new Error(`Document ${doc.document_template_id} is missing from the package.`);
    planned.set(`document:${template.id}`, { type: 'document', ref: template.id, title: template.name,
      description: template.description || '', action: doc.action_type || template.document_action_type || 'signature',
      meta: { lifecycleItemKey: template.lifecycle_item_key || null } });
  }
  for (const link of intakeLinks) {
    if (!link.public_key || link.is_active === 0) throw new Error(`Intake form ${link.title || link.intake_link_id} is unavailable.`);
    planned.set(`intake_form:${link.intake_link_id}`, { type: 'intake_form', ref: link.intake_link_id,
      title: link.title || 'Complete questionnaire', description: '', meta: { intakeLinkPublicKey: link.public_key } });
  }
  for (const [id, ci] of checklists) {
    planned.set(`custom:${id}`, { type: 'custom', ref: id, title: ci.item_label || ci.title || 'Checklist item',
      description: ci.description || '', meta: { checklistItemId: id, linkUrl: ci.link_url || null } });
  }
  if (!planned.size) throw Object.assign(new Error('This package has no items. Add the required forms, documents, or training before assigning it.'), { status: 400 });
  const db = connection || await pool.getConnection();
  try {
    if (!connection) await db.beginTransaction();
    const [[user]] = await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ?', [userId, agencyId]);
    if (!user || !membership) throw Object.assign(new Error('Employee does not belong to this organization.'), { status: 403 });
    const [closed] = await db.execute('SELECT onboarding_completed_at FROM hire_journeys WHERE user_id = ?', [userId]);
    if (phase === 'onboarding' && closed[0]?.onboarding_completed_at) {
      throw Object.assign(new Error('This onboarding package is closed. Assign additional training outside the completed hire package.'), { status: 409 });
    }
    const [existing] = await db.execute(
      `SELECT id, task_type, reference_id FROM tasks WHERE assigned_to_user_id = ?
       AND assigned_to_agency_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.fromPackage')) = ?
       AND status NOT IN ('archived', 'overridden', 'deleted')`, [userId, agencyId, String(packageId)]);
    const keys = new Set(existing.map((t) => `${t.task_type}:${t.reference_id}`));
    const date = new Date(dueDate || Date.now() + 14 * 86400000);
    if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Invalid due date.'), { status: 400 });
    for (const [key, item] of planned) {
      if (keys.has(key)) continue;
      await db.execute(
        `INSERT INTO tasks (task_type, document_action_type, title, description, assigned_to_user_id,
          assigned_to_agency_id, assigned_by_user_id, reference_id, metadata, status, is_required, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?)`,
        [item.type, item.action || null, item.title, item.description, userId, agencyId, assignedByUserId,
          item.ref, JSON.stringify({ ...item.meta, fromPackage: Number(packageId), portalPhase: phase }), date]);
    }
    for (const focus of trainingFocuses) {
      await db.execute(
        `INSERT INTO user_tracks (user_id, track_id, agency_id, assigned_by_user_id) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`, [userId, focus.track_id, agencyId, assignedByUserId]);
    }
    for (const [id] of checklists) {
      await db.execute(
        `INSERT INTO user_custom_checklist_assignments (user_id, checklist_item_id, assigned_by_user_id, is_completed)
         VALUES (?, ?, ?, FALSE) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`, [userId, id, assignedByUserId]);
    }
    if (!connection) await db.commit();
    return { packageId: Number(packageId), packageName: pkg.name, packageType: pkg.package_type, userId,
      trainingFocuses, modules, documents, checklistItems: [...checklists.values()], intakeForms: intakeLinks };
  } catch (e) { if (!connection) await db.rollback(); throw e; }
  finally { if (!connection) db.release(); }
}
