/**
 * Meeting agendas API - attach agenda items to supervision sessions and team meetings.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import MeetingAgenda from '../models/MeetingAgenda.model.js';
import MeetingAgendaItem from '../models/MeetingAgendaItem.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import Task from '../models/Task.model.js';

const MEETING_TYPES = ['supervision_session', 'provider_schedule_event'];

async function canManageMeetingAgenda(userId, meetingType, meetingId) {
  const uid = Number(userId || 0);
  const mid = parseInt(meetingId, 10);
  if (!uid || !mid || !MEETING_TYPES.includes(meetingType)) return false;

  if (meetingType === 'supervision_session') {
    const [rows] = await pool.execute(
      `SELECT ss.id, ss.agency_id, ss.supervisor_user_id, ss.supervisee_user_id
       FROM supervision_sessions ss
       WHERE ss.id = ? AND ss.status != 'CANCELLED'
       LIMIT 1`,
      [mid]
    );
    const session = rows?.[0];
    if (!session) return false;

    if (uid === Number(session.supervisor_user_id) || uid === Number(session.supervisee_user_id)) return true;

    const attendee = await SupervisionSession.findAttendeeBySessionUser(mid, uid);
    if (attendee) return true;

    const user = await User.findById(uid);
    const role = user?.role || '';
    const adminRoles = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'];
    if (adminRoles.includes(String(role || '').toLowerCase())) {
      const agencies = await User.getAgencies(uid);
      return (agencies || []).some((a) => Number(a?.id) === Number(session.agency_id));
    }
    return false;
  }

  if (meetingType === 'provider_schedule_event') {
    const event = await ProviderScheduleEvent.findById(mid);
    if (!event || String(event.kind || '').toUpperCase() !== 'TEAM_MEETING') return false;

    if (uid === Number(event.provider_id) || uid === Number(event.created_by_user_id)) return true;

    const user = await User.findById(uid);
    const role = user?.role || '';
    const adminRoles = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'];
    if (adminRoles.includes(String(role || '').toLowerCase())) {
      const agencies = await User.getAgencies(uid);
      return (agencies || []).some((a) => Number(a?.id) === Number(event.agency_id));
    }
    return false;
  }

  return false;
}

async function getMeetingInfo(meetingType, meetingId) {
  const mid = parseInt(meetingId, 10);
  if (!mid) return null;

  if (meetingType === 'supervision_session') {
    const [rows] = await pool.execute(
      `SELECT ss.id, ss.agency_id, ss.start_at, ss.end_at, ss.notes,
              CONCAT(COALESCE(sup.first_name,''), ' ', COALESCE(sup.last_name,'')) AS supervisor_name,
              CONCAT(COALESCE(sv.first_name,''), ' ', COALESCE(sv.last_name,'')) AS supervisee_name
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       JOIN users sv ON sv.id = ss.supervisee_user_id
       WHERE ss.id = ?
       LIMIT 1`,
      [mid]
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      id: r.id,
      agency_id: r.agency_id,
      start_at: r.start_at,
      end_at: r.end_at,
      title: `Supervision: ${(r.supervisor_name || '').trim()} & ${(r.supervisee_name || '').trim()}`
    };
  }

  if (meetingType === 'provider_schedule_event') {
    const event = await ProviderScheduleEvent.findById(mid);
    if (!event) return null;
    return {
      id: event.id,
      agency_id: event.agency_id,
      start_at: event.start_at,
      end_at: event.end_at,
      title: event.title || 'Team meeting'
    };
  }

  return null;
}

export const getAgendaForMeeting = async (req, res, next) => {
  try {
    const meetingType = String(req.query.meetingType || '').trim();
    const meetingId = parseInt(req.query.meetingId, 10);
    if (!MEETING_TYPES.includes(meetingType) || !meetingId) {
      return res.status(400).json({ error: { message: 'meetingType and meetingId are required' } });
    }

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, meetingType, meetingId);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    const meetingInfo = await getMeetingInfo(meetingType, meetingId);
    if (!meetingInfo) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }

    let agenda = await MeetingAgenda.findByMeeting(meetingType, meetingId);
    if (!agenda) {
      agenda = await MeetingAgenda.findOrCreateForMeeting({
        meetingType,
        meetingId,
        agencyId: meetingInfo.agency_id,
        createdByUserId: userId
      });
    }

    const items = await MeetingAgendaItem.findByAgendaId(agenda.id);
    const itemsWithTask = await Promise.all(
      items.map(async (it) => {
        let taskTitle = null;
        if (it.task_id) {
          const task = await Task.findById(it.task_id);
          taskTitle = task?.title || null;
        }
        return { ...it, task_title: taskTitle };
      })
    );

    res.json({
      agenda: { id: agenda.id, meeting_type: meetingType, meeting_id: meetingId },
      meeting: meetingInfo,
      items: itemsWithTask
    });
  } catch (err) {
    next(err);
  }
};

export const createAgenda = async (req, res, next) => {
  try {
    const { meetingType, meetingId, agencyId } = req.body || {};
    if (!MEETING_TYPES.includes(String(meetingType || '').trim()) || !meetingId || !agencyId) {
      return res.status(400).json({ error: { message: 'meetingType, meetingId, and agencyId are required' } });
    }

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, meetingType, meetingId);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    const meetingInfo = await getMeetingInfo(meetingType, meetingId);
    if (!meetingInfo) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }

    let agenda = await MeetingAgenda.findByMeeting(meetingType, meetingId);
    if (!agenda) {
      agenda = await MeetingAgenda.create({
        agencyId,
        meetingType,
        meetingId,
        createdByUserId: userId
      });
    }

    res.status(201).json(agenda);
  } catch (err) {
    next(err);
  }
};

export const addAgendaItem = async (req, res, next) => {
  try {
    const agendaId = parseInt(req.params.agendaId, 10);
    const { task_id, title, notes } = req.body || {};

    const agenda = await MeetingAgenda.findById(agendaId);
    if (!agenda) return res.status(404).json({ error: { message: 'Agenda not found' } });

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, agenda.meeting_type, agenda.meeting_id);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    let titleStr = String(title || '').trim();
    if (task_id) {
      const task = await Task.findById(task_id);
      if (task) titleStr = titleStr || task.title;
    }
    if (!titleStr) {
      return res.status(400).json({ error: { message: 'title is required' } });
    }

    const items = await MeetingAgendaItem.findByAgendaId(agendaId);
    const maxOrder = items.length ? Math.max(...items.map((i) => Number(i.sort_order) || 0)) + 1 : 0;

    const item = await MeetingAgendaItem.create({
      meetingAgendaId: agendaId,
      taskId: task_id || null,
      title: titleStr,
      notes: notes ? String(notes).trim() || null : null,
      sortOrder: maxOrder,
      createdByUserId: userId
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
};

export const addAgendaItemsBulk = async (req, res, next) => {
  try {
    const agendaId = parseInt(req.params.agendaId, 10);
    const { items } = req.body || {};

    const agenda = await MeetingAgenda.findById(agendaId);
    if (!agenda) return res.status(404).json({ error: { message: 'Agenda not found' } });

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, agenda.meeting_type, agenda.meeting_id);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: { message: 'items array is required' } });
    }

    const created = await MeetingAgendaItem.bulkCreate(agendaId, items, userId);
    res.status(201).json({ items: created });
  } catch (err) {
    next(err);
  }
};

export const updateAgendaItem = async (req, res, next) => {
  try {
    const agendaId = parseInt(req.params.agendaId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const { title, notes, sort_order, status } = req.body || {};

    const agenda = await MeetingAgenda.findById(agendaId);
    if (!agenda) return res.status(404).json({ error: { message: 'Agenda not found' } });

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, agenda.meeting_type, agenda.meeting_id);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    const item = await MeetingAgendaItem.findById(itemId);
    if (!item || Number(item.meeting_agenda_id) !== agendaId) {
      return res.status(404).json({ error: { message: 'Agenda item not found' } });
    }

    const updated = await MeetingAgendaItem.update(itemId, {
      title,
      notes,
      sortOrder: sort_order,
      status
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const listUpcomingMeetings = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const uid = Number(userId);
    const now = new Date();
    const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');
    const limit = 30;

    const meetings = [];

    const [supvRows] = await pool.execute(
      `SELECT ss.id, ss.agency_id, ss.start_at, ss.end_at, ss.session_type,
              CONCAT(COALESCE(sup.first_name,''), ' ', COALESCE(sup.last_name,'')) AS supervisor_name,
              CONCAT(COALESCE(sv.first_name,''), ' ', COALESCE(sv.last_name,'')) AS supervisee_name
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       JOIN users sv ON sv.id = ss.supervisee_user_id
       LEFT JOIN supervision_session_attendees ssa ON ssa.session_id = ss.id AND ssa.user_id = ?
       WHERE (ss.supervisor_user_id = ? OR ss.supervisee_user_id = ? OR ssa.user_id IS NOT NULL)
         AND (ss.status IS NULL OR ss.status != 'CANCELLED')
         AND ss.end_at >= ?
         ${agencyId > 0 ? 'AND ss.agency_id = ?' : ''}
       ORDER BY ss.start_at ASC
       LIMIT ?`,
      agencyId > 0 ? [uid, uid, uid, nowStr, agencyId, limit] : [uid, uid, uid, nowStr, limit]
    );

    for (const r of supvRows || []) {
      meetings.push({
        meeting_type: 'supervision_session',
        meeting_id: r.id,
        agency_id: r.agency_id,
        start_at: r.start_at,
        end_at: r.end_at,
        title: `Supervision: ${(r.supervisor_name || '').trim()} & ${(r.supervisee_name || '').trim()}`
      });
    }

    const [teamRows] = await pool.execute(
      `SELECT pse.id, pse.agency_id, pse.start_at, pse.end_at, pse.title
       FROM provider_schedule_events pse
       WHERE UPPER(COALESCE(pse.kind,'')) = 'TEAM_MEETING'
         AND UPPER(COALESCE(pse.status,'ACTIVE')) = 'ACTIVE'
         AND (pse.start_at >= ? OR (pse.all_day = 1 AND pse.end_date >= CURDATE()))
         AND (pse.provider_id = ? OR pse.created_by_user_id = ?)
         ${agencyId > 0 ? 'AND pse.agency_id = ?' : ''}
       ORDER BY COALESCE(pse.start_at, CONCAT(pse.start_date, ' 00:00:00')) ASC
       LIMIT ?`,
      agencyId > 0 ? [nowStr, uid, uid, agencyId, limit] : [nowStr, uid, uid, limit]
    );

    for (const r of teamRows || []) {
      meetings.push({
        meeting_type: 'provider_schedule_event',
        meeting_id: r.id,
        agency_id: r.agency_id,
        start_at: r.start_at,
        end_at: r.end_at,
        title: r.title || 'Team meeting'
      });
    }

    meetings.sort((a, b) => {
      const aStart = a.start_at ? new Date(a.start_at).getTime() : 0;
      const bStart = b.start_at ? new Date(b.start_at).getTime() : 0;
      return aStart - bStart;
    });

    res.json({ meetings: meetings.slice(0, limit) });
  } catch (err) {
    next(err);
  }
};

export const deleteAgendaItem = async (req, res, next) => {
  try {
    const agendaId = parseInt(req.params.agendaId, 10);
    const itemId = parseInt(req.params.itemId, 10);

    const agenda = await MeetingAgenda.findById(agendaId);
    if (!agenda) return res.status(404).json({ error: { message: 'Agenda not found' } });

    const userId = req.user?.id;
    const canManage = await canManageMeetingAgenda(userId, agenda.meeting_type, agenda.meeting_id);
    if (!canManage) {
      return res.status(403).json({ error: { message: 'You do not have access to this meeting' } });
    }

    const item = await MeetingAgendaItem.findById(itemId);
    if (!item || Number(item.meeting_agenda_id) !== agendaId) {
      return res.status(404).json({ error: { message: 'Agenda item not found' } });
    }

    await MeetingAgendaItem.delete(itemId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
