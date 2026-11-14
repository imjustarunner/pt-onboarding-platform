import { matchStaffPollReply } from './staffPollResponses.js';
// Event selection never treats unrelated care/appointment text as a vote.
export function selectCompanyEventVote(events, body) {
  const input=String(body||'').trim();
  const [code='',...rest]=input.split(/\s+/);
  const candidates=events.filter(e=>[e.smsTopicCode,e.smsCode].some(value=>value && String(value).toUpperCase()===code.toUpperCase()));
  const codes=items=>items.map(e=>e.smsTopicCode || e.smsCode).filter(Boolean);
  if(candidates.length>1)return {ambiguous:true,codes:codes(candidates)};
  const explicit=candidates[0];
  const matches=(event,value)=>!!matchStaffPollReply(value,event.votingConfig?.options||[]);
  if(explicit)return {event:explicit,response:rest.join(' ')};
  const matching=events.filter(event=>matches(event,input));
  if(matching.length===1)return {event:matching[0],response:input};
  if(matching.length>1)return {ambiguous:true,codes:codes(matching)};
  return null;
}
