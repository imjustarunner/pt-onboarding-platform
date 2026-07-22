import multer from 'multer';
import TrainingMediaLibrary from '../models/TrainingMediaLibrary.model.js';
import StorageService from '../services/storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

const VIDEO_MAX = 200 * 1024 * 1024; // 200MB for in-house training videos
const DOC_MAX = 40 * 1024 * 1024;

function kindFromMime(mime, fallback) {
  if (fallback) return fallback;
  if (String(mime).startsWith('video/')) return 'video';
  if (String(mime).startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'video';
}

export const uploadTrainingMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type. Use MP4/WebM/MOV, PDF, or common images.'), false);
  }
});

export const listMedia = async (req, res, next) => {
  try {
    const items = await TrainingMediaLibrary.findAll({
      agencyId: req.query.agencyId,
      mediaKind: req.query.mediaKind || null
    });
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'File is required' } });
    }
    const mediaKind = kindFromMime(req.file.mimetype, req.body.mediaKind);
    if (mediaKind !== 'video' && req.file.size > DOC_MAX) {
      return res.status(400).json({ error: { message: 'File too large for this media type' } });
    }

    const agencyId = req.body.agencyId != null && req.body.agencyId !== ''
      ? Number(req.body.agencyId)
      : null;
    const title = (req.body.title || req.file.originalname || 'Untitled media').trim();

    const saved = await StorageService.saveTrainingMedia({
      agencyId,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      mediaKind
    });

    const publicUrl = publicUploadsUrlFromStoredPath(saved.path);
    const item = await TrainingMediaLibrary.create({
      agencyId,
      title,
      mediaKind,
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname,
      gcsPath: saved.path,
      publicUrl,
      sizeBytes: req.file.size,
      sourceKind: 'upload',
      createdByUserId: req.user.id
    });

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const addExternalMedia = async (req, res, next) => {
  try {
    const { title, mediaKind = 'video', externalUrl, agencyId = null } = req.body || {};
    if (!title || !externalUrl) {
      return res.status(400).json({ error: { message: 'title and externalUrl are required' } });
    }
    const item = await TrainingMediaLibrary.create({
      agencyId: agencyId != null && agencyId !== '' ? Number(agencyId) : null,
      title,
      mediaKind,
      gcsPath: `external:${externalUrl}`,
      publicUrl: externalUrl,
      sourceKind: 'external_url',
      externalUrl,
      createdByUserId: req.user.id
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const deleteMedia = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await TrainingMediaLibrary.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Media not found' } });
    }
    await TrainingMediaLibrary.delete(id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
