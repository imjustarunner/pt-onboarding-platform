import pool from '../config/database.js';
import {notifyExchangeClaim} from './clientExchangeNotifications.service.js';

/** External notifications run after the request transaction, outside the HTTP response. */
export async function processExchangeRequestNotices({limit=10}={}) {
  const size=Math.min(25,Math.max(1,Number.isInteger(limit)?limit:10));
  const [pending]=await pool.execute(`SELECT request_id FROM client_exchange_request_notice_queue WHERE status='pending' ORDER BY created_at LIMIT ${size}`);
  for(const row of pending) {
    const [claim]=await pool.execute("UPDATE client_exchange_request_notice_queue SET status='sending',attempted_at=NOW() WHERE request_id=? AND status='pending'",[row.request_id]);
    if(!claim.affectedRows)continue;
    let status='completed';
    try {
      const [[request]]=await pool.execute(`SELECT l.*,r.id AS request_id,r.status AS request_status,r.requesting_provider_user_id FROM client_exchange_requests r JOIN client_exchange_listings l ON l.id=r.listing_id WHERE r.id=?`,[row.request_id]);
      if(request?.request_status==='pending') await notifyExchangeClaim({listing:request,requestingProviderUserId:request.requesting_provider_user_id,requestId:row.request_id});
    } catch(error) {status='needs_review';console.error('[clientExchange] Request notification needs review',{requestId:row.request_id,code:error?.code||'notification_failed'});}
    await pool.execute('UPDATE client_exchange_request_notice_queue SET status=?,completed_at=NOW() WHERE request_id=?',[status,row.request_id]);
  }
  // Never repeat a potentially delivered email after a worker interruption.
  await pool.execute("UPDATE client_exchange_request_notice_queue SET status='needs_review' WHERE status='sending' AND attempted_at<NOW()-INTERVAL 15 MINUTE");
  return {checked:pending.length};
}
