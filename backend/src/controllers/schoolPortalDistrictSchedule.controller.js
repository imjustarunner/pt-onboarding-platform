import {
  listDistrictScheduleLinks,
  hideDistrictScheduleSchool,
  unhideDistrictScheduleSchool,
  hideDistrictScheduleProvider,
  unhideDistrictScheduleProvider,
  clearDistrictScheduleHides,
  listDistrictScheduleHides,
  actorCanManageDistrictScheduleVisibility,
} from '../services/publicDistrictSchedule.service.js';

export const listDistrictScheduleLinksForAgency = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query?.agencyId || req.body?.agencyId, 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const data = await listDistrictScheduleLinks(agencyId, req);
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

const handle = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: { message: err.message || 'Request failed' } });
    }
    next(err);
  }
};

export const getDistrictScheduleVisibility = handle(async (req) => {
  const agencyId = Number(req.query.agencyId || req.body?.agencyId || 0);
  const districtSlug = String(req.query.districtSlug || req.body?.districtSlug || '').trim();
  if (!agencyId || !districtSlug) {
    throw Object.assign(new Error('agencyId and districtSlug are required'), { status: 400 });
  }
  if (!(await actorCanManageDistrictScheduleVisibility(req.user, agencyId))) {
    throw Object.assign(new Error('Admin access required for this agency'), { status: 403 });
  }
  return listDistrictScheduleHides(agencyId, districtSlug);
});

export const hideDistrictScheduleSchoolHandler = handle(async (req) =>
  hideDistrictScheduleSchool(req.user, {
    agencyId: req.body?.agencyId,
    districtSlug: req.body?.districtSlug,
    schoolId: req.body?.schoolId || req.params.schoolId,
  })
);

export const unhideDistrictScheduleSchoolHandler = handle(async (req) =>
  unhideDistrictScheduleSchool(req.user, {
    agencyId: req.body?.agencyId,
    districtSlug: req.body?.districtSlug,
    schoolId: req.body?.schoolId || req.params.schoolId,
  })
);

export const hideDistrictScheduleProviderHandler = handle(async (req) =>
  hideDistrictScheduleProvider(req.user, {
    agencyId: req.body?.agencyId,
    districtSlug: req.body?.districtSlug,
    schoolId: req.body?.schoolId,
    providerId: req.body?.providerId || req.params.providerId,
  })
);

export const unhideDistrictScheduleProviderHandler = handle(async (req) =>
  unhideDistrictScheduleProvider(req.user, {
    agencyId: req.body?.agencyId,
    districtSlug: req.body?.districtSlug,
    schoolId: req.body?.schoolId,
    providerId: req.body?.providerId || req.params.providerId,
  })
);

export const clearDistrictScheduleHidesHandler = handle(async (req) =>
  clearDistrictScheduleHides(req.user, {
    agencyId: req.body?.agencyId,
    districtSlug: req.body?.districtSlug,
  })
);
