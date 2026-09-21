import {describe,it,expect} from 'vitest';
import {sortClientAges} from '../publicProviderFacets';
import {providerProfilePath,providerIdFromRoute} from '../providerProfileLinks';
import {openingWeek} from '../providerOpenings';
import {officeRegions} from '../publicOfficeRegions';
import {internalItscoPath} from '../publicDomainRouting';
import {itscoPublicResponse} from '../itscoPublicSeo';
describe('provider discovery utilities',()=>{
 it('orders age groups and keeps young adults before adults and elders last',()=>expect(sortClientAges(['Seniors (65+)','Adults (18+)','Young Adults (18–25)','Toddler (0–5)','Children (6–10)','Preteen (11–13)','Teen (14–18)'])).toEqual(['Toddler (0–5)','Children (6–10)','Preteen (11–13)','Teen (14–18)','Young Adults (18–25)','Adults (18+)','Seniors (65+)']));
 it('resolves readable names by stable ID and preserves old shared links',()=>{const path=providerProfilePath({id:496,displayName:'Megan Geil-Crader'});expect(path).toBe('/p/itsco/providers/megan-geil-crader-496');expect(providerIdFromRoute({params:{providerSlug:'old-name-496'},query:{}})).toBe('496');expect(providerIdFromRoute({params:{},query:{provider:'496'}})).toBe('496');expect(internalItscoPath('/providers/megan-geil-crader-496')).toBe(path);expect(itscoPublicResponse('www.itsco.health','/providers/megan-geil-crader-496').status).toBe(200);});
 it('shows only real future openings from the current Mountain-time week and deduplicates repeats',()=>{const slot={startAt:'2026-09-22T16:00:00Z',programType:'VIRTUAL'};const days=openingWeek([slot,slot,{startAt:'2026-09-29T16:00:00Z'},{startAt:'2026-09-20T16:00:00Z'}],new Date('2026-09-21T16:00:00Z'));expect(days.flatMap(d=>d.slots)).toEqual([slot]);expect(days[1].label).toBe('Tue');});
 it('includes weekend openings even when the week starts on Monday',()=>{const slot={startAt:'2026-09-27T16:00:00Z',programType:'IN_PERSON'};const days=openingWeek([slot],new Date('2026-09-21T16:00:00Z'));expect(days.at(-1).label).toBe('Sun');expect(days.at(-1).slots).toEqual([slot]);});
 it('builds state and city options from offices without a hardcoded city list',()=>expect(officeRegions([{city:'Denver',state:'CO'},{city:'Denver',state:'CO'},{city:'Santa Fe',state:'NM'}])).toEqual([{state:'Colorado',cities:['Denver, CO']},{state:'NM',cities:['Santa Fe, NM']}]));
});
