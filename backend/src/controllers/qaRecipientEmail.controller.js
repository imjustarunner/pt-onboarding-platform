import { listOwnQaEmails, readOwnQaEmail } from '../services/qaRecipientEmail.service.js';
export async function list(req, res, next) {
  try { res.set('Cache-Control', 'private, no-store').json(await listOwnQaEmails(req.user, req.query)); }
  catch (error) { next(error); }
}
export async function detail(req, res, next) {
  try { res.set('Cache-Control', 'private, no-store').json(await readOwnQaEmail(req.user, req.params.emailId)); }
  catch (error) { next(error); }
}
