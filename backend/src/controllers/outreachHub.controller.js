import {
  listOutreachSchools,
  getOutreachSchool,
  updateOutreachSchool,
  createOutreachLocation,
  logOutreachActivity,
  updateOutreachActivity,
  getOutreachSummary,
  listOutreachTimeline,
  listOutreachSchoolOnboarding,
  sendOutreachSchoolOnboarding,
  addOutreachSchoolNote,
  addOutreachSchoolContact,
  updateOutreachSchoolContact,
  deleteOutreachSchoolContact,
  previewTripStops,
  listOutreachTrips,
  getOutreachTrip,
  createOutreachTrip,
  updateOutreachTrip,
  deleteOutreachTrip,
  completeOutreachTrip,
  updateOutreachTripStopAttendance,
  backfillOutreachSchoolGeocodes,
  lookupOutreachSchoolAddress,
  previewHistoricalOutreachImport,
  importHistoricalOutreachRows,
  syncExistingSchoolStaffToOutreachContacts,
  listOutreachAssignableUsers
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
  if (/cannot be (edited|deleted)/i.test(msg)) {
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
      locationType: req.query.locationType || req.query.location_type || req.query.type,
      q: req.query.q,
      needsAddress: req.query.needsAddress || req.query.needs_address,
      charterOnly: req.query.charterOnly === 'true' || req.query.charter === '1' || req.query.charter === 'true',
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

export const lookupSchoolAddress = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    if (!agencyId || !schoolId) return res.status(400).json({ error: { message: 'agencyId and school id are required' } });
    const result = await lookupOutreachSchoolAddress(agencyId, schoolId);
    res.json(result);
  } catch (err) {
    handleServiceError(res, err);
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

export const createSchool = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const school = await createOutreachLocation(agencyId, req.body || {});
    res.status(201).json({ school });
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

export const patchActivity = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    const activityId = Number(req.params.activityId || 0);
    if (!agencyId || !schoolId || !activityId) {
      return res.status(400).json({ error: { message: 'agencyId, school id, and activity id are required' } });
    }
    const school = await updateOutreachActivity(agencyId, schoolId, activityId, req.body || {}, req.user?.id);
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    res.json({ school, activityId });
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

export const getAssignableUsers = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const users = await listOutreachAssignableUsers(agencyId);
    res.json({ users });
  } catch (err) {
    next(err);
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
      urgency: req.body?.urgency,
      tripId: req.body?.tripId || req.body?.trip_id || req.body?.outreachTripId || null
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
    const payload = {
      ...(req.body || {}),
      body: req.body?.body || req.body?.notes
    };
    const school = await addOutreachSchoolNote(agencyId, schoolId, payload, req.user?.id);
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

export const patchSchoolContact = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    const contactId = Number(req.params.contactId || 0);
    if (!agencyId || !schoolId || !contactId) {
      return res.status(400).json({ error: { message: 'agencyId, school id, and contact id are required' } });
    }
    const school = await updateOutreachSchoolContact(agencyId, schoolId, contactId, req.body || {});
    res.json({ school });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const removeSchoolContact = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const schoolId = Number(req.params.id || 0);
    const contactId = Number(req.params.contactId || 0);
    if (!agencyId || !schoolId || !contactId) {
      return res.status(400).json({ error: { message: 'agencyId, school id, and contact id are required' } });
    }
    const school = await deleteOutreachSchoolContact(agencyId, schoolId, contactId);
    res.json({ school });
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
      secondSchoolId: req.body?.secondSchoolId || req.query?.secondSchoolId || null,
      excludeIds,
      useDriving: req.body?.useDriving === true || req.query?.useDriving === 'true',
      charterOnly: req.body?.charterOnly === true
        || req.body?.charterOnly === 1
        || req.query?.charterOnly === 'true'
        || req.query?.charter === '1'
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

export const updateTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const tripId = Number(req.params.tripId || 0);
    if (!agencyId || !tripId) return res.status(400).json({ error: { message: 'agencyId and trip id are required' } });
    const trip = await updateOutreachTrip(agencyId, tripId, req.body || {}, req.user?.id);
    res.json({ trip });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const deleteTrip = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const tripId = Number(req.params.tripId || 0);
    if (!agencyId || !tripId) return res.status(400).json({ error: { message: 'agencyId and trip id are required' } });
    const result = await deleteOutreachTrip(agencyId, tripId, req.user?.id);
    res.json(result);
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

export const patchTripStop = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const tripId = Number(req.params.tripId || 0);
    const stopId = Number(req.params.stopId || 0);
    if (!agencyId || !tripId || !stopId) {
      return res.status(400).json({ error: { message: 'agencyId, trip id, and stop id are required' } });
    }
    const trip = await updateOutreachTripStopAttendance(agencyId, tripId, stopId, req.body || {}, req.user?.id);
    res.json({ trip });
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const previewHistoricalImport = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const districtIncludes = String(req.body?.districtIncludes || 'denver public');
    const preview = await previewHistoricalOutreachImport(agencyId, rows, { districtIncludes });
    res.json(preview);
  } catch (err) {
    next(err);
  }
};

export const runHistoricalImport = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const districtIncludes = String(req.body?.districtIncludes || 'denver public');
    const dryRun = req.body?.dryRun === true;
    const result = await importHistoricalOutreachRows(agencyId, rows, req.user?.id, { districtIncludes, dryRun });
    res.json(result);
  } catch (err) {
    handleServiceError(res, err);
  }
};

export const syncStaffContacts = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const result = await syncExistingSchoolStaffToOutreachContacts(agencyId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
