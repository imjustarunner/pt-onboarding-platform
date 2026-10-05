import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';

function key() {
  if (!process.env.JWT_SECRET) throw new Error('School visit link signing is not configured');
  return createHmac('sha256', process.env.JWT_SECRET).update('itsco-school-visit-change-v1').digest('hex');
}
export function createSchoolVisitChangeToken(bookingId) {
  return jwt.sign({ bookingId: Number(bookingId) }, key(), {
    algorithm: 'HS256', audience: 'school-visit-change', issuer: 'itsco-schools', expiresIn: '45d'
  });
}
export function verifySchoolVisitChangeToken(token) {
  try {
    const value = jwt.verify(String(token || ''), key(), { algorithms: ['HS256'], audience: 'school-visit-change', issuer: 'itsco-schools' });
    if (!Number.isInteger(value.bookingId) || value.bookingId <= 0) throw new Error('Invalid booking');
    return value.bookingId;
  } catch {
    throw Object.assign(new Error('This visit link is invalid or expired. Please contact schools@itsco.health.'), { status: 404 });
  }
}
