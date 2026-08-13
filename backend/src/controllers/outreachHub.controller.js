import {
  listOutreachSchools,
  getOutreachSchool,
  updateOutreachSchool,
  logOutreachActivity,
  getOutreachSummary,
  listOutreachTimeline,
  listOutreachSchoolOnboarding,
  sendOutreachSchoolOnboarding,
  addOutreachSchoolNote,
  addOutreachSchoolContact,
  previewTripStops,
  listOutreachTrips,
  getOutreachTrip,
  createOutreachTrip,
  completeOutreachTrip,
  backfillOutreachSchoolGeocodes
} from '../services/outreachHub.service.js';
import {
  ensureOutreachTaskList,
  listOutreachSchoolTasks,
  createOutreachSchoolTask
} from '../services/outreachHubTasks.service.js';

function agencyIdFrom(req) {
  return Number(req.query?.agencyId || req.body?.agencyId || req.headers['x-agency-id'] || req.user?.agencyId || 0) || 0;
}

function handleServiceError(res, err) {
  const msg = String(err?.message || 'Request failed');
  if (/invalid|must be/i.test(msg)) {
    return res.status(400).json({ error: { message: msg } });
  }
  if (/not found/i.test(msg)) {
    return res.status(404).json({ error: { message: msg } });
  }
  throw err;
}

export const listSchools = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const schools = await listOutreachSchools(agencyId, {
      district: req.query.district,
      stage: req.query.stage,
      level: req.query.level,
      q: req.query.q,
      sort: req.query.sort,
      sortDir: req.query.sortDir || req.query.sort_dir
    });
    res.json({ schools });
  } catch (err) {
    next(err);
  }
};

export const geocodeSchoolAddresses = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const limit = Math.min(Math.max(Number(req.body?.limit || req.query?.limit || 50), 1), 100);
    const result = await backfillOutreachSchoolGeocodes(agencyId, { limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getSummary = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const summary = await getOutreachSummary(agencyId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

export const getSchool = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await getOutreachSchool(agencyId, schoolId);
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    res.json({ school });
  } catch (err) {
    next(err);
  }
};

export const patchSchool = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await updateOutreachSchool(agencyId, schoolId, req.body || {});
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    res.json({ school });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const createActivity = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const result = await logOutreachActivity(agencyId, schoolId, req.body || {}, req.user?.id);
    res.status(201).json(result);
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const getTimeline = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const activities = await listOutreachTimeline(agencyId, {
      contactType: req.query.contactType || req.query.contact_type,
      from: req.query.from,
      to: req.query.to
    });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
};

export const getTaskList = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const list = await ensureOutreachTaskList({ agencyId, actorUserId: req.user?.id || null });
    res.json({ list });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const listSchoolTasks = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await getOutreachSchool(agencyId, schoolId);
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    const list = await ensureOutreachTaskList({ agencyId, actorUserId: req.user?.id || null });
    const tasks = await listOutreachSchoolTasks(agencyId, schoolId);
    res.json({ tasks, list });
  } catch (err) {
    next(err);
  }
};

export const createSchoolTask = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const task = await createOutreachSchoolTask({
      agencyId,
      schoolId,
      actorUserId: req.user?.id || null,
      title: req.body?.title,
      description: req.body?.description,
      dueDate: req.body?.dueDate || req.body?.due_date || null,
      assignedToUserId: req.body?.assignedToUserId ?? req.body?.assigned_to_user_id ?? null,
      urgency: req.body?.urgency
    });
    res.status(201).json({ task });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const listSchoolOnboarding = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await getOutreachSchool(agencyId, schoolId);
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    const invites = await listOutreachSchoolOnboarding(agencyId, schoolId);
    res.json({ invites });
  } catch (err) {
    next(err);
  }
};

export const sendSchoolOnboarding = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const result = await sendOutreachSchoolOnboarding({
      agencyId,
      schoolId,
      actorUserId: req.user?.id || null,
      contactFirstName: req.body?.contactFirstName,
      contactLastName: req.body?.contactLastName,
      contactEmail: req.body?.contactEmail,
      sendEmail: req.body?.sendEmail !== false,
      priorSchoolDecision: req.body?.priorSchoolDecision || null,
      resetPassword: req.body?.resetPassword === true,
      confirmExistingSchoolStaff: req.body?.confirmExistingSchoolStaff === true
    });
    res.status(201).json(result);
  } catch (err) {
    if (err?.status === 409) {
      return res.status(409).json({
        error: {
          message: err.message,
          code: err.code || undefined,
          details: err.details || undefined
        }
      });
    }
    handleServiceError(res, err);
  }
};

export const addSchoolNote = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await addOutreachSchoolNote(agencyId, schoolId, req.body?.body || req.body?.notes, req.user?.id);
    res.status(201).json({ school });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const addSchoolContact = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const school = await addOutreachSchoolContact(agencyId, schoolId, req.body || {}, req.user?.id);
    res.status(201).json({ school });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const previewTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const excludeRaw = req.body?.excludeIds || req.query?.excludeIds || [];
    const excludeIds = Array.isArray(excludeRaw)
      ? excludeRaw
      : String(excludeRaw).split(',').map((s) => Number(s)).filter(Boolean);
    const data = await previewTripStops(agencyId, {
      originSchoolId: req.body?.originSchoolId || req.query?.originSchoolId || null,
      excludeIds,
      useDriving: req.body?.useDriving === true || req.query?.useDriving === 'true'
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const listTrips = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const trips = await listOutreachTrips(agencyId);
    res.json({ trips });
  } catch (err) {
    next(err);
  }
};

export const getTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const tripId = Number(req.params.tripId || 0);
    if (!agencyId || !tripId) return res.status(400).json({ error: { message: 'agencyId and trip id are required' } });
    const trip = await getOutreachTrip(agencyId, tripId);
    if (!trip) return res.status(404).json({ error: { message: 'Trip not found' } });
    res.json({ trip });
  } catch (err) {
    next(err);
  }
};

export const createTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const trip = await createOutreachTrip(agencyId, req.body || {}, req.user?.id);
    res.status(201).json({ trip });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const completeTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const tripId = Number(req.params.tripId || 0);
    if (!agencyId || !tripId) return res.status(400).json({ error: { message: 'agencyId and trip id are required' } });
    const trip = await completeOutreachTrip(agencyId, tripId, req.body || {}, req.user?.id);
    res.json({ trip });
  } catch (err) {
    handleServiceError(res, err);
  }
};
