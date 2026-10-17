export const safetyPlanTemplate = {
  key: 'safety-plan', version: '2026-10-11.1', title: 'Safety plan',
  sections: [
    { title: '1 · Warning signs', fields: [['thoughts', 'Thoughts'], ['behaviors', 'Behaviors'], ['feelings', 'Feelings and mood']] },
    { title: '2 · Coping strategies', fields: [['coping', 'Things I can do to help myself'], ['selfCare', 'Self-care']] },
    { title: '3 · Support people', repeat: 'supports', columns: [['name', 'Name'], ['phone', 'Phone'], ['role', 'Relationship / how they can help']] },
    { title: '4 · Safe places and social settings', fields: [['safePlaces', 'Where I can go and who I can spend time with']] },
    { title: '5 · Making the environment safer', fields: [['unsafeItems', 'Plan for weapons, sharp objects, and other unsafe items'], ['medications', 'Plan for medication access and storage'], ['safetyResponsibility', 'Who will help, what they will do, and when']] },
    { title: '6 · Professional support', repeat: 'professionals', columns: [['name', 'Provider / service'], ['phone', 'Phone'], ['details', 'Location, hours, and how to get help']] },
    { title: '7 · Family notification and review', fields: [['familyNotification', 'Who to contact, their phone number, and what may be shared'], ['reviewPlan', 'Follow-up and when we will review this plan'], ['copyProvided', 'How the client can access their copy']] }
  ],
  crisis: { text: 'Call or text 988 for crisis support. For immediate danger or a medical emergency, call 911.', url: 'https://988lifeline.org/get-help/what-to-expect/', checkedAt: '2026-10-11' }
};
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function positiveId(value) { const id=Number(value); if(!Number.isSafeInteger(id)||id<=0)fail(400,'A valid record is required.');return id; }
function text(value,max=6000) { if(value==null)return '';if(typeof value!=='string'||value.length>max)fail(400,`Enter text of no more than ${max} characters.`);return value.trim(); }
export function normalizeSafetyPlan(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Complete the safety plan.');
  const result={documentName:text(input.documentName,160),personLabel:text(input.personLabel,200),planDate:text(input.planDate,10),reviewDate:text(input.reviewDate,10)};
  for(const field of ['planDate','reviewDate'])if(result[field]&&(!/^\d{4}-\d{2}-\d{2}$/.test(result[field])||!Number.isFinite(+new Date(result[field]))||new Date(result[field]).toISOString().slice(0,10)!==result[field]))fail(400,'Enter a valid plan and review date.');
  for(const section of safetyPlanTemplate.sections) {
    for(const [key] of section.fields||[])result[key]=text(input[key]);
    if(section.repeat){const rows=input[section.repeat]||[];if(!Array.isArray(rows)||rows.length>12)fail(400,'Use up to 12 contacts in each section.');result[section.repeat]=rows.map(row=>Object.fromEntries(section.columns.map(([key])=>[key,text(row?.[key],1000)])));}
  }
  return result;
}
export function validateReady(data) {
  if(!data.personLabel||!data.planDate||!data.coping||!data.safePlaces||!data.reviewPlan||!data.safetyResponsibility||!data.copyProvided||!(data.thoughts||data.behaviors||data.feelings)||!data.unsafeItems||!data.medications||!data.familyNotification)fail(400,'Complete each safety-planning area before signing or sharing. Record “not applicable” with the reason when appropriate.');
  if(!data.supports.some(p=>p.name&&p.phone)||!data.professionals.some(p=>p.name&&p.phone))fail(400,'Add at least one support person and one professional contact with phone numbers.');
}
export function signatureEvidence(input,title='Safety plan') {
  const name=text(input?.name,200),signature=input?.signature;
  if(!name||input?.consent!==true)fail(400,'Enter your name and agree to sign this version electronically.');
  if(typeof signature!=='string'||signature.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(signature))fail(400,'Capture a typed or drawn signature.');
  const bytes=Buffer.from(signature.split(',')[1],'base64');if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail(400,'The signature image is invalid.');
  return {name,signature,consent:true,consentText:`I have reviewed this ${title.toLowerCase()} and agree to sign this version electronically.`};
}
