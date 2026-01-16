import DocumentAcknowledgment from '../models/DocumentAcknowledgment.model.js';
import Task from '../models/Task.model.js';
import { validationResult } from 'express-validator';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const recordAcknowledgment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { taskId } = req.params;
    const userId = req.user.id;

    // Verify task exists and is a review document
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    if (task.task_type !== 'document') {
      return res.status(400).json({ error: { message: 'Task is not a document task' } });
    }

    if (task.document_action_type !== 'review') {
      return res.status(400).json({ error: { message: 'Task is not a review document' } });
    }

    // Verify user is assigned to this task
    if (task.assigned_to_user_id !== userId) {
      return res.status(403).json({ error: { message: 'You are not assigned to this task' } });
    }

    // Get IP and user agent
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;

    // Create acknowledgment
    const acknowledgment = await DocumentAcknowledgment.create({
      taskId: parseInt(taskId),
      userId,
      ipAddress,
      userAgent
    });

    // Mark task as completed
    await Task.markComplete(taskId, userId);

    res.status(201).json({
      acknowledgment,
      message: 'Document acknowledged successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const getAcknowledgment = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    
    // Get the task to find who it's assigned to
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    
    // Determine which user's acknowledgment to retrieve
    let targetUserId = req.user.id;
    
    // If admin/super_admin/support, they can view the acknowledgment for the user assigned to the task
    if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
      if (task.assigned_to_user_id) {
        targetUserId = task.assigned_to_user_id;
      }
    } else {
      // Regular users can only view their own acknowledgment
      // Verify they are assigned to this task
      if (task.assigned_to_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only view your own acknowledgments' } });
      }
    }

    const acknowledgment = await DocumentAcknowledgment.findByTaskAndUser(taskId, targetUserId);
    
    if (!acknowledgment) {
      return res.status(404).json({ error: { message: 'Acknowledgment not found' } });
    }

    res.json(acknowledgment);
  } catch (error) {
    next(error);
  }
};

// Summary endpoint that never 404s when "not yet acknowledged".
// This avoids noisy client-side 404s while keeping getAcknowledgment behavior intact.
export const getAcknowledgmentSummary = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    
    // Get the task to find who it's assigned to
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    
    // Determine which user's acknowledgment to retrieve
    let targetUserId = req.user.id;
    
    // If admin/super_admin/support, they can view the acknowledgment for the user assigned to the task
    if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
      if (task.assigned_to_user_id) {
        targetUserId = task.assigned_to_user_id;
      }
    } else {
      // Regular users can only view their own acknowledgment
      if (task.assigned_to_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only view your own acknowledgments' } });
      }
    }

    const acknowledgment = await DocumentAcknowledgment.findByTaskAndUser(taskId, targetUserId);
    if (!acknowledgment) {
      return res.json({ acknowledged: false, acknowledgment: null });
    }

    return res.json({ acknowledged: true, acknowledgment });
  } catch (error) {
    next(error);
  }
};

export const getAcknowledgmentStatus = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const acknowledgments = await DocumentAcknowledgment.findByTask(taskId);
    res.json(acknowledgments);
  } catch (error) {
    next(error);
  }
};

export const viewAcknowledgedDocument = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const fs = (await import('fs/promises')).default;
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Get the task to find the document template
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    
    if (task.task_type !== 'document' || task.document_action_type !== 'review') {
      return res.status(400).json({ error: { message: 'Task is not a review document task' } });
    }
    
    // Get the document template
    const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
    const template = await DocumentTemplate.findById(task.reference_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Document template not found' } });
    }
    
    // Check access permissions
    // Admins/super_admins/support can view any document
    // Regular users can only view documents for tasks assigned to them
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      if (task.assigned_to_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    // If template is PDF, serve the PDF file
    if (template.template_type === 'pdf' && template.file_path) {
      // Normalize template.file_path to a local disk filename under backend/uploads/templates.
      // We store templates on disk as: backend/uploads/templates/<filename>.pdf
      let rel = String(template.file_path || '');
      if (rel.startsWith('/')) rel = rel.replace(/^\/+/, '');
      if (rel.startsWith('uploads/templates/')) rel = rel.substring('uploads/templates/'.length);
      if (rel.startsWith('templates/')) rel = rel.substring('templates/'.length);
      if (rel.startsWith('uploads/')) rel = rel.substring('uploads/'.length);
      const filePath = path.join(__dirname, '../../uploads/templates', rel);
      const filename = rel.includes('/') ? rel.split('/').pop() : rel;
      
      try {
        const fileBuffer = await fs.readFile(filePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${template.name}.pdf"`);
        res.send(fileBuffer);
      } catch (readError) {
        // Fallback: try reading from GCS via StorageService (common in dev/prod when files are not on disk)
        try {
          const StorageService = (await import('../services/storage.service.js')).default;
          const buffer = await StorageService.readTemplate(filename);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="${template.name}.pdf"`);
          res.send(buffer);
          return;
        } catch (gcsErr) {
          return res.status(404).json({ error: { message: 'PDF file not found on server' } });
        }
      }
    } else {
      // For HTML templates, we'd need to generate a PDF, but for now return error
      return res.status(400).json({ error: { message: 'HTML templates are not yet supported for viewing' } });
    }
  } catch (error) {
    next(error);
  }
};

export const downloadAcknowledgedDocument = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const fs = (await import('fs/promises')).default;
    const path = (await import('path')).default;
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }
    if (task.task_type !== 'document' || task.document_action_type !== 'review') {
      return res.status(400).json({ error: { message: 'Task is not a review document task' } });
    }

    // Permission: same as view endpoint
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      if (task.assigned_to_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // Get template
    const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
    const template = await DocumentTemplate.findById(task.reference_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Document template not found' } });
    }
    if (template.template_type !== 'pdf' || !template.file_path) {
      return res.status(400).json({ error: { message: 'Only PDF templates are supported for download' } });
    }

    // Get acknowledgment details for assigned user (or self)
    let targetUserId = req.user.id;
    if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
      if (task.assigned_to_user_id) targetUserId = task.assigned_to_user_id;
    } else if (task.assigned_to_user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only view your own acknowledgments' } });
    }

    const acknowledgment = await DocumentAcknowledgment.findByTaskAndUser(taskId, targetUserId);
    if (!acknowledgment) {
      return res.status(404).json({ error: { message: 'Acknowledgment not found' } });
    }

    // Load original PDF bytes (disk first, then GCS)
    let rel = String(template.file_path || '');
    if (rel.startsWith('/')) rel = rel.replace(/^\/+/, '');
    if (rel.startsWith('uploads/templates/')) rel = rel.substring('uploads/templates/'.length);
    if (rel.startsWith('templates/')) rel = rel.substring('templates/'.length);
    if (rel.startsWith('uploads/')) rel = rel.substring('uploads/'.length);
    const diskPath = path.join(__dirname, '../../uploads/templates', rel);
    const filename = rel.includes('/') ? rel.split('/').pop() : rel;

    let originalBuffer = null;
    try {
      originalBuffer = await fs.readFile(diskPath);
    } catch (e) {
      const StorageService = (await import('../services/storage.service.js')).default;
      originalBuffer = await StorageService.readTemplate(filename);
    }

    const originalPdf = await PDFDocument.load(originalBuffer);
    const outPdf = await PDFDocument.create();

    const copiedPages = await outPdf.copyPages(originalPdf, originalPdf.getPageIndices());
    copiedPages.forEach((p) => outPdf.addPage(p));

    // Branded "Review Details" page
    const pageSize = copiedPages[0] ? copiedPages[0].getSize() : { width: 612, height: 792 };
    const detailsPage = outPdf.addPage([pageSize.width, pageSize.height]);

    // Determine brand colors (best-effort): agency.color_palette.primary or fallback
    let primary = { r: 0.12, g: 0.27, b: 0.65 }; // default blue
    let accent = { r: 0.0, g: 0.0, b: 0.0 };
    let agencyName = null;
    try {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agencyId = task.assigned_to_agency_id || null;
      if (agencyId) {
        const agency = await Agency.findById(agencyId);
        agencyName = agency?.name || null;
        const palette = agency?.color_palette ? (typeof agency.color_palette === 'string' ? JSON.parse(agency.color_palette) : agency.color_palette) : null;
        const hex = palette?.primary || palette?.primaryColor || palette?.primary_color;
        if (hex && typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex)) {
          const h = hex.startsWith('#') ? hex.slice(1) : hex;
          primary = {
            r: parseInt(h.slice(0, 2), 16) / 255,
            g: parseInt(h.slice(2, 4), 16) / 255,
            b: parseInt(h.slice(4, 6), 16) / 255
          };
        }
      }
    } catch (e) {
      // ignore branding failures
    }

    const font = await outPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await outPdf.embedFont(StandardFonts.HelveticaBold);

    // Header bar
    detailsPage.drawRectangle({
      x: 0,
      y: pageSize.height - 90,
      width: pageSize.width,
      height: 90,
      color: rgb(primary.r, primary.g, primary.b)
    });
    detailsPage.drawText('Review Details', {
      x: 36,
      y: pageSize.height - 55,
      size: 24,
      font: fontBold,
      color: rgb(1, 1, 1)
    });
    if (agencyName) {
      detailsPage.drawText(agencyName, {
        x: 36,
        y: pageSize.height - 78,
        size: 12,
        font,
        color: rgb(1, 1, 1)
      });
    }

    // Body
    const left = 48;
    let y = pageSize.height - 130;
    const lineGap = 20;

    const lines = [
      ['Document', template.name || task.title || 'Document'],
      ['Task ID', String(task.id)],
      ['Reviewed At', acknowledgment.acknowledged_at ? new Date(acknowledgment.acknowledged_at).toLocaleString() : 'N/A'],
      ['IP Address', acknowledgment.ip_address || 'N/A'],
      ['User Agent', acknowledgment.user_agent || 'N/A']
    ];

    for (const [label, value] of lines) {
      detailsPage.drawText(`${label}:`, { x: left, y, size: 12, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      detailsPage.drawText(String(value), { x: left + 120, y, size: 12, font, color: rgb(0.12, 0.12, 0.12), maxWidth: pageSize.width - (left + 140) });
      y -= lineGap;
    }

    // Footer note
    detailsPage.drawText('This page is appended to the reviewed document for audit purposes.', {
      x: left,
      y: 40,
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.35)
    });

    const bytes = await outPdf.save();

    const safeName = String(template.name || 'reviewed-document').replace(/[^\w\s\-().]/g, '').trim() || 'reviewed-document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-reviewed.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (error) {
    next(error);
  }
};

