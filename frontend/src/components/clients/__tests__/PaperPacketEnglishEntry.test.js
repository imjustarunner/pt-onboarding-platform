import {mount} from '@vue/test-utils';import {it,expect} from 'vitest';import Entry from '../PaperPacketEnglishEntry.vue';
const reading=()=>({documentId:9,sourceLocale:'es',translationStatus:'translated',sourceValues:{administrativeSex:'Masculino',grade:'Tercero',dateOfBirth:'03/09/2023'},dateOfBirthNeedsReview:true,fields:{firstName:'José',lastName:'Prueba',gender:'Male',grade:'3',dateOfBirth:''},parent1:{firstName:'María',lastName:'Prueba',relationshipTitle:'Mother'},responses:[{key:'medicalInformation',label:'Medical information',sourceText:'No tiene alergias.',sourceLocale:'es',englishText:'No allergies.',status:'translated'}]});
it('shows original Spanish beside English form values and copies the original name without translating it',async()=>{
 const w=mount(Entry,{props:{reading:reading(),stage:0,answers:{medicalInformation:'No allergies.'}}});expect(w.text()).toContain('Masculino');expect(w.text()).toContain('Male');expect(w.text()).toContain('ambiguous');expect(w.text()).toContain('Original Spanish answer');
 await w.findAll('button').find(b=>b.text()==='Use English packet details').trigger('click');expect(w.emitted('use-details')[0][0]).toMatchObject({firstName:'José',lastName:'Prueba',gender:'Male'});w.unmount();
});
it('keeps English edits in the draft and requires a fresh review confirmation after an edit',async()=>{
 const w=mount(Entry,{props:{reading:reading(),stage:0,answers:{medicalInformation:'No allergies.'},reviewed:true}});await w.get('textarea').setValue('No known food allergies.');expect(w.emitted('update:answers').at(-1)[0]).toEqual({medicalInformation:'No known food allergies.'});expect(w.emitted('update:reviewed').at(-1)[0]).toBe(false);w.unmount();
});
it('does not present the original Spanish as an English translation during an outage',()=>{
 const value=reading();value.translationStatus='unavailable';value.responses[0].englishText='';const w=mount(Entry,{props:{reading:value,stage:0,answers:{}}});expect(w.text()).toContain('Automatic translation is unavailable');expect(w.get('textarea').element.value).toBe('');expect(w.text()).toContain('No tiene alergias.');w.unmount();
});
