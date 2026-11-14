import pool from '../config/database.js';
import {decryptTicketRow} from '../utils/supportTicketCrypto.js';
import {classifyUnsolicitedOutreach} from './unsolicitedOutreachPolicy.js';
import {filterUnsolicitedOutreach,isEstablishedOutreachSender} from './unsolicitedOutreach.service.js';

/** Read-only unless apply is explicitly set; retain the original ticket as audit history. */
export async function cleanUpWebsiteSolicitations({agencyId,ticketId=null,apply=false,limit=200}={},dependencies={}) {
  const aid=Number(agencyId),tid=ticketId==null?null:Number(ticketId);
  if (!Number.isSafeInteger(aid)||aid<=0) throw new Error('A positive agency ID is required');
  if (tid!=null&&(!Number.isSafeInteger(tid)||tid<=0)) throw new Error('A positive ticket ID is required');
  const database=dependencies.database||pool;
  const established=dependencies.established||isEstablishedOutreachSender;
  const register=dependencies.register||filterUnsolicitedOutreach;
  const batchSize=Math.max(1,Math.min(1000,Math.floor(Number(limit))||200));
  const [rows]=await database.execute(`SELECT * FROM support_tickets WHERE agency_id=? AND source_channel='public_web'
    AND LOWER(COALESCE(status,''))<>'closed' AND source_email_from IS NOT NULL
    ${tid?'AND id=?':''} ORDER BY id DESC LIMIT ${batchSize}`,[aid,...(tid?[tid]:[])]);
  const matches=[];
  for (const row of rows) {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(row.source_email_from || '').trim())) continue;
    const bodyText=decryptTicketRow(row).question;
    const result=classifyUnsolicitedOutreach({bodyText,subject:row.subject});
    if (!result.reject || await established(aid,row.source_email_from)) continue;
    if (apply) {
      const suppression=await register({agencyId:aid,fromEmail:row.source_email_from,bodyText,subject:row.subject});
      if (!suppression.filtered) continue;
      const db=await database.getConnection();
      try {
        await db.beginTransaction();
        await db.execute(`UPDATE support_tickets SET status='closed',close_on_read=0 WHERE agency_id=? AND id=? AND source_channel='public_web'`,[aid,row.id]);
        await db.execute(`UPDATE communication_conversations SET is_spam=1,archived_at=COALESCE(archived_at,UTC_TIMESTAMP()),status='resolved'
          WHERE agency_id=? AND support_ticket_id=?`,[aid,row.id]);
        await db.execute(`UPDATE notifications SET is_resolved=1,resolved_at=UTC_TIMESTAMP()
          WHERE agency_id=? AND related_entity_type='support_ticket' AND related_entity_id=? AND is_resolved=0`,[aid,row.id]);
        await db.commit();
      } catch(error) {await db.rollback();throw error;} finally {db.release();}
    }
    matches.push({ticketId:row.id,category:result.reason,action:apply?'closed_and_blocked':'would_close_and_block'});
  }
  return {agencyId:aid,dryRun:!apply,scanned:rows.length,matches};
}
