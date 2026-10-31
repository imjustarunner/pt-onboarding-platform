// Explicit, repeatable synthetic-fixture repair. Dry run by default. No sends,
// accounts, signatures, service prices, historical outcomes or ledger changes.
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

export const clientIds = Object.freeze([2259,2260,2261,2262,2263,2264,2265,2266,2267,2271,2272,2273,2274,2277,2279,2280,2281,2287,2288,2289,2290,2297,2298]);
const cash = value => /^(?:self[ _-]?pay|cash|private[ _-]?pay)$/i.test(String(value || '').trim());
const unknown = value => !String(value || '').trim() || /^(?:none|unknown|not (?:on file|recorded)|n\/a)$/i.test(String(value).trim());
const fail = () => { throw new Error('QA fixture guard failed. No repair applied; review scoped records.'); };
export async function repairQaPayerMailboxes(db, { apply = false } = {}) {
  await db.beginTransaction();
  try {
    const [[agency]] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
    if (!isAuricwellQaAgency(agency)) fail();
    const [[settings]] = await db.execute('SELECT self_pay_only FROM agency_self_pay_settings WHERE agency_id=450');
    if (Number(settings?.self_pay_only) !== 1) fail();
    // Reject a changed roster rather than silently including another account.
    const [roster] = await db.execute('SELECT id FROM clients WHERE agency_id=450 ORDER BY id FOR UPDATE');
    if (roster.length !== clientIds.length || roster.some((row,i) => Number(row.id) !== clientIds[i])) fail();
    const [clients] = await db.execute(`SELECT c.id,c.insurance_type_id,c.primary_insurer_name,c.billing_insurance_payload,
      it.label AS insurance_type_label,it.insurance_key FROM clients c
      LEFT JOIN insurance_types it ON it.id=c.insurance_type_id AND it.agency_id=c.agency_id
      WHERE c.agency_id=450 ORDER BY c.id FOR UPDATE`);
    if (clients.length !== clientIds.length || clients.some((row,i) => Number(row.id) !== clientIds[i])) fail();
    const [types] = await db.execute(`SELECT id,label,insurance_key FROM insurance_types WHERE agency_id=450 AND (is_active IS NULL OR is_active=1)`);
    const selfPayTypes = types.filter(row => cash(row.label) || cash(row.insurance_key));
    if (selfPayTypes.length > 1) fail();
    const selfPayTypeId = selfPayTypes[0]?.id || null;
    const changes = clients.map(client => {
      const covered = !!client.billing_insurance_payload || (client.insurance_type_id && !client.insurance_type_label)
        || [client.primary_insurer_name,client.insurance_type_label,client.insurance_key].some(value => !unknown(value) && !cash(value));
      const from = covered ? 'coverage_review' : cash(client.primary_insurer_name) || cash(client.insurance_type_label) ? 'self_pay' : 'unknown';
      return { id:Number(client.id),from,to:covered ? 'coverage_review' : 'self_pay',
        update:!covered && (!cash(client.primary_insurer_name) || (selfPayTypeId && Number(client.insurance_type_id)!==Number(selfPayTypeId))) };
    });
    const [identities] = await db.execute(`SELECT id,agency_id,from_email,reply_to,is_active FROM email_sender_identities WHERE agency_id=450 AND id IN(1119,1121,1122) FOR UPDATE`);
    const notifications = identities.find(row => Number(row.id)===1119 && row.from_email==='notifications@itsco.health' && Number(row.agency_id)===450 && Number(row.is_active)===1);
    const supportAlreadyConfigured = identities.some(row => [1121,1122].includes(Number(row.id)) && Number(row.agency_id)===450
      && Number(row.is_active)===1 && ['portal@itsco.health','portal@auricwell.com'].includes(row.from_email) && row.reply_to==='support@itsco.health');
    if (!notifications || !supportAlreadyConfigured || !['notifications@itsco.health','support@itsco.health'].includes(notifications.reply_to)) fail();
    const mailboxUpdate = notifications.reply_to !== 'support@itsco.health';
    if (apply) {
      for (const change of changes.filter(row => row.update)) {
        await db.execute('UPDATE clients SET primary_insurer_name=?,insurance_type_id=COALESCE(?,insurance_type_id) WHERE id=? AND agency_id=450', ['Self Pay',selfPayTypeId,change.id]);
      }
      if (mailboxUpdate) {
        const [result] = await db.execute(`UPDATE email_sender_identities SET reply_to='support@itsco.health' WHERE id=1119 AND agency_id=450 AND is_active=1 AND from_email='notifications@itsco.health' AND reply_to='notifications@itsco.health'`);
        if (result.affectedRows !== 1) fail();
      }
      await db.commit();
    } else await db.rollback();
    // No names, addresses, contact details, credentials, links or insurance data.
    return { applied:apply,agencyId:450,clientCount:clients.length,clients:changes,
      notificationsIdentityId:1119,mailboxUpdate,contactFixturesRemainUnenrolled:[2297,2298],sendsMessages:false,createsCharges:false,changesHistoricalOutcomes:false };
  } catch (error) { await db.rollback(); throw error; }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2), envIndex=args.indexOf('--env');
  if (envIndex<0 || !args[envIndex+1]) throw new Error('Provide --env explicitly for the guarded dry run or --apply.');
  dotenv.config({path:args[envIndex+1],quiet:true});
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z',dateStrings:true});
  try { console.log(JSON.stringify(await repairQaPayerMailboxes(db,{apply:args.includes('--apply')}))); }
  finally { await db.end(); }
}
