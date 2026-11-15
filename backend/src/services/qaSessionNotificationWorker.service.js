import pool from '../config/database.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { isNluTutoringQaAgency } from '../utils/nluTutoringQaPolicy.js';
import { canRunServerBackgroundTick } from './serverBackgroundJobsPolicy.js';
import { processDueSessionNotifications } from './sessionNotification.service.js';

// The related booking/change queues have a separate, exact synthetic scope.
// Ordinary production reminders keep their existing independent dispatcher.
export function createQaSessionNotificationWorker({db=pool,canRun=canRunServerBackgroundTick,process=processDueSessionNotifications}={}) {
  return async () => {
    if(!await canRun())return {skipped:true,reason:'not_current_production_revision'};
    const [rows]=await db.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id IN (450,453,454)');
    const agencies=(rows||[]).filter(agency=>agency&&(isAuricwellQaAgency(agency)||isNluTutoringQaAgency(agency))
      &&Number(agency.is_active)===1&&Number(agency.is_archived||0)!==1);
    const results=[],failed=[];
    for(const agency of agencies) {
      const agencyId=Number(agency.id),connection=await db.getConnection();let acquired=false;
      try {
        const key=`qa_session_notifications:${agencyId}`;
        const [[lock]]=await connection.execute('SELECT GET_LOCK(?, 0) AS acquired',[key]);
        acquired=Number(lock?.acquired)===1;
        if(!acquired){results.push({agencyId,skipped:true,reason:'another_worker'});continue;}
        results.push({agencyId,...await process({agencyId,limit:50,includeRelatedQueues:true})});
      } catch { failed.push(agencyId); }
      finally {
        try {if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[`qa_session_notifications:${agencyId}`]);}
        finally {connection.release();}
      }
    }
    if(failed.length)throw Object.assign(new Error('Scoped QA notification queues need review.'),{code:'QA_SESSION_QUEUE_FAILED',agencyIds:failed});
    return {agencies:results};
  };
}
export const runQaSessionNotificationTick=createQaSessionNotificationWorker();
