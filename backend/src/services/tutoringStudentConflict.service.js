export async function assertTutoringStudentWindow(db,{businessType,clientIds,startAt,endAt,appointmentId=null}){
 if(!['tutoring','learning'].includes(businessType))return;
 const ids=[...new Set((clientIds||[]).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
 if(!ids.length)return;
 const [rows]=await db.execute("SELECT 1 AS occupied FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id WHERE p.client_id IN ("+ids.map(()=>'?').join(',')+") AND a.start_at<? AND a.end_at>? AND a.status NOT IN ('draft','no_show','canceled','cancelled','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided') AND (? IS NULL OR a.id<>?) LIMIT 1",[...ids,endAt,startAt,appointmentId,appointmentId]);
 if(rows.length)throw Object.assign(new Error('This student already has a session during that time. Choose a different time or review the existing booking.'),{status:409,code:'STUDENT_TIME_CONFLICT'});
}
