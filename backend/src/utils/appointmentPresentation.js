import {parseUtcDate} from './officeEventDateTime.util.js';
export const isLearningAppointment=a=>['tutoring','learning'].includes(String(a?.businessType||a?.business_type||'').toLowerCase());
export function appointmentServiceLabel(a={}) {
 if(!isLearningAppointment(a))return a.serviceLabel||a.serviceCode||'Session';
 let context=a.learningContext||a.learning_context_json||{};
 if(typeof context==='string')try{context=JSON.parse(context);}catch{context={};}
 const subject=String(context.subjectLabel||'General').replace(/\bTUTORING\b/gi,'').trim()||'General';
 return `${subject} tutoring`;
}
export function appointmentAttendanceView(a,{now=Date.now(),learningSession=null}={}) {
 const terminal=['completed','no_show','no_show_pending','voided','rescheduled','canceled','cancelled','late_canceled','canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization'];
 let status=String(a.status||'scheduled').toLowerCase();
 if(!terminal.includes(status)&&learningSession?.actual_ended_at) {
  const start=parseUtcDate(learningSession.actual_started_at),end=parseUtcDate(learningSession.actual_ended_at);
  status=start&&end>start?'completed':'ended';
 }else if(!terminal.includes(status)&&learningSession?.actual_started_at&&learningSession.status==='live')status='in_progress';
 const pending=['scheduled','confirmed','client_confirmed','checked_in'].includes(status)&&+parseUtcDate(a.endAt)<now;
 const labels={completed:'Attended',ended:'Ended · attendance needs review',no_show:'No-show',no_show_pending:'No-show · outcome pending',late_canceled:'Late cancel',rescheduled:'Rescheduled',canceled:'Cancelled',cancelled:'Cancelled',canceled_by_client:'Cancelled',canceled_by_guardian:'Cancelled',canceled_by_provider:'Cancelled',canceled_by_organization:'Cancelled',in_progress:'In progress',client_confirmed:'Confirmed',confirmed:'Confirmed',scheduled:'Scheduled'};
 return {status,displayStatus:pending?'Attendance awaiting review':labels[status]||'Review attendance',attendancePending:pending};
}
