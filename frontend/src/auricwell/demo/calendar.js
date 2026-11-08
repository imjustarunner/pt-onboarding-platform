import { zonedDatetimeLocalToIso } from '../../utils/timezones.js';

// Weekly fictional examples, projected into the same summary shape as the app.
// No meeting invites, video rooms, cancellations or clinical records are created.
export function demoTeamCalendar(start, provider, {practice, actorId, staff}) {
  const first=new Date(`${start}T12:00:00`),events=[],supervision=[];
  const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const window=(date,time)=>{const [hour,minute]=time.split(':').map(Number);return {startAt:zonedDatetimeLocalToIso(`${dateKey(date)}T${time}:00`,practice.timezone),endAt:zonedDatetimeLocalToIso(`${dateKey(date)}T${String(hour+1).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`,practice.timezone)};};
  const quinn=staff.find(person=>person.id===990115),riley=staff.find(person=>person.id===990116),tessa=staff.find(person=>person.id===990113),avery=staff.find(person=>person.id===actorId);
  for(let offset=0;offset<7;offset++){
    const date=new Date(first);date.setDate(first.getDate()+offset);const day=date.getDay();
    if(day===2 && [actorId,tessa.id].includes(provider.id)){
      const isSupervisor=provider.id===tessa.id;
      supervision.push({id:997402,agencyId:practice.id,providerUserId:provider.id,userId:provider.id,supervisorUserId:tessa.id,supervisorName:`Dr. ${tessa.name}`,superviseeUserId:actorId,superviseeName:avery.name,counterpartyName:isSupervisor?avery.name:`Dr. ${tessa.name}`,role:isSupervisor?'supervisor':'supervisee',sessionType:'individual',status:'SCHEDULED',isVirtual:true,modality:'VIRTUAL',title:'Clinical supervision',locationLabel:'Virtual · supervision',description:'Case consultation, documentation review and professional development.',canEdit:false,canReschedule:false,...window(date,'12:30')});
    }
    if(provider.id!==actorId)continue;
    const example={
      1:{id:997401,time:'13:00',kind:'TEAM_MEETING',meetingSubtype:'general',title:'Billing workflow check-in',attendees:[quinn],locationLabel:'Denver office · team room'},
      3:{id:997403,time:'13:00',kind:'TEAM_MEETING',meetingSubtype:'town_hall',title:'Practice town hall',attendees:[quinn,riley],locationLabel:'Virtual · practice town hall'},
      4:{id:997404,time:'15:30',kind:'HUDDLE',meetingSubtype:'cpa',title:'Intake and care coordination',attendees:[riley],locationLabel:'Denver office · coordination room'}
    }[day];
    if(!example)continue;
    events.push({...example,...window(date,example.time),agencyId:practice.id,userId:actorId,providerUserId:actorId,hostUserId:actorId,hostFirstName:avery.first_name,hostLastName:avery.last_name,isHost:true,status:'SCHEDULED',attendees:example.attendees.map(person=>({userId:person.id,name:person.name})),attendeeCount:example.attendees.length,attendeeUserIds:example.attendees.map(person=>person.id),modality:day===3?'VIRTUAL':'IN_PERSON',description:day===1?'Claims and payment follow-up.':day===3?'Practice updates, shared priorities and questions.':'Intake follow-up and care coordination.',canEdit:false,canReschedule:false});
  }
  return {events,supervision};
}
