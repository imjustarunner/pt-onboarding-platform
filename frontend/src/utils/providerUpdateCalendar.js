import {availabilityOccursOn} from './availabilityRecurrence';
export const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export function localParts(value,timeZone) {
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
}
const overlaps=(a,b)=>Date.parse(a.startAt)<Date.parse(b.endAt)&&Date.parse(a.endAt)>Date.parse(b.startAt);
export function calendarDays(calendar) {
 if(!calendar?.weekStart)return [];
 const offices=calendar.officeReservations||[],busy=calendar.busyBlocks||[],weekly=calendar.weekly||[],tz=calendar.timeZone;
 const events=offices.map(o=>{
  const ip=(calendar.inPersonSlots||[]).some(s=>overlaps(s,o)),v=(calendar.virtualSlots||[]).some(s=>overlaps(s,o));
  const blocked=o.hasAppointment||busy.some(b=>overlaps(b,o))||!o.roomAvailable;
  return {...o,key:`office-${o.id}`,kind:blocked?'busy':ip||v?'open':'reserved',office:true,
   label:blocked?'Unavailable':ip&&v?'In person or virtual':ip?'In person':v?'Virtual':'Kept private',
   detail:[o.buildingName,o.roomLabel].filter(Boolean).join(' · ')};
 });
 for(const b of busy) events.push({...b,key:`busy-${events.length}`,kind:'busy',detail:'Private commitment'});
 for(const slot of calendar.virtualSlots||[]){
  if(offices.some(o=>overlaps(o,slot)))continue;
  const local=localParts(slot.startAt,tz),day=new Date(local.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
  const row=weekly.find(r=>r.dayOfWeek===day&&availabilityOccursOn(r,local.date)&&r.startTime<=`${String(Math.floor(local.minute/60)).padStart(2,'0')}:${String(local.minute%60).padStart(2,'0')}`&&Number(r.endTime.slice(0,2))*60+Number(r.endTime.slice(3))>=localParts(slot.endAt,tz).minute);
  if(!events.some(e=>e.kind==='open'&&!e.office&&e.startAt===slot.startAt&&e.endAt===slot.endAt))events.push({...slot,key:`virtual-${events.length}`,kind:'open',label:'Virtual',weeklyId:row?.id,weeklyWindow:row?`${row.startTime}–${row.endTime}`:null,detail:row?.frequency==='ONCE'?'One date':'Recurring opening'});
 }
 return Array.from({length:7},(_,i)=>{
  const date=shiftDate(calendar.weekStart,i),result=[];
  for(const event of events){const start=localParts(event.startAt,tz),end=localParts(event.endAt,tz);
   if(start.date>date||end.date<date||end.date===date&&end.minute===0)continue;
   result.push({...event,date,startMinute:start.date<date?0:start.minute,endMinute:end.date>date?1440:end.minute});
  }
  return {date,label:new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}),events:result.sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute)};
 });
}
