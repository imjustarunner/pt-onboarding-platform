import {describe,it,expect} from 'vitest';
import {slotMatchesTime,matchingProviderTags,publicVirtualStates} from '../providerTimeSearch';
import {mentalRangeSearchUrl} from '../networkProviderSearch';
describe('provider time preferences',()=>{
 const monday={startAt:'2026-09-21T22:30:00Z'},saturday={startAt:'2026-09-26T16:00:00Z'};
 it('matches local weekdays, weekends and time ranges, including daylight saving changes',()=>{
  expect(slotMatchesTime(monday,{day:'weekdays',timeFrom:'16:00',timeTo:'17:00'})).toBe(true);
  expect(slotMatchesTime(monday,{day:'weekends'})).toBe(false);
  expect(slotMatchesTime(saturday,{day:'Sat',timeTo:'10:00'})).toBe(true);
  expect(slotMatchesTime(saturday,{day:'weekends',timeFrom:'16:00'})).toBe(false);
  expect(slotMatchesTime({startAt:'2026-12-07T23:00:00Z'},{day:'Mon',timeFrom:'16:00',timeTo:'16:00'})).toBe(true);
  expect(slotMatchesTime(monday,{timeFrom:'17:00',timeTo:'16:00'})).toBe(false);
  expect(slotMatchesTime({startAt:'invalid'},{day:'Mon'})).toBe(false);
 });
 it('carries desired days, hours and virtual state to the collective',()=>{
  const q={setting:'virtual',state:'CO',day:'weekdays',timeFrom:'16:00',timeTo:'19:00'};
  const url=new URL(mentalRangeSearchUrl(q));for(const [key,value] of Object.entries(q))expect(url.searchParams.get(key)).toBe(value);
 });
 it('shows matching clinical terms before default tags without inventing specialties',()=>{
  const p={specialties:['Anxiety','ADHD','Depression','Trauma / PTSD'],modalities:['EMDR'],populations:['Couples']};
  expect(matchingProviderTags(p,'trauma')[0]).toBe('Trauma / PTSD');
  expect(matchingProviderTags(p,'emdr')[0]).toBe('EMDR');
  expect(matchingProviderTags(p,'autism')).not.toContain('Autism');
 });
 it('keeps virtual coverage separate from assigned office states',()=>{
  expect(publicVirtualStates({agencySlug:'itsco',locations:[{state:'NM'}]})).toEqual(['CO']);
  expect(publicVirtualStates({agencySlug:'new-agency',locations:[{state:'NM'}]})).toEqual([]);
  expect(publicVirtualStates({virtualStates:['Colorado','NM']})).toEqual(['CO','NM']);
 });
});
