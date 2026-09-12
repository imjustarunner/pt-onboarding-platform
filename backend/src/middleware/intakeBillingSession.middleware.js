import crypto from 'node:crypto';
import IntakeSubmission from '../models/IntakeSubmission.model.js';

export function matchesIntakeSession(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || provided.length < 16 || expected.length < 16) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function requireIntakeBillingSession(req, res, next) {
  try {
    const id = Number(req.params.submissionId);
    const token = req.get('x-intake-session') || req.body?.sessionToken;
    const submission = Number.isSafeInteger(id) && id > 0 ? await IntakeSubmission.findById(id) : null;
    if (!submission || !matchesIntakeSession(token, submission.session_token)) return res.status(403).json({ error: { message: 'A valid intake session is required' } });
    const expiredDraft = submission.status !== 'submitted' && submission.draft_expires_at && new Date(submission.draft_expires_at) <= new Date();
    if (expiredDraft || (submission.retention_expires_at && new Date(submission.retention_expires_at) <= new Date())) return res.status(410).json({ error: { message: 'This intake session has expired' } });
    res.set('Cache-Control', 'no-store');
    next();
  } catch (e) { next(e); }
}
