export function tutoringMakeupSelection(appointment,{agencyId,providerId,clientIds,subjects}){
 const fail=message=>{throw new Error(message);};
 if(Number(agencyId)!==Number(appointment.agencyId))fail('Open the original tutoring organization to schedule this makeup.');
 if(Number(providerId)!==Number(appointment.providerUserId))fail('Select the original tutor to schedule this makeup.');
 const students=(appointment.participants||[]).filter(p=>Number(p.clientId)>0);
 if(students.length!==1||!clientIds.map(Number).includes(Number(students[0].clientId)))fail('The original student is not available to this tutor. Ask Support to review the assignment.');
 let context=appointment.learningContext||{};if(typeof context==='string'){try{context=JSON.parse(context);}catch{fail('The original tutoring service needs Support review.');}}
 const selected=subjects.find(s=>context.serviceEnrollmentId?Number(s.serviceEnrollmentId)===Number(context.serviceEnrollmentId):context.studentSubjectId&&Number(s.studentSubjectId)===Number(context.studentSubjectId));
 if(!context.generalSupport&&!selected)fail('The original tutoring subject is unavailable. Ask Support to restore its assignment before booking the makeup.');
 return {clientId:Number(students[0].clientId),subjectKey:context.generalSupport?'general':selected.key};
}
