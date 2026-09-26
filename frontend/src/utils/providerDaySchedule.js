import {zonedDatetimeLocalToIso} from './timezones.js';
import {parseScheduleUtcInstant} from './scheduleEventInstants.js';
const labels={SESSION:'Session',INDIVIDUAL_SESSION:'Individual session',GROUP_SESSION:'Group session',INTAKE:'Intake',TEAM_MEETING:'Team meeting',HUDDLE:'Huddle',SUPERVISION:'Supervision',INDIRECT_SERVICES:'Indirect service',DOCUMENTATION:'Documentation',HOLD:'Hold',SCHEDULE_HOLD:'Hold',COMPANY_EVENT_BOOKING:'Program event',COMPANY_EVENT_OPEN:'Open program event',SKILL_BUILDERS_PROGRAM:'Program session',AGENCY_MEETING:'Agency meeting'};
export function dayScheduleEntries(summary={},date,timeZone='America/Denver',detailLevel='full'){
  const entries=[],seen=new Set();
  const day=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const clock=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit'});
  const hour=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',hourCycle:'h23'});
  const full=detailLevel==='full' && !['busy','typed'].includes(summary.detailLevel);
  function add(event,type,source,index){
    const start=parseScheduleUtcInstant(event.startAt || event.start?.dateTime || event.start?.date || event.start),end=parseScheduleUtcInstant(event.endAt || event.end?.dateTime || event.end?.date || event.end);
    if(!start || !end || end<=start || day.format(start)>date || day.format(new Date(end.getTime()-1))<date)return;
    const key=`${source}:${event.id || index}:${start.toISOString()}`;
    if(seen.has(key))return;seen.add(key);
    entries.push({key,type,source,hour:day.format(start)<date?0:Number(hour.format(start)),start:start.getTime(),end:end.getTime(),
      title:full?String(event.title || event.summary || event.clientInitials || event.roomLabel || type):type,
      serviceCode:full?(event.serviceCode || event.service_code || ''):'',timeLabel:`${clock.format(start)}–${clock.format(end)}`,allDay:!!event.allDay || !!event.start?.date});
  }
  if(!full){
    (summary.busyBlocks || []).forEach((event,i)=>add(event,detailLevel==='busy'?'Busy':({session:'Session',hold:'Hold',opening:'Opening',school:'School',supervision:'Supervision',team_meeting:'Meeting',huddle:'Huddle',indirect:'Indirect service'})[event.activityType] || 'Busy','availability',i));
    return entries.sort((a,b)=>a.start-b.start);
  }
  (summary.scheduleEvents || []).forEach((event,i)=>add(event,labels[String(event.kind || event.appointmentType || '').toUpperCase()] || (event.clientId || event.serviceCode || event.appointmentId ? 'Session':'Personal event'),'App appointment',i));
  const weekday=new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long'});
  (summary.schoolAssignments || []).filter(e=>e.dayOfWeek===weekday).forEach((e,i)=>{
    if(!e.startTime || !e.endTime)return;
    add({...e,title:e.schoolName || 'School',startAt:zonedDatetimeLocalToIso(`${date}T${e.startTime}`,timeZone),endAt:zonedDatetimeLocalToIso(`${date}T${e.endTime}`,timeZone)},'School','School assignment',i);
  });
  (summary.officeEvents || []).forEach((event,i)=>add(event,({ASSIGNED_BOOKED:'Office session',ASSIGNED_TEMPORARY:'Room hold',ASSIGNED_AVAILABLE:'Office opening',COMPANY_HOLD:'Company hold'})[String(event.slotState || '').toUpperCase()] || 'Office reservation','Office schedule',i));
  (summary.supervisionSessions || []).forEach((event,i)=>add({...event,title:event.counterpartyName || 'Supervision'},'Supervision','Supervision',i));
  (summary.googleEvents || []).forEach((event,i)=>add(event,'Google event','Google Calendar',i));
  (summary.externalBusy || []).forEach((event,i)=>add({...event,title:'Busy'},'External calendar','External calendar',i));
  (summary.googleBusy || []).forEach((event,i)=>add({...event,title:'Busy'},'Busy','Google Calendar',i));
  for(const calendar of summary.externalCalendars || [])(calendar.events || calendar.busy || calendar.busyIntervals || []).forEach((event,i)=>add(event,'External calendar',calendar.label || 'External calendar',i));
  return entries.sort((a,b)=>a.start-b.start || a.type.localeCompare(b.type));
}
