import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware.js';
import { verifySchoolVisitChangeToken } from '../utils/schoolVisitChangeToken.js';
import { loadSchoolVisit, publicSchoolVisit, canManageSchoolVisit, requestSchoolVisitChange, schoolVisitManagerData, manageSchoolVisit } from '../services/schoolVisitManagement.service.js';

export const publicRouter = express.Router();
export const staffRouter = express.Router();
const handle = fn => async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); await fn(req, res); }
  catch (error) { if (error.status) res.status(error.status).json({ error: { message: error.message } }); else next(error); }
};
publicRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
publicRouter.get('/:token', handle(async (req, res) => {
  const booking = await loadSchoolVisit(verifySchoolVisitChangeToken(req.params.token));
  res.json({ visit: publicSchoolVisit(booking) });
}));
publicRouter.post('/:token/change-requests', handle(async (req, res) => {
  const result = await requestSchoolVisitChange(verifySchoolVisitChangeToken(req.params.token), req.body);
  res.status(result.alreadyPending ? 200 : 201).json({ ...result, message: 'Your request is with the Schools team. Your appointment stays as currently arranged until Rachel confirms a change.' });
}));
staffRouter.get('/:bookingId', authenticate, handle(async (req, res) => {
  const booking = await loadSchoolVisit(Number(req.params.bookingId));
  if (!(await canManageSchoolVisit(req.user, booking))) return res.status(403).json({ error: { message: 'You cannot manage this school visit.' } });
  res.json(await schoolVisitManagerData(booking.id));
}));
staffRouter.post('/:bookingId', authenticate, handle(async (req, res) => {
  res.json(await manageSchoolVisit(Number(req.params.bookingId), req.body, req.user));
}));
