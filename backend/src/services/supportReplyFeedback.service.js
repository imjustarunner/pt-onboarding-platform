import reviewService from './supportReplyReview.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { reviewError } from '../utils/supportReplyReview.shared.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const sqlDate = value => new Date(value).toISOString().slice(0,23).replace('T',' ');
const usable = draft => draft?.readable !== false && !!String(draft?.body || '').trim() && draft.body !== '[Unable to decrypt]';
const ratings = new Set(['good','acceptable','bad']);

export function buildFeedbackEntries(report) {
  const entries=[];
  for(const row of report.rows) {
    const sent=(row.deliveries || []).filter(d=>d.status==='sent');
    const linked=new Set(sent.map(d=>d.draftSnapshotId).filter(Boolean));
    const add=(key,delivery,draft)=>entries.push({key,ticketId:row.ticketId,subject:row.subject,owner:row.owner,
      originalReceived:draft?.originalReceived || delivery?.originalReceived || row.originalReceived,
      draftSnapshots:draft?[draft]:[],deliveries:delivery?[delivery]:[],coverageFlags:row.coverageFlags,
      comparison:{draftId:draft?.id || null,generatedDraft:usable(draft)?draft.body:null,missingDraft:!!delivery&&!draft,draftUnavailable:!!draft&&!usable(draft)},
      canRateActual:!!delivery?.body && delivery.body!=='[Unable to decrypt]' && delivery.readable!==false,canRateDraft:usable(draft)});
    for(const delivery of sent) add(`reply:${delivery.id}`,delivery,row.draftSnapshots?.find(d=>d.id===delivery.draftSnapshotId));
    for(const draft of row.draftSnapshots || []) {
      if(!linked.has(draft.id) && usable(draft)) add(`draft:${draft.id}`,null,draft);
    }
  }
  return entries;
}

export function validateFeedback(input, evidence) {
  const actualRating=input.actualRating || null,draftRating=input.draftRating || null;
  if([actualRating,draftRating].some(r=>r!==null&&!ratings.has(r)))throw reviewError('Choose Good, Acceptable, or Bad.');
  if(actualRating&&!evidence.canRateActual || draftRating&&!evidence.canRateDraft)throw reviewError('An unavailable reply or draft cannot be rated.');
  const preferredReply=String(input.preferredReply || '').trim(),notes=String(input.notes || '').trim();
  if(preferredReply.length>12000||notes.length>12000)throw reviewError('Keep each written response under 12,000 characters.');
  if(!Number.isSafeInteger(input.revision)||input.revision<0)throw reviewError('Reload this review before saving.');
  if(!actualRating&&!draftRating&&!preferredReply&&!notes)throw reviewError('Add a rating or written feedback before saving.');
  return {actualRating,draftRating,preferredReply,notes};
}

export function createSupportReplyFeedbackService({db:injectedDb,review=reviewService,encrypt=encryptChatText,decrypt=decryptChatText}={}) {
  const database=async()=>injectedDb || (await import('../config/database.js')).default;
  const seal=value=>JSON.stringify(encrypt(JSON.stringify(value)));
  const open=value=>{try{return JSON.parse(decrypt(parse(value)));}catch{throw reviewError('Saved review evidence could not be read.',503,'support_review_encryption_unavailable');}};
  async function access(user,agencyId,batchId) {
    const db=await database();
    const config=await review.authorize(user,agencyId);
    const [[batch]]=await db.execute('SELECT * FROM support_reply_review_batches WHERE id=? AND agency_id=?',[batchId,agencyId]);
    if(!batch)throw reviewError('Review not found.',404);
    if(Number(batch.reviewer_user_id)!==Number(user.id)&&!['admin','super_admin'].includes(user.role))throw reviewError('This review belongs to another reviewer.',403);
    return {db,batch,config};
  }
  async function createBatch({user,agencyId,start,end,requestKey,title}) {
    const db=await database();
    const config=await review.authorize(user,agencyId,{write:true});
    if(!requestKey||requestKey.length>100||!title||title.length>200)throw reviewError('A review title and request key are required.');
    const startMs=Date.parse(start),endMs=Date.parse(end);
    if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||endMs-startMs>32*86400000)throw reviewError('Choose a review period of up to 31 days.');
    const [[existing]]=await db.execute('SELECT id FROM support_reply_review_batches WHERE agency_id=? AND request_key=?',[agencyId,requestKey]);
    if(existing)return {id:existing.id,duplicate:true};
    const window={start:new Date(startMs).toISOString(),end:new Date(endMs).toISOString(),timeZone:config.timeZone,date:new Date(endMs).toISOString().slice(0,10)};
    const report=await review.dailyReview({agencyId,config,rangeWindow:window,includeAllStaff:true});
    if(report.coverage.truncated)throw reviewError('The review exceeds the safe display limit; use a smaller date range.',409);
    const entries=buildFeedbackEntries(report);
    // Seal before beginning the transaction: missing encryption must never create a partial batch.
    const evidence=entries.map(e=>seal(e));
    const connection=await db.getConnection();
    try {
      await connection.beginTransaction();
      const [created]=await connection.execute(`INSERT INTO support_reply_review_batches
        (agency_id,reviewer_user_id,created_by_user_id,request_key,title,window_start,window_end,time_zone,counts_json,coverage_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,[agencyId,config.reviewerUserId,user.id,requestKey,title,sqlDate(start),sqlDate(end),config.timeZone,JSON.stringify({...report.totals,tickets:new Set(entries.map(e=>e.ticketId)).size}),JSON.stringify({...report.coverage,recordedConversations:report.totals.tickets,conversationsWithoutReplyOrDraft:report.rows.filter(r=>!entries.some(e=>e.ticketId===r.ticketId)).length})]);
      for(let i=0;i<entries.length;i++)await connection.execute(`INSERT INTO support_reply_review_entries
        (batch_id,agency_id,ticket_id,entry_key,evidence_encrypted) VALUES (?,?,?,?,?)`,[created.insertId,agencyId,entries[i].ticketId,entries[i].key,evidence[i]]);
      await connection.commit();return {id:created.insertId,entries:entries.length,totals:report.totals};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  async function getBatch({user,agencyId,batchId}) {
    const {db,batch,config}=await access(user,agencyId,batchId);
    const [entries]=await db.execute('SELECT * FROM support_reply_review_entries WHERE batch_id=? AND agency_id=? ORDER BY id',[batchId,agencyId]);
    const rows=entries.map(e=>({...open(e.evidence_encrypted),entryId:e.id,feedback:{...(e.feedback_encrypted?open(e.feedback_encrypted):{}),actualRating:e.actual_rating,draftRating:e.draft_rating,revision:e.revision,reviewedAt:e.reviewed_at}}));
    return {batch:{id:batch.id,title:batch.title,reviewerUserId:batch.reviewer_user_id,completedAt:batch.completed_at,total:entries.length,reviewed:entries.filter(e=>e.reviewed_at).length},
      config,window:{start:batch.window_start,end:batch.window_end,timeZone:batch.time_zone},totals:parse(batch.counts_json),coverage:parse(batch.coverage_json),rows};
  }
  async function saveFeedback({user,agencyId,batchId,entryId,input}) {
    const {db,batch}=await access(user,agencyId,batchId);
    if(batch.completed_at)throw reviewError('This review is complete. Your saved feedback remains available.',409);
    // Only Rachel writes her review; administrators can inspect and prepare it.
    if(Number(user.id)!==Number(batch.reviewer_user_id))throw reviewError('Only the assigned reviewer can save these ratings.',403);
    const [[entry]]=await db.execute('SELECT * FROM support_reply_review_entries WHERE id=? AND batch_id=? AND agency_id=?',[entryId,batchId,agencyId]);
    if(!entry)throw reviewError('Review item not found.',404);
    const feedback=validateFeedback(input,open(entry.evidence_encrypted));
    const evidence=open(entry.evidence_encrypted);
    const fullyReviewed=(!evidence.canRateActual||feedback.actualRating)&&(!evidence.canRateDraft||feedback.draftRating);
    const [saved]=await db.execute(`UPDATE support_reply_review_entries e JOIN support_reply_review_batches b ON b.id=e.batch_id
      SET e.actual_rating=?,e.draft_rating=?,e.feedback_encrypted=?,e.revision=e.revision+1,
        e.reviewed_at=?,e.updated_by_user_id=? WHERE e.id=? AND e.batch_id=? AND e.agency_id=? AND e.revision=? AND b.completed_at IS NULL`,
      [feedback.actualRating,feedback.draftRating,seal({preferredReply:feedback.preferredReply,notes:feedback.notes}),fullyReviewed?sqlDate(new Date()):null,user.id,entryId,batchId,agencyId,input.revision]);
    if(!saved.affectedRows)throw reviewError('This feedback changed in another tab. Refresh before saving again.',409,'support_review_feedback_conflict');
    return {feedback:{...feedback,revision:input.revision+1,reviewedAt:fullyReviewed?new Date().toISOString():null}};
  }
  async function completeBatch({user,agencyId,batchId}) {
    const {db,batch}=await access(user,agencyId,batchId);
    if(Number(user.id)!==Number(batch.reviewer_user_id))throw reviewError('Only the assigned reviewer can finish this review.',403);
    const [result]=await db.execute(`UPDATE support_reply_review_batches b SET completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP(3))
      WHERE id=? AND agency_id=? AND NOT EXISTS (SELECT 1 FROM support_reply_review_entries e WHERE e.batch_id=b.id AND e.reviewed_at IS NULL)`,[batchId,agencyId]);
    if(!result.affectedRows)throw reviewError('Save ratings for each available reply and draft before finishing. Written feedback can complete an item with no reply or draft.',409);
    return {completed:true};
  }
  return {createBatch,getBatch,saveFeedback,completeBatch};
}
export default createSupportReplyFeedbackService();
