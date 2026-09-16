// Explicit operator setup for an existing tenant and existing adult accounts.
// Dry run by default. Does not create credentials or enable work sharing.
import pool from '../src/config/database.js';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const agencySlug = args.includes('--agency') ? value('--agency') : '';
const name = args.includes('--name') ? value('--name') : '';
const parents = args.flatMap((arg, i) => {
  if (arg !== '--parent') return [];
  const [email, displayName] = (args[i + 1] || '').split('=');
  return [{ email: email.trim().toLowerCase(), displayName: displayName?.trim() }];
});
const apply = args.includes('--apply');
let db;
try {
  if (!agencySlug || !name || name.length > 120 || parents.length < 2 || parents.some(p => !p.email.includes('@') || !p.displayName || p.displayName.length > 80) || new Set(parents.map(p => p.email)).size !== parents.length) {
    throw new Error('Usage: NODE_ENV=test node backend/scripts/setup-family-household.mjs --agency SLUG --name NAME --parent email=label --parent email=label [--apply]');
  }
  db = await pool.getConnection();
  await db.beginTransaction();
  const [agencies] = await db.execute('SELECT id,name,is_active FROM agencies WHERE slug=? FOR UPDATE', [agencySlug]);
  if (agencies.length !== 1 || !agencies[0].is_active) throw new Error('Expected one active tenant.');
  const agency = agencies[0];
  for (const parent of parents) {
    const [users] = await db.execute(`SELECT u.id,u.email,u.status FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE LOWER(u.email)=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 FOR UPDATE`, [parent.email, agency.id]);
    if (users.length !== 1 || !['ACTIVE_EMPLOYEE', 'ACTIVE', 'active'].includes(users[0].status)) throw new Error(`Expected one active employee in this tenant: ${parent.email}`);
    parent.id = users[0].id;
  }
  const ids = parents.map(p => p.id);
  const marks = ids.map(() => '?').join(',');
  const [homes] = await db.execute(`SELECT DISTINCT h.id,h.name FROM family_households h JOIN family_members m ON m.household_id=h.id
    WHERE h.agency_id=? AND m.user_id IN (${marks}) FOR UPDATE`, [agency.id, ...ids]);
  if (homes.length > 1) throw new Error('These accounts already belong to different or multiple households; refusing to merge them automatically.');
  let householdId = homes[0]?.id;
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',agency,household:homes[0] || {name},parents},null,2));
  if (apply) {
    await db.execute("UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.familyCommandCenterEnabled',CAST('true' AS JSON)) WHERE id=?", [agency.id]);
    if (!householdId) {
      const [created] = await db.execute('INSERT INTO family_households (agency_id,name,created_by_user_id,timezone) VALUES (?,?,?,?)', [agency.id,name,ids[0],'America/Denver']);
      householdId = created.insertId;
    }
    for (const parent of parents) {
      await db.execute(`INSERT INTO family_members (household_id,user_id,role,display_name) VALUES (?,?,'parent',?)
        ON DUPLICATE KEY UPDATE role='parent',display_name=VALUES(display_name)`, [householdId,parent.id,parent.displayName]);
    }
    await db.commit();
    console.log(JSON.stringify({enabled:true,householdId,parents:parents.map(p=>({email:p.email,displayName:p.displayName,role:'parent'}))},null,2));
  } else await db.rollback();
} catch (error) {
  if (db) await db.rollback();
  console.error(error.message);
  process.exitCode=1;
} finally {
  db?.release();
  await pool.end();
}
