import pool from '../config/database.js';
const fail = message => Object.assign(new Error(message), { status: 409 });

/** Serialize posting with assignment and other posts for this client. */
export async function insertExchangeListing({ agencyId, clientId, postedByUserId, summary, notes, onlyUnassigned = false, referralKind = 'transfer', serviceType = 'individual', targetProviderUserId = null }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [clients] = await connection.execute('SELECT id, agency_id, provider_id, status FROM clients WHERE id = ? FOR UPDATE', [clientId]);
    const client = clients[0];
    if (!client || Number(client.agency_id) !== Number(agencyId)) throw fail('Client does not belong to this agency');
    if (['ARCHIVED', 'DECLINED'].includes(String(client.status || '').toUpperCase())) throw fail('Archived or declined clients cannot be posted to the exchange');
    if (referralKind === 'additional_service' && !client.provider_id) throw fail('Assign the current therapist before referring for additional services');
    if (targetProviderUserId && Number(targetProviderUserId) === Number(client.provider_id)) throw fail('Select a different provider');
    const [existing] = await connection.execute("SELECT id FROM client_exchange_listings WHERE client_id = ? AND referral_kind = ? AND service_type = ? AND status IN ('open', 'requested') LIMIT 1", [clientId, referralKind, serviceType]);
    if (existing.length) {
      await connection.commit();
      return { listingId: existing[0].id, created: false, currentProviderId: client.provider_id };
    }
    if (onlyUnassigned) {
      const [assignments] = await connection.execute('SELECT id FROM client_provider_assignments WHERE client_id = ? AND is_active = TRUE LIMIT 1', [clientId]);
      if (client.provider_id || assignments.length) throw fail('This client is already assigned. Open their profile to post a transfer.');
    }
    const [result] = await connection.execute(`INSERT INTO client_exchange_listings
      (agency_id, client_id, posted_by_user_id, current_provider_user_id, status,
       demographics_json, presenting_problems_json, diagnoses_json, preferences_json, notes, referral_kind, service_type, target_provider_user_id)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`, [agencyId, clientId, postedByUserId, client.provider_id || null,
      JSON.stringify(summary.demographics || {}), JSON.stringify(summary.presentingProblems || []),
      JSON.stringify(summary.diagnoses || []), JSON.stringify(summary.preferences || {}), notes || null, referralKind, serviceType, targetProviderUserId]);
    if (summary.preferences?.schedule) {
      await connection.execute(`UPDATE clients SET intake_preferences_json = JSON_SET(COALESCE(intake_preferences_json, JSON_OBJECT()), '$.exchangeSchedule', CAST(? AS JSON)) WHERE id = ? AND agency_id = ?`, [JSON.stringify(summary.preferences.schedule), clientId, agencyId]);
    }
    await connection.execute(`INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
      VALUES (?, ?, 'client_exchange_listing', NULL, 'open', ?)`, [clientId, postedByUserId, referralKind === 'additional_service' ? `Additional ${serviceType} services requested; primary provider retained` : 'Posted to Client Exchange for reassignment']);
    await connection.commit();
    return { listingId: result.insertId, created: true, currentProviderId: client.provider_id };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
