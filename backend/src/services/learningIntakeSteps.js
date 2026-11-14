import { tutoringIntakeSteps, isTutoringIntake, isValidEnrollmentEmail, TUTORING_AGREEMENT_KEY } from '../../../frontend/src/navigation/tutoringEnrollmentPolicy.js';
import {TUTORING_MEDIA_KEY,TUTORING_SCHOOL_KEY,TUTORING_ENROLLMENT_VERSION} from '../../../frontend/src/navigation/tutoringEnrollmentAgreement.js';
// Effective composition is shared with the browser; stored signed packets are
// never rewritten. Clinical enrollment follows its separate channel master.
export function learningIntakeSteps(steps = [], options = {}) {
  return tutoringIntakeSteps(steps, options);
}

export function validateTutoringIntakeSubmission(link, intakeData, guardianEmail) {
  if (!isTutoringIntake(link)) return;
  if (!isValidEnrollmentEmail(guardianEmail || intakeData?.guardian?.email)) throw Object.assign(new Error('Enter a valid guardian email address.'), { status: 400 });
  const responses = intakeData?.responses || intakeData || {};
  if ((link.intake_steps || []).some(step => step.id === 'tutoring_services_agreement') && responses.submission?.[TUTORING_AGREEMENT_KEY] !== true) throw Object.assign(new Error('Please review and accept the tutoring services agreement.'), { status: 400 });
  const required=(values,key)=>typeof values[key]==='string'&&values[key].trim().length>0&&values[key].length<=2000;
  const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
  for(const values of [...Object.values(responses.clients||{}),responses.submission]) {
    if(!values || typeof values!=='object')continue;
    for(const key of [TUTORING_MEDIA_KEY,TUTORING_SCHOOL_KEY])if(values[key]!=null&&!['','yes','no'].includes(values[key]))invalid('Choose yes or no for each optional permission, or leave it unselected.');
    if(values[TUTORING_MEDIA_KEY]==='yes' && (!(values.tutoring_media_private===true||values.tutoring_media_public===true)||!required(values,'tutoring_media_signature')||values.tutoring_media_attestation!==true))invalid('Select the permitted media uses and sign the separate optional media permission.');
    if(values[TUTORING_SCHOOL_KEY]==='yes') {
      if(!['tutoring_school_contact','tutoring_school_name','tutoring_school_information','tutoring_school_purpose','tutoring_school_signature'].every(key=>required(values,key))||!isValidEnrollmentEmail(values.tutoring_school_email)||values.tutoring_school_attestation!==true)invalid('Complete the named school contact, educational purpose and separate school-permission signature.');
      const date=String(values.tutoring_school_expires||'');
      const parsed=Date.parse(date);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date||date<new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))invalid('Choose a current or future expiration date for the school permission.');
    }
  }
  const agreement=(link.intake_steps||[]).find(step=>step.id==='tutoring_services_agreement');
  if(agreement&&intakeData&&typeof intakeData==='object')intakeData.tutoringAgreement={version:agreement.version||TUTORING_ENROLLMENT_VERSION,text:agreement.fields?.find(field=>field.key===TUTORING_AGREEMENT_KEY)?.label||'',accepted:true,optionalPermissionsGrantPortalAccess:false};
}
