import { normalizeExchangeSchedule } from '../utils/clientExchangeSchedule.js';
import { insertExchangeListing } from './clientExchangePosting.service.js';
import pool from '../config/database.js';
import { notifyExchangeMatches } from './clientExchangeNotifications.service.js';
import { loadClientExchangeSummary } from './clientExchangeSummary.service.js';
import { mergeExchangeSummary, summaryItems } from '../utils/clientExchangeSummary.js';
import { createExchangeClaim, resolveExchangeClaim, withdrawExchangeListing } from './clientExchangeClaims.service.js';
import { notifyExchangeClaim, notifyExchangeAssignment } from './clientExchangeNotifications.service.js';
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
    presentingProblemSource: parseJsonColumn(row.preferences_json)?.presentingProblemSource || null,
    presentingProblemUpdatedAt: parseJsonColumn(row.preferences_json)?.presentingProblemUpdatedAt || null,
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
  mapped.canManageClaims = ['admin', 'super_admin', 'support', 'staff'].includes(String(viewerRole || '').toLowerCase())
    || Number(viewerUserId) === Number(listing.current_provider_user_id)
    || (!listing.current_provider_user_id && Number(viewerUserId) === Number(listing.posted_by_user_id));
  if (isPrivilegedViewer({ viewerRole, viewerUserId, listing })) {
    return {
      ...mapped,
      clientInitials: listing.client_initials || null,
      clientIdentifierCode: listing.client_identifier_code || null,
      clientIdentifier: listing.client_identifier_code || listing.client_initials || null
    };
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
  for (let i = 0; i < (rows || []).length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map(hydrateListingSummary));
  }
  return (rows || []).map((row) => redactListing(row, { viewerUserId, viewerRole }));
}

async function hydrateListingSummary(row) {
  if (!row.client_id || !['open', 'requested'].includes(row.status)) return row;
  const client = await Client.findById(row.client_id);
  if (!client || Number(client.agency_id) !== Number(row.agency_id)) return row;
  const saved = await loadClientExchangeSummary({ client });
  const preferences = parseJsonColumn(row.preferences_json) || {};
  const summary = mergeExchangeSummary(saved, {
    presentingProblems: preferences.additionalPresentingProblems ?? (saved.presentingProblems.length ? [] : parseJsonColumn(row.presenting_problems_json)),
    preferences,
    demographics: parseJsonColumn(row.demographics_json)
  });
  summary.preferences.presentingProblemSource = saved.presentingProblemSource;
  summary.preferences.presentingProblemUpdatedAt = saved.presentingProblemUpdatedAt;
  row.diagnoses_json = summary.diagnoses;
  row.presenting_problems_json = summary.presentingProblems;
  row.demographics_json = summary.demographics;
  row.preferences_json = summary.preferences;
  return row;
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
  await hydrateListingSummary(row);
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
  notes = null,
  onlyUnassigned = false
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

  preferences = safeJson(preferences);
  if (preferences?.schedule != null) preferences = { ...preferences, schedule: normalizeExchangeSchedule(preferences.schedule) };
  const savedSummary = await loadClientExchangeSummary({ client });
  const sharedSummary = mergeExchangeSummary(savedSummary, {
    demographics: safeJson(demographics), preferences: safeJson(preferences),
    presentingProblems: safeJson(presentingProblems), diagnoses: safeJson(diagnoses)
  });
  sharedSummary.preferences.additionalPresentingProblems = summaryItems(presentingProblems);
  sharedSummary.preferences.presentingProblemSource = savedSummary.presentingProblemSource;
  sharedSummary.preferences.presentingProblemUpdatedAt = savedSummary.presentingProblemUpdatedAt;
  ({ demographics, preferences, presentingProblems, diagnoses } = sharedSummary);

  const inserted = await insertExchangeListing({ agencyId: aid, clientId: cid, postedByUserId: posterId,
    summary: sharedSummary, notes, onlyUnassigned });
  const result = { insertId: inserted.listingId };
  const resolvedCurrentProvider = inserted.currentProviderId;
  if (!inserted.created) {
    const listing = await getListingById(inserted.listingId, { viewerUserId: posterId, viewerRole: 'admin' });
    return { ...listing, alreadyPosted: true };
  }

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

  // Announce into the Office Available smart group (replaces Google Chat referral routing).
  try {
    const SmartGroups = await import('./smartChatGroups.service.js');
    const previewBits = ['A new referral is available. Open Client Exchange to review it.'];
    await SmartGroups.announceClientExchangeListing({
      agencyId: aid,
      listingId: result.insertId,
      postedByUserId: posterId,
      preview: previewBits.join(' · ') || null
    });
  } catch (e) {
    console.warn('[createListing] Office Available chat announce failed:', e?.message || e);
  }

  const listing = await getListingById(result.insertId, { viewerUserId: posterId, viewerRole: 'admin' });
  try {
    listing.notifications = await notifyExchangeMatches({ listing, client });
  } catch (error) {
    console.error('[clientExchange] Match notification setup failed', { listingId: listing.id, error: error?.message });
    listing.notifications = { matched: 0, sent: 0, queued: 0, skipped: 0, failed: 1 };
  }
  return listing;
}

export async function withdrawListing({ listingId, actingUserId }) {
  await withdrawExchangeListing({ listingId, actingUserId });
  return getListingById(listingId, { viewerUserId: actingUserId, viewerRole: 'admin' });
}

export async function createRequest({ listingId, requestingProviderUserId, message = null }) {
  const { requestId, listing } = await createExchangeClaim({ listingId, requestingProviderUserId, message });
  await notifyExchangeClaim({ listing, requestingProviderUserId }).catch(error => {
    console.error('[clientExchange] Request notification failed', { listingId, error: error?.message });
  });
  return getRequestById(requestId);
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
export async function resolveRequest(options) {
  const { listing, request } = await resolveExchangeClaim(options);
  if (options.action === 'approve') {
    await notifyExchangeAssignment({ listing, request, actingUserId: options.actingUserId }).catch(error => {
      console.error('[clientExchange] Assignment notification failed', { listingId: listing.id, error: error?.message });
    });
  }
  return getRequestById(options.requestId);
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
              c.adaptive_intake_meta_json, c.created_at, c.date_of_birth,
              c.created_via_dev_fill
       FROM clients c
       ${baseWhere}`,
      [aid, ...OFFICE_CLIENT_TYPES]
    );
    rows = r;
  } catch (err) {
    if (!/Unknown column|adaptive_intake_meta|created_via_dev_fill/i.test(String(err?.message || ''))) throw err;
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
    dateOfBirth: row.date_of_birth || null,
    createdViaDevFill: Number(row.created_via_dev_fill) === 1
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
  const middleName = String(payload.middleName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const fullName = String(payload.fullName || [firstName, middleName, lastName].filter(Boolean).join(' ')).trim();
  if (!fullName) throw new Error('Name is required');
  const contactPhone = String(payload.contactPhone || payload.phone || '').trim() || null;
  const rawDob = String(payload.dateOfBirth || payload.birthdate || '').trim();
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(rawDob) ? rawDob : null;
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

  const street = String(payload.addressStreet || homeAddress || '').trim() || null;
  const apt = String(payload.addressApt || '').trim() || null;
  const city = String(payload.addressCity || '').trim() || null;
  const state = String(payload.addressState || '').trim() || null;
  const zip = String(payload.addressZip || '').trim() || null;
  if (street || city || state || zip) {
    await pool.execute(
      `UPDATE clients
       SET address_street = COALESCE(?, address_street),
           address_apt = COALESCE(?, address_apt),
           address_city = COALESCE(?, address_city),
           address_state = COALESCE(?, address_state),
           address_zip = COALESCE(?, address_zip)
       WHERE id = ?`,
      [street, apt, city, state, zip, client.id]
    ).catch(async () => {
      if (street) {
        await pool.execute(`UPDATE clients SET address_street = ? WHERE id = ?`, [street, client.id]).catch(() => null);
      }
    });
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
