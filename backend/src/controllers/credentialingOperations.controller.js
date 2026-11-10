import * as operations from '../services/credentialingOperations.service.js';
import { requireCredentialingAccess } from '../services/credentialingAccess.service.js';

const run = fn => async (req, res, next) => { try { res.set('Cache-Control', 'no-store'); await fn(req, res); } catch (error) { next(error); } };
const scope = req => [req.user, Number(req.params.agencyId), req.params.kind, Number(req.params.id)];
export async function authorizeCredentialingUpload(req, res, next) {
  try { await requireCredentialingAccess(req.user, Number(req.params.agencyId)); next(); } catch (error) { next(error); }
}
export const listPayerDocuments = run(async (req, res) => res.json(await operations.listPayerDocuments(req.user, Number(req.params.agencyId), Number(req.params.id))));
export const uploadPayerDocument = run(async (req, res) => res.status(201).json(await operations.savePayerDocument(req.user, Number(req.params.agencyId), Number(req.params.id), req.body, req.file)));
export const downloadPayerDocument = run(async (req, res) => {
  const doc = await operations.readPayerDocument(req.user, Number(req.params.agencyId), Number(req.params.id), Number(req.params.documentId));
  res.set('Content-Type', doc.mimeType).set('X-Content-Type-Options', 'nosniff')
    .set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`).send(doc.buffer);
});
export const downloadExistingDocument = run(async (req, res) => {
  const doc = await operations.readExistingCredentialDocument(...scope(req), req.params.documentType);
  res.set('Content-Type', doc.mimeType).set('X-Content-Type-Options', 'nosniff')
    .set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`).send(doc.buffer);
});
export const listReminders = run(async (req, res) => res.json(await operations.listCredentialingReminders(...scope(req))));
export const createReminder = run(async (req, res) => res.status(201).json(await operations.createCredentialingReminder(...scope(req), req.body)));
export const finishReminder = run(async (req, res) => res.json(await operations.finishCredentialingReminder(...scope(req), Number(req.params.reminderId), req.body.status)));
export const getCaseEmail = run(async (req, res) => res.json(await operations.credentialingCaseEmail(req.user, Number(req.params.agencyId), Number(req.params.id))));
export const createCaseEmail = run(async (req, res) => res.status(201).json(await operations.credentialingCaseEmail(req.user, Number(req.params.agencyId), Number(req.params.id), true)));
export const listCaseTickets = run(async (req, res) => res.json(await operations.credentialingCaseTickets(req.user, Number(req.params.agencyId), Number(req.params.id))));
export const getCaseTicket = run(async (req, res) => res.json(await operations.readCredentialingCaseTicket(req.user, Number(req.params.agencyId), Number(req.params.id), Number(req.params.ticketId))));
export const getCaseAttachment = run(async (req, res) => {
  const doc = await operations.readCredentialingCaseAttachment(req.user, Number(req.params.agencyId), Number(req.params.id), Number(req.params.ticketId), Number(req.params.attachmentId));
  res.set('Content-Type', 'application/octet-stream').set('X-Content-Type-Options', 'nosniff')
    .set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`).send(doc.buffer);
});

export const acknowledgeNotifications = run(async (req, res) => res.json(await operations.acknowledgeCredentialingNotifications(...scope(req))));
