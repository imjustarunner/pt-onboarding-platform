import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

async function userCanAccessClient({ requestingUserId, requestingUserRole, client }) {
  if (requestingUserRole === 'super_admin') return true;
  const userAgencies = await User.getAgencies(requestingUserId);
  const userAgencyIds = userAgencies.map(a => a.id);
  return userAgencyIds.includes(client.agency_id) || userAgencyIds.includes(client.organization_id);
}

export const listClientPhiDocuments = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let docs = [];
    try {
      docs = await ClientPhiDocument.findByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.json([]);
      }
      throw e;
    }
    res.json(docs);
  } catch (e) {
    next(e);
  }
};

export const viewPhiDocument = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    let doc = null;
    try {
      doc = await ClientPhiDocument.findById(docId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'PHI documents feature not available (migration not run yet).' } });
      }
      throw e;
    }
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    // Log access (best-effort)
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;
      await pool.execute(
        `INSERT INTO phi_access_logs (user_id, client_id, document_id, action, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, doc.client_id, doc.id, 'view', ip, userAgent ? String(userAgent).slice(0, 512) : null]
      );
    } catch {
      // ignore
    }

    // Return a signed URL for the underlying object (do not expose via /uploads without auth)
    const url = await StorageService.getSignedUrl(doc.storage_path);
    res.json({ url });
  } catch (e) {
    next(e);
  }
};

