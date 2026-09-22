/** Compatibility for old callers. The Mon/Wed/Fri status digest is retired. */
import pool from '../config/database.js';
import { queueSchoolClientStatusEmails } from './schoolClientStatusEmail.service.js';
export const DIGEST_CATEGORY_READY = 'ready_to_schedule';
export const DIGEST_CATEGORY_WAITLIST = 'waitlist';
export async function enqueueReadyToScheduleDigest({clientId,waitlistReason=null}) {
  return queueSchoolClientStatusEmails(pool,{clientId,waitlistReason});
}
export const enqueueWaitlistDigest = enqueueReadyToScheduleDigest;
export async function runReadyToScheduleDigestTick() {
  return {ran:false,reason:'replaced_by_immediate_school_status_emails'};
}
