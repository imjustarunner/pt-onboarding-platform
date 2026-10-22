import pool from '../config/database.js';

export const parseAuditJson = value => { if (!value) return null; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return null; } };
export const terminalDelivery = value => ['sent','delivered','queued','sending','unknown','historical_unknown','redirected'].includes(value?.status);

export async function withExchangeLock(listingId, work) {
  const connection = await pool.getConnection();
  const key = `client-exchange:${Number(listingId)}`;
  let locked = false;
  try {
    const [[row]] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [key]);
    locked = Number(row?.acquired) === 1;
    if (!locked) return { busy: true };
    return await work();
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [key]).catch(()=>{});
    connection.release();
  }
}

export async function startExchangeRun(listing) {
  await pool.execute(`INSERT INTO client_exchange_delivery_runs (listing_id,agency_id,evaluated_at) VALUES (?,?,NOW())
    ON DUPLICATE KEY UPDATE evaluated_at=NOW(),error_code=NULL,completed_at=NULL`, [listing.id,listing.agencyId]);
}
export async function finishExchangeRun(listingId, errorCode = null) {
  await pool.execute('UPDATE client_exchange_delivery_runs SET completed_at=NOW(),error_code=? WHERE listing_id=?', [errorCode,listingId]);
}
export async function saveExchangeDecision(listingId, userId, decision) {
  await pool.execute(`INSERT INTO client_exchange_match_audits (listing_id,user_id,matched,checks_json,evaluated_at) VALUES (?,?,?,?,NOW())
    ON DUPLICATE KEY UPDATE matched=VALUES(matched),checks_json=VALUES(checks_json),evaluated_at=NOW()`, [listingId,userId,decision.matched?1:0,JSON.stringify(decision.checks)]);
}
export async function saveExchangeDelivery(listingId, userId, {notificationId, email, sms}) {
  if (notificationId) await pool.execute('UPDATE client_exchange_match_audits SET notification_id=? WHERE listing_id=? AND user_id=?',[notificationId,listingId,userId]);
  for (const [column,value] of [['email_json',email],['sms_json',sms]]) if(value) {
    await pool.execute(`UPDATE client_exchange_match_audits SET ${column}=? WHERE listing_id=? AND user_id=?`,[JSON.stringify(value),listingId,userId]);
  }
}

/** Import only receipts that point to this exact listing; never resend historical successes. */
export async function exchangeDeliveryHistory(listing) {
  const [audits] = await pool.execute('SELECT * FROM client_exchange_match_audits WHERE listing_id=?',[listing.id]);
  const history = new Map(audits.map(row=>[Number(row.user_id),{notificationId:row.notification_id,email:parseAuditJson(row.email_json),sms:parseAuditJson(row.sms_json)}]));
  const [notifications] = await pool.execute(`SELECT id,user_id FROM notifications WHERE agency_id=? AND type='client_exchange_match'
    AND related_entity_type='client_exchange_listing' AND related_entity_id=? ORDER BY id`,[listing.agencyId,listing.id]);
  for(const n of notifications) {const previous=history.get(Number(n.user_id))||{};history.set(Number(n.user_id),{...previous,notificationId:previous.notificationId||n.id});}
  const [mail] = await pool.execute(`SELECT id,user_id,delivery_status,external_message_id,sent_at,body,metadata,error_message FROM user_communications
    WHERE agency_id=? AND template_type='client_exchange_match' AND body LIKE ? ORDER BY id`,[listing.agencyId,`%listingId=${listing.id}%`]);
  for(const m of mail) {
    if(!new RegExp(`listingId=${Number(listing.id)}(?:[^0-9]|$)`).test(m.body||''))continue;
    const previous=history.get(Number(m.user_id))||{};
    const metadata=parseAuditJson(m.metadata)||{};
    const status=m.delivery_status==='pending'?'queued':m.delivery_status;
    if(Number(previous.email?.communicationId)===Number(m.id)||!terminalDelivery(previous.email)||['sent','delivered'].includes(status)) previous.email={status,communicationId:m.id,messageId:m.external_message_id,sentAt:m.sent_at,reason:m.error_message||null,from:metadata.fromEmail||null};
    history.set(Number(m.user_id),previous);
  }
  const [texts] = await pool.execute(`SELECT s.id,s.user_id,s.status,s.twilio_sid,s.created_at,s.error_message FROM notification_sms_logs s JOIN notifications n ON n.id=s.notification_id
    WHERE n.agency_id=? AND n.type='client_exchange_match' AND n.related_entity_type='client_exchange_listing' AND n.related_entity_id=? ORDER BY s.id`,[listing.agencyId,listing.id]);
  for(const s of texts){const previous=history.get(Number(s.user_id))||{};
    if(!terminalDelivery(previous.sms)||s.status==='sent')previous.sms={status:s.status==='pending'?'unknown':s.status,logId:s.id,messageId:s.twilio_sid,sentAt:s.created_at,reason:s.error_message||null};
    history.set(Number(s.user_id),previous);
  }
  return history;
}

export async function recordExchangeView({listingId,userId}) {
  await pool.execute(`INSERT INTO client_exchange_views (listing_id,user_id) VALUES (?,?) ON DUPLICATE KEY UPDATE
    view_count=view_count+IF(last_viewed_at < NOW()-INTERVAL 30 SECOND,1,0),
    last_viewed_at=IF(last_viewed_at < NOW()-INTERVAL 30 SECOND,NOW(),last_viewed_at)`,[listingId,userId]);
}

export async function enrollExchangeAuditClient(listing, config) {
  if(config?.enabled!==true || !listing.clientId)return null;
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[listing.agencyId]);
    const [[existing]]=await connection.execute('SELECT ordinal FROM client_exchange_audit_clients WHERE agency_id=? AND client_id=?',[listing.agencyId,listing.clientId]);
    if(existing){await connection.commit();return existing.ordinal;}
    const [[count]]=await connection.execute('SELECT COALESCE(MAX(ordinal),0) AS last_slot FROM client_exchange_audit_clients WHERE agency_id=?',[listing.agencyId]);
    const next=Number(count.last_slot)+1;
    if(next>Math.min(50,Number(config.limit)||50)){await connection.commit();return null;}
    await connection.execute('INSERT INTO client_exchange_audit_clients (agency_id,client_id,ordinal) VALUES (?,?,?)',[listing.agencyId,listing.clientId,next]);
    await connection.commit();return next;
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

export async function getExchangeAudit(listingId) {
  const [[run]]=await pool.execute('SELECT * FROM client_exchange_delivery_runs WHERE listing_id=?',[listingId]);
  const [rows]=await pool.execute(`SELECT a.*,u.first_name,u.last_name,COALESCE(NULLIF(u.work_email,''),u.email) email,
    COALESCE(v.view_count,0) views,v.last_viewed_at FROM client_exchange_match_audits a JOIN users u ON u.id=a.user_id
    LEFT JOIN client_exchange_views v ON v.listing_id=a.listing_id AND v.user_id=a.user_id WHERE a.listing_id=? ORDER BY a.matched DESC,u.last_name,u.first_name`,[listingId]);
  const communicationIds=rows.map(row=>parseAuditJson(row.email_json)?.communicationId).filter(Boolean);
  if(communicationIds.length){
    const [receipts]=await pool.execute(`SELECT id,delivery_status,opened_at,first_clicked_at FROM user_communications WHERE id IN (${communicationIds.map(()=>'?').join(',')})`,communicationIds);
    for(const row of rows){const email=parseAuditJson(row.email_json);const receipt=receipts.find(r=>Number(r.id)===Number(email?.communicationId));
      if(receipt)row.email_json={...email,status:receipt.delivery_status==='pending'?'queued':receipt.delivery_status,openedAt:receipt.opened_at,firstClickedAt:receipt.first_clicked_at};}
  }
  const [[views]]=await pool.execute('SELECT COALESCE(SUM(view_count),0) total,COUNT(*) unique_viewers FROM client_exchange_views WHERE listing_id=?',[listingId]);
  const [viewers]=await pool.execute(`SELECT v.user_id,u.first_name,u.last_name,v.view_count,v.last_viewed_at FROM client_exchange_views v JOIN users u ON u.id=v.user_id WHERE listing_id=? ORDER BY v.last_viewed_at DESC`,[listingId]);
  const [[tracking]]=await pool.execute("SELECT executed_at FROM migrations_log WHERE migration_name='1695_client_exchange_delivery_audit' AND success=1 LIMIT 1");
  return {listingId,run,trackingStartedAt:tracking?.executed_at||null,views,viewers,providers:rows.map(row=>({userId:row.user_id,name:[row.first_name,row.last_name].filter(Boolean).join(' '),email:row.email,matched:!!row.matched,checks:parseAuditJson(row.checks_json)||[],notificationId:row.notification_id,emailDelivery:parseAuditJson(row.email_json),smsDelivery:parseAuditJson(row.sms_json),views:Number(row.views),lastViewedAt:row.last_viewed_at,evaluatedAt:row.evaluated_at}))};
}

export async function isExchangeListingOpen(listing) {
  const [[row]]=await pool.execute(`SELECT l.status,c.status AS client_status FROM client_exchange_listings l
    JOIN clients c ON c.id=l.client_id AND c.agency_id=l.agency_id WHERE l.id=? AND l.agency_id=?`,[listing.id,listing.agencyId]);
  return !!row && ['open','requested'].includes(row.status) && !['ARCHIVED','DECLINED'].includes(String(row.client_status).toUpperCase());
}
