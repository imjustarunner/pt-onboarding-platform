const days=new Set(['weekdays','weekends','Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
export function appointmentTimePredicate(query={}) {
 const day=String(query.day||''),from=String(query.timeFrom||''),to=String(query.timeTo||'');
 if(!day&&!from&&!to)return ()=>true;
 if((day&&!days.has(day))||[from,to].some(v=>v&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)))throw Object.assign(new Error('Choose a valid appointment day and time.'),{status:400});
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 return slot=>{
  const date=new Date(slot.startAt);if(!Number.isFinite(date.getTime()))return false;
  const parts=formatter.formatToParts(date),value=type=>parts.find(p=>p.type===type)?.value;
  const weekday=value('weekday'),time=`${value('hour')}:${value('minute')}`;
  return (!day||(day==='weekdays'?!['Sat','Sun'].includes(weekday):day==='weekends'?['Sat','Sun'].includes(weekday):day===weekday))&&(!from||time>=from)&&(!to||time<=to);
 };
}
