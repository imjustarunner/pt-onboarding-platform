import { shiftDay } from './workspace';
export function scheduleLink(slug, actorId, row = {}, start) {
  const date=row.date||start;
  const query={};
  if(date) { const day=new Date(`${date}T12:00:00Z`).getUTCDay();query.weekStart=shiftDay(date,-((day+6)%7)); }
  if(row.providerId && Number(row.providerId)!==Number(actorId)) query.scheduleViewAs=String(row.providerId);
  return {path:`/${encodeURIComponent(slug)}/my-schedule`,query};
}
export function agendaTime(row,timeZone) {
  if(row.allDay) return 'All day';
  if(!row.startAt) return 'Time not set';
  const fmt=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit'});
  return `${fmt.format(new Date(row.startAt))}–${fmt.format(new Date(row.endAt))}`;
}
export function providerRows(providers,input) {
  const search=String(input.search||'').trim().toLowerCase();
  const rows=providers.filter(p=>(input.history==='all'||(input.history==='inactive'?!p.active:p.active)) && (!search||[p.name,p.credential].join(' ').toLowerCase().includes(search)));
  const field=input.sort==='status'?'active':'name',direction=input.order==='desc'?-1:1;
  return rows.sort((a,b)=>direction*(String(a[field]).localeCompare(String(b[field]))||a.name.localeCompare(b.name)));
}
