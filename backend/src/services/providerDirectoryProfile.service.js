// Explicit public DTO: account credentials, demographics, license numbers and
// review notes must never leak into a directory search response.
export const STATES = Object.freeze('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' '));
export const HERITAGES = Object.freeze(['Hispanic','Latino','Latina','Latinx','Latine','Hispanic / Latino']);
export const json = value => typeof value === 'string' ? JSON.parse(value) : (value || {});
const text = (v, n = 250) => String(v ?? '').trim().slice(0,n);
const list = v => Array.isArray(v) ? [...new Set(v.map(x => text(x,100)).filter(Boolean))].slice(0,100) : [];
export function safeUrl(v) {
  try { const u = new URL(v); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function cleanProfile(input = {}, photoUrl = null) {
  return {
    name:text(input.name), credentials:text(input.credentials,100), pronouns:text(input.pronouns,80), practice:text(input.practice),
    bio:text(input.bio,6000), publicEmail:text(input.publicEmail,254), publicPhone:text(input.publicPhone,40), website:safeUrl(input.website),
    languages:list(input.languages), specialties:list(input.specialties), clientAges:list(input.clientAges), populations:list(input.populations), approaches:list(input.approaches), insurance:list(input.insurance),
    virtual:input.virtual === true, inPerson:input.inPerson === true, acceptingClients:input.acceptingClients === true,
    fee:text(input.fee,150), availability:text(input.availability,500), photoUrl,
    locations:(Array.isArray(input.locations) ? input.locations : []).slice(0,20).map(l=>({city:text(l.city,100),state:STATES.includes(l.state)?l.state:'',zip:text(l.zip,10)})),
    licenses:(Array.isArray(input.licenses) ? input.licenses : []).slice(0,60).map(l=>({state:STATES.includes(l.state)?l.state:'',type:text(l.type,80),number:text(l.number,100),expires:/^\d{4}-\d{2}-\d{2}$/.test(l.expires || '') ? l.expires : ''}))
  };
}
export function submissionErrors(p, { heritageRequired, heritage, optIn, verified }) {
 const errors=[];
 if (!verified) errors.push('Verify your account email before submitting.');
 if (!optIn) errors.push('Consent to publication is required.');
 if (heritageRequired && !HERITAGES.includes(heritage)) errors.push('Select your Hispanic or Latino heritage to join this directory.');
 if (!p.name || !p.credentials || p.bio.length < 40) errors.push('Add your name, credentials and a biography of at least 40 characters.');
 if (!p.licenses.length || p.licenses.some(l=>!l.state || !l.type || !l.number || !l.expires || l.expires < new Date().toISOString().slice(0,10))) errors.push('Add a current license, including state, number, type and expiration.');
 if (!p.virtual && !p.inPerson) errors.push('Choose virtual or in-person care.');
 if (p.inPerson && (!p.locations.length || p.locations.some(l=>!l.city || !l.state))) errors.push('Add a city and state for in-person care.');
 if (!p.languages.length || !p.specialties.length) errors.push('Select languages and specialties.');
 if (!p.website && !p.publicEmail && !p.publicPhone) errors.push('Add a public contact method.');
 if (p.publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.publicEmail)) errors.push('Enter a valid public email.');
 return errors;
}
export function publicProfile(member) {
 const p=cleanProfile(json(member.published_json), json(member.published_json).photoUrl);
 return { id:member.id, ...p, licenses:p.licenses.map(({state,type})=>({state,type})) };
}
export function matchesSearch(p, q={}) {
 const exact=(key,value)=>!value || p[key].some(s=>s.toLowerCase()===String(value).toLowerCase());
 if(q.state && !((q.care !== 'inPerson' && p.virtual && p.licenses.some(l=>l.state===q.state)) || (q.care !== 'virtual' && p.inPerson && p.locations.some(l=>l.state===q.state)))) return false;
 if(q.care && !p[q.care]) return false;
 if(!exact('languages',q.language)||!exact('insurance',q.insurance)||!exact('specialties',q.specialty)||!exact('clientAges',q.age)) return false;
 const search=String(q.search||'').trim().toLowerCase();
 return !search || [p.name,p.practice,...p.locations.map(l=>`${l.city} ${l.zip}`)].join(' ').toLowerCase().includes(search);
}

// Parameterized JSON predicates keep nationwide searches paginated in MySQL;
// only the approved public snapshot is searched, never a provider's draft.
export function directorySearchSql(portalId, query={}) {
 const where=["portal_id=?", "member_role='provider'",'is_active=1','opt_in=1','email_verified=1','published_json IS NOT NULL',"status NOT IN ('suspended','rejected')"];
 const args=[portalId];
 const care=['virtual','inPerson'].includes(query.care)?query.care:'';
 if(care) where.push(`JSON_EXTRACT(published_json,'$.${care}')=TRUE`);
 if(query.state){
  const state=String(query.state).toUpperCase();
  if(!STATES.includes(state)) where.push('1=0');
  else {
   const clauses=[];
   if(care!=='inPerson'){clauses.push("(JSON_EXTRACT(published_json,'$.virtual')=TRUE AND JSON_CONTAINS(JSON_EXTRACT(published_json,'$.licenses'),JSON_OBJECT('state',?)))");args.push(state);}
   if(care!=='virtual'){clauses.push("(JSON_EXTRACT(published_json,'$.inPerson')=TRUE AND JSON_CONTAINS(JSON_EXTRACT(published_json,'$.locations'),JSON_OBJECT('state',?)))");args.push(state);}
   where.push(`(${clauses.join(' OR ')})`);
  }
 }
 for(const [key,path] of [['language','languages'],['insurance','insurance'],['specialty','specialties'],['age','clientAges']]) {
  if(query[key]){where.push(`JSON_CONTAINS(JSON_EXTRACT(published_json,'$.${path}'),JSON_QUOTE(?))`);args.push(String(query[key]).slice(0,100));}
 }
 const search=String(query.search||'').trim().slice(0,150);
 if(search){where.push("LOWER(CONCAT_WS(' ',JSON_UNQUOTE(JSON_EXTRACT(published_json,'$.name')),JSON_UNQUOTE(JSON_EXTRACT(published_json,'$.practice')),JSON_EXTRACT(published_json,'$.locations'))) LIKE ?");args.push(`%${search.toLowerCase().replace(/[\\%_]/g,'\\$&')}%`);}
 const page=Math.max(1,Math.min(10000,Math.floor(Number(query.page)||1)));
 return {where:where.join(' AND '),args,offset:(page-1)*24};
}
