import StudentSubject from '../models/StudentSubject.model.js';
import pool from '../config/database.js';
const norm=text=>{
 const label=String(text||'').replace(/tutoring/ig,'').replace(/synthetic qa/ig,'').replace(/[^a-z0-9]/ig,'').toLowerCase();
 return label==='mathematics'?'math':label;
};
export async function tutoringBookingSubjects({agencyId,providerId,clientId},db=pool){
 if(!Number(agencyId)||!Number(providerId)||!Number(clientId))return [];
 const [services]=await db.execute("SELECT id,label FROM client_service_enrollments WHERE agency_id=? AND client_id=? AND provider_user_id=? AND service_kind='tutoring' AND is_active=1 ORDER BY label,id",[agencyId,clientId,providerId]);
 const [subjects]=await db.execute(`SELECT id,subject_label,primary_tutor_user_id FROM student_subjects
  WHERE agency_id=? AND client_id=? AND (primary_tutor_user_id=? ${services.length?'OR primary_tutor_user_id IS NULL':''})
  AND status NOT IN ('completed','discharged','archived') ORDER BY subject_label,id`,[agencyId,clientId,providerId]);
 const choices=services.map(service=>{const matches=subjects.filter(s=>norm(s.subject_label)===norm(service.label));const subject=matches.length===1?matches[0]:null;return {key:`service:${service.id}`,label:subject?.subject_label||String(service.label).replace(/^tutoring\s*[-—:]?\s*/i,'').trim()||'Tutoring',serviceEnrollmentId:Number(service.id),studentSubjectId:subject?Number(subject.id):null};});
 if(!choices.length)for(const subject of subjects)choices.push({key:`subject:${subject.id}`,label:subject.subject_label,serviceEnrollmentId:null,studentSubjectId:Number(subject.id)});
 return choices;
}
export async function resolveTutoringBookingContext(input,db=pool){
 const choices=await tutoringBookingSubjects(input,db),key=String(input.key||'general');
 const choice=key==='general'?{label:'General',serviceEnrollmentId:choices.length===1?choices[0].serviceEnrollmentId:null,studentSubjectId:null}:key==='assigned'?choices[0]:choices.find(c=>c.key===key);
 if(!choice)throw Object.assign(new Error('That tutoring service is no longer assigned to this student and tutor. Refresh the service choices before booking.'),{status:409});
 return {version:1,subjectLabel:String(choice.label).slice(0,150),serviceEnrollmentId:choice.serviceEnrollmentId||null,studentSubjectId:choice.studentSubjectId||null,generalSupport:key==='general'};
}

// An existing bound track wins. For a legacy unbound session, a unique label
// match is allowed only within the current assigned tutoring service.
export async function resolveTutoringTrack(appointment, clientId, sessionSubjectId) {
 const {agencyId,providerUserId,learningContext={}}=appointment;
 const boundId=Number(sessionSubjectId||learningContext?.studentSubjectId);
 const tracks=await StudentSubject.listByClient(clientId,{agencyId});
 const eligible=tracks.filter(track=>!['completed','discharged','archived'].includes(track.status)
  && (!track.primary_tutor_user_id||Number(track.primary_tutor_user_id)===Number(providerUserId)));
 if(boundId)return eligible.find(track=>Number(track.id)===boundId)||null;
 if(learningContext?.generalSupport||!Number(learningContext?.serviceEnrollmentId))return null;
 const choices=await tutoringBookingSubjects({agencyId,providerId:providerUserId,clientId});
 const match=choices.find(choice=>choice.serviceEnrollmentId===Number(learningContext.serviceEnrollmentId));
 return eligible.find(track=>Number(track.id)===match?.studentSubjectId)||null;
}
