import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Reader from '../EmailThreadReader.vue';
it('prioritizes the latest email and keeps earlier emails expandable',async()=>{
 const wrapper=mount(Reader,{props:{conversation:{id:10,subject:'Conversation'},messages:[{id:1,body_text:'Earlier email'},{id:2,body_html:'<a href="https://example.org/join">Join meeting</a>'}]}});
 const items=wrapper.findAll('.email-message');expect(items[0].element.open).toBe(false);expect(items[1].element.open).toBe(true);
 expect(items[1].get('a').attributes('href')).toBe('https://example.org/join');
 items[0].element.open=true;await items[0].trigger('toggle');await wrapper.setProps({messages:[{id:1,body_text:'Earlier email'},{id:2,body_text:'Latest refreshed'}]});
 expect(wrapper.findAll('.email-message')[0].element.open).toBe(true);
 await wrapper.get('.actions button').trigger('click');expect(wrapper.emitted('compose')).toEqual([['reply']]);wrapper.unmount();
});
