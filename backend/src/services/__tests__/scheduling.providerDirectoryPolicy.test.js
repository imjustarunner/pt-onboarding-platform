import {describe,it,expect,vi,beforeEach} from 'vitest';
import {normalizeClinicalFacets} from '../../utils/providerFacetNormalization.js';
import {publicAcceptance} from '../../utils/publicProviderPresentation.js';
import {withdrawProviderIntakeOpenings} from '../providerIntakePublication.service.js';
describe('canonical provider facets',()=>{
 it('moves ages and populations out of specialties, splitting numbered and comma lists',()=>{
  const result=normalizeClinicalFacets({specialties:['Adults','Adults (18+)','Elders','1. Anxiety & Emotional Regulation, 2. Trauma-Informed Care, 3. ADHD','Anxiety, Depression, Women\'s Issues','LGBTQ+'],ageGroups:['Seniors (65+)','Teen','Teen (14–18)'],modalities:['CBT','Individuals']});
  expect(result.ageGroups).toEqual(['Teen (14-18)','Adults (18+)','Seniors (65+)']);
  expect(result.specialties).toEqual(['Anxiety & Emotional Regulation','ADHD','Anxiety','Depression',"Women's Issues"]);
  expect(result.populations).toEqual(['LGBTQ+','Individuals']);
  expect(result.modalities).toEqual(['Trauma-informed care','CBT']);
 });
 it('consolidates aliases without fabricating specialties from narrative fragments',()=>{
  const result=normalizeClinicalFacets({specialties:['OCD','Obsessive-Compulsive (OCD)','Sleep/Insomnia','Sleep or Insomnia','and building healthy coping skills. I have particular experience supporting children','as well as their caregivers and families.'],ageGroups:['Preteen','Preteen (11-13)']});
  expect(result.specialties).toEqual(['Obsessive-Compulsive (OCD)','Sleep or Insomnia']);
  expect(result.ageGroups).toEqual(['Preteen (11-13)']);
 });
});
describe('schedule-driven intake policy',()=>{
 it('openings override stale closure; closed does not imply a waitlist',()=>{
  expect(publicAcceptance({globalAccepting:false,hasOpenings:true}).status).toBe('accepting');
  expect(publicAcceptance({globalAccepting:false}).status).toBe('unavailable');
  expect(publicAcceptance({globalAccepting:false,manual:'waitlist'}).status).toBe('waitlist');
 });
 it('withdraws intake publications across formats without touching appointments, holds, or office reservations',async()=>{
  const database={execute:vi.fn(async()=>[{}])};await withdrawProviderIntakeOpenings(database,9);
  const statements=database.execute.mock.calls.map(([sql])=>sql).join('\n');
  expect(statements).toContain('provider_in_person_slot_availability');expect(statements).toContain('available_for_intake=0');expect(statements).toContain('slots_available=0');
  expect(statements).not.toMatch(/UPDATE office_events|DELETE FROM office_standing|public_provider_slot_holds|appointments/);
  expect(database.execute.mock.calls.every(([,args])=>args[0]===9)).toBe(true);
 });
 it('can close only virtual intake',async()=>{
  const database={execute:vi.fn(async()=>[{}])};await withdrawProviderIntakeOpenings(database,9,{virtual:true,inPerson:false,school:false});
  expect(database.execute.mock.calls.map(([sql])=>sql).join('\n')).not.toMatch(/provider_in_person|provider_school/);
 });
});
