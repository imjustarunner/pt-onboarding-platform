export function clientVisitLabel(client,timeZone='America/Denver') {
  if(client.next_date)return `${client.next_date}${client.time?` · ${client.time}`:''}`;
  if(!client.next_visit_at)return 'No upcoming booking';
  const value=String(client.next_visit_at);
  const date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value.replace(' ','T')+'Z');
  if(Number.isNaN(date.getTime()))return 'Visit time not recorded';
  return new Intl.DateTimeFormat('en-US',{timeZone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}
