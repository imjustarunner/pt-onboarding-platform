import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';
import { matchesIntakeSession } from '../middleware/intakeBillingSession.middleware.js';
import { assertGuardianRoiSigner } from './schoolRoiGuardianConsent.service.js';

// The guardian signed in on this request, when that account can already read the child's documents.
export async function portalGuardianForIssuedRoi(req, clientId, {
  verify = (token) => jwt.verify(token, config.jwt.secret),
  loadLink = (args) => ClientGuardian.getLink(args)
} = {}) {
  const cid = Number(clientId);
  const bearer = req?.headers?.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = bearer || req?.cookies?.authToken || null;
  if (!cid || !token) return null;
  let userId = 0;
  try {
    userId = Number(verify(token)?.id || 0);
  } catch {
    return null;
  }
  if (!userId) return null;
  const link = await loadLink({ clientId: cid, guardianUserId: userId });
  return guardianCanReadIntakeDocuments(link) ? userId : null;
}

// Associate a completed release with the EXISTING recipient authorized by staff
// when the link was issued. Never use a form-entered email or create/grant access.
export async function existingIssuedRoiGuardian(issuedLink, clientId) {
  if (!issuedLink?.id || Number(issuedLink.client_id) !== Number(clientId)) return null;
  if (Number(issuedLink.recipient_guardian_user_id) > 0) {
    const link = await ClientGuardian.getLink({ clientId, guardianUserId: Number(issuedLink.recipient_guardian_user_id) });
    return guardianCanReadIntakeDocuments(link) ? Number(issuedLink.recipient_guardian_user_id) : null;
  }
  const recipient = String(issuedLink.last_email_sent_to || '').trim().toLowerCase();
  if (!recipient) return null;
  const links = await ClientGuardian.listForClient(clientId);
  const matches = links.filter(link => String(link.email || '').trim().toLowerCase() === recipient
    && guardianCanReadIntakeDocuments(link));
  return matches.length === 1 ? Number(matches[0].guardian_user_id) || null : null;
}

export async function resolveIssuedRoiConsentSigner({ req, issuedLink, clientId, submissionGuardianId }, dependencies = {}) {
  if (!issuedLink?.id) return Number(submissionGuardianId) || null;
  const existing = dependencies.existing || existingIssuedRoiGuardian;
  const portal = dependencies.portal || portalGuardianForIssuedRoi;
  const authorize = dependencies.authorize || assertGuardianRoiSigner;
  if (Number(issuedLink.client_id) !== Number(clientId)) {
    throw Object.assign(new Error('This school release belongs to a different child.'), { status: 403 });
  }
  const recipient = Number(issuedLink.recipient_guardian_user_id) || 0;
  const signedIn = await portal(req, clientId);
  if (recipient) {
    if (signedIn !== recipient || await existing(issuedLink, clientId) !== recipient) {
      throw Object.assign(new Error('Sign in to the guardian account that received this school release. Each guardian has a separate request.'), { status: 403 });
    }
    await authorize({ clientId, guardianUserId: recipient });
    return recipient;
  }
  // A copied legacy link is not evidence of which guardian is signing. Resolve
  // identity before collecting answers, never from a name/email typed in a form.
  if (!signedIn) throw Object.assign(new Error('Sign in to your guardian account before starting this school release. If you have not set a password, use the setup link in your email or request one from your care team.'), { status: 403 });
  const emailedRecipient = await existing(issuedLink, clientId);
  if (emailedRecipient && emailedRecipient !== signedIn) throw Object.assign(new Error('Open this release using the guardian account that received it.'), { status: 403 });
  await authorize({ clientId, guardianUserId: signedIn });
  return signedIn;
}

// Issued requests share an intake template, so template ID alone cannot bind a
// signing session. The authoritative request pointer, child and existing signer
// must all agree before either consent or finalization changes any records.
export function assertIssuedRoiSessionBinding({ issuedLink, submission, guardianUserId, sessionToken }) {
  if (!issuedLink?.id) return;
  const guardianId = Number(guardianUserId) || 0;
  const recipientId = Number(issuedLink.recipient_guardian_user_id) || 0;
  if (!submission?.id
    || Number(issuedLink.latest_intake_submission_id) !== Number(submission.id)
    || Number(issuedLink.intake_link_id) !== Number(submission.intake_link_id)
    || Number(issuedLink.client_id) !== Number(submission.client_id)
    || (Number(submission.guardian_user_id) || 0) !== guardianId
    || (recipientId && guardianId !== recipientId)
    || submission.co_guardian_invite_id
    || !matchesIntakeSession(sessionToken, submission.session_token)) {
    throw Object.assign(new Error('This session does not belong to this guardian’s school release. Open the requested release from your portal again.'), { status: 403 });
  }
  const submitted = String(submission.status || '').toLowerCase() === 'submitted';
  if (!['started', 'consented', 'submitted'].includes(String(submission.status || '').toLowerCase())) {
    throw Object.assign(new Error('This school release session cannot be continued. Open the requested release from your portal again.'), { status: 409 });
  }
  if (String(issuedLink.status || '').toLowerCase() === 'completed' && !submitted) {
    throw Object.assign(new Error('This school release is already completed. Request a new update to change it.'), { status: 409 });
  }
  if (!submitted) {
    const expires = submission.draft_expires_at || submission.retention_expires_at;
    const base = submission.consent_given_at || submission.created_at;
    const expiryTime = expires ? new Date(expires).getTime() : base ? new Date(base).getTime() + 24 * 60 * 60 * 1000 : NaN;
    if (Number.isFinite(expiryTime) && expiryTime <= Date.now()) {
      throw Object.assign(new Error('This school release session has expired. Open the release from your portal again.'), { status: 410 });
    }
  }
}
