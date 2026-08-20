import { listDistrictScheduleLinks } from '../services/publicDistrictSchedule.service.js';

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
