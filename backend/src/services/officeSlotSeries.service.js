/**
 * officeSlotSeries.service.js
 *
 * Shared utilities for validating, generating, and describing office slot
 * recurrence series. Used by both the legacy availability controller and the
 * newer officeSchedule controller so that recurrence logic stays in one place.
 */

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function normalizeYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toYmd(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(dateLike, days) {
  const d = new Date(dateLike instanceof Date ? dateLike.getTime() : dateLike);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// Recurrence normalization
// ---------------------------------------------------------------------------

/**
 * Normalise a raw recurrence value + raw occurrence count into a validated
 * { recurrence, occurrenceCount } pair.
 */
function normalizeOfficeRequestRecurrence({ recurrenceRaw, occurrenceCountRaw }) {
  const allowed = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']);
  const recurrence = String(recurrenceRaw || 'ONCE').trim().toUpperCase();
  const normalizedRecurrence = allowed.has(recurrence) ? recurrence : 'ONCE';
  if (normalizedRecurrence === 'ONCE') {
    return { recurrence: 'ONCE', occurrenceCount: 1 };
  }
  const max = normalizedRecurrence === 'WEEKLY' ? 6 : 104;
  const parsed = parseInt(occurrenceCountRaw, 10);
  const occurrenceCount = Math.min(
    max,
    Math.max(1, Number.isFinite(parsed) ? parsed : (normalizedRecurrence === 'WEEKLY' ? 6 : 1))
  );
  return { recurrence: normalizedRecurrence, occurrenceCount };
}

/**
 * Returns the number of days between occurrences for a given recurrence type.
 */
function stepDaysForRecurrence(recurrence) {
  const r = String(recurrence || 'ONCE').toUpperCase();
  if (r === 'BIWEEKLY') return 14;
  if (r === 'MONTHLY') return 28;
  if (r === 'WEEKLY') return 7;
  return 0; // ONCE
}

/**
 * Human-readable label for a recurrence + occurrence count.
 * e.g. recurrenceLabel('WEEKLY', 6) → 'Weekly × 6'
 */
function recurrenceLabel(recurrence, occurrenceCount) {
  const r = String(recurrence || 'ONCE').toUpperCase();
  const labels = { ONCE: 'Once', WEEKLY: 'Weekly', BIWEEKLY: 'Biweekly', MONTHLY: 'Monthly' };
  const base = labels[r] || r;
  if (r === 'ONCE' || !occurrenceCount || Number(occurrenceCount) <= 1) return base;
  return `${base} × ${occurrenceCount}`;
}

// ---------------------------------------------------------------------------
// Occurrence generation
// ---------------------------------------------------------------------------

/**
 * Generate all YYYY-MM-DD occurrence dates for a slot series.
 *
 * @param {object} opts
 * @param {string} opts.startDate         YYYY-MM-DD of first occurrence
 * @param {string} opts.recurrence        'ONCE'|'WEEKLY'|'BIWEEKLY'|'MONTHLY'
 * @param {number} opts.occurrenceCount   how many occurrences (1 for ONCE)
 * @returns {string[]}  array of YYYY-MM-DD strings
 */
function generateOccurrenceDates({ startDate, recurrence, occurrenceCount }) {
  if (!startDate) return [];
  const normalized = normalizeYmd(startDate);
  if (!normalized) return [];
  const count = Math.max(1, Number(occurrenceCount || 1));
  const step = stepDaysForRecurrence(recurrence);
  if (step === 0 || count === 1) return [normalized]; // ONCE or single occurrence
  const base = new Date(normalized + 'T00:00:00');
  const dates = [];
  for (let i = 0; i < count; i++) {
    dates.push(toYmd(addDays(base, i * step)));
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Pre-flight conflict validation
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Validate that every occurrence in an office slot series is free.
 * Checks both materialised office_events and active standing assignments.
 *
 * @param {object} opts
 * @param {import('mysql2/promise').Pool} opts.pool         MySQL pool
 * @param {number}   opts.providerId         provider being assigned
 * @param {number}   opts.roomId             room being assigned
 * @param {number}   opts.officeLocationId   office location
 * @param {string}   opts.startDate          YYYY-MM-DD of first occurrence
 * @param {number}   opts.weekday            0=Sun … 6=Sat
 * @param {number}   opts.startHour          integer hour (0-23)
 * @param {number}   opts.endHour            integer hour (exclusive)
 * @param {string}   opts.recurrence         'ONCE'|'WEEKLY'|'BIWEEKLY'|'MONTHLY'
 * @param {number}   opts.occurrenceCount
 *
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: object }>}
 */
async function validateOfficeSlotSeries({
  pool,
  providerId,
  roomId,
  officeLocationId,
  startDate,
  weekday,
  startHour,
  endHour,
  recurrence,
  occurrenceCount
}) {
  const occurrenceDates = generateOccurrenceDates({ startDate, recurrence, occurrenceCount });

  for (let oi = 0; oi < occurrenceDates.length; oi++) {
    const occDate = occurrenceDates[oi];

    for (let h = startHour; h < endHour; h++) {
      const startAt = `${occDate} ${String(h).padStart(2, '0')}:00:00`;
      const endAt   = `${occDate} ${String(h + 1).padStart(2, '0')}:00:00`;

      // Check for a concrete office_event blocking this slot (from a different provider)
      const [evConflicts] = await pool.execute(
        `SELECT e.id, u.first_name, u.last_name, r.label AS room_label, r.room_number
         FROM office_events e
         JOIN office_rooms r ON r.id = e.room_id
         LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
         WHERE e.room_id = ?
           AND e.start_at < ?
           AND e.end_at > ?
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           AND COALESCE(e.booked_provider_id, e.assigned_provider_id) != ?
         LIMIT 1`,
        [roomId, endAt, startAt, providerId]
      );
      if (evConflicts?.length) {
        const c = evConflicts[0];
        const roomLabel = c.room_number
          ? `#${c.room_number} ${c.room_label || ''}`.trim()
          : (c.room_label || `Room ${roomId}`);
        const blocker = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'another provider';
        const dateLabel = new Date(occDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        return {
          ok: false,
          status: 409,
          error: {
            message: `Cannot approve — ${roomLabel} is already booked by ${blocker} on ${dateLabel} at ${DAY_NAMES[weekday] || weekday} ${h}:00. Please choose a different room or start date.`,
            blockedOccurrence: oi + 1,
            blockedDate: occDate,
            blockingProvider: blocker,
            roomLabel
          }
        };
      }

      // Check for a conflicting recurring standing assignment from another provider
      if (officeLocationId) {
        const [saConflicts] = await pool.execute(
          `SELECT a.id, u.first_name, u.last_name
           FROM office_standing_assignments a
           JOIN users u ON u.id = a.provider_id
           WHERE a.office_location_id = ?
             AND a.room_id = ?
             AND a.weekday = ?
             AND a.hour = ?
             AND a.is_active = TRUE
             AND a.provider_id != ?
           LIMIT 1`,
          [officeLocationId, roomId, weekday, h, providerId]
        );
        if (saConflicts?.length) {
          const c = saConflicts[0];
          const blocker = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'another provider';
          const dateLabel = new Date(occDate + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
          });
          return {
            ok: false,
            status: 409,
            error: {
              message: `Cannot approve — this room/time is already assigned to ${blocker} (recurring). Occurrence #${oi + 1} on ${dateLabel} is blocked. Please choose a different room.`,
              blockedOccurrence: oi + 1,
              blockedDate: occDate,
              blockingProvider: blocker
            }
          };
        }
      }
    }
  }

  return { ok: true };
}

export {
  normalizeYmd,
  toYmd,
  addDays,
  normalizeOfficeRequestRecurrence,
  stepDaysForRecurrence,
  recurrenceLabel,
  generateOccurrenceDates,
  validateOfficeSlotSeries
};
