import {
  getPublicDistrictSchedule,
  listPublicDistrictDirectory
} from '../services/publicDistrictSchedule.service.js';

export const getPublicDistrictScheduleDirectory = async (req, res, next) => {
  try {
    const data = await listPublicDistrictDirectory(req.params.agencySlug, req);
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};

export const getPublicDistrictScheduleView = async (req, res, next) => {
  try {
    const data = await getPublicDistrictSchedule(
      req.params.agencySlug,
      req.params.districtSlug,
      req
    );
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: { message: err.message } });
    next(err);
  }
};
