// Owner-run demo fixture setup; never grant staff additional permissions.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';
const args = process.argv.slice(2);
const plan = { agencyId: 450, service: 'counseling', publicBooking: true, schoolId: 451, schoolCapacityPerWeekday: 4, changesPasswords: false, createsClients: false };
if (!args.includes('--apply')) console.log(JSON.stringify(plan));
else {
  const env = args[args.indexOf('--env') + 1];
  if (!args.includes('--env') || !env) throw new Error('Provide --env explicitly.');
  dotenv.config({ path: env, quiet: true });
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
    if (!isAuricwellQaAgency(agency)) throw new Error('Expected the isolated synthetic QA agency.');
    const [[provider]] = await db.execute(`SELECT u.id,u.email,u.role,u.is_demo FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1 WHERE u.id=1433 AND u.is_active=1`);
    if (!allowQaExchangeRecipient(agency, provider)) throw new Error('Expected the approved QA provider.');
    const [[school]] = await db.execute(`SELECT a.id FROM agencies a JOIN agency_schools s ON s.school_organization_id=a.id
      WHERE a.id=451 AND a.slug='auricwell-qa-demo-school' AND s.agency_id=450 AND s.is_active=1`);
    if (!school) throw new Error('Expected the isolated demo school.');
    await db.execute('UPDATE agencies SET public_availability_enabled=1 WHERE id=450');
    await db.execute(`INSERT INTO agency_public_service_types (agency_id,service_type,display_name,is_enabled,sort_order)
      VALUES (450,'counseling','Counseling — DEMO',1,0) ON DUPLICATE KEY UPDATE is_enabled=1`);
    // Repair only the unconfigured fixture rows. Preserve later bot/staff choices.
    await db.execute(`UPDATE provider_school_assignments SET slots_total=4,slots_available=4,start_time='09:00:00',end_time='13:00:00'
      WHERE provider_user_id=1433 AND school_organization_id=451 AND is_active=1
        AND slots_total=0 AND slots_available=0 AND start_time IS NULL AND end_time IS NULL`);
    await db.commit();
    console.log(JSON.stringify({ ...plan, applied: true, next: 'The provider must enable Counseling and Online scheduling under My availability.' }));
  } catch (error) { await db.rollback(); throw error; }
  finally { await db.end(); }
}
