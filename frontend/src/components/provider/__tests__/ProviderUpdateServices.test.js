import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import Services from '../ProviderUpdateServices.vue';
const data={options:[{serviceType:'counseling',displayName:'Counseling'},{serviceType:'tutoring',displayName:'Tutoring'}],selected:['counseling','tutoring'],tutoring:{subjectAreas:['Math'],ageGroups:['8–12'],gradeLevels:['3–6'],bio:'Synthetic tutor',acceptingNewStudents:true}};
it('shows counseling and tutoring together, including saved ages, topics and grades',async()=>{
 const w=mount(Services,{props:{data}});expect(w.findAll('input[type=checkbox]').slice(0,2).every(c=>c.element.checked)).toBe(true);
 expect(w.get('[data-testid=tutoring-subjects]').element.value).toBe('Math');expect(w.get('[data-testid=tutoring-ages]').element.value).toBe('8–12');
 await w.get('button').trigger('click');expect(w.emitted('complete')[0][0]).toEqual({selected:['counseling','tutoring'],tutoring:data.tutoring});w.unmount();
});
it('requires complete tutoring information but allows counseling-only work',async()=>{
 const w=mount(Services,{props:{data}});await w.get('[data-testid=tutoring-ages]').setValue('');await w.get('button').trigger('click');expect(w.find('[role=alert]').exists()).toBe(true);expect(w.emitted('complete')).toBeUndefined();
 await w.findAll('input[type=checkbox]')[1].setValue(false);expect(w.find('[data-testid=tutoring-subjects]').exists()).toBe(false);await w.get('button').trigger('click');expect(w.emitted('complete')[0][0].selected).toEqual(['counseling']);w.unmount();
});
it('preserves an unfinished draft and disables saving in preview',()=>{const w=mount(Services,{props:{data,readonly:true}});expect(w.vm.draft().tutoring.ageGroups).toEqual(['8–12']);expect(w.get('button').element.disabled).toBe(true);w.unmount();});
