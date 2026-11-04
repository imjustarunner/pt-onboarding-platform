import Client from '../models/Client.model.js';
import * as ClientUpdate from '../services/clientUpdate.service.js';
import pool from '../config/database.js';
import {resolveClientRecordAccess} from '../services/clientRecordAccess.service.js';

function isUpdaterStaff(role) {
  return ['super_admin', 'admin', 'support', 'staff'].includes(String(role || '').trim().toLowerCase());
}

async function requireManagedClient(req, clientId) {
  const access=await resolveClientRecordAccess({userId:req.user?.id,role:req.user?.role,clientId});
  if(!access.ok)return access;
  const client=access.client||await Client.findById(clientId,{includeSensitive:true});
  if (!client) return { ok: false, status: 404, message: 'Client not found' };
  if (req.user?.role === 'super_admin') return { ok: true, client };
  const [[member]]=await pool.execute(`SELECT ua.user_id FROM user_agencies ua JOIN users u ON u.id=ua.user_id
    WHERE ua.user_id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND u.terminated_at IS NULL AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','TERMINATED','TERMINATED_PENDING','INACTIVE','INACTIVE_EMPLOYEE') LIMIT 1`,[req.user.id,client.agency_id]);
  if(!member)return {ok:false,status:403,message:'Active agency backoffice access is required.'};
  return { ok: true, client };
}

function sendError(res, error, next) {
  if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
  return next(error);
}

export async function getClientUpdateCatalog(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const catalog = await ClientUpdate.listUpdateCatalog(access.client.agency_id);
    res.json({ client_id: clientId, ...catalog });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function listClientUpdates(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const updates = await ClientUpdate.listClientUpdates(clientId, access.client.agency_id);
    res.json({ client_id: clientId, updates });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function createClientUpdate(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const agencyId = Number(req.body?.agencyId || access.client.agency_id || 0);
    if (!agencyId || agencyId !== Number(access.client.agency_id)) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const request = await ClientUpdate.createClientUpdate({
      agencyId,
      clientId,
      body: req.body || {},
      actorUserId: req.user?.id || null
    });
    if (req.body?.send === true) {
      const sent = await ClientUpdate.sendClientUpdate(request.id, {
        actorUserId: req.user?.id || null,
        guardianEmail: req.body?.guardianEmail,
        guardianFirstName: req.body?.guardianFirstName,
        guardianLastName: req.body?.guardianLastName
      });
      return res.status(201).json({ ok: true, ...sent });
    }
    res.status(201).json({ ok: true, request });
  } catch (error) {
    sendError(res, error, next);
  }
}

export async function sendClientUpdate(req, res, next) {
  try {
    const clientId = Number(req.params.id || 0);
    const requestId = Number(req.params.requestId || 0);
    if (!clientId || !requestId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!isUpdaterStaff(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const updates = await ClientUpdate.listClientUpdates(clientId, access.client.agency_id);
    if (!(updates || []).some((row) => Number(row.id) === requestId)) {
      return res.status(404).json({ error: { message: 'Client update not found for this client' } });
    }
    const result = await ClientUpdate.sendClientUpdate(requestId, {
      actorUserId: req.user?.id || null,
      guardianEmail: req.body?.guardianEmail,
      guardianFirstName: req.body?.guardianFirstName,
      guardianLastName: req.body?.guardianLastName
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, next);
  }
}
