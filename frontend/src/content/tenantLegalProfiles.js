// Public identities from the app's tenant and marketing records; not proof of legal ownership.
// Do not add an LLC suffix, covered-entity status, or a privacy officer without source evidence.
const profile = (slug, name, origin, kind, options = {}) => ({slug, name, legalName:name, origin, kind, color:'#285e51', logo:'', contactUrl:`${origin}/contact`, ...options});
export const tenantLegalProfiles = {
  itsco: profile('itsco','ITSCO','https://www.itsco.health','healthcare',{legalName:'ITSCO, LLC',logo:'/assets/itsco/logo.png',email:'support@itsco.health',privacyEmail:'PO@ITSCO.health',privacyPhone:'833-444-8726',privacyOfficer:'Michael Mendez'}),
  nlu: profile('nlu','Next Level Up','https://nextleveluplcc.com','healthcare',{legalName:'NEXTLEVELUP, LLC',logo:'/assets/nlu/logo.png',color:'#1F2A44',phone:'719-377-6577'}),
  tisi: profile('tisi','The Inner Strength Institute','https://theinnerstrengthinstitute.com','healthcare',{legalName:'The Inner Strength Institute LLC',logo:'/assets/branding/innerstrength-mark.png',color:'#1E40AF',phone:'719-657-1381',email:'support@innerstrengthin.com'}),
  // A provider NPP remains a draft until this practice supplies a working privacy contact.
  rise: profile('rise','Rise Revive','https://risereviveco.com','prelaunch',{logo:'/assets/rise/logo.webp',color:'#123f2e'}),
  mh4kidz: profile('mh4kidz','MH4Kidz','https://mh4kidz.org','coordination',{logo:'/assets/mh4kidz/logo.png',color:'#317e32',email:'support@mh4kidz.org'}),
  range: profile('range','Mental Range Collective','https://mentalrange.org','network',{logo:'/assets/range/logo.svg',color:'#315866'}),
  kimi: profile('kimi','Kimi Cain Life Coaching','https://kimicain.com','coaching',{logo:'/assets/kimi/logo.svg',color:'#4e624b'}),
  ptco: profile('ptco','Plot Twist Co','https://plottwistco.com','platform',{logo:'/assets/ptco/logo-flat.webp',color:'#A71111',email:'Support@plottwistco.com',phone:'833-756-8894',privacyEmail:'HQ@plottwistco.com',privacyOfficer:'Michael Mendez'}),
  auricwell: profile('auricwell','AuricWell','https://auricwell.com','platform',{legalName:'Plot Twist Co',legalOrigin:'https://plottwisthq.com',logo:'/assets/auricwell-session-logo.png',color:'#5d5941',email:'Support@plottwistco.com',phone:'833-756-8894',privacyEmail:'HQ@plottwistco.com',privacyOfficer:'Michael Mendez',contactUrl:'https://plottwistco.com/contact'}),
  schoolcarebridge: profile('schoolcarebridge','SchoolCareBridge','https://mh4kidz.org','coordination',{legalName:'MH4Kidz',logo:'/assets/schoolcarebridge/logo.png',color:'#245e51',email:'support@mh4kidz.org',contactUrl:'https://mh4kidz.org/contact'}),
  michael: profile('michael','Michael V. Mendez Consulting','https://plottwisthq.com','consulting',{color:'#304c58',contactUrl:'https://plottwisthq.com/michael'}),
  sstc: profile('sstc','Summit Stats Team Challenge','https://summitstatstc.com','fitness',{color:'#1F6FB5',contactUrl:'https://summitstatstc.com/support'})
};
export const tenantLegalAliases = {plottwistco:'ptco',plottwist:'ptco',plottwisthq:'ptco',nextlevelup:'nlu',nextleveluplcc:'nlu','next-level-up':'nlu',innerstrength:'tisi',theinnerstrengthinstitute:'tisi',riserevive:'rise',risereviveco:'rise',mentalrange:'range',summitstats:'sstc',summitstatsteamchallenge:'sstc'};
export function canonicalLegalSlug(slug) { const key=String(slug||'').trim().toLowerCase(); return tenantLegalAliases[key] || key; }
export function legalProfileForContext({host='',organizationSlug='',path=''}={}) {
  let slug=organizationSlug || String(path).match(/^\/p\/([^/]+)/)?.[1] || '';
  if (!slug && /^\/michael(?:\/|$)/.test(path)) slug='michael';
  if (!slug && /^\/schoolcarebridge(?:\/|$)/.test(path)) slug='schoolcarebridge';
  if (slug) return tenantLegalProfiles[canonicalLegalSlug(slug)] || null;
  const domain=String(host).toLowerCase().split(':')[0].replace(/^(?:qv\.)?(?:app\.)?(?:www\.)?/, '');
  if (domain==='plottwisthq.com') return tenantLegalProfiles.ptco;
  if (['summitstatsteamchallenge.com','summitstats.com'].includes(domain)) return tenantLegalProfiles.sstc;
  return Object.values(tenantLegalProfiles).find(p=>new URL(p.origin).hostname.replace(/^www\./,'')===domain) || null;
}
export function tenantLegalLinks(profile) {
  return [
    {type:'privacypolicy',path:`/${profile.slug}/privacypolicy`,label:'Privacy Policy'},
    {type:'terms',path:`/${profile.slug}/terms`,label:'Terms & SMS'},
    {type:'platformhipaa',path:`/${profile.slug}/platformhipaa`,label:profile.kind==='healthcare'?'HIPAA Privacy Notice':'Health Information & Privacy'}
  ];
}
