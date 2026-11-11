import {latestNarrivaStatus,createNarrivaReview,narrivaFeatures} from './narrivaReview.service.js';

// Submission owns the review. Co-signing only reads its persisted evidence.
export function createSubmissionReviewer({latest=latestNarrivaStatus,create=createNarrivaReview,features=narrivaFeatures}={}){
 const pending=new Map();
 return async function reviewSubmission(req,note){
  if(!note?.provider_signed_at || Number(note.created_by_user_id)!==Number(req.user?.id))return null;
  const agencyId=Number(note.agency_id),noteId=Number(note.id),actorUserId=Number(req.user.id),key=`${agencyId}:${noteId}`;
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{
   if(!(await features(agencyId)).compliance)return null;
   const saved=await latest(req.user,agencyId,noteId,{actorUserId});
   // Unavailable results are evidence too; retrying a signature must not launch
   // another AI request or erase the author's bypass/findings.
   if(saved && saved.status!=='stale')return saved;
   const reviewRequest=Object.create(req);
   reviewRequest.body={agencyId,noteId};
   return create(reviewRequest);
  })();
  pending.set(key,job);
  try{return await job;}finally{pending.delete(key);}
 };
}
export const reviewNarrivaSubmission=createSubmissionReviewer();
