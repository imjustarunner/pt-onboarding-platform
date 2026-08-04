/**
 * Task attachments - photos, docs for reference on shared list tasks.
 * List members can add; uploader or editors can delete.
 */
import multer from 'multer';
import Task from '../models/Task.model.js';
import TaskAttachment from '../models/TaskAttachment.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import StorageService from '../services/storage.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-excel',
      'text/plain'
    ]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type. Allowed: PDF, images, DOCX, XLSX, TXT.'), false);
  }
});

export async function requireTaskAccess(req, res, next) {
  const userId = req.user?.id;
  const taskId = parseInt(req.params.id || req.params.taskId, 10);
  if (!userId || !taskId) {
    return res.status(400).json({ error: { message: 'Invalid request' } });
  }
  const task = await Task.findById(taskId);
  if (!task) return res.status(404).json({ error: { message: 'Task not found' } });

  // Private: only owners
  if (Number(task.is_private) === 1) {
    const isOwner =
      Number(task.assigned_to_user_id) === Number(userId)
      || Number(task.assigned_by_user_id) === Number(userId);
    if (!isOwner) return res.status(403).json({ error: { message: 'Access denied' } });
  } else if (task.task_list_id) {
    const membership = await TaskListMember.findByListAndUser(task.task_list_id, userId);
    const isAssignee = Number(task.assigned_to_user_id) === Number(userId);
    const role = String(req.user?.role || '').toLowerCase();
    const isManager = ['admin', 'super_admin', 'support', 'supervisor'].includes(role);
    if (!membership && !isAssignee && !isManager) {
      return res.status(403).json({ error: { message: 'You must be a list member' } });
    }
  } else {
    const isAssignee =
      Number(task.assigned_to_user_id) === Number(userId)
      || Number(task.assigned_by_user_id) === Number(userId);
    const role = String(req.user?.role || '').toLowerCase();
    const isManager = ['admin', 'super_admin', 'support', 'supervisor'].includes(role);
    if (!isAssignee && !isManager) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
  }
  req.task = task;
  req.taskId = taskId;
  next();
}

export const uploadMiddleware = upload.single('file');

export const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: { message: 'No file uploaded' } });
    }
    const taskId = req.taskId;
    const userId = req.user.id;

    const saved = await StorageService.saveTaskAttachment({
      taskId,
      userId,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const attachment = await TaskAttachment.create({
      taskId,
      storagePath: saved.path,
      filename: saved.filename,
      contentType: req.file.mimetype,
      uploadedByUserId: userId
    });

    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
};

export const listAttachments = async (req, res, next) => {
  try {
    const taskId = req.taskId;
    const attachments = await TaskAttachment.listByTaskId(taskId);
    res.json(attachments);
  } catch (err) {
    next(err);
  }
};

export const deleteAttachment = async (req, res, next) => {
  try {
    const taskId = req.taskId;
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const userId = req.user.id;

    const attachment = await TaskAttachment.findById(attachmentId);
    if (!attachment || attachment.task_id !== taskId) {
      return res.status(404).json({ error: { message: 'Attachment not found' } });
    }

    const task = req.task;
    const canDelete =
      Number(attachment.uploaded_by_user_id) === Number(userId) ||
      (task.task_list_id && (await (async () => {
        const m = await TaskListMember.findByListAndUser(task.task_list_id, userId);
        return m && TaskListMember.canEdit(m.role);
      })()));

    if (!canDelete) {
      return res.status(403).json({ error: { message: 'You cannot delete this attachment' } });
    }

    const ok = await TaskAttachment.deleteById(attachmentId, taskId);
    if (!ok) return res.status(404).json({ error: { message: 'Attachment not found' } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
