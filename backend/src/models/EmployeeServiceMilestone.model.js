import pool from '../config/database.js';
import { ACTIVE_EMPLOYEE_SQL, EMPLOYEE_ROSTER_SQL } from '../utils/staffEligibility.js';
import { AWARD_YEARS, DEFAULT_GIFTS, COMPLETED_AWARD_STATUSES, anniversary, awardStatus, agencyToday, dateOnly, awardError, dinnerInput, serviceDates } from '../utils/employeeAwards.js';

const ACTIVE = ACTIVE_EMPLOYEE_SQL;
const STAFF = EMPLOYEE_ROSTER_SQL;

const DATE_FIELDS = `u.provider_start_date,
  (SELECT v.value FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id
    WHERE v.user_id=u.id AND f.field_key='start_date' AND (f.agency_id IS NULL OR f.agency_id=ua.agency_id) ORDER BY (f.agency_id IS NULL) DESC,v.updated_at DESC LIMIT 1) lifecycle_start_date,
  (SELECT v.value FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id
    WHERE v.user_id=u.id AND f.field_key='first_client_date' AND (f.agency_id IS NULL OR f.agency_id=ua.agency_id) ORDER BY (f.agency_id IS NULL) DESC,v.updated_at DESC LIMIT 1) first_client_date`;

async function transaction(work) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
  catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}

class EmployeeServiceMilestone {
  static get milestoneYears() { return AWARD_YEARS; }
  static async today(agencyId, db = pool) {
    const [rows] = await db.execute('SELECT timezone FROM agencies WHERE id = ?', [agencyId]);
    return agencyToday(rows[0]?.timezone);
  }
  static async definitions(agencyId) {
    const [rows] = await pool.execute('SELECT * FROM employee_service_award_definitions WHERE agency_id = ?', [agencyId]);
    return AWARD_YEARS.map(years => rows.find(row => Number(row.milestone_years) === years) || {
      agency_id: agencyId, milestone_years: years, gift_name: DEFAULT_GIFTS[years] || 'Gift to confirm', details: ''
    });
  }
  static async saveDefinition(agencyId, years, { giftName, details } = {}) {
    if (!AWARD_YEARS.includes(Number(years))) throw awardError('Invalid milestone year.');
    const name = String(giftName || '').trim();
    if (!name || name.length > 120 || String(details || '').length > 10000) throw awardError('Enter a gift name (up to 120 characters) and details (up to 10,000).');
    await pool.execute(`INSERT INTO employee_service_award_definitions (agency_id,milestone_years,gift_name,details)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE gift_name=VALUES(gift_name),details=VALUES(details)`, [agencyId, years, name, details || null]);
    return this.definitions(agencyId);
  }
  static async listByAgency(agencyId, { status = null } = {}) {
    const [rows] = await pool.execute(`SELECT m.*, u.first_name,u.last_name,u.email,u.work_email,u.personal_email,
      ${DATE_FIELDS},u.hired_at, u.status employee_status, u.is_archived,
      a.first_name assigned_first_name,a.last_name assigned_last_name,
      (SELECT note FROM employee_award_notes n WHERE n.milestone_id=m.id ORDER BY n.id DESC LIMIT 1) latest_note,
      EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=m.agency_id AND ${ACTIVE}) AS active_employee
      FROM employee_service_milestones m JOIN users u ON u.id=m.user_id
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=m.agency_id
      LEFT JOIN users a ON a.id=m.assigned_to_user_id
      WHERE m.agency_id=? AND ${STAFF} ORDER BY m.milestone_date,u.last_name,u.first_name`, [agencyId]);
    const today = await this.today(agencyId);
    return rows.map(row => ({ ...row, ...serviceDates(row), status: awardStatus(row, today) })).filter(row => !status || row.status === status);
  }
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM employee_service_milestones WHERE id=?', [id]);
    return rows[0] || null;
  }
  static async notes(id) {
    const [rows] = await pool.execute(`SELECT n.*,u.first_name,u.last_name FROM employee_award_notes n
      LEFT JOIN users u ON u.id=n.actor_user_id WHERE milestone_id=? ORDER BY n.id DESC`, [id]);
    return rows;
  }
  static async addNote(id, note, actorId) {
    const text = String(note || '').trim();
    if (!text || text.length > 10000) throw awardError('Enter a note of 1–10,000 characters.');
    await pool.execute('INSERT INTO employee_award_notes (milestone_id,actor_user_id,note) VALUES (?,?,?)', [id, actorId, text]);
    return this.notes(id);
  }
  static async update(id, body = {}, actorId = null) {
    await transaction(async db => {
      const [[row]] = await db.execute('SELECT * FROM employee_service_milestones WHERE id=? FOR UPDATE', [id]);
      if (!row) throw awardError('Award not found.', 404);
      if (body.status != null && !['upcoming','owed',...COMPLETED_AWARD_STATUSES].includes(body.status)) throw awardError('Invalid award status.');
      if (body.fulfilledOn && !dateOnly(body.fulfilledOn)) throw awardError('Invalid fulfillment date.');
      if (String(body.giftNotes || '').length > 10000) throw awardError('Gift notes are too long.');
      let nextStatus = body.status ?? row.status;
      nextStatus = awardStatus({ ...row, status: nextStatus }, await this.today(row.agency_id, db));
      // Attendance is a separate event record; clearing a gift must not erase attended dinners.
      if (!COMPLETED_AWARD_STATUSES.includes(nextStatus)) {
        const [[attended]] = await db.execute("SELECT COUNT(*) n FROM employee_award_dinner_attendees WHERE milestone_id=? AND attendance='attended'", [id]);
        if (attended.n) throw awardError('Correct the dinner attendance before reopening this award.');
      }
      const fulfilled = COMPLETED_AWARD_STATUSES.includes(nextStatus) ? (body.fulfilledOn !== undefined ? body.fulfilledOn || null : row.fulfilled_on) : null;
      const notes = body.giftNotes !== undefined ? body.giftNotes || null : row.gift_notes;
      await db.execute('UPDATE employee_service_milestones SET status=?,gift_notes=?,fulfilled_on=? WHERE id=?', [nextStatus, notes, fulfilled, id]);
      if (nextStatus !== row.status || notes !== row.gift_notes || fulfilled !== row.fulfilled_on) {
        await db.execute('INSERT INTO employee_award_notes (milestone_id,actor_user_id,note) VALUES (?,?,?)', [id, actorId,
          `Award updated: ${nextStatus}${fulfilled ? `; fulfilled ${dateOnly(fulfilled)}` : ''}${notes ? `; ${notes}` : ''}`]);
      }
    });
    return this.findById(id);
  }
  static async syncFromStartDates(agencyId, db = pool) {
    const [users] = await db.execute(`SELECT u.id,${DATE_FIELDS}
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      WHERE ${ACTIVE} AND ${STAFF}`, [agencyId]);
    const today = await this.today(agencyId, db);
    const [existing] = await db.execute('SELECT user_id,milestone_years,milestone_date,status FROM employee_service_milestones WHERE agency_id=?', [agencyId]);
    const known = new Map(existing.map(row => [`${row.user_id}:${row.milestone_years}`, row]));
    let created = 0, updated = 0;
    const missing = [], changes = [];
    for (const user of users) {
      const start = serviceDates(user).award_start_date;
      if (!start) { missing.push(user.id); continue; }
      for (const years of AWARD_YEARS) {
        const date = anniversary(start, years);
        const previous = known.get(`${user.id}:${years}`);
        const status = awardStatus({ status: previous?.status, milestone_date: date }, today);
        if (previous && dateOnly(previous.milestone_date) === date && previous.status === status) continue;
        changes.push([agencyId,user.id,years,date,status]);
        if (previous) updated++; else created++;
      }
    }
    // Batch changes: opening the tracker should not issue six writes per employee.
    for (let offset = 0; offset < changes.length; offset += 300) {
      const chunk = changes.slice(offset, offset + 300);
      await db.execute(`INSERT INTO employee_service_milestones (agency_id,user_id,milestone_years,milestone_date,status)
        VALUES ${chunk.map(() => '(?,?,?,?,?)').join(',')}
        ON DUPLICATE KEY UPDATE milestone_date=VALUES(milestone_date),
        status=IF(status IN ('gift_sent','acknowledged'),status,VALUES(status))`, chunk.flat());
    }
    if (missing.length) await db.execute(`UPDATE employee_service_milestones
      SET milestone_date=NULL,status=IF(status IN ('gift_sent','acknowledged'),status,'upcoming')
      WHERE agency_id=? AND user_id IN (${missing.map(() => '?').join(',')}) AND milestone_date IS NOT NULL`, [agencyId,...missing]);
    return { scanned: users.length, created, updated, missingDates: missing.length };
  }
  static async missingStartDates(agencyId) {
    const [rows] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,${DATE_FIELDS} FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      WHERE ${ACTIVE} AND ${STAFF}
      ORDER BY u.last_name,u.first_name`, [agencyId]);
    return rows.filter(row => !serviceDates(row).award_start_date);
  }
  static async dinners(agencyId) {
    const [events] = await pool.execute('SELECT * FROM employee_award_dinners WHERE agency_id=? ORDER BY scheduled_on DESC,id DESC', [agencyId]);
    const [attendees] = await pool.execute(`SELECT a.*,u.first_name,u.last_name FROM employee_award_dinner_attendees a
      JOIN employee_award_dinners d ON d.id=a.dinner_id JOIN employee_service_milestones m ON m.id=a.milestone_id AND m.agency_id=d.agency_id
      JOIN users u ON u.id=m.user_id WHERE d.agency_id=? ORDER BY u.last_name,u.first_name`, [agencyId]);
    return events.map(event => ({ ...event, attendees: attendees.filter(a => a.dinner_id === event.id) }));
  }
  static async createDinner(agencyId, body, actorId) {
    const input = dinnerInput(body);
    return transaction(async db => {
      const placeholders = input.ids.map(() => '?').join(',');
      const [rows] = await db.execute(`SELECT * FROM employee_service_milestones WHERE agency_id=? AND id IN (${placeholders}) FOR UPDATE`, [agencyId,...input.ids]);
      if (rows.length !== input.ids.length || rows.some(r => Number(r.milestone_years) !== 2 || !dateOnly(r.milestone_date) || COMPLETED_AWARD_STATUSES.includes(r.status))) throw awardError('Select unfinished two-year awards from this agency with known eligibility dates.');
      const [members] = await db.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
        WHERE ${ACTIVE} AND u.id IN (${rows.map(() => '?').join(',')})`, [agencyId,...rows.map(r=>r.user_id)]);
      if (members.length !== rows.length) throw awardError('Only active employees can be invited.');
      if (rows.some(r => dateOnly(r.milestone_date) > input.scheduledOn)) throw awardError('The dinner date must be on or after every invitee’s two-year anniversary.');
      const [[overlap]] = await db.execute(`SELECT COUNT(*) n FROM employee_award_dinner_attendees a JOIN employee_award_dinners d ON d.id=a.dinner_id
        WHERE a.milestone_id IN (${placeholders}) AND a.attendance='invited' AND d.scheduled_on>=?`, [...input.ids, await this.today(agencyId,db)]);
      if (overlap.n) throw awardError('Someone selected already has a dinner invitation. Cancel that invitation before rescheduling.');
      const [result] = await db.execute(`INSERT INTO employee_award_dinners (agency_id,title,scheduled_on,scheduled_time,location,notes,created_by_user_id)
        VALUES (?,?,?,?,?,?,?)`, [agencyId,input.title,input.scheduledOn,input.time,input.location,input.notes,actorId]);
      for (const id of input.ids) {
        await db.execute('INSERT INTO employee_award_dinner_attendees (dinner_id,milestone_id) VALUES (?,?)', [result.insertId,id]);
        await db.execute('INSERT INTO employee_award_notes (milestone_id,actor_user_id,note) VALUES (?,?,?)', [id,actorId,`Invited to ${input.title} on ${input.scheduledOn}${input.time ? ` at ${input.time}` : ''}${input.location ? `, ${input.location}` : ''}. ${input.notes || ''}`]);
      }
      return { id: result.insertId };
    });
  }
  static async attendance(agencyId, dinnerId, milestoneId, attendance, actorId) {
    if (!['invited','attended','declined','no_show','cancelled'].includes(attendance)) throw awardError('Invalid attendance.');
    await transaction(async db => {
      const [[row]] = await db.execute(`SELECT a.*,d.scheduled_on,d.title,m.status,m.fulfilled_on FROM employee_award_dinner_attendees a
        JOIN employee_award_dinners d ON d.id=a.dinner_id JOIN employee_service_milestones m ON m.id=a.milestone_id AND m.agency_id=d.agency_id
        WHERE d.agency_id=? AND a.dinner_id=? AND a.milestone_id=? FOR UPDATE`, [agencyId,dinnerId,milestoneId]);
      if (!row) throw awardError('Dinner invitation not found.',404);
      if (row.attendance === attendance) return;
      if (['attended','no_show'].includes(attendance) && dateOnly(row.scheduled_on) > await this.today(agencyId,db)) throw awardError('Record attendance on or after the dinner date.');
      await db.execute('UPDATE employee_award_dinner_attendees SET attendance=? WHERE dinner_id=? AND milestone_id=?', [attendance,dinnerId,milestoneId]);
      if (attendance === 'attended') {
        await db.execute("UPDATE employee_service_milestones SET status=IF(status='acknowledged',status,'gift_sent'),fulfilled_on=COALESCE(fulfilled_on,?) WHERE id=?", [row.scheduled_on,milestoneId]);
      } else if (row.attendance === 'attended') {
        const [[remaining]] = await db.execute("SELECT COUNT(*) n FROM employee_award_dinner_attendees WHERE milestone_id=? AND attendance='attended'", [milestoneId]);
        if (!remaining.n) await db.execute("UPDATE employee_service_milestones SET status='owed',fulfilled_on=NULL WHERE id=?", [milestoneId]);
      }
      await db.execute('INSERT INTO employee_award_notes (milestone_id,actor_user_id,note) VALUES (?,?,?)', [milestoneId,actorId,`${row.title}: ${row.attendance} → ${attendance}`]);
    });
  }
}
export default EmployeeServiceMilestone;
