// Event selection never treats unrelated care/appointment text as a vote.
export function selectCompanyEventVote(events, body) {
  const input=String(body||'').trim();
  const [code='',...rest]=input.split(/\s+/);
  const candidates=events.filter(e=>[e.smsTopicCode,e.smsCode].some(value=>value && String(value).toUpperCase()===code.toUpperCase()));
  const codes=items=>items.map(e=>e.smsTopicCode || e.smsCode).filter(Boolean);
  if(candidates.length>1)return {ambiguous:true,codes:codes(candidates)};
  const explicit=candidates[0];
  const matches=(event,value)=>(event.votingConfig?.options||[]).some(o=>[o.key,o.label].some(v=>String(v).toUpperCase()===value.toUpperCase()));
  if(explicit)return {event:explicit,response:rest.join(' ')};
  if(events.length===1 && matches(events[0],input))return {event:events[0],response:input};
  if(events.length>1 && events.some(e=>matches(e,input)))return {ambiguous:true,codes:codes(events)};
  return null;
}
