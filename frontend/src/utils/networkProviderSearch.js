// Public search preferences only. Tenant-local office IDs are translated to geography.
export const networkSearchKeys=['search','setting','city','state','age','specialty','insurance','accepting','openings','gender','care','school','service','agency'];
export function readNetworkSearch(query={}) {
 return Object.fromEntries(networkSearchKeys.map(key=>[key,typeof query[key]==='string'?query[key].slice(0,200):'']));
}
export function mentalRangeSearchUrl(query,office) {
 const filters=readNetworkSearch(query);
 if(office){filters.city=[office.city,office.state].filter(Boolean).join(', ');filters.state=office.state||filters.state;}
 filters.service=filters.service||'counseling';
 filters.openings=filters.openings||(['waitlist','unavailable'].includes(filters.accepting)?'':'yes');
 const url=new URL('https://mentalrange.org/providers');
 for(const [key,value] of Object.entries(filters))if(value)url.searchParams.set(key,value);
 return url.href;
}
export function providerOpeningGroups(providers,hasOpenings,{loading=false,error=''}={}) {
 const withOpenings=providers.filter(hasOpenings),other=providers.filter(p=>!hasOpenings(p));
 return [{key:'open',title:'Providers with openings',providers:withOpenings},
  {key:'other',title:loading?'Checking availability':error?'Availability not confirmed':'Providers without posted openings',providers:other}];
}
