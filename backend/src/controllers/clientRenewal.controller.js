import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import * as ClientRenewal from '../services/clientRenewal.service.js';

function isBackofficeManager(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(normalized);
}

async function requireManagedClient(req, clientId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) {
    return { ok: false, status: 404, message: 'Client not found' };
  }
  if (req.user?.role === 'super_admin') {
    return { ok: true, client };
  }
  const userAgencies = await User.getAgencies(req.user?.id);
  const hasAgencyAccess = (userAgencies || []).some(
    (agency) =>
      Number(agency?.id) === Number(client.agency_id)
      || Number(agency?.id) === Number(client.organization_id)
  );
  if (!hasAgencyAccess) {
    return { ok: false, status: 403, message: 'You do not have access to this client' };
  }
  return { ok: true, client };
}

/** GET /api/clients/:id/renewals */
export async function listClientRenewals(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = Number(req.query.agencyId || access.client.agency_id || 0) || null;
    const renewals = await ClientRenewal.getRenewalAdmin(clientId, agencyId);
    res.json({ client_id: clientId, renewals });
  } catch (e) {
    next(e);
  }
}

/** POST /api/clients/:id/renewals */
export async function createClientRenewal(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = Number(req.body?.agencyId || access.client.agency_id || 0);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const renewal = await ClientRenewal.createRenewal({
      agencyId,
      clientId,
      options: req.body || {},
      actorUserId: req.user?.id || null
    });

    const sendNow = req.body?.send === true || req.body?.sendNow === true;
    if (sendNow) {
      const sent = await ClientRenewal.sendRenewal(renewal.id, { actorUserId: req.user?.id || null });
      return res.status(201).json({ ok: true, ...sent });
    }

    res.status(201).json({ ok: true, renewal });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({
        error: { message: e.message, qualityFlags: e.qualityFlags || undefined }
      });
    }
    next(e);
  }
}

/** POST /api/clients/:id/renewals/:renewalId/send */
export async function sendClientRenewal(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    const renewalId = Number(req.params.renewalId || 0);
    if (!clientId || !renewalId) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const renewals = await ClientRenewal.getRenewalAdmin(clientId, access.client.agency_id);
    const owned = (renewals || []).some((r) => Number(r.id) === renewalId);
    if (!owned) {
      return res.status(404).json({ error: { message: 'Renewal not found for this client' } });
    }

    const result = await ClientRenewal.sendRenewal(renewalId, {
      actorUserId: req.user?.id || null
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({
        error: { message: e.message, qualityFlags: e.qualityFlags || undefined }
      });
    }
    next(e);
  }
}
