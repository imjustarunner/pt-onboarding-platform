// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Guides from '../ProviderUpdateTrainingGuides.vue';
const get=vi.hoisted(()=>vi.fn());
vi.mock('../../../services/api',()=>({default:{get}}));
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};});
const props={guides:[{id:'g',title:'Quick View setup'}],base:'/public/provider-update/preview_abc',sectionKey:'pin',agencyId:2};
it('opens a named guide, sanitizes HTML, embeds YouTube and removes the player on close',async()=>{
 get.mockResolvedValue({data:{guides:[{id:'g',title:'Quick View setup',html:'<img src="https://safe.example/a.png" onerror="bad()"><a href="https://youtu.be/abcdefghijk">Watch</a><script>bad()</script>'}]}});
 const w=mount(Guides,{props});expect(get).not.toHaveBeenCalled();await w.get('.training-guide-button').trigger('click');await flushPromises();expect(get).toHaveBeenCalledWith('/public/provider-update/preview_abc/training/pin',{params:{agencyId:2}});expect(w.get('dialog').attributes('open')).toBeDefined();expect(w.get('iframe').attributes('src')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');expect(w.find('script').exists()).toBe(false);expect(w.get('img').attributes('onerror')).toBeUndefined();await w.get('.close').trigger('click');expect(w.find('iframe').exists()).toBe(false);w.unmount();
});
it('does not show an empty button or fetch media when a section has no guides',()=>{const w=mount(Guides,{props:{...props,guides:[]}});expect(w.find('button').exists()).toBe(false);expect(get).not.toHaveBeenCalled();w.unmount();});
it('reports unavailable media without opening an empty modal',async()=>{get.mockRejectedValue({response:{data:{error:{message:'This update expired.'}}}});const w=mount(Guides,{props});await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('This update expired');expect(w.get('dialog').attributes('open')).toBeUndefined();w.unmount();});

it('opens the exact emailed guide after authenticated instructions load',async()=>{get.mockResolvedValue({data:{guides:[{id:'g',title:'Quick View setup',html:'<p>Saved instructions</p>'}]}});const w=mount(Guides,{props:{...props,endpoint:'/provider-update/instructions/2/pin',initialGuideId:'g'}});await flushPromises();expect(get).toHaveBeenCalledWith('/provider-update/instructions/2/pin',{params:{agencyId:2}});expect(w.get('dialog').attributes('open')).toBeDefined();expect(w.text()).toContain('Saved instructions');w.unmount();});
