/** Reconcile a finalized supervisor's recorded duration without rewriting posted pay. Caller locks the session. */
export async function reconcileSupervisorClaim(db,{claimId,payload,claimDate,suggestedPayrollPeriodId,actorUserId}) {
 const [[claim]]=await db.execute('SELECT * FROM payroll_time_claims WHERE id=? FOR UPDATE',[claimId]);
 if(!claim)return null;
 const prior=typeof claim.payload_json==='string'?JSON.parse(claim.payload_json):claim.payload_json||{};
 const minutes=Number(payload.totalMinutes),oldMinutes=Number(prior.totalMinutes||0);
 if(!['approved','paid'].includes(claim.status)) {
  if(Math.abs(minutes-oldMinutes)<0.01&&prior.serviceCode===payload.serviceCode)return {changed:false};
  await db.execute("UPDATE payroll_time_claims SET payload_json=?,credits_hours=?,status='submitted',rejection_reason=NULL WHERE id=?",[JSON.stringify({...payload,previousMinutes:oldMinutes,correctionRecordedBy:actorUserId}),minutes/60,claim.id]);
  return {changed:true,claimId:claim.id};
 }
 // Preserve the accepted record; one open correction represents the current difference.
 const [corrections]=await db.execute("SELECT * FROM payroll_time_claims WHERE agency_id=? AND user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.source'))='supervision_payroll_correction' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.originalClaimId')) AS UNSIGNED)=? ORDER BY id FOR UPDATE",[claim.agency_id,claim.user_id,claim.id]);
 let acceptedMinutes=oldMinutes,acceptedAmount=Number(claim.applied_amount||0);
 for(const c of corrections.filter(c=>['approved','paid'].includes(c.status))){const p=typeof c.payload_json==='string'?JSON.parse(c.payload_json):c.payload_json;acceptedMinutes+=Number(p.totalMinutes||0);acceptedAmount+=Number(c.applied_amount||0);}
 const rate=oldMinutes>0?Number(claim.applied_amount||0)/(oldMinutes/60):0;
 const deltaMinutes=Math.round((minutes-acceptedMinutes)*100)/100;
 const deltaAmount=Math.round((minutes/60*rate-acceptedAmount)*100)/100;
 const pending=corrections.find(c=>['submitted','deferred','needs_changes'].includes(c.status));
 if(deltaMinutes===0&&deltaAmount===0&&prior.serviceCode===payload.serviceCode){if(pending)await db.execute("UPDATE payroll_time_claims SET status='withdrawn' WHERE id=?",[pending.id]);return {changed:false};}
 const next={...payload,source:'supervision_payroll_correction',originalClaimId:claim.id,totalMinutes:deltaMinutes,amount:deltaAmount,amountExplicit:true,requiresPayrollReview:true,previousAcceptedMinutes:acceptedMinutes,correctedTotalMinutes:minutes,description:'Supervision time correction. Verify against the original payroll and approve only the difference.',allocations:[{serviceTypeLabel:'Supervision correction',minutes:deltaMinutes,note:`Original claim #${claim.id}; revised session total ${minutes} minutes.`}]};
 if(prior.serviceCode!==payload.serviceCode||!(rate>0)){delete next.amount;delete next.amountExplicit;next.rateReviewRequired=true;}
 if(pending){await db.execute("UPDATE payroll_time_claims SET payload_json=?,credits_hours=?,status='submitted' WHERE id=?",[JSON.stringify(next),deltaMinutes/60,pending.id]);return {changed:true,claimId:pending.id,correction:true};}
 const [r]=await db.execute("INSERT INTO payroll_time_claims (agency_id,user_id,submitted_by_user_id,status,claim_type,claim_date,payload_json,suggested_payroll_period_id,bucket,credits_hours) VALUES (?,?,?,'submitted','indirect_time',?,?,?,'indirect',?)",[claim.agency_id,claim.user_id,actorUserId||claim.user_id,claimDate,JSON.stringify(next),suggestedPayrollPeriodId,deltaMinutes/60]);
 return {changed:true,claimId:r.insertId,correction:true};
}
