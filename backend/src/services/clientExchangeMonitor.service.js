import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {getListingById} from './clientExchange.service.js';
import {notifyExchangeMatches} from './clientExchangeNotifications.service.js';

/** Retry interrupted evaluations and send daily pilot audits. Listing locks and delivery receipts prevent repeated alerts. */
export async function monitorClientExchange({limit=10}={}) {
  const batchSize=Math.max(1,Math.min(50,Number.isFinite(Number(limit))?Math.trunc(Number(limit)):10));
  const [rows]=await pool.execute(`SELECT l.id,l.posted_by_user_id,l.client_id FROM client_exchange_listings l
    JOIN agencies a ON a.id=l.agency_id LEFT JOIN client_exchange_delivery_runs r ON r.listing_id=l.id
    WHERE l.status IN ('open','requested') AND (
      (r.listing_id IS NOT NULL AND r.completed_at IS NULL AND (r.evaluated_at IS NULL OR r.evaluated_at<NOW()-INTERVAL 5 MINUTE))
      OR (r.error_code IS NOT NULL AND r.completed_at<NOW()-INTERVAL 1 HOUR)
      OR (JSON_EXTRACT(a.feature_flags,'$.clientExchangeAudit.enabled')=true
        AND (r.listing_id IS NULL OR r.completed_at<NOW()-INTERVAL 24 HOUR)))
    ORDER BY COALESCE(r.completed_at,l.created_at),l.id LIMIT ${batchSize}`);
  for(const row of rows) {
    try {
      const listing=await getListingById(row.id,{viewerUserId:row.posted_by_user_id,viewerRole:'admin'});
      if(!listing||!['open','requested'].includes(listing.status))continue;
      const client=await Client.findById(row.client_id);
      if(!client||['ARCHIVED','DECLINED'].includes(String(client.status).toUpperCase()))continue;
      await notifyExchangeMatches({listing,client});
    }catch(error){console.error('[clientExchange] Monitor retry needed',{listingId:row.id,code:error?.code||'monitor_failed'});}
  }
  return {checked:rows.length};
}
