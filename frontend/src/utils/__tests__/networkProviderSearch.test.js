import {describe,it,expect} from 'vitest';
import {mentalRangeSearchUrl,providerOpeningGroups} from '../networkProviderSearch';
describe('collective search handoff',()=>{
 it('preserves all public preferences and replaces tenant office IDs with geography',()=>{
 const q={search:'anxiety Spanish',setting:'office',officeId:7,gender:'Male',specialty:'Anxiety',care:'Couples',insurance:'Aetna',age:'Adults (18+)',accepting:'yes',school:'8'};
 const url=new URL(mentalRangeSearchUrl(q,{city:'Colorado Springs',state:'CO'}));
 expect(url.origin).toBe('https://mentalrange.org');expect(url.pathname).toBe('/providers');
 for(const [k,v] of Object.entries(q).filter(([k])=>k!=='officeId'))expect(url.searchParams.get(k)).toBe(v);
 expect(url.searchParams.get('officeId')).toBeNull();expect(url.searchParams.get('city')).toBe('Colorado Springs, CO');expect(url.searchParams.get('openings')).toBe('yes');
 });
 it('separates actual openings and never labels unchecked calendars unavailable',()=>{
 const rows=[{id:1,open:false},{id:2,open:true}];
 const groups=providerOpeningGroups(rows,p=>p.open,{error:'Unavailable'});
 expect(groups[0].providers.map(p=>p.id)).toEqual([2]);expect(groups[1].title).toBe('Availability not confirmed');
 expect(providerOpeningGroups(rows,p=>p.open)[1].title).toBe('Providers without posted openings');
 });
});
