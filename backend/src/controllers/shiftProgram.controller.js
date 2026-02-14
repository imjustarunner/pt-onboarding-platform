import { validationResult } from 'express-validator';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Program from '../models/Program.model.js';
import ProgramSite from '../models/ProgramSite.model.js';
import ProgramSettings from '../models/ProgramSettings.model.js';
import ProgramStaffAssignment from '../models/ProgramStaffAssignment.model.js';
import ProgramSiteShiftSlot from '../models/ProgramSiteShiftSlot.model.js';
import ProgramShiftSignup from '../models/ProgramShiftSignup.model.js';
import ProgramShiftCalloff from '../models/ProgramShiftCalloff.model.js';
import ProgramChecklistEnabledItem from '../models/ProgramChecklistEnabledItem.model.js';
import CustomChecklistItem from '../models/CustomChecklistItem.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';

async function ensureProgramAccess(req, programId) {
  const program = await Program.findById(programId);
  if (!program) return { ok: false, status: 404, message: 'Program not found' };
  const agencyId = program.agency_id;
  if (req.user.role === 'super_admin') return { ok: true, program };
  const userAgencies = await User.getAgencies(req.user.id);
  const hasAccess = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
  if (!hasAccess) return { ok: false, status: 403, message: 'Access denied' };
  return { ok: true, program };
}

async function ensureProgramStaffAccess(req, programId) {
  const program = await Program.findById(programId);
  if (!program) return { ok: false, status: 404, message: 'Program not found' };
  if (req.user.role === 'super_admin') return { ok: true, program };
  const access = await ensureProgramAccess(req, programId);
  if (access.ok) return access;
  const [staffRows] = await pool.execute(
    'SELECT 1 FROM program_staff_assignments WHERE program_id = ? AND user_id = ? AND is_active = TRUE',
    [programId, req.user.id]
  );
  if (staffRows?.length > 0) return { ok: true, program };
  return { ok: false, status: 403, message: 'Access denied' };
}

/** List programs for an agency. GET /api/agencies/:agencyId/programs */
export const listPrograms = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
      if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const programs = await Program.findByAgency(agencyId, { includeInactive: true });
    res.json(programs);
  } catch (e) {
    next(e);
  }
};

/** Get program with sites, settings, staff. GET /api/shift-programs/:programId */
export const getProgram = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [sites, settings, staff] = await Promise.all([
      ProgramSite.findByProgram(programId, { includeInactive: true }),
      ProgramSettings.findByProgramId(programId),
      ProgramStaffAssignment.findByProgram(programId, { includeInactive: true })
    ]);

    res.json({
      ...access.program,
      sites: sites || [],
      settings: settings || {},
      staff: staff || []
    });
  } catch (e) {
    next(e);
  }
};

/** Create program site. POST /api/shift-programs/:programId/sites */
export const createSite = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const { name, address, officeLocationId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: { message: 'Site name is required' } });

    const site = await ProgramSite.create({
      programId,
      name: name.trim(),
      address: address?.trim() || null,
      officeLocationId: officeLocationId ? parseInt(officeLocationId, 10) : null
    });
    res.status(201).json(site);
  } catch (e) {
    next(e);
  }
};

/** Update program site. PATCH /api/shift-programs/:programId/sites/:siteId */
export const updateSite = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    if (!programId || !siteId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const existing = await ProgramSite.findById(siteId);
    if (!existing || existing.program_id !== programId) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.office_location_id !== undefined) updates.office_location_id = req.body.office_location_id;
    if (req.body.officeLocationId !== undefined) updates.office_location_id = req.body.officeLocationId;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;

    const site = await ProgramSite.update(siteId, updates);
    res.json(site);
  } catch (e) {
    next(e);
  }
};

/** Update program settings. PUT /api/shift-programs/:programId/settings */
export const updateSettings = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const {
      defaultDirectHours,
      onCallPayAmount,
      bonusPerfectAttendance,
      bonusShiftCoverage,
      shiftSchedulingEnabled
    } = req.body;

    const settings = await ProgramSettings.upsert(programId, {
      defaultDirectHours: defaultDirectHours != null ? Number(defaultDirectHours) : 3,
      onCallPayAmount: onCallPayAmount != null ? Number(onCallPayAmount) : null,
      bonusPerfectAttendance: bonusPerfectAttendance != null ? Number(bonusPerfectAttendance) : null,
      bonusShiftCoverage: bonusShiftCoverage != null ? Number(bonusShiftCoverage) : null,
      shiftSchedulingEnabled: shiftSchedulingEnabled !== false
    });
    res.json(settings);
  } catch (e) {
    next(e);
  }
};

/** Add staff to program. POST /api/shift-programs/:programId/staff */
export const addStaff = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const { userId, role, minScheduledHoursPerWeek, minOnCallHoursPerWeek } = req.body;
    const uid = userId ? parseInt(userId, 10) : null;
    if (!uid) return res.status(400).json({ error: { message: 'userId is required' } });

    const assignment = await ProgramStaffAssignment.create({
      programId,
      userId: uid,
      role: role || 'participant',
      minScheduledHoursPerWeek: minScheduledHoursPerWeek != null ? Number(minScheduledHoursPerWeek) : null,
      minOnCallHoursPerWeek: minOnCallHoursPerWeek != null ? Number(minOnCallHoursPerWeek) : null,
      createdByUserId: req.user.id
    });
    res.status(201).json(assignment);
  } catch (e) {
    next(e);
  }
};

/** Update staff assignment. PATCH /api/shift-programs/:programId/staff/:assignmentId */
export const updateStaff = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    if (!programId || !assignmentId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      'SELECT * FROM program_staff_assignments WHERE id = ? AND program_id = ?',
      [assignmentId, programId]
    );
    if (!rows[0]) return res.status(404).json({ error: { message: 'Assignment not found' } });

    const updates = {};
    if (req.body.role !== undefined) updates.role = req.body.role;
    if (req.body.minScheduledHoursPerWeek !== undefined) updates.min_scheduled_hours_per_week = req.body.minScheduledHoursPerWeek;
    if (req.body.minOnCallHoursPerWeek !== undefined) updates.min_on_call_hours_per_week = req.body.minOnCallHoursPerWeek;
    if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;

    const assignment = await ProgramStaffAssignment.update(assignmentId, updates);
    res.json(assignment);
  } catch (e) {
    next(e);
  }
};

/** Remove staff from program. DELETE /api/shift-programs/:programId/staff/:userId */
export const removeStaff = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!programId || !userId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    await ProgramStaffAssignment.remove(programId, userId);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/** List checklist items for program (agency items with program enable/disable). GET /api/shift-programs/:programId/checklist-items */
export const listProgramChecklistItems = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const agencyId = access.program.agency_id;
    const agencyItems = await CustomChecklistItem.getEnabledItemsForAgency(agencyId);
    const allItems = agencyItems.allItems || [];

    const programRows = await ProgramChecklistEnabledItem.findByProgramId(programId);
    const programStatusByItem = {};
    for (const r of programRows || []) {
      programStatusByItem[r.checklist_item_id] = r.enabled === 1 || r.enabled === true;
    }

    const result = allItems.map((item) => ({
      ...item,
      enabled: programStatusByItem[item.id] ?? true
    }));
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/** Toggle checklist item for program. PUT /api/shift-programs/:programId/checklist-items/:itemId */
export const toggleProgramChecklistItem = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (!programId || !itemId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const { enabled } = req.body;
    const newEnabled = enabled === true || enabled === 'true' || enabled === 1;
    await ProgramChecklistEnabledItem.toggleItem(programId, itemId, newEnabled);
    res.json({ checklistItemId: itemId, enabled: newEnabled });
  } catch (e) {
    next(e);
  }
};

/** List shift slots for a site. GET /api/shift-programs/:programId/sites/:siteId/slots */
export const listShiftSlots = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    if (!programId || !siteId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const site = await ProgramSite.findById(siteId);
    if (!site || site.program_id !== programId) return res.status(404).json({ error: { message: 'Site not found' } });

    const slots = await ProgramSiteShiftSlot.findBySite(siteId, { includeInactive: true });
    res.json(slots || []);
  } catch (e) {
    next(e);
  }
};

/** Delete shift slot. DELETE /api/shift-programs/:programId/sites/:siteId/slots/:slotId */
export const deleteShiftSlot = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    const slotId = parseInt(req.params.slotId, 10);
    if (!programId || !siteId || !slotId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const site = await ProgramSite.findById(siteId);
    if (!site || site.program_id !== programId) return res.status(404).json({ error: { message: 'Site not found' } });

    const slot = await ProgramSiteShiftSlot.findById(slotId);
    if (!slot || slot.program_site_id !== siteId) return res.status(404).json({ error: { message: 'Slot not found' } });

    await ProgramSiteShiftSlot.remove(slotId);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/** Create shift slot. POST /api/shift-programs/:programId/sites/:siteId/slots */
export const createShiftSlot = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    if (!programId || !siteId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const site = await ProgramSite.findById(siteId);
    if (!site || site.program_id !== programId) return res.status(404).json({ error: { message: 'Site not found' } });

    const { weekday, startTime, endTime, slotType } = req.body;
    if (weekday == null || !startTime || !endTime) {
      return res.status(400).json({ error: { message: 'weekday, startTime, endTime are required' } });
    }

    const slot = await ProgramSiteShiftSlot.create({
      programSiteId: siteId,
      weekday: parseInt(weekday, 10),
      startTime,
      endTime,
      slotType: slotType || 'scheduled'
    });
    res.status(201).json(slot);
  } catch (e) {
    next(e);
  }
};

/** List signups for a site and date. GET /api/shift-programs/:programId/sites/:siteId/signups?slotDate=YYYY-MM-DD (admin) */
export const listSignupsForSite = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    const slotDate = String(req.query.slotDate || req.query.slot_date || '').slice(0, 10);
    if (!programId || !siteId || !slotDate) return res.status(400).json({ error: { message: 'programId, siteId, slotDate required' } });

    const access = await ensureProgramAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const site = await ProgramSite.findById(siteId);
    if (!site || site.program_id !== programId) return res.status(404).json({ error: { message: 'Site not found' } });

    const signups = await ProgramShiftSignup.findBySiteAndDate(siteId, slotDate);
    res.json(signups || []);
  } catch (e) {
    next(e);
  }
};

/** List programs I'm staff in (with sites). GET /api/shift-programs/my-programs (for self-signup modal) */
export const listMyPrograms = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.name
       FROM program_staff_assignments psa
       JOIN programs p ON p.id = psa.program_id
       JOIN agencies a ON p.agency_id = a.id
       WHERE psa.user_id = ? AND psa.is_active = TRUE AND p.is_active = TRUE
         AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.feature_flags, '{}'), '$.shiftProgramsEnabled')) = 'true'
       ORDER BY p.name`,
      [req.user.id]
    );
    const programs = rows || [];
    for (const p of programs) {
      const [siteRows] = await pool.execute(
        `SELECT ps.id, ps.name FROM program_sites ps
         WHERE ps.program_id = ? AND ps.is_active = TRUE ORDER BY ps.name`,
        [p.id]
      );
      p.sites = siteRows || [];
    }
    res.json(programs);
  } catch (e) {
    next(e);
  }
};

/** List my sign-ups. GET /api/shift-programs/my-signups */
export const listMySignups = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const signups = await ProgramShiftSignup.findByUser(req.user.id, {
      startDate,
      endDate,
      onlyShiftProgramsEnabledAgencies: true
    });
    res.json(signups || []);
  } catch (e) {
    next(e);
  }
};

/** Create sign-up. POST /api/shift-programs/:programId/sites/:siteId/signups
 * Staff self-signup, or admin can pass userId to assign a provider.
 */
export const createSignup = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const siteId = parseInt(req.params.siteId, 10);
    if (!programId || !siteId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const site = await ProgramSite.findById(siteId);
    if (!site || site.program_id !== programId) return res.status(404).json({ error: { message: 'Site not found' } });

    const { slotDate, shiftSlotId, startTime, endTime, signupType, userId: assignUserId } = req.body;
    if (!slotDate) return res.status(400).json({ error: { message: 'slotDate is required' } });

    let targetUserId = req.user.id;
    if (assignUserId != null && Number(assignUserId) > 0) {
      const adminAccess = await ensureProgramAccess(req, programId);
      if (!adminAccess.ok) return res.status(adminAccess.status).json({ error: { message: adminAccess.message } });
      const [staffRows] = await pool.execute(
        'SELECT 1 FROM program_staff_assignments WHERE program_id = ? AND user_id = ? AND is_active = TRUE',
        [programId, assignUserId]
      );
      if (!staffRows?.length) return res.status(400).json({ error: { message: 'User is not assigned to this program' } });
      targetUserId = parseInt(assignUserId, 10);
    } else {
      const staffAccess = await ensureProgramStaffAccess(req, programId);
      if (!staffAccess.ok) return res.status(staffAccess.status).json({ error: { message: staffAccess.message } });
    }

    const signup = await ProgramShiftSignup.create({
      programSiteId: siteId,
      programSiteShiftSlotId: shiftSlotId ? parseInt(shiftSlotId, 10) : null,
      userId: targetUserId,
      slotDate,
      startTime: startTime || null,
      endTime: endTime || null,
      signupType: signupType || 'scheduled'
    });
    res.status(201).json(signup);
  } catch (e) {
    next(e);
  }
};

/** List coverage opportunities: pending calloffs where I'm on-call. GET /api/shift-programs/my-coverage-opportunities */
export const listMyCoverageOpportunities = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id as calloff_id, c.shift_signup_id, c.reason, c.calloff_at,
              ss.program_site_id, ss.slot_date, ss.start_time, ss.end_time,
              ps.name as site_name, p.id as program_id, p.name as program_name
       FROM program_shift_calloffs c
       JOIN program_shift_signups ss ON c.shift_signup_id = ss.id
       JOIN program_sites ps ON ss.program_site_id = ps.id
       JOIN programs p ON ps.program_id = p.id
       JOIN agencies a ON p.agency_id = a.id
         AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.feature_flags, '{}'), '$.shiftProgramsEnabled')) = 'true'
       WHERE c.status = 'pending'
         AND EXISTS (
           SELECT 1 FROM program_shift_signups oc
           WHERE oc.program_site_id = ss.program_site_id
             AND oc.slot_date = ss.slot_date
             AND oc.signup_type = 'on_call'
             AND oc.status = 'confirmed'
             AND oc.user_id = ?
         )
       ORDER BY ss.slot_date, ss.start_time`,
      [req.user.id]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/** Cover a call-off (on-call staff accepts). POST /api/shift-programs/:programId/calloffs/:calloffId/cover */
export const coverCalloff = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    const calloffId = parseInt(req.params.calloffId, 10);
    if (!programId || !calloffId) return res.status(400).json({ error: { message: 'Invalid id' } });

    const calloff = await ProgramShiftCalloff.findById(calloffId);
    if (!calloff) return res.status(404).json({ error: { message: 'Call-off not found' } });
    if (calloff.status !== 'pending') return res.status(409).json({ error: { message: 'This call-off is already covered or resolved' } });

    const [progRows] = await pool.execute('SELECT program_id FROM program_sites WHERE id = ?', [calloff.program_site_id]);
    const siteProgramId = progRows?.[0]?.program_id;
    if (!siteProgramId || siteProgramId !== programId) return res.status(404).json({ error: { message: 'Call-off not found for this program' } });

    const access = await ensureProgramStaffAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [onCallRows] = await pool.execute(
      `SELECT 1 FROM program_shift_signups
       WHERE program_site_id = ? AND slot_date = ? AND signup_type = 'on_call' AND status = 'confirmed' AND user_id = ?`,
      [calloff.program_site_id, calloff.slot_date, req.user.id]
    );
    if (!onCallRows?.length) return res.status(403).json({ error: { message: 'You are not on-call for this site/date' } });

    const originalSignup = await ProgramShiftSignup.findById(calloff.shift_signup_id);
    if (!originalSignup) return res.status(404).json({ error: { message: 'Shift signup not found' } });

    await pool.execute('START TRANSACTION');
    try {
      await ProgramShiftSignup.updateStatus(originalSignup.id, 'released');
      const newSignup = await ProgramShiftSignup.create({
        programSiteId: calloff.program_site_id,
        programSiteShiftSlotId: originalSignup.program_site_shift_slot_id,
        userId: req.user.id,
        slotDate: calloff.slot_date,
        startTime: originalSignup.start_time,
        endTime: originalSignup.end_time,
        signupType: 'scheduled'
      });
      await ProgramShiftCalloff.updateCovered(calloffId, req.user.id);
      await pool.execute('COMMIT');
      res.json({ calloff: await ProgramShiftCalloff.findById(calloffId), newSignup });
    } catch (e) {
      await pool.execute('ROLLBACK');
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

/** Create call-off. POST /api/shift-programs/:programId/calloffs */
export const createCalloff = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    if (!programId) return res.status(400).json({ error: { message: 'Invalid program id' } });

    const access = await ensureProgramStaffAccess(req, programId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const { shiftSignupId, reason } = req.body;
    const signupId = shiftSignupId ? parseInt(shiftSignupId, 10) : null;
    if (!signupId) return res.status(400).json({ error: { message: 'shiftSignupId is required' } });

    const [signupRows] = await pool.execute(
      `SELECT ss.user_id, ss.program_site_id, ss.slot_date
       FROM program_shift_signups ss
       JOIN program_sites ps ON ss.program_site_id = ps.id
       WHERE ss.id = ? AND ps.program_id = ?`,
      [signupId, programId]
    );
    if (!signupRows?.[0]) return res.status(404).json({ error: { message: 'Shift signup not found' } });
    const signupRow = signupRows[0];
    if (parseInt(signupRow.user_id, 10) !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only call off your own shifts' } });
    }

    const calloff = await ProgramShiftCalloff.create({
      shiftSignupId: signupId,
      userId: req.user.id,
      reason: reason?.trim() || null
    });

    const slotDate = signupRow.slot_date;
    const siteId = signupRow.program_site_id;

    const [siteRows] = await pool.execute(
      'SELECT name FROM program_sites WHERE id = ?',
      [siteId]
    );
    const siteName = siteRows?.[0]?.name || 'Site';

    const [onCallRows] = await pool.execute(
      `SELECT DISTINCT ss.user_id
       FROM program_shift_signups ss
       WHERE ss.program_site_id = ? AND ss.slot_date = ? AND ss.signup_type = 'on_call' AND ss.status = 'confirmed'`,
      [siteId, slotDate]
    );

    const agencyId = access.program.agency_id;
    const message = `Shift coverage needed at ${siteName} on ${slotDate}. Someone has called off.`;

    for (const row of onCallRows || []) {
      const targetUserId = row.user_id;
      if (!targetUserId || targetUserId === req.user.id) continue;
      try {
        await createNotificationAndDispatch({
          type: 'shift_calloff_need_coverage',
          severity: 'urgent',
          title: 'Shift Coverage Needed',
          message,
          userId: targetUserId,
          agencyId,
          relatedEntityType: 'program_shift_calloff',
          relatedEntityId: calloff.id
        });
      } catch (err) {
        console.error('Failed to notify on-call staff:', err);
      }
    }

    res.status(201).json(calloff);
  } catch (e) {
    next(e);
  }
};
