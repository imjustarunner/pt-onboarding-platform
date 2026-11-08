export function participantChoice(value,serviceCode=''){
 const text=String(value || '').trim();if(!text)return ['90832','90834','90837'].includes(serviceCode)?'Client Only':'';
 if(/^client(?: only)?$/i.test(text))return 'Client Only';
 if(/without client|parent only|guardian only|caregiver only/i.test(text))return 'Parent/Guardian without Client';
 if(/client/i.test(text) && /parent|guardian|caregiver/i.test(text))return 'Client and Parent/Guardian';
 if(/client/i.test(text) && /other|collateral|interpreter|supervisor|partner|spouse/i.test(text))return 'Client and Other Participants';
 return text;
}
export function encounterMethod(value,{placeOfService='',locationLabel=''}={}){
 const text=String(value || '').trim().toLowerCase();if(['in_person','video','phone'].includes(text))return text;
 if(/phone|telephone/.test(text))return 'phone';if(/virtual|telehealth|video/.test(text))return 'video';if(/in.person/.test(text))return 'in_person';
 if(['02','10'].includes(String(placeOfService)) || /virtual|telehealth/i.test(locationLabel))return ''; // Video versus phone needs an explicit choice.
 return placeOfService || locationLabel ? 'in_person':'';
}
export async function currentGenerationReceipt(receipt,inputText,serviceCode,writerMode){
 try{const payload=JSON.parse(atob(String(receipt).split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))),bytes=new TextEncoder().encode(JSON.stringify([String(inputText || '').trim(),String(serviceCode || '').trim().toUpperCase(),writerMode]));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return payload.v===1 && payload.sourceHash===hash;}catch{return false;}
}
