import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mocks}));
import Editor from '../ClientExchangeEssentialsEditor.vue';
const listing={id:19,clientId:4,agencyId:450,hasClinicalConcerns:true,preferences:{modality:'virtual',insurance:'Self-pay',schedule:{days:['Monday'],periods:['afternoon']},scheduleNotesRestricted:true}};
beforeEach(()=>{mocks.put.mockReset().mockResolvedValue({data:{saved:true}});});
it('omits inaccessible notes on unrelated saves and preserves the saved status after refresh',async()=>{
 const wrapper=mount(Editor,{props:{listing}});await wrapper.find('form').trigger('submit');await flushPromises();
 expect(Object.hasOwn(mocks.put.mock.calls[0][1].schedule,'notes')).toBe(false);expect(wrapper.emitted('saved')).toHaveLength(1);
 await wrapper.setProps({listing:{...listing,preferences:{...listing.preferences,sharedMatchingConcern:'Stress management'}}});expect(wrapper.find('textarea[maxlength="2000"]').element.value).toBe('Stress management');expect(wrapper.text()).toContain('Matching details saved');wrapper.unmount();
});
it('submits deliberately entered scheduling notes',async()=>{
 const wrapper=mount(Editor,{props:{listing}});wrapper.findComponent({name:'ClientSchedulePreferences'}).vm.$emit('update:modelValue',{...listing.preferences.schedule,notes:'After work'});
 await wrapper.find('form').trigger('submit');await flushPromises();expect(mocks.put.mock.calls[0][1].schedule.notes).toBe('After work');wrapper.unmount();
});
it('does not publish unchanged source notes when a clinical viewer saves another field',async()=>{
 const clinicalListing={...listing,preferences:{...listing.preferences,scheduleNotesRestricted:false,schedule:{...listing.preferences.schedule,notes:'Private source scheduling narrative'}}};
 const wrapper=mount(Editor,{props:{listing:clinicalListing}});
 await wrapper.find('input[maxlength="200"]').setValue('Updated insurance');
 await wrapper.find('form').trigger('submit');await flushPromises();
 expect(Object.hasOwn(mocks.put.mock.calls[0][1].schedule,'notes')).toBe(false);wrapper.unmount();
});
it('clears saved confirmation after an edit or a different listing is displayed',async()=>{
 const wrapper=mount(Editor,{props:{listing}});
 await wrapper.find('form').trigger('submit');await flushPromises();expect(wrapper.text()).toContain('Matching details saved');
 await wrapper.find('input[maxlength="200"]').setValue('Changed insurance');expect(wrapper.text()).not.toContain('Matching details saved');
 await wrapper.find('form').trigger('submit');await flushPromises();expect(wrapper.text()).toContain('Matching details saved');
 await wrapper.setProps({listing:{...listing,id:20,clientId:5}});expect(wrapper.text()).not.toContain('Matching details saved');wrapper.unmount();
});
it('preserves edits made during a save when its refresh arrives, without claiming those edits were saved',async()=>{
 let finishSave;mocks.put.mockImplementation(()=>new Promise(resolve=>{finishSave=resolve;}));
 const wrapper=mount(Editor,{props:{listing}});
 await wrapper.find('form').trigger('submit');
 await wrapper.find('input[maxlength="200"]').setValue('New unsaved insurance');
 finishSave({data:{saved:true}});await flushPromises();
 await wrapper.setProps({listing:{...listing,preferences:{...listing.preferences}}});
 expect(wrapper.find('input[maxlength="200"]').element.value).toBe('New unsaved insurance');
 expect(wrapper.text()).not.toContain('Matching details saved');wrapper.unmount();
});
