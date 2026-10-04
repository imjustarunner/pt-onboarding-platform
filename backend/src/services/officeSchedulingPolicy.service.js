import pool from '../config/database.js';
import { ymd } from '../utils/officeSchedulingPolicy.js';

export async function attachOfficeSchedulingPolicies(assignments, db = pool) {
  const ids = [...new Set(assignments.map(a => Number(a.booking_agency_id)).filter(Boolean))];
  if (!ids.length) return assignments;
  const [rows] = await db.execute(`SELECT agency_id, transition_date FROM office_scheduling_policies WHERE agency_id IN (${ids.map(() => '?').join(',')})`, ids);
  const dates = new Map(rows.map(r => [Number(r.agency_id), ymd(r.transition_date)]));
  return assignments.map(a => ({ ...a, transition_date: dates.get(Number(a.booking_agency_id)) || null }));
}
