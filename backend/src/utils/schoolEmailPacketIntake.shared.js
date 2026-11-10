import {currentSupportEmailText} from './supportEmailDraft.shared.js';

const nameWord="[\\p{L}][\\p{L}'’\\-]*";
export function emailedPacketClientName(subject,body) {
  const text=`${String(subject||'').replace(/^(?:re|fwd?):\s*/gi,'')}\n${currentSupportEmailText(body)}`;
  const patterns=[
    new RegExp(`\\b(?:client|student|child)(?:['’]s)?\\s+(?:full\\s+)?name\\s*[:=]\\s*(${nameWord}(?:[ \\t]+${nameWord}){1,3})`,'iu'),
    new RegExp(`\\b(?:packet|referral|enrollment)(?:\\s+packet)?\\s+for\\s+(${nameWord}(?:[ \\t]+${nameWord}){1,3})`,'iu')
  ];
  const names=[];
  for(const pattern of patterns){for(const match of text.matchAll(new RegExp(pattern.source,`${pattern.flags}g`))){
    // Several children in one attachment need a person to split and identify it.
    const line=text.slice(match.index).split('\n')[0];
    if(/\b(?:and|or)\b|[,;&]/i.test(line))return null;
    const parts=match[1].trim().split(/\s+/);const boundary=parts.findIndex((p,i)=>i>0&&/^(?:at|to|from|and|with|who|is|was|attached|please|the|see|for)$/i.test(p));
    const selected=boundary<0?parts:parts.slice(0,boundary);
    if(selected.length<2||selected.some(p=>/^(?:the|student|client|school|referral|packet|parent|attached|please)$/i.test(p)))continue;
    names.push({firstName:selected[0],lastName:selected.slice(1).join(' ')});
  }}
  const unique=[...new Map(names.map(n=>[`${n.firstName} ${n.lastName}`.toLowerCase(),n])).values()];
  return unique.length===1?unique[0]:null;
}
export function emailedPacketIntent(subject,body) {
  const text=`${subject||''}\n${currentSupportEmailText(body)}`;
  return /\b(?:packet|referral|enrollment paperwork)\b/i.test(text)&&/\b(?:attach\w*|send\w*|sent|upload\w*|packet|referral)\b/i.test(text);
}
export function packetHasOtherRequest(body) {
  const text=currentSupportEmailText(body);
  return /\b(?:portal|log[ -]?in|sign[ -]?in|error|problem|cannot|can['’]t|unable|schedule|appointment)\b/i.test(text)
    || /\b(?:can|could|would) you\b[^?\n]{0,160}\?/i.test(text.replace(/\b(?:upload|process|receive|confirm receipt of)\b[^?\n]{0,100}\?/gi,''));
}
export function packetFileIsSupported(buffer,mime) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024)return false;
  if(mime==='application/pdf')return buffer.subarray(0,5).toString()==='%PDF-';
  if(mime==='image/png')return buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(['image/jpeg','image/jpg'].includes(mime))return buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
  return false;
}
export function schoolPacketReceiptBody(){return 'Thank you for sending the packet. We’ve received it and uploaded it to the school’s intake queue for review. Our team will follow up if anything else is needed.';}
