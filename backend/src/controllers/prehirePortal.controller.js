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
    let supportTeam = { label: 'People Operations', members: [] };
    try {
      const [agRows] = await pool.execute(
        `SELECT a.id, a.name, a.logo_url, a.logo_path, a.color_palette, a.theme_settings, a.phone_number, a.portal_url
         FROM agencies a
         JOIN user_agencies ua ON ua.agency_id = a.id
         WHERE ua.user_id = ?
         LIMIT 1`,
        [userId]
      );
      const raw = agRows[0] || null;
      if (raw) {
        agency = buildAgencyBranding(req, raw);
        supportTeam = await loadSupportTeam(req, raw.id);
      }
    } catch { /* ignore */ }

    // Hiring profile (role, stage)
    let hiringProfile = null;
    try {
      const [hRows] = await pool.execute(
        `SELECT applied_role, stage FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1`,
        [userId]
      );
      hiringProfile = hRows[0] || null;
    } catch { /* ignore */ }

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

    res.json({
      candidate: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.personal_email || user.email,
        status: user.status,
        appliedRole: hiringProfile?.applied_role || null
      },
      agency,
      supportTeam,
      tasks,
      progress: {
        total: totalTasks,
        completed: completedTasks,
        requiredTotal: requiredTasks.length,
        requiredCompleted: completedRequired,
        allDone
      }
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
    if (task.task_type !== 'intake_form') {
      return res.status(400).json({ error: { message: 'Task is not an intake form task.' } });
    }
    if (task.status === 'completed') {
      return res.json({ ok: true, already: true });
    }

    await pool.execute(
      `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [taskId]
    );

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

    res.status(201).json({
      id: note.id,
      message: note.message,
      createdAt: note.created_at,
      isCandidate: true,
      authorName: null
    });
  } catch (e) { next(e); }
};
