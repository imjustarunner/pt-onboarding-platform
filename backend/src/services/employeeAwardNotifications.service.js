import pool from '../config/database.js';
import EmployeeServiceMilestone from '../models/EmployeeServiceMilestone.model.js';

// One transaction both creates the administrator inbox entries and marks the
// milestones notified. A named lock prevents overlapping syncs across replicas.
export async function notifyEligibleAwards(agencyId, { db = pool } = {}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const today = await EmployeeServiceMilestone.today(agencyId, connection);
    const [rows] = await connection.execute(`SELECT m.id,m.milestone_years,u.first_name,u.last_name,d.gift_name
      FROM employee_service_milestones m JOIN users u ON u.id=m.user_id
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=m.agency_id
      LEFT JOIN employee_service_award_definitions d ON d.agency_id=m.agency_id AND d.milestone_years=m.milestone_years
      WHERE m.agency_id=? AND m.milestone_date<=? AND m.status NOT IN ('gift_sent','acknowledged')
        AND m.eligibility_notified_at IS NULL AND COALESCE(u.is_archived,0)=0
        AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE','COMPLETED') AND COALESCE(ua.is_active,1)=1
      ORDER BY m.id FOR UPDATE`, [agencyId,today]);
    if (!rows.length) { await connection.commit(); return 0; }
    const [admins] = await connection.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.role IN ('admin','super_admin')
        AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE','COMPLETED')`, [agencyId]);
    if (!admins.length) { await connection.commit(); return 0; }
    const names = rows.map(r => `${r.first_name} ${r.last_name}: ${r.milestone_years}-year ${r.gift_name || ({1:'Cup',2:'Dinner',3:'Pullover'}[r.milestone_years]) || 'award'}`);
    const message = `${rows.length} anniversary award${rows.length === 1 ? ' is' : 's are'} eligible. ${names.slice(0,20).join('; ')}${names.length > 20 ? '; see Year Awards for the full list.' : '.'}`;
    for (const admin of admins) {
      await connection.execute(`INSERT INTO notifications
        (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
        VALUES ('employee_award_eligible','info','Year awards are eligible',?,?,?,'employee_service_milestone',?,'year_awards')`,
      [message,admin.id,agencyId,rows[0].id]);
    }
    await connection.execute(`UPDATE employee_service_milestones SET eligibility_notified_at=NOW()
      WHERE agency_id=? AND id IN (${rows.map(() => '?').join(',')})`, [agencyId,...rows.map(r=>r.id)]);
    await connection.commit();
    return rows.length;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function runEmployeeAwardTick() {
  const lock = await pool.getConnection();
  let acquired = false;
  try {
    const [[result]] = await lock.execute("SELECT GET_LOCK('employee-year-awards',0) acquired");
    acquired = !!Number(result.acquired);
    if (!acquired) return;
    const [agencies] = await pool.execute("SELECT id FROM agencies WHERE organization_type='agency' AND is_active=1");
    for (const agency of agencies) {
      try {
        await EmployeeServiceMilestone.syncFromStartDates(agency.id);
        await notifyEligibleAwards(agency.id);
      } catch (error) {
        console.warn('[year-awards]', agency.id, error.code || error.message);
      }
    }
  } finally {
    if (acquired) await lock.execute("SELECT RELEASE_LOCK('employee-year-awards')");
    lock.release();
  }
}
