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
    // Keep eligibility fresh without requiring a manual sync after staff date edits.
    await EmployeeServiceMilestone.syncFromStartDates(agencyId);
    const [rows, definitions, dinners, missingStartDates, today] = await Promise.all([
      EmployeeServiceMilestone.listByAgency(agencyId, { status }),
      EmployeeServiceMilestone.definitions(agencyId),
      EmployeeServiceMilestone.dinners(agencyId),
      EmployeeServiceMilestone.missingStartDates(agencyId),
      EmployeeServiceMilestone.today(agencyId)
    ]);
    res.json({ agencyId, milestones: rows, definitions, dinners, missingStartDates, today });
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
      fulfilledOn: req.body?.fulfilledOn
    }, req.user.id);
    res.json({ milestone: updated });
  } catch (e) {
    next(e);
  }
};

export const saveGift = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await ensureAgencyAccess(req, agencyId);
    const definitions = await EmployeeServiceMilestone.saveDefinition(agencyId, Number(req.params.years), req.body);
    res.json({ definitions });
  } catch (e) { next(e); }
};

async function accessibleAward(req) {
  const row = await EmployeeServiceMilestone.findById(Number(req.params.id));
  if (!row) throw Object.assign(new Error('Award not found.'), { status: 404 });
  await ensureAgencyAccess(req, row.agency_id);
  return row;
}
export const listNotes = async (req, res, next) => {
  try {
    const row = await accessibleAward(req);
    res.json({ notes: await EmployeeServiceMilestone.notes(row.id) });
  } catch (e) { next(e); }
};
export const addNote = async (req, res, next) => {
  try {
    const row = await accessibleAward(req);
    res.json({ notes: await EmployeeServiceMilestone.addNote(row.id, req.body?.note, req.user.id) });
  } catch (e) { next(e); }
};
export const createDinner = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await ensureAgencyAccess(req, agencyId);
    const dinner = await EmployeeServiceMilestone.createDinner(agencyId, req.body, req.user.id);
    res.status(201).json({ dinner });
  } catch (e) { next(e); }
};
export const updateAttendance = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    await ensureAgencyAccess(req, agencyId);
    await EmployeeServiceMilestone.attendance(agencyId, Number(req.params.dinnerId), Number(req.params.id), req.body?.attendance, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
};
