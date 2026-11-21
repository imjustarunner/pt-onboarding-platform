import {appointmentServiceLabel,appointmentAttendanceView} from './appointmentPresentation.js';
import {utcMysqlToIso} from './zonedWallTime.util.js';
const final=new Set(['completed','no_show','no_show_pending','canceled','cancelled','late_canceled','canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization','rescheduled','voided']);
export function missingAppointmentOutcomeEvents(appointments,existing=[]){
 const seen=new Set(existing.filter(e => {
  if (e.buildingId || e.roomId && e.slotState) return String(e.status).toUpperCase()==='BOOKED';
  return !['DELETED','REMOVED'].includes(String(e.status).toUpperCase());
 }).map(e=>Number(e.appointmentId)).filter(Boolean));
 return appointments.filter(a=>final.has(a.status)&&!seen.has(Number(a.id))).map(a=>({id:-1000000-Number(a.id),kind:'PERSONAL_EVENT',canonicalOutcome:true,appointmentId:Number(a.id),agencyId:Number(a.agencyId),providerId:Number(a.providerUserId),startAt:utcMysqlToIso(a.startAt),endAt:utcMysqlToIso(a.endAt),sourceTimezone:a.sourceTimezone||'America/Denver',businessType:a.businessType,learningContext:a.learningContext,serviceCode:a.serviceCode,title:`${appointmentServiceLabel(a)} · ${appointmentAttendanceView(a).displayStatus}`,appointmentStatus:a.status,status:'ACTIVE',isCancelled:/^cancel|late_cancel/.test(a.status),isMissed:a.status==='no_show',canEdit:false,canReschedule:false,draggable:false}));
}
