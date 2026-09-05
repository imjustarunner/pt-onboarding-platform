/**
 * Smart / dynamic chat groups (Office Available, supervisor ↔ supervisees).
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import {
  ensureOfficeAvailableChannel,
  ensureSupervisorSuperviseesChannel,
  postSystemMessage
} from '../services/smartChatGroups.service.js';

function agencyIdFrom(req) {
  return parseInt(req.body?.agencyId ?? req.query?.agencyId, 10);
}

async function assertAgencyAccess(user, agencyId) {
  if (String(user?.role || '').toLowerCase() === 'super_admin') return;
  const [direct] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [user.id, agencyId]
  );
  if (direct?.length) return;
  const agencies = await User.getAgencies(user.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

/**
 * GET /api/chat/smart-groups?agencyId=
 * List smart groups the current user can open.
 */
export const listSmartGroups = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await assertAgencyAccess(req.user, agencyId);

    const me = Number(req.user.id);
    const groups = [];

    try {
      const office = await ensureOfficeAvailableChannel(agencyId);
      const isMember = (office.memberIds || []).includes(me);
      groups.push({
        key: 'office_available',
        label: 'Office Available',
        description: 'Everyone currently marked Office Available. Client Exchange posts land here.',
        threadId: office.threadId,
        memberCount: (office.memberIds || []).length,
        membershipRule: 'office_available',
        canOpen: isMember,
        canJoinHint: isMember
          ? null
          : 'Turn on Office Availability in the header to join this group.'
      });
    } catch (e) {
      console.warn('[listSmartGroups] office_available:', e?.message || e);
    }

    const superviseeIds = await SupervisorAssignment.getSuperviseeIds(me, agencyId);
    if ((superviseeIds || []).length) {
      try {
        const channel = await ensureSupervisorSuperviseesChannel({
          agencyId,
          supervisorId: me
        });
        groups.push({
          key: 'my_supervisees',
          label: 'My supervisees',
          description: 'Smart group with you and your current supervisees. Membership updates automatically.',
          threadId: channel.threadId,
          memberCount: (channel.memberIds || []).length,
          membershipRule: 'supervisor_supervisees',
          canOpen: true,
          canMessageAll: true
        });
      } catch (e) {
        console.warn('[listSmartGroups] my_supervisees:', e?.message || e);
      }
    }

    res.json({ groups });
  } catch (e) {
    if (e?.status === 403) return res.status(403).json({ error: { message: 'Forbidden' } });
    next(e);
  }
};

/**
 * POST /api/chat/smart-groups/office-available
 * Ensure + open Office Available channel (must be a member / Office Available).
 */
export const openOfficeAvailable = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await assertAgencyAccess(req.user, agencyId);
    const result = await ensureOfficeAvailableChannel(agencyId);
    const me = Number(req.user.id);
    if (!(result.memberIds || []).includes(me)) {
      return res.status(403).json({
        error: {
          message:
            'Turn on Office Availability in the header to join the Office Available group.'
        }
      });
    }
    res.json({ threadId: result.threadId, memberIds: result.memberIds });
  } catch (e) {
    if (e?.status === 403) return res.status(403).json({ error: { message: 'Forbidden' } });
    next(e);
  }
};

/**
 * POST /api/chat/smart-groups/my-supervisees
 * Ensure supervisor ↔ supervisees channel for the current user.
 */
export const openMySupervisees = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await assertAgencyAccess(req.user, agencyId);
    const me = Number(req.user.id);
    const superviseeIds = await SupervisorAssignment.getSuperviseeIds(me, agencyId);
    if (!(superviseeIds || []).length) {
      return res.status(404).json({ error: { message: 'You have no supervisees in this agency' } });
    }
    const result = await ensureSupervisorSuperviseesChannel({ agencyId, supervisorId: me });
    res.json({ threadId: result.threadId, memberIds: result.memberIds });
  } catch (e) {
    if (e?.status === 403) return res.status(403).json({ error: { message: 'Forbidden' } });
    next(e);
  }
};

/**
 * POST /api/chat/smart-groups/my-supervisees/message
 * Body: { agencyId, body } — post a message to all current supervisees (smart group).
 */
export const messageAllSupervisees = async (req, res, next) => {
  try {
    const agencyId = agencyIdFrom(req);
    const body = String(req.body?.body || '').trim();
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });
    await assertAgencyAccess(req.user, agencyId);
    const me = Number(req.user.id);
    const superviseeIds = await SupervisorAssignment.getSuperviseeIds(me, agencyId);
    if (!(superviseeIds || []).length) {
      return res.status(404).json({ error: { message: 'You have no supervisees in this agency' } });
    }
    const result = await ensureSupervisorSuperviseesChannel({ agencyId, supervisorId: me });
    const messageId = await postSystemMessage({
      threadId: result.threadId,
      senderUserId: me,
      body
    });
    res.json({ threadId: result.threadId, messageId, memberIds: result.memberIds });
  } catch (e) {
    if (e?.status === 403) return res.status(403).json({ error: { message: 'Forbidden' } });
    next(e);
  }
};
