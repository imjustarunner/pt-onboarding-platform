import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import { validationResult } from 'express-validator';
import StorageService from '../services/storage.service.js';

export const getTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    // Verify user has access to this task
    const userTasks = await Task.findByUser(userId);
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

export const getUserTasks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { taskType, status } = req.query;

    const tasks = await Task.findByUser(userId, { taskType, status });
    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

export const getTaskCounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const trainingCount = await Task.getTrainingTaskCount(userId);
    const documentCount = await Task.getDocumentTaskCount(userId);

    res.json({
      training: trainingCount,
      document: documentCount
    });
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
    
    const tasks = await Task.getAll(filters);
    console.log(`getAllTasks: Returning ${tasks.length} tasks`);
    res.json(tasks);
  } catch (error) {
    console.error('getAllTasks: Error', error);
    next(error);
  }
};

