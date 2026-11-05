import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { loadChartSetupStatus } from '../services/chartSetupStatus.service.js';

const ALLOWED = new Set([
  'super_admin',
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant'
]);

export async function getClientChartSetup(req, res, next) {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (!ALLOWED.has(role)) return res.status(403).json({ error: { message: 'Access denied' } });
    const access = await resolveClientRecordAccess({ userId: req.user.id, role, clientId });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const status = await loadChartSetupStatus({ client: access.client, actorUserId: req.user.id });
    return res.json(status);
  } catch (error) {
    next(error);
  }
}
