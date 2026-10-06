// Event selection never treats unrelated care/appointment text as a vote.
export function selectCompanyEventVote(events, body) {
  const input=String(body||'').trim();
  const [code='',...rest]=input.split(/\s+/);
  const explicit=events.find(e=>e.smsCode && e.smsCode.toUpperCase()===code.toUpperCase());
  const matches=(event,value)=>(event.votingConfig?.options||[]).some(o=>[o.key,o.label].some(v=>String(v).toUpperCase()===value.toUpperCase()));
  if(explicit)return {event:explicit,response:rest.join(' ')};
  if(events.length===1 && matches(events[0],input))return {event:events[0],response:input};
  if(events.length>1 && events.some(e=>matches(e,input)))return {ambiguous:true,codes:events.map(e=>e.smsCode).filter(Boolean)};
  return null;
}
