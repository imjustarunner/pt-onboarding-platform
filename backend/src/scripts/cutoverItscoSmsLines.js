// Read-only unless --apply is provided. Run with the live client-campaign bindings.
// Historical QA assignments, enrollments, consent and messages stay in their original agency.
import { pathToFileURL } from 'node:url';
import pool from '../config/database.js';
import { assertNotifyreAgencyCampaign } from '../utils/smsCarrierPolicy.js';
import { validateSmsRegistration } from '../utils/smsCompliancePolicy.js';

const ITSCO = 2;
const NLU = 6;
const QA = 450;
const pairs = [
  { agencyId: ITSCO, currentAgencyId: QA, reminderId: 5, providerId: 6, oldProviderId: 1 },
  { agencyId: NLU, currentAgencyId: NLU, reminderId: 7, providerId: 8, oldProviderId: 7 }
];
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const actor = 'automation:clinical-sms-line-cutover';
const requireExpected = (condition, message) => { if (!condition) throw new Error(message); };

export async function runClinicalSmsCutover({ database = pool, apply = false, env = process.env } = {}) {
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [agencyRows] = await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id IN (2,6,450) ORDER BY id FOR UPDATE');
    const agencies = new Map(agencyRows.map(row => [Number(row.id), { ...row, flags: parse(row.feature_flags) || {} }]));
    requireExpected(agencies.get(ITSCO)?.slug === 'itsco' && agencies.get(NLU)?.slug === 'nlu'
      && agencies.get(QA)?.slug === 'auricwell-qa-demo', 'The organization identifiers differ from the approved cutover.');

    const [numbers] = await db.execute(`SELECT n.id,n.agency_id,n.phone_number,n.status,n.is_active,n.number_purpose,
      r.campaign_id,r.registration_json FROM twilio_numbers n
      JOIN sms_sender_registrations r ON r.number_id=n.id WHERE n.id IN (5,6,7,8) ORDER BY n.id FOR UPDATE`);
    const lines = new Map(numbers.map(row => [Number(row.id), row]));
    const planned = [];
    for (const pair of pairs) {
      const agency = agencies.get(pair.agencyId);
      const reminder = lines.get(pair.reminderId);
      const provider = lines.get(pair.providerId);
      const alreadyReady = Number(agency.flags.smsReminderNumberId) === pair.reminderId
        && Number(agency.flags.smsSharedCareNumberId) === pair.providerId;
      const expectedOwner = alreadyReady ? pair.agencyId : pair.currentAgencyId;
      if (!alreadyReady) {
        requireExpected(!agency.flags.smsReminderNumberId && Number(agency.flags.smsSharedCareNumberId) === pair.oldProviderId,
          'A line setting has changed since review. Recheck the intended cutover.');
      }
      requireExpected(reminder && provider && reminder.phone_number !== provider.phone_number && reminder.campaign_id === provider.campaign_id,
        'Two distinct lines on the same approved carrier campaign are required.');
      for (const [line, purposes] of [[reminder, ['reminders', 'care']], [provider, ['care']]]) {
        const registration = parse(line.registration_json);
        requireExpected(Number(line.agency_id) === expectedOwner && line.is_active && line.status === 'active' && line.number_purpose === 'clinical_care',
          'A reviewed line is inactive or assigned to a different organization.');
        requireExpected(!validateSmsRegistration(registration).length && purposes.every(purpose => registration.purposes.includes(purpose)),
          'A line is missing the required approved carrier registration.');
        assertNotifyreAgencyCampaign(registration, pair.agencyId, env);
      }
      planned.push({ ...pair, alreadyReady, reminderEnding: reminder.phone_number.slice(-4), providerEnding: provider.phone_number.slice(-4) });
    }

    const transfer = planned.find(pair => pair.agencyId === ITSCO && !pair.alreadyReady);
    let qaAssignments = 0;
    let qaRelays = 0;
    if (transfer) {
      const qa = agencies.get(QA).flags;
      requireExpected(Number(qa.smsSharedCareNumberId) === 5 && !qa.smsReminderNumberId, 'QA line settings changed since review.');
      const [extensions] = await db.execute('SELECT id FROM user_extensions WHERE number_id IN (5,6) FOR UPDATE');
      const [rules] = await db.execute('SELECT id FROM twilio_number_rules WHERE number_id IN (5,6) AND enabled=TRUE FOR UPDATE');
      requireExpected(extensions.length === 0 && rules.length === 0, 'Review active forwarding rules or extensions before transferring these lines.');
      const [assignments] = await db.execute('SELECT id FROM twilio_number_assignments WHERE number_id IN (5,6) AND is_active=TRUE FOR UPDATE');
      const [relays] = await db.execute('SELECT id,agency_id FROM provider_sms_relay_enrollments WHERE number_id IN (5,6) AND enabled=TRUE FOR UPDATE');
      requireExpected(relays.every(row => Number(row.agency_id) === QA), 'An active relay belongs to a different organization.');
      qaAssignments = assignments.length;
      qaRelays = relays.length;
      if (apply) {
        await db.execute('UPDATE twilio_number_assignments SET is_active=FALSE WHERE number_id IN (5,6) AND is_active=TRUE');
        await db.execute('UPDATE provider_sms_relay_enrollments SET enabled=FALSE WHERE agency_id=? AND number_id IN (5,6) AND enabled=TRUE', [QA]);
        const [moved] = await db.execute('UPDATE twilio_numbers SET agency_id=? WHERE id IN (5,6) AND agency_id=?', [ITSCO, QA]);
        requireExpected(moved.affectedRows === 2, 'Both lines must transfer together.');
        await db.execute(`UPDATE agencies SET feature_flags=JSON_SET(
          JSON_REMOVE(COALESCE(feature_flags,JSON_OBJECT()),'$.smsSharedCareNumberId','$.smsReminderNumberId'),
          '$.smsNumbersEnabled',JSON_EXTRACT('false','$')) WHERE id=?`, [QA]);
        await recordOperation(db, QA, { transferredNumberIds: [5,6], destinationAgencyId: ITSCO, disabledAssignments: qaAssignments, disabledRelayEnrollments: qaRelays });
      }
    }

    for (const pair of planned) {
      if (!apply || pair.alreadyReady) continue;
      await db.execute(`UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),
        '$.smsSharedCareNumberId',CAST(? AS UNSIGNED),'$.smsReminderNumberId',CAST(? AS UNSIGNED),
        '$.smsReminderSenderMode','agency_default','$.smsNumbersEnabled',JSON_EXTRACT('true','$')) WHERE id=?`,
      [pair.providerId, pair.reminderId, pair.agencyId]);
      await recordOperation(db, pair.agencyId, { providerNumberId: pair.providerId, reminderNumberId: pair.reminderId, sourceAgencyId: pair.currentAgencyId });
    }
    if (apply) await db.commit();
    else await db.rollback();
    return { applied: apply, lines: planned.map(({ agencyId, reminderEnding, providerEnding, alreadyReady }) => ({
      agencyId, reminderEnding, providerEnding, alreadyReady
    })), disabledQaAssignments: qaAssignments, disabledQaRelayEnrollments: qaRelays };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

function recordOperation(db, agencyId, metadata) {
  return db.execute(`INSERT INTO user_activity_log (action_type,user_id,agency_id,user_agent,metadata)
    VALUES ('clinical_sms_line_cutover',NULL,?,?,?)`, [agencyId, actor, JSON.stringify({ actor, ...metadata })]);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await runClinicalSmsCutover({ apply: process.argv.includes('--apply') }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
