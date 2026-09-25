import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import SupervisionCaseOverview from '../SupervisionCaseOverview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const overview={clientId:3,contentHash:'current',description:'Source excerpts',treatmentPlans:[],recentNotes:[{id:4,title:'Progress note',text:'Improving',hasAddenda:true}]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('/overview')?overview:{cases:[{clientId:3}],nextCursor:null}}));api.post.mockResolvedValue({data:{ok:true}});});
const click=async(w,label)=>{await w.findAll('button').find(b=>b.text()===label).trigger('click');await flushPromises();};
describe('clinical case overview',()=>{
  it('links to full notes/addenda and acknowledges the exact version without cosigning',async()=>{
    const w=mount(SupervisionCaseOverview,{props:{agencyId:1,providerId:7,canReview:true}});
    await click(w,'Refresh cases');await click(w,'Build case overview');expect(w.text()).toContain('Improving');expect(w.text()).toContain('Amendments/addenda are attached');
    await click(w,'Read note & addenda');expect(w.emitted('open-document')[0][0]).toMatchObject({id:4,type:'note'});
    await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/supervision-sessions/supervisee/7/cases/3/acknowledgement',{agencyId:1,contentHash:'current',attested:true});w.unmount();
  });
  it('clears chart content and discards an in-flight response when agency changes',async()=>{
    let finish;const w=mount(SupervisionCaseOverview,{props:{agencyId:1,providerId:7,canReview:true}});await click(w,'Refresh cases');
    api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await click(w,'Build case overview');await w.setProps({agencyId:2});finish({data:overview});await flushPromises();
    expect(w.find('[aria-label="Clinical case overview"]').exists()).toBe(false);expect(w.text()).not.toContain('Improving');w.unmount();
  });
});
