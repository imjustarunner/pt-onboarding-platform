import pool from '../config/database.js';
import { databasePoolLimits } from '../config/databasePoolLimits.js';

const connectionLimit = pool.pool?.config?.connectionLimit || databasePoolLimits().connectionLimit;
const maxLocks = Math.max(0, Math.min(4, connectionLimit - 1));
let activeLocks = 0;
const busy = () => Object.assign(new Error('This client’s historical records are being imported. Wait for that import to finish, then retry.'), { status:409, code:'EHR_IMPORT_BUSY' });

/** Serialize source lookup/create across operators without adding a second record store. */
export async function withHistoricalImportLock(agencyId, clientId, kind, work, database = pool) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<1 || !Number.isSafeInteger(Number(clientId)) || Number(clientId)<1 || !['intake','plan','archive'].includes(kind)) throw new Error('Invalid historical import context');
  if (activeLocks >= maxLocks) throw busy();
  activeLocks++;
  let connection, acquired=false, uncertain=false;
  const key=`ehr-import:${kind}:${Number(agencyId)}:${Number(clientId)}`;
  try {
    connection=await database.getConnection();
    const [[result]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[key]);
    acquired=Number(result?.acquired)===1;
    if(!acquired)throw busy();
    return await work();
  } finally {
    try {
      if(acquired){const [[result]]=await connection.execute('SELECT RELEASE_LOCK(?) AS released',[key]);if(Number(result?.released)!==1)throw new Error('Lock release uncertain');}
    } catch {
      uncertain=true;
      try{connection?.destroy();}catch{/* Already closed. */}
      console.error('[ehrHistoricalImport] Closed an uncertain import lock connection');
    } finally {
      activeLocks--;
      if(connection&&!uncertain)connection.release();
    }
  }
}
