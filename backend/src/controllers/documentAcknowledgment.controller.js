import DocumentAcknowledgment from '../models/DocumentAcknowledgment.model.js';
import Task from '../models/Task.model.js';
import { validationResult } from 'express-validator';

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
      const filePath = path.join(__dirname, '../../uploads/templates', template.file_path);
      
      try {
        const fileBuffer = await fs.readFile(filePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${template.name}.pdf"`);
        res.send(fileBuffer);
      } catch (readError) {
        return res.status(404).json({ error: { message: 'PDF file not found on server' } });
      }
    } else {
      // For HTML templates, we'd need to generate a PDF, but for now return error
      return res.status(400).json({ error: { message: 'HTML templates are not yet supported for viewing' } });
    }
  } catch (error) {
    next(error);
  }
};

