import { simpleParser } from 'mailparser';
import { assignedMember, occurrenceKey, json } from './familyPolicy.js';

// Prefer a real plain-text MIME part; never treat attached/forwarded messages as commands.
export async function extractFamilyEmailText(payload) {
  const plain=[],html=[];
  const walk=node=>{
    if(!node || node.filename || node.mimeType==='message/rfc822')return;
    if(node.body?.data){
      const text=Buffer.from(node.body.data,'base64url').toString('utf8');
      if(node.mimeType==='text/html')html.push(text);else if(node.mimeType==='text/plain'||!node.mimeType)plain.push(text);
    }
    for(const child of node.parts || [])walk(child);
  };
  walk(payload);
  if(plain.length)return plain[0];
  if(!html.length)return '';
  const source=html[0].split(/<blockquote\b|<div\b[^>]*class=["'][^"']*(?:gmail_quote|yahoo_quoted)/i)[0];
  const parsed=await simpleParser(`Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${source}`);
  return parsed.text || '';
}

export function cleanFamilyEmailBody(value) {
  const lines=[];
  for (const line of String(value || '').replace(/\r\n?/g,'\n').split('\n')) {
    if (/^\s*(?:>|On .+wrote:|From:\s|--\s*$|-{2,}\s*Original Message|Sent from my|Get Outlook for)/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

// Deliberately bounded commands: email text never becomes executable instructions or AI prompts.
export function parseFamilyEmail(subject, body) {
  let s=String(subject || '').replace(/^(?:(?:re|fw|fwd):\s*)+/i,'').trim();
  let b=cleanFamilyEmailBody(body);
  const tag=s.match(/^\[Family #(\d+)\]\s*/i);
  const householdId=tag ? Number(tag[1]) : null;
  if(tag)s=s.slice(tag[0].length);
  const parse=text=>{
    const raw=text.trim().replace(/^(?:(?:can|could) you |please )+/i,'');
    const q=raw.replace(/[?!.]$/,'').toLowerCase().replace(/^what(?:['’]s| is) on /,'');
    if (/^(?:(?:show|send|email)(?: me)? )?(?:my |our |the |family )?(?:grocery list|groceries)$/.test(q))return {action:'read',section:'grocery'};
    if (/^(?:(?:show|send|email)(?: me)? )?(?:my |our |the |family )?(?:to[ -]?dos?(?: list)?|chores)$/.test(q))return {action:'read',section:'chore'};
    if (/^(?:(?:show|send|email)(?: me)? )?(?:family )?(?:upcoming(?: events| plans)?|what['’]?s coming up|what is coming up)$/.test(q))return {action:'read',section:'upcoming'};
    if (/^(?:family (?:summary|update|digest)|my family|our family|family help)$/.test(q))return {action:q==='family help'?'help':'read',section:'all'};
    const m=raw.match(/^(?:add(?: to)?\s+(?:(?:my|our|the|family)\s+)?(groceries|grocery(?: list)?|shopping(?: list)?|family tasks?|to[ -]?dos?(?: list)?|chores)|(?:groceries|grocery list))\s*:?\s*([\s\S]*)$/i);
    if(!m)return null;
    const kind=/shopping/i.test(m[1])?'shopping':/task|to[ -]?do|chore/i.test(m[1])?'chore':'grocery';
    const items=[...new Map(m[2].split(/[,;\n]+/).map(x=>x.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean).map(x=>[x.toLowerCase(),x])).values()];
    const invalid=items.length>30||items.some(x=>x.length>200)||text.length>8000;
    return {action:'add',section:kind,items:invalid?[]:items,error:invalid?'Use up to 30 items, each under 200 characters.':items.length?null:'Put your items after the command, separated by commas or on separate lines.'};
  };
  // A new command in a reply takes precedence over the old subject.
  const fromBody=parse(b);
  if(fromBody)return {...fromBody,householdId};
  const fromSubject=parse(s);
  if(fromSubject?.action==='add' && !fromSubject.items.length && !fromSubject.error?.startsWith('Use'))return {...parse(`${s}\n${b}`),householdId};
  return fromSubject ? {...fromSubject,householdId} : null;
}

// Only direct, authenticated From addresses may authorize family access. Never trust Reply-To,
// a forwarded sender, or an authentication result inserted below Gmail's own first result.
export function authenticatedFamilySender(headers, fromEmail) {
  const get=name=>(headers || []).filter(h=>String(h.name).toLowerCase()===name).map(h=>String(h.value));
  const from=get('from');
  const addresses=from[0]?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const email=String(fromEmail || '').trim().toLowerCase();
  if(from.length!==1||addresses.length!==1||addresses[0].toLowerCase()!==email)return false;
  const auth=get('authentication-results')[0] || '';
  if(!/^mx\.google\.com\s*;/i.test(auth.trim()))return false;
  const domain=email.split('@')[1];
  return auth.split(';').some(part=>/^\s*dmarc=pass\b/i.test(part) && part.match(/\bheader\.from=([^\s;()]+)/i)?.[1].toLowerCase()===domain);
}

export function familyPocketUrl(householdId) {
  const origin=process.env.FAMILY_COMMAND_CENTER_ORIGIN || 'https://qv.app.mentalrange.org';
  return `${origin.replace(/\/$/,'')}/family?view=on-the-go&household=${Number(householdId)}`;
}

export function buildFamilySummary({household,members,entries,activity}, now=new Date()) {
  const names=new Map(members.map(m=>[Number(m.user_id),m.display_name]));
  const zone=household.timezone;
  const date=value=>new Date(value).toLocaleString('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const list=kind=>entries.filter(e=>e.kind===kind&&!e.completed_at&&!e.archived_at).map(e=>({id:e.id,title:e.title,detail:names.get(Number(e.member_user_id)) || ''}));
  const chores=entries.filter(e=>e.kind==='chore'&&!e.archived_at).filter(e=>!activity.some(a=>Number(a.entry_id)===Number(e.id)&&a.occurrence_key===occurrenceKey(e,zone,now)&&['pending','approved'].includes(a.state)));
  const upcoming=entries.filter(e=>['event','status'].includes(e.kind)&&!e.archived_at&&new Date(e.end_at)>now&&new Date(e.start_at)<new Date(+now+7*86400000)).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
  const sections=[
    {key:'grocery',title:'Grocery list',items:list('grocery')},
    {key:'shopping',title:'Shopping list',items:list('shopping')},
    {key:'chore',title:'To-dos & chores',items:chores.map(e=>({id:e.id,title:e.title,detail:[names.get(Number(assignedMember(e,zone,now)))||'Everyone',e.start_at?`Due ${date(e.start_at)}`:'',json(e.metadata).recurrence!=='none'?json(e.metadata).recurrence:''].filter(Boolean).join(' · ')}))},
    {key:'upcoming',title:'Upcoming · next 7 days',items:upcoming.map(e=>({id:e.id,title:e.title,detail:[json(e.metadata).allDay?new Date(e.start_at).toLocaleDateString('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric'})+' · All day':date(e.start_at),names.get(Number(e.member_user_id)),json(e.metadata).address].filter(Boolean).join(' · ')}))}
  ];
  return {householdId:household.id,name:household.name,timezone:zone,generatedAt:now.toISOString(),url:familyPocketUrl(household.id),sections};
}

export function familySummaryText(summary, section='all') {
  const sections=summary.sections.filter(s=>section==='all'||s.key===section);
  return [summary.name,`Updated ${new Date(summary.generatedAt).toLocaleString('en-US',{timeZone:summary.timezone})} (${summary.timezone})`,...sections.flatMap(s=>['',`${s.title.toUpperCase()} (${s.items.length})`,...(s.items.length?s.items.slice(0,50).map(i=>`• ${i.title}${i.detail?' — '+i.detail:''}`):['Nothing on this list.']),...(s.items.length>50?['More items are available in the dashboard.']:[])]),'','Open your live lists:',summary.url].join('\n');
}

export function familyEmailHtml(text) {
  const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<div style="background:#f4f1ea;padding:24px;font-family:Arial,sans-serif;color:#25313c"><h1 style="font-size:22px">Your family, on the go</h1><div style="background:#fffdf8;padding:20px;border:1px solid #d6d5ce;border-radius:12px;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere">${escape(text)}</div></div>`;
}
