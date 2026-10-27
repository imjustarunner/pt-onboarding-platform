import { expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import Portal from '../WorkplaceHandbookPortal.vue';
it('shows the reference edition in onboarding without enabling an unpublished acknowledgement',async()=>{
 const http={get:vi.fn(async()=>({data:{available:true,acknowledgeable:false,handbook:{beta:true,version:null,sections:[{title:'Welcome'}]}}}))};
 const w=shallowMount(Portal,{props:{http,token:'candidate'}});await flushPromises();
 expect(w.find('workplace-handbook-book-stub').exists()).toBe(true);expect(w.text()).toContain('must publish');expect(w.emitted('available').at(-1)).toEqual([false]);expect(w.emitted('version').at(-1)).toEqual([null]);w.unmount();
});
it('allows acknowledgement only for the published version during onboarding',async()=>{
 const http={get:vi.fn(async()=>({data:{available:true,handbook:{version:{id:12},sections:[{title:'Welcome'}]}}}))};
 const w=shallowMount(Portal,{props:{http,token:'candidate'}});await flushPromises();expect(w.emitted('available').at(-1)).toEqual([true]);expect(w.emitted('version').at(-1)).toEqual([12]);
 await w.setProps({referenceOnly:true});await flushPromises();expect(w.emitted('available').at(-1)).toEqual([false]);w.unmount();
});
