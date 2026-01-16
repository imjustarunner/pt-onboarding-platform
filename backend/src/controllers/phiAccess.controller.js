import pool from '../config/database.js';
import Client from '../models/Client.model.js';

/**
 * Create PHI access log entry.
 * POST /api/phi-access
 * Body: { clientId, resourceType, resourceId, acknowledgedWarning }
 */
export async function createPhiAccessLog(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    const clientId = req.body.clientId ?? req.body.client_id;
    const resourceType = String(req.body.resourceType ?? req.body.resource_type ?? '').trim();
    const resourceId = req.body.resourceId ?? req.body.resource_id ?? null;
    const acknowledgedWarning = !!(req.body.acknowledgedWarning ?? req.body.acknowledged_warning);

    if (!resourceType) {
      return res.status(400).json({ error: { message: 'resourceType is required' } });
    }

    let agencyId = req.body.agencyId ?? req.body.agency_id ?? null;
    let normalizedClientId = clientId ? parseInt(clientId, 10) : null;

    if (!agencyId && normalizedClientId) {
      const client = await Client.findById(normalizedClientId);
      if (!client) {
        return res.status(404).json({ error: { message: 'Client not found' } });
      }
      agencyId = client.agency_id;
    }

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required (or provide clientId)' } });
    }

    const ipAddress = req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim() || req.ip || null;
    const userAgent = req.headers['user-agent'] || null;

    const [result] = await pool.execute(
      `INSERT INTO phi_access_logs
       (agency_id, user_id, client_id, resource_type, resource_id, action, acknowledged_warning, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
      [
        parseInt(agencyId, 10),
        userId,
        normalizedClientId,
        resourceType,
        resourceId ? String(resourceId) : null,
        acknowledgedWarning ? 1 : 0,
        ipAddress,
        userAgent
      ]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (e) {
    next(e);
  }
}

