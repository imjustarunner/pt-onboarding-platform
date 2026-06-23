/**
 * PackageAssignmentService
 *
 * Programmatic equivalent of the `assignPackage` HTTP handler.
 * Allows the promote-to-onboarding flow (and future automation triggers)
 * to assign a package without going through an HTTP request.
 */
import pool from '../config/database.js';
import OnboardingPackage from '../models/OnboardingPackage.model.js';
import TaskAssignmentService from './taskAssignment.service.js';
import UserTrack from '../models/UserTrack.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';

const ACCOUNT_SETUP_LINK = '/account-info';
const ACCOUNT_SETUP_LABEL = 'Complete account setup';

/**
 * Assign an onboarding package to a single user programmatically.
 *
 * @param {object} opts
 * @param {number} opts.packageId          - The onboarding package to assign
 * @param {number} opts.userId             - Candidate/employee to assign to
 * @param {number} opts.agencyId           - Agency context
 * @param {number|null} opts.assignedByUserId - Staff user triggering this (null = system)
 * @param {string|null} opts.dueDate       - ISO date string; defaults to 14 days from now
 * @param {boolean} opts.ensureAccountSetup - If true, always include an account-setup checklist item
 * @returns {object} Summary of what was assigned
 */
export async function assignPackageToUser({
  packageId,
  userId,
  agencyId,
  assignedByUserId = null,
  dueDate = null,
  ensureAccountSetup = false
}) {
  const pkg = await OnboardingPackage.findById(packageId);
  if (!pkg) throw new Error(`Onboarding package ${packageId} not found`);

  const finalDueDate = dueDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString();
  })();

  const [trainingFocuses, modules, documents, checklistItems] = await Promise.all([
    OnboardingPackage.getTrainingFocuses(packageId),
    OnboardingPackage.getModules(packageId),
    OnboardingPackage.getDocuments(packageId),
    OnboardingPackage.getChecklistItems(packageId)
  ]);

  const summary = { trainingFocuses: [], modules: [], documents: [], checklistItems: [] };

  const UserChecklistAssignment = (await import('../models/UserChecklistAssignment.model.js')).default;
  const CustomChecklistItem = (await import('../models/CustomChecklistItem.model.js')).default;

  // Training focuses → user_tracks + tasks per module
  for (const tf of trainingFocuses) {
    try {
      await UserTrack.assignUserToTrack(userId, tf.track_id, agencyId, assignedByUserId);

      const trackModules = await TrainingTrack.getModules(tf.track_id);
      for (const tm of trackModules) {
        try {
          const moduleData = await Module.findById(tm.id);
          if (moduleData) {
            await TaskAssignmentService.assignTrainingTask({
              title: `Complete ${moduleData.title}`,
              description: moduleData.description || '',
              referenceId: tm.id,
              assignedByUserId,
              assignedToUserId: userId,
              assignedToAgencyId: agencyId,
              dueDate: finalDueDate,
              metadata: { trackId: tf.track_id, trackName: tf.track_name, moduleOrder: tm.track_order || tm.order_index }
            });
          }
        } catch (e) {
          console.error(`[PackageAssignment] Failed module task for ${tm.id}:`, e?.message);
        }

        const moduleChecklist = await CustomChecklistItem.findByModule(tm.id).catch(() => []);
        for (const ci of moduleChecklist) {
          try { await UserChecklistAssignment.assignToUser(userId, ci.id, assignedByUserId); } catch { /* skip dup */ }
          summary.checklistItems.push({ checklistItemId: ci.id, source: 'module' });
        }
      }

      const focusChecklist = await CustomChecklistItem.findByTrainingFocus(tf.track_id).catch(() => []);
      for (const ci of focusChecklist) {
        try { await UserChecklistAssignment.assignToUser(userId, ci.id, assignedByUserId); } catch { /* skip dup */ }
        summary.checklistItems.push({ checklistItemId: ci.id, source: 'trainingFocus' });
      }

      summary.trainingFocuses.push({ trackId: tf.track_id, trackName: tf.track_name });
    } catch (e) {
      console.error(`[PackageAssignment] Failed training focus ${tf.track_id}:`, e?.message);
    }
  }

  // Standalone modules → tasks
  for (const mod of modules) {
    try {
      const moduleData = await Module.findById(mod.module_id);
      if (moduleData) {
        await TaskAssignmentService.assignTrainingTask({
          title: `Complete ${moduleData.title}`,
          description: moduleData.description || '',
          referenceId: mod.module_id,
          assignedByUserId,
          assignedToUserId: userId,
          assignedToAgencyId: agencyId,
          dueDate: finalDueDate
        });

        const moduleChecklist = await CustomChecklistItem.findByModule(mod.module_id).catch(() => []);
        for (const ci of moduleChecklist) {
          try { await UserChecklistAssignment.assignToUser(userId, ci.id, assignedByUserId); } catch { /* skip dup */ }
          summary.checklistItems.push({ checklistItemId: ci.id, source: 'standaloneModule' });
        }

        summary.modules.push({ moduleId: mod.module_id, title: moduleData.title });
      }
    } catch (e) {
      console.error(`[PackageAssignment] Failed standalone module ${mod.module_id}:`, e?.message);
    }
  }

  // Documents → document tasks
  for (const doc of documents) {
    try {
      const template = await DocumentTemplate.findById(doc.document_template_id);
      if (template) {
        let docDueDate = finalDueDate;
        if (doc.due_date_days) {
          const d = new Date();
          d.setDate(d.getDate() + parseInt(doc.due_date_days, 10));
          docDueDate = d.toISOString();
        }

        await TaskAssignmentService.assignDocumentTask({
          title: template.name,
          description: template.description || '',
          documentTemplateId: doc.document_template_id,
          assignedByUserId,
          assignedToUserId: userId,
          assignedToAgencyId: agencyId,
          documentActionType: doc.action_type || template.document_action_type || 'signature',
          dueDate: docDueDate,
          metadata: { fromPackage: packageId }
        });

        summary.documents.push({ templateId: doc.document_template_id, name: template.name });
      }
    } catch (e) {
      console.error(`[PackageAssignment] Failed document task for template ${doc.document_template_id}:`, e?.message);
    }
  }

  // Package-level checklist items
  for (const ci of checklistItems) {
    try {
      await UserChecklistAssignment.assignToUser(userId, ci.checklist_item_id || ci.id, assignedByUserId);
      summary.checklistItems.push({ checklistItemId: ci.checklist_item_id || ci.id, source: 'package' });
    } catch { /* skip dup */ }
  }

  // Ensure account setup checklist item exists for onboarding packages
  if (ensureAccountSetup || pkg.package_type === 'onboarding') {
    await ensureAccountSetupItem(userId, agencyId, assignedByUserId);
  }

  return { packageId, packageName: pkg.name, packageType: pkg.package_type, userId, ...summary };
}

/**
 * Ensure the user has an "account setup" checklist item (link to /account-info).
 * Creates one at the agency level if none exists, then assigns it.
 */
async function ensureAccountSetupItem(userId, agencyId, assignedByUserId) {
  try {
    // Check if user already has an account-setup assignment
    const [existing] = await pool.execute(
      `SELECT uca.id FROM user_checklist_assignments uca
       JOIN custom_checklist_items cci ON cci.id = uca.checklist_item_id
       WHERE uca.user_id = ? AND (cci.link_url LIKE '%account-info%' OR cci.item_label LIKE '%account setup%')
       LIMIT 1`,
      [userId]
    );
    if (existing.length) return; // Already has it

    // Find or create an account-setup checklist item for this agency
    const [found] = await pool.execute(
      `SELECT id FROM custom_checklist_items
       WHERE (link_url LIKE '%account-info%' OR item_label LIKE '%account setup%')
         AND (agency_id = ? OR agency_id IS NULL)
       LIMIT 1`,
      [agencyId]
    );

    let itemId;
    if (found.length) {
      itemId = found[0].id;
    } else {
      // Create a universal account-setup item for this agency
      const [result] = await pool.execute(
        `INSERT INTO custom_checklist_items (item_label, description, agency_id, link_url, link_label, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [
          ACCOUNT_SETUP_LABEL,
          'Complete your profile: set a password, add your photo, and fill in contact information.',
          agencyId || null,
          ACCOUNT_SETUP_LINK,
          'Go to Account Setup',
          assignedByUserId || null
        ]
      );
      itemId = result.insertId;
    }

    const UserChecklistAssignment = (await import('../models/UserChecklistAssignment.model.js')).default;
    await UserChecklistAssignment.assignToUser(userId, itemId, assignedByUserId);
  } catch (e) {
    console.error('[PackageAssignment] ensureAccountSetupItem failed:', e?.message);
  }
}
