import pool from '../config/database.js';
import { canRunServerBackgroundTick } from './serverBackgroundJobsPolicy.js';
import { processDueSessionNotifications } from './sessionNotification.service.js';
import { processDueAppointmentNoShows } from './appointmentNoShowReview.service.js';

async function processDueScheduleNotices(options) {
  const {appointmentScheduleNotices} = await import('./appointmentScheduleNotice.service.js');
  return appointmentScheduleNotices.processDue(options);
}

export function createSessionNotificationWorker({
  db=pool,canRun=canRunServerBackgroundTick,process=processDueSessionNotifications,
  processNoShows=processDueAppointmentNoShows,processScheduleNotices=processDueScheduleNotices
}={}) {
  return async () => {
    // A local API, preview revision, or retired revision cannot dispatch live mail.
    if(!await canRun())return {skipped:true,reason:'not_current_production_revision'};
    const conn=await db.getConnection();let acquired=false;
    try {
      const [[lock]]=await conn.execute("SELECT GET_LOCK('session_notifications:production',0) AS acquired");
      acquired=Number(lock?.acquired)===1;if(!acquired)return {skipped:true,reason:'another_worker'};
      // Attendance deadlines must run even when the reminder queue has no work,
      // or its separate delivery source fails. The finalizer retains its own
      // per-appointment lock and ordinary recipient/consent checks.
      let noShowReviews;
      try { noShowReviews=await processNoShows({limit:20}); }
      catch { noShowReviews={failed:1,coverage:'incomplete',code:'NO_SHOW_SOURCE_UNAVAILABLE'}; }
      // Deliver due booking and schedule-change notices before their reminders.
      // A failure in this queue must not stop reminders for other appointments.
      let scheduleUpdates;
      try { scheduleUpdates = await processScheduleNotices({limit:20}); }
      catch { scheduleUpdates = {failed:1,coverage:'incomplete',code:'SCHEDULE_NOTICE_SOURCE_UNAVAILABLE'}; }
      return {...await process({limit:50,includeRelatedQueues:false}),noShowReviews,scheduleUpdates};
    } finally {try{if(acquired)await conn.execute("SELECT RELEASE_LOCK('session_notifications:production')");}finally{conn.release();}}
  };
}
export const runSessionNotificationTick=createSessionNotificationWorker();
