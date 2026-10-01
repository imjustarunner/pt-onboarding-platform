import { authenticate } from './auth.middleware.js';
import { supervisionSessionRequest, validateSupervisionAccess } from '../services/supervisionInvitationAccess.service.js';
import pool from '../config/database.js';

export async function authenticateSupervisionSession(req, res, next) {
  const token = req.get('X-Supervision-Access');
  if (!token) return authenticate(req, res, next);
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    let request = supervisionSessionRequest(req.method, req.path);
    const slide = /^\/presentation-slides\/(\d+)$/.exec(req.path);
    if (!request && slide && req.method === 'PATCH') {
      const [rows] = await pool.execute(`SELECT p.session_id FROM supervision_presentation_slides s
        JOIN supervision_case_presentations p ON p.id=s.presentation_id WHERE s.id=?`, [Number(slide[1])]);
      if (rows[0]) request = { sessionId: Number(rows[0].session_id), action: 'presentation-slide' };
    }
    const access = await validateSupervisionAccess(token, request, req.body);
    req.user = access.user;
    req.supervisionInvitationAccess = access;
    next();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message }, personalInvitationRequired: true });
    next(error);
  }
}

export async function authenticateSupervisionAgenda(req, res, next) {
  const token = req.get('X-Supervision-Access');
  if (!token) return authenticate(req, res, next);
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    let sessionId = 0;
    if (req.path === '/' && ['GET','POST'].includes(req.method)) {
      const input = req.method === 'GET' ? req.query : req.body;
      if (input?.meetingType === 'supervision_session') sessionId = Number(input.meetingId);
    } else if (/^\/\d+\/items(?:\/\d+|\/bulk)?$/.test(req.path)) {
      const [rows] = await pool.execute('SELECT meeting_type,meeting_id FROM meeting_agendas WHERE id=?', [Number(req.path.split('/')[1])]);
      if (rows[0]?.meeting_type === 'supervision_session') sessionId = Number(rows[0].meeting_id);
    }
    const access = await validateSupervisionAccess(token, sessionId ? { sessionId, action: 'agenda' } : null, req.body);
    req.user = access.user;
    req.supervisionInvitationAccess = access;
    next();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message }, personalInvitationRequired: true });
    next(error);
  }
}
