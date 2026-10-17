// Requirement balances are meaningful only for people enrolled in that tracker.
// Everyone else still has actual individual/group attendance to display.
export async function supervisionProgress(supervision, loadAttendance) {
  if (supervision?.enabled && supervision.isPrelicensed) return {
    enabled:true, mode:'requirements',
    individualHours:Number(supervision.individualHours || 0), groupHours:Number(supervision.groupHours || 0),
    requiredIndividual:Number(supervision.requiredIndividualHours || 50), requiredGroup:Number(supervision.requiredGroupHours || 50)
  };
  const attendance = await loadAttendance();
  if (!attendance?.ok) throw new Error('Unable to load recorded supervision attendance.');
  return {enabled:true,mode:'attendance',individualHours:Number(attendance.individualHours || 0),
    groupHours:Number(attendance.groupHours || 0),requiredIndividual:0,requiredGroup:0};
}
