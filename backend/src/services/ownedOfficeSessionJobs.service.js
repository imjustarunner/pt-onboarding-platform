import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import User from '../models/User.model.js';
import { bookSessionInOwnedOffice, findOwnedOfficeSessionReservation, ownedOfficeSessionBookingKey } from './ownedOfficeSession.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const describe = row => ({ id: row.id, status: row.status, phase: row.phase,
  completed: Number(row.completed_count), total: Number(row.total_count),
  error: row.error_message || null, result: parse(row.result_json) || null });

export async function readOwnedOfficeSessionJob(id, actorUserId) {
  const [[row]] = await pool.execute('SELECT * FROM owned_office_session_jobs WHERE id=? AND created_by_user_id=?', [id, actorUserId]);
  return row ? describe(row) : null;
}

export async function queueOwnedOfficeSession(input) {
  if (!await findOwnedOfficeSessionReservation(input)) return null;
  const key = ownedOfficeSessionBookingKey(input);
  await pool.execute(`INSERT INTO owned_office_session_jobs
    (id,agency_id,provider_user_id,created_by_user_id,booking_key,total_count,input_json)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
  [randomUUID(), input.agencyId, input.providerId, input.actorUserId, key, input.occurrenceCount || 1, JSON.stringify(input)]);
  // An explicit retry resumes the same appointments; it never starts a second series.
  await pool.execute(`UPDATE owned_office_session_jobs SET status='queued',phase='preparing',attempts=0,
    error_message=NULL,input_json=?,available_at=UTC_TIMESTAMP() WHERE agency_id=? AND created_by_user_id=? AND booking_key=? AND status='failed'`,
  [JSON.stringify(input), input.agencyId, input.actorUserId, key]);
  const [[row]] = await pool.execute('SELECT * FROM owned_office_session_jobs WHERE agency_id=? AND created_by_user_id=? AND booking_key=?', [input.agencyId, input.actorUserId, key]);
  return { ok: true, kind: 'booking_job', job: describe(row) };
}

let running = false;
export async function processOwnedOfficeSessionJobs() {
  if (running) return;
  running = true;
  try {
    const token = randomUUID();
    const [claimed] = await pool.execute(`UPDATE owned_office_session_jobs SET status='processing',attempts=attempts+1,
      lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
      WHERE (status='queued' AND available_at<=UTC_TIMESTAMP()) OR (status='processing' AND lease_until<UTC_TIMESTAMP())
      ORDER BY available_at LIMIT 1`, [token]);
    if (!claimed.affectedRows) return;
    const [[job]] = await pool.execute('SELECT * FROM owned_office_session_jobs WHERE lease_token=?', [token]);
    try {
      const input = parse(job.input_json);
      const actor = await User.findById(job.created_by_user_id);
      const agencies = actor && await User.getAgencies(actor.id);
      if (!actor || (!['super_admin','superadmin'].includes(actor.role) && !agencies.some(a => Number(a.id) === Number(job.agency_id)))) {
        throw Object.assign(new Error('Scheduling access to this agency is required.'), { status: 403 });
      }
      const office = await OfficeLocation.findById(input.office.id);
      if (!office) throw Object.assign(new Error('Office no longer available.'), { status: 409 });
      const result = await bookSessionInOwnedOffice({ ...input, office, onProgress: async ({ phase, completed, total }) => {
        const [saved] = await pool.execute(`UPDATE owned_office_session_jobs SET phase=?,completed_count=?,total_count=?,
          lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE lease_token=? AND status='processing'`, [phase, completed, total, token]);
        if (!saved.affectedRows) throw new Error('Booking worker lease changed.');
      } });
      if (!result) throw Object.assign(new Error('Your room reservation changed. Refresh the schedule before booking.'), { status: 409 });
      const receipt = { ok: true, kind: 'auto_booked', officeEventId: result.officeEventId, appointmentIds: result.appointmentIds, agencyId: input.agencyId };
      await pool.execute(`UPDATE owned_office_session_jobs SET status='completed',phase='complete',completed_count=total_count,
        result_json=?,input_json=NULL,error_message=NULL,lease_token=NULL,lease_until=NULL WHERE lease_token=?`, [JSON.stringify(receipt), token]);
    } catch (error) {
      const retry = !error.status && Number(job.attempts) < 3;
      const message = error.status && error.status < 500 ? error.message : 'Scheduling paused. Retry the same booking to continue safely.';
      await pool.execute(`UPDATE owned_office_session_jobs SET status=?,error_message=?,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MINUTE),
        lease_token=NULL,lease_until=NULL WHERE lease_token=?`, [retry ? 'queued' : 'failed', String(message).slice(0,500), token]);
      console.warn('[owned-office-session-job]', job.id, retry ? 'retry queued' : 'failed', error.code || error.status || 'error');
    }
  } finally { running = false; }
}
