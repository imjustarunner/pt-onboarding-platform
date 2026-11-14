// Application validation for new plan saves; historical signed plans are untouched.
export function treatmentPlanGoalTimeframes(goals, {finalize=false,effectiveDate}={}) {
 return goals.map((goal,index)=>{
  let projected=typeof goal.projectedCompletion==='string'?goal.projectedCompletion.trim():'';
  const months=Number(goal.durationMonths);
  if(!projected && Number.isInteger(months)&&months>=1&&months<=36 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate||'')){
   const date=new Date(`${effectiveDate}T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+months);
   if(Number.isFinite(date.getTime()))projected=date.toISOString().slice(0,10);
  }
  if(finalize&&!projected)throw Object.assign(new Error(`Choose a completion timeframe for goal ${index+1} before finalizing. An incomplete draft can be saved.`),{status:400,code:'PLAN_GOAL_TIMEFRAME_REQUIRED'});
  return {...goal,projectedCompletion:projected||null};
 });
}
