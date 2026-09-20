import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {listClinicalFacetsForUsers} from '../providerClinicalFacets.service.js';
import {normalizeClinicalFacets} from '../../utils/providerFacetNormalization.js';
import {clinicalFieldOptions,withClinicalFieldOptions} from '../../utils/providerClinicalFieldOptions.js';
import {SPECIALTIES,POPULATIONS} from '../../constants/providerClinicalTaxonomy.js';
import fs from 'node:fs';
describe('saved clinical profile facts',()=>{
 it('recovers specialties directly from saved survey answers, keeping ages, groups and approaches separate',async()=>{
  const database={execute:vi.fn(async()=>[[{user_id:8,field_key:'pt_specialties_max25',value_text:'Behavioral Issues, Child, Education and Learning Disabilities, School Issues'},{user_id:8,field_key:'modality',value_text:'["Groups","Individuals"]'},{user_id:8,field_key:'treatment_prefs_max15',value_text:'["CBT","Play Therapy"]'}]])};
  const facets=(await listClinicalFacetsForUsers([8],{agencyId:2,database})).get(8);
  expect(facets.specialties).toEqual(['Behavioral Concerns','Learning Difficulties','School / Academic Concerns']);expect(facets.ageGroups).toEqual(['Children (6-10)']);expect(facets.populations).toEqual(['Groups','Individuals']);expect(facets.modalities).toEqual(['Cognitive Behavioral Therapy (CBT)','Play Therapy']);
  const [sql,args]=database.execute.mock.calls[0];expect(sql).toContain('FROM user_info_values');expect(sql).not.toContain('FROM provider_search_index');expect(sql).toContain('d.agency_id = ? OR d.agency_id IS NULL');expect(args.slice(0,2)).toEqual([8,2]);
 });
 it('does not resurrect an older duplicate when the latest answer was cleared',async()=>{
  const database={execute:vi.fn(async()=>[[{user_id:8,field_key:'specialties_general',value_text:'[]'},{user_id:8,field_key:'specialties_general',value_text:'["Anxiety"]'}]])};
  expect((await listClinicalFacetsForUsers([8],{agencyId:2,database})).get(8).specialties).toEqual([]);
 });
 it('moves diagnoses out of populations and never mines negated or ambiguous narrative for claims',()=>{
  const f=normalizeClinicalFacets({populations:['Anxiety','Adults','Veterans'],specialties:['I do not treat anxiety, depression, ADHD.','["I have no experience with trauma, anxiety"]','Stress\nSocial Skills\nWorking with military children']});
  expect(f.specialties).toEqual(['Stress','Social Skills','Anxiety']);expect(f.populations).toEqual(['Veterans']);expect(f.ageGroups).toEqual(['Adults (18+)']);expect(f.reviewNeeded).toHaveLength(3);
 });
 it('offers the complete requested catalogs through existing onboarding keys and preserves legacy selections for review',()=>{
  expect(clinicalFieldOptions('provider_marketing_specialties').options).toEqual(SPECIALTIES);
  expect(clinicalFieldOptions('groups').options).toEqual(POPULATIONS);
  expect(POPULATIONS).not.toContain('Children');expect(SPECIALTIES).toContain('Executive Functioning');expect(SPECIALTIES).not.toContain('CBT');
  expect(withClinicalFieldOptions({field_key:'groups',value:'["Legacy community"]'}).options).toContain('Legacy community');
 });
 it('keeps separately deployed frontend and backend catalogs identical',()=>{
  const a=fs.readFileSync(new URL('../../constants/providerClinicalTaxonomy.js',import.meta.url),'utf8');const b=fs.readFileSync(new URL('../../../../frontend/src/constants/providerClinicalTaxonomy.js',import.meta.url),'utf8');expect(b.endsWith(a)).toBe(true);
 });
});
