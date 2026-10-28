import pool from '../config/database.js';
import { exchangeStaffRole } from '../../../frontend/src/navigation/clientExchangePolicy.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const mapWaiver = row => ({ id: Number(row.id), providerUserId: Number(row.provider_user_id), field: row.field,
  fingerprint: row.fingerprint, reason: row.reason, originalStatus: row.original_status, originalReason: row.original_reason,
  waivedByUserId: row.waived_by_user_id, waivedByName: row.waived_by_name, createdAt: row.created_at,
  revokedAt: row.revoked_at, revokedByName: row.revoked_by_name });

export async function loadExchangeWaivers({ listingId, userId, database = pool, includeRevoked = false }) {
  if (!listingId) return [];
  const [rows] = await database.execute(`SELECT w.*, CONCAT_WS(' ', actor.first_name, actor.last_name) AS waived_by_name,
    CONCAT_WS(' ', revoker.first_name, revoker.last_name) AS revoked_by_name
    FROM client_exchange_match_waivers w JOIN users actor ON actor.id = w.waived_by_user_id
    LEFT JOIN users revoker ON revoker.id = w.revoked_by_user_id
    WHERE w.listing_id = ? ${userId ? 'AND w.provider_user_id = ?' : ''} ${includeRevoked ? '' : 'AND w.revoked_at IS NULL'} ORDER BY w.id DESC`,
  [listingId, ...(userId ? [userId] : [])]);
  return rows.map(mapWaiver);
}

export async function changeExchangeWaiver({ listingId, agencyId, providerUserId, actor, field, fingerprint, reason, revokeId }) {
  if (!exchangeStaffRole(actor?.role)) throw fail('Agency staff access is required', 403);
  const { getListingForMatching } = await import('./clientExchange.service.js');
  const { loadExchangeProvider, evaluateCurrentExchangeFit } = await import('./clientExchangeEligibility.service.js');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[row]] = await connection.execute('SELECT * FROM client_exchange_listings WHERE id = ? FOR UPDATE', [listingId]);
    if (!row || Number(row.agency_id) !== Number(agencyId)) throw fail('Listing not found', 404);
    if (!['open', 'requested'].includes(row.status)) throw fail('Only available listings can be reviewed');
    if (revokeId) {
      const [result] = await connection.execute(`UPDATE client_exchange_match_waivers SET revoked_at = NOW(), revoked_by_user_id = ?
        WHERE id = ? AND listing_id = ? AND provider_user_id = ? AND revoked_at IS NULL`, [actor.id, revokeId, listingId, providerUserId]);
      if (!result.affectedRows) throw fail('This waiver is no longer active. Refresh the audit.');
    } else {
      const note = String(reason || '').trim();
      if (!note || note.length > 1000) throw fail('Enter a reason for the waiver (up to 1,000 characters)', 400);
      const listing = await getListingForMatching(listingId);
      const context = await loadExchangeProvider({ userId: providerUserId, agencyId });
      if (!context.user) throw fail('An active provider in this agency is required', 403);
      const fit = await evaluateCurrentExchangeFit({ context, listing });
      const check = fit.checks.find(item => item.field === field);
      if (!check?.canWaive) throw fail('This check cannot be waived. Insurance and account eligibility remain required.');
      if (check.fingerprint !== fingerprint) throw fail('Matching details changed. Refresh the audit before waiving this check.');
      await connection.execute(`UPDATE client_exchange_match_waivers SET revoked_at = NOW(), revoked_by_user_id = ?
        WHERE listing_id = ? AND provider_user_id = ? AND field = ? AND revoked_at IS NULL`, [actor.id, listingId, providerUserId, field]);
      await connection.execute(`INSERT INTO client_exchange_match_waivers
        (listing_id, provider_user_id, field, fingerprint, original_status, original_reason, reason, waived_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [listingId, providerUserId, field, check.fingerprint, check.status, check.reason, note, actor.id]);
    }
    await connection.commit();
    return { saved: true };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
