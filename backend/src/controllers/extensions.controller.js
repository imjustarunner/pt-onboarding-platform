import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import UserExtension from '../models/UserExtension.model.js';

async function assertAgencyAccess(req, agencyId, { requireAdmin = false } = {}) {
  const aid = parseInt(agencyId, 10);
  if (!aid) throw Object.assign(new Error('Invalid agencyId'), { status: 400 });
  const agency = await Agency.findById(aid);
  if (!agency) throw Object.assign(new Error('Agency not found'), { status: 404 });
  const role = req.user?.role;
  if (role === 'super_admin' || role === 'admin' || role === 'support') {
    return agency;
  }
  if (requireAdmin) {
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  }
  const agencies = await User.getAgencies(req.user.id);
  const hasAccess = (agencies || []).some((a) => Number(a?.id) === aid);
  if (!hasAccess) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  return agency;
}

export const listMyExtensions = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const extensions = await UserExtension.listByUserId(userId);
    res.json(extensions);
  } catch (e) {
    next(e);
  }
};

export const listByAgency = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    await assertAgencyAccess(req, agencyId);
    const extensions = await UserExtension.listByAgency(agencyId);
    res.json(extensions);
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const { agencyId, userId, extension, numberId } = req.body || {};
    const aid = parseInt(agencyId, 10);
    const uid = parseInt(userId, 10);
    if (!aid || !uid) {
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    const ext = String(extension || '').trim();
    if (!ext) {
      return res.status(400).json({ error: { message: 'extension is required' } });
    }

    await assertAgencyAccess(req, aid, { requireAdmin: true });
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const agencies = await User.getAgencies(uid);
    if (!(agencies || []).some((a) => Number(a?.id) === aid)) {
      return res.status(400).json({ error: { message: 'User is not in this agency' } });
    }

    if (numberId) {
      const num = await TwilioNumber.findById(parseInt(numberId, 10));
      if (!num || Number(num.agency_id) !== aid) {
        return res.status(400).json({ error: { message: 'numberId is invalid for this agency' } });
      }
    }

    const record = await UserExtension.create({
      agencyId: aid,
      userId: uid,
      extension: ext,
      numberId: numberId ? parseInt(numberId, 10) : null
    });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const existing = await UserExtension.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Extension not found' } });

    await assertAgencyAccess(req, existing.agency_id, { requireAdmin: true });

    const { extension, numberId, isActive } = req.body || {};
    const patch = {};
    if (extension !== undefined) patch.extension = extension;
    if (numberId !== undefined) patch.numberId = numberId;
    if (isActive !== undefined) patch.isActive = isActive;

    const updated = await UserExtension.update(id, patch);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });

    const existing = await UserExtension.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Extension not found' } });

    await assertAgencyAccess(req, existing.agency_id, { requireAdmin: true });

    await UserExtension.deactivate(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
