import pool from '../config/database.js';

/** One scheduler owns a mailbox job across Cloud Run replicas. The connection
 * remains checked out because MySQL advisory locks are connection-scoped. */
export async function withMessagingJobLock(name, work) {
  const db=await pool.getConnection();
  let acquired=false;
  try {
    const [[row]]=await db.execute('SELECT GET_LOCK(?, 0) AS acquired',[`messaging:${name}`]);
    acquired=Number(row.acquired)===1;
    if(!acquired)return {skipped:'already_running'};
    return await work();
  } finally {
    if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[`messaging:${name}`]).catch(()=>{});
    db.release();
  }
}
