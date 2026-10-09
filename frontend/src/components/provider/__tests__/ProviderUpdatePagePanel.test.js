import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {defineComponent,ref} from 'vue';
import Panel from '../ProviderUpdatePagePanel.vue';
vi.mock('../ProviderUpdateSectionPanel.vue',()=>({default:{name:'TestSectionEditor',props:['section'],emits:['saved'],template:'<div />'}}));
let scroll;
beforeEach(()=>{scroll=vi.fn();Element.prototype.scrollIntoView=scroll;});
const sections=()=>['work_hours','office_review','office_schedule'].map(key=>({key,completed:false,meta:{title:key}}));
function render(){return mount(defineComponent({components:{Panel},setup(){const page=ref({key:'user_updates',title:'User Updates',sections:sections(),sectionsTotal:3,sectionsCompleted:0});return {page,save:bundle=>{page.value={...page.value,sections:bundle.sections};}};},template:'<Panel :page="page" @saved="save" />'}),{attachTo:document.body});}
it('moves completion to the next section header and scrolls there instead of leaving the viewport at the end',async()=>{
 const w=render();const rows=sections();rows[0].completed=true;
 // Select the stub by its section prop; no real save or message request occurs.
 const editor=w.findComponent({name:'TestSectionEditor'});
 editor.vm.$emit('saved',{sections:rows});await flushPromises();expect(w.get('[data-section-key="office_review"] button').attributes('aria-expanded')).toBe('true');expect(document.activeElement).toBe(w.get('[data-section-key="office_review"] button').element);expect(scroll).toHaveBeenLastCalledWith({behavior:'smooth',block:'start'});w.unmount();
});
it('does not advance after a partial save',async()=>{const w=render();const editor=w.findComponent({name:'TestSectionEditor'});editor.vm.$emit('saved',{sections:sections()});await flushPromises();expect(w.get('[data-section-key="work_hours"] button').attributes('aria-expanded')).toBe('true');expect(scroll).not.toHaveBeenCalled();w.unmount();});
it('asks the dashboard for the next page only when all sections are complete',async()=>{const w=render();const editor=w.findComponent({name:'TestSectionEditor'});editor.vm.$emit('saved',{sections:sections().map(s=>({...s,completed:true}))});await flushPromises();expect(w.findComponent(Panel).emitted('advance')).toHaveLength(1);w.unmount();});

it('advances after completing a standalone full page',async()=>{
 const w=mount(defineComponent({components:{Panel},setup(){const page=ref({key:'handbook',alone:true,sections:[{key:'handbook',completed:false}]});return {page,save:bundle=>{page.value={...page.value,completed:true,sections:bundle.sections};}};},template:'<Panel :page="page" @saved="save" />'}));
 w.findComponent({name:'TestSectionEditor'}).vm.$emit('saved',{sections:[{key:'handbook',completed:true}]});await flushPromises();
 expect(w.findComponent(Panel).emitted('advance')).toHaveLength(1);w.unmount();
});
it('prevents skipping an incomplete specialties editor and leaves it highlighted for review',async()=>{
 const page={key:'profile',sections:[{key:'specialties',completed:false,meta:{title:'Focus areas'}},{key:'directory_photo',completed:false,meta:{title:'Photo'}}]};
 const w=mount(Panel,{props:{page}});await w.get('[data-section-key="directory_photo"] button').trigger('click');await flushPromises();
 expect(w.get('[data-section-key="specialties"] button').attributes('aria-expanded')).toBe('true');expect(w.get('[data-section-key="directory_photo"] button').attributes('aria-expanded')).toBe('false');w.unmount();
});
