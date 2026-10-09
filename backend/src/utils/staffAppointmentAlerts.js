export function replyMatchesPreference(mode,intent){return mode==='cancellations'?intent==='cancel':mode==='confirmations'?intent==='confirm':true;}
export function safeAppointmentAlert(type,details={}){
 const start=new Date(details.startAt);if(!Number.isFinite(start.getTime()))return null;
 let when;try{when=start.toLocaleString('en-US',{timeZone:details.timeZone||'America/Denver',weekday:'long',hour:'numeric',minute:'2-digit'});}catch{return null;}
 if(type==='kiosk_checkin')return `Your ${when} appointment just checked in!`;
 const action=details.intent==='cancel'?(details.applied?'has canceled':'requested cancellation or reported an absence'):details.intent==='confirm'?'confirmed':details.intent==='reschedule'?'requested another time':'sent a reply';
 return `Your ${when} appointment ${action}.`;
}
