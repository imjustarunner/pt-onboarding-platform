import { validationResult } from 'express-validator';
import cleanup from '../services/unlinkedNoteCleanup.service.js';
import { networkEvidence } from '../utils/securityEvidence.js';

export async function previewUnlinkedNoteCleanup(req, res, next) {
  try {
    if (req.auricwellPreview) return res.status(403).json({ error: { message: 'Cleanup is unavailable in preview mode.' } });
    res.json(await cleanup.preview(req.user));
  } catch (error) { next(error); }
}

export async function deleteUnlinkedNoteCleanup(req, res, next) {
  try {
    if (req.auricwellPreview) return res.status(403).json({ error: { message: 'Cleanup is unavailable in preview mode.' } });
    if (!validationResult(req).isEmpty() || req.body?.confirmation !== 'DELETE UNLINKED') {
      return res.status(400).json({ error: { message: 'Review the selected items and type DELETE UNLINKED to confirm.' } });
    }
    res.json(await cleanup.remove(req.user, req.body.items, {
      ipAddress: (req.evidenceContext || networkEvidence(req)).clientIp,
      userAgent: req.headers?.['user-agent']?.slice(0, 255), sessionId: req.user.sessionId
    }));
  } catch (error) { next(error); }
}
