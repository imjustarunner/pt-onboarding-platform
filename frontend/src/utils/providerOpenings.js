const dayKey = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function openingWeek(slots = [], now = new Date()) {
 const today = dayKey(now), start = new Date(`${today}T12:00:00Z`);
 const monday = new Date(start); monday.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
 const end = new Date(monday); end.setUTCDate(end.getUTCDate()+7);
 const unique = [...new Map(slots.filter(s=>Date.parse(s.startAt)>+now).map(s=>[`${s.startAt}:${s.programType}:${s.buildingId||''}`,s])).values()];
 const thisWeek = unique.filter(s=>{const key=dayKey(s.startAt);return key>=today&&key<end.toISOString().slice(0,10);});
 if(!thisWeek.length)return [];
 // Show remaining days this week, including weekends when openings are posted.
 const remaining = 7-((start.getUTCDay()+6)%7);
 const lastOpening = Math.max(...thisWeek.map(s=>Math.round((Date.parse(dayKey(s.startAt)+'T12:00:00Z')-start.getTime())/86400000)+1));
 const count = Math.min(remaining,Math.max(5,lastOpening));
 return Array.from({length:count},(_,i)=>{const date=new Date(start);date.setUTCDate(date.getUTCDate()+i);const key=date.toISOString().slice(0,10);return {key,label:date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}),slots:thisWeek.filter(s=>dayKey(s.startAt)===key).sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt))};});
}
