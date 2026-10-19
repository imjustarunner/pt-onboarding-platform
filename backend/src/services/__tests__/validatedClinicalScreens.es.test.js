import {it,expect} from 'vitest';
import {buildPhq9Fields,buildGad7Fields,buildPsc17Fields} from '../../data/validatedClinicalScreens.en.js';
import {buildPhq9FieldsEs,buildGad7FieldsEs,buildPsc17FieldsEs,spanishClinicalField} from '../../data/validatedClinicalScreens.es.js';
import {localizeEnrollmentPacketSections} from '../enrollmentPacketLocale.js';

it.each([
 ['PHQ-9',buildPhq9Fields,buildPhq9FieldsEs,9],
 ['GAD-7',buildGad7Fields,buildGad7FieldsEs,7],
 ['PSC-17',buildPsc17Fields,buildPsc17FieldsEs,17]
])('%s keeps stored answer/scoring keys and conditional metadata across languages',(_,english,spanish,count)=>{
 const en=english(),es=spanish();expect(es).toHaveLength(count);
 expect(es.map(f=>[f.key,f.instrument,f.scope,f.showIf,f.required,f.options.map(o=>o.value)])).toEqual(en.map(f=>[f.key,f.instrument,f.scope,f.showIf,f.required,f.options.map(o=>o.value)]));
 es.forEach((field,index)=>{expect(field.label).not.toBe(en[index].label);expect(field.instrumentSource).toMatch(/^https:\/\//);});
 es[0].options[0].label='Edited';expect(spanish()[0].options[0].label).not.toBe('Edited');expect(english()[0].options[0].label).not.toBe('Edited');
});
it('maps differently numbered Spanish PSC items to the existing clinical meanings',()=>{
 const fields=Object.fromEntries(buildPsc17FieldsEs().map(f=>[f.key,f.label]));
 expect(fields.psc_5).toBe('Se siente triste, infeliz');
 expect(fields.psc_16).toBe('Toma cosas que no le pertenecen');
 expect(fields.psc_17).toBe('Se niega a compartir');
 expect(buildPhq9FieldsEs().find(f=>f.key==='phq9_9').label).toBe('Pensamientos de que estaría mejor muerto(a) o de lastimarse de alguna manera');
});
it('preserves unknown instruments and refuses conflicting instrument IDs',()=>{
 expect(spanishClinicalField('phq9_1','Different assessment',{instrument:'custom'})).toBeNull();
 const input=[{title:'Other screening',fields:[['cssrs_1','Original published wording',{instrument:'cssrs_screener',options:[{value:'yes',label:'Yes'}]}]]}];
 expect(localizeEnrollmentPacketSections(input,'es')).toEqual(input);
});
