import {expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Videos from '../TransitionVideos.vue';
it('makes watch links visible and supports adding, removing and restoring suggestions',async()=>{
 const mutate=vi.fn().mockResolvedValue({});const board={videoCatalog:[{id:'one',title:'Example training',outcome:'Show the work'}],removedVideos:[{id:'old',title:'Removed example'}],state:{videos:{one:{status:'published',url:'https://example.test/watch'}}}};
 const w=mount(Videos,{props:{board,mutate}});expect(w.get('.tw-watch').attributes('href')).toBe('https://example.test/watch');
 await w.findAll('button').find(b=>b.text()==='Remove from this practice’s list').trigger('click');await flushPromises();expect(mutate).toHaveBeenCalledWith({action:'video',operation:'remove',id:'one'});
 await w.findAll('button').find(b=>b.text()==='Restore').trigger('click');expect(mutate).toHaveBeenCalledWith({action:'video',operation:'restore',id:'old'});
 await w.findAll('button').find(b=>b.text()==='+ Add a video').trigger('click');await w.get('.tw-video-form input').setValue('New walkthrough');await w.get('form').trigger('submit');await flushPromises();expect(mutate).toHaveBeenCalledWith(expect.objectContaining({action:'video',operation:'add',title:'New walkthrough'}));w.unmount();
});
