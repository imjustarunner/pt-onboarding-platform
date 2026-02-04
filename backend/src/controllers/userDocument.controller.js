import UserDocument from '../models/UserDocument.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import DocumentVariableService from '../services/documentVariable.service.js';
import User from '../models/User.model.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a personalized user document from a template
 */
export const generateUserDocument = async (req, res, next) => {
  try {
    const { templateId, userId, taskId } = req.body;

    if (!templateId || !userId || !taskId) {
      return res.status(400).json({ 
        error: { message: 'templateId, userId, and taskId are required' } 
      });
    }

    // Check if user document already exists for this task
    const existing = await UserDocument.findByTask(taskId);
    if (existing) {
      return res.json(existing);
    }

    // Get template
    const template = await DocumentTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Get user data
    const User = (await import('../models/User.model.js')).default;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Get agency data
    let agencyData = {};
    let organizationData = {};
    if (user.agency_id) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = await Agency.findById(user.agency_id);
      if (agency) {
        agencyData = { name: agency.name };
      }
    } else if (template.agency_id) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = await Agency.findById(template.agency_id);
      if (agency) {
        agencyData = { name: agency.name };
      }
    }

    // Optional organization scoping for templates
    if (template.organization_id) {
      try {
        const Agency = (await import('../models/Agency.model.js')).default;
        const org = await Agency.findById(template.organization_id);
        if (org) {
          organizationData = {
            name: org.name,
            type: org.organization_type || null
          };
        }
      } catch {
        organizationData = {};
      }
    }

    // Get task data
    const [taskRows] = await pool.execute(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );
    const task = taskRows[0];
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const taskData = {
      assignmentDate: task.created_at,
      dueDate: task.due_date
    };

    const userData = {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      workEmail: user.work_email || null,
      personalEmail: user.personal_email || null
    };

    let personalizedContent = null;
    let personalizedFilePath = null;

    // Generate personalized content based on template type
    if (template.template_type === 'html' && template.html_content) {
      // Replace variables in HTML content
      personalizedContent = DocumentVariableService.replaceVariables(
        template.html_content,
        userData,
        agencyData,
        taskData,
        organizationData
      );
    } else if (template.template_type === 'pdf' && template.file_path) {
      // For PDFs, we'll generate a personalized copy
      // In a full implementation, you might want to use PDF form fields or text overlays
      const StorageService = (await import('../services/storage.service.js')).default;
      
      // Extract filename from path
      const templateFilename = template.file_path.includes('/') 
        ? template.file_path.split('/').pop() 
        : template.file_path.replace('templates/', '');
      
      // Read template file (works for both local and GCS)
      const templateBuffer = await StorageService.readTemplate(templateFilename);
      
      // Save personalized copy using StorageService
      const outputFilename = `user-doc-${userId}-${taskId}-${Date.now()}.pdf`;
      const storageResult = await StorageService.saveUserDocument(templateBuffer, outputFilename);
      
      personalizedFilePath = storageResult.relativePath;
    }

    // Create user document record
    const userDocument = await UserDocument.create({
      documentTemplateId: templateId,
      userId: userId,
      taskId: taskId,
      personalizedContent: personalizedContent,
      personalizedFilePath: personalizedFilePath,
      generatedAt: new Date()
    });

    res.status(201).json(userDocument);
  } catch (error) {
    console.error('Error generating user document:', error);
    next(error);
  }
};

/**
 * Get user document by ID
 */
export const getUserDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userDocument = await UserDocument.findById(id);

    if (!userDocument) {
      return res.status(404).json({ error: { message: 'User document not found' } });
    }

    // Check permissions - user can only see their own documents unless admin/supervisor/CPA
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'support' && userDocument.user_id !== req.user.id) {
      // Check if supervisor/CPA has access to this user
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, userDocument.user_id, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(userDocument);
  } catch (error) {
    next(error);
  }
};

/**
 * Preview a user document PDF (proxied to avoid CORS)
 */
export const previewUserDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userDocument = await UserDocument.findById(id);

    if (!userDocument) {
      return res.status(404).json({ error: { message: 'User document not found' } });
    }

    // Check permissions - user can only see their own documents unless admin/supervisor/CPA
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'support' && userDocument.user_id !== req.user.id) {
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);

      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, userDocument.user_id, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    if (!userDocument.personalized_file_path) {
      return res.status(404).json({ error: { message: 'User document file not found' } });
    }

    const StorageService = (await import('../services/storage.service.js')).default;
    let filePath = String(userDocument.personalized_file_path || '').trim();
    if (filePath.startsWith('/')) filePath = filePath.substring(1);
    const filename = filePath.includes('/') ? filePath.split('/').pop() : filePath.replace('user_documents/', '');

    const buffer = await StorageService.readUserDocument(filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all user documents for a user
 */
export const getUserDocuments = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'support' && parseInt(userId) !== req.user.id) {
      // Check if supervisor/CPA has access to this user
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, parseInt(userId), null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const userDocuments = await UserDocument.findByUser(userId);
    const taskIds = (userDocuments || []).map((d) => d.task_id).filter(Boolean);
    const byTaskId = new Map();
    if (taskIds.length > 0) {
      const Task = (await import('../models/Task.model.js')).default;
      const tasks = await Task.findByUser(userId, { taskType: 'document' });
      for (const t of tasks || []) {
        if (t.id && taskIds.includes(t.id)) byTaskId.set(t.id, { status: t.status, title: t.title });
      }
    }
    const withStatus = (userDocuments || []).map((d) => {
      const taskInfo = d.task_id ? byTaskId.get(d.task_id) : null;
      return {
        ...d,
        task_status: taskInfo?.status ?? null,
        task_title: taskInfo?.title ?? null
      };
    });
    res.json(withStatus);
  } catch (error) {
    next(error);
  }
};

/**
 * Regenerate user document (if template changed)
 */
export const regenerateUserDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userDocument = await UserDocument.findById(id);

    if (!userDocument) {
      return res.status(404).json({ error: { message: 'User document not found' } });
    }

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Get template
    const template = await DocumentTemplate.findById(userDocument.document_template_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Get user data
    const User = (await import('../models/User.model.js')).default;
    const user = await User.findById(userDocument.user_id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Get agency data
    let agencyData = {};
    let organizationData = {};
    if (user.agency_id) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = await Agency.findById(user.agency_id);
      if (agency) {
        agencyData = { name: agency.name };
      }
    }

    // Optional organization scoping for templates
    if (template.organization_id) {
      try {
        const Agency = (await import('../models/Agency.model.js')).default;
        const org = await Agency.findById(template.organization_id);
        if (org) {
          organizationData = {
            name: org.name,
            type: org.organization_type || null
          };
        }
      } catch {
        organizationData = {};
      }
    }

    // Get task data
    const [taskRows] = await pool.execute(
      'SELECT * FROM tasks WHERE id = ?',
      [userDocument.task_id]
    );
    const task = taskRows[0];

    const taskData = {
      assignmentDate: task.created_at,
      dueDate: task.due_date
    };

    const userData = {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      workEmail: user.work_email || null,
      personalEmail: user.personal_email || null
    };

    let personalizedContent = null;
    let personalizedFilePath = null;

    // Regenerate personalized content
    if (template.template_type === 'html' && template.html_content) {
      personalizedContent = DocumentVariableService.replaceVariables(
        template.html_content,
        userData,
        agencyData,
        taskData,
        organizationData
      );
    } else if (template.template_type === 'pdf' && template.file_path) {
      const templatePath = path.join(__dirname, '../../uploads/templates', template.file_path);
      const outputDir = path.join(__dirname, '../../uploads/user_documents');
      await fs.mkdir(outputDir, { recursive: true });
      
      const outputFilename = `user-doc-${userDocument.user_id}-${userDocument.task_id}-${Date.now()}.pdf`;
      const outputPath = path.join(outputDir, outputFilename);
      
      // Delete old file if exists
      if (userDocument.personalized_file_path) {
        try {
          const oldPath = path.join(__dirname, '../../uploads', userDocument.personalized_file_path);
          await fs.unlink(oldPath);
        } catch (err) {
          console.warn('Could not delete old personalized file:', err);
        }
      }
      
      await fs.copyFile(templatePath, outputPath);
      personalizedFilePath = `user_documents/${outputFilename}`;
    }

    // Update user document
    const updated = await UserDocument.update(id, {
      personalizedContent: personalizedContent,
      personalizedFilePath: personalizedFilePath,
      generatedAt: new Date()
    });

    res.json(updated);
  } catch (error) {
    console.error('Error regenerating user document:', error);
    next(error);
  }
};

