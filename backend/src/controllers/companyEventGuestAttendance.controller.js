import { recordCompanyEventGuestAttendance, getCompanyEventGuestAttendance } from '../services/companyEventGuestAttendance.service.js';

const handler = (action) => async (req, res, next) => {
  try {
    res.json(await recordCompanyEventGuestAttendance({
      eventId: req.params.id, email: req.body?.email,
      managementToken: req.body?.managementToken, action
    }));
  } catch (error) { next(error); }
};
export const checkInCompanyEventGuest = handler('check-in');
export const checkOutCompanyEventGuest = handler('check-out');
export const getCompanyEventGuestAttendanceState = async (req, res, next) => {
  try { res.json(await getCompanyEventGuestAttendance({ eventId: req.params.id, email: req.body?.email, managementToken: req.body?.managementToken })); }
  catch (error) { next(error); }
};
