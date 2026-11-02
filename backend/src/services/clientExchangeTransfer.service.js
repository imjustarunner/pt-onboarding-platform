import pool from '../config/database.js';
import { exchangeStaffRole } from '../../../frontend/src/navigation/clientExchangePolicy.js';
import { normalizeExchangeLocation } from '../../../frontend/src/navigation/clientExchangeLocation.js';
import { withExchangeLock } from './clientExchangeAudit.service.js';
import { adjustProviderSlots } from './providerSlots.service.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });

/** Termination ends agency care. An available transfer must be resolved separately. */
export async function assertExchangeResolvedBeforeArchive(db, clientId) {
  const [rows] = await db.execute("SELECT id FROM client_exchange_listings WHERE client_id=? AND status IN ('open','requested') LIMIT 1", [clientId]);
  if (rows.length) throw fail('This client has an available Client Exchange referral. To end the former provider’s assignment, use Keep client in Exchange. If the client is ending all care, withdraw the referral before archiving or terminating the client.');
}

/** End the former assignment, preserving the referral, chart and historical care. */
export async function keepClientInExchange({ listingId, agencyId, actor, restoreArchived = false, serviceLocation }, database = pool) {
  return withExchangeLock(listingId, async () => {
    const db = await database.getConnection();
    try {
      await db.beginTransaction();
      const [[source]] = await db.execute('SELECT client_id FROM client_exchange_listings WHERE id=? AND agency_id=?', [listingId, agencyId]);
      if (!source) throw fail('Referral not found', 404);
      const [[client]] = await db.execute('SELECT * FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [source.client_id, agencyId]);
      const [[listing]] = await db.execute('SELECT * FROM client_exchange_listings WHERE id=? FOR UPDATE', [listingId]);
      if (!client || !['open','requested'].includes(listing.status) || listing.referral_kind !== 'transfer') throw fail('An available transfer referral is required');
      const staff = exchangeStaffRole(actor?.role);
      const former = Number(listing.current_provider_user_id || listing.posted_by_user_id);
      if (!staff && (Number(actor?.id) !== former || Number(client.provider_id) !== former)) throw fail('Only the current provider or support team can end this assignment', 403);
      if (client.status === 'ARCHIVED' && (!staff || !restoreArchived)) throw fail('Support must explicitly restore this archived client after reviewing the history');
      if (client.compliance_archived_at || client.status === 'DECLINED') throw fail('This record needs a separate support review');
      if (client.provider_id && Number(client.provider_id) !== former) throw fail('This client has already been assigned to another provider');
      const location = serviceLocation === undefined ? undefined : normalizeExchangeLocation(serviceLocation, {required: true});
      const [assignments] = await db.execute('SELECT id,provider_user_id,organization_id,service_day FROM client_provider_assignments WHERE client_id=? AND is_active=1 FOR UPDATE', [client.id]);
      const ending = assignments.filter(row => Number(row.provider_user_id) === former);
      const others = assignments.filter(row => Number(row.provider_user_id) !== former);
      const [[status]] = await db.execute("SELECT id FROM client_statuses WHERE agency_id=? AND status_key='other_transfer' AND is_active=1", [agencyId]);
      if (!status) throw fail('The Transfer Needed client status is not configured');
      const next = {status: others.length ? 'ACTIVE' : 'PENDING_REVIEW', client_status_id: others.length && !restoreArchived ? client.client_status_id : status.id,
        provider_id: others[0]?.provider_user_id || null, service_day: others[0]?.service_day || null};
      const note = restoreArchived
        ? 'Owner-requested correction: client is seeking reassignment through Client Exchange, not ending agency care. Prior termination and provider history retained.'
        : 'Former provider assignment ended; client remains available in Client Exchange for reassignment.';
      let changed = false;
      for (const [field, value] of Object.entries({...next, ...(restoreArchived ? {terminated_at:null, terminated_by_user_id:null, termination_reason:null} : {})})) {
        if (String(client[field] ?? '') === String(value ?? '')) continue;
        await db.execute(`UPDATE clients SET ${field}=? WHERE id=?`, [value, client.id]);
        await db.execute('INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)',
          [client.id, actor.id, field, client[field] == null ? null : String(client[field]), value == null ? 'cleared' : String(value), note]);
        changed = true;
      }
      if (ending.length) {
        await db.execute('UPDATE client_provider_assignments SET is_active=0,is_primary=0,updated_by_user_id=? WHERE client_id=? AND provider_user_id=? AND is_active=1', [actor.id, client.id, former]);
        for (const row of ending) {
          await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,'provider_assignment',?,'inactive',?)", [client.id,actor.id,String(row.id),note]);
          if (row.organization_id && row.service_day) await adjustProviderSlots(db,{providerUserId:former,schoolId:row.organization_id,dayOfWeek:row.service_day,delta:0,allowNegative:true});
        }
        changed = true;
      }
      if (location !== undefined) {
        const prefs = typeof client.intake_preferences_json === 'string' ? JSON.parse(client.intake_preferences_json || '{}') : client.intake_preferences_json || {};
        if (prefs.serviceLocation !== location) {
          await db.execute("UPDATE clients SET intake_preferences_json=JSON_SET(COALESCE(intake_preferences_json,JSON_OBJECT()),'$.serviceLocation',?) WHERE id=?", [location,client.id]);
          await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,'service_location',?,?,?)", [client.id,actor.id,prefs.serviceLocation || null,location,'In-person city confirmed by the requesting administrator.']);
          changed = true;
        }
      }
      if (changed) await db.execute('UPDATE clients SET updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=?', [actor.id,client.id]);
      await db.commit();
      return {saved:true,changed,clientId:client.id,listingId,status:next.status,assignmentsEnded:ending.length};
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  });
}
