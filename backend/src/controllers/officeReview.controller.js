import pool from '../config/database.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import User from '../models/User.model.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - Number(n || 0));
  return d;
}

export const getMyOfficeReviewSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const officeId = req.query.officeId ? parseInt(req.query.officeId, 10) : null;

    // Optional office scope: must have access
    if (officeId) {
      if (req.user.role !== 'super_admin') {
        const agencies = await User.getAgencies(userId);
        const ok = await OfficeLocationAgency.userHasAccess({ officeLocationId: officeId, agencyIds: agencies.map((a) => a.id) });
        if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const params = [userId];
    let where = 'osa.provider_id = ? AND osa.is_active = TRUE';
    if (officeId) {
      where += ' AND osa.office_location_id = ?';
      params.push(officeId);
    }

    const [assignments] = await pool.execute(
      `SELECT
         osa.*,
         ol.name AS office_name,
         r.name AS room_name,
         r.room_number AS room_number,
         r.label AS room_label,
         bp.id AS booking_plan_id,
         bp.booked_frequency,
         bp.booking_start_date,
         bp.last_confirmed_at,
         bp.active_until_date
       FROM office_standing_assignments osa
       JOIN office_locations ol ON osa.office_location_id = ol.id
       JOIN office_rooms r ON osa.room_id = r.id
       LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
       WHERE ${where}
       ORDER BY ol.name ASC, osa.weekday ASC, osa.hour ASC`,
      params
    );

    const twoWeekCutoff = daysAgo(14);
    const sixWeekCutoff = daysAgo(42);
    const todayYmd = new Date().toISOString().slice(0, 10);

    const out = (assignments || []).map((a) => {
      const lastTwo = a.last_two_week_confirmed_at ? new Date(a.last_two_week_confirmed_at) : null;
      const needsTwoWeek = !lastTwo || lastTwo < twoWeekCutoff;

      const hasPlan = !!a.booking_plan_id;
      const lastBookedConfirm = a.last_confirmed_at ? new Date(a.last_confirmed_at) : null;
      const needsSixWeekBookedConfirm = hasPlan && (!lastBookedConfirm || lastBookedConfirm < sixWeekCutoff);

      const temporaryUntil = a.temporary_until_date ? String(a.temporary_until_date).slice(0, 10) : null;
      const isTemporaryActive = a.availability_mode === 'TEMPORARY' && temporaryUntil && todayYmd <= temporaryUntil;

      return {
        standingAssignmentId: a.id,
        officeId: a.office_location_id,
        officeName: a.office_name,
        roomId: a.room_id,
        roomName: a.room_label || a.room_name,
        roomNumber: a.room_number ?? null,
        weekday: a.weekday,
        hour: a.hour,
        assignedFrequency: a.assigned_frequency,
        availabilityMode: a.availability_mode,
        temporaryUntilDate: temporaryUntil,
        isTemporaryActive,
        needsTwoWeekReview: needsTwoWeek,
        bookingPlan: hasPlan
          ? {
              id: a.booking_plan_id,
              bookedFrequency: a.booked_frequency,
              bookingStartDate: a.booking_start_date ? String(a.booking_start_date).slice(0, 10) : null,
              lastConfirmedAt: a.last_confirmed_at,
              activeUntilDate: a.active_until_date ? String(a.active_until_date).slice(0, 10) : null
            }
          : null,
        needsSixWeekBookedConfirm: needsSixWeekBookedConfirm
      };
    });

    res.json({
      ok: true,
      userId,
      officeId: officeId || null,
      assignments: out,
      counts: {
        total: out.length,
        needsTwoWeekReview: out.filter((x) => x.needsTwoWeekReview).length,
        needsSixWeekBookedConfirm: out.filter((x) => x.needsSixWeekBookedConfirm).length
      }
    });
  } catch (e) {
    next(e);
  }
};

export const confirmMyBookingPlan = async (req, res, next) => {
  try {
    const planId = parseInt(req.params.planId, 10);
    if (!planId) return res.status(400).json({ error: { message: 'Invalid planId' } });

    const confirmed = req.body?.confirmed === true || req.body?.confirmed === 'true';
    if (!confirmed) return res.status(400).json({ error: { message: 'confirmed=true is required' } });

    // Ensure plan belongs to this user
    const [rows] = await pool.execute(
      `SELECT bp.id, osa.provider_id
       FROM office_booking_plans bp
       JOIN office_standing_assignments osa ON osa.id = bp.standing_assignment_id
       WHERE bp.id = ? AND bp.is_active = TRUE
       LIMIT 1`,
      [planId]
    );
    const r = rows?.[0] || null;
    if (!r) return res.status(404).json({ error: { message: 'Booking plan not found' } });
    if (Number(r.provider_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updated = await OfficeBookingPlan.confirm(planId);
    res.json({ ok: true, bookingPlan: updated });
  } catch (e) {
    next(e);
  }
};

