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
it('shows signature images, lets the reader load other images, and resets that choice for another conversation',async()=>{
 const message={id:8,body_html:'<div class="gmail_signature"><img src="https://lh7-us.googleusercontent.com/signature" width="420"></div><img src="https://outside.test/logo.png" alt="Logo">'};
 const wrapper=mount(Reader,{props:{conversation:{id:20},messages:[message]}});
 expect(wrapper.findAll('.body img')).toHaveLength(1);expect(wrapper.find('.body details').exists()).toBe(false);
 await wrapper.get('.load-images').trigger('click');expect(wrapper.findAll('.body img')).toHaveLength(2);
 await wrapper.setProps({conversation:{id:21}});expect(wrapper.findAll('.body img')).toHaveLength(1);wrapper.unmount();
});
