const fail = message => Object.assign(new Error(message), { status:400 });
export const parseCareJson = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
export const careDate = (value, timeZone='America/Denver') => new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function normalizeCareInvitation(input, now=new Date()) {
 const agencyId=Number(input.agencyId),providerId=Number(input.providerId),officeId=Number(input.officeId)||null;
 const email=String(input.email||'').trim().toLowerCase();
 if(![agencyId,providerId].every(n=>Number.isSafeInteger(n)&&n>0)||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>255)throw fail('Choose an organization, provider, and valid recipient email.');
 const modality=input.modality;
 if(!['IN_PERSON','VIRTUAL'].includes(modality))throw fail('Choose in person or virtual.');
 if(modality==='IN_PERSON'&&!officeId)throw fail('Select the provider’s assigned office for in-person care.');
 const timeZone=String(input.timeZone||'America/Denver');
 try{new Intl.DateTimeFormat('en-US',{timeZone}).format(now);}catch{throw fail('Choose a valid time zone.');}
 const start=input.startAt?new Date(input.startAt):null;
 if(start&&(!Number.isFinite(+start)||+start<=+now||+start>+now+365*86400000))throw fail('Choose a future appointment within the next year.');
 const frequency=input.frequency||'BIWEEKLY';
 if(!['ONCE','WEEKLY','BIWEEKLY','EVERY_3_WEEKS','EVERY_4_WEEKS','MONTHLY'].includes(frequency))throw fail('Choose a supported recurrence.');
 if(input.serviceCode&&input.serviceCode!=='90837')throw fail('Care invitations currently support individual therapy (90837).');
 const note=String(input.note||'').trim();if(note.length>2000)throw fail('Keep the personal note under 2,000 characters.');
 const noteFrom=String(input.noteFrom||'').trim();
 if(note&&!noteFrom)throw fail('Enter who the personal note is from.');
 if(noteFrom.length>120||/[\r\n]/.test(noteFrom))throw fail('Use a single name or team name under 120 characters.');
 return {agencyId,providerId,officeId,email,modality,startAt:start?.toISOString()||null,timeZone,frequency,serviceCode:'90837',note,noteFrom:note?noteFrom:''};
}
/** Active benefits alone cannot attest to Medicaid TPL or coordination of benefits.
 * Automatic admission needs an independent, clean COB discovery and exact matches. */
export function automaticCareCoverageReady({insurance,evidence,fingerprint}) {
 if(!insurance?.primary?.memberId||insurance.secondary||insurance.primary.isMedicaid||evidence.discoveryPending||!evidence.cleanCob)return false;
 const latest=evidence.checks?.find(c=>c.policy_slot==='primary');
 const summary=latest?.evidence?.summary;
 return latest?.status==='returned'&&latest.insurance_fingerprint===fingerprint&&summary?.status==='active_reported'
  &&summary.identityMatches===true&&summary.otherCoverageReported===false&&!summary.payerErrors?.length;
}
const escape = value => String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function careInvitationEmail({agencyName,providerName,url,note,noteFrom,modality,startAt,timeZone,frequency}) {
 const when=startAt?new Intl.DateTimeFormat('en-US',{timeZone,weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(startAt)):null;
 const recurrence={ONCE:'one visit',WEEKLY:'weekly',BIWEEKLY:'every other week',EVERY_3_WEEKS:'every three weeks',EVERY_4_WEEKS:'every four weeks',MONTHLY:'monthly'}[frequency];
 const schedule=when?`Requested care: ${modality==='IN_PERSON'?'in person':'virtual'}, ${when}, ${recurrence}. We will confirm scheduling after the signed enrollment and insurance verification are complete. If the requested time becomes unavailable, our team will contact you.`:`Your care team will coordinate ${modality==='IN_PERSON'?'in-person':'virtual'} appointments after enrollment and insurance verification.`;
 const subject=`${providerName} has invited you to enroll with ${agencyName}`;
 const intro=`${providerName} has invited you to complete your son’s enrollment with ${agencyName} through AuricWell.`;
 const instructions='Use the secure button below to complete the enrollment questions, provide insurance information, and review and sign the required documents. Your invitation is connected directly to your provider. After completion, you can set up your AuricWell guardian portal account from your confirmation email.';
 const text=`Hello,\n\n${intro}\n\n${instructions}\n\n${url}\n\n${schedule}${note?`\n\nA note from ${noteFrom}:\n${note}`:''}\n\n${agencyName}\nPowered by AuricWell`;
 const html=`<div style="background:#f2f5f5;padding:28px 12px;font-family:Arial,sans-serif;color:#203c40"><div style="max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden"><div style="background:#183f43;color:white;padding:24px 30px"><div style="font-size:26px;letter-spacing:1px">AuricWell</div><div style="font-size:14px;margin-top:8px">${escape(agencyName)}</div></div><div style="padding:30px;line-height:1.65"><h1 style="font-size:23px;line-height:1.3">${escape(providerName)} has invited you</h1><p>Hello,</p><p>${escape(intro)}</p><p>${escape(instructions)}</p><p style="margin:26px 0"><a href="${escape(url)}" style="background:#21646b;color:white;padding:14px 22px;border-radius:8px;text-decoration:none;display:inline-block">Complete enrollment</a></p><p>${escape(schedule)}</p>${note?`<div style="border-left:3px solid #c9a65b;padding:4px 16px;margin-top:24px"><p><strong>A note from ${escape(noteFrom)}</strong></p><p><em>${escape(note).replaceAll('\n','<br>')}</em></p></div>`:''}<p style="font-size:12px;color:#5b7376;margin-top:28px">${escape(agencyName)} · Powered by AuricWell</p></div></div></div>`;
 return {subject,text,html};
}
