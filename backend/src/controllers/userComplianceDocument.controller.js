import multer from 'multer';
import path from 'path';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Keep strict for MVP (plan assumes PDFs). Expand later if needed.
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed'), false);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function canManageDoc(requestingUser, docUserId) {
  if (!requestingUser) return false;
  if (requestingUser.role === 'super_admin' || requestingUser.role === 'admin' || requestingUser.role === 'support') return true;
  return requestingUser.id === docUserId;
}

export const listMyComplianceDocuments = async (req, res, next) => {
  try {
    const docs = await UserComplianceDocument.findByUser(req.user.id);
    res.json(docs);
  } catch (e) {
    next(e);
  }
};

export const getMyComplianceStatus = async (req, res, next) => {
  try {
    const expiredBlocking = await UserComplianceDocument.findExpiredBlockingByUser(req.user.id);
    res.json({
      hasExpiredBlocking: expiredBlocking.length > 0,
      expiredBlockingCount: expiredBlocking.length,
      expiredBlocking
    });
  } catch (e) {
    next(e);
  }
};

export const createComplianceDocument = async (req, res, next) => {
  try {
    const { userId, documentType, expirationDate, isBlocking, notes } = req.body;

    const targetUserId = userId ? parseInt(userId) : req.user.id;
    if (!documentType || !String(documentType).trim()) {
      return res.status(400).json({ error: { message: 'documentType is required' } });
    }
    if (!canManageDoc(req.user, targetUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!req.file) {
      return res.status(400).json({ error: { message: 'PDF file is required' } });
    }

    // Attach to user's primary agency for notification grouping (best-effort)
    let agencyId = null;
    try {
      const agencies = await User.getAgencies(targetUserId);
      agencyId = agencies?.[0]?.id || null;
    } catch {
      agencyId = null;
    }

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `credential-${targetUserId}-${uniqueSuffix}${path.extname(req.file.originalname || '.pdf')}`;
    const storageResult = await StorageService.saveComplianceDocument(req.file.buffer, filename, req.file.mimetype);

    const doc = await UserComplianceDocument.create({
      userId: targetUserId,
      agencyId,
      documentType: String(documentType).trim(),
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      isBlocking: isBlocking === true || isBlocking === 'true' || isBlocking === 1 || isBlocking === '1',
      filePath: storageResult.relativePath,
      notes: notes ?? null,
      uploadedAt: new Date(),
      createdByUserId: req.user.id
    });

    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
};

export const updateComplianceDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await UserComplianceDocument.findById(parseInt(id));
    if (!doc) return res.status(404).json({ error: { message: 'Compliance document not found' } });
    if (!canManageDoc(req.user, doc.user_id)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updateData = {};
    if (req.body.documentType !== undefined) updateData.documentType = String(req.body.documentType).trim();
    if (req.body.expirationDate !== undefined) updateData.expirationDate = req.body.expirationDate ? new Date(req.body.expirationDate) : null;
    if (req.body.isBlocking !== undefined) updateData.isBlocking = req.body.isBlocking === true || req.body.isBlocking === 'true' || req.body.isBlocking === 1 || req.body.isBlocking === '1';
    if (req.body.notes !== undefined) updateData.notes = req.body.notes ?? null;

    if (req.file) {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `credential-${doc.user_id}-${uniqueSuffix}${path.extname(req.file.originalname || '.pdf')}`;
      const storageResult = await StorageService.saveComplianceDocument(req.file.buffer, filename, req.file.mimetype);

      // Delete old file best-effort
      if (doc.file_path) {
        try {
          const oldFilename = doc.file_path.includes('/') ? doc.file_path.split('/').pop() : doc.file_path;
          await StorageService.deleteComplianceDocument(oldFilename);
        } catch {
          // ignore
        }
      }

      updateData.filePath = storageResult.relativePath;
      updateData.uploadedAt = new Date();
    }

    const updated = await UserComplianceDocument.update(parseInt(id), updateData);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteComplianceDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await UserComplianceDocument.findById(parseInt(id));
    if (!doc) return res.status(404).json({ error: { message: 'Compliance document not found' } });
    if (!canManageDoc(req.user, doc.user_id)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Delete file best-effort first
    if (doc.file_path) {
      try {
        const filename = doc.file_path.includes('/') ? doc.file_path.split('/').pop() : doc.file_path;
        await StorageService.deleteComplianceDocument(filename);
      } catch {
        // ignore
      }
    }

    await UserComplianceDocument.delete(parseInt(id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

