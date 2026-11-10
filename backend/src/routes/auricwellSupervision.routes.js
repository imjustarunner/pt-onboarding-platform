import { supervisionActor } from '../services/auricwell/supervision.js';
import express from 'express';
import pool from '../config/database.js';
import { has, fail } from '../services/auricwell/policy.js';
import * as supervision from '../controllers/supervisionSessions.controller.js';
import { canJoinSupervision } from '../services/meetingJoinPolicy.service.js';
import { personalMeetingInvitation } from '../services/meetingInvitations.service.js';

// This adapter deliberately delegates all scheduling, authorization, attendance,
// finalization and hour-credit calculations to the existing supervision domain.
const router = express.Router();
router.use(async (req, res, next) => {
  try {
    const { user, agencyId, canManage, admin } = await supervisionActor(req.aw);
    for (const input of [req.query, req.body]) {
      if (input?.agencyId != null && Number(input.agencyId) !== agencyId) throw fail(403, 'Supervision is limited to this practice.');
      if (input?.allAgencies === 'true' || input?.allAgencies === true || input?.inviteAudienceAgencyIds?.some(id => Number(id) !== agencyId)) throw fail(403, 'Supervision is limited to this practice.');
    }
    req.auricwellSupervision = { agencyId, canManage, admin };
    req.user = user; req.query.agencyId = agencyId;
    if (req.body) req.body.agencyId = agencyId;
    req.supervisionAgencyId = agencyId;
    res.set('Cache-Control', 'no-store'); next();
  } catch (error) { next(error); }
});
const manage = (req, _res, next) => {
  if (!has(req.aw, 'supervise') && !has(req.aw, 'admin')) return next(fail(403, 'Supervision management permission is required.'));
  next();
};
router.param('id', async (req, _res, next, id) => {
  try {
    const [[session]] = await pool.execute('SELECT * FROM supervision_sessions WHERE id=? AND agency_id=?', [id, req.supervisionAgencyId]);
    if (!session) throw fail(404, 'Supervision session not found in this practice.');
    req.supervisionSession = session; next();
  } catch (error) { next(error); }
});
router.get('/context', (req, res) => res.json({ userId: req.user.id, agencyId: req.supervisionAgencyId, timeZone: req.aw.settings.timezone, canManage: has(req.aw, 'supervise') || has(req.aw, 'admin') }));
router.get('/sessions', supervision.getMySupervisionSessions);
router.get('/providers', manage, supervision.listSupervisionProviderCandidates);
router.get('/hours', (req, res, next) => { req.params.superviseeId = String(req.user.id); return supervision.getSuperviseeHoursSummary(req, res, next); });
router.get('/providers/:superviseeId/hours', manage, supervision.getSuperviseeHoursSummary);
router.post('/sessions', manage, supervision.createSupervisionSessionValidators, supervision.createSupervisionSession);
router.patch('/sessions/:id', manage, supervision.patchSupervisionSessionValidators, supervision.patchSupervisionSession);
router.post('/sessions/:id/cancel', manage, supervision.cancelSupervisionSession);
router.post('/sessions/:id/rsvp', supervision.respondToSupervisionSession);
router.post('/sessions/:id/open', async (req, res, next) => {
  try {
    if (!await canJoinSupervision(req.supervisionSession, req.user.id)) throw fail(403, 'You are not a current participant in this session.');
    const invitation = await personalMeetingInvitation(req.supervisionSession, req.user.id);
    res.json({ url: invitation.url });
  } catch (error) { next(error); }
});
export default router;
