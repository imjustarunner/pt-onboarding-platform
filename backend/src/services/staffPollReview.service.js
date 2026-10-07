import pool from '../config/database.js';
import {summarizePollResponses} from '../utils/staffPollResponses.js';
export async function reviewedPollResponses(eventId,db=pool){
 const [rows]=await db.execute(`SELECT r.*,v.bucket_key,v.excluded,v.reason,v.reviewed_by_user_id FROM company_event_responses r
 LEFT JOIN (SELECT history.*,ROW_NUMBER() OVER(PARTITION BY response_id ORDER BY id DESC) AS review_rank FROM staff_poll_response_reviews history WHERE company_event_id=?) v ON v.response_id=r.id AND v.review_rank=1 AND v.original_received_at=r.received_at AND BINARY v.original_body=BINARY COALESCE(r.response_body,'') WHERE r.company_event_id=?`,[eventId,eventId]);
 return rows.map(r=>({...r,bucketKey:r.bucket_key||null,excluded:!!r.excluded}));
}
export async function reviewedPollSummary(eventId,options,db=pool){return summarizePollResponses(await reviewedPollResponses(eventId,db),options);}
export async function reviewPollResponse({eventId,responseId,actorUserId,options,bucketKey,excluded,reason,originalBody,receivedAt},db=pool){
 if(typeof excluded!=='boolean'||(!excluded&&!options.some(o=>o.key===bucketKey))||!String(reason||'').trim())throw Object.assign(new Error('Choose an answer category or exclude the reply, and add a reason.'),{status:400});
 const conn=await db.getConnection();
 try{await conn.beginTransaction();const [[r]]=await conn.execute('SELECT * FROM company_event_responses WHERE company_event_id=? AND id=? FOR UPDATE',[eventId,responseId]);
 if(!r)throw Object.assign(new Error('Response not found.'),{status:404});
 if(String(r.response_body||'')!==String(originalBody||'')||new Date(r.received_at).getTime()!==new Date(receivedAt).getTime())throw Object.assign(new Error('This response changed. Refresh it before reviewing.'),{status:409});
 await conn.execute(`INSERT INTO staff_poll_response_reviews(company_event_id,response_id,original_body,original_received_at,bucket_key,excluded,reason,reviewed_by_user_id) VALUES(?,?,?,?,?,?,?,?)`,[eventId,responseId,r.response_body||'',r.received_at,excluded?null:bucketKey,excluded,String(reason).trim().slice(0,1000),actorUserId]);
 await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
