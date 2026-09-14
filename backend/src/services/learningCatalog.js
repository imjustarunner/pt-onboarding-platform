export const LEARNING_PROGRAMS = ['tutoring', 'academic-acceleration', 'bridge'];
export const LEARNING_TIERS = ['L1','L2','L3','L4','L5'];
export const EDUCATION_LEVELS = ['secondary-student', 'college-student', 'associate', 'bachelor', 'master', 'doctorate'];
export const LEARNING_COMPONENTS = ['tutoring', 'skill-development', 'counseling'];
export const LEARNING_FORMATS = ['virtual', 'in-person', 'small-group'];
const fail = message => { const e = new Error(message); e.status = 400; throw e; };
const cents = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
export function normalizeLearningProfile(raw = {}) {
  const programs = raw.programs ?? ['tutoring'];
  if (!Array.isArray(programs) || programs.some(p => !LEARNING_PROGRAMS.includes(p))) fail('Choose valid learning programs.');
  const educationLevel = raw.educationLevel || '';
  if (educationLevel && !EDUCATION_LEVELS.includes(educationLevel)) fail('Choose a valid education level.');
  const tierId=raw.tierId || '';
  if(tierId&&!LEARNING_TIERS.includes(tierId))fail('Choose a valid learning staff tier.');
  const overrides = raw.rateOverrides || [];
  if (!Array.isArray(overrides) || overrides.length > 30) fail('Invalid rate overrides.');
  const rateOverrides = overrides.map(r => {
    if (!LEARNING_COMPONENTS.includes(r.service) || !LEARNING_FORMATS.includes(r.format) || !cents(r.hourlyRateCents)) fail('Each override needs a service, format, and nonnegative hourly rate.');
    return {service:r.service,format:r.format,hourlyRateCents:r.hourlyRateCents};
  });
  if (new Set(rateOverrides.map(r=>`${r.service}:${r.format}`)).size !== rateOverrides.length) fail('Only one override per service and format.');
  return {programs:[...new Set(programs)],educationLevel,tierId,rateOverrides};
}
export function validateLearningCatalog(raw = {}) {
  if (!Array.isArray(raw.rates) || !Array.isArray(raw.packages) || raw.rates.length > 200 || raw.packages.length > 100) fail('Invalid learning catalog.');
  const rates = raw.rates.map(r => {
    if (!EDUCATION_LEVELS.includes(r.educationLevel) || !LEARNING_COMPONENTS.includes(r.service) || !LEARNING_FORMATS.includes(r.format) || !cents(r.hourlyRateCents)) fail('Each rate needs an education level, service, format, and nonnegative hourly rate.');
    return {educationLevel:r.educationLevel,service:r.service,format:r.format,hourlyRateCents:r.hourlyRateCents};
  });
  if (new Set(rates.map(r=>`${r.educationLevel}:${r.service}:${r.format}`)).size !== rates.length) fail('Duplicate rate rules.');
  const packages = raw.packages.map(p => {
    if (!/^[a-z0-9-]{1,64}$/.test(p.id) || !String(p.name||'').trim() || !LEARNING_PROGRAMS.includes(p.program) || !Array.isArray(p.components) || !p.components.length || p.components.length>20) fail('Each package needs a unique ID, name, program, and components.');
    return {id:p.id,name:String(p.name).trim().slice(0,160),program:p.program,published:p.published===true,components:p.components.map(c=>{
      const pricingMode=c.pricingMode || 'rate-rule';
      if (!['rate-rule','provider-discount'].includes(pricingMode) || (pricingMode==='provider-discount' && (!Number.isFinite(c.discountPercent) || c.discountPercent<0 || c.discountPercent>100 || c.hourlyRateCents!=null))) fail('Provider discounts must be 0–100 percent, without a fixed hourly price.');
      if (!LEARNING_COMPONENTS.includes(c.service) || !LEARNING_FORMATS.includes(c.format) || (pricingMode==='rate-rule' && !EDUCATION_LEVELS.includes(c.educationLevel)) || !Number.isInteger(c.sessions) || c.sessions<1 || c.sessions>100 || !Number.isInteger(c.minutes) || c.minutes<15 || c.minutes>240 || (c.hourlyRateCents!=null&&!cents(c.hourlyRateCents))) fail('Package components need service, format, education level, 1–100 sessions, duration, and an optional hourly discount rate.');
      return {service:c.service,format:c.format,educationLevel:pricingMode==='provider-discount'?'':c.educationLevel,sessions:c.sessions,minutes:c.minutes,hourlyRateCents:c.hourlyRateCents??null,pricingMode,discountPercent:pricingMode==='provider-discount'?c.discountPercent:0};
    })};
  });
  if(new Set(packages.map(p=>p.id)).size!==packages.length) fail('Package IDs must be unique.');
  if(raw.tiers!=null&&!Array.isArray(raw.tiers))fail('Learning tiers must be a list.');
  const tiers=(raw.tiers||[]).map(t=>{
    if(!LEARNING_TIERS.includes(t.id)||!String(t.name||'').trim())fail('Choose a valid tier and name.');
    const fees={},pay={};
    for(const format of LEARNING_FORMATS){
      for(const [target,source] of [[fees,t.fees],[pay,t.pay]]){
        const value=source?.[format]??null;if(value!=null&&!cents(value))fail('Tier fees and pay must be nonnegative cents.');target[format]=value;
      }
    }
    return {id:t.id,name:String(t.name).trim().slice(0,100),description:String(t.description||'').slice(0,1000),fees,pay};
  });
  if(new Set(tiers.map(t=>t.id)).size!==tiers.length)fail('Tier IDs must be unique.');
  return {version:1,rates,packages,tiers};
}
export function hourlyRate(catalog, profile, service, format) {
  return profile.rateOverrides?.find(r=>r.service===service&&r.format===format)?.hourlyRateCents
    ?? (service==='tutoring'&&profile.tierId?catalog.tiers?.find(t=>t.id===profile.tierId)?.fees?.[format]:null)
    ?? catalog.rates?.find(r=>r.educationLevel===profile.educationLevel&&r.service===service&&r.format===format)?.hourlyRateCents ?? null;
}
// Context is keyed by service: a tutor's rate must never price a counselor's work.
export function pricePackage(catalog, pkg, providersByService = {}) {
  const components=pkg.components.map(c=>{
    const context=providersByService[c.service];
    const providerDiscount=c.pricingMode==='provider-discount';
    const baseHourlyRateCents=providerDiscount
      ? (context?.profile ? hourlyRate(catalog,context.profile,c.service,c.format) : null)
      : c.hourlyRateCents??hourlyRate(catalog,{educationLevel:c.educationLevel},c.service,c.format);
    const hourlyRateCents=baseHourlyRateCents==null?null:Math.round(baseHourlyRateCents*(providerDiscount?1-c.discountPercent/100:1));
    return {...c,baseHourlyRateCents,hourlyRateCents,providerId:providerDiscount?(context?.providerId??null):null,totalCents:hourlyRateCents==null?null:Math.round(hourlyRateCents*c.sessions*c.minutes/60)};
  });
  return {...pkg,components,totalCents:components.some(c=>c.totalCents==null)?null:components.reduce((sum,c)=>sum+c.totalCents,0)};
}
export function gradeNumbers(value) {
  const s=String(value).toLowerCase().replace(/[–—]/g,'-').replace(/grade\s*/g,'').trim();
  if(s==='pre-k-k') return [-1,0];
  if(['pre-k','preschool','pre k'].includes(s)) return [-1];
  if(s==='college')return [13];
  const n=s.replace(/kindergarten/g,'0').replace(/\bk\b/g,'0').replace(/(st|nd|rd|th)/g,'');
  if(/^\d{1,2}$/.test(n))return [Number(n)];
  const match=n.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if(!match)return [];
  const a=Number(match[1]),b=Number(match[2]);return b>=a&&b<=13?Array.from({length:b-a+1},(_,i)=>a+i):[];
}
export function matchesGrade(grades, requested) {
  if(!requested)return true;
  const wanted=gradeNumbers(requested);const offered=new Set(grades.flatMap(gradeNumbers));
  return wanted.length>0&&wanted.every(n=>offered.has(n));
}
export function normalizeLearningInquiry(raw) {
 if(!raw)return null;
 if(!LEARNING_PROGRAMS.includes(raw.program)) fail('Choose a learning program.');
 const out={version:1,program:raw.program};
 for(const key of ['grade','subject','format','strengths','goals','schoolSupports','emotionalNeeds','funding','packageId'])out[key]=String(raw[key]||'').trim().slice(0,['strengths','goals','schoolSupports','emotionalNeeds'].includes(key)?3000:160);
 if(out.grade&&!gradeNumbers(out.grade).length)fail('Choose a valid grade.');
 if(out.format&&!LEARNING_FORMATS.includes(out.format))fail('Choose a valid learning format.');
 if(raw.reflectionVersion&&!['parent','6-10','11-13','14-18'].includes(raw.reflectionVersion))fail('Choose a valid reflection version.');
 out.reflectionVersion=raw.reflectionVersion||'parent';out.reflectionAnswers={};
 for(const [key,value] of Object.entries(raw.reflectionAnswers||{})) {
  const prefix=out.reflectionVersion.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp(`^${prefix}-(?:[1-9]|10)-[1-3]$`).test(key)||!(value===null||[1,2,3,4].includes(value)))fail('Invalid reflection response.');
  out.reflectionAnswers[key]=value;
 }
 return out;
}

// Pay standards are private compensation configuration, separate from client fees.
export function learningStaffPay(catalog,profile,format){
 return catalog.tiers?.find(t=>t.id===profile.tierId)?.pay?.[format]??null;
}
export function publicLearningCatalog(catalog){
 return {...catalog,tiers:(catalog.tiers||[]).map(({id,name,description,fees})=>({id,name,description,fees}))};
}
