export function clinicalTimestamp(value,zone='America/Denver'){
 if(!value)return '';
 const raw=String(value),date=value instanceof Date?value:new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(raw)?raw:`${raw.replace(' ','T')}Z`);
 if(!Number.isFinite(date.getTime()))return raw;
 try{return new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(date);}catch{return clinicalTimestamp(value,'America/Denver');}
}
export function clinicalClock(value){
 const match=/^([01]?\d|2[0-3]):([0-5]\d)(?::\d\d)?$/.exec(String(value || ''));
 if(!match)return String(value || '');
 const hour=Number(match[1]);return `${hour%12 || 12}:${match[2]} ${hour>=12?'PM':'AM'}`;
}
// Only the application's generated screening labels are reformatted. This is
// a display copy; the exact signed text and its hash remain untouched.
export function clinicalNarrativeDisplay(text,zone='America/Denver'){
 return String(text || '').replace(/^(Digital questionnaire submitted: )([^\n]+?)(?: \(source timestamp\))?$/gm,(line,label,value)=>{
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value))return line;
  return `${label}${clinicalTimestamp(value,zone)} (source timestamp)`;
 }).replace(/^(Service time: )(\d{2}:\d{2})[–-](\d{2}:\d{2})([^\n]*)$/gm,(_line,label,start,end,rest)=>`${label}${clinicalClock(start)}–${clinicalClock(end)}${rest}`);
}
