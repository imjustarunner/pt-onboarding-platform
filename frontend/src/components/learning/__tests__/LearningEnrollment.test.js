import {describe,it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import Questions from '../LearningEnrollmentQuestions.vue';import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
describe('Learning enrollment',()=>{
 it('keeps exact grade and subject, shows bridge components and versioned parent observations',async()=>{api.get.mockResolvedValue({data:{catalog:{packages:[{id:'bridge-six',name:'Integrated support',program:'bridge',totalCents:34200,components:[{service:'skill-development',format:'small-group',educationLevel:'master',sessions:6,minutes:60,totalCents:34200}]}]}}});const w=mount(Questions,{props:{modelValue:{program:'bridge',grade:'3',subject:'Math',packageId:'bridge-six'}}});await flushPromises();expect(w.text()).toContain('weekly small-group');expect(w.text()).toContain('$342.00');expect(w.text()).toContain('6 × 60 minutes');expect(w.findAll('fieldset')).toHaveLength(10);expect(w.findAll('.reflection-item')).toHaveLength(30);const selects=w.findAll('select');await selects[1].setValue('4');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({program:'bridge',grade:'4',subject:'Math',version:1});w.unmount();});
 it('does not invent prices and offers help choosing when catalog is empty',async()=>{api.get.mockResolvedValue({data:{catalog:{packages:[]}}});const w=mount(Questions);await flushPromises();expect(w.text()).toContain('Hourly support / help me choose');expect(w.findAll('article')).toHaveLength(0);w.unmount();});
 it('loads provider-specific package quotes and refreshes when the provider changes',async()=>{
 api.get.mockResolvedValue({data:{catalog:{packages:[{id:'six',name:'Six sessions',program:'tutoring',totalCents:35100,components:[{sessions:6,minutes:60,service:'tutoring',format:'virtual',pricingMode:'provider-discount',discountPercent:10,totalCents:35100}]}]}}});
 const w=mount(Questions,{props:{providerId:7,modelValue:{program:'tutoring',packageId:'six'}}});await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/public/agency-services/nlu/learning-catalog',expect.objectContaining({params:{providerId:7}}));expect(w.text()).toContain('10% off the selected provider');expect(w.text()).toContain('$351.00');
 await w.setProps({providerId:8});await flushPromises();expect(api.get).toHaveBeenLastCalledWith('/public/agency-services/nlu/learning-catalog',expect.objectContaining({params:{providerId:8}}));w.unmount();
 });

});
