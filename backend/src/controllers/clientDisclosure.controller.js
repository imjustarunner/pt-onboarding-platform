import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import {
  getClientDisclosureStatus,
  upsertAgencyDisclosureSettings,
  loadAgencyDisclosureSettings
} from '../services/smartDisclosure.service.js';
import pool from '../config/database.js';

async function getSettings(agencyId, locale) {
  const loc = String(locale || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  try {
    const settings = await loadAgencyDisclosureSettings(agencyId, loc);
    return {
      locale: loc,
      terminology: settings.terminology || {},
      businessEntity: settings.businessEntity || {},
      regulatoryBoards: settings.regulatoryBoardOverrides || {},
      regulatoryBoardRows: settings.regulatoryBoardRows || []
    };
  } catch {
    return {
      locale: loc,
      terminology: {},
      businessEntity: {},
      regulatoryBoards: {},
      regulatoryBoardRows: []
    };
  }
}

async function ensureAgencyAccess(req, agencyId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const orgs = await User.getAgencies(req.user.id);
  return (orgs || []).some((o) => Number(o.id) === Number(agencyId));
}

export const getClientDisclosure = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'super_admin') {
      const ok = await ensureAgencyAccess(req, client.agency_id);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const status = await getClientDisclosureStatus(clientId);
    res.json(status);
  } catch (e) {
    next(e);
  }
};

export const requireClientDisclosure = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (role !== 'super_admin') {
      const ok = await ensureAgencyAccess(req, client.agency_id);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await pool.execute(`UPDATE clients SET disclosure_required = 1 WHERE id = ?`, [clientId]);
    const status = await getClientDisclosureStatus(clientId);
    res.json(status);
  } catch (e) {
    next(e);
  }
};

export const getAgencyDisclosureSettings = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (role !== 'super_admin') {
      const ok = await ensureAgencyAccess(req, agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const locale = req.query.locale || 'en';
    const settings = await getSettings(agencyId, locale);
    res.json(settings);
  } catch (e) {
    next(e);
  }
};

export const putAgencyDisclosureSettings = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['super_admin', 'admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (role !== 'super_admin') {
      const ok = await ensureAgencyAccess(req, agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const locale = req.body?.locale || 'en';
    await upsertAgencyDisclosureSettings({
      agencyId,
      locale,
      terminology: req.body?.terminology || null,
      businessEntity: req.body?.businessEntity || null,
      regulatoryBoards: req.body?.regulatoryBoards !== undefined ? req.body.regulatoryBoards : null,
      actorUserId: req.user?.id
    });
    const settings = await getSettings(agencyId, locale);
    res.json(settings);
  } catch (e) {
    next(e);
  }
};
