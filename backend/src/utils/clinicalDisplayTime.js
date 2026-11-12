export function clinicalDisplayTimestamp(value,timeZone='America/Denver'){
 if(!value)return 'Not recorded';
 const raw=String(value),date=value instanceof Date?value:new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw)?raw:`${raw.replace(' ','T')}Z`);
 if(!Number.isFinite(date.getTime()))return raw;
 return new Intl.DateTimeFormat('en-US',{timeZone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(date);
}
export function clinicalDisplayClock(value){
 const match=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
 if(!match)return String(value || '');
 const hour=Number(match[1]);return `${hour%12 || 12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
