import Task from '../models/Task.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

class TaskAssignmentService {
  /**
   * Assign training task (wraps module or track)
   */
  static async assignTrainingTask(assignmentData) {
    const {
      title,
      description,
      referenceId, // module_id or track_id
      assignedByUserId,
      dueDate,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      metadata
    } = assignmentData;

    return await Task.create({
      taskType: 'training',
      title,
      description,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId,
      dueDate,
      referenceId,
      metadata
    });
  }

  /**
   * Assign document task
   * If documentTemplateId is provided, it's a template - generate user document
   * If userSpecificDocumentId is provided, it's a user-specific document
   */
  static async assignDocumentTask(assignmentData) {
    const {
      title,
      description,
      documentTemplateId,
      userSpecificDocumentId,
      assignedByUserId,
      dueDate,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      metadata,
      documentActionType
    } = assignmentData;

    // Create the task first
    const task = await Task.create({
      taskType: 'document',
      documentActionType: documentActionType || 'signature',
      title,
      description,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId,
      dueDate,
      referenceId: documentTemplateId || userSpecificDocumentId,
      metadata
    });

    // If it's a template, generate personalized user document immediately
    if (documentTemplateId && assignedToUserId) {
      try {
        const UserDocument = (await import('../models/UserDocument.model.js')).default;
        const existing = await UserDocument.findByTask(task.id);
        
        if (!existing) {
          // Generate user document - import dependencies
          const DocumentTemplate = (await import('../models/DocumentTemplate.model.js')).default;
          const User = (await import('../models/User.model.js')).default;
          const DocumentVariableService = (await import('../services/documentVariable.service.js')).default;
          const fs = (await import('fs/promises')).default;
          const path = (await import('path')).default;
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);

          const template = await DocumentTemplate.findById(documentTemplateId);
          if (template) {
            const user = await User.findById(assignedToUserId);
            if (user) {
              // Get agency data
              let agencyData = {};
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

              const taskData = {
                assignmentDate: task.created_at,
                dueDate: task.due_date
              };

              const userData = {
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email
              };

              let personalizedContent = null;
              let personalizedFilePath = null;

              // Generate personalized content
              if (template.template_type === 'html' && template.html_content) {
                personalizedContent = DocumentVariableService.replaceVariables(
                  template.html_content,
                  userData,
                  agencyData,
                  taskData
                );
              } else if (template.template_type === 'pdf' && template.file_path) {
                const StorageService = (await import('./storage.service.js')).default;
                
                // Extract filename from path
                const templateFilename = template.file_path.includes('/') 
                  ? template.file_path.split('/').pop() 
                  : template.file_path.replace('templates/', '');
                
                // Read template file (works for both local and GCS)
                const templateBuffer = await StorageService.readTemplate(templateFilename);
                
                // Save personalized copy using StorageService
                const outputFilename = `user-doc-${assignedToUserId}-${task.id}-${Date.now()}.pdf`;
                const storageResult = await StorageService.saveUserDocument(templateBuffer, outputFilename);
                
                personalizedFilePath = storageResult.relativePath;
              }

              // Create user document
              await UserDocument.create({
                documentTemplateId: documentTemplateId,
                userId: assignedToUserId,
                taskId: task.id,
                personalizedContent: personalizedContent,
                personalizedFilePath: personalizedFilePath,
                generatedAt: new Date()
              });
            }
          }
        }
      } catch (error) {
        console.error('Error generating user document on assignment:', error);
        // Don't fail the task creation if document generation fails
        // The document can be generated later
      }
    }

    return task;
  }

  /**
   * Bulk assign to all users with specific role in agency
   */
  static async bulkAssignToRole(taskData, role, agencyId) {
    // Get all users with the role in the agency
    const [users] = await pool.execute(
      `SELECT DISTINCT u.id 
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE u.role = ? AND ua.agency_id = ?`,
      [role, agencyId]
    );

    const tasks = [];
    for (const user of users) {
      const task = await Task.create({
        ...taskData,
        assignedToUserId: user.id,
        assignedToRole: null,
        assignedToAgencyId: null
      });
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Bulk assign to all users in agency
   */
  static async bulkAssignToAgency(taskData, agencyId) {
    // Get all users in the agency
    const [users] = await pool.execute(
      `SELECT DISTINCT u.id 
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?`,
      [agencyId]
    );

    const tasks = [];
    for (const user of users) {
      const task = await Task.create({
        ...taskData,
        assignedToUserId: user.id,
        assignedToRole: null,
        assignedToAgencyId: null
      });
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Send reminder for overdue tasks (placeholder for future email integration)
   */
  static async sendReminder(taskId, userId) {
    // TODO: Implement email notification
    // For now, just log the reminder action
    const TaskAuditLog = (await import('../models/TaskAuditLog.model.js')).default;
    await TaskAuditLog.logAction({
      taskId,
      actionType: 'reminder_sent',
      actorUserId: userId,
      targetUserId: null,
      metadata: { reminderSentAt: new Date().toISOString() }
    });
    return { success: true, message: 'Reminder logged (email integration pending)' };
  }
}

export default TaskAssignmentService;

