import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { canRunSchedulingMaintenance } from './schedulingWorkerGate.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import User from '../models/User.model.js';
import { bookSessionInOwnedOffice, findOwnedOfficeSessionReservation, ownedOfficeSessionBookingKey } from './ownedOfficeSession.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const appointmentReceipt = (saved, input, key, recurring) => ({
  id: saved.id, agencyId: saved.agencyId, providerUserId: saved.providerUserId, officeEventId: saved.officeEventId,
  officeLocationId: saved.officeLocationId, roomId: saved.roomId, clientId: input.clientId,
  startAt: saved.startAt, endAt: saved.endAt, sourceTimezone: saved.sourceTimezone, clinicalSessionId: saved.clinicalSessionId,
  modality: saved.modality, businessType: saved.businessType, appointmentStatus: saved.status, serviceCode: saved.serviceCode,
  recurrenceSeriesId: recurring ? `office-session:${key.slice(0, 32)}` : null
});
const describe = row => ({ id: row.id, status: row.status, phase: row.phase,
  completed: Number(row.completed_count), total: Number(row.total_count),
  error: row.error_message || null, result: parse(row.result_json) || null });

export async function readOwnedOfficeSessionJob(id, actorUserId) {
  const [[row]] = await pool.execute('SELECT * FROM owned_office_session_jobs WHERE id=? AND created_by_user_id=?', [id, actorUserId]);
  return row ? describe(row) : null;
}

export async function listOwnedOfficeSessionJobs(actorUserId) {
  const [rows] = await pool.execute(`SELECT id,status,phase,completed_count,total_count,error_message,result_json
    FROM owned_office_session_jobs WHERE created_by_user_id=?
      AND (status IN ('queued','processing') OR (status='failed' AND updated_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)))
    ORDER BY created_at DESC LIMIT 50`, [actorUserId]);
  return rows.map(describe);
}

export async function existingOwnedOfficeSessionJob(input) {
  const key = ownedOfficeSessionBookingKey(input);
  const [[row]] = await pool.execute(`SELECT id,status,phase,completed_count,total_count,error_message,result_json,input_json
    FROM owned_office_session_jobs WHERE agency_id=? AND created_by_user_id=? AND booking_key=?
    AND status IN ('queued','processing','completed','failed')`, [input.agencyId,input.actorUserId,key]);
  // A retry must retain the previously reviewed subset, including any dates
  // already saved. Current conflicts are still rechecked by the booking worker.
  if (row?.status === 'failed' && row.input_json) return queueOwnedOfficeSession(parse(row.input_json));
  return row ? { ok:true,kind:'booking_job',job:describe(row) } : null;
}

export async function queueOwnedOfficeSession(input) {
  if (!await findOwnedOfficeSessionReservation(input)) return null;
  const key = ownedOfficeSessionBookingKey(input);
  await pool.execute(`INSERT INTO owned_office_session_jobs
    (id,agency_id,provider_user_id,created_by_user_id,booking_key,total_count,input_json)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
  [randomUUID(), input.agencyId, input.providerId, input.actorUserId, key, input.occurrenceStarts?.length || input.occurrenceCount || 1, JSON.stringify(input)]);
  // An explicit retry resumes the same appointments; it never starts a second series.
  await pool.execute(`UPDATE owned_office_session_jobs SET status='queued',phase='preparing',attempts=0,
    error_message=NULL,input_json=?,available_at=UTC_TIMESTAMP() WHERE agency_id=? AND created_by_user_id=? AND booking_key=? AND status='failed'`,
  [JSON.stringify(input), input.agencyId, input.actorUserId, key]);
  const [[row]] = await pool.execute('SELECT * FROM owned_office_session_jobs WHERE agency_id=? AND created_by_user_id=? AND booking_key=?', [input.agencyId, input.actorUserId, key]);
  if (row.status === 'queued') setImmediate(async () => {
    try {
      if (await canRunSchedulingMaintenance()) await processOwnedOfficeSessionJobs();
    } catch (error) { console.warn('[owned-office-session-job] dispatch pending', error.code || 'error'); }
  });
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
      let appointments = parse(job.result_json)?.appointments || [];
      const result = await bookSessionInOwnedOffice({ ...input, office, onProgress: async ({ phase, completed, total, appointments: linked }) => {
        if (linked) appointments = linked.map(saved => appointmentReceipt(saved, input, job.booking_key, input.occurrenceCount > 1));
        const [saved] = await pool.execute(`UPDATE owned_office_session_jobs SET phase=?,completed_count=?,total_count=?,
          result_json=COALESCE(?,result_json), lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
          WHERE lease_token=? AND status='processing'`, [phase, completed, total, linked ? JSON.stringify({appointments, appointmentIds:appointments.map(row => row.id), skippedDates:input.skippedDates || []}) : null, token]);
        if (!saved.affectedRows) throw new Error('Booking worker lease changed.');
      } });
      if (!result) throw Object.assign(new Error('Your room reservation changed. Refresh the schedule before booking.'), { status: 409 });
      const saved = result.appointment;
      const appointment = saved && appointmentReceipt(saved, input, job.booking_key, input.occurrenceCount > 1);
      const receipt = { ok: true, kind: 'auto_booked', skippedDates: input.skippedDates || [], officeEventId: result.officeEventId,
        appointmentIds: result.appointmentIds, agencyId: input.agencyId, appointment, appointments };
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
