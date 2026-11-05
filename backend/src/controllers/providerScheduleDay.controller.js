import User from '../models/User.model.js';
import { canManageOthersSchedule } from '../services/scheduleSummaryPrivacy.service.js';
import { markSchoolNoSchoolDay } from '../services/schoolDayClosures.service.js';
import { providerDayNoteEmail } from '../services/providerDayNoteEmail.service.js';

async function assertProviderScheduleActor(req, providerId, agencyId) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId) throw Object.assign(new Error('Access denied'), { status: 403 });
  const isSelf = actorId === Number(providerId);
  const role = String(req.user?.role || '').toLowerCase();
  if (!isSelf && !canManageOthersSchedule(role)) throw Object.assign(new Error('Access denied'), { status: 403 });
  if (!isSelf && !['super_admin', 'superadmin'].includes(role)) {
    const actorAgencies = await User.getAgencies(actorId);
    const targetAgencies = await User.getAgencies(providerId);
    const actorIds = new Set((actorAgencies || []).map(agency => Number(agency.id)));
    const shared = (targetAgencies || []).map(agency => Number(agency.id)).filter(id => actorIds.has(id));
    if (!shared.includes(Number(agencyId))) throw Object.assign(new Error('Organization access required.'), { status: 403 });
  }
}

function providerIdOf(req) {
  const providerId = Number(req.params.id);
  if (!providerId) throw Object.assign(new Error('Invalid user id'), { status: 400 });
  return providerId;
}

export const markProviderSchoolDayClosed = async (req, res, next) => {
  try {
    const providerId = providerIdOf(req);
    const agencyId = Number(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Agency is required.' } });
    await assertProviderScheduleActor(req, providerId, agencyId);
    const result = await markSchoolNoSchoolDay({
      providerId,
      agencyId,
      schoolOrgId: req.body?.schoolOrgId,
      userId: Number(req.user.id),
      date: req.body?.date,
      reason: req.body?.reason,
      timeZone: req.body?.timeZone || 'America/Denver'
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const previewProviderDayNote = async (req, res, next) => {
  try {
    const providerId = providerIdOf(req);
    const agencyId = Number(req.query?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Agency is required.' } });
    await assertProviderScheduleActor(req, providerId, agencyId);
    res.json(await providerDayNoteEmail.preview({
      agencyId,
      providerId,
      date: req.query?.date,
      timeZone: req.query?.timeZone || 'America/Denver'
    }));
  } catch (error) {
    next(error);
  }
};

export const sendProviderDayNote = async (req, res, next) => {
  try {
    const providerId = providerIdOf(req);
    const agencyId = Number(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Agency is required.' } });
    await assertProviderScheduleActor(req, providerId, agencyId);
    res.json(await providerDayNoteEmail.sendNote({
      agencyId,
      providerId,
      actorUserId: Number(req.user.id),
      date: req.body?.date,
      timeZone: req.body?.timeZone || 'America/Denver',
      subject: req.body?.subject,
      text: req.body?.text
    }));
  } catch (error) {
    next(error);
  }
};
