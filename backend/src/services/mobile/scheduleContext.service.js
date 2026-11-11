import User from '../../models/User.model.js';

const COMMON_ACTIONS=[
 {id:'individual_session',label:'Book Session',description:'Schedule a client session or group session.',compact:true},
 {id:'agency_meeting',label:'Schedule Meeting',description:'Choose participants and meeting settings in the full schedule.'},
 {id:'portal_intake',label:'Open Slot for Booking',description:'Publish open hours in the full schedule.'},
 {id:'office_request_only',label:'Request office',description:'Choose a room and request office time in the full schedule.'},
 {id:'personal_event',label:'Personal event',description:'Create a personal calendar event in the full schedule.'},
 {id:'schedule_hold',label:'Schedule block',description:'Block time or an all-day span in the full schedule.'}
];
export const MOBILE_SCHEDULE_ACTIONS=new Set([...COMMON_ACTIONS.map(row=>row.id),'supervision','huddle']);
export function mobileScheduleActions(user){
 const actions=COMMON_ACTIONS.map(row=>({...row}));
 if(User.isSupervisor(user))actions.splice(2,0,{id:'supervision',label:'Schedule Supervision',description:'Choose your supervisees and supervision settings in the full schedule.'});
 if(['super_admin','superadmin','admin','support','provider_plus','clinical_practice_assistant'].includes(user?.role))actions.push({id:'huddle',label:'CPA / Mentorship Meeting',description:'Choose eligible participants in the full schedule.'});
 return actions;
}
export const SCHEDULE_CONTEXT_FIELDS=['scheduleAction','scheduleDate','scheduleStart','scheduleEnd','scheduleTimeZone'];
/** Allow only a complete calendar selection, never an arbitrary redirect or API action. */
export function mobileScheduleContext(body){
 if(!SCHEDULE_CONTEXT_FIELDS.some(key=>body[key]!==undefined))return null;
 if(!SCHEDULE_CONTEXT_FIELDS.every(key=>typeof body[key]==='string'))throw Object.assign(new Error('Invalid schedule selection.'),{status:400});
 const {scheduleAction:action,scheduleDate:date,scheduleStart:start,scheduleEnd:end,scheduleTimeZone:timeZone}=body;
 const parsed=new Date(`${date}T12:00:00Z`);
 if(!MOBILE_SCHEDULE_ACTIONS.has(action)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start||timeZone.length>80)throw Object.assign(new Error('Invalid schedule selection.'),{status:400});
 try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw Object.assign(new Error('Invalid schedule timezone.'),{status:400});}
 return Object.fromEntries(SCHEDULE_CONTEXT_FIELDS.map(key=>[key,body[key]]));
}
