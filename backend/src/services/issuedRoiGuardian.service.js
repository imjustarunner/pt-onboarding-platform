import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';

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
  const recipient = String(issuedLink.last_email_sent_to || '').trim().toLowerCase();
  if (!recipient) return null;
  const links = await ClientGuardian.listForClient(clientId);
  const matches = links.filter(link => String(link.email || '').trim().toLowerCase() === recipient
    && guardianCanReadIntakeDocuments(link));
  return matches.length === 1 ? Number(matches[0].guardian_user_id) || null : null;
}
