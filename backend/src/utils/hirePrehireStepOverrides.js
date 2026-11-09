export const PREHIRE_OVERRIDE_PREFIX='staff-override:';
export const canOverridePrehireStep=step=>step?.required!==false && !['work-email','review','hiring-notifications'].includes(step?.key);
export function applyPrehireStepOverrides(steps,submissions={}) {
 return steps.map(step=>{
  const saved=submissions[`pre_hire:${PREHIRE_OVERRIDE_PREFIX}${step.key}`];const value=saved?.value;
  if(!canOverridePrehireStep(step)||!saved?.completedAt||value?.type!=='staff_pre_hire_override'||value.active!==true||!value.actorUserId||!value.reason)return step;
  return {...step,actualComplete:step.complete,complete:true,staffOverride:{reason:value.reason,actorUserId:value.actorUserId,actorName:value.actorName,at:value.at}};
 });
}
