const zone = 'America/Denver';
const parts = instant => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
export function screeningRespondent(data = {}) {
  const responses=data.responses || {}, guardian={...data.guardian,...responses.guardian,...responses.guardianInfo};
  const submission=responses.submission || data.submission || {};
  const self=data.intakeForSelf === true || submission.intakeForSelf === true || guardian.relationship === 'self' || submission.relationship === 'self';
  const first=guardian.firstName || guardian.first_name || guardian.guardianFirstName || guardian.guardian_legal_first || submission.guardianFirstName || '';
  // A guardian-shaped contact is also used for self enrollment. Explicit self
  // submissions must never be relabeled as a parent or an absent patient.
  if (self) return {role:'self',firstName:String(first).trim()};
  if (String(first).trim()) return {role:'guardian',firstName:String(first).trim()};
  return {role:'unknown',firstName:''};
}
export function screeningEncounterProposal(source) {
  const end=new Date(source.submittedAt), valid=!!source.submittedAt&&Number.isFinite(+end), p=valid?parts(end):{}, start=valid?parts(new Date(+end-600000)):{};
  const date=p.year?`${p.year}-${p.month}-${p.day}`:'';
  const respondent=source.respondent || {};
  return {dateOfService:date,durationMinutes:valid?10:'',startTime:start.hour?`${start.hour}:${start.minute}`:'',endTime:p.hour?`${p.hour}:${p.minute}`:'',
    participants:respondent.role==='guardian'?`Guardian: ${respondent.firstName}`:respondent.role==='self'?`Patient${respondent.firstName?`: ${respondent.firstName}`:''}`:'',
    patientPresent:respondent.role==='guardian'?false:respondent.role==='self'?true:null,
    proposedFromSubmission:true,crossesMidnight:!!valid&&date!==`${start.year}-${start.month}-${start.day}`};
}
export function validateScreeningEncounter(input, now=new Date()) {
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  if (input.serviceDetailsConfirmed !== true) fail('Confirm the actual service date, times, participants and patient presence before signing.');
  const dateOfService=String(input.dateOfService || ''), durationMinutes=Number(input.durationMinutes), startTime=String(input.startTime || ''),endTime=String(input.endTime || ''),participants=String(input.participants || '').trim();
  const today=parts(now), todayDate=`${today.year}-${today.month}-${today.day}`;
  const parsedDate=new Date(`${dateOfService}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfService) || dateOfService>todayDate || !Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0,10)!==dateOfService) fail('Enter a valid service date that is not in the future.');
  const clock=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t),minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  if (!clock(startTime)||!clock(endTime)||!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>1440||minutes(endTime)-minutes(startTime)!==durationMinutes) fail('Enter actual start/end times and a matching duration on the service date.');
  if (!participants || participants.length>1000 || typeof input.patientPresent!=='boolean') fail('List the participants and confirm whether the patient was present.');
  return {dateOfService,durationMinutes,startTime,endTime,participants,patientPresent:input.patientPresent};
}
