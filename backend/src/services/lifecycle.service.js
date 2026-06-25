/**
 * lifecycle.service.js
 *
 * Aggregates all data for the Lifecycle tab:
 *   - Employee summary bar
 *   - Employment milestone dates (from user_info_values EAV)
 *   - Key dates timeline
 *   - Onboarding checklist groups + progress
 *   - Offboarding checklist + separation info
 *
 * Reads existing app data (status, supervisor_assignments, tasks, user_info_values)
 * and the new lifecycle_checklist_definitions / user_lifecycle_checklist_items tables.
 */
import pool from '../config/database.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import UserSeparationInfo from '../models/UserSeparationInfo.model.js';
import UserLifecycleScopedItem from '../models/UserLifecycleScopedItem.model.js';
import { getLeaveInfoForUserIds } from './leaveOfAbsence.service.js';
import { backfillScopeFromExistingAssignments } from './lifecycleScope.service.js';

// Milestone date field keys we manage via user_info_values EAV
const MILESTONE_FIELD_KEYS = [
  'offer_accepted_date',
  'start_date',
  'orientation_date',
  'therapy_notes_training_date',
  'first_client_date',
  'first_payroll_submission_date',
  'probation_end_date',
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, status, role, has_provider_access,
            provider_start_date, hired_at, completed_at, termination_date,
            terminated_at, status_expires_at, is_active
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function fetchDateOfBirth(userId) {
  // Checks both canonical and legacy field keys; birthday automation uses the same EAV
  const [rows] = await pool.execute(
    `SELECT uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ? AND uifd.field_key IN ('date_of_birth', 'provider_birthdate')
     ORDER BY (uifd.field_key = 'date_of_birth') DESC, uiv.updated_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0]?.value || null;
}

async function fetchFirstSupervisionDate(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT session_finalized_at
       FROM supervision_sessions
       WHERE supervisee_id = ? AND session_finalized_at IS NOT NULL
       ORDER BY session_finalized_at ASC
       LIMIT 1`,
      [userId]
    );
    const raw = rows[0]?.session_finalized_at;
    return raw ? String(raw).slice(0, 10) : null;
  } catch {
    // Table may not exist in all environments
    return null;
  }
}

async function fetchPrimarySupervisor(userId) {
  const [rows] = await pool.execute(
    `SELECT u.first_name, u.last_name, u.email, sa.is_primary
     FROM supervisor_assignments sa
     JOIN users u ON u.id = sa.supervisor_id
     WHERE sa.supervisee_id = ?
     ORDER BY sa.is_primary DESC, sa.created_at ASC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function fetchMilestoneDates(userId) {
  if (!MILESTONE_FIELD_KEYS.length) return {};

  const placeholders = MILESTONE_FIELD_KEYS.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT uifd.field_key, uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ? AND uifd.field_key IN (${placeholders})`,
    [userId, ...MILESTONE_FIELD_KEYS]
  );

  const map = {};
  for (const r of rows) {
    map[r.field_key] = r.value || null;
  }
  return map;
}

function buildTimeline(user, dates, firstSupervisionDate) {
  const events = [];
  const add = (label, value) => {
    if (value) events.push({ label, date: String(value).slice(0, 10) });
  };

  add('Offer Accepted', dates.offer_accepted_date);
  // hired_at is the hiring pipeline timestamp — label it "Hired / Pre-Hire Started"
  if (user.hired_at && !dates.offer_accepted_date) {
    add('Hired / Pre-Hire Started', String(user.hired_at).slice(0, 10));
  }
  add('Start Date', dates.start_date || user.provider_start_date);
  add('Orientation', dates.orientation_date);
  add('TherapyNotes Training', dates.therapy_notes_training_date);
  add('First Supervision', firstSupervisionDate);
  add('First Client', dates.first_client_date);
  add('First Payroll', dates.first_payroll_submission_date);
  add('Became Active Employee', user.completed_at ? String(user.completed_at).slice(0, 10) : null);

  // Sort chronologically
  events.sort((a, b) => (a.date > b.date ? 1 : -1));

  const today = new Date().toISOString().slice(0, 10);
  for (const ev of events) {
    ev.status = ev.date <= today ? 'past' : 'upcoming';
  }
  return events;
}

function isProviderLike(user) {
  return (
    ['provider', 'provider_plus'].includes(String(user.role || '')) ||
    user.has_provider_access === 1 ||
    user.has_provider_access === true ||
    user.has_provider_access === '1'
  );
}

function definitionApplies(definition, isProvider) {
  const at = definition.applies_to;
  if (at === 'all') return true;
  if (at === 'provider') return isProvider;
  if (at === 'staff') return !isProvider;
  return true;
}

function definitionIsVisible(definition, scopedKeys, state) {
  if (definition.scope_mode === 'always') return true;
  if (scopedKeys.has(definition.item_key)) return true;
  if (state?.is_completed) return true;
  if (state?.manually_overridden) return true;
  if (state?.notes) return true;
  return false;
}

function computeOffboardingStatus(terminationDate, offboardItems) {
  if (!terminationDate) return 'N/A';
  const required = offboardItems.filter((i) => i.is_required);
  if (!required.length) return 'Not Started';
  const done = required.filter((i) => i.is_completed).length;
  if (done === 0) return 'Not Started';
  if (done >= required.length) return 'Complete';
  return 'In Progress';
}

function resolveLabelTemplate(definition, supervisor) {
  if (!definition.label_template) return definition.item_label;
  const supName = supervisor
    ? `${supervisor.first_name} ${supervisor.last_name}`.trim()
    : 'Supervisor';
  return definition.label_template.replace('{{supervisor_name}}', supName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main aggregator. Ensures checklist rows exist, returns full lifecycle payload.
 */
export async function getLifecycleData(userId) {
  const user = await fetchUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const isProvider = isProviderLike(user);
  const [supervisor, milestones, separation, allDefinitions, dateOfBirth, leaveMap, firstSupervisionDate] = await Promise.all([
    fetchPrimarySupervisor(userId),
    fetchMilestoneDates(userId),
    UserSeparationInfo.findByUser(userId),
    LifecycleChecklistDefinition.findAll(),
    fetchDateOfBirth(userId),
    getLeaveInfoForUserIds([userId]),
    fetchFirstSupervisionDate(userId),
  ]);

  const leaveInfo = leaveMap.get(userId) || null;

  try {
    await backfillScopeFromExistingAssignments(userId);
  } catch {
    // non-fatal
  }
  const scopedKeys = await UserLifecycleScopedItem.findKeysByUser(userId);

  // Filter definitions applicable to this user's role
  const applicable = allDefinitions.filter((d) => definitionApplies(d, isProvider));

  const userItems = await UserLifecycleChecklistItem.findByUser(userId);
  const stateByDefId = new Map(userItems.map((i) => [i.definition_id, i]));

  const visibleApplicable = applicable.filter((d) => {
    if (d.phase === 'offboarding') return !!user.termination_date;
    return definitionIsVisible(d, scopedKeys, stateByDefId.get(d.id));
  });
  if (visibleApplicable.length) {
    await UserLifecycleChecklistItem.ensureRows(userId, visibleApplicable.map((d) => d.id));
  }

  // Build enriched items grouped by phase → category
  const onboardingGroups = {};
  const offboardingGroups = {};
  let onboardTotal = 0;
  let onboardDone = 0;
  const missingItems = [];

  // Pre-fetch completed document tasks for this user (used to attach download links below)
  let completedDocTasksByRef = new Map();
  try {
    const [docTaskRows] = await pool.execute(
      `SELECT t.id AS taskId, t.title, t.reference_id, t.completed_at,
              dt.title AS templateTitle, dt.document_type, dt.name AS templateName,
              dt.lifecycle_item_key,
              sd.id AS signedDocId
       FROM tasks t
       LEFT JOIN document_templates dt ON dt.id = t.reference_id
       LEFT JOIN signed_documents sd ON sd.task_id = t.id
       WHERE t.assigned_to_user_id = ?
         AND t.task_type = 'document'
         AND t.status = 'completed'`,
      [userId]
    );
    for (const row of docTaskRows) {
      const keys = [
        String(row.lifecycle_item_key || '').toLowerCase(),
        String(row.templateTitle || '').toLowerCase(),
        String(row.templateName || '').toLowerCase(),
        String(row.document_type || '').toLowerCase(),
        String(row.title || '').toLowerCase()
      ].filter(Boolean);
      for (const k of keys) {
        if (!completedDocTasksByRef.has(k)) {
          completedDocTasksByRef.set(k, row);
        }
      }
    }
  } catch { /* non-fatal */ }

  for (const def of applicable) {
    const state = stateByDefId.get(def.id) || { is_completed: 0, completed_at: null, completion_method: 'manual' };

    if (def.phase === 'onboarding' && !definitionIsVisible(def, scopedKeys, state)) {
      continue;
    }

    const item = {
      id: state.id || null,
      definitionId: def.id,
      itemKey: def.item_key,
      label: resolveLabelTemplate(def, supervisor),
      isRequired: !!def.is_required,
      isCompleted: !!state.is_completed,
      completedAt: state.completed_at || null,
      completionMethod: state.completion_method || 'manual',
      integrationTypeInfo: def.integration_type,
      integrationRef: def.integration_ref || null,
      documentTaskId: null,
      hasSignedDocument: false,
    };

    // For completed document_task items, attach the signed document task ID for download links
    if (def.integration_type === 'document_task' && item.isCompleted) {
      const ref = String(def.item_key || def.integration_ref || '').toLowerCase();
      if (ref) {
        for (const [key, row] of completedDocTasksByRef) {
          if (key === ref || key.includes(ref) || ref.includes(key)) {
            item.documentTaskId = row.taskId || null;
            item.hasSignedDocument = !!row.signedDocId;
            break;
          }
        }
      }
    }

    if (def.phase === 'onboarding') {
      if (def.is_required) {
        onboardTotal++;
        if (item.isCompleted) {
          onboardDone++;
        } else {
          missingItems.push(item.label);
        }
      }
      if (!onboardingGroups[def.category]) {
        onboardingGroups[def.category] = {
          category: def.category,
          label: LifecycleChecklistDefinition.categoryLabel(def.category),
          items: [],
        };
      }
      onboardingGroups[def.category].items.push(item);
    } else if (def.phase === 'offboarding') {
      if (!offboardingGroups[def.category]) {
        offboardingGroups[def.category] = {
          category: def.category,
          label: LifecycleChecklistDefinition.categoryLabel(def.category),
          items: [],
        };
      }
      offboardingGroups[def.category].items.push(item);
    }
  }

  const onboardingCategoryOrder = LifecycleChecklistDefinition.categoryOrder('onboarding');
  const offboardingCategoryOrder = LifecycleChecklistDefinition.categoryOrder('offboarding');

  const onboardingGroupList = onboardingCategoryOrder
    .filter((c) => onboardingGroups[c])
    .map((c) => onboardingGroups[c]);
  const offboardingGroupList = offboardingCategoryOrder
    .filter((c) => offboardingGroups[c])
    .map((c) => offboardingGroups[c]);

  const onboardingProgress = onboardTotal > 0 ? Math.round((onboardDone / onboardTotal) * 100) : 0;

  const allOffboardItems = offboardingGroupList.flatMap((g) => g.items);
  const offboardingStatus = computeOffboardingStatus(user.termination_date, allOffboardItems);

  return {
    summary: {
      employeeStatus: user.status,
      isActive: user.is_active,
      startDate: milestones.start_date || (user.provider_start_date ? String(user.provider_start_date).slice(0, 10) : null),
      firstClientDate: milestones.first_client_date || null,
      supervisorName: supervisor ? `${supervisor.first_name} ${supervisor.last_name}`.trim() : null,
      supervisorEmail: supervisor?.email || null,
      lastDayWorked: separation?.last_day_worked || null,
      terminationDate: user.termination_date ? String(user.termination_date).slice(0, 10) : null,
      offboardingStatus,
      // Birthday — read-only mirror; source of truth is Provider Info EAV.
      // Anniversary automation uses EAV `start_date` (not provider_start_date).
      dateOfBirth: dateOfBirth || null,
      // Leave of absence — read-only mirror; edit via header "Record leave" button.
      leave: leaveInfo
        ? {
            leaveType: leaveInfo.leaveType,
            departureDate: leaveInfo.departureDate,
            returnDate: leaveInfo.returnDate,
            isOnLeave: leaveInfo.isOnLeave,
            leaveLabel: leaveInfo.leaveLabel,
          }
        : null,
    },
    onboarding: {
      progress: onboardingProgress,
      missingItems,
      timeline: buildTimeline(user, milestones, firstSupervisionDate),
      firstSupervisionDate,
      employmentDates: {
        offerAcceptedDate: milestones.offer_accepted_date || null,
        startDate: milestones.start_date || (user.provider_start_date ? String(user.provider_start_date).slice(0, 10) : null),
        orientationDate: milestones.orientation_date || null,
        therapyNotesTrainingDate: milestones.therapy_notes_training_date || null,
        firstClientDate: milestones.first_client_date || null,
        firstPayrollSubmissionDate: milestones.first_payroll_submission_date || null,
        probationEndDate: milestones.probation_end_date || null,
        // Read-only: stamped by hiring pipeline, not editable on profile
        hiredAt: user.hired_at ? String(user.hired_at).slice(0, 10) : null,
        // Read-only: set when status becomes ACTIVE_EMPLOYEE
        completedAt: user.completed_at ? String(user.completed_at).slice(0, 10) : null,
      },
      groups: onboardingGroupList,
    },
    offboarding: {
      enabled: !!user.termination_date,
      terminationDate: user.termination_date ? String(user.termination_date).slice(0, 10) : null,
      // Exact timestamp when Mark Terminated was pressed (separate from the date field)
      terminatedAt: user.terminated_at ? String(user.terminated_at).slice(0, 10) : null,
      // 7-day grace period expiry
      statusExpiresAt: user.status_expires_at
        ? String(user.status_expires_at).slice(0, 10)
        : null,
      separation: {
        lastDayWorked: separation?.last_day_worked || null,
        separationType: separation?.separation_type || null,
        resignationReceivedDate: separation?.resignation_received_date || null,
        rehireEligible: separation?.rehire_eligible != null ? !!separation.rehire_eligible : null,
        exitInterviewCompleted: !!separation?.exit_interview_completed,
        offboardingNotes: separation?.offboarding_notes || null,
      },
      groups: offboardingGroupList,
    },
  };
}

/**
 * Save employment milestone dates back via user_info_values EAV.
 */
export async function saveMilestoneDates(userId, dates) {
  const uid = Number(userId);
  const allowed = new Set(MILESTONE_FIELD_KEYS);

  for (const [key, value] of Object.entries(dates)) {
    if (!allowed.has(key)) continue;

    // Resolve definition id for this field key
    const [defRows] = await pool.execute(
      `SELECT id FROM user_info_field_definitions
       WHERE field_key = ? AND agency_id IS NULL
       LIMIT 1`,
      [key]
    );
    const defId = defRows?.[0]?.id;
    if (!defId) continue;

    const v = value || null;
    if (v) {
      await pool.execute(
        `INSERT INTO user_info_values (user_id, field_definition_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [uid, defId, v]
      );
    } else {
      await pool.execute(
        `DELETE FROM user_info_values WHERE user_id = ? AND field_definition_id = ?`,
        [uid, defId]
      );
    }
  }

  // Also update users.provider_start_date if start_date supplied
  if (dates.start_date !== undefined) {
    await pool.execute(
      `UPDATE users SET provider_start_date = ? WHERE id = ? LIMIT 1`,
      [dates.start_date || null, uid]
    );
  }
}
