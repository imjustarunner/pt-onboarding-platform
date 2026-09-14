const fail=message=>Object.assign(new Error(message),{status:400});
export function normalizePackagePricing(raw){
 if(!raw||raw.mode==='fixed')return {mode:'fixed'};
 if(raw.mode!=='provider-discount'||!Number.isFinite(raw.discountPercent)||raw.discountPercent<0||raw.discountPercent>100)throw fail('Choose a package discount from 0 to 100 percent.');
 if(!Number.isInteger(raw.minutes)||raw.minutes<15||raw.minutes>480)throw fail('Package session duration must be 15–480 minutes.');
 if(!['virtual','in-person','small-group'].includes(raw.format))throw fail('Choose the package format.');
 return {mode:'provider-discount',discountPercent:raw.discountPercent,minutes:raw.minutes,format:raw.format};
}
export function calculateProviderPackagePrice({rateCents,sessionCount,pricing}){
 if(!Number.isSafeInteger(rateCents)||rateCents<0)throw fail('Set an hourly client fee for the selected provider and service.');
 if(!Number.isInteger(sessionCount)||sessionCount<1||sessionCount>10000)throw fail('Choose 1–10000 sessions.');
 const hourlyRateCents=Math.round(rateCents*(1-pricing.discountPercent/100));
 const amountCents=Math.round(hourlyRateCents*sessionCount*pricing.minutes/60);
 if(!Number.isSafeInteger(amountCents)||amountCents>2147483647)throw fail('Package total exceeds the supported amount.');
 return {baseHourlyRateCents:rateCents,hourlyRateCents,amountCents,sessionCount,...pricing};
}
export function assertPackageProviderBinding(snapshot,appointment){
 if(snapshot?.mode!=='provider-discount')return;
 if(Number(snapshot.providerId)!==Number(appointment.providerUserId??appointment.provider_user_id)||Number(snapshot.tenantServiceId)!==Number(appointment.tenantServiceId??appointment.tenant_service_id))throw fail('This package is assigned to a different provider or service.');
 const start=appointment.startAt??appointment.start_at,end=appointment.endAt??appointment.end_at;
 if(start&&end){const duration=(new Date(end)-new Date(start))/60000;if(!Number.isFinite(duration)||Math.abs(duration-snapshot.minutes)>0.01)throw fail('The appointment duration must match the purchased package.');}
 const group=appointment.participantMode??appointment.participant_mode;
 if(snapshot.format==='small-group'&&group!=='multi')throw fail('This package is for a small-group session.');
 if(snapshot.format!=='small-group'&&group==='multi')throw fail('This package is for an individual session.');
 const modality=String(appointment.modality||'').toUpperCase();
 if(snapshot.format==='virtual'&&!['TELEHEALTH','VIRTUAL'].includes(modality)||snapshot.format==='in-person'&&modality!=='IN_PERSON')throw fail('The appointment format must match the purchased package.');
}

// Expiration limits when a session may occur, not when staff record its completion.
export function assertPackageExpiration(snapshot,activatedAt,sessionStart){
 const days=snapshot?.policies?.expirationDays;
 if(!days||!activatedAt)return;
 const utc=v=>v instanceof Date?v:new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(String(v))?v:String(v).replace(' ','T')+'Z');
 const expires=utc(activatedAt).getTime()+Number(days)*86400000,start=utc(sessionStart).getTime();
 if(!Number.isFinite(start)||!Number.isFinite(expires)||start>=expires)throw fail('The session falls after this package expires. Choose another package or contact the team.');
}
