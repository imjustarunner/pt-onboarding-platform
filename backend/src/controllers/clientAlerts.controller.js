import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import {
  dismissClientAlert,
  listClientAlerts,
  listPendingClientAlerts,
  saveClientAlert
} from '../services/clientAlerts.service.js';
import { canSeeClientMessagesWindow, readClientAlertText } from '../utils/clientAlertText.js';

async function authorizeClientAlerts(req, clientId) {
  if (!canSeeClientMessagesWindow(req.user?.role)) {
    return { ok: false, status: 403, message: 'You do not have access to client alerts' };
  }
  const access = await resolveClientRecordAccess({
    userId: req.user?.id,
    role: req.user?.role,
    clientId
  });
  if (!access.ok) return { ok: false, status: access.status, message: access.message };
  return { ok: true, client: access.client };
}

function clientIdFrom(req) {
  const clientId = parseInt(req.params.id, 10);
  return Number.isFinite(clientId) && clientId > 0 ? clientId : 0;
}

export const listClientAlertsHandler = async (req, res, next) => {
  try {
    const clientId = clientIdFrom(req);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const access = await authorizeClientAlerts(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const alerts = await listClientAlerts(null, { clientId });
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
};

export const createClientAlertHandler = async (req, res, next) => {
  try {
    const clientId = clientIdFrom(req);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const access = await authorizeClientAlerts(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const parsed = readClientAlertText(req.body?.body ?? req.body?.message ?? req.body);
    if (!parsed.ok) return res.status(400).json({ error: { message: parsed.error } });
    if (!parsed.text) return res.status(400).json({ error: { message: 'Client alert text is required' } });
    const alert = await saveClientAlert(null, {
      clientId,
      body: parsed.text,
      createdByUserId: req.user.id
    });
    res.status(201).json({ alert });
  } catch (error) {
    next(error);
  }
};

export const listPendingClientAlertsHandler = async (req, res, next) => {
  try {
    const clientId = clientIdFrom(req);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const access = await authorizeClientAlerts(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const alerts = await listPendingClientAlerts(null, { clientId, userId: req.user.id });
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
};

export const dismissClientAlertHandler = async (req, res, next) => {
  try {
    const clientId = clientIdFrom(req);
    const alertId = parseInt(req.params.alertId, 10);
    if (!clientId || !alertId) return res.status(400).json({ error: { message: 'Invalid client alert' } });
    const access = await authorizeClientAlerts(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const result = await dismissClientAlert(null, { clientId, alertId, userId: req.user.id });
    if (!result.ok) return res.status(result.status).json({ error: { message: result.message } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
