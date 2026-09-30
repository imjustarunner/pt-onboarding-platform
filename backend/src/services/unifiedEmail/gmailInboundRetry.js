import pool from '../../config/database.js';
import { mailboxKey } from './gmailTrafficGuard.js';
export async function deferredInboundMessages(mailbox,ids) {
 if(!ids.length)return new Set();
 const [rows]=await pool.execute(`SELECT message_id FROM gmail_inbound_message_retries WHERE mailbox_key=? AND message_id IN (${ids.map(()=>'?').join(',')}) AND next_retry_at>UTC_TIMESTAMP(3)`,[mailboxKey(mailbox),...ids]);
 return new Set(rows.map(row=>row.message_id));
}
export async function deferInboundMessage(mailbox,id,error) {
 const code=String(error.code||'processing_failed').slice(0,64);
 await pool.execute(`INSERT INTO gmail_inbound_message_retries (mailbox_key,message_id,attempts,next_retry_at,last_error_code)
 VALUES (?,?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE),?) ON DUPLICATE KEY UPDATE
 next_retry_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL LEAST(86400,300*POW(2,LEAST(attempts,9))) SECOND),attempts=attempts+1,last_error_code=VALUES(last_error_code)`,[mailboxKey(mailbox),id,code]);
}
export async function clearInboundRetry(mailbox,id) {
 await pool.execute('DELETE FROM gmail_inbound_message_retries WHERE mailbox_key=? AND message_id=?',[mailboxKey(mailbox),id]);
}
