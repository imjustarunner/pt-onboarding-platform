import pool from '../config/database.js';
import User from '../models/User.model.js';
import * as ClientExchange from '../services/clientExchange.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

function isBackoffice(role) {
  return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
}

/** Mirrors the agencyId-in-params/body/query access check used across other admin panels. */
async function assertAgencyAccess(req, agencyId) {
  const user = req.user;
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'super_admin') return true;
  const ua = user.agencies || user.userAgencies || [];
  if (Array.isArray(ua) && ua.some((a) => Number(a.id || a.agency_id) === Number(agencyId))) {
    return true;
  }
  if (Number(user.agencyId) === Number(agencyId)) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, agencyId]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

/** GET /api/client-exchange/listings?agencyId=&status= */
export async function listListings(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const listings = await ClientExchange.listListings({
      agencyId,
      status: req.query.status || null,
      viewerUserId: req.user.id,
      viewerRole: req.user.role
    });
    res.json({ listings });
  } catch (e) {
    next(e);
  }
}

/** GET /api/client-exchange/listings/:id */
export async function getListing(req, res, next) {
  try {
    const listingId = safeInt(req.params.id);
    if (!listingId) return res.status(400).json({ error: { message: 'Invalid listing id' } });
    const listing = await ClientExchange.getListingById(listingId, {
      viewerUserId: req.user.id,
      viewerRole: req.user.role
    });
    if (!listing) return res.status(404).json({ error: { message: 'Listing not found' } });
    if (!(await assertAgencyAccess(req, listing.agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const requests = await ClientExchange.listRequestsForListing(listingId, {
      viewerUserId: req.user.id,
      viewerRole: req.user.role
    });
    res.json({ listing, requests });
  } catch (e) {
    next(e);
  }
}

/** POST /api/client-exchange/listings */
export async function createListing(req, res, next) {
  try {
    const agencyId = safeInt(req.body?.agencyId);
    const clientId = safeInt(req.body?.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const listing = await ClientExchange.createListing({
      agencyId,
      clientId,
      postedByUserId: req.user.id,
      currentProviderUserId: req.body?.currentProviderUserId ? safeInt(req.body.currentProviderUserId) : undefined,
      demographics: req.body?.demographics,
      presentingProblems: req.body?.presentingProblems,
      diagnoses: req.body?.diagnoses,
      preferences: req.body?.preferences,
      notes: req.body?.notes
    });
    res.status(201).json({ listing });
  } catch (e) {
    const msg = e?.message || 'Failed to create listing';
    if (/not found|already belongs|already has an open listing|does not belong/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** POST /api/client-exchange/listings/:id/withdraw */
export async function withdrawListing(req, res, next) {
  try {
    const listingId = safeInt(req.params.id);
    if (!listingId) return res.status(400).json({ error: { message: 'Invalid listing id' } });
    const raw = await ClientExchange.getListingById(listingId, { viewerUserId: req.user.id, viewerRole: 'admin' });
    if (!raw) return res.status(404).json({ error: { message: 'Listing not found' } });
    if (!(await assertAgencyAccess(req, raw.agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const uid = Number(req.user.id);
    const canWithdraw =
      isBackoffice(req.user.role) || uid === raw.postedByUserId || uid === raw.currentProviderUserId;
    if (!canWithdraw) {
      return res.status(403).json({ error: { message: 'Only the poster, current provider, or admin/support can withdraw this listing' } });
    }
    const listing = await ClientExchange.withdrawListing({ listingId, actingUserId: req.user.id });
    res.json({ listing });
  } catch (e) {
    const msg = e?.message || 'Failed to withdraw listing';
    if (/not found|Only open listings/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** POST /api/client-exchange/listings/:id/requests */
export async function createRequest(req, res, next) {
  try {
    const listingId = safeInt(req.params.id);
    if (!listingId) return res.status(400).json({ error: { message: 'Invalid listing id' } });
    const raw = await ClientExchange.getListingById(listingId, { viewerUserId: req.user.id, viewerRole: 'admin' });
    if (!raw) return res.status(404).json({ error: { message: 'Listing not found' } });
    if (!(await assertAgencyAccess(req, raw.agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const request = await ClientExchange.createRequest({
      listingId,
      requestingProviderUserId: req.user.id,
      message: req.body?.message || null
    });
    res.status(201).json({ request });
  } catch (e) {
    const msg = e?.message || 'Failed to request listing';
    if (/not found|no longer accepting|already have a pending|already the current provider/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** GET /api/client-exchange/my-requests?agencyId= */
export async function listMyRequests(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const requests = await ClientExchange.listMyRequests({ agencyId, requestingProviderUserId: req.user.id });
    res.json({ requests });
  } catch (e) {
    next(e);
  }
}

async function resolveRequestAction(req, res, next, action) {
  try {
    const requestId = safeInt(req.params.id);
    if (!requestId) return res.status(400).json({ error: { message: 'Invalid request id' } });

    const [rows] = await pool.execute(
      `SELECT r.id, r.status, l.id AS listing_id, l.agency_id, l.current_provider_user_id
       FROM client_exchange_requests r
       JOIN client_exchange_listings l ON l.id = r.listing_id
       WHERE r.id = ?
       LIMIT 1`,
      [requestId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Request not found' } });
    if (!(await assertAgencyAccess(req, row.agency_id))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const uid = Number(req.user.id);
    const canResolve = isBackoffice(req.user.role) || uid === Number(row.current_provider_user_id || 0);
    if (!canResolve) {
      return res.status(403).json({ error: { message: 'Only the current provider or admin/support can resolve this request' } });
    }

    const request = await ClientExchange.resolveRequest({
      requestId,
      action,
      actingUserId: req.user.id,
      denialReason: req.body?.denialReason || null
    });
    res.json({ request });
  } catch (e) {
    const msg = e?.message || 'Failed to resolve request';
    if (/not found|already been resolved|action must be/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/** POST /api/client-exchange/requests/:id/approve */
export async function approveRequest(req, res, next) {
  return resolveRequestAction(req, res, next, 'approve');
}

/** POST /api/client-exchange/requests/:id/deny */
export async function denyRequest(req, res, next) {
  return resolveRequestAction(req, res, next, 'deny');
}

/** GET /api/client-exchange/pending-office-clients?agencyId= — support/admin new-client queue */
export async function listPendingOfficeClients(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const requestingUser = await User.findById(req.user.id);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    if (!isBackoffice(req.user.role) && !isSupervisor) {
      return res.status(403).json({ error: { message: 'Support/admin access required' } });
    }
    const clients = await ClientExchange.listPendingOfficeClients({ agencyId });
    res.json({ clients });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/client-exchange/acceptance-metrics?agencyId=&providerUserId=
 * Office referral acceptance: declined if posted to Client Exchange within 30 days of assignment.
 */
export async function getAcceptanceMetrics(req, res, next) {
  try {
    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = isBackoffice(role);
    let providerUserId = safeInt(req.query.providerUserId);

    if (!isAdmin) {
      // Providers may only see their own acceptance metrics.
      providerUserId = safeInt(req.user.id);
    }

    const OfficeAcceptance = await import('../services/officeClientAcceptance.service.js');
    const windowDays = safeInt(req.query.windowDays) || OfficeAcceptance.WINDOW_DAYS;
    const data = await OfficeAcceptance.getAcceptanceMetrics({
      agencyId,
      providerUserId: providerUserId || null,
      windowDays,
    });

    if (!isAdmin && providerUserId) {
      const mine = data.providers.find((p) => Number(p.providerUserId) === Number(providerUserId));
      return res.json({
        windowDays: data.windowDays,
        provider: mine || {
          providerUserId,
          assignedCount: 0,
          acceptedCount: 0,
          declinedCount: 0,
          pendingCount: 0,
          acceptanceRatio: null,
          acceptanceLabel: 'No office referrals yet',
          events: [],
        },
      });
    }

    res.json(data);
  } catch (e) {
    next(e);
  }
}

// ─── Public digital intake ──────────────────────────────────────────────────

/** GET /api/public/office-intake/:agencySlug */
export async function publicOfficeIntakeInfo(req, res, next) {
  try {
    const agency = await ClientExchange.getPublicOfficeIntakeAgency(req.params.agencySlug);
    if (!agency) return res.status(404).json({ error: { message: 'Organization not found' } });
    let branding = null;
    try {
      const {
        buildPublicFormBranding,
        requestBaseUrl
      } = await import('../services/publicFormBranding.service.js');
      branding = await buildPublicFormBranding({
        organization: agency,
        agency,
        baseUrl: requestBaseUrl(req)
      });
    } catch {
      branding = null;
    }
    res.json({ agency, branding });
  } catch (e) {
    next(e);
  }
}

/** POST /api/public/office-intake/:agencySlug */
export async function publicOfficeIntakeCreate(req, res, next) {
  try {
    const { client } = await ClientExchange.createPublicOfficeIntakeClient({
      agencySlugOrId: req.params.agencySlug,
      payload: req.body || {}
    });
    res.status(201).json({
      ok: true,
      confirmation: {
        identifierCode: client.identifier_code,
        submittedAt: client.created_at || new Date().toISOString()
      }
    });
  } catch (e) {
    const msg = e?.message || 'Failed to submit intake';
    if (/Organization not found|Name is required/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}
