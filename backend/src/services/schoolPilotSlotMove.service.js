import pool from '../config/database.js';
import { adjustProviderSlots, clientStatusConsumesProviderSlot } from './providerSlots.service.js';
import { requireSchoolTransitionSchema } from './schoolAppointmentTransition.service.js';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const clock = (value) => String(value || '').slice(0, 5);
const validTime = /^[0-2]\d:[0-5]\d$/;
const fail = (status, message, code = 'SCHOOL_SLOT_MOVE_REVIEW') => Object.assign(new Error(message), { status, code });

export async function moveUnbookedSchoolSlot({ context, actorUserId, input, dbPool = pool }) {
  const { agencyId, schoolId, schoolName, providerId } = context;
  const { fromDay, toDay, startTime, endTime } = input;
  const slotId = Number(input.slotId);
  if (agencyId !== 2 || !actorUserId) throw fail(403, 'This school pilot is available to ITSCO scheduling staff and the assigned provider.');
  if (input.reviewed !== true || !Number.isSafeInteger(slotId) || slotId < 1 || !weekdays.includes(fromDay)
      || !weekdays.includes(toDay) || fromDay === toDay || !validTime.test(startTime) || !validTime.test(endTime)
      || startTime >= endTime || endTime > '23:59') throw fail(400, 'Confirm the original slot and the new school day and time.');

  const db = await dbPool.getConnection();
  const locks = [];
  try {
    const acquire = async key => {
      const [[lock]] = await db.execute('SELECT GET_LOCK(?,8) AS acquired', [key]);
      if (Number(lock?.acquired) !== 1) throw fail(409, 'This school schedule is being updated. Try again.');
      locks.push(key);
    };
    await acquire(`aw-agenda-import:${agencyId}:${providerId}`);
    const [[placement]] = await db.execute(`SELECT s.client_id FROM soft_schedule_slots s JOIN clients c ON c.id=s.client_id AND c.agency_id=?
      WHERE s.id=? AND s.school_organization_id=? AND s.provider_user_id=? AND s.weekday=?`,
    [agencyId, slotId, schoolId, providerId, fromDay]);
    if (!placement || Number(placement.client_id) !== Number(input.clientId)) throw fail(409, 'Reload the client’s saved school slot.');
    await acquire(`client-schedule:${placement.client_id}`);
    await db.beginTransaction();
    const [[pending]] = await db.execute('SELECT id FROM client_schedule_termination_jobs WHERE client_id=? AND completed_at IS NULL LIMIT 1',
      [placement.client_id]);
    if (pending) throw fail(409, 'Wait for client termination cleanup before changing the schedule.');
    await requireSchoolTransitionSchema({ db });
    await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE', [agencyId]);
    const [days] = await db.execute(`SELECT id,day_of_week,start_time,end_time,slots_total
      FROM provider_school_assignments WHERE school_organization_id=? AND provider_user_id=?
      AND day_of_week IN (?,?) AND is_active=1 ORDER BY id FOR UPDATE`, [schoolId, providerId, fromDay, toDay]);
    const targetDay = days.find(day => day.day_of_week === toDay);
    if (days.length !== 2 || !targetDay || (targetDay.start_time && startTime < clock(targetDay.start_time))
        || (targetDay.end_time && endTime > clock(targetDay.end_time))) {
      throw fail(409, 'Choose a time within the provider’s assigned hours at this school.');
    }
    const [[location]] = await db.execute(`SELECT id FROM agency_service_locations
      WHERE agency_id=? AND school_organization_id=? AND is_active=1 AND place_of_service='03' LIMIT 1`, [agencyId, schoolId]);
    if (!location) throw fail(409, 'Connect an active school service location first.');

    const [slots] = await db.execute(`SELECT id,weekday,slot_index,client_id,start_time,end_time
      FROM soft_schedule_slots WHERE school_organization_id=? AND provider_user_id=? AND weekday IN (?,?)
      ORDER BY slot_index,id FOR UPDATE`, [schoolId, providerId, fromDay, toDay]);
    const source = slots.find(slot => Number(slot.id) === slotId && slot.weekday === fromDay);
    const clientId = Number(source?.client_id);
    if (!clientId || clientId !== Number(input.clientId)) throw fail(409, 'The saved client or weekday changed. Reload the schedule.');
    if (slots.some(slot => slot.id !== source.id && Number(slot.client_id) === clientId)) {
      throw fail(409, 'Review the client’s multiple school slots before moving this one.');
    }
    const [[client]] = await db.execute(`SELECT c.id,c.organization_id,c.provider_id,c.service_day,cs.status_key FROM clients c
      LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
      WHERE c.id=? AND c.agency_id=? AND c.compliance_archived_at IS NULL
      AND UPPER(COALESCE(c.status,'')) NOT IN ('INACTIVE','ARCHIVED','TERMINATED')
      AND (c.organization_id=? OR EXISTS(SELECT 1 FROM client_organization_assignments a WHERE a.client_id=c.id AND a.organization_id=? AND a.is_active=1))
      FOR UPDATE`, [clientId, agencyId, schoolId, schoolId]);
    if (!client || !clientStatusConsumesProviderSlot(client.status_key)) throw fail(409, 'Confirm the client’s active school placement before moving the slot.');
    const [assignments] = await db.execute(`SELECT id,service_day,provider_user_id,is_active FROM client_provider_assignments
      WHERE client_id=? AND organization_id=? ORDER BY id FOR UPDATE`, [clientId, schoolId]);
    const previous = assignments.find(row => Number(row.provider_user_id) === providerId && row.service_day === fromDay && Number(row.is_active));
    const legacy = !assignments.length && Number(client.organization_id) === schoolId
      && Number(client.provider_id) === providerId && client.service_day === fromDay;
    if (!previous && !legacy) throw fail(409, 'The saved slot and client’s assigned school day disagree. Review the placement first.');
    if (assignments.some(row => Number(row.provider_user_id) === providerId && row.service_day === toDay && Number(row.is_active))) {
      throw fail(409, 'The client is already assigned to the target day. Review both placements before moving.');
    }

    const [[booking]] = await db.execute(`SELECT a.id FROM appointments a
      JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=?
      JOIN agency_service_locations l ON l.id=a.service_location_id AND l.agency_id=a.agency_id AND l.school_organization_id=?
      WHERE a.agency_id=? AND a.provider_user_id=? AND a.end_at>UTC_TIMESTAMP()
      AND a.status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided') LIMIT 1`,
    [clientId, schoolId, agencyId, providerId]);
    if (booking) throw fail(409, 'Future school appointments already exist. Review the appointment series before changing the standing day.');

    const destination = slots.filter(slot => slot.weekday === toDay);
    const exact = destination.filter(slot => !slot.client_id && clock(slot.start_time) === startTime && clock(slot.end_time) === endTime);
    if (exact.length > 1 || destination.some(slot => !exact.includes(slot) && slot.start_time && slot.end_time
        && clock(slot.start_time) < endTime && startTime < clock(slot.end_time))) {
      throw fail(409, 'The proposed time overlaps another saved school slot.');
    }
    const open = exact[0] || destination.find(slot => !slot.client_id && !slot.start_time && !slot.end_time);
    const capacity = { providerUserId: providerId, schoolId, dayOfWeek: toDay, delta: -1 };
    let addedCapacity = false;
    let taken = await adjustProviderSlots(db, capacity);
    if (!taken.ok) {
      if (input.addCapacity !== true) throw fail(409, `Add one slot at ${schoolName} on ${toDay} to move this client?`, 'SCHOOL_SLOT_CAPACITY_CONFIRMATION');
      await db.execute('UPDATE provider_school_assignments SET slots_total=COALESCE(slots_total,0)+1 WHERE id=?', [targetDay.id]);
      taken = await adjustProviderSlots(db, capacity);
      if (!taken.ok) throw fail(409, 'One more slot is insufficient. Review capacity for this school day.');
      addedCapacity = true;
    }
    const freed = await adjustProviderSlots(db, { ...capacity, dayOfWeek: fromDay, delta: 1, allowNegative: true });
    if (!freed.ok) throw fail(409, 'The original school day changed. Refresh the schedule.');
    await db.execute(`INSERT INTO client_provider_assignments
      (client_id,organization_id,provider_user_id,service_day,is_active,created_by_user_id,updated_by_user_id)
      VALUES (?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE is_active=1,updated_by_user_id=VALUES(updated_by_user_id)`,
    [clientId, schoolId, providerId, toDay, actorUserId, actorUserId]);
    if (previous) await db.execute('UPDATE client_provider_assignments SET is_active=0,updated_by_user_id=? WHERE id=?', [actorUserId, previous.id]);
    await db.execute(`UPDATE clients SET service_day=?,updated_by_user_id=? WHERE id=? AND agency_id=?
      AND organization_id=? AND provider_id=? AND service_day=?`, [toDay, actorUserId, clientId, agencyId, schoolId, providerId, fromDay]);

    await db.execute('UPDATE soft_schedule_slots SET client_id=NULL,updated_by_user_id=? WHERE id=?', [actorUserId, slotId]);
    let targetSlotId = open?.id;
    if (targetSlotId) {
      await db.execute('UPDATE soft_schedule_slots SET client_id=?,start_time=?,end_time=?,updated_by_user_id=? WHERE id=?',
        [clientId, startTime, endTime, actorUserId, targetSlotId]);
    } else {
      const index = Math.max(0, ...destination.map(slot => Number(slot.slot_index))) + 1;
      const [created] = await db.execute(`INSERT INTO soft_schedule_slots
        (school_organization_id,provider_user_id,weekday,slot_index,client_id,start_time,end_time,created_by_user_id,updated_by_user_id)
        VALUES (?,?,?,?,?,?,?,?,?)`, [schoolId, providerId, toDay, index, clientId, startTime, endTime, actorUserId, actorUserId]);
      targetSlotId = created.insertId;
    }
    await db.commit();
    return { slotId: Number(targetSlotId), weekday: toDay, addedCapacity };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    for (const lock of locks.reverse()) await db.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
    db.release();
  }
}
