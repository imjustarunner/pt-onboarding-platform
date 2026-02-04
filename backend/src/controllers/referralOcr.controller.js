import { validationResult } from 'express-validator';
import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ClientReferralOcr from '../models/ClientReferralOcr.model.js';
import User from '../models/User.model.js';

async function userCanAccessClient({ requestingUserId, requestingUserRole, client }) {
  if (requestingUserRole === 'super_admin') return true;
  const userAgencies = await User.getAgencies(requestingUserId);
  const userAgencyIds = userAgencies.map(a => a.id);
  return userAgencyIds.includes(client.agency_id) || userAgencyIds.includes(client.organization_id);
}

export const requestReferralOcr = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const clientId = parseInt(req.params.clientId, 10);
    const phiDocumentId = req.body?.phiDocumentId ? parseInt(req.body.phiDocumentId, 10) : null;
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let doc = null;
    if (phiDocumentId) {
      doc = await ClientPhiDocument.findById(phiDocumentId);
      if (!doc || doc.client_id !== clientId) {
        return res.status(404).json({ error: { message: 'PHI document not found for client' } });
      }
    } else {
      const docs = await ClientPhiDocument.findByClientId(clientId);
      doc = docs?.[0] || null;
    }

    if (!doc) {
      return res.status(404).json({ error: { message: 'No PHI document found for client' } });
    }

    if (doc.scan_status && doc.scan_status !== 'clean') {
      return res.status(409).json({ error: { message: 'Document has not passed security scanning yet.' } });
    }

    const request = await ClientReferralOcr.create({
      clientId,
      phiDocumentId: doc.id,
      requestedByUserId: req.user.id,
      status: 'queued'
    });

    res.status(201).json({ request });
  } catch (error) {
    next(error);
  }
};

export const listReferralOcrRequests = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const requests = await ClientReferralOcr.findByClientId(clientId);
    res.json({ requests });
  } catch (error) {
    next(error);
  }
};
