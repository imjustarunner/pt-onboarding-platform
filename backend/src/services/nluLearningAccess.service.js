import pool from '../config/database.js';
import User from '../models/User.model.js';
import { nluAgencySlugs } from '../data/nluLearningMeasures.js';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function isNluAgency(agencyId) {
  const [[agency]] = await pool.execute('SELECT id, slug FROM agencies WHERE id = ?', [Number(agencyId)]);
  return !!agency && nluAgencySlugs.includes(String(agency.slug || '').toLowerCase());
}
export async function assertPilotCatalogAgency(user, agencyId) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) fail(400, 'Select a valid agency.');
  if (user.role !== 'super_admin' && !(await User.getAgencies(user.id)).some(a => Number(a.id) === Number(agencyId))) fail(403, 'Agency access required.');
}
export function normalizePilotContext(measure, input, user, now = new Date()) {
  if (!input || input.programConfirmed !== true) fail(400, 'Confirm this is an NLU Therapy Plus Tutoring pilot administration.');
  if (!Number.isInteger(input.age) || input.age < 8 || input.age > 17) fail(400, 'This pilot is for ages 8–17.');
  if (typeof input.observedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn)) fail(400, 'Enter the observation date.');
  const date = new Date(`${input.observedOn}T12:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== input.observedOn || input.observedOn > now.toISOString().slice(0,10)) fail(400, 'Enter a valid observation date that is not in the future.');
  let respondentSeries = measure.respondent === 'student' ? 'student' : `observer:${user.id}`;
  if (measure.respondent === 'caregiver') {
    if (!['caregiver_1', 'caregiver_2', 'caregiver_3'].includes(input.respondentSeries)) fail(400, 'Select the same caregiver identifier for repeat reports.');
    respondentSeries = input.respondentSeries;
  }
  return { programConfirmed: true, age: input.age, observedOn: input.observedOn, respondent: measure.respondent, respondentSeries };
}
