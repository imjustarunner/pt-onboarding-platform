/**
 * Pre-hire candidate portal controller.
 *
 * All routes in this controller are protected by authenticatePrehireToken —
 * no full login required. `req.portalUser` is the validated candidate.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import HiringNote from '../models/HiringNote.model.js';
import EmailService from '../services/email.service.js';
import { syncLifecycleItems } from '../services/lifecycleSync.service.js';
import { mergePrehireDocuments } from '../utils/prehireConfigSanitize.js';
import { sanitizeJobDescriptionSections } from '../utils/jobDescriptionSectionsSanitize.js';
import { buildBackgroundCheckLegalCopy } from '../utils/backgroundCheckLegalCopy.js';

function resolveBaseUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

function normalizeUploadsPath(p) {
  if (!p) return null;
  let cleaned = String(p);
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
  return cleaned;
}

function resolveLogoUrl(req, raw) {
  if (!raw) return null;
  if (raw.logo_url && String(raw.logo_url).startsWith('http')) return raw.logo_url;
  const baseUrl = resolveBaseUrl(req);
  const cleaned = normalizeUploadsPath(raw.logo_path);
  if (cleaned) return `${baseUrl}/uploads/${cleaned}`;
  return raw.logo_url || null;
}

function resolveProfilePhotoUrl(req, photoPath) {
  const cleaned = normalizeUploadsPath(photoPath);
  if (!cleaned) return null;
  return `${resolveBaseUrl(req)}/uploads/${cleaned}`;
}

function buildAgencyBranding(req, raw) {
  if (!raw) return null;
  const palette = (() => {
    try {
      return typeof raw.color_palette === 'string' ? JSON.parse(raw.color_palette) : (raw.color_palette || {});
    } catch {
      return {};
    }
  })();
  const theme = (() => {
    try {
      return typeof raw.theme_settings === 'string' ? JSON.parse(raw.theme_settings) : (raw.theme_settings || {});
    } catch {
      return {};
    }
  })();
  const primaryColor = palette.primary || theme.primaryColor || theme.primary_color || '#1d4ed8';
  const secondaryColor = palette.secondary || theme.secondaryColor || theme.secondary_color || primaryColor;
  const accentColor = palette.accent || theme.accentColor || theme.accent_color || secondaryColor || primaryColor;
  return {
    id: raw.id,
    name: raw.name,
    officialName: raw.official_name || null,
    legalName: raw.official_name || raw.name || null,
    streetAddress: raw.street_address || null,
    city: raw.city || null,
    state: raw.state || null,
    postalCode: raw.postal_code || null,
    logoUrl: resolveLogoUrl(req, raw),
    phoneNumber: raw.phone_number || null,
    portalUrl: raw.portal_url || null,
    primaryColor,
    secondaryColor,
    accentColor,
    sidebarColor: theme.sidebarColor || theme.sidebar_color || palette.sidebar || null,
    fontFamily: theme.fontFamily || palette.fontFamily || null,
    palette,
    theme
  };
}

async function loadSupportTeam(req, agencyId) {
  if (!agencyId) return { label: 'People Operations', members: [] };
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_path
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND u.is_active = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND u.role IN ('admin', 'super_admin', 'agency_admin')
       ORDER BY u.first_name ASC, u.last_name ASC
       LIMIT 3`,
      [agencyId]
    );
    return {
      label: 'People Operations',
      members: (rows || []).map((r) => ({
        id: r.id,
        firstName: r.first_name || '',
        lastName: r.last_name || '',
        initials: `${(r.first_name || '')[0] || ''}${(r.last_name || '')[0] || ''}`.toUpperCase() || 'PO',
        photoUrl: resolveProfilePhotoUrl(req, r.profile_photo_path)
      }))
    };
  } catch {
    return { label: 'People Operations', members: [] };
  }
}

// ─── GET /api/prehire-portal/:token ─────────────────────────────────────────
// Returns portal state: candidate info, org info, tasks, overall progress.

export const getPortal = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;

    // Candidate info (full record)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found.' } });

    // Agency / org info + branding
    let agency = null;
    let agencyRaw = null;
    let supportTeam = { label: 'People Operations', members: [] };
    try {
      const [agRows] = await pool.execute(
        `SELECT a.id, a.name, a.official_name, a.logo_url, a.logo_path, a.color_palette, a.theme_settings,
                a.phone_number, a.portal_url, a.feature_flags,
                a.street_address, a.city, a.state, a.postal_code
         FROM agencies a
         JOIN user_agencies ua ON ua.agency_id = a.id
         WHERE ua.user_id = ?
         LIMIT 1`,
        [userId]
      );
      agencyRaw = agRows[0] || null;
      if (agencyRaw) {
        agency = buildAgencyBranding(req, agencyRaw);
        supportTeam = await loadSupportTeam(req, agencyRaw.id);
      }
    } catch { /* ignore */ }

    // Hiring profile (role, stage)
    let hiringProfile = null;
    try {
      const [hRows] = await pool.execute(
        `SELECT applied_role, stage, cover_letter, languages_json, references_json, job_description_id
         FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
        [userId]
      );
      hiringProfile = hRows[0] || null;
    } catch {
      try {
        const [hRows] = await pool.execute(
          `SELECT applied_role, stage FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
          [userId]
        );
        hiringProfile = hRows[0] || null;
      } catch { /* ignore */ }
    }

    const featureFlags = (() => {
      try {
        const raw = agencyRaw?.feature_flags;
        return typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      } catch {
        return {};
      }
    })();
    const hireAccountMode = String(featureFlags.hireAccountMode || '').trim().toLowerCase() || null;
    const accountSetupComplete = Boolean(
      user.work_email
      && (
        hireAccountMode !== 'group_password'
        || user.sso_password_override === 1
        || user.sso_password_override === true
        || user.sso_password_override === '1'
      )
    );

    const status = String(user.status || '').toUpperCase();
    let portalPhase = 'pre_hire';
    if (status === 'PREHIRE_REVIEW') portalPhase = 'review';
    else if (status === 'ONBOARDING') portalPhase = 'onboarding';
    else if (status === 'PENDING_SETUP' || status === 'PREHIRE_OPEN') {
      portalPhase = hireAccountMode === 'group_password' && !accountSetupComplete
        ? 'account_setup'
        : 'pre_hire';
    }

    // Tasks assigned to the candidate (exclude countersign tasks, which are for staff)
    const [taskRows] = await pool.execute(
      `SELECT id, task_type, document_action_type, title, description, status, due_date, reference_id, metadata, is_required
       FROM tasks
       WHERE assigned_to_user_id = ?
         AND (document_action_type IS NULL OR document_action_type != 'countersignature')
         AND status NOT IN ('overridden', 'archived')
       ORDER BY is_required DESC, created_at ASC`,
      [userId]
    );

    const tasks = (taskRows || []).map(t => ({
      id: t.id,
      taskType: t.task_type,
      actionType: t.document_action_type,
      title: t.title,
      description: t.description,
      status: t.status,
      dueDate: t.due_date,
      referenceId: t.reference_id,
      isRequired: t.is_required === 1 || t.is_required === true,
      metadata: (() => { try { return typeof t.metadata === 'string' ? JSON.parse(t.metadata) : (t.metadata || {}); } catch { return {}; } })()
    }));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    // Progress % is based on required tasks only when any are marked required; falls back to all tasks
    const requiredTasks = tasks.filter(t => t.isRequired);
    const completedRequired = requiredTasks.filter(t => t.status === 'completed').length;
    const allDone = totalTasks > 0 && completedTasks === totalTasks;
    const token = String(req.params.token || '');
    const portalPath = token ? `/pre-hire/${token}` : null;
    const portalLink = portalPath ? `${resolveBaseUrl(req)}${portalPath}` : null;

    let credentialPacket = null;
    try {
      const { getCredentialPacketForPortal } = await import('../services/onboardingCredentialPacket.service.js');
      credentialPacket = await getCredentialPacketForPortal(userId);
    } catch {
      credentialPacket = null;
    }

    res.json({
      candidate: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.personal_email || user.email,
        workEmail: user.work_email || null,
        personalEmail: user.personal_email || null,
        status: user.status,
        appliedRole: hiringProfile?.applied_role || null,
        ssoPasswordOverride: Boolean(
          user.sso_password_override === 1
          || user.sso_password_override === true
          || user.sso_password_override === '1'
        ),
        accountSetupComplete
      },
      agency,
      supportTeam,
      tasks,
      portalLink,
      portalPath,
      tokenExpiresAt: user.passwordless_token_expires_at || null,
      credentialPacket,
      portalPhase,
      hireAccountMode,
      hiringProfile: hiringProfile
        ? {
            appliedRole: hiringProfile.applied_role || null,
            stage: hiringProfile.stage || null,
            coverLetter: hiringProfile.cover_letter || null,
            languages: (() => {
              try {
                const raw = hiringProfile.languages_json;
                return typeof raw === 'string' ? JSON.parse(raw) : (raw || null);
              } catch {
                return null;
              }
            })()
          }
        : null,
      progress: {
        total: totalTasks,
        completed: completedTasks,
        requiredTotal: requiredTasks.length,
        requiredCompleted: completedRequired,
        allDone,
        percent: totalTasks
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0
      },
      backgroundCheck: await (async () => {
        try {
          const { getBackgroundCheckAuthorizationSummary } = await import('../services/backgroundCheckAuthorization.service.js');
          return await getBackgroundCheckAuthorizationSummary(userId, agencyRaw?.id);
        } catch {
          return { signed: false };
        }
      })(),
      backgroundCheckLegal: buildBackgroundCheckLegalCopy(agencyRaw || {}, {
        legalName: `${user.first_name || ''} ${user.last_name || ''}`.trim()
      }),
      handbookLinks: await (async () => {
        try {
          const [sRows] = await pool.execute(`SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1`, [agencyRaw?.id]);
          const raw = sRows[0]?.prehire_settings;
          const settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
          return {
            acknowledgementUrl: String(settings.handbook_ack_url || '').trim() || null,
            fullUrl: String(settings.handbook_full_url || '').trim() || null
          };
        } catch {
          return { acknowledgementUrl: null, fullUrl: null };
        }
      })(),
      ...(await loadPortalPrehireExtras({ userId, agencyId: agencyRaw?.id, hiringProfile }))
    });
  } catch (e) { next(e); }
};

// ─── GET /api/prehire-portal/:token/tasks/:taskId ────────────────────────────
// Get a single task for document signing — verifies the task belongs to this candidate.

export const getPortalTask = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    if (!taskId) return res.status(400).json({ error: { message: 'Invalid task ID.' } });

    const [rows] = await pool.execute(
      `SELECT t.*, dt.name as template_name, dt.html_content, dt.field_definitions,
              dt.document_type, dt.document_action_type as template_action_type,
              dt.template_type, dt.file_path
       FROM tasks t
       LEFT JOIN document_templates dt ON dt.id = t.reference_id
       WHERE t.id = ? AND t.assigned_to_user_id = ?
         AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
       LIMIT 1`,
      [taskId, userId]
    );

    if (!rows.length) return res.status(404).json({ error: { message: 'Task not found.' } });

    const task = rows[0];
    const fieldDefs = (() => {
      try { return typeof task.field_definitions === 'string' ? JSON.parse(task.field_definitions) : (task.field_definitions || null); }
      catch { return null; }
    })();
    const metadata = (() => {
      try { return typeof task.metadata === 'string' ? JSON.parse(task.metadata) : (task.metadata || {}); }
      catch { return {}; }
    })();

    res.json({
      id: task.id,
      taskType: task.task_type,
      actionType: task.document_action_type,
      title: task.title,
      description: task.description,
      status: task.status,
      referenceId: task.reference_id,
      metadata,
      document: task.reference_id ? {
        name: task.template_name,
        htmlContent: task.html_content || null,
        filePath: task.file_path || null,
        documentType: task.document_type,
        templateType: task.template_type,
        fieldDefinitions: fieldDefs
      } : null,
      auditTrail: (() => {
        try { return typeof task.audit_trail === 'string' ? JSON.parse(task.audit_trail) : (task.audit_trail || {}); }
        catch { return {}; }
      })()
    });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/tasks/:taskId/consent ──────────────────

export const portalConsent = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    await ensureTaskOwnership(taskId, userId);

    const { consentGiven, consentTimestamp } = req.body;

    const [existing] = await pool.execute(
      'SELECT id, audit_trail FROM tasks WHERE id = ?',
      [taskId]
    );
    if (!existing.length) return res.status(404).json({ error: { message: 'Task not found.' } });

    const trail = parseJson(existing[0].audit_trail);
    trail.portalConsent = {
      given: !!consentGiven,
      timestamp: consentTimestamp || new Date().toISOString(),
      userId,
      via: 'prehire_portal'
    };

    await pool.execute(
      'UPDATE tasks SET audit_trail = ? WHERE id = ?',
      [JSON.stringify(trail), taskId]
    );

    res.json({ ok: true, consentGiven: !!consentGiven });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/tasks/:taskId/intent ───────────────────

export const portalIntent = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    await ensureTaskOwnership(taskId, userId);

    const { intendedAction } = req.body;

    const [existing] = await pool.execute(
      'SELECT id, audit_trail FROM tasks WHERE id = ?',
      [taskId]
    );
    if (!existing.length) return res.status(404).json({ error: { message: 'Task not found.' } });

    const trail = parseJson(existing[0].audit_trail);
    trail.portalIntent = {
      intendedAction: intendedAction || 'sign',
      timestamp: new Date().toISOString(),
      userId,
      via: 'prehire_portal'
    };

    await pool.execute(
      'UPDATE tasks SET audit_trail = ? WHERE id = ?',
      [JSON.stringify(trail), taskId]
    );

    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/tasks/:taskId/sign ─────────────────────
// Candidate signs (or acknowledges) a document task in the portal.
// Delegates to the existing DocumentSigningService for PDF generation.

export const portalSign = async (req, res, next) => {
  try {
    const { id: userId, first_name, last_name } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    await ensureTaskOwnership(taskId, userId);

    const { signatureData, fieldValues } = req.body;
    if (!signatureData) {
      return res.status(400).json({ error: { message: 'Signature data is required.' } });
    }

    // Delegate to document signing service — same logic as authenticated staff signing
    const DocumentSigningService = (await import('../services/documentSigning.service.js')).default;

    const result = await DocumentSigningService.signTask({
      taskId,
      userId,
      signerName: `${first_name} ${last_name}`.trim(),
      signatureData,
      fieldValues: fieldValues || {},
      context: 'prehire_portal',
      ipAddress: req.ip
    });

    // Mark task complete
    await pool.execute(
      `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [taskId]
    );

    try {
      const [metaRows] = await pool.execute(`SELECT title, metadata FROM tasks WHERE id = ? LIMIT 1`, [taskId]);
      const meta = parseJson(metaRows[0]?.metadata);
      if (meta.contractGeneration || meta.autoFromSendPreHire) {
        const title = metaRows[0]?.title || 'Employment agreement';
        try {
          await pool.execute(
            `INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, created_by_user_id, is_legal_hold)
             VALUES (?, ?, 'employment_contract', ?, ?, 1)`,
            [userId, title, 'Signed employment contract — legal hold. Do not delete.', userId]
          );
        } catch {
          /* column or table may not exist */
        }
      }
    } catch { /* ignore */ }

    // Sync lifecycle checklist so the staff-facing lifecycle tab reflects the signed document
    setImmediate(() => syncLifecycleItems(userId).catch(() => {}));

    // Check if all candidate tasks are now done — if so advance status
    await maybeAdvanceCandidateStatus(userId);

    res.json({ ok: true, signedAt: new Date().toISOString(), result });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/tasks/:taskId/acknowledge ──────────────
// For review-only (no signature) tasks — candidate acknowledges they've read it.

export const portalAcknowledge = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    await ensureTaskOwnership(taskId, userId);

    const [existing] = await pool.execute(
      'SELECT id, task_type, document_action_type, status FROM tasks WHERE id = ?',
      [taskId]
    );
    if (!existing.length) return res.status(404).json({ error: { message: 'Task not found.' } });

    await pool.execute(
      `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [taskId]
    );

    // Sync lifecycle checklist so the staff-facing lifecycle tab reflects the acknowledged document
    setImmediate(() => syncLifecycleItems(userId).catch(() => {}));

    await maybeAdvanceCandidateStatus(userId);

    res.json({ ok: true, acknowledgedAt: new Date().toISOString() });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/complete ────────────────────────────────
// Explicit "I'm done" button — advances status even if not all tasks completed,
// but warns the candidate if any are still pending.

export const portalComplete = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;

    const [taskRows] = await pool.execute(
      `SELECT id, status FROM tasks
       WHERE assigned_to_user_id = ?
         AND (document_action_type IS NULL OR document_action_type != 'countersignature')
         AND status NOT IN ('overridden', 'archived')`,
      [userId]
    );

    const total = taskRows.length;
    const completed = taskRows.filter(t => t.status === 'completed').length;
    const hasIncomplete = completed < total;

    if (hasIncomplete && !req.body.force) {
      return res.status(400).json({
        error: {
          code: 'TASKS_INCOMPLETE',
          message: `You have ${total - completed} item(s) still pending. Please complete all items or submit with force=true to proceed anyway.`,
          total,
          completed
        }
      });
    }

    await advanceCandidateStatus(userId);

    res.json({
      ok: true,
      message: 'Your pre-hire documents have been submitted for review. Your hiring team will be in touch shortly.',
      advancedTo: 'PREHIRE_REVIEW'
    });
  } catch (e) { next(e); }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureTaskOwnership(taskId, userId) {
  const [rows] = await pool.execute(
    'SELECT id FROM tasks WHERE id = ? AND assigned_to_user_id = ?',
    [taskId, userId]
  );
  if (!rows.length) {
    const err = new Error('Task not found or does not belong to you.');
    err.status = 404;
    throw err;
  }
}

function parseJson(v) {
  if (!v) return {};
  try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); }
  catch { return {}; }
}

async function maybeAdvanceCandidateStatus(userId) {
  try {
    const [taskRows] = await pool.execute(
      `SELECT id, status FROM tasks
       WHERE assigned_to_user_id = ?
         AND (document_action_type IS NULL OR document_action_type != 'countersignature')
         AND status NOT IN ('overridden', 'archived')`,
      [userId]
    );

    const allDone = taskRows.length > 0 && taskRows.every(t => t.status === 'completed');
    if (allDone) {
      await advanceCandidateStatus(userId);
    }
  } catch (e) {
    console.error('[prehirePortal] maybeAdvanceCandidateStatus error:', e);
  }
}

async function advanceCandidateStatus(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  // Only advance if still in a pre-hire portal status
  if (user.status !== 'PENDING_SETUP' && user.status !== 'PREHIRE_OPEN') return;

  const targetStatus = 'PREHIRE_REVIEW';
  await User.updateStatus(userId, targetStatus, null);

  // Sync lifecycle tab so status-based items reflect the completion
  setImmediate(() => syncLifecycleItems(userId).catch(() => {}));

  // Notify staff — create a system task for any admin in the agency
  try {
    const [agencyRows] = await pool.execute(
      `SELECT agency_id FROM user_agencies WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    const agencyId = agencyRows[0]?.agency_id;

    if (agencyId) {
      await pool.execute(
        `INSERT INTO tasks (
          task_type, title, description,
          assigned_to_role, assigned_to_agency_id,
          reference_id, metadata, status
        ) VALUES (
          'notification',
          ?,
          ?,
          'admin', ?,
          ?, ?, 'pending'
        )`,
        [
          `Pre-hire review needed: ${user.first_name} ${user.last_name}`,
          `${user.first_name} ${user.last_name} has completed all pre-hire items and is ready for review.`,
          agencyId,
          userId,
          JSON.stringify({ type: 'prehire_complete', candidateUserId: userId })
        ]
      );

      // Also email admin users at this agency so they're notified immediately.
      setImmediate(async () => {
        try {
          const [adminRows] = await pool.execute(
            `SELECT u.email, u.first_name
             FROM users u
             INNER JOIN user_agencies ua ON u.id = ua.user_id
             WHERE ua.agency_id = ?
               AND u.role IN ('admin', 'super_admin')
               AND u.is_active = TRUE
               AND (u.is_archived = FALSE OR u.is_archived IS NULL)
             LIMIT 10`,
            [agencyId]
          );
          const candidateName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
          for (const admin of adminRows) {
            await EmailService.sendEmail({
              to: admin.email,
              subject: `Pre-hire review needed: ${candidateName}`,
              text: `Hi ${admin.first_name || 'there'},\n\n${candidateName} has completed all pre-hire documents and is ready for your review.\n\nLog in to People Ops → Pre-Hire to review their submission and promote them to onboarding.\n\nThis is an automated notification.`
            }).catch(() => {});
          }
        } catch (emailErr) {
          console.error('[prehirePortal] Admin notification email failed:', emailErr);
        }
      });
    }
  } catch (e) {
    console.error('[prehirePortal] Staff notification task creation failed:', e);
  }
}

// ─── POST /api/prehire-portal/:token/tasks/:taskId/complete-form ─────────────
// Marks an intake_form task as completed after the candidate fills out the form.
export const completeIntakeFormTask = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const taskId = parseInt(req.params.taskId, 10);
    if (!taskId) return res.status(400).json({ error: { message: 'Invalid task ID.' } });

    const [rows] = await pool.execute(
      `SELECT id, task_type, assigned_to_user_id, status
       FROM tasks WHERE id = ? AND assigned_to_user_id = ? LIMIT 1`,
      [taskId, userId]
    );
    const task = rows[0];
    if (!task) return res.status(404).json({ error: { message: 'Task not found.' } });
    if (!['intake_form', 'training'].includes(task.task_type)) {
      return res.status(400).json({ error: { message: 'Task is not a form or training task.' } });
    }
    if (task.status === 'completed') {
      return res.json({ ok: true, already: true });
    }

    await pool.execute(
      `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [taskId]
    );

    await maybeAdvanceCandidateStatus(userId);

    // Trigger search index rebuild asynchronously so the new form data is searchable
    setImmediate(async () => {
      try {
        const [agRows] = await pool.execute(
          `SELECT agency_id FROM user_agencies WHERE user_id = ? LIMIT 1`,
          [userId]
        );
        const agencyId = agRows[0]?.agency_id;
        if (agencyId) {
          const { default: ProviderSearchIndex } = await import('../models/ProviderSearchIndex.model.js');
          await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId });
        }
      } catch { /* non-fatal */ }
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ─── GET /api/prehire-portal/:token/messages ─────────────────────────────────
export const listPortalMessages = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const messages = await HiringNote.listPortalMessages(userId);
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        message: m.message,
        createdAt: m.created_at,
        isCandidate: m.author_user_id === userId,
        authorName: m.author_user_id === userId
          ? null
          : `${m.author_first_name || ''} ${m.author_last_name || ''}`.trim() || 'People Operations'
      }))
    });
  } catch (e) { next(e); }
};

// ─── POST /api/prehire-portal/:token/messages ────────────────────────────────
export const sendPortalMessage = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const note = await HiringNote.create({
      candidateUserId: userId,
      authorUserId: userId,
      message,
      isPortalMessage: true
    });

    setImmediate(async () => {
      try {
        const { syncCandidatePortalMessageToTicket } = await import('../services/prehirePortalChatTicket.service.js');
        const name = `${req.portalUser.first_name || ''} ${req.portalUser.last_name || ''}`.trim();
        await syncCandidatePortalMessageToTicket({
          candidateUserId: userId,
          candidateName: name,
          message
        });
      } catch (err) {
        console.warn('[sendPortalMessage] ticket sync failed:', err?.message);
      }
    });

    res.status(201).json({
      id: note.id,
      message: note.message,
      createdAt: note.created_at,
      isCandidate: true,
      authorName: null
    });
  } catch (e) { next(e); }
};

// ─── Token-scoped module / employee-info form ────────────────────────────────

async function assertPortalModuleAssigned(userId, moduleId) {
  const mid = Number(moduleId);
  if (!Number.isInteger(mid) || mid < 1) {
    const err = new Error('Invalid module ID.');
    err.status = 400;
    throw err;
  }
  const [rows] = await pool.execute(
    `SELECT id, status
     FROM tasks
     WHERE assigned_to_user_id = ?
       AND task_type = 'training'
       AND reference_id = ?
       AND status NOT IN ('overridden', 'archived')
     ORDER BY id DESC
     LIMIT 1`,
    [userId, mid]
  );
  if (!rows?.[0]) {
    const err = new Error('This form is not assigned to you.');
    err.status = 403;
    throw err;
  }
  return { moduleId: mid, taskId: Number(rows[0].id), taskStatus: rows[0].status };
}

export const getPortalModule = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    const Module = (await import('../models/Module.model.js')).default;
    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ error: { message: 'Module not found.' } });
    res.json(module);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPortalModuleContent = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    const ModuleContent = (await import('../models/ModuleContent.model.js')).default;
    const content = await ModuleContent.findByModuleId(moduleId);
    res.json(content || []);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPortalModuleFormDefinition = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    // Reuse authenticated form definition logic with portal user as req.user
    req.user = { id: userId, role: req.portalUser.role };
    req.params.moduleId = String(moduleId);
    const { getModuleFormDefinition } = await import('./moduleForm.controller.js');
    return getModuleFormDefinition(req, res, next);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const submitPortalModuleForm = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    req.user = { id: userId, role: req.portalUser.role };
    req.params.moduleId = String(moduleId);
    const { submitModuleForm } = await import('./moduleForm.controller.js');
    return submitModuleForm(req, res, next);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const uploadPortalModuleFormFile = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    req.user = { id: userId, role: req.portalUser.role };
    req.params.moduleId = String(moduleId);
    const { uploadModuleFormFile } = await import('./moduleForm.controller.js');
    // uploadModuleFormFile is an array middleware [multer, handler]
    if (Array.isArray(uploadModuleFormFile)) {
      let i = 0;
      const run = (err) => {
        if (err) return next(err);
        const mw = uploadModuleFormFile[i++];
        if (!mw) return;
        return mw(req, res, run);
      };
      return run();
    }
    return uploadModuleFormFile(req, res, next);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const startPortalModule = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId, taskId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    const UserProgress = (await import('../models/UserProgress.model.js')).default;
    const progress = await UserProgress.createOrUpdate(userId, moduleId, { status: 'in_progress' });
    try {
      await pool.execute(
        `UPDATE tasks SET status = 'in_progress' WHERE id = ? AND status = 'pending'`,
        [taskId]
      );
    } catch { /* non-fatal */ }
    res.json(progress);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const completePortalModule = async (req, res, next) => {
  try {
    const { id: userId } = req.portalUser;
    const { moduleId, taskId } = await assertPortalModuleAssigned(userId, req.params.moduleId);
    const UserProgress = (await import('../models/UserProgress.model.js')).default;
    const Task = (await import('../models/Task.model.js')).default;

    const progress = await UserProgress.createOrUpdate(userId, moduleId, { status: 'completed' });
    try {
      await Task.markComplete(taskId, userId);
    } catch (taskErr) {
      console.error('[prehirePortal] mark training task complete failed:', taskErr);
      await pool.execute(
        `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
        [taskId]
      );
    }

    await maybeAdvanceCandidateStatus(userId);

    const token = String(req.params.token || '');
    const portalPath = token ? `/pre-hire/${token}` : null;
    res.json({
      ok: true,
      progress,
      portalPath,
      portalLink: portalPath ? `${resolveBaseUrl(req)}${portalPath}` : null,
      message: 'Form completed. You can return to your portal anytime with your personal link.'
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

// ─── Credential packet (onboarding accounts & access) ─────────────────────────

export const getPortalCredentialPacket = async (req, res, next) => {
  try {
    const { getCredentialPacketForPortal } = await import('../services/onboardingCredentialPacket.service.js');
    const packet = await getCredentialPacketForPortal(req.portalUser.id);
    res.json({ credentialPacket: packet });
  } catch (e) { next(e); }
};

export const confirmPortalCredentialIdentity = async (req, res, next) => {
  try {
    const { confirmPortalIdentity } = await import('../services/onboardingCredentialPacket.service.js');
    const packet = await confirmPortalIdentity(req.portalUser.id, {
      legalFirstName: req.body?.legalFirstName ?? req.body?.firstName,
      legalLastName: req.body?.legalLastName ?? req.body?.lastName,
      personalPhone: req.body?.personalPhone ?? req.body?.phone
    });
    res.json({ ok: true, credentialPacket: packet });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const acknowledgePortalCredentialSystem = async (req, res, next) => {
  try {
    const { acknowledgePortalSystem } = await import('../services/onboardingCredentialPacket.service.js');
    const systemKey = req.params.systemKey || req.body?.systemKey;
    const packet = await acknowledgePortalSystem(req.portalUser.id, systemKey);
    res.json({ ok: true, credentialPacket: packet });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const revealPortalCredentialTempPassword = async (req, res, next) => {
  try {
    const { revealPortalTempPassword } = await import('../services/onboardingCredentialPacket.service.js');
    const systemKey = req.params.systemKey || req.body?.systemKey;
    const result = await revealPortalTempPassword(req.portalUser.id, systemKey);
    res.json(result);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

async function loadPortalAgency(userId) {
  const [agRows] = await pool.execute(
    `SELECT a.*
     FROM agencies a
     JOIN user_agencies ua ON ua.agency_id = a.id
     WHERE ua.user_id = ?
     LIMIT 1`,
    [userId]
  );
  return agRows[0] || null;
}

// ─── Hire Group account setup (group_password mode) ──────────────────────────

export const getPortalAccountSuggestions = async (req, res, next) => {
  try {
    const user = await User.findById(req.portalUser.id);
    if (!user) return res.status(404).json({ error: { message: 'User not found.' } });
    const agency = await loadPortalAgency(user.id);
    if (!agency) return res.status(400).json({ error: { message: 'No organization found.' } });
    const {
      isGroupPasswordHireMode,
      suggestHireWorkEmails
    } = await import('../services/hireGroupAccount.service.js');
    if (!isGroupPasswordHireMode(agency)) {
      return res.json({ enabled: false, suggestions: [] });
    }
    const result = await suggestHireWorkEmails({ user, agency });
    res.json({ enabled: true, ...result });
  } catch (e) { next(e); }
};

export const checkPortalAccountEmail = async (req, res, next) => {
  try {
    const email = req.body?.email || req.query?.email;
    const agency = await loadPortalAgency(req.portalUser.id);
    if (!agency) return res.status(400).json({ error: { message: 'No organization found.' } });
    const { checkHireWorkEmailAvailability } = await import('../services/hireGroupAccount.service.js');
    const result = await checkHireWorkEmailAvailability({
      email,
      userId: req.portalUser.id,
      agency
    });
    res.json(result);
  } catch (e) { next(e); }
};

export const provisionPortalAccount = async (req, res, next) => {
  try {
    const workEmail = req.body?.workEmail || req.body?.email;
    const password = req.body?.password;
    const confirmPassword = req.body?.confirmPassword;
    if (confirmPassword != null && String(confirmPassword) !== String(password || '')) {
      return res.status(400).json({ error: { message: 'Passwords do not match.' } });
    }
    const user = await User.findById(req.portalUser.id);
    if (!user) return res.status(404).json({ error: { message: 'User not found.' } });
    if (user.work_email && user.sso_password_override) {
      return res.status(400).json({
        error: { message: 'Account already set up.', workEmail: user.work_email }
      });
    }
    const agency = await loadPortalAgency(user.id);
    if (!agency) return res.status(400).json({ error: { message: 'No organization found.' } });
    const { provisionHireGroupAccount } = await import('../services/hireGroupAccount.service.js');
    const result = await provisionHireGroupAccount({
      user,
      agency,
      workEmail,
      password
    });
    // Move PENDING_SETUP → PREHIRE_OPEN so docs/tasks become the focus
    if (String(user.status || '').toUpperCase() === 'PENDING_SETUP') {
      try {
        await User.updateStatus(user.id, 'PREHIRE_OPEN', user.id);
      } catch {
        /* ignore */
      }
    }
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e?.code === 'EMAIL_UNAVAILABLE') {
      return res.status(409).json({ error: { message: e.message, details: e.details } });
    }
    if (e?.message) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

// ─── Submissions + resources ─────────────────────────────────────────────────

export const getPortalSubmissions = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const user = await User.findById(userId);
    let hiringProfile = null;
    try {
      const [hRows] = await pool.execute(
        `SELECT * FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
        [userId]
      );
      hiringProfile = hRows[0] || null;
    } catch { /* ignore */ }

    let adminDocs = [];
    try {
      const [docs] = await pool.execute(
        `SELECT id, title, category, file_path, created_at
         FROM user_admin_docs
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 40`,
        [userId]
      );
      adminDocs = (docs || []).map((d) => ({
        id: d.id,
        title: d.title || d.category || 'Uploaded file',
        category: d.category || null,
        createdAt: d.created_at
      }));
    } catch { /* ignore */ }

    const [signedRows] = await pool.execute(
      `SELECT id, title, status, document_action_type, completed_at, created_at
       FROM tasks
       WHERE assigned_to_user_id = ?
         AND task_type = 'document'
         AND status = 'completed'
       ORDER BY COALESCE(completed_at, created_at) DESC
       LIMIT 40`,
      [userId]
    ).catch(() => [[]]);

    let applications = [];
    try {
      const [appRows] = await pool.execute(
        `SELECT id, form_type, submitted_at, created_at, public_key
         FROM intake_submissions
         WHERE guardian_user_id = ?
         ORDER BY COALESCE(submitted_at, created_at) DESC
         LIMIT 10`,
        [userId]
      );
      applications = appRows || [];
    } catch { /* ignore */ }

    res.json({
      candidate: {
        firstName: user?.first_name,
        lastName: user?.last_name,
        personalEmail: user?.personal_email || user?.email,
        workEmail: user?.work_email || null
      },
      hiringProfile: hiringProfile
        ? {
            appliedRole: hiringProfile.applied_role,
            stage: hiringProfile.stage,
            coverLetter: hiringProfile.cover_letter || null,
            source: hiringProfile.source || null
          }
        : null,
      uploadedMaterials: adminDocs,
      completedDocuments: (signedRows || []).map((t) => ({
        id: t.id,
        title: t.title,
        actionType: t.document_action_type,
        completedAt: t.completed_at || t.created_at
      })),
      applications: applications.map((a) => ({
        id: a.id,
        formType: a.form_type,
        submittedAt: a.submitted_at || a.created_at
      }))
    });
  } catch (e) { next(e); }
};

export const submitPortalBackgroundCheck = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const agency = await loadPortalAgency(userId);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found.' } });
    const { saveBackgroundCheckAuthorization } = await import('../services/backgroundCheckAuthorization.service.js');
    const user = await User.findById(userId);
    const signerName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    const summary = await saveBackgroundCheckAuthorization({
      userId,
      agencyId: agency.id,
      payload: req.body || {},
      signerName
    });
    try {
      const note = `Authorization signed. SSN ${summary.ssnMasked}. DL ${summary.dlMasked}. Data is encrypted at rest.`;
      await pool.execute(
        `INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, created_by_user_id, is_legal_hold)
         VALUES (?, ?, 'background_check_authorization', ?, ?, 1)`,
        [userId, 'Authorization for Background Check', note, userId]
      );
    } catch {
      try {
        const note = `Authorization signed. SSN ${summary.ssnMasked}. DL ${summary.dlMasked}. Data is encrypted at rest.`;
        await pool.execute(
          `INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, created_by_user_id)
           VALUES (?, ?, 'background_check_authorization', ?, ?)`,
          [userId, 'Authorization for Background Check', note, userId]
        );
      } catch { /* ignore */ }
    }
    try {
      await pool.execute(
        `UPDATE hiring_prehire_checklist_items
         SET completed_on = COALESCE(completed_on, CURDATE())
         WHERE user_id = ? AND item_key = 'background_check'`,
        [userId]
      );
    } catch { /* ignore */ }
    res.json({ ok: true, ...summary });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const recordPortalHandbookOpen = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const agency = await loadPortalAgency(userId);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found.' } });
    const linkKey = String(req.body?.linkKey || 'full').trim().slice(0, 80) || 'full';
    await pool.execute(
      `INSERT INTO hiring_handbook_link_opens (user_id, agency_id, link_key) VALUES (?, ?, ?)`,
      [userId, agency.id, linkKey]
    );
    if (linkKey === 'ack' || linkKey === 'full') {
      const itemKey = linkKey === 'ack' ? 'handbook_ack' : 'handbook_full';
      try {
        await pool.execute(
          `UPDATE hiring_prehire_checklist_items
           SET completed_on = COALESCE(completed_on, CURDATE())
           WHERE user_id = ? AND item_key = ?`,
          [userId, itemKey]
        );
      } catch { /* ignore */ }
    }
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true });
    next(e);
  }
};

export const completePortalChecklistItem = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const itemKey = String(req.params.itemKey || req.body?.itemKey || '').trim().slice(0, 120);
    if (!itemKey) return res.status(400).json({ error: { message: 'itemKey is required' } });
    await pool.execute(
      `UPDATE hiring_prehire_checklist_items
       SET completed_on = COALESCE(completed_on, CURDATE())
       WHERE user_id = ? AND item_key = ?`,
      [userId, itemKey]
    );
    res.json({ ok: true, itemKey, completedOn: new Date().toISOString().slice(0, 10) });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true });
    next(e);
  }
};

export const acknowledgePortalJobDescription = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const agency = await loadPortalAgency(userId);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found.' } });
    const signature = String(req.body?.signatureData || req.body?.signerName || '').trim();
    if (!signature) return res.status(400).json({ error: { message: 'Signature is required.' } });
    const user = await User.findById(userId);
    const signerName = String(req.body?.signerName || `${user?.first_name || ''} ${user?.last_name || ''}`).trim();

    let snapshotTitle = 'Job description';
    let snapshotBody = '';
    try {
      const [hpRows] = await pool.execute(
        `SELECT job_description_id FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
        [userId]
      );
      let jdId = Number(hpRows?.[0]?.job_description_id || 0) || null;
      if (!jdId) {
        jdId = await resolveJobDescriptionIdForCandidate({
          userId,
          agencyId: agency.id,
          hiringProfile: hpRows?.[0] || null
        });
      }
      if (jdId) {
        const [jdRows] = await pool.execute(
          `SELECT id, title, description_text, description_sections_json, schedule_text
           FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
          [jdId]
        );
        const jd = jdRows?.[0];
        if (jd) {
          snapshotTitle = String(jd.title || 'Job description').trim() || 'Job description';
          const sections = sanitizeJobDescriptionSections(jd.description_sections_json);
          const parts = [
            `Job: ${snapshotTitle}`,
            jd.schedule_text ? `Schedule: ${jd.schedule_text}` : '',
            '',
            String(jd.description_text || '').trim()
          ];
          if (sections?.aboutTheRole) {
            parts.push('', 'About the role:', sections.aboutTheRole);
          }
          if (Array.isArray(sections?.responsibilities) && sections.responsibilities.length) {
            parts.push('', 'Responsibilities:');
            for (const item of sections.responsibilities) parts.push(`• ${item}`);
          }
          if (Array.isArray(sections?.qualifications) && sections.qualifications.length) {
            parts.push('', 'Qualifications:');
            for (const item of sections.qualifications) parts.push(`• ${item}`);
          }
          if (Array.isArray(sections?.benefits) && sections.benefits.length) {
            parts.push('', 'Benefits:');
            for (const item of sections.benefits) parts.push(`• ${item}`);
          }
          snapshotBody = parts.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n').trim();
        }
      }
    } catch { /* best-effort snapshot */ }

    const noteText = [
      `Signed by ${signerName}.`,
      `Signed at ${new Date().toISOString()}.`,
      'Candidate acknowledged the role expectations for this job posting.',
      '',
      '--- Job description snapshot ---',
      snapshotBody || '(No job description text was available at signing time.)'
    ].join('\n').slice(0, 600000);

    try {
      await pool.execute(
        `INSERT INTO hiring_prehire_checklist_items
          (user_id, agency_id, item_key, title, instructions, completed_on)
         VALUES (?, ?, 'job_description_ack', 'Acknowledge job description', ?, CURDATE())
         ON DUPLICATE KEY UPDATE completed_on = COALESCE(completed_on, CURDATE()), instructions = VALUES(instructions)`,
        [userId, agency.id, `Signed by ${signerName}`]
      );
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    try {
      await pool.execute(
        `INSERT INTO user_admin_docs (user_id, title, doc_type, note_text, created_by_user_id, is_legal_hold)
         VALUES (?, ?, 'job_description_acknowledgement', ?, ?, 1)`,
        [userId, `Job description acknowledgement — ${snapshotTitle}`, noteText, userId]
      );
    } catch { /* ignore */ }
    res.json({ ok: true, signed: true, signerName });
  } catch (e) { next(e); }
};

async function findPortalPrehireDocForUser(userId, docId) {
  const agency = await loadPortalAgency(userId);
  if (!agency) return { agency: null, doc: null };
  const [hpRows] = await pool.execute(
    `SELECT job_description_id FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
    [userId]
  );
  const hiringProfile = hpRows?.[0] || null;
  let jobConfig = null;
  const jobDescriptionId = await resolveJobDescriptionIdForCandidate({
    userId,
    agencyId: agency.id,
    hiringProfile
  });
  if (jobDescriptionId) {
    const [jdRows] = await pool.execute(
      `SELECT prehire_config_json FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
      [jobDescriptionId]
    );
    jobConfig = jdRows?.[0]?.prehire_config_json || null;
  }
  let agencyDefaults = [];
  try {
    const [sRows] = await pool.execute(`SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1`, [agency.id]);
    const raw = sRows[0]?.prehire_settings;
    const settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    agencyDefaults = Array.isArray(settings.default_prehire_docs) ? settings.default_prehire_docs : [];
  } catch { /* ignore */ }
  const docs = mergePrehireDocuments(jobConfig, { documents: agencyDefaults }).documents;
  const doc = docs.find((d) => String(d.id) === String(docId)) || null;
  return { agency, doc };
}

export const viewPortalPrehireDocFile = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const docId = String(req.params.docId || '').trim();
    const { doc } = await findPortalPrehireDocForUser(userId, docId);
    if (!doc?.filePath) {
      return res.status(404).json({ error: { message: 'Document file not found.' } });
    }
    const StorageService = (await import('../services/storage.service.js')).default;
    const buf = await StorageService.readObject(doc.filePath);
    const mime = doc.mimeType || 'application/pdf';
    const fileName = doc.fileName || 'document.pdf';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${String(fileName).replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.send(buf);
  } catch (e) { next(e); }
};

export const signPortalCompanyDocument = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    const docId = String(req.params.docId || req.body?.docId || '').trim();
    const signature = String(req.body?.signatureData || '').trim();
    if (!signature) return res.status(400).json({ error: { message: 'Signature is required.' } });
    const { agency, doc } = await findPortalPrehireDocForUser(userId, docId);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found.' } });
    if (!doc || doc.kind !== 'company_document') {
      return res.status(404).json({ error: { message: 'Company document not found.' } });
    }
    const user = await User.findById(userId);
    const signerName = String(req.body?.signerName || `${user?.first_name || ''} ${user?.last_name || ''}`).trim();
    const itemKey = `prehire_doc_${doc.id}`.slice(0, 120);
    try {
      await pool.execute(
        `INSERT INTO hiring_prehire_checklist_items
          (user_id, agency_id, item_key, title, instructions, completed_on)
         VALUES (?, ?, ?, ?, ?, CURDATE())
         ON DUPLICATE KEY UPDATE completed_on = COALESCE(completed_on, CURDATE())`,
        [userId, agency.id, itemKey, doc.title || 'Company document', `Signed by ${signerName}`]
      );
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    try {
      await pool.execute(
        `INSERT INTO user_admin_docs (
          user_id, title, doc_type, note_text,
          storage_path, original_name, mime_type,
          created_by_user_id, is_legal_hold
        ) VALUES (?, ?, 'prehire_company_document_ack', ?, ?, ?, ?, ?, 1)`,
        [
          userId,
          `${doc.title || 'Company document'} — signed acknowledgement`,
          [
            `Signed by ${signerName}.`,
            `Signed at ${new Date().toISOString()}.`,
            `Pre-hire document id: ${doc.id}`,
            doc.instructions ? `Instructions: ${doc.instructions}` : ''
          ].filter(Boolean).join('\n'),
          doc.filePath || null,
          doc.fileName || null,
          doc.mimeType || null,
          userId
        ]
      );
    } catch { /* ignore */ }
    res.json({ ok: true, signed: true, signerName, itemKey });
  } catch (e) { next(e); }
};

export const uploadPortalPrehireDocument = async (req, res, next) => {
  try {
    const userId = req.portalUser.id;
    if (!req.file) return res.status(400).json({ error: { message: 'file upload is required' } });
    const title = String(req.body?.title || 'Pre-hire upload').trim().slice(0, 255) || 'Pre-hire upload';
    const docId = String(req.body?.docId || '').trim().slice(0, 80);
    const StorageService = (await import('../services/storage.service.js')).default;
    const UserAdminDoc = (await import('../models/UserAdminDoc.model.js')).default;

    const originalName = req.file.originalname || 'document';
    const mimeType = req.file.mimetype || 'application/octet-stream';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const filename = `prehire-upload-${userId}-${uniqueSuffix}${safeExt}`;
    const storageResult = await StorageService.saveAdminDoc(req.file.buffer, filename, mimeType);

    const created = await UserAdminDoc.create({
      userId,
      title,
      docType: 'prehire_upload',
      noteText: docId ? `Pre-hire document ${docId}` : 'Candidate portal upload',
      storagePath: storageResult.relativePath,
      originalName,
      mimeType,
      createdByUserId: userId
    });

    if (docId) {
      try {
        await pool.execute(
          `UPDATE hiring_prehire_checklist_items
           SET completed_on = COALESCE(completed_on, CURDATE())
           WHERE user_id = ? AND item_key = ?`,
          [userId, `doc:${docId}`]
        );
      } catch { /* ignore */ }
    }

    res.status(201).json({ ok: true, id: created?.id || null, title });
  } catch (e) {
    next(e);
  }
};

async function resolveJobDescriptionIdForCandidate({ userId, agencyId, hiringProfile }) {
  let jobDescriptionId = Number(hiringProfile?.job_description_id || 0) || null;
  if (jobDescriptionId) return jobDescriptionId;

  // Fall back to the job application intake link that created this candidate.
  try {
    const [rows] = await pool.execute(
      `SELECT il.job_description_id
         FROM intake_submissions s
         INNER JOIN intake_links il ON il.id = s.intake_link_id
        WHERE s.guardian_user_id = ?
          AND il.form_type = 'job_application'
          AND il.job_description_id IS NOT NULL
        ORDER BY s.id DESC
        LIMIT 1`,
      [userId]
    );
    jobDescriptionId = Number(rows?.[0]?.job_description_id || 0) || null;
  } catch {
    jobDescriptionId = null;
  }

  if (!jobDescriptionId) return null;

  // Backfill so later portal loads and hire docs stay attached.
  try {
    let appliedRole = null;
    try {
      const [titleRows] = await pool.execute(
        `SELECT title FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
        [jobDescriptionId]
      );
      appliedRole = titleRows?.[0]?.title || null;
    } catch { /* ignore */ }
    await pool.execute(
      `UPDATE hiring_profiles
          SET job_description_id = ?,
              applied_role = COALESCE(NULLIF(applied_role, ''), ?)
        WHERE candidate_user_id = ?
          AND (job_description_id IS NULL OR job_description_id = 0)`,
      [jobDescriptionId, appliedRole, userId]
    );
  } catch {
    try {
      await pool.execute(
        `UPDATE hiring_profiles SET job_description_id = ? WHERE candidate_user_id = ? AND job_description_id IS NULL`,
        [jobDescriptionId, userId]
      );
    } catch { /* ignore */ }
  }
  return jobDescriptionId;
}

async function loadPortalPrehireExtras({ userId, agencyId, hiringProfile }) {
  const extras = {
    jobDescription: null,
    prehireDocs: [],
    checklistItems: [],
    jdAcknowledged: false
  };
  try {
    let jobConfig = null;
    const jobDescriptionId = await resolveJobDescriptionIdForCandidate({ userId, agencyId, hiringProfile });
    if (jobDescriptionId) {
      const [jdRows] = await pool.execute(
        `SELECT id, title, description_text, description_sections_json, schedule_text, prehire_config_json, agency_id
         FROM hiring_job_descriptions WHERE id = ? LIMIT 1`,
        [jobDescriptionId]
      );
      const jd = jdRows[0];
      if (jd && (!agencyId || Number(jd.agency_id) === Number(agencyId))) {
        extras.jobDescription = {
          id: jd.id,
          title: jd.title,
          descriptionText: jd.description_text || '',
          descriptionSections: sanitizeJobDescriptionSections(jd.description_sections_json),
          scheduleText: jd.schedule_text || null
        };
        jobConfig = jd.prehire_config_json;
      }
    }
    let agencyDefaults = [];
    if (agencyId) {
      const [sRows] = await pool.execute(`SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
      const raw = sRows[0]?.prehire_settings;
      const settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      agencyDefaults = Array.isArray(settings.default_prehire_docs) ? settings.default_prehire_docs : [];
    }
    extras.prehireDocs = mergePrehireDocuments(jobConfig, { documents: agencyDefaults }).documents;
  } catch { /* ignore */ }
  try {
    const [rows] = await pool.execute(
      `SELECT item_key, title, instructions, scheduled_on, completed_on
       FROM hiring_prehire_checklist_items
       WHERE user_id = ?
       ORDER BY id ASC`,
      [userId]
    );
    extras.checklistItems = (rows || []).map((r) => ({
      itemKey: r.item_key,
      title: r.title,
      instructions: r.instructions || '',
      scheduledOn: r.scheduled_on || null,
      completedOn: r.completed_on || null
    }));
    extras.jdAcknowledged = extras.checklistItems.some(
      (i) => i.itemKey === 'job_description_ack' && i.completedOn
    );
    const signedDocKeys = new Set(
      extras.checklistItems
        .filter((i) => i.completedOn && String(i.itemKey || '').startsWith('prehire_doc_'))
        .map((i) => String(i.itemKey).replace(/^prehire_doc_/, ''))
    );
    extras.prehireDocs = (extras.prehireDocs || []).map((d) => ({
      ...d,
      signed: signedDocKeys.has(String(d.id))
    }));
  } catch { /* table may not exist */ }
  return extras;
}

export const getPortalHandbook = async (req, res, next) => {
  try {
    const agency = await loadPortalAgency(req.portalUser.id);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found.' } });
    const { getPublishedHandbook, recordHandbookView } = await import('../services/workplaceHandbook.service.js');
    const handbook = await getPublishedHandbook(agency.id);
    if (!handbook?.version) {
      return res.json({ available: false, handbook: null });
    }
    try {
      await recordHandbookView({
        agencyId: agency.id,
        userId: req.portalUser.id,
        versionId: handbook.version?.id || null
      });
    } catch { /* ignore */ }
    res.json({
      available: true,
      handbook: {
        title: handbook.document?.title || 'Workplace Handbook',
        sections: (handbook.sections || []).map((s) => ({
          id: s.id,
          title: s.title,
          bodyHtml: s.body_html || s.content_html || s.body || ''
        }))
      }
    });
  } catch (e) { next(e); }
};
