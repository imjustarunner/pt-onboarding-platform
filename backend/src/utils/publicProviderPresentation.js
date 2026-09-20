// Shared public presentation policy; these values never change appointment or claim records.
export function publicLanguages(profile, fallback) {
 let values=profile?.details?.languages;
 if(!Array.isArray(values)||!values.some(v=>String(v).trim())) {
  try { values=typeof fallback==='string'&&fallback.startsWith('[')?JSON.parse(fallback):fallback; } catch { values=[]; }
  if(typeof values==='string')values=values.split(/[,;|]/);
 }
 return Array.isArray(values)&&values.some(v=>String(v).trim())?[...new Set(values.map(v=>String(v).trim()).filter(Boolean))]:['English'];
}
export function uniquePublicFacets(values=[]) {
 const groups=new Map();
 for(const raw of values){const value=String(raw||'').trim();if(!value)continue;
  const key=value.toLowerCase().replace(/[–—]/g,'-').replace(/\s*\([^)]*\)/g,'').replace(/\s+/g,' ').replace(/^children?$/,'children').replace(/^preteens?$/,'preteen').replace(/^teens?$/,'teen').replace(/^adults?$/,'adult').replace(/^toddlers?$/,'toddler');
  if(!groups.has(key)||value.includes('(')&&!groups.get(key).includes('('))groups.set(key,value);
 }
 return [...groups.values()];
}
export function isBachelorLevelProvider(person={}) {
 const credential=String(person.credential||'');
 if(/\b(MA|MS|MSW|MFT|MEd|LPC|LPCC|LCSW|LSW|SWC|LMFT|PhD|PsyD)\b/i.test(credential))return false;
 return /\b(B\.?A\.?|B\.?S\.?)\b|bachelor/i.test(credential)||/mental health facilitator/i.test(person.title||'');
}
export function restrictPublicInsurances(rows,person) {
 if(!isBachelorLevelProvider(person))return rows;
 return rows.filter(i=>/medicaid|health first colorado|colorado access|coaccess|colorado community health alliance|\bccha\b|northeast health partners/i.test(i.name||i.label||i));
}
export function publicAcceptance({globalAccepting=false,manual='auto',hasOpenings=false,assigned=true}={}) {
 if(hasOpenings)return {status:'accepting',source:'schedule',hasOpenings:true};
 if(!assigned)return {status:'unavailable',source:'assignment',hasOpenings:false};
 if(manual==='waitlist')return {status:'waitlist',source:'manual',hasOpenings:false};
 if([false,0,'0'].includes(globalAccepting))return {status:'unavailable',source:'global',hasOpenings:false};
 if(['accepting','waitlist','unavailable'].includes(manual))return {status:manual,source:'manual',hasOpenings:false};
 return {status:globalAccepting?'accepting':'unavailable',source:'global',hasOpenings:false};
}
