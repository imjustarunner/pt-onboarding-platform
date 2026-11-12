import crypto from 'node:crypto';
import pool from '../config/database.js';
import { isNoteworthyPractice } from './noteworthyRoster.service.js';

export function createNoteworthyImportReceipts(db=pool) {
  async function begin({agencyId,periodId,buffer}) {
    if(!await isNoteworthyPractice(agencyId,db))return null;
    const digest=crypto.createHash('sha256').update(buffer).digest('hex');
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId]);
      const [[prior]]=await conn.execute('SELECT * FROM noteworthy_import_receipts WHERE agency_id=? AND payroll_period_id=? AND file_sha256=? FOR UPDATE',[agencyId,periodId,digest]);
      if(prior?.status==='complete'){
        const [[saved]]=await conn.execute('SELECT * FROM payroll_imports WHERE id=? AND agency_id=? AND payroll_period_id=?',[prior.payroll_import_id,agencyId,periodId]);
        if(saved){const [[count]]=await conn.execute('SELECT COUNT(*) inserted FROM payroll_import_rows WHERE payroll_import_id=?',[saved.id]);await conn.commit();return {reused:true,response:{import:saved,inserted:Number(count.inserted),createdUsers:[],unmatchedProvidersSample:[],reused:true}};}
        // Reset/deleted imports no longer reserve their original content hash.
        await conn.execute('DELETE FROM noteworthy_import_receipts WHERE id=?',[prior.id]);
      } else if(prior && (prior.status==='processing' || prior.payroll_import_id)) {
        throw Object.assign(new Error('This report is already importing or needs review of an interrupted import. Refresh the period before uploading again; saved payroll and decisions are preserved.'),{status:409,code:'NOTEWORTHY_IMPORT_IN_PROGRESS'});
      } else if(prior)await conn.execute('DELETE FROM noteworthy_import_receipts WHERE id=?',[prior.id]);
      const [made]=await conn.execute('INSERT INTO noteworthy_import_receipts(agency_id,payroll_period_id,file_sha256) VALUES(?,?,?)',[agencyId,periodId,digest]);
      await conn.commit();return {id:made.insertId};
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  }
  async function created(receipt,importId){if(receipt?.id)await db.execute('UPDATE noteworthy_import_receipts SET payroll_import_id=? WHERE id=?',[importId,receipt.id]);}
  async function complete(receipt){if(receipt?.id)await db.execute("UPDATE noteworthy_import_receipts SET status='complete' WHERE id=?",[receipt.id]);}
  async function failed(receipt){if(receipt?.id)await db.execute("UPDATE noteworthy_import_receipts SET status='failed' WHERE id=? AND status='processing'",[receipt.id]);}
  return {begin,created,complete,failed};
}
export default createNoteworthyImportReceipts();
