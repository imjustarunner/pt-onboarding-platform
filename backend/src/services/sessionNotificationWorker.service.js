import pool from '../config/database.js';
import { canRunServerBackgroundTick } from './serverBackgroundJobsPolicy.js';
import { processDueSessionNotifications } from './sessionNotification.service.js';

export function createSessionNotificationWorker({db=pool,canRun=canRunServerBackgroundTick,process=processDueSessionNotifications}={}) {
  return async () => {
    // A local API, preview revision, or retired revision cannot dispatch live mail.
    if(!await canRun())return {skipped:true,reason:'not_current_production_revision'};
    const conn=await db.getConnection();let acquired=false;
    try {
      const [[lock]]=await conn.execute("SELECT GET_LOCK('session_notifications:production',0) AS acquired");
      acquired=Number(lock?.acquired)===1;if(!acquired)return {skipped:true,reason:'another_worker'};
      return await process({limit:50,includeRelatedQueues:false});
    } finally {try{if(acquired)await conn.execute("SELECT RELEASE_LOCK('session_notifications:production')");}finally{conn.release();}}
  };
}
export const runSessionNotificationTick=createSessionNotificationWorker();
