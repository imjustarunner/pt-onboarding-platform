import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import { generateUniqueSixDigitClientCode } from '../utils/clientCode.js';
import { resolvePaperworkStatusId, seedClientAffiliations, seedClientPaperworkItems } from '../utils/clientProvisioning.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

/**
 * Client Exchange (Office clients)
 *
 * Foundation for a marketplace-style reassignment flow: a provider (or
 * support/admin) posts an anonymized listing for an office/clinical client
 * that needs a new provider. Other providers request the assignment; the
 * current provider (or support/admin) approves or denies. Approval reassigns
 * the client's provider and closes out the listing.
 *
 * Deliberately anonymized: listing payloads never carry the client's name,
 * identifier code, contact info, or DOB — only clinically-relevant metadata
 * (age band, presenting problems, diagnoses, preferences) so a browsing
 * provider can judge fit before the client's identity is revealed (on
 * approval, via the normal client record).
 */

const OFFICE_CLIENT_TYPES = ['clinical', 'learning', 'basic_nonclinical'];


function safeJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return value;
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapListingRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    clientId: row.client_id != null ? Number(row.client_id) : null,
    postedByUserId: Number(row.posted_by_user_id),
    postedByName: [row.posted_by_first_name, row.posted_by_last_name].filter(Boolean).join(' ') || null,
    currentProviderUserId: row.current_provider_user_id != null ? Number(row.current_provider_user_id) : null,
    currentProviderName: [row.current_provider_first_name, row.current_provider_last_name].filter(Boolean).join(' ') || null,
    status: row.status,
    demographics: parseJsonColumn(row.demographics_json),
    presentingProblems: parseJsonColumn(row.presenting_problems_json),
    diagnoses: parseJsonColumn(row.diagnoses_json),
    preferences: parseJsonColumn(row.preferences_json),
    notes: row.notes || null,
    clientType: row.client_client_type || null,
    pendingRequestCount: Number(row.pending_request_count || 0),
    closedAt: row.closed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRequestRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    listingId: Number(row.listing_id),
    requestingProviderUserId: Number(row.requesting_provider_user_id),
    requestingProviderName: [row.requesting_first_name, row.requesting_last_name].filter(Boolean).join(' ') || null,
    status: row.status,
    message: row.message || null,
    resolvedByUserId: row.resolved_by_user_id != null ? Number(row.resolved_by_user_id) : null,
    resolvedAt: row.resolved_at || null,
    denialReason: row.denial_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Providers browsing the exchange never see the client's real identity —
 * only agency staff (support/admin/super_admin), the poster, or the current
 * provider get the client's initials/code for reference.
 */
function isPrivilegedViewer({ viewerRole, viewerUserId, listing }) {
  const role = String(viewerRole || '').toLowerCase();
  if (['admin', 'super_admin', 'support', 'staff'].includes(role)) return true;
  if (!viewerUserId) return false;
  const uid = Number(viewerUserId);
  return uid === Number(listing.posted_by_user_id) || uid === Number(listing.current_provider_user_id || 0);
}

function redactListing(listing, { viewerRole, viewerUserId }) {
  const mapped = mapListingRow(listing);
  if (!mapped) return null;
  if (isPrivilegedViewer({ viewerRole, viewerUserId, listing })) {
    return { ...mapped, clientIdentifier: listing.client_identifier_code || listing.client_initials || null };
  }
  // Redacted view for browsing providers: strip identifying fields.
  const { clientId, postedByName, currentProviderName, ...rest } = mapped;
  return { ...rest, clientId: null, currentProviderName: null };
}

export async function listListings({ agencyId, status, viewerUserId, viewerRole }) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const values = [aid];
  let where = 'l.agency_id = ?';
  if (status) {
    const statuses = Array.isArray(status) ? status : String(status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      where += ` AND l.status IN (${statuses.map(() => '?').join(',')})`;
      values.push(...statuses);
    }
  }
  const [rows] = await pool.execute(
    `SELECT l.*,
            c.initials AS client_initials,
            c.identifier_code AS client_identifier_code,
            c.client_type AS client_client_type,
            poster.first_name AS posted_by_first_name, poster.last_name AS posted_by_last_name,
            provider.first_name AS current_provider_first_name, provider.last_name AS current_provider_last_name,
            (SELECT COUNT(*) FROM client_exchange_requests r WHERE r.listing_id = l.id AND r.status = 'pending') AS pending_request_count
     FROM client_exchange_listings l
     LEFT JOIN clients c ON c.id = l.client_id
     LEFT JOIN users poster ON poster.id = l.posted_by_user_id
     LEFT JOIN users provider ON provider.id = l.current_provider_user_id
     WHERE ${where}
     ORDER BY FIELD(l.status, 'open', 'requested', 'approved', 'withdrawn', 'closed'), l.created_at DESC`,
    values
  );
  return (rows || []).map((row) => redactListing(row, { viewerUserId, viewerRole }));
}

async function getRawListingById(listingId) {
  const [rows] = await pool.execute(
    `SELECT l.*,
            c.initials AS client_initials,
            c.identifier_code AS client_identifier_code,
            c.client_type AS client_client_type,
            poster.first_name AS posted_by_first_name, poster.last_name AS posted_by_last_name,
            provider.first_name AS current_provider_first_name, provider.last_name AS current_provider_last_name,
            (SELECT COUNT(*) FROM client_exchange_requests r WHERE r.listing_id = l.id AND r.status = 'pending') AS pending_request_count
     FROM client_exchange_listings l
     LEFT JOIN clients c ON c.id = l.client_id
     LEFT JOIN users poster ON poster.id = l.posted_by_user_id
     LEFT JOIN users provider ON provider.id = l.current_provider_user_id
     WHERE l.id = ?
     LIMIT 1`,
    [Number(listingId)]
  );
  return rows?.[0] || null;
}

export async function getListingById(listingId, { viewerUserId, viewerRole } = {}) {
  const row = await getRawListingById(listingId);
  if (!row) return null;
  return redactListing(row, { viewerUserId, viewerRole });
}

export async function createListing({
  agencyId,
  clientId,
  postedByUserId,
  currentProviderUserId = null,
  demographics = null,
  presentingProblems = null,
  diagnoses = null,
  preferences = null,
  notes = null
}) {
  const aid = Number(agencyId);
  const cid = Number(clientId);
  const posterId = Number(postedByUserId);
  if (!aid || !cid || !posterId) {
    throw new Error('agencyId, clientId, and postedByUserId are required');
  }

  const client = await Client.findById(cid);
  if (!client) throw new Error('Client not found');
  if (Number(client.agency_id) !== aid) throw new Error('Client does not belong to this agency');

  const [existing] = await pool.execute(
    `SELECT id FROM client_exchange_listings WHERE client_id = ? AND status IN ('open', 'requested') LIMIT 1`,
    [cid]
  );
  if (existing?.[0]?.id) {
    throw new Error('This client already has an open listing in the exchange');
  }

  const resolvedCurrentProvider = currentProviderUserId != null ? Number(currentProviderUserId) : (client.provider_id || null);

  const [result] = await pool.execute(
    `INSERT INTO client_exchange_listings
       (agency_id, client_id, posted_by_user_id, current_provider_user_id, status,
        demographics_json, presenting_problems_json, diagnoses_json, preferences_json, notes)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    [
      aid,
      cid,
      posterId,
      resolvedCurrentProvider,
      JSON.stringify(safeJson(demographics) || {}),
      JSON.stringify(safeJson(presentingProblems) || {}),
      JSON.stringify(safeJson(diagnoses) || {}),
      JSON.stringify(safeJson(preferences) || {}),
      notes || null
    ]
  );

  await ClientStatusHistory.create({
    client_id: cid,
    changed_by_user_id: posterId,
    field_changed: 'client_exchange_listing',
    from_value: null,
    to_value: 'open',
    note: 'Posted to Client Exchange for reassignment'
  });

  try {
    const OfficeAcceptance = await import('./officeClientAcceptance.service.js');
    await OfficeAcceptance.recordExchangePosted({
      clientId: cid,
      providerUserId: resolvedCurrentProvider || posterId,
      listingId: result.insertId,
    });
  } catch (e) {
    console.warn('[createListing] office acceptance tracking failed:', e?.message || e);
  }

  return getListingById(result.insertId, { viewerUserId: posterId, viewerRole: 'admin' });
}

export async function withdrawListing({ listingId, actingUserId }) {
  const listing = await getRawListingById(listingId);
  if (!listing) throw new Error('Listing not found');
  if (!['open', 'requested'].includes(listing.status)) {
    throw new Error('Only open listings can be withdrawn');
  }
  await pool.execute(
    `UPDATE client_exchange_listings SET status = 'withdrawn', closed_at = NOW(), closed_by_user_id = ? WHERE id = ?`,
    [actingUserId || null, listing.id]
  );
  await pool.execute(
    `UPDATE client_exchange_requests SET status = 'withdrawn', resolved_by_user_id = ?, resolved_at = NOW()
     WHERE listing_id = ? AND status = 'pending'`,
    [actingUserId || null, listing.id]
  );
  return getListingById(listing.id, { viewerUserId: actingUserId, viewerRole: 'admin' });
}

export async function createRequest({ listingId, requestingProviderUserId, message = null }) {
  const listing = await getRawListingById(listingId);
  if (!listing) throw new Error('Listing not found');
  if (!['open', 'requested'].includes(listing.status)) {
    throw new Error('This listing is no longer accepting requests');
  }
  const requesterId = Number(requestingProviderUserId);
  if (!requesterId) throw new Error('requestingProviderUserId is required');
  if (requesterId === Number(listing.current_provider_user_id || 0)) {
    throw new Error('You are already the current provider for this client');
  }

  const [existing] = await pool.execute(
    `SELECT id FROM client_exchange_requests WHERE listing_id = ? AND requesting_provider_user_id = ? AND status = 'pending' LIMIT 1`,
    [listing.id, requesterId]
  );
  if (existing?.[0]?.id) {
    throw new Error('You already have a pending request for this listing');
  }

  const [result] = await pool.execute(
    `INSERT INTO client_exchange_requests (listing_id, requesting_provider_user_id, status, message)
     VALUES (?, ?, 'pending', ?)`,
    [listing.id, requesterId, message || null]
  );

  if (listing.status === 'open') {
    await pool.execute(`UPDATE client_exchange_listings SET status = 'requested' WHERE id = ?`, [listing.id]);
  }

  return getRequestById(result.insertId);
}

export async function getRequestById(requestId) {
  const [rows] = await pool.execute(
    `SELECT r.*, u.first_name AS requesting_first_name, u.last_name AS requesting_last_name
     FROM client_exchange_requests r
     LEFT JOIN users u ON u.id = r.requesting_provider_user_id
     WHERE r.id = ?
     LIMIT 1`,
    [Number(requestId)]
  );
  return mapRequestRow(rows?.[0] || null);
}

export async function listRequestsForListing(listingId, { viewerUserId, viewerRole } = {}) {
  const listing = await getRawListingById(listingId);
  if (!listing) return [];
  const privileged = isPrivilegedViewer({ viewerRole, viewerUserId, listing });
  const [rows] = await pool.execute(
    `SELECT r.*, u.first_name AS requesting_first_name, u.last_name AS requesting_last_name
     FROM client_exchange_requests r
     LEFT JOIN users u ON u.id = r.requesting_provider_user_id
     WHERE r.listing_id = ?
     ORDER BY FIELD(r.status, 'pending', 'approved', 'denied', 'withdrawn'), r.created_at ASC`,
    [Number(listingId)]
  );
  const mapped = (rows || []).map(mapRequestRow);
  if (privileged) return mapped;
  // Non-privileged viewers only ever see their own request rows.
  return mapped.filter((r) => Number(r.requestingProviderUserId) === Number(viewerUserId || 0));
}

export async function listMyRequests({ agencyId, requestingProviderUserId }) {
  const aid = Number(agencyId);
  const uid = Number(requestingProviderUserId);
  if (!aid || !uid) return [];
  const [rows] = await pool.execute(
    `SELECT r.*, u.first_name AS requesting_first_name, u.last_name AS requesting_last_name,
            l.status AS listing_status, l.agency_id AS listing_agency_id
     FROM client_exchange_requests r
     JOIN client_exchange_listings l ON l.id = r.listing_id
     LEFT JOIN users u ON u.id = r.requesting_provider_user_id
     WHERE r.requesting_provider_user_id = ? AND l.agency_id = ?
     ORDER BY r.created_at DESC`,
    [uid, aid]
  );
  return (rows || []).map((row) => ({ ...mapRequestRow(row), listingStatus: row.listing_status }));
}

/**
 * Approve or deny a pending request. Approval reassigns the client's
 * provider (logged via the normal status-history trail), closes the
 * listing, and auto-denies any other pending requests for the same listing.
 */
export async function resolveRequest({ requestId, action, actingUserId, denialReason = null }) {
  const act = String(action || '').toLowerCase();
  if (!['approve', 'deny'].includes(act)) throw new Error('action must be approve or deny');

  const [rows] = await pool.execute(
    `SELECT r.*, l.id AS listing_id, l.client_id, l.status AS listing_status
     FROM client_exchange_requests r
     JOIN client_exchange_listings l ON l.id = r.listing_id
     WHERE r.id = ?
     LIMIT 1`,
    [Number(requestId)]
  );
  const request = rows?.[0] || null;
  if (!request) throw new Error('Request not found');
  if (request.status !== 'pending') throw new Error('Request has already been resolved');

  if (act === 'deny') {
    await pool.execute(
      `UPDATE client_exchange_requests SET status = 'denied', resolved_by_user_id = ?, resolved_at = NOW(), denial_reason = ?
       WHERE id = ?`,
      [actingUserId || null, denialReason || null, request.id]
    );
    const [stillPending] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM client_exchange_requests WHERE listing_id = ? AND status = 'pending'`,
      [request.listing_id]
    );
    if (Number(stillPending?.[0]?.cnt || 0) === 0 && request.listing_status === 'requested') {
      await pool.execute(`UPDATE client_exchange_listings SET status = 'open' WHERE id = ?`, [request.listing_id]);
    }
    return getRequestById(request.id);
  }

  // Approve: reassign the client, close the listing, deny remaining requests.
  if (request.client_id) {
    await Client.assignProvider(
      request.client_id,
      request.requesting_provider_user_id,
      actingUserId || null,
      'Reassigned via Client Exchange'
    );
  }

  await pool.execute(
    `UPDATE client_exchange_requests SET status = 'approved', resolved_by_user_id = ?, resolved_at = NOW()
     WHERE id = ?`,
    [actingUserId || null, request.id]
  );
  await pool.execute(
    `UPDATE client_exchange_requests SET status = 'denied', resolved_by_user_id = ?, resolved_at = NOW(),
       denial_reason = 'Another provider was approved for this listing'
     WHERE listing_id = ? AND status = 'pending' AND id != ?`,
    [actingUserId || null, request.listing_id, request.id]
  );
  await pool.execute(
    `UPDATE client_exchange_listings
     SET status = 'closed', closed_at = NOW(), closed_by_user_id = ?, current_provider_user_id = ?
     WHERE id = ?`,
    [actingUserId || null, request.requesting_provider_user_id, request.listing_id]
  );

  if (request.client_id) {
    await ClientStatusHistory.create({
      client_id: request.client_id,
      changed_by_user_id: actingUserId || null,
      field_changed: 'client_exchange_listing',
      from_value: 'requested',
      to_value: 'closed',
      note: 'Client Exchange request approved; provider reassigned'
    });
  }

  return getRequestById(request.id);
}

/**
 * Referred: Awaiting acceptance — office clients assigned to a provider but still
 * within the acceptance window (not yet posted to exchange or marked current).
 * Uses office_client_assignment_events for accurate tracking.
 */
export async function listPendingAcceptanceClients({ agencyId, windowDays = 30 }) {
  const aid = Number(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT
         e.id AS event_id,
         e.client_id, e.provider_user_id, e.assigned_at,
         e.exchanged_at, e.marked_current_at, e.exchange_listing_id,
         c.initials, c.full_name, c.identifier_code, c.client_type, c.status AS client_status,
         c.contact_phone, c.source, c.intake_preferences_json, c.adaptive_intake_meta_json,
         u.first_name AS provider_first, u.last_name AS provider_last
       FROM office_client_assignment_events e
       INNER JOIN clients c ON c.id = e.client_id
       INNER JOIN users u ON u.id = e.provider_user_id
       WHERE e.agency_id = ?
         AND e.ended_at IS NULL
         AND e.exchanged_at IS NULL
         AND e.marked_current_at IS NULL
         AND e.assigned_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         AND c.status NOT IN ('ARCHIVED')
       ORDER BY e.assigned_at DESC`,
      [aid, windowDays]
    );
    return (rows || []).map((row) => ({
      id: Number(row.client_id),
      eventId: Number(row.event_id),
      initials: row.initials,
      fullName: row.full_name,
      identifierCode: row.identifier_code,
      clientType: row.client_type,
      clientStatus: row.client_status,
      contactPhone: row.contact_phone,
      source: row.source,
      intakePreferences: parseJsonColumn(row.intake_preferences_json),
      adaptiveMeta: parseJsonColumn(row.adaptive_intake_meta_json),
      assignedAt: row.assigned_at,
      providerName: `${row.provider_first || ''} ${row.provider_last || ''}`.trim() || null,
      providerUserId: Number(row.provider_user_id)
    }));
  } catch {
    return [];
  }
}

/** Support/admin queue: office clients (clinical/learning) awaiting a first provider assignment. */
export async function listPendingOfficeClients({ agencyId }) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const typePlaceholders = OFFICE_CLIENT_TYPES.map(() => '?').join(',');
  const baseWhere = `WHERE c.agency_id = ?
       AND c.client_type IN (${typePlaceholders})
       AND c.provider_id IS NULL
       AND c.status NOT IN ('ARCHIVED')
     ORDER BY c.created_at DESC`;
  let rows;
  try {
    const [r] = await pool.execute(
      `SELECT c.id, c.initials, c.full_name, c.identifier_code, c.client_type, c.status,
              c.contact_phone, c.submission_date, c.source, c.intake_preferences_json,
              c.adaptive_intake_meta_json, c.created_at, c.date_of_birth
       FROM clients c
       ${baseWhere}`,
      [aid, ...OFFICE_CLIENT_TYPES]
    );
    rows = r;
  } catch (err) {
    if (!/Unknown column|adaptive_intake_meta/i.test(String(err?.message || ''))) throw err;
    const [r] = await pool.execute(
      `SELECT c.id, c.initials, c.full_name, c.identifier_code, c.client_type, c.status,
              c.contact_phone, c.submission_date, c.source, c.intake_preferences_json,
              c.created_at
       FROM clients c
       ${baseWhere}`,
      // date_of_birth may not exist in older schema, handled via adaptiveMeta fallback
      [aid, ...OFFICE_CLIENT_TYPES]
    );
    rows = r;
  }
  return (rows || []).map((row) => ({
    id: Number(row.id),
    initials: row.initials,
    fullName: row.full_name,
    identifierCode: row.identifier_code,
    clientType: row.client_type,
    status: row.status,
    contactPhone: row.contact_phone,
    submissionDate: row.submission_date,
    source: row.source,
    intakePreferences: parseJsonColumn(row.intake_preferences_json),
    adaptiveMeta: parseJsonColumn(row.adaptive_intake_meta_json),
    pathway: parseJsonColumn(row.adaptive_intake_meta_json)?.pathway || null,
    createdAt: row.created_at,
    dateOfBirth: row.date_of_birth || null
  }));
}

async function resolveAgencyRow(agencySlugOrId) {
  const raw = String(agencySlugOrId || '').trim();
  if (!raw) return null;
  const asId = Number(raw);
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type
     FROM agencies
     WHERE ${Number.isFinite(asId) && asId > 0 ? 'id = ? OR ' : ''}slug = ? OR portal_url = ?
     LIMIT 1`,
    Number.isFinite(asId) && asId > 0 ? [asId, raw, raw] : [raw, raw]
  );
  return rows?.[0] || null;
}

export async function getPublicOfficeIntakeAgency(agencySlugOrId) {
  const agency = await resolveAgencyRow(agencySlugOrId);
  if (!agency) return null;
  return { id: agency.id, name: agency.name, slug: agency.slug || agency.portal_url || null };
}

/**
 * Minimal public digital intake: captures contact info + preferred day/time
 * and location/modality, and creates a pending clinical client for support
 * to triage and assign a provider (directly, or via the Client Exchange).
 */
export async function createPublicOfficeIntakeClient({ agencySlugOrId, payload = {} }) {
  const agency = await resolveAgencyRow(agencySlugOrId);
  if (!agency) throw new Error('Organization not found');

  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const fullName = String(payload.fullName || `${firstName} ${lastName}`).trim();
  if (!fullName) throw new Error('Name is required');
  const contactPhone = String(payload.contactPhone || payload.phone || '').trim() || null;
  const dateOfBirth = String(payload.dateOfBirth || payload.birthdate || '').trim() || null;
  const homeAddress = String(payload.homeAddress || '').trim() || null;

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3) || 'TBD';

  const agencyId = agency.id;
  const identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
  const paperworkStatusId = await resolvePaperworkStatusId({ agencyId });
  const clientStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'prospective' });

  const requestedType = String(payload.clientType || '').toLowerCase();
  const clientType = ['learning', 'basic_nonclinical', 'school', 'clinical'].includes(requestedType)
    ? requestedType
    : 'clinical';


  const intakePreferences = {
    preferredDays: Array.isArray(payload.preferredDays) ? payload.preferredDays : (payload.preferredDays ? [payload.preferredDays] : []),
    preferredTimeOfDay: payload.preferredTimeOfDay || null,
    preferredModality: payload.preferredModality || null, // 'in_person' | 'virtual' | 'either'
    preferredLocation: payload.preferredLocation || null,
    presentingConcern: payload.presentingConcern || payload.reasonForVisit || null,
    insuranceOrPayment: payload.insuranceOrPayment || null,
    submittedAt: new Date().toISOString()
  };

  const client = await Client.create({
    organization_id: agencyId,
    agency_id: agencyId,
    provider_id: null,
    initials,
    full_name: fullName,
    contact_phone: contactPhone,
    date_of_birth: dateOfBirth || undefined,
    identifier_code: identifierCode,
    status: 'PENDING_REVIEW',
    submission_date: new Date().toISOString().split('T')[0],
    document_status: 'NONE',
    paperwork_status_id: paperworkStatusId,
    client_status_id: clientStatusId,
    client_type: clientType,
    source: 'PUBLIC_OFFICE_INTAKE',
    created_by_user_id: null
  });

  await pool.execute(`UPDATE clients SET intake_preferences_json = ? WHERE id = ?`, [
    JSON.stringify(intakePreferences),
    client.id
  ]);

  if (homeAddress) {
    await pool.execute(`UPDATE clients SET address_street = ? WHERE id = ?`, [homeAddress, client.id]).catch(() => null);
  }

  await seedClientAffiliations({ clientId: client.id, agencyId, organizationId: agencyId });
  await seedClientPaperworkItems({ clientId: client.id, agencyId });

  await ClientStatusHistory.create({
    client_id: client.id,
    changed_by_user_id: null,
    field_changed: 'created',
    from_value: null,
    to_value: JSON.stringify({ source: 'PUBLIC_OFFICE_INTAKE', status: 'PENDING_REVIEW' }),
    note: 'Client created via public office digital intake'
  });

  return { client: await Client.findById(client.id) };
}

export { OFFICE_CLIENT_TYPES };
