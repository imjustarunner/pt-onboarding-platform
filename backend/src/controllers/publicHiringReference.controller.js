import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import { logHiringReferenceEvent } from '../services/hiringReferenceActivity.service.js';
import { getPublicReferenceMetaByRawToken, submitPublicReferenceForm } from '../services/hiringReferenceRequests.service.js';

const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

export const trackReferenceEmailOpen = async (req, res, next) => {
  try {
    const token = String(req.params?.token || '').trim();
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    if (!token) {
      res.status(200).send(GIF_1x1);
      return;
    }
    try {
      const { row, firstOpen } = await HiringReferenceRequest.recordFirstEmailOpenByToken(token);
      if (firstOpen && row) {
        logHiringReferenceEvent({
          candidateUserId: row.candidate_user_id,
          agencyId: row.agency_id,
          kind: 'reference_invite_email_opened',
          hiringReferenceRequestId: row.id,
          referenceIndex: row.reference_index,
          referenceEmail: String(row.reference_email || '').trim(),
          outcome: 'detected',
          note:
            'Detected via an optional tracking pixel in the reference email. Many mail clients block images, so absence of this event does not mean the email was not read.'
        });
      }
    } catch {
      // still return pixel
    }
    res.status(200).send(GIF_1x1);
  } catch (e) {
    return next(e);
  }
};

export const getReferenceFormMeta = async (req, res, next) => {
  try {
    const token = String(req.params?.token || '').trim();
    if (!token) return res.status(400).json({ error: { message: 'token is required' } });
    const meta = await getPublicReferenceMetaByRawToken(token);
    if (meta.error === 'not_found') {
      return res.status(404).json({ error: { message: 'Reference request not found.' } });
    }
    if (meta.error === 'expired') {
      return res.status(410).json({ error: { message: 'This reference link has expired.' } });
    }
    if (meta.error === 'completed') {
      return res.status(409).json({ error: { message: 'This reference form was already submitted.' } });
    }
    if (meta.error === 'invalid') {
      return res.status(400).json({ error: { message: 'Invalid reference request.' } });
    }
    return res.json(meta);
  } catch (e) {
    return next(e);
  }
};

export const postReferenceFormSubmit = async (req, res, next) => {
  try {
    const token = String(req.params?.token || '').trim();
    if (!token) return res.status(400).json({ error: { message: 'token is required' } });
    const result = await submitPublicReferenceForm(token, req.body || {});
    return res.json(result);
  } catch (e) {
    const status = e.status || (String(e.message || '').includes('Invalid') ? 400 : null);
    if (status) {
      return res.status(status).json({ error: { message: e.message } });
    }
    return next(e);
  }
};
