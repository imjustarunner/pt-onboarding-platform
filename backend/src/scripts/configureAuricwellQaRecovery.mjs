// Demo-only, idempotent sender provisioning. Does not change credentials or inbound routes.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

const args = process.argv.slice(2);
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ agencyId: 450, sender: 'app@itsco.health', inbox: 'testing@itsco.health', changesPasswords: false }));
} else {
  const envIndex = args.indexOf('--env');
  if (envIndex < 0 || !args[envIndex + 1]) throw new Error('Provide --env explicitly.');
  dotenv.config({ path: args[envIndex + 1], quiet: true });
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute('SELECT * FROM agencies WHERE id=450 FOR UPDATE');
    if (!isAuricwellQaAgency(agency)) throw new Error('Expected the isolated synthetic QA agency.');
    const [[source]] = await db.execute("SELECT id FROM email_sender_identities WHERE agency_id=2 AND from_email='app@itsco.health' AND is_active=1");
    if (!source) throw new Error('The approved ITSCO app sender must already be configured.');
    const [[existing]] = await db.execute("SELECT id,from_email,is_active FROM email_sender_identities WHERE agency_id=450 AND identity_key='app'");
    if (existing && (existing.from_email !== 'app@itsco.health' || !existing.is_active)) throw new Error('Conflicting demo sender; inspect before changing it.');
    let senderId = existing?.id;
    if (!existing) {
      const [created] = await db.execute(`INSERT INTO email_sender_identities
        (agency_id,identity_key,display_name,from_email,reply_to,inbound_addresses_json,is_active)
        VALUES (450,'app','AuricWell QA Demo','app@itsco.health','testing@itsco.health','[]',1)`);
      senderId = created.insertId;
    }
    await db.commit();
    console.log(JSON.stringify({ agencyId: 450, senderId, created: !existing, from: 'app@itsco.health', recoveryInbox: 'testing@itsco.health', changesPasswords: false }));
  } catch (error) { await db.rollback(); throw error; }
  finally { await db.end(); }
}
