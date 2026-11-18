export function googleMeetingConference(event = {}) {
 const entries=event.conferenceData?.entryPoints||[];
 const video=entries.find(entry=>entry.entryPointType==='video')?.uri||event.hangoutLink;
 let meetLink=null;
 try{const url=new URL(video);if(url.protocol==='https:'&&url.hostname==='meet.google.com'&&!url.username&&!url.password)meetLink=url.href;}catch{}
 const phones=meetLink?entries.filter(entry=>entry.entryPointType==='phone').flatMap(entry=>{
  const number=String(entry.uri||'').match(/^tel:(\+?[0-9 ()-]{7,30})(?:[;,].*)?$/i)?.[1];
  const pin=String(entry.pin||'').trim();
  if(!number||!/^\d[\d\s-]{1,30}\d$/.test(pin))return [];
  return [{number,pin:pin.replace(/[\s-]/g,''),label:String(entry.label||number).slice(0,100),telephoneUrl:`tel:${number.replace(/[ ()-]/g,'')}`}];
 }):[];
 return {meetLink,phones};
}
