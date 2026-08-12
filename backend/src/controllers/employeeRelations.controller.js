import EmployeeServiceMilestone from '../models/EmployeeServiceMilestone.model.js';
import User from '../models/User.model.js';

function parseAgencyId(req) {
  const raw = req.query?.agencyId ?? req.body?.agencyId ?? req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function ensureAgencyAccess(req, agencyId) {
  if (!agencyId) {
    const err = new Error('Agency ID required');
    err.status = 400;
    throw err;
  }
  if (req.user?.role === 'super_admin') return true;

  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

export const listMilestones = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await ensureAgencyAccess(req, agencyId);
    const status = req.query?.status ? String(req.query.status) : null;
    const rows = await EmployeeServiceMilestone.listByAgency(agencyId, { status });
    res.json({ agencyId, milestones: rows });
  } catch (e) {
    next(e);
  }
};

export const syncFromStartDates = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await ensureAgencyAccess(req, agencyId);
    const result = await EmployeeServiceMilestone.syncFromStartDates(agencyId);
    res.json({ agencyId, ...result });
  } catch (e) {
    next(e);
  }
};

export const updateMilestone = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid milestone id' } });
    }
    const existing = await EmployeeServiceMilestone.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Milestone not found' } });
    }
    await ensureAgencyAccess(req, existing.agency_id);

    const updated = await EmployeeServiceMilestone.update(id, {
      status: req.body?.status,
      giftNotes: req.body?.giftNotes ?? req.body?.gift_notes,
      assignedToUserId: req.body?.assignedToUserId ?? req.body?.assigned_to_user_id
    });
    res.json({ milestone: updated });
  } catch (e) {
    next(e);
  }
};
