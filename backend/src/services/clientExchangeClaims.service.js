import pool from '../config/database.js';
import { afterLegacyProviderFieldsChanged, ensureClientProviderAssignmentRow } from './clientProviderAssignmentSync.service.js';
import { recordProviderAssignmentChange } from './officeClientAcceptance.service.js';

const backoffice = role => ['admin', 'super_admin', 'support', 'staff'].includes(String(role || '').toLowerCase());
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

async function withListing(listingId, action) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM client_exchange_listings WHERE id = ? FOR UPDATE', [listingId]);
    const listing = rows[0];
    if (!listing) throw fail('Listing not found', 404);
    if (!['open', 'requested'].includes(listing.status)) throw fail('This listing is no longer accepting claims');
    const result = await action(connection, listing);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function eligibleProvider(connection, userId, agencyId) {
  const [rows] = await connection.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE u.id = ? AND ua.agency_id = ? AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
      AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED','PROSPECTIVE','INACTIVE_EMPLOYEE','TERMINATED_PENDING')
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access = 1)
    LIMIT 1`, [userId, agencyId]);
  if (!rows.length) throw fail('An active provider in this agency is required to claim or receive the client', 403);
}

export async function createExchangeClaim({ listingId, requestingProviderUserId, message }) {
  return withListing(listingId, async (connection, listing) => {
    await eligibleProvider(connection, requestingProviderUserId, listing.agency_id);
    if (Number(requestingProviderUserId) === Number(listing.current_provider_user_id)) throw fail('You are already the current provider for this client');
    const [existing] = await connection.execute(`SELECT id FROM client_exchange_requests
      WHERE listing_id = ? AND requesting_provider_user_id = ? AND status = 'pending'`, [listingId, requestingProviderUserId]);
    if (existing.length) throw fail('You already have a pending claim for this listing');
    const [result] = await connection.execute(`INSERT INTO client_exchange_requests (listing_id, requesting_provider_user_id, status, message)
      VALUES (?, ?, 'pending', ?)`, [listingId, requestingProviderUserId, message || null]);
    await connection.execute("UPDATE client_exchange_listings SET status = 'requested' WHERE id = ?", [listingId]);
    return { requestId: result.insertId, listing };
  });
}

export async function withdrawExchangeListing({ listingId, actingUserId }) {
  return withListing(listingId, async (connection) => {
    await connection.execute("UPDATE client_exchange_listings SET status = 'withdrawn', closed_at = NOW(), closed_by_user_id = ? WHERE id = ?", [actingUserId, listingId]);
    await connection.execute("UPDATE client_exchange_requests SET status = 'withdrawn', resolved_by_user_id = ?, resolved_at = NOW() WHERE listing_id = ? AND status = 'pending'", [actingUserId, listingId]);
  });
}

export async function resolveExchangeClaim({ requestId, action, actingUserId, actingRole, denialReason = null }) {
  if (!['approve', 'deny'].includes(action)) throw fail('action must be approve or deny', 400);
  const [requests] = await pool.execute('SELECT listing_id FROM client_exchange_requests WHERE id = ?', [requestId]);
  if (!requests.length) throw fail('Request not found', 404);
  return withListing(requests[0].listing_id, async (connection, listing) => {
    const [rows] = await connection.execute('SELECT * FROM client_exchange_requests WHERE id = ? FOR UPDATE', [requestId]);
    const request = rows[0];
    if (!request || request.status !== 'pending') throw fail('This claim has already been resolved');
    const [clients] = await connection.execute('SELECT * FROM clients WHERE id = ? FOR UPDATE', [listing.client_id]);
    const client = clients[0];
    if (!client || Number(client.agency_id) !== Number(listing.agency_id)) throw fail('Client no longer belongs to this exchange');
    if (String(client.status).toUpperCase() === 'ARCHIVED') throw fail('Archived clients cannot be assigned');
    if (Number(client.provider_id || 0) !== Number(listing.current_provider_user_id || 0)) throw fail('Client assignment changed. Withdraw and repost the listing before assigning a claim.');
    const canResolve = backoffice(actingRole) || Number(client.provider_id) === Number(actingUserId)
      || (!client.provider_id && Number(listing.posted_by_user_id) === Number(actingUserId));
    if (!canResolve) throw fail('Only the current provider or the posting team can assign this client', 403);
    if (action === 'deny') {
      await connection.execute("UPDATE client_exchange_requests SET status = 'denied', resolved_by_user_id = ?, resolved_at = NOW(), denial_reason = ? WHERE id = ?", [actingUserId, denialReason, requestId]);
      const [pending] = await connection.execute("SELECT id FROM client_exchange_requests WHERE listing_id = ? AND status = 'pending'", [listing.id]);
      if (!pending.length) await connection.execute("UPDATE client_exchange_listings SET status = 'open' WHERE id = ?", [listing.id]);
      return { listing, request };
    }
    await eligibleProvider(connection, request.requesting_provider_user_id, listing.agency_id);
    const providerId = request.requesting_provider_user_id;
    await connection.execute('UPDATE clients SET provider_id = ?, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?', [providerId, actingUserId, client.id]);
    // Transfer the outgoing provider's caseload access; preserve other care-team assignments.
    if (client.provider_id) await connection.execute(`UPDATE client_provider_assignments SET is_active = FALSE, is_primary = FALSE,
      updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ? AND provider_user_id = ? AND is_active = TRUE`, [actingUserId, client.id, client.provider_id]);
    await ensureClientProviderAssignmentRow(connection, { clientId: client.id, organizationId: client.organization_id, providerUserId: providerId, serviceDay: client.service_day, userId: actingUserId, isPrimary: true });
    await afterLegacyProviderFieldsChanged(connection, { clientId: client.id, userId: actingUserId, providerUserId: providerId, serviceDay: client.service_day, isPrimary: true });
    await recordProviderAssignmentChange({ connection, clientId: client.id, agencyId: client.agency_id, clientType: client.client_type, oldProviderUserId: client.provider_id, newProviderUserId: providerId, actingUserId });
    await connection.execute(`INSERT INTO client_status_history (client_id, changed_by_user_id, field_changed, from_value, to_value, note)
      VALUES (?, ?, 'provider_id', ?, ?, 'Assigned from Client Exchange claim')`, [client.id, actingUserId, client.provider_id ? String(client.provider_id) : null, String(providerId)]);
    await connection.execute("UPDATE client_exchange_requests SET status = 'approved', resolved_by_user_id = ?, resolved_at = NOW() WHERE id = ?", [actingUserId, requestId]);
    await connection.execute(`UPDATE client_exchange_requests SET status = 'denied', resolved_by_user_id = ?, resolved_at = NOW(),
      denial_reason = 'Another provider was assigned this client' WHERE listing_id = ? AND status = 'pending' AND id != ?`, [actingUserId, listing.id, requestId]);
    await connection.execute("UPDATE client_exchange_listings SET status = 'closed', closed_at = NOW(), closed_by_user_id = ?, current_provider_user_id = ? WHERE id = ?", [actingUserId, providerId, listing.id]);
    return { listing, request };
  });
}
