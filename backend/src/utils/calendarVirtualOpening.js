// Preserve a saved publication's identity and service when projecting it into
// the staff calendar. Current-family-only windows remain visible to their owner.
export function calendarVirtualOpening(row) {
  const sessionType=String(row.sessionType||'REGULAR').toUpperCase();
  const enabled=(value,fallback)=>value==null?fallback:value===true||Number(value)===1;
  const forIntake=enabled(row.availableForIntake,['INTAKE','BOTH'].includes(sessionType));
  const forSession=enabled(row.availableForSession,['REGULAR','BOTH'].includes(sessionType));
  if(!forIntake&&!forSession)return null;
  return {id:Number(row.id)||null,agencyId:Number(row.agencyId),dayOfWeek:row.dayOfWeek,startTime:row.startTime,endTime:row.endTime,
    sessionType,availableForIntake:forIntake,availableForSession:forSession,
    startDate:row.startDate,endDate:row.endDate,purpose:row.purpose,excludedDates:row.excludedDates,careTypes:row.careTypes,serviceType:row.serviceType??null,
    frequency:String(row.frequency||'WEEKLY').toUpperCase()};
}
