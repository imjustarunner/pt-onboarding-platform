import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import TaskDeletionLog from '../models/TaskDeletionLog.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import TaskDependency from '../models/TaskDependency.model.js';
import User from '../models/User.model.js';
import { validationResult } from 'express-validator';
import StorageService from '../services/storage.service.js';
import DocumentVariableService from '../services/documentVariable.service.js';

export const getTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    // Verify user has access to this task (includes hiring tasks assigned to user)
    const userTasks = await Task.findByUser(userId, { includeHiring: true });
    const hasAccess = userTasks.some(t => t.id === parseInt(id)) ||
                      (req.user.role === 'admin' || req.user.role === 'super_admin');

    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
};

/**
 * Render a document task as HTML (print-friendly).
 * Intended for "letter" layout templates: composed from letterhead + template + variables, rendered on demand.
 *
 * GET /api/tasks/:id/render
 */
export const renderTaskDocumentHtml = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    if (String(task.task_type) !== 'document') {
      return res.status(400).json({ error: { message: 'Task is not a document task' } });
    }

    // Verify user has access to this task (includes hiring tasks assigned to user)
    const userTasks = await Task.findByUser(userId, { includeHiring: true });
    const hasAccess =
      userTasks.some((t) => t.id === parseInt(id, 10)) || req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
    const template = await DocumentTemplate.findById(task.reference_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Document template not found' } });
    }
    if (String(template.template_type) !== 'html') {
      return res.status(400).json({ error: { message: 'Only HTML templates can be rendered as letters' } });
    }

    const User = (await import('../models/User.model.js')).default;
    const assignedUserId = task.assigned_to_user_id || userId;
    const assignedUser = await User.findById(assignedUserId);
    if (!assignedUser) {
      return res.status(404).json({ error: { message: 'Assigned user not found' } });
    }

    // Agency + org context (best-effort)
    const Agency = (await import('../models/Agency.model.js')).default;
    let agencyData = {};
    if (assignedUser.agency_id) {
      const a = await Agency.findById(assignedUser.agency_id);
      if (a) agencyData = { name: a.name };
    } else if (template.agency_id) {
      const a = await Agency.findById(template.agency_id);
      if (a) agencyData = { name: a.name };
    }

    let organizationData = {};
    if (template.organization_id) {
      const org = await Agency.findById(template.organization_id);
      if (org) organizationData = { name: org.name, type: org.organization_type || null };
    }

    const taskData = {
      assignmentDate: task.created_at,
      dueDate: task.due_date
    };

    const userData = {
      firstName: assignedUser.first_name,
      lastName: assignedUser.last_name,
      email: assignedUser.email,
      workEmail: assignedUser.work_email || null,
      personalEmail: assignedUser.personal_email || null
    };

    const layoutType = String(template.layout_type || 'standard');
    if (layoutType !== 'letter') {
      // Standard HTML template: just replace variables and return.
      const bodyOnly = DocumentVariableService.replaceVariables(
        template.html_content || '',
        userData,
        agencyData,
        taskData,
        organizationData
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(bodyOnly);
    }

    // Load letterhead (required for letter layout)
    const letterheadId = template.letterhead_template_id;
    if (!letterheadId) {
      return res.status(400).json({ error: { message: 'This letter template has no letterhead selected' } });
    }
    const LetterheadTemplate = (await import('../models/LetterheadTemplate.model.js')).default;
    const letterhead = await LetterheadTemplate.findById(letterheadId);
    if (!letterhead || letterhead.is_active === 0 || letterhead.is_active === false) {
      return res.status(400).json({ error: { message: 'Selected letterhead is missing or inactive' } });
    }

    // Base URL for /uploads asset links
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${proto}://${host}`;

    const safe = (s) => (s == null ? '' : String(s));
    const pt = (n, fallback) => {
      const v = typeof n === 'string' ? parseFloat(n) : Number(n);
      if (Number.isNaN(v) || !Number.isFinite(v)) return fallback;
      return v;
    };

    const pageSize = String(letterhead.page_size || 'letter');
    const orientation = String(letterhead.orientation || 'portrait');
    const marginTop = pt(letterhead.margin_top, 72);
    const marginRight = pt(letterhead.margin_right, 72);
    const marginBottom = pt(letterhead.margin_bottom, 72);
    const marginLeft = pt(letterhead.margin_left, 72);
    const headerHeight = pt(letterhead.header_height, 96);
    const footerHeight = pt(letterhead.footer_height, 72);

    // Compose header/footer HTML
    let headerHtml = '';
    let footerHtml = '';

    if (String(letterhead.template_type) === 'svg' || String(letterhead.template_type) === 'png') {
      const assetPath = safe(letterhead.file_path);
      const url = assetPath ? `${baseUrl}/uploads/${assetPath}` : '';
      if (url) {
        headerHtml += `<div class="letterhead-asset"><img src="${url}" alt="Letterhead" /></div>`;
      }
    } else {
      headerHtml += safe(letterhead.header_html);
      footerHtml += safe(letterhead.footer_html);
    }

    // Append per-document header/footer slots
    headerHtml += safe(template.letter_header_html);
    footerHtml += safe(template.letter_footer_html);

    // Replace variables everywhere (including letterhead html/css)
    const replace = (content) =>
      DocumentVariableService.replaceVariables(content || '', userData, agencyData, taskData, organizationData);

    const finalHeader = replace(headerHtml);
    const finalFooter = replace(footerHtml);
    const finalBody = replace(template.html_content || '');
    const finalCss = replace(letterhead.css_content || '');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safe(template.name || 'Document')}</title>
    <style>
      :root {
        --lh-margin-top: ${marginTop}pt;
        --lh-margin-right: ${marginRight}pt;
        --lh-margin-bottom: ${marginBottom}pt;
        --lh-margin-left: ${marginLeft}pt;
        --lh-header-height: ${headerHeight}pt;
        --lh-footer-height: ${footerHeight}pt;
      }

      @page {
        size: ${pageSize} ${orientation};
        margin: 0;
      }

      html, body {
        margin: 0;
        padding: 0;
        color: #111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      /* Fixed header/footer; body padding reserves space + margins */
      header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--lh-header-height);
        padding-top: var(--lh-margin-top);
        padding-left: var(--lh-margin-left);
        padding-right: var(--lh-margin-right);
        box-sizing: border-box;
        overflow: hidden;
      }

      footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: var(--lh-footer-height);
        padding-bottom: var(--lh-margin-bottom);
        padding-left: var(--lh-margin-left);
        padding-right: var(--lh-margin-right);
        box-sizing: border-box;
        overflow: hidden;
      }

      main {
        box-sizing: border-box;
        padding-top: calc(var(--lh-margin-top) + var(--lh-header-height));
        padding-bottom: calc(var(--lh-margin-bottom) + var(--lh-footer-height));
        padding-left: var(--lh-margin-left);
        padding-right: var(--lh-margin-right);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        font-size: 12pt;
        line-height: 1.5;
        position: relative;
        z-index: 1;
      }

      /* Print safety helpers */
      p, li, blockquote, table, pre { break-inside: avoid; }
      h1, h2, h3 { break-after: avoid; }
      img { max-width: 100%; }

      header, footer {
        z-index: 2;
      }

      .page-break {
        break-before: page;
        page-break-before: always;
      }

      .document-divider {
        border: none;
        border-top: 1px solid #cfcfcf;
        margin: 12px 0;
      }

      .document-watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-30deg);
        opacity: 0.12;
        font-size: 72pt;
        width: 100%;
        text-align: center;
        pointer-events: none;
        z-index: 0;
      }

      .letterhead-asset img {
        width: 100%;
        height: auto;
        display: block;
      }

      ${finalCss}
    </style>
  </head>
  <body>
    <header>${finalHeader}</header>
    <footer>${finalFooter}</footer>
    <main>${finalBody}</main>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    next(error);
  }
};

export const getUserTasks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      taskType,
      status,
      view,
      urgency,
      departmentId,
      due,
      q,
      limit,
      offset,
      agencyId: agencyIdRaw,
      hiddenAgencyIds: hiddenAgencyIdsRaw,
      assignedToUserId,
      taskListId,
      projectId,
      tenantId,
      unassignedFromList,
      unassignedFromProject,
      onSharedList,
      outreachSchoolId
    } = req.query;

    const role = String(req.user.role || '').toLowerCase();
    const canViewAll =
      role === 'admin' ||
      role === 'super_admin' ||
      role === 'support' ||
      role === 'supervisor' ||
      !!req.user?.capabilities?.canManageHiring;

    const requestedView = String(view || '').toLowerCase();
    let agencyId = agencyIdRaw != null ? parseInt(agencyIdRaw, 10) : null;
    if (!agencyId) {
      agencyId = req.user.agency_id || req.user.primary_agency_id || null;
    }
    if (!agencyId && Array.isArray(req.user.agencies) && req.user.agencies[0]) {
      agencyId = req.user.agencies[0].id || req.user.agencies[0].agency_id || null;
    }
    const tenantFilter = tenantId != null ? parseInt(tenantId, 10) : null;
    if (canViewAll && tenantFilter) agencyId = tenantFilter;

    const hiddenAgencyIds = String(hiddenAgencyIdsRaw || '')
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0);

    const filters = {
      taskType: taskType || undefined,
      status: status || undefined,
      view: requestedView || undefined,
      urgency: urgency || undefined,
      departmentId: departmentId || undefined,
      due: due || undefined,
      q: q || undefined,
      limit: limit != null ? limit : undefined,
      offset: offset != null ? offset : undefined,
      agencyId: canViewAll && requestedView === 'all' ? agencyId : undefined,
      hiddenAgencyIds: canViewAll && requestedView === 'all' ? hiddenAgencyIds : undefined,
      assignedToUserId: canViewAll && assignedToUserId ? parseInt(assignedToUserId, 10) : undefined,
      taskListId: taskListId ? parseInt(taskListId, 10) : undefined,
      outreachSchoolId: outreachSchoolId ? parseInt(outreachSchoolId, 10) : undefined,
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      agencyIdFilter: tenantFilter || undefined,
      unassignedFromList: String(unassignedFromList || '') === '1',
      unassignedFromProject: String(unassignedFromProject || '') === '1',
      onSharedList: onSharedList === '1' ? true : onSharedList === '0' ? false : undefined
    };

    if (requestedView === 'all' && !canViewAll) {
      filters.view = 'assigned';
      delete filters.agencyId;
    }

    let tasks = await Task.findForHub(userId, filters);
    if (!taskType || taskType === 'document') {
      const { enrichDocumentTasks } = await import('../services/documentTaskEnrichment.service.js');
      tasks = await enrichDocumentTasks(tasks);
    }
    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

export const searchTasksHub = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    const role = String(req.user.role || '').toLowerCase();
    const canViewAll =
      role === 'admin' ||
      role === 'super_admin' ||
      role === 'support' ||
      role === 'supervisor' ||
      !!req.user?.capabilities?.canManageHiring;

    let agencyId = req.query.agencyId != null ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      agencyId = req.user.agency_id || req.user.primary_agency_id || null;
    }
    if (req.query.tenantId) agencyId = parseInt(req.query.tenantId, 10);

    const results = await Task.searchHub(userId, q, { agencyId, canViewAll });

    // Lightweight fuzzy score: subsequence + letter coverage
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const qn = norm(q);
    const score = (title) => {
      const t = norm(title);
      if (!t || !qn) return 0;
      if (t.includes(qn)) return 100 + (100 - Math.min(t.length, 100));
      let qi = 0;
      for (let i = 0; i < t.length && qi < qn.length; i++) {
        if (t[i] === qn[qi]) qi++;
      }
      const sub = (qi / qn.length) * 70;
      const letters = [...new Set(qn)].filter((c) => t.includes(c)).length / Math.max([...new Set(qn)].length, 1);
      return sub + letters * 30;
    };

    const ranked = results
      .map((r) => {
        const school = String(r.task?.school_tag || r.task?.metadata?.schoolName || '');
        return {
          ...r,
          relevance: Math.max(score(r.title), score(r.subtitle), score(school))
        };
      })
      .filter((r) => r.relevance >= 25)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 40);

    res.json(ranked);
  } catch (error) {
    next(error);
  }
};

export const getTaskCounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();
    const canViewAll =
      role === 'admin' ||
      role === 'super_admin' ||
      role === 'support' ||
      role === 'supervisor' ||
      !!req.user?.capabilities?.canManageHiring;

    let agencyId = req.query.agencyId != null ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) {
      agencyId = req.user.agency_id || req.user.primary_agency_id || null;
    }
    if (!agencyId && Array.isArray(req.user.agencies) && req.user.agencies[0]) {
      agencyId = req.user.agencies[0].id || req.user.agencies[0].agency_id || null;
    }

    const hiddenAgencyIds = String(req.query.hiddenAgencyIds || '')
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0);

    const tenantFilter = req.query.tenantId != null ? parseInt(req.query.tenantId, 10) : null;
    if (canViewAll && tenantFilter) agencyId = tenantFilter;

    const counts = await Task.getHubCounts(userId, {
      agencyId,
      canViewAll,
      hiddenAgencyIds,
      assignedToUserId: req.query.assignedToUserId ? parseInt(req.query.assignedToUserId, 10) : null,
      taskListId: req.query.taskListId ? parseInt(req.query.taskListId, 10) : null,
      projectId: req.query.projectId ? parseInt(req.query.projectId, 10) : null,
      agencyIdFilter: tenantFilter
    });
    res.json(counts);
  } catch (error) {
    next(error);
  }
};

export const assignTask = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const assignedByUserId = req.user.id;
    const {
      taskType,
      title,
      description,
      referenceId,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      dueDate,
      metadata,
      documentActionType
    } = req.body;

    let task;
    if (taskType === 'training') {
      task = await TaskAssignmentService.assignTrainingTask({
        title,
        description,
        referenceId,
        assignedByUserId,
        dueDate,
        assignedToUserId,
        assignedToRole,
        assignedToAgencyId,
        metadata
      });
    } else if (taskType === 'document') {
      // Validate documentActionType if provided
      if (documentActionType && !['signature', 'review'].includes(documentActionType)) {
        return res.status(400).json({ error: { message: 'documentActionType must be "signature" or "review"' } });
      }
      
      // Validate referenceId is provided for document tasks
      if (!referenceId) {
        return res.status(400).json({ error: { message: 'referenceId (document template ID) is required for document tasks' } });
      }
      
      // Validate template exists
      const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
      const template = await DocumentTemplate.findById(referenceId);
      if (!template) {
        return res.status(404).json({ error: { message: 'Document template not found' } });
      }
      if (!template.is_active) {
        return res.status(400).json({ error: { message: 'Document template is not active' } });
      }
      
      // Use the template's document_action_type (set at upload time)
      const templateActionType = template.document_action_type || 'signature';
      
      // If documentActionType is provided, validate it matches the template
      if (documentActionType && documentActionType !== templateActionType) {
        return res.status(400).json({ 
          error: { 
            message: `Document action type cannot be changed. This template is configured as "${templateActionType}" and cannot be assigned as "${documentActionType}".` 
          } 
        });
      }
      
      // Validate that either assignedToUserId, assignedToRole, or assignedToAgencyId is provided
      if (!assignedToUserId && !assignedToRole && !assignedToAgencyId) {
        return res.status(400).json({ error: { message: 'Either assignedToUserId, assignedToRole, or assignedToAgencyId must be provided' } });
      }

      // When assigning to another user, require admin/support/super_admin or supervisor access to that user
      if (assignedToUserId && parseInt(assignedToUserId) !== assignedByUserId) {
        const isAdminOrSupport = ['admin', 'super_admin', 'support'].includes(req.user.role);
        if (!isAdminOrSupport) {
          const hasAccess = await User.supervisorHasAccess(assignedByUserId, parseInt(assignedToUserId), null);
          if (!hasAccess) {
            return res.status(403).json({ error: { message: 'You can only assign documents to yourself or to your assigned supervisees.' } });
          }
        }
      }

      task = await TaskAssignmentService.assignDocumentTask({
        title,
        description,
        documentTemplateId: referenceId,
        assignedByUserId,
        dueDate,
        assignedToUserId,
        assignedToRole,
        assignedToAgencyId,
        metadata,
        documentActionType: templateActionType
      });
      
      if (!task || !task.id) {
        return res.status(500).json({ error: { message: 'Failed to create task' } });
      }
    } else {
      return res.status(400).json({ error: { message: 'Invalid task type' } });
    }

    // Log assignment
    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: assignedByUserId,
      targetUserId: assignedToUserId,
      metadata: { assignedToRole, assignedToAgencyId, dueDate }
    });

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

export const bulkAssignTasks = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const assignedByUserId = req.user.id;
    const {
      taskType,
      title,
      description,
      referenceId,
      assignedToRole,
      assignedToAgencyId,
      dueDate,
      metadata,
      documentActionType
    } = req.body;

    // Validate documentActionType if provided
    if (documentActionType && !['signature', 'review'].includes(documentActionType)) {
      return res.status(400).json({ error: { message: 'documentActionType must be "signature" or "review"' } });
    }

    let tasks = [];
    if (assignedToRole && assignedToAgencyId) {
      // Bulk assign to role in agency
      if (taskType === 'training') {
        tasks = await TaskAssignmentService.bulkAssignToRole({
          taskType: 'training',
          title,
          description,
          referenceId,
          assignedByUserId,
          dueDate,
          metadata
        }, assignedToRole, assignedToAgencyId);
      } else if (taskType === 'document') {
        // Get template to use its document_action_type
        const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
        const template = await DocumentTemplate.findById(referenceId);
        if (!template) {
          return res.status(404).json({ error: { message: 'Document template not found' } });
        }
        const templateActionType = template.document_action_type || 'signature';
        
        // If documentActionType is provided, validate it matches the template
        if (documentActionType && documentActionType !== templateActionType) {
          return res.status(400).json({ 
            error: { 
              message: `Document action type cannot be changed. This template is configured as "${templateActionType}" and cannot be assigned as "${documentActionType}".` 
            } 
          });
        }
        
        tasks = await TaskAssignmentService.bulkAssignToRole({
          taskType: 'document',
          title,
          description,
          documentTemplateId: referenceId,
          assignedByUserId,
          dueDate,
          metadata,
          documentActionType: templateActionType
        }, assignedToRole, assignedToAgencyId);
      }
    } else if (assignedToAgencyId) {
      // Bulk assign to agency
      if (taskType === 'training') {
        tasks = await TaskAssignmentService.bulkAssignToAgency({
          taskType: 'training',
          title,
          description,
          referenceId,
          assignedByUserId,
          dueDate,
          metadata
        }, assignedToAgencyId);
      } else if (taskType === 'document') {
        // Get template to use its document_action_type
        const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
        const template = await DocumentTemplate.findById(referenceId);
        if (!template) {
          return res.status(404).json({ error: { message: 'Document template not found' } });
        }
        const templateActionType = template.document_action_type || 'signature';
        
        // If documentActionType is provided, validate it matches the template
        if (documentActionType && documentActionType !== templateActionType) {
          return res.status(400).json({ 
            error: { 
              message: `Document action type cannot be changed. This template is configured as "${templateActionType}" and cannot be assigned as "${documentActionType}".` 
            } 
          });
        }
        
        tasks = await TaskAssignmentService.bulkAssignToAgency({
          taskType: 'document',
          title,
          description,
          documentTemplateId: referenceId,
          assignedByUserId,
          dueDate,
          metadata,
          documentActionType: templateActionType
        }, assignedToAgencyId);
      }
    } else {
      return res.status(400).json({ error: { message: 'Bulk assignment requires role+agency or agency' } });
    }

    // Log bulk assignment
    for (const task of tasks) {
      await TaskAuditLog.logAction({
        taskId: task.id,
        actionType: 'assigned',
        actorUserId: assignedByUserId,
        targetUserId: task.assigned_to_user_id,
        metadata: { bulk: true, assignedToRole, assignedToAgencyId, dueDate }
      });
    }

    res.status(201).json({ count: tasks.length, tasks });
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const taskId = id ? parseInt(id, 10) : null;
    if (!taskId) return res.status(400).json({ error: { message: 'Task id is required' } });

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ error: { message: 'Task not found' } });

    // Best-effort cleanup of generated files before deleting task row (DB cascade will clean records, not blobs).
    try {
      if (String(task.task_type) === 'document') {
        const UserDocument = (await import('../models/UserDocument.model.js')).default;
        const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;

        const ud = await UserDocument.findByTask(taskId);
        if (ud?.personalized_file_path) {
          const raw = String(ud.personalized_file_path || '');
          const filename = raw.includes('/') ? raw.split('/').pop() : raw.replace('user_documents/', '');
          if (filename) await StorageService.deleteUserDocument(filename);
        }

        const usd = await UserSpecificDocument.findByTask(taskId);
        if (usd?.file_path) {
          const raw = String(usd.file_path || '');
          const filename = raw.includes('/') ? raw.split('/').pop() : raw.replace('user_specific_documents/', '');
          if (filename) await StorageService.deleteUserSpecificDocument(filename);
        }
      }
    } catch (e) {
      // best-effort; don't block deletion
      console.warn('deleteTask: file cleanup best-effort failed:', e?.message || e);
    }

    let agencyId = task.assigned_to_agency_id || null;
    if (!agencyId && task.task_list_id) {
      const TaskList = (await import('../models/TaskList.model.js')).default;
      const list = await TaskList.findById(task.task_list_id);
      agencyId = list?.agency_id || null;
    }
    await TaskDeletionLog.logDeletion({
      taskId,
      taskTitle: task.title,
      actorUserId: req.user.id,
      agencyId,
      source: 'admin_delete',
      metadata: { taskType: task.task_type }
    });

    // Session Notes: soft-archive (audit retained) instead of hard delete.
    if (String(task.task_type || '') === 'session_note') {
      const { archiveSessionNoteTask } = await import(
        '../services/sessionDocumentationTask.service.js'
      );
      await archiveSessionNoteTask(taskId, { userId: req.user.id });
      return res.json({ ok: true, archived: true });
    }

    const ok = await Task.deleteById(taskId);
    if (!ok) return res.status(404).json({ error: { message: 'Task not found' } });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const completeTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    // Verify user has access to this task
    const userTasks = await Task.findByUser(userId);
    if (!userTasks.find(t => t.id === parseInt(id))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updatedTask = await Task.markComplete(id, userId);

    // Unlock any tasks that were waiting on this one
    TaskDependency.unlockDependents(id).catch((err) =>
      console.error('[TaskDependency] unlockDependents failed:', err)
    );

    // Log completion
    await TaskAuditLog.logAction({
      taskId: id,
      actionType: 'completed',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { completedAt: new Date().toISOString() }
    });

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};

export const incompleteTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const userTasks = await Task.findByUser(userId);
    if (!userTasks.find(t => t.id === parseInt(id))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updatedTask = await Task.markIncomplete(id);

    await TaskAuditLog.logAction({
      taskId: id,
      actionType: 'updated',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { action: 'incomplete' }
    });

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};

export const overrideTask = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const updatedTask = await Task.override(id, userId);

    // Log override
    await TaskAuditLog.logAction({
      taskId: id,
      actionType: 'overridden',
      actorUserId: userId,
      targetUserId: task.assigned_to_user_id,
      metadata: { overriddenAt: new Date().toISOString() }
    });

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};

export const updateDueDate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { dueDate } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    // Check if task was previously overdue
    const wasOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed' && task.status !== 'overridden';
    
    const updatedTask = await Task.updateDueDate(id, dueDate);

    // Check if task is no longer overdue after update (use updated task status)
    // Task is no longer overdue if: dueDate is null, or dueDate is in the future, or task is completed/overridden
    const isNowOverdue = dueDate && new Date(dueDate) < new Date() && updatedTask.status !== 'completed' && updatedTask.status !== 'overridden';
    
    // If task was overdue but is no longer overdue (due date removed, moved to future, or task completed), 
    // delete all overdue notifications for this task
    if (wasOverdue && !isNowOverdue) {
      const Notification = (await import('../models/Notification.model.js')).default;
      // Delete all overdue notifications for this task across all agencies
      const deletedCount = await Notification.deleteByRelatedEntity('task', id);
      console.log(`Deleted ${deletedCount} overdue notification(s) for task ${id} after due date was updated (was overdue, now not overdue)`);
    }

    // Log due date change
    await TaskAuditLog.logAction({
      taskId: id,
      actionType: 'due_date_changed',
      actorUserId: userId,
      targetUserId: task.assigned_to_user_id,
      metadata: { oldDueDate: task.due_date, newDueDate: dueDate }
    });

    res.json(updatedTask);
  } catch (error) {
    next(error);
  }
};

export const sendReminder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const result = await TaskAssignmentService.sendReminder(id, userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getAllTasks = async (req, res, next) => {
  try {
    const { taskType, status, assignedToUserId, assignedToAgencyId } = req.query;
    
    console.log('getAllTasks: Query parameters', { taskType, status, assignedToUserId, assignedToAgencyId });
    
    const filters = {};
    if (taskType) filters.taskType = taskType;
    if (status) filters.status = status;
    if (assignedToUserId) filters.assignedToUserId = assignedToUserId;
    if (assignedToAgencyId) filters.assignedToAgencyId = assignedToAgencyId;
    
    let tasks = await Task.getAll(filters);
    if (!taskType || taskType === 'document') {
      const { enrichDocumentTasks } = await import('../services/documentTaskEnrichment.service.js');
      tasks = await enrichDocumentTasks(tasks);
    }
    console.log(`getAllTasks: Returning ${tasks.length} tasks`);
    res.json(tasks);
  } catch (error) {
    console.error('getAllTasks: Error', error);
    next(error);
  }
};

