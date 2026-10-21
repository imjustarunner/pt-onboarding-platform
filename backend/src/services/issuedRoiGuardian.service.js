import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';

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
