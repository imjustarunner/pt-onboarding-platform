import {mount} from '@vue/test-utils';
import {expect,it} from 'vitest';
import Summary from '../ClientExchangeSummary.vue';
it('labels unknown client gender separately from age and never creates a provider preference',()=>{
 const wrapper=mount(Summary,{props:{listing:{demographics:{ageBand:0,gender:'unknown'},preferences:{},presentingProblems:[]}}});
 expect(wrapper.text()).toContain('Age: 0');expect(wrapper.text()).toContain('Client gender: Unknown');expect(wrapper.text()).not.toContain('Preferred provider gender:');wrapper.unmount();
});
it('distinguishes a restricted recorded concern from a missing concern',async()=>{
 const wrapper=mount(Summary,{props:{listing:{hasClinicalConcerns:true,presentingProblems:[]}}});expect(wrapper.text()).toContain('Recorded clinical concerns are used for matching');
 await wrapper.setProps({listing:{presentingProblems:['Stress management'],presentingProblemSource:'Matching concern'}});expect(wrapper.text()).toContain('Stress management');expect(wrapper.text()).not.toContain('source narrative is restricted');wrapper.unmount();
});
