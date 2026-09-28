export function availabilityDayGroups(slots, timeZone = 'America/Denver') {
 const groups=new Map();
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 for(const slot of [...slots].filter(s=>Number.isFinite(Date.parse(s.startAt))).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt))) {
  const date=formatter.format(new Date(slot.startAt));
  if(!groups.has(date))groups.set(date,{date,startAt:slot.startAt,slots:[]});
  groups.get(date).slots.push(slot);
 }
 return [...groups.values()];
}
