import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Settings from '../ProviderClinicalFocusSettings.vue';
import Editor from '../ProviderFocusEditor.vue';
import Summary from '../ProviderFocusSummary.vue';
import {FOCUS_GROUPS} from '../../../navigation/providerFocus.js';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const focus=()=>({reviewed:true,top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,g.options.slice(0,3)])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,g.options.slice(4)]))});
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/agencies')?[{id:2,organization_type:'agency'}]:{groups:FOCUS_GROUPS,clinicalFocus:focus()}}));api.put.mockImplementation(async(url,body)=>({data:{groups:FOCUS_GROUPS,clinicalFocus:body.clinicalFocus}}));});
it('loads the completed update choices, shows three highlights and expands all enabled matches',async()=>{
 const w=mount(Settings,{props:{userId:7}});await flushPromises();const group=w.get('[data-focus-summary="specialties"]');
 expect(group.findAll(':scope > .focus-tags li').map(li=>li.text())).toEqual(focus().top.specialties);expect(group.get('details').attributes('open')).toBeUndefined();
 expect(group.get('summary').text()).toBe('Show all matching areas (4)');expect(group.get('details .focus-tags').text()).toContain(FOCUS_GROUPS[0].options[3]);expect(group.text()).not.toContain(FOCUS_GROUPS[0].options[4]);
 await w.get('header button').trigger('click');expect(w.getComponent(Editor).props('modelValue')).toEqual(focus());w.unmount();
});
it('saves matching and top-three changes through the shared profile endpoint',async()=>{
 const w=mount(Settings,{props:{userId:7}});await flushPromises();await w.get('header button').trigger('click');
 const next=focus();next.top.specialties=[...next.top.specialties.slice(1),FOCUS_GROUPS[0].options[3]];w.getComponent(Editor).vm.$emit('update:modelValue',next);await w.vm.$nextTick();await w.get('form').trigger('submit');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/users/7/provider-clinical-focus',{agencyId:2,clinicalFocus:next});expect(w.find('form').exists()).toBe(false);expect(w.getComponent(Summary).props('focus').top).toEqual(next.top);expect(w.emitted('saved')).toHaveLength(1);w.unmount();
});
it('keeps unsaved changes and reports a failed save',async()=>{api.put.mockRejectedValue(new Error('offline'));const w=mount(Settings,{props:{userId:7}});await flushPromises();await w.get('header button').trigger('click');await w.get('form').trigger('submit');await flushPromises();expect(w.find('form').exists()).toBe(true);expect(w.get('[role=alert]').text()).toContain('Your changes are still here');expect(w.emitted('saved')).toBeUndefined();w.unmount();});
it('does not save incomplete highlights unless the category is explicitly waived',async()=>{const w=mount(Settings,{props:{userId:7}});await flushPromises();await w.get('header button').trigger('click');const next=focus();next.top.specialties=[];w.getComponent(Editor).vm.$emit('update:modelValue',next);await w.vm.$nextTick();await w.get('form').trigger('submit');expect(api.put).not.toHaveBeenCalled();next.waived={specialties:true};w.getComponent(Editor).vm.$emit('update:modelValue',next);await w.vm.$nextTick();await w.get('form').trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledOnce();w.unmount();});
it('can display a public allowlisted summary without receiving private exclusions',()=>{const highlights={specialties:{top:['Anxiety','Depression','Stress'],more:['ADHD'],reviewed:true}};const w=mount(Summary,{props:{highlights}});expect(w.get('[data-focus-summary="specialties"] summary').text()).toContain('(4)');expect(w.get('[data-focus-summary="specialties"] details').text()).toContain('ADHD');w.unmount();});
