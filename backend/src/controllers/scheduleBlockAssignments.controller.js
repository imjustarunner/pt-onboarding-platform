import ScheduleBlockAssignment from '../models/ScheduleBlockAssignment.model.js';
import pool from '../config/database.js';

async function assertEventOwnedByUser(eventId, userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM provider_schedule_events WHERE id = ?',
    [eventId]
  );
  const event = rows[0];
  if (!event) return { error: { status: 404, message: 'Schedule block not found' } };
  if (Number(event.provider_id) !== Number(userId) && Number(event.created_by_user_id) !== Number(userId)) {
    return { error: { status: 403, message: 'Not your schedule block' } };
  }
  if (String(event.kind) !== 'SCHEDULE_HOLD') {
    return { error: { status: 400, message: 'Only schedule blocks (holds) can receive task assignments' } };
  }
  return { event };
}

export const listDayBlocks = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const day = String(req.query.day || '').slice(0, 10);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ error: { message: 'day=YYYY-MM-DD required' } });
    }
    const events = await ScheduleBlockAssignment.listEventsForUserDay(userId, day);
    const withAssignments = await Promise.all(
      (events || []).map(async (e) => {
        const assignments = await ScheduleBlockAssignment.listByEvent(e.id);
        return {
          id: e.id,
          title: e.title,
          reason_code: e.reason_code,
          start_at: e.start_at,
          end_at: e.end_at,
          start_date: e.start_date,
          end_date: e.end_date,
          all_day: !!e.all_day,
          focus_session_enabled: !!e.focus_session_enabled,
          assignment_count: assignments.length,
          assignments
        };
      })
    );
    res.json(withAssignments);
  } catch (err) {
    next(err);
  }
};

export const listBlockAssignments = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const eventId = parseInt(req.params.eventId, 10);
    const check = await assertEventOwnedByUser(eventId, userId);
    if (check.error) return res.status(check.error.status).json({ error: { message: check.error.message } });
    const assignments = await ScheduleBlockAssignment.listByEvent(eventId);
    res.json({ event: check.event, assignments });
  } catch (err) {
    next(err);
  }
};

export const addBlockAssignment = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const eventId = parseInt(req.params.eventId, 10);
    const check = await assertEventOwnedByUser(eventId, userId);
    if (check.error) return res.status(check.error.status).json({ error: { message: check.error.message } });

    const { assignableType, assignableId, notes, sortOrder } = req.body || {};
    const id = parseInt(assignableId, 10);
    if (!id || !['task', 'action_item', 'task_list'].includes(String(assignableType))) {
      return res.status(400).json({ error: { message: 'assignableType and assignableId required' } });
    }
    const row = await ScheduleBlockAssignment.add({
      scheduleEventId: eventId,
      assignableType,
      assignableId: id,
      assignedByUserId: userId,
      sortOrder: sortOrder ?? 0,
      notes: notes || null
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

export const removeBlockAssignment = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const eventId = parseInt(req.params.eventId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const check = await assertEventOwnedByUser(eventId, userId);
    if (check.error) return res.status(check.error.status).json({ error: { message: check.error.message } });
    const ok = await ScheduleBlockAssignment.remove(assignmentId);
    if (!ok) return res.status(404).json({ error: { message: 'Assignment not found' } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const updateBlockAssignmentNotes = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const eventId = parseInt(req.params.eventId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    const check = await assertEventOwnedByUser(eventId, userId);
    if (check.error) return res.status(check.error.status).json({ error: { message: check.error.message } });
    const row = await ScheduleBlockAssignment.updateNotes(assignmentId, req.body?.notes ?? null);
    res.json(row);
  } catch (err) {
    next(err);
  }
};
