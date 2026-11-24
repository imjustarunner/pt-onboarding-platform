// Delivery contract for the release integration. There is deliberately no live
// default adapter and no HTTP/app credentials in this module.
const requiredScopes=['transition:sequence','meeting:invites','email:transition','payroll:attendance-claim'];
export function requireTransitionAutomation(identity) {
  if(identity?.actorType!=='automation'||identity.userId!=null||typeof identity.subject!=='string'||!identity.subject.trim()||identity.agencyId!==2||
    !Array.isArray(identity.scopes)||requiredScopes.some(scope=>!identity.scopes.includes(scope)))
    throw Error('Use an explicitly scoped ITSCO automation identity; never a human or application-superadmin identity.');
  return {actorType:'automation',subject:identity.subject,agencyId:2,userId:null};
}

// Store contract:
// claim(key) is an atomic, durable pending->processing compare-and-swap.
// done(key, receipt) persists the provider result exactly once.
// review(key, reason) preserves an uncertain result; it NEVER requeues it.
// Adapter contract: each operation verifies current agency membership and live
// eligibility and uses `key` as its own durable idempotency key. The invitation
// adapter must create both calendar membership and personal email RSVP links.
export async function dispatchTransitionAction({plan,state,key,identity,store,adapters}) {
  const audit=requireTransitionAutomation(identity);
  if(state.planFingerprint!==plan.fingerprint)throw Error('Use this sequence’s frozen snapshot.');
  const action=state.outbox[key];
  if(!action||action.status!=='pending')return {skipped:true,reason:'not_pending'};
  if(!['meeting_invitation','withdraw_invitation','submit_time_claim','alternatives_email','choice_acknowledgement','final_missed_email','video_followup','rachel_roster_report','rachel_missed_report'].includes(action.kind))throw Error('Unknown transition dispatch type.');
  const report=['rachel_roster_report','rachel_missed_report'].includes(action.kind);
  const attendee=plan.providers.find(p=>p.userId===action.userId);
  if(report ? action.userId!==plan.coordinatorUserId : !attendee||plan.hostIds.includes(action.userId))throw Error('Only campaign providers or the designated Rachel report recipient may receive these actions.');
  if(action.kind==='submit_time_claim'&&Number(action.agencyId||2)!==2){
    if(!attendee?.explicitAddition||attendee.payrollAgencyId!==6||action.agencyId!==6)throw Error('The payroll practice is outside this approved audience.');
    audit.payrollAgencyId=6; // Named guest only; no host-tenant membership grant.
  }
  // An attendance result or a newly canceled invitation may have arrived after
  // the worker read its snapshot. claim() must verify the latest state and key.
  if(!await store.claim({planId:plan.id,fingerprint:plan.fingerprint,key,revision:state.revision,audit}))return {skipped:true,reason:'already_claimed_or_changed'};
  const request={plan,action,key,audit};
  try {
    let receipt;
    if(action.kind==='submit_time_claim')receipt=await adapters.upsertAttendanceClaim(request);
    else if(action.kind==='meeting_invitation')receipt=await adapters.inviteToMeeting(request);
    else if(action.kind==='withdraw_invitation')receipt=await adapters.withdrawInvitation(request);
    else receipt=await adapters.sendSequenceEmail(request);
    if(!receipt?.reference||!['created','sent','submitted','skipped'].includes(receipt.status))throw Error('Provider delivery was not confirmed.');
    await store.done({key,receipt,audit});
    return receipt;
  } catch(error){
    // A timeout can occur after a meeting/email/claim was created. Retain the
    // dispatch key and reconcile the external receipt before any retry.
    await store.review({key,reason:'Uncertain or failed result; reconcile provider receipt before retry.',audit});
    return {review:true,key};
  }
}
