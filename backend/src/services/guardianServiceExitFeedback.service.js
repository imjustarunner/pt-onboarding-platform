import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { authorizedAppointmentClient } from './guardianAppointments.service.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function exitFeedbackAnswers(input = {}) {
  const rating = input.rating == null || input.rating === '' ? null : Number(input.rating);
  if (rating !== null && (!['number', 'string'].includes(typeof input.rating) || !Number.isInteger(rating) || rating < 1 || rating > 5)) throw fail('Choose a rating from 1 to 5.');
  if (input.comments != null && typeof input.comments !== 'string') throw fail('Enter a short written suggestion.');
  const comments = (input.comments || '').trim();
  if (comments.length > 1000) throw fail('Keep your feedback within 1,000 characters.');
  if (input.contactRequested != null && typeof input.contactRequested !== 'boolean') throw fail('Choose whether our team may contact you.');
  const contactRequested = input.contactRequested === true;
  if (rating === null && !comments && !contactRequested) throw fail('Add a rating or suggestion, or request a follow-up. You can also skip this optional form.');
  return { rating, comments, contactRequested };
}

export function createGuardianServiceExitFeedback(overrides = {}) {
  const d = { db: pool, authorize: authorizedAppointmentClient, encrypt: encryptFamilyBilling, ...overrides };
  async function operation({ userId, clientId, operationId }) {
    const [[row]] = await d.db.execute(`SELECT * FROM guardian_service_cancellations
      WHERE id=? AND actor_user_id=? AND client_id=? AND scope='end_services'`, [operationId, userId, clientId]);
    if (!row) throw fail('This service feedback form is not available to your account.', 404);
    await d.authorize(userId, clientId, { agencyId: row.agency_id });
    if (row.status !== 'completed') throw fail('Your cancellation is still finishing. Check again shortly to leave feedback.', 409);
    return row;
  }
  async function read(input) {
    const row = await operation(input);
    const [[feedback]] = await d.db.execute('SELECT operation_id FROM guardian_service_exit_feedback WHERE operation_id=?', [row.id]);
    return { submitted: !!feedback };
  }
  async function submit(input) {
    const row = await operation(input), answers = exitFeedbackAnswers(input);
    const hash = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
    const db = await d.db.getConnection();
    try {
      await db.beginTransaction();
      const [insert] = await db.execute(`INSERT IGNORE INTO guardian_service_exit_feedback
        (operation_id,agency_id,client_id,actor_user_id,request_hash,payload_encrypted) VALUES (?,?,?,?,?,?)`,
      [row.id, row.agency_id, row.client_id, row.actor_user_id, hash, d.encrypt(answers, `guardian-exit-feedback:${row.agency_id}:${row.id}`)]);
      const [[saved]] = await db.execute('SELECT request_hash FROM guardian_service_exit_feedback WHERE operation_id=?', [row.id]);
      if (saved?.request_hash !== hash) throw Object.assign(fail('Your feedback was already received. Thank you for helping us improve.', 409),{code:'EXIT_FEEDBACK_ALREADY_RECEIVED'});
      if (insert.affectedRows === 1) await db.execute(`INSERT INTO notifications
        (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
        VALUES ('public_appointment_request_received','info','Client service feedback',?,?,?,'appointment',?,?,'guardian_portal')`,
      [`Optional feedback after ending services. Rating: ${answers.rating === null ? 'Not provided' : `${answers.rating}/5`}. ${answers.comments ? `Suggestions: ${answers.comments}\n` : ''}${answers.contactRequested ? 'The client or guardian asked our team to contact them about this feedback.' : 'No follow-up contact was requested. Do not restart service notifications.'}`,
        row.provider_user_id, row.agency_id, row.appointment_id, row.actor_user_id]);
      await db.commit();
      return { submitted: true };
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }
  return { read, submit };
}
export const guardianServiceExitFeedback = createGuardianServiceExitFeedback();
