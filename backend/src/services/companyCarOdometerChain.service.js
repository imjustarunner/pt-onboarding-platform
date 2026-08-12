import pool from '../config/database.js';

/**
 * Maintains sequential odometer readings per company car.
 * Each trip's start equals the previous trip's end; inserting or editing pushes later trips.
 */

export async function listTripsChronological({ agencyId, companyCarId }) {
  const [rows] = await pool.execute(
    `SELECT id, drive_date, start_odometer_miles, end_odometer_miles, miles
     FROM company_car_trips
     WHERE agency_id = ? AND company_car_id = ?
     ORDER BY drive_date ASC, id ASC`,
    [agencyId, companyCarId]
  );
  return rows || [];
}

export async function getAnchorEndOdometer({ agencyId, companyCarId, beforeDate = null, beforeTripId = null }) {
  if (beforeTripId) {
    const [rows] = await pool.execute(
      `SELECT end_odometer_miles FROM company_car_trips
       WHERE agency_id = ? AND company_car_id = ? AND id < ?
       ORDER BY drive_date DESC, id DESC LIMIT 1`,
      [agencyId, companyCarId, beforeTripId]
    );
    const end = rows?.[0]?.end_odometer_miles;
    if (end != null && Number.isFinite(Number(end))) return Number(end);
  }

  if (beforeDate) {
    const [rows] = await pool.execute(
      `SELECT end_odometer_miles FROM company_car_trips
       WHERE agency_id = ? AND company_car_id = ? AND drive_date < ?
       ORDER BY drive_date DESC, id DESC LIMIT 1`,
      [agencyId, companyCarId, beforeDate]
    );
    const end = rows?.[0]?.end_odometer_miles;
    if (end != null && Number.isFinite(Number(end))) return Number(end);
  }

  const [rows] = await pool.execute(
    `SELECT end_odometer_miles FROM company_car_trips
     WHERE agency_id = ? AND company_car_id = ?
     ORDER BY drive_date DESC, id DESC LIMIT 1`,
    [agencyId, companyCarId]
  );
  const end = rows?.[0]?.end_odometer_miles;
  return end != null && Number.isFinite(Number(end)) ? Number(end) : null;
}

function tripMiles(trip) {
  const stored = Number(trip.miles);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored * 100) / 100;
  const start = Number(trip.start_odometer_miles);
  const end = Number(trip.end_odometer_miles);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.round((end - start) * 100) / 100;
  }
  return 0;
}

/**
 * Rechain odometer readings from a given trip forward (or all trips if fromTripId omitted).
 * Preserves each trip's miles; adjusts start/end to maintain continuity.
 */
export async function rechainTripsFrom({
  agencyId,
  companyCarId,
  fromTripId = null,
  fromDate = null,
  anchorEndOdometer = null
}) {
  const trips = await listTripsChronological({ agencyId, companyCarId });
  if (!trips.length) return { updated: 0, trips: [] };

  let startIndex = 0;
  if (fromTripId) {
    const idx = trips.findIndex((t) => t.id === fromTripId);
    if (idx >= 0) startIndex = idx;
  } else if (fromDate) {
    const idx = trips.findIndex((t) => String(t.drive_date).slice(0, 10) >= String(fromDate).slice(0, 10));
    if (idx >= 0) startIndex = idx;
  }

  let prevEnd = anchorEndOdometer;
  if (prevEnd == null && startIndex > 0) {
    prevEnd = Number(trips[startIndex - 1].end_odometer_miles);
  }
  if (prevEnd == null) {
    prevEnd = Number(trips[startIndex]?.start_odometer_miles) || 0;
  }

  let updated = 0;
  const updatedTrips = [];

  for (let i = startIndex; i < trips.length; i++) {
    const trip = trips[i];
    const miles = tripMiles(trip);
    const newStart = Math.round(Number(prevEnd) * 100) / 100;
    const newEnd = Math.round((newStart + miles) * 100) / 100;

    const oldStart = Number(trip.start_odometer_miles);
    const oldEnd = Number(trip.end_odometer_miles);

    if (oldStart !== newStart || oldEnd !== newEnd) {
      await pool.execute(
        `UPDATE company_car_trips
         SET start_odometer_miles = ?, end_odometer_miles = ?, miles = ?
         WHERE id = ? AND agency_id = ?`,
        [newStart, newEnd, miles, trip.id, agencyId]
      );
      updated += 1;
      updatedTrips.push({ id: trip.id, startOdometerMiles: newStart, endOdometerMiles: newEnd, miles });
    }

    prevEnd = newEnd;
  }

  return { updated, trips: updatedTrips };
}

/**
 * Assign odometer readings to new trip rows before insert (does not write to DB).
 */
export function chainOdometerForNewTrips({ anchorEndOdometer, tripRows }) {
  let prevEnd = Number(anchorEndOdometer);
  if (!Number.isFinite(prevEnd)) prevEnd = 0;

  return (tripRows || []).map((row) => {
    const miles = Math.round(Number(row.miles || 0) * 100) / 100;
    const start = Math.round(prevEnd * 100) / 100;
    const end = Math.round((start + miles) * 100) / 100;
    prevEnd = end;
    return {
      ...row,
      startOdometerMiles: start,
      endOdometerMiles: end,
      miles
    };
  });
}

/**
 * After inserting a trip, rechain all trips on or after its chronological position.
 */
export async function rechainAfterInsert({ agencyId, companyCarId, insertedTripId }) {
  return rechainTripsFrom({
    agencyId,
    companyCarId,
    fromTripId: insertedTripId
  });
}
